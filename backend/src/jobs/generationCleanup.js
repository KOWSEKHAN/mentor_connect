// backend/src/jobs/generationCleanup.js
/**
 * Background job: marks stale "generating" AIContent documents as "failed".
 *
 * WHY NEEDED:
 *   If the server crashes mid-generation, the pending doc is left with
 *   generationStatus: 'generating' forever. This job detects those orphans
 *   and marks them 'failed' so mentors see a clear error state and can retry.
 *
 * STALE THRESHOLD: 2 minutes (configurable via GENERATION_STALE_MS env var).
 *   This is safely above the LLM timeout (10s) + lock TTL (60s).
 */
import AIContent from '../models/AIContent.js';

const STALE_AFTER_MS = Number(process.env.GENERATION_STALE_MS || 2 * 60 * 1000);  // 2 min
const INTERVAL_MS    = Number(process.env.CLEANUP_INTERVAL_MS  || 2 * 60 * 1000);  // run every 2 min

export function startGenerationCleanupJob() {
  // Run once immediately on start, then on interval
  void runCleanup();
  const timer = setInterval(() => void runCleanup(), INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref(); // don't block process exit
  console.info(`[GenerationCleanup] Job started (threshold: ${STALE_AFTER_MS / 1000}s, interval: ${INTERVAL_MS / 1000}s)`);
}

async function runCleanup() {
  try {
    const staleThreshold = new Date(Date.now() - STALE_AFTER_MS);

    const result = await AIContent.updateMany(
      {
        generationStatus: 'generating',
        updatedAt: { $lt: staleThreshold },
      },
      {
        $set: { generationStatus: 'failed' },
      }
    );

    if (result.modifiedCount > 0) {
      console.warn(
        `[GenerationCleanup] Marked ${result.modifiedCount} orphaned generating docs as 'failed'`,
        { staleThreshold }
      );
    }
  } catch (err) {
    console.error('[GenerationCleanup] Error during cleanup run:', err.message);
  }
}
