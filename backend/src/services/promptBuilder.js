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

  return `Generate useful learning content for ${domain}`;
}
