// backend/src/services/aiService.js
// Native fetch is available in modern Node.js
import crypto from 'node:crypto';

const promptCache = new Map();
const inFlight = new Map();
const CACHE_MAX_SIZE = 500;
const CACHE_TTL_MS = 5 * 60_000;

export const aiMetrics = {
  cacheHits: 0,
  groqCalls: 0,
  ollamaCalls: 0,
  fallbacks: 0,
  reasons: { rateLimit: 0, fallback: 0, negativeCache: 0 }
};

export let windowStart = Date.now();
export let windowMetrics = { 
  cacheHits: 0, groqCalls: 0, ollamaCalls: 0, fallbacks: 0,
  reasons: { rateLimit: 0, fallback: 0, negativeCache: 0 }
};

export function rotateWindowIfNeeded() {
  if (Date.now() - windowStart > 60_000) {
    windowStart = Date.now();
    windowMetrics = { 
      cacheHits: 0, groqCalls: 0, ollamaCalls: 0, fallbacks: 0,
      reasons: { rateLimit: 0, fallback: 0, negativeCache: 0 }
    };
  }
}

function setCache(key, value, ttl = CACHE_TTL_MS) {
  // Exhaustive O(n) eviction given map constraint size is tiny (≤500)
  const now = Date.now();
  for (const [k, v] of promptCache) {
    if (now > v.expiresAt) promptCache.delete(k);
  }

  if (promptCache.size >= CACHE_MAX_SIZE) {
    promptCache.delete(promptCache.keys().next().value); // Evict LRU
  }
  promptCache.set(key, { value, expiresAt: now + ttl });
}

function getCache(key) {
  if (!promptCache.has(key)) return null;
  const entry = promptCache.get(key);
  if (Date.now() > entry.expiresAt) {
    promptCache.delete(key);
    return null;
  }
  promptCache.delete(key);
  promptCache.set(key, entry); // Move to LRU end (touch)
  return entry.value;
}

export const createStreamPolyfill = (text) => {
  const encoder = new TextEncoder();
  const chunks = text.match(/.{1,50}/g) || [text];
  return {
    isCache: true,
    source: "cache",
    getReader: () => {
      let i = 0;
      return {
        read: async () => {
          if (i >= chunks.length) return { done: true };
          const payload = JSON.stringify({ response: chunks[i++] });
          return { done: false, value: encoder.encode(payload + '\n') };
        }
      };
    }
  };
};

const callGroq = async ({ prompt, stream = false, signal, selectedModel }) => {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [{ role: "user", content: prompt }],
      stream
    }),
    signal
  });

  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error(`Groq failed with status ${res.status}`);

  if (stream) {
    const rawReader = res.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    return {
      source: "groq",
      getReader: () => {
        return {
          read: async function processStream() {
            const { done, value } = await rawReader.read();
            if (done) return { done: true };

            let outStr = '';
            const lines = decoder.decode(value, { stream: true }).split('\n');
            for (let line of lines) {
              line = line.trim();
              if (!line || line === 'data: [DONE]') continue;
              if (line.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  const token = parsed?.choices?.[0]?.delta?.content || "";
                  if (!token) continue; // ignore non-content chunks strictly
                  outStr += JSON.stringify({ response: token }) + '\n';
                } catch (e) {}
              }
            }
            if (outStr) return { done: false, value: encoder.encode(outStr) };
            return processStream(); // recursively handle empty SSE frames safely
          }
        };
      }
    };
  }

  const data = await res.json();
  return { response: data.choices[0].message.content, source: "groq" };
};

const callOllama = async ({ prompt, stream = false, signal }) => {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3";
  
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream }),
    signal
  });

  if (!response.ok) throw new Error(`Ollama failed with status ${response.status}`);
  
  if (stream) {
    response.body.source = "ollama";
    return response.body; 
  }
  
  const data = await response.json();
  return { response: data.response, source: "ollama" };
};

const withTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("INFLIGHT_TIMEOUT")), ms))
  ]);

