import mongoose from 'mongoose';
import Course from '../models/Course.js';
import Mentorship from '../models/Mentorship.js';
import Task from '../models/Task.js';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'master'];

const clamp = (n) => Math.max(0, Math.min(100, Number(n || 0)));

/**
 * Single canonical read model: mentorship progress + per-level completion for the active level,
 * derived from Task + Mentorship documents (aggregation-friendly counts).
 *
 * @param {string|mongoose.Types.ObjectId} courseId
 * @param {import('mongoose').ClientSession | null} session
 */
export async function computeCourseProgress(courseId, session = null) {
  const q = (model, filter) => {
    const chain = model.find(filter);
    return session ? chain.session(session) : chain;
  };

  const course = await q(Course, { _id: courseId })
    .select('mentorshipId progress')
    .lean();
  if (!course) return null;

  const mid = course.mentorshipId;
  if (!mid) {
    return {
      courseId: String(courseId),
      mentorshipId: null,
      overallProgress: clamp(course.progress),
      currentLevel: 'beginner',
      levelProgress: 0,
      levelTotals: {},
    };
  }

  const ms = await q(Mentorship, { _id: mid })
    .select('levels currentLevel progress status')
    .lean();
  if (!ms) return null;

  const levels = Array.isArray(ms.levels) && ms.levels.length > 0 ? ms.levels : LEVELS;
  const currentLevel = ms.currentLevel || 'beginner';

  const oid = new mongoose.Types.ObjectId(mid);
  const pipeline = [
    { $match: { mentorshipId: oid } },
    {
      $group: {
        _id: '$level',
        total: { $sum: 1 },
        completed: { $sum: { $cond: ['$isCompleted', 1, 0] } },
      },
    },
  ];

  let agg = Task.aggregate(pipeline);
  if (session) agg = agg.session(session);
  agg = await agg;

  const levelTotals = {};
  for (const row of agg) {
    levelTotals[row._id] = {
      total: row.total,
      completed: row.completed,
    };
  }

  const cur = levelTotals[currentLevel] || { total: 0, completed: 0 };
  const hasTasks = cur.total > 0;
  const levelProgress = hasTasks ? clamp((cur.completed / cur.total) * 100) : 0;

  return {
    courseId: String(courseId),
    mentorshipId: String(mid),
    overallProgress: clamp(ms.progress),
    currentLevel,
    levelProgress,
    levelTotals,
    mentorshipStatus: ms.status,
    levels,
  };
}
