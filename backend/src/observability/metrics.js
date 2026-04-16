/**
 * In-process metrics (Prometheus scrape can wrap snapshot()).
 */
const counters = new Map();
const eventEmitTimestamps = [];
const AI_LATENCY_WINDOW = 500;

export function inc(name, value = 1) {
  counters.set(name, (counters.get(name) || 0) + value);
}

function trimEventTimestamps() {
  const cutoff = Date.now() - 60_000;
  while (eventEmitTimestamps.length && eventEmitTimestamps[0] < cutoff) {
    eventEmitTimestamps.shift();
  }
}

export const metrics = {
  eventEmitLatencyMs: [],
  syncApiCalls: 0,
  droppedEvents: 0,
  reconnectHints: 0,
  ai: {
    calls: 0,
    fallbacks: 0,
    failures: 0,
    latencyMs: [],
    lastResponseChars: 0,
  },
  inc,
  recordEmitLatency(ms) {
    const arr = metrics.eventEmitLatencyMs;
    arr.push(ms);
    if (arr.length > 1000) arr.shift();
  },
  recordEventEmit() {
    eventEmitTimestamps.push(Date.now());
    trimEventTimestamps();
    inc('events_emitted_total');
  },
  recordAiCall({ latencyMs, usedFallback, failed, responseChars = 0 }) {
    metrics.ai.calls += 1;
    if (usedFallback) metrics.ai.fallbacks += 1;
    if (failed) metrics.ai.failures += 1;
    metrics.ai.lastResponseChars = responseChars || metrics.ai.lastResponseChars;
    const arr = metrics.ai.latencyMs;
    arr.push(latencyMs);
    if (arr.length > AI_LATENCY_WINDOW) arr.shift();
  },
  eventsPerSecond() {
    trimEventTimestamps();
    const now = Date.now();
    const last1s = eventEmitTimestamps.filter((t) => now - t <= 1000).length;
    const last60s = eventEmitTimestamps.length;
    return { last1s, last60s };
  },
  snapshot() {
    const c = (name) => counters.get(name) || 0;
    const lat = metrics.eventEmitLatencyMs;
    const avg =
      lat.length === 0 ? 0 : lat.reduce((a, b) => a + b, 0) / lat.length;
    const aiLat = metrics.ai.latencyMs;
    const aiAvg =
      aiLat.length === 0 ? 0 : aiLat.reduce((a, b) => a + b, 0) / aiLat.length;
    const eps = metrics.eventsPerSecond();
    const aiFallbackTotal = metrics.ai.fallbacks + c('ai_fallbacks');
    return {
      counters: Object.fromEntries(counters.entries()),
      emitLatencyAvgMs: Math.round(avg * 100) / 100,
      emitLatencySamples: lat.length,
      eventsPerSecond: eps,
      syncApiCalls: c('sync_api_calls') || metrics.syncApiCalls,
      droppedEvents:
        c('dropped_events_chaos') + (metrics.droppedEvents || 0),
      reconnectHints: c('reconnect_hints') || metrics.reconnectHints,
      chaosEmits: {
        duplicate: c('chaos_duplicate_emits'),
        reordered: c('chaos_reordered_emits'),
        forcedDisconnects: c('chaos_forced_disconnects'),
      },
      ai: {
        calls: metrics.ai.calls,
        fallbacks: aiFallbackTotal,
        failures: metrics.ai.failures,
        fallbackRate:
          metrics.ai.calls === 0
            ? 0
            : Math.round((aiFallbackTotal / metrics.ai.calls) * 1000) / 1000,
        latencyAvgMs: Math.round(aiAvg * 100) / 100,
        latencySamples: aiLat.length,
        lastResponseChars: metrics.ai.lastResponseChars,
      },
      chaosMode: process.env.CHAOS_MODE === 'true',
      timestamp: new Date().toISOString(),
    };
  },
};
