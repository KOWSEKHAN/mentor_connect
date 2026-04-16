/**
 * CHAOS_MODE — resilience demos only. Never enable in production.
 */
const ENABLED = process.env.CHAOS_MODE === 'true';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isChaosMode() {
  return ENABLED;
}

export async function chaosMaybeDelayEmit() {
  if (!ENABLED) return;
  const ms = Math.floor(Math.random() * 400);
  await sleep(ms);
}

export function chaosMaybeDropEmit() {
  if (!ENABLED) return false;
  return Math.random() < 0.08;
}

export function chaosMaybeReorderHint() {
  if (!ENABLED) return false;
  return Math.random() < 0.05;
}

/** Second emit of the same envelope (clients should dedupe by eventId). */
export function chaosMaybeDuplicateEmit() {
  if (!ENABLED) return false;
  return Math.random() < 0.04;
}
