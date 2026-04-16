export function buildPrompt({ type, domain, level }) {
  if (type === "roadmap") {
    return `
You are an expert mentor.

Create a learning roadmap for ${domain}.

STRICT RULES:
- Return ONLY valid JSON
- NO explanation
- NO markdown
- NO extra text

FORMAT:
{
  "title": "string",
  "steps": [
    {
      "title": "string",
      "level": "beginner | intermediate | advanced | master",
      "order": number,
      "description": "string",
      "subtopics": ["string"]
    }
  ]
}
`;
  }

  if (type === "level_content") {
    return `
You are an expert mentor generating learning material for a single roadmap level.

Target domain: ${domain || "general"}
Target level: ${(level || "beginner").toLowerCase()}

STRICT RULES:
- Return ONLY valid JSON
- NO markdown
- NO explanation text outside JSON

REQUIRED JSON SHAPE:
{
  "level": "beginner | intermediate | advanced | master",
  "explanation": "string",
  "examples": ["string", "string"],
  "resources": ["string"]
}
`;
  }

  return `Generate useful learning content for ${domain || "general"}`;
}
