/**
 * Inclusive random integer in [min, max].
 */
export function randomBetween(min, max) {
  const lo = Math.ceil(Number(min));
  const hi = Math.floor(Number(max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
