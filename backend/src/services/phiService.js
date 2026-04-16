import { generateAIResponse } from "./aiService.js";
import { buildPrompt } from "./promptBuilder.js";
import { metrics } from "../observability/metrics.js";

const cache = new Map();
const pending = new Map();
const MAX_CACHE_SIZE = 50;

function safeJsonParse(text) {
  try {
    if (!text) return null;

    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (err) {
    console.error("JSON parse failed:", err);
    return null;
  }
}

function validateRoadmap(data) {
  if (!data || !Array.isArray(data.steps)) return false;

  const validLevels = ["beginner", "intermediate", "advanced", "master"];

  return data.steps.every(step =>
    step.title &&
    validLevels.includes(step.level) &&
    typeof step.order === "number"
  );
}

function normalizeRoadmap(data) {
  const levelOrder = ["beginner", "intermediate", "advanced", "master"];

  return {
    title: data.title || "Generated Roadmap",
    steps: data.steps
      .map((step, index) => ({
        title: step.title || "Untitled",
        level: levelOrder.includes(step.level) ? step.level : "beginner",
        order: step.order ?? index + 1,
        description: step.description || "Start learning the basics of this topic.",
        subtopics: Array.isArray(step.subtopics) && step.subtopics.length > 0 ? step.subtopics : ["Overview"]
      }))
      .sort((a, b) => a.order - b.order)
  };
}

function fallbackRoadmap(domain, courseTitle) {
  return {
    title: courseTitle || `${domain || 'Learning'} Roadmap`,
    steps: [
      { title: "Introduction", level: "beginner", order: 1, description: "Basic introduction to the fundamental concepts.", subtopics: ["Overview", "Getting Started"] },
      { title: "Core Concepts", level: "intermediate", order: 2, description: "Understanding the core architecture and intermediate features.", subtopics: ["Core Theory", "Best Practices"] },
      { title: "Advanced Topics", level: "advanced", order: 3, description: "Diving into advanced use cases and complex patterns.", subtopics: ["Advanced Use Cases", "Performance"] },
      { title: "Mastery", level: "master", order: 4, description: "Reaching mastery through problem solving and architecture.", subtopics: ["Architecture", "System Design"] }
    ]
  };
}

export async function generateRoadmapFromPhi({ courseTitle, domain }) {
  const safeDomain = domain || "default";
  const key = `roadmap:${safeDomain.toLowerCase().trim()}`;

  const cached = cache.get(key);

  if (cached && Date.now() - cached.createdAt < 1000 * 60 * 60) {
    console.log("[AI] Cache hit:", key);
    return cached.data;
  }

  if (pending.has(key)) {
    console.log("[AI] Waiting for existing request:", key);
    return pending.get(key);
  }

  const promise = (async () => {
    const prompt = buildPrompt({ type: "roadmap", domain });

    const raw = await generateAIResponse(prompt);

    const parsed = safeJsonParse(raw);

    if (!parsed || !validateRoadmap(parsed)) {
      console.warn("[AI] Fallback used:", domain);
      metrics.inc("ai_fallbacks");
      return fallbackRoadmap(domain, courseTitle);
    }

    console.log("[AI] Generated via Ollama:", domain);

    const result = normalizeRoadmap(parsed);

    // Safely restore intended title if the AI generated something generic
    if (result.title === "Generated Roadmap" && courseTitle) {
      result.title = courseTitle;
    }

    return result;
  })();

  pending.set(key, promise);

  const result = await promise;

  pending.delete(key);

  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }

  cache.set(key, {
    data: result,
    createdAt: Date.now()
  });

  return result;
}

export async function generateStructuredContent({ type, level, domain, role }) {
  const prompt = buildPrompt({ type, level, domain, role });
  return await generateAIResponse(prompt);
}
