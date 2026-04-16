/**
 * Short TTL cache for heavy realtime snapshot reads (high QPS on /sync).
 * Invalidated when course realtime version changes (see eventBuilder).
 */

const DEFAULT_TTL_MS = Math.max(5_000, Number(process.env.REALTIME_CACHE_TTL_MS || 30_000));
const MAX_ENTRIES = Math.max(50, Number(process.env.REALTIME_CACHE_MAX || 500));

const store = new Map();

function key(courseId, version) {
  return `${String(courseId)}@${version}`;
}

export function getCachedSnapshot(courseId, realtimeVersion) {
  const k = key(courseId, realtimeVersion);
  const hit = store.get(k);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    store.delete(k);
    return null;
  }
  return hit.snapshot;
}

export function setCachedSnapshot(courseId, realtimeVersion, snapshot) {
  if (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    store.delete(first);
  }
  const k = key(courseId, realtimeVersion);
  store.set(k, { snapshot, exp: Date.now() + DEFAULT_TTL_MS });
}

export function invalidateCourseCache(courseId) {
  const prefix = `${String(courseId)}@`;
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
