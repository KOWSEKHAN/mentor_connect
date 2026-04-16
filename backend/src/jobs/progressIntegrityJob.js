import Course from '../models/Course.js';
import { computeCourseProgress } from '../services/courseProgressService.js';
import { logger } from '../observability/logger.js';

export function startProgressIntegrityJob() {
  const intervalMs = Math.max(60_000, Number(process.env.PROGRESS_INTEGRITY_MS || 300_000));
  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

async function runOnce() {
  try {
    const courses = await Course.find({ mentorshipId: { $exists: true, $ne: null } })
      .select('_id progress')
      .limit(500)
      .lean();

    for (const c of courses) {
      const computed = await computeCourseProgress(c._id);
      if (!computed?.mentorshipId) continue;
      const drift = Math.abs(Number(c.progress || 0) - Number(computed.overallProgress || 0));
      if (drift > 0.5) {
        logger.warn('progress_integrity_drift', {
          courseId: String(c._id),
          storedCourseProgress: c.progress,
          computedOverall: computed.overallProgress,
        });
        await Course.updateOne(
          { _id: c._id },
          { $set: { progress: computed.overallProgress, updatedAt: new Date() } }
        );
      }
    }
  } catch (e) {
    logger.warn('progress_integrity_job_failed', { message: e.message });
  }
}
