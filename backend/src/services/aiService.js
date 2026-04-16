import { metrics } from "../observability/metrics.js";

export async function generateAIResponse(prompt) {
  const t0 = Date.now();
  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt,
        stream: false
      })
    });

    const data = await res.json();
    const text = data.response || "";
    const latencyMs = Date.now() - t0;
    metrics.recordAiCall({
      latencyMs,
      usedFallback: false,
      failed: !text,
      responseChars: text.length,
    });
    return text;
  } catch (err) {
    console.error("Ollama error:", err);
    metrics.recordAiCall({
      latencyMs: Date.now() - t0,
      usedFallback: false,
      failed: true,
      responseChars: 0,
    });
    return null;
  }
}
