export const buildContentPrompt = ({ level, domain, prompt }) => `You are an expert mentor.

Generate structured learning content.

Level: ${level}
Domain: ${domain || "general"}

Requirements:
- Clear explanation
- Minimum 2 examples
- Useful learning resources

Respond in JSON format with keys:
explanation, examples, resources

User Input:
${prompt && prompt.trim().length > 5 ? prompt.trim() : "No additional instructions"}`;

export const buildRoadmapPrompt = ({ courseTitle, domain, mentorPrompt }) => `You are an expert mentor designing a structured learning roadmap.

Course: "${courseTitle}"
Domain: ${domain}
Instructions: ${mentorPrompt && mentorPrompt.trim().length > 5 ? mentorPrompt.trim() : "None"}

Return ONLY valid JSON with keys:
title, steps

Each object in the 'steps' array MUST have these keys:
level, title, description, subtopics`;
