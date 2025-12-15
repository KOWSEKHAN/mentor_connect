// backend/src/utils/resumeParser.js

/**
 * Extract keywords from resume text
 * @param {string} text - The resume text content
 * @param {number} maxKeywords - Maximum number of keywords to return (default: 25)
 * @returns {string[]} Array of extracted keywords
 */
export function extractKeywords(text, maxKeywords = 25) {
  if (!text || typeof text !== 'string') return []

  const stopWords = new Set([
    'and', 'the', 'with', 'for', 'of', 'to', 'in', 'on', 'at', 'by', 'is', 'are',
    'was', 'were', 'be', 'this', 'that', 'it', 'as', 'or', 'from', 'have', 'has',
    'had', 'i', 'you', 'we', 'they', 'he', 'she', 'them', 'our', 'your', 'their',
    'but', 'not', 'can', 'will', 'would', 'should', 'could', 'a', 'an'
  ])

  const keywords = new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
  )

  return Array.from(keywords).slice(0, maxKeywords)
}

