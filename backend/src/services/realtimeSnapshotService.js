import Course from '../models/Course.js';
import Roadmap from '../models/Roadmap.js';
import AIContent from '../models/AIContent.js';
import Task from '../models/Task.js';
import Mentorship from '../models/Mentorship.js';
import { getCachedSnapshot, setCachedSnapshot } from './realtimeCache.js';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'master'];

/**
 * Build the same snapshot shape as GET /api/realtime/sync (snapshot field only).
 */
export async function buildSyncSnapshot(courseId) {
  const course = await Course.findById(courseId)
    .select('mentorshipId progress realtimeVersion')
    .lean();
  if (!course) return null;

  const v = Number(course.realtimeVersion || 0);
  const cached = getCachedSnapshot(courseId, v);
  if (cached) return cached;

  const roadmap = await Roadmap.findOne({ courseId, isActive: true }).populate('steps').lean();
  const aiContents = await AIContent.find({ courseId }).lean();
  const tasks = await Task.find({ courseId }).sort({ level: 1, order: 1, createdAt: 1 }).lean();
  const mentorship = course.mentorshipId
    ? await Mentorship.findById(course.mentorshipId).select('progress currentLevel levels').lean()
    : null;

  const snapshot = {
    roadmap: roadmap
      ? {
          roadmapId: roadmap._id,
          title: roadmap.title,
          version: roadmap.version,
          generatedBy: roadmap.generatedBy,
          steps: (roadmap.steps || []).map((s) => ({
            stepId: s._id,
            order: s.order,
            level: s.level,
            title: s.title,
            description: s.description || '',
            subtopics: s.subtopics || [],
            progress: s.progress ?? 0,
            aiContentGenerated: !!s.aiContentGenerated,
          })),
        }
      : null,
    aiContents: aiContents.map((item) => ({
      level: item.level,
      content: item.content || '',
      updatedAt: item.updatedAt,
    })),
    tasks: tasks.map((task) => ({
      _id: task._id,
      title: task.title,
      description: task.description || '',
      isCompleted: !!task.isCompleted,
      completedBy: task.completedBy || null,
      level: task.level,
      order: task.order ?? 0,
    })),
    progress: {
      overallProgress: Number(mentorship?.progress ?? course.progress ?? 0),
      currentLevel: mentorship?.currentLevel || 'beginner',
      levels: mentorship?.levels || LEVELS,
    },
  };

  setCachedSnapshot(courseId, v, snapshot);
  return snapshot;
}
