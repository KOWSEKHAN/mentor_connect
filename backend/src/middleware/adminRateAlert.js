/**
 * adminRateAlert.js
 * Fix 4: Sliding-window mutation spike detector.
 *
 * Counts POST/DELETE mutations made by any admin in the last 60 seconds.
 * If the count exceeds ALERT_THRESHOLD, logs a structured WARNING so it
 * surfaces in any log-aggregation pipeline (Datadog, CloudWatch, etc.).
 * Zero external deps — pure in-process sliding window.
 */

const ALERT_WINDOW_MS  = 60_000; // 1 minute
const ALERT_THRESHOLD  = 15;     // warn if ≥ 15 mutations in that window

// Shared sliding-window log (process-level, reset on restart — acceptable for alerts)
const mutationLog = [];

export const trackAdminMutations = (req, res, next) => {
  const now = Date.now();

  mutationLog.push({
    ts:     now,
    actor:  req.user?.email ?? 'unknown',
    method: req.method,
    path:   req.path,
  });

  // Evict entries outside the window
  while (mutationLog.length > 0 && mutationLog[0].ts < now - ALERT_WINDOW_MS) {
    mutationLog.shift();
  }

  const count = mutationLog.length;

  if (count >= ALERT_THRESHOLD) {
    // Fix 4: structured spike warning — easy to forward to Slack / PagerDuty
    console.warn('[ADMIN_SPIKE]', {
      count,
      windowMs:  ALERT_WINDOW_MS,
      threshold: ALERT_THRESHOLD,
      actor:     req.user?.email,
      action:    `${req.method} ${req.path}`,
      timestamp: new Date(now).toISOString(),
      // Recent actors (deduped) for investigation
      recentActors: [...new Set(mutationLog.map(e => e.actor))],
    });
  }

  next();
};
