// backend/src/services/aiService.js
// Native fetch is available in modern Node.js
import crypto from 'node:crypto';

const isDev = process.env.NODE_ENV !== "production";
const canUseOllama = process.env.OLLAMA_BASE_URL && isDev;

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
  if (isDev) {
    console.log("GROQ KEY PRESENT:", !!process.env.GROQ_API_KEY);
    console.log("KEY PREFIX:", process.env.GROQ_API_KEY?.slice(0, 8));
  }

  if (!prompt || prompt.trim().length < 20) {
    throw new Error("INVALID_PROMPT_BLOCKED");
  }

  if (isDev) {
    console.log("FINAL PROMPT LENGTH:", prompt.length);
    console.log("FIRST 100 CHARS:", prompt.slice(0,100).replace(/\n/g, ' '));
  }

  const envModel = selectedModel || process.env.GROQ_MODEL;
  const isValidModel = (m) => typeof m === 'string' && m.startsWith('llama');
  const safeModel = isValidModel(envModel) ? envModel : "llama-3.1-8b-instant";

  const safeBody = stream 
    ? {
        model: safeModel,
        messages: [
          { role: "system", content: "You are an expert mentor who outputs valid JSON." },
          { role: "user", content: String(prompt).trim() }
        ],
        temperature: 0.7,
        stream: true
      }
    : {
        model: safeModel,
        messages: [
          { role: "system", content: "You are an expert mentor who outputs valid JSON." },
          { role: "user", content: String(prompt).trim() }
        ],
        temperature: 0.7,
        max_tokens: 1024,
        response_format: { type: "json_object" }
      };

  if (!safeBody.messages[1].content || safeBody.messages[1].content.trim().length < 20) {
    throw new Error("BLOCKED_INVALID_PROMPT");
  }

  // Double check the constructed payload doesn't violate rules
  if (!stream && safeBody.stream !== undefined) throw new Error("PAYLOAD_AUDIT_FAILED: stream in non-stream");
  if (safeBody.prompt !== undefined || safeBody.input !== undefined) throw new Error("PAYLOAD_AUDIT_FAILED: legacy fields");
  if (!Array.isArray(safeBody.messages)) throw new Error("PAYLOAD_AUDIT_FAILED: non-array messages");

  if (isDev) {
    console.log("FULL GROQ REQUEST:", JSON.stringify(safeBody, null, 2));
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(safeBody),
    signal
  });

  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) {
    const errorText = await res.text().catch(() => "Could not read error body");
    console.error("[Groq Error]", {
      status: res.status,
      hasKey: !!process.env.GROQ_API_KEY,
      errorBody: errorText
    });
    throw new Error(`Groq failed with status ${res.status}: ${errorText.slice(0, 100)}`);
  }

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
  const text = data.choices?.[0]?.message?.content;

  if (!text) throw new Error("EMPTY_LLM_RESPONSE");

  return { response: text, source: "groq" };
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
        finalPayload = await callGroq({ ...(({prompt, stream, signal, selectedModel}) => ({prompt, stream, signal, selectedModel}))({ prompt, stream, signal: controller.signal, selectedModel: (/(design|architecture|optimize|analyze)/i.test(prompt) || prompt.length > 600) ? (process.env.GROQ_MODEL || "llama-3.3-70b-versatile") : "llama-3.1-8b-instant" }) });
      } catch (err) {
        if (err.message.includes("BLOCKED") || err.message.includes("PAYLOAD_AUDIT_FAILED")) {
          throw err; // Fail fast, do not fallback
        }
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
      if (canUseOllama) {
        aiMetrics.ollamaCalls++;
        windowMetrics.ollamaCalls++;
        finalPayload = await callOllama({ prompt, stream, signal: controller.signal });
      } else {
        throw new Error("ALL_AI_MODELS_FAILED");
      }
    }

    if (!stream && finalPayload?.response) {
      let parsed;
      try {
        let text = finalPayload.response;
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          text = text.substring(startIdx, endIdx + 1);
        }
        parsed = JSON.parse(text.trim());
      } catch (err) {
        console.error("[JSON PARSE ERROR] Raw text:", finalPayload.response);
        throw new Error("INVALID_JSON_FROM_LLM");
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
  if (!data || typeof data !== 'object') {
    console.error("[VALIDATE] Data is not an object");
    return false;
  }

  if (data.explanation && typeof data.explanation === 'object') {
    data.explanation = data.explanation.description || JSON.stringify(data.explanation);
  }
  
  if (data.example && !data.examples) data.examples = data.example;
  if (data.resource && !data.resources) data.resources = data.resource;

  if (data.examples && typeof data.examples === 'object' && !Array.isArray(data.examples)) {
    data.examples = data.examples.list || data.examples.items || Object.values(data.examples);
  }
  if (data.resources && typeof data.resources === 'object' && !Array.isArray(data.resources)) {
    data.resources = data.resources.links || data.resources.items || Object.values(data.resources);
  }

  if (!data.explanation || typeof data.explanation !== 'string') {
    console.error("[VALIDATE] explanation missing or not string", typeof data.explanation);
    return false;
  }
  if (!Array.isArray(data.examples)) {
    console.error("[VALIDATE] examples missing or not array", typeof data.examples);
    return false;
  }
  if (!Array.isArray(data.resources)) {
    console.error("[VALIDATE] resources missing or not array", typeof data.resources);
    return false;
  }

  // Ensure Mongoose doesn't crash on [String] cast if LLM provided objects
  data.examples = data.examples.map(ex => typeof ex === 'object' ? JSON.stringify(ex) : String(ex));
  data.resources = data.resources.map(res => typeof res === 'object' ? JSON.stringify(res) : String(res));

  return true;
};
