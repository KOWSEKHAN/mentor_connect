import axios from 'axios'

const OLLAMA_GENERATE_URL = 'http://127.0.0.1:11434/api/generate'
const MODEL = 'phi3'
const FALLBACK_MODEL = 'phi:latest'
const REQUEST_TIMEOUT_MS = 8000

function SAFE_FALLBACK(title) {
  return {
    title: title || 'Learning Roadmap',
    steps: [
      {
        order: 1,
        level: 'beginner',
        title: 'Introduction',
        description: 'Start learning the basics',
        subtopics: ['Overview'],
      },
    ],
  }
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function extractJSON(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return text.substring(start, end + 1)
  }
  return text
}

function cleanResponseText(text) {
  if (text == null || typeof text !== 'string') return ''
  let s = text.trim()
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
  s = s.replace(/\s*```\s*$/i, '')
  return s.trim()
}

function repairTrailingCommas(str) {
  return str.replace(/,\s*([}\]])/g, '$1')
}

function parseRoadmapFromRaw(raw) {
  const rawStr = String(raw)

  let extracted = extractJSON(rawStr)
  let cleaned = cleanResponseText(extracted)
  let repaired = repairTrailingCommas(cleaned)
  let parsed = safeParseJSON(repaired)

  if (parsed === null) {
    console.error('Phi parse failed')
    return null
  }

  if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    console.error('Phi validation failed')
    return null
  }

  const validLevels = ['beginner', 'intermediate', 'advanced', 'master']

  return {
    title: typeof parsed.title === 'string' ? parsed.title : '',
    steps: parsed.steps.map((s, i) => ({
      order: typeof s?.order === 'number' ? s.order : i + 1,
      level: validLevels.includes(s?.level) ? s.level : 'beginner',
      title: s?.title ? String(s.title) : 'Introduction',
      description: s?.description ? String(s.description) : 'Start learning the basics',
      subtopics: Array.isArray(s?.subtopics) ? s.subtopics.map(String) : ['Overview'],
    })),
  }
}

async function callOllama({ model, prompt }) {
  return axios.post(
    OLLAMA_GENERATE_URL,
    { model, prompt, stream: false },
    { timeout: REQUEST_TIMEOUT_MS }
  )
}

export async function generateRoadmapFromPhi({ courseTitle, domain }) {
  const title = courseTitle || 'Learning Roadmap'
  const dom = domain || ''

  const prompt = `Output STRICT JSON only. No markdown. No explanation text. No code fences.
Exact schema:
{
  "title": string,
  "steps": [
    {
      "order": number,
      "level": "beginner" | "intermediate" | "advanced" | "master",
      "title": string,
      "description": string,
      "subtopics": string[]
    }
  ]
}
Course title: ${title}
Domain: ${dom}`

  try {
    const response = await callOllama({ model: MODEL, prompt })

    const raw = response?.data?.response
    if (!raw) {
      console.error('Empty Phi response')
      return SAFE_FALLBACK(title)
    }

    const parsed = parseRoadmapFromRaw(raw)
    if (!parsed) return SAFE_FALLBACK(title)

    if (!parsed.title) parsed.title = title
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) return SAFE_FALLBACK(title)
    return parsed
  } catch (error) {
    const msg = error?.response?.data?.error || error?.message || ''
    const isModelMissing = typeof msg === 'string' && msg.toLowerCase().includes('model') && msg.toLowerCase().includes('not found')
    console.error('Phi retry triggered')
    try {
      const response = await callOllama({ model: isModelMissing ? FALLBACK_MODEL : MODEL, prompt })

      const raw = response?.data?.response
      if (!raw) {
        console.error('Empty Phi response')
        return SAFE_FALLBACK(title)
      }

      const parsed = parseRoadmapFromRaw(raw)
      if (!parsed) return SAFE_FALLBACK(title)

      if (!parsed.title) parsed.title = title
      if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) return SAFE_FALLBACK(title)
      return parsed
    } catch (err) {
      console.error('Ollama call failed:', err.message)
      return SAFE_FALLBACK(title)
    }
  }
}

