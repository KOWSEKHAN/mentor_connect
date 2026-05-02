export const buildContentPrompt = ({ courseTitle, level, step, mentorPrompt, prevContext }) => `
You are an expert educator.

Course: ${courseTitle}
Level: ${level}

Topic:
${step}

Previous Context:
${prevContext || "None"}

Instructions:
${mentorPrompt}

Return ONLY valid JSON:
{
  "explanation": "...",
  "examples": ["..."],
  "resources": ["..."]
}
`;

export const buildRoadmapPrompt = ({ courseTitle, domain, mentorPrompt }) => `
You are an expert mentor designing a structured learning roadmap.

Course: "${courseTitle}"
Domain: ${domain}
Instructions: ${mentorPrompt || "None"}

Return ONLY JSON:
{
  "title": "string",
  "steps": [
    { "level": "beginner", "title": "...", "description": "...", "subtopics": ["..."] },
    { "level": "intermediate", "title": "...", "description": "...", "subtopics": ["..."] },
    { "level": "advanced", "title": "...", "description": "...", "subtopics": ["..."] },
    { "level": "master", "title": "...", "description": "...", "subtopics": ["..."] }
  ]
}
`;