export const getCacheKey = ({ prompt, courseId, level, promptVersion }) => {
  const isComplex = /(design|architecture|optimize|analyze)/i.test(prompt) || prompt.length > 600;
  let selectedModel;
  
  if (process.env.USE_GROQ === "true") {
    selectedModel = isComplex ? (process.env.GROQ_MODEL || "llama3-70b-8192") : "llama3-8b-8192";
  } else {
    selectedModel = process.env.OLLAMA_MODEL || "llama3";
  }

  return crypto.createHash('sha256').update(JSON.stringify({
    prompt,
    model: selectedModel,
    courseId,
    level,
    promptVersion
  })).digest('hex');
};

export const callLLM = async ({ prompt, signal, stream = false, courseId, level, promptVersion }) => {
  rotateWindowIfNeeded();
  const cacheKey = getCacheKey({ prompt, courseId, level, promptVersion });
  
  const cachedResult = getCache(cacheKey);
  if (cachedResult) {
    aiMetrics.cacheHits++;
    windowMetrics.cacheHits++;
    if (cachedResult.negative) {
      aiMetrics.reasons.negativeCache++;
      windowMetrics.reasons.negativeCache++;
      return { negative: true, source: "negative_cache" };
    }
    return stream ? createStreamPolyfill(cachedResult) : { response: cachedResult, source: "cache" };
  }

  if (inFlight.has(cacheKey)) {
    const flightResult = await inFlight.get(cacheKey);
    aiMetrics.cacheHits++;
    windowMetrics.cacheHits++;
    if (flightResult?.negative) {
      aiMetrics.reasons.negativeCache++;
      windowMetrics.reasons.negativeCache++;
      return { negative: true, source: "negative_cache" };
    }
    const value = flightResult.response || flightResult;
    return stream ? createStreamPolyfill(value) : { response: value, source: "cache" };
  }

  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 10000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  const fetchPromise = withTimeout((async () => {
    let finalPayload;
    if (process.env.USE_GROQ === "true") {
      try {
        aiMetrics.groqCalls++;
        windowMetrics.groqCalls++;
        finalPayload = await callGroq({ ...(({prompt, stream, signal, selectedModel}) => ({prompt, stream, signal, selectedModel}))({ prompt, stream, signal: controller.signal, selectedModel: (/(design|architecture|optimize|analyze)/i.test(prompt) || prompt.length > 600) ? (process.env.GROQ_MODEL || "llama3-70b-8192") : "llama3-8b-8192" }) });
      } catch (err) {
        aiMetrics.fallbacks++;
        windowMetrics.fallbacks++;
        if (err.message === "RATE_LIMIT") {
          aiMetrics.reasons.rateLimit++;
          windowMetrics.reasons.rateLimit++;
          console.error("[AI] Groq rate limited. Immediate fallback to Ollama.");
        } else {
          aiMetrics.reasons.fallback++;
          windowMetrics.reasons.fallback++;
          console.error("[AI FALLBACK]", { reason: err.message, from: "groq", to: "ollama" });
        }
      }
    }

    if (!finalPayload) {
      aiMetrics.ollamaCalls++;
      windowMetrics.ollamaCalls++;
      finalPayload = await callOllama({ prompt, stream, signal: controller.signal });
    }

    if (!stream && finalPayload?.response) {
      let parsed;
      try {
        parsed = JSON.parse(finalPayload.response.replace(/```json/gi, '').replace(/```/g, '').trim());
      } catch {
        parsed = null;
      }

      if (parsed && typeof parsed === 'object') {
        setCache(cacheKey, finalPayload.response);
      } else {
        setCache(cacheKey, { negative: true, value: null }, 15_000);
      }
    } else if (!finalPayload) {
      // Complete LLM failure
      setCache(cacheKey, { negative: true, value: null }, 15_000);
      return { negative: true, source: "negative_cache" };
    }

    return finalPayload;
  })(), timeoutMs + 2000);

  inFlight.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    inFlight.delete(cacheKey);
    clearTimeout(timer);
  }
};

export const validateContent = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (!data.explanation || typeof data.explanation !== 'string') return false;
  if (!Array.isArray(data.examples)) return false;
  if (!Array.isArray(data.resources)) return false;
  return true;
};
