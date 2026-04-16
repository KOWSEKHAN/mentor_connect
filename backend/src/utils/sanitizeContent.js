/**
 * Strip dangerous patterns from AI/user-provided HTML-ish text before persistence.
 */
export function sanitizeLearningContent(text) {
  if (text == null) return '';
  let s = String(text);
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/javascript:/gi, '');
  if (s.length > 500_000) s = s.slice(0, 500_000);
  return s;
}
