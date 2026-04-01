import mongoose from 'mongoose';
import Roadmap from '../models/Roadmap.js';
import RoadmapStep from '../models/RoadmapStep.js';
import Course from '../models/Course.js';
import Mentorship from '../models/Mentorship.js';
import { startSafeSession } from '../../utils/dbSession.js';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'master'];

function validateStepsForInsert(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.order === undefined || s.order === null) throw new Error(`Step ${i + 1}: order is required`);
    if (!s.level || !LEVELS.includes(s.level)) throw new Error(`Step ${i + 1}: level must be one of ${LEVELS.join(', ')}`);
    if (!s.title || typeof s.title !== 'string' || !s.title.trim()) throw new Error(`Step ${i + 1}: title is required`);
  }
}

function formatRoadmapResponse(populated) {
  const steps = (populated.steps || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    roadmapId: populated._id,
    title: populated.title,
    version: populated.version,
    generatedBy: populated.generatedBy,
    isActive: populated.isActive,
    steps: steps.map((s) => ({
      stepId: s._id,
      order: s.order,
      level: s.level,
      title: s.title,
      description: s.description || '',
      subtopics: s.subtopics || [],
      progress: s.progress ?? 0,
      aiContentGenerated: s.aiContentGenerated ?? false,
    })),
  };
}

/**
 * createRoadmap — transaction: deactivate previous, increment version, create roadmap + steps, link, commit.
 * Body: { courseId, menteeId, mentorId (optional), title, steps (optional array of { order, level, title, description?, subtopics? }) }
 */
export const createRoadmap = async (req, res) => {
  try {
    const { courseId, menteeId, mentorId, title, steps: stepsInput } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!courseId || !menteeId) {
      return res.status(400).json({ message: 'courseId and menteeId are required' });
    }

    const course = await Course.findById(courseId).select('mentee mentor title mentorshipId').lean();
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const courseMenteeId = (course.mentee?._id || course.mentee).toString();
    const courseMentorId = course.mentor ? (course.mentor._id || course.mentor).toString() : null;
    if (courseMenteeId !== menteeId.toString()) return res.status(403).json({ message: 'menteeId does not match course' });
    if (courseMentorId && mentorId && courseMentorId !== mentorId.toString()) return res.status(403).json({ message: 'mentorId does not match course' });
    if (userRole === 'mentee' && userId.toString() !== courseMenteeId) return res.status(403).json({ message: 'Not authorized' });
    if (userRole === 'mentor' && (!courseMentorId || userId.toString() !== courseMentorId)) return res.status(403).json({ message: 'Not authorized' });

    const session = await startSafeSession();
    const opts = session ? { session } : {};
    const deactivateFilter = userRole === 'mentor'
      ? { courseId, menteeId, isActive: true }
      : { courseId, menteeId, generatedBy: 'mentee', isActive: true };
    await Roadmap.updateMany(deactivateFilter, { isActive: false }, opts);

    const versionQuery = Roadmap.findOne({ courseId, menteeId })
      .sort({ version: -1 })
      .select('version')
      .lean();
    if (session) versionQuery.session(session);
    const latestRoadmap = await versionQuery;
    const nextVersion = latestRoadmap ? latestRoadmap.version + 1 : 1;

    if (Array.isArray(stepsInput) && stepsInput.length > 0) {
      validateStepsForInsert(stepsInput);
    }

    const roadmapTitle = title || course.title || 'Learning Roadmap';
    let roadmap;
    try {
      roadmap = await Roadmap.create(
        [{
          courseId,
          mentorshipId: course.mentorshipId || null,
          menteeId,
          mentorId: mentorId || courseMentorId || null,
          title: roadmapTitle,
          generatedBy: userRole,
          version: nextVersion,
          isActive: true,
          steps: [],
        }],
        opts
      ).then((r) => r[0]);
    } catch (createErr) {
      if (session) {
        await session.abortTransaction().catch(() => {});
        await session.endSession().catch(() => {});
      }
      console.error('Roadmap creation failed:', createErr);
      return res.status(500).json({ message: 'Server error' });
    }

    const stepsToCreate = Array.isArray(stepsInput) && stepsInput.length > 0
      ? stepsInput.map((s, i) => ({
          roadmapId: roadmap._id,
          mentorshipId: course.mentorshipId || null,
          order: s.order ?? i + 1,
          level: s.level && LEVELS.includes(s.level) ? s.level : LEVELS[i % LEVELS.length],
          title: s.title || `${LEVELS[i % LEVELS.length]} step`,
          description: s.description || '',
          subtopics: s.subtopics || [],
          aiContentGenerated: false,
          progress: 0,
        }))
      : LEVELS.map((level, i) => ({
          roadmapId: roadmap._id,
          mentorshipId: course.mentorshipId || null,
          order: i + 1,
          level,
          title: `${level.charAt(0).toUpperCase() + level.slice(1)} level`,
          description: '',
          subtopics: [],
          aiContentGenerated: false,
          progress: 0,
        }));

    let stepDocs;
    try {
      stepDocs = await RoadmapStep.insertMany(stepsToCreate, opts);
    } catch (stepErr) {
      if (!session && roadmap) {
        await Roadmap.findByIdAndDelete(roadmap._id).catch(() => {});
      }
      if (session) {
        await session.abortTransaction().catch(() => {});
        await session.endSession().catch(() => {});
      }
      console.error('Roadmap creation failed:', stepErr);
      return res.status(500).json({ message: 'Server error' });
    }
    if (stepDocs.length !== stepsToCreate.length) {
      if (!session && roadmap) {
        await Roadmap.findByIdAndDelete(roadmap._id).catch(() => {});
      }
      if (session) {
        await session.abortTransaction().catch(() => {});
        await session.endSession().catch(() => {});
      }
      throw new Error('RoadmapStep creation mismatch');
    }
    roadmap.steps = stepDocs.map((s) => s._id);
    await roadmap.save(opts);

    if (session) {
      await session.commitTransaction();
      await session.endSession();
    }
    const populated = await Roadmap.findById(roadmap._id).populate('steps').lean();
    return res.status(201).json(formatRoadmapResponse(populated));
  } catch (err) {
    console.error('Roadmap creation failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * getActiveRoadmap — GET by courseId and menteeId. Returns active roadmap with steps populated sorted by order.
 */
export const getActiveRoadmap = async (req, res) => {
  try {
    const { courseId, menteeId } = req.params;
    const userId = req.user._id;

    if (!courseId || !menteeId) return res.status(400).json({ message: 'courseId and menteeId are required' });

    const course = await Course.findById(courseId).select('mentee mentor').lean();
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const courseMenteeId = (course.mentee?._id || course.mentee).toString();
    const courseMentorId = course.mentor ? (course.mentor._id || course.mentor).toString() : null;
    if (courseMenteeId !== menteeId) return res.status(403).json({ message: 'menteeId does not match course' });
    if (userId.toString() !== courseMenteeId && userId.toString() !== courseMentorId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const roadmap = await Roadmap.findOne({ courseId, menteeId, isActive: true })
      .select('title version generatedBy isActive steps')
      .populate('steps')
      .lean();

    if (!roadmap) return res.json({ roadmap: null, steps: [] });

    return res.json(formatRoadmapResponse(roadmap));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * updateRoadmap — Mentor only. Mentor override: create new version, deactivate old roadmap.
 * Body: { title?, steps? (array of { order, level, title, description?, subtopics? }) }
 */
export const updateRoadmap = async (req, res) => {
  const session = await startSafeSession();
  const opts = session ? { session } : {};
  try {
    const { roadmapId } = req.params;
    const { title, steps: stepsInput } = req.body;
    const userId = req.user._id;

    if (!roadmapId) return res.status(400).json({ message: 'roadmapId is required' });

    const existing = await Roadmap.findById(roadmapId).select('courseId menteeId mentorId title version').lean();
    if (!existing) return res.status(404).json({ message: 'Roadmap not found' });
    const course = await Course.findById(existing.courseId).select('mentor mentorshipId').lean();
    const courseMentorId = course?.mentor ? (course.mentor._id || course.mentor).toString() : null;
    const isMentorOwner = existing.mentorId && existing.mentorId.toString() === userId.toString();
    const isCourseMentor = courseMentorId && courseMentorId === userId.toString();
    if (!isMentorOwner && !isCourseMentor) {
      return res.status(403).json({ message: 'Mentor only' });
    }

    if (Array.isArray(stepsInput) && stepsInput.length > 0) {
      validateStepsForInsert(stepsInput);
    }

    await Roadmap.updateMany(
      { courseId: existing.courseId, menteeId: existing.menteeId, isActive: true },
      { isActive: false },
      opts
    );

    const versionQuery = Roadmap.findOne({ courseId: existing.courseId, menteeId: existing.menteeId })
      .sort({ version: -1 })
      .select('version')
      .lean();
    if (session) versionQuery.session(session);
    const latestRoadmap = await versionQuery;
    const nextVersion = latestRoadmap ? latestRoadmap.version + 1 : 1;

    const roadmap = await Roadmap.create(
      [{
        courseId: existing.courseId,
        mentorshipId: course?.mentorshipId || null,
        menteeId: existing.menteeId,
        mentorId: existing.mentorId,
        title: title || existing.title,
        generatedBy: 'mentor',
        version: nextVersion,
        isActive: true,
        steps: [],
      }],
      opts
    ).then((r) => r[0]);

    const stepsToCreate = Array.isArray(stepsInput) && stepsInput.length > 0
      ? stepsInput.map((s, i) => ({
          roadmapId: roadmap._id,
          mentorshipId: course?.mentorshipId || null,
          order: s.order ?? i + 1,
          level: s.level && LEVELS.includes(s.level) ? s.level : LEVELS[i % LEVELS.length],
          title: s.title || 'Step',
          description: s.description || '',
          subtopics: s.subtopics || [],
          aiContentGenerated: false,
          progress: 0,
        }))
      : LEVELS.map((level, i) => ({
          roadmapId: roadmap._id,
          mentorshipId: course?.mentorshipId || null,
          order: i + 1,
          level,
          title: `${level.charAt(0).toUpperCase() + level.slice(1)} level`,
          description: '',
          subtopics: [],
          aiContentGenerated: false,
          progress: 0,
        }));

    let stepDocs;
    try {
      stepDocs = await RoadmapStep.insertMany(stepsToCreate, opts);
    } catch (stepErr) {
      if (!session && roadmap) await Roadmap.findByIdAndDelete(roadmap._id).catch(() => {});
      if (session) {
        await session.abortTransaction().catch(() => {});
        await session.endSession().catch(() => {});
      }
      console.error('Roadmap update failed:', stepErr);
      return res.status(500).json({ message: 'Server error' });
    }
    if (stepDocs.length !== stepsToCreate.length) {
      if (!session && roadmap) await Roadmap.findByIdAndDelete(roadmap._id).catch(() => {});
      if (session) {
        await session.abortTransaction().catch(() => {});
        await session.endSession().catch(() => {});
      }
      throw new Error('RoadmapStep creation mismatch');
    }
    roadmap.steps = stepDocs.map((s) => s._id);
    await roadmap.save(opts);

    if (session) {
      await session.commitTransaction();
      await session.endSession();
    }
    const populated = await Roadmap.findById(roadmap._id).populate('steps').lean();
    return res.json(formatRoadmapResponse(populated));
  } catch (err) {
    if (session) {
      await session.abortTransaction().catch(() => {});
      await session.endSession().catch(() => {});
    }
    console.error('Roadmap update failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * generateRoadmapAI — Call AI generator, transform to structured roadmap, store roadmap + steps.
 * Body: { courseId, menteeId, mentorId? (optional), domain? }
 */
export const generateRoadmapAI = async (req, res) => {
  const session = await startSafeSession();
  const opts = session ? { session } : {};
  try {
    const { courseId, menteeId, mentorId, domain } = req.body;

    if (!courseId || !menteeId) return res.status(400).json({ message: 'courseId and menteeId are required' });

    const course = await Course.findById(courseId).select('mentee mentor title domain mentorshipId').lean();
    if (!course) return res.status(404).json({ message: 'Course not found' });
    const courseMenteeId = (course.mentee?._id || course.mentee).toString();
    if (courseMenteeId !== menteeId.toString()) return res.status(403).json({ message: 'menteeId does not match course' });

    const aiPayload = await Promise.resolve({
      title: course.title || 'AI Learning Roadmap',
      steps: LEVELS.map((level, i) => ({
        order: i + 1,
        level,
        title: `${level.charAt(0).toUpperCase() + level.slice(1)}: ${domain || course.domain || 'Core Topics'}`,
        description: `Structured learning path for ${level} level.`,
        subtopics: ['Fundamentals', 'Practice', 'Projects'],
      })),
    });

    await Roadmap.updateMany({ courseId, menteeId, isActive: true }, { isActive: false }, opts);

    const versionQuery = Roadmap.findOne({ courseId, menteeId })
      .sort({ version: -1 })
      .select('version')
      .lean();
    if (session) versionQuery.session(session);
    const latestRoadmap = await versionQuery;
    const nextVersion = latestRoadmap ? latestRoadmap.version + 1 : 1;

    const roadmap = await Roadmap.create(
      [{
        courseId,
        mentorshipId: course.mentorshipId || null,
        menteeId,
        mentorId: mentorId || course.mentor || null,
        title: aiPayload.title,
        generatedBy: 'ai',
        version: nextVersion,
        isActive: true,
        steps: [],
      }],
      opts
    ).then((r) => r[0]);

    const stepsToCreate = aiPayload.steps.map((s) => ({
      roadmapId: roadmap._id,
      mentorshipId: course.mentorshipId || null,
      order: s.order,
      level: s.level,
      title: s.title,
      description: s.description || '',
      subtopics: s.subtopics || [],
      aiContentGenerated: false,
      progress: 0,
    }));

    let stepDocs;
    try {
      stepDocs = await RoadmapStep.insertMany(stepsToCreate, opts);
    } catch (stepErr) {
      if (!session && roadmap) await Roadmap.findByIdAndDelete(roadmap._id).catch(() => {});
      if (session) {
        await session.abortTransaction().catch(() => {});
        await session.endSession().catch(() => {});
      }
      console.error('Roadmap AI generation failed:', stepErr);
      return res.status(500).json({ message: 'Server error' });
    }
    if (stepDocs.length !== stepsToCreate.length) {
      if (!session && roadmap) await Roadmap.findByIdAndDelete(roadmap._id).catch(() => {});
      if (session) {
        await session.abortTransaction().catch(() => {});
        await session.endSession().catch(() => {});
      }
      throw new Error('RoadmapStep creation mismatch');
    }
    roadmap.steps = stepDocs.map((s) => s._id);
    await roadmap.save(opts);

    if (session) {
      await session.commitTransaction();
      await session.endSession();
    }
    const populated = await Roadmap.findById(roadmap._id).populate('steps').lean();
    return res.status(201).json(formatRoadmapResponse(populated));
  } catch (err) {
    if (session) {
      await session.abortTransaction().catch(() => {});
      await session.endSession().catch(() => {});
    }
    console.error('Roadmap AI generation failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Generate new roadmap for a course.
 * Mentee or mentor. Deactivates previous active roadmap, creates new version with ordered steps.
 */
export const generateRoadmap = async (req, res) => {
  try {
    const { courseId, title: titleOverride } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!courseId) {
      return res.status(400).json({ message: 'courseId is required' });
    }

    const course = await Course.findById(courseId).select('mentee mentor title domain mentorshipId').lean();
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const menteeId = course.mentee?._id || course.mentee;
    const mentorId = course.mentor?._id || course.mentor || null;

    if (userRole === 'mentee' && menteeId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized for this course' });
    }
    if (userRole === 'mentor' && (!mentorId || mentorId.toString() !== userId.toString())) {
      return res.status(403).json({ message: 'Not authorized for this course' });
    }

    await Roadmap.updateMany(
      { courseId, menteeId, isActive: true },
      { isActive: false }
    );

    const previous = await Roadmap.findOne({ courseId, menteeId })
      .sort({ version: -1 })
      .select('version')
      .lean();
    const nextVersion = (previous?.version ?? 0) + 1;

    const title = titleOverride || course.title || 'Learning Roadmap';
    const roadmap = await Roadmap.create({
      courseId,
      mentorshipId: course.mentorshipId || null,
      menteeId,
      mentorId,
      title,
      generatedBy: userRole,
      version: nextVersion,
      isActive: true,
      steps: [],
    });

    const stepDocs = [];
    for (let i = 0; i < LEVELS.length; i++) {
      const level = LEVELS[i];
      const step = await RoadmapStep.create({
        roadmapId: roadmap._id,
        mentorshipId: course.mentorshipId || null,
        order: i + 1,
        level,
        title: `${level.charAt(0).toUpperCase() + level.slice(1)} level`,
        description: '',
        subtopics: [],
        aiContentGenerated: false,
        progress: 0,
      });
      stepDocs.push(step._id);
    }

    roadmap.steps = stepDocs;
    await roadmap.save();

    const populated = await Roadmap.findById(roadmap._id)
      .populate('steps')
      .lean();

    const steps = (populated.steps || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return res.status(201).json({
      roadmapId: populated._id,
      title: populated.title,
      version: populated.version,
      generatedBy: populated.generatedBy,
      steps: steps.map((s) => ({
        stepId: s._id,
        order: s.order,
        level: s.level,
        title: s.title,
        description: s.description || '',
        subtopics: s.subtopics || [],
        progress: s.progress ?? 0,
        aiContentGenerated: s.aiContentGenerated ?? false,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get active roadmap for a course. Populate steps sorted by order.
 */
export const getCourseRoadmap = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    if (!courseId) return res.status(400).json({ message: 'courseId is required' });

    const course = await Course.findById(courseId).select('mentee mentor mentorshipId').lean();
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const menteeId = course.mentee?._id || course.mentee;
    const mentorId = course.mentor?._id || course.mentor || null;
    if (menteeId.toString() !== userId.toString() && (mentorId && mentorId.toString() !== userId.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const roadmap = await Roadmap.findOne({ courseId, menteeId, isActive: true })
      .populate('steps')
      .lean();

    let mentorshipState = null;
    if (course.mentorshipId) {
      mentorshipState = await Mentorship.findById(course.mentorshipId)
        .select('currentLevel levels progress')
        .lean();
    }

    if (!roadmap) {
      return res.json({
        roadmap: null,
        steps: [],
        currentLevel: mentorshipState?.currentLevel || 'beginner',
        levels: mentorshipState?.levels || LEVELS,
        progress: mentorshipState?.progress ?? 0,
      });
    }

    const steps = (roadmap.steps || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return res.json({
      roadmapId: roadmap._id,
      title: roadmap.title,
      version: roadmap.version,
      generatedBy: roadmap.generatedBy,
      currentLevel: mentorshipState?.currentLevel || 'beginner',
      levels: mentorshipState?.levels || LEVELS,
      progress: mentorshipState?.progress ?? 0,
      steps: steps.map((s) => ({
        stepId: s._id,
        order: s.order,
        level: s.level,
        title: s.title,
        description: s.description || '',
        subtopics: s.subtopics || [],
        progress: s.progress ?? 0,
        aiContentGenerated: s.aiContentGenerated ?? false,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Regenerate roadmap (mentor only). New version, previous deactivated.
 */
export const regenerateRoadmap = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    if (!courseId) return res.status(400).json({ message: 'courseId is required' });

    const course = await Course.findById(courseId).select('mentee mentor title mentorshipId').lean();
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const mentorId = course.mentor?._id || course.mentor;
    if (!mentorId || mentorId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Mentor only' });
    }

    const menteeId = course.mentee?._id || course.mentee;

    await Roadmap.updateMany(
      { courseId, menteeId, isActive: true },
      { isActive: false }
    );

    const previous = await Roadmap.findOne({ courseId, menteeId })
      .sort({ version: -1 })
      .select('version')
      .lean();
    const nextVersion = (previous?.version ?? 0) + 1;

    const roadmap = await Roadmap.create({
      courseId,
      mentorshipId: course.mentorshipId || null,
      menteeId,
      mentorId,
      title: course.title || 'Learning Roadmap',
      generatedBy: 'mentor',
      version: nextVersion,
      isActive: true,
      steps: [],
    });

    const stepDocs = [];
    for (let i = 0; i < LEVELS.length; i++) {
      const level = LEVELS[i];
      const step = await RoadmapStep.create({
        roadmapId: roadmap._id,
        mentorshipId: course.mentorshipId || null,
        order: i + 1,
        level,
        title: `${level.charAt(0).toUpperCase() + level.slice(1)} level`,
        description: '',
        subtopics: [],
        aiContentGenerated: false,
        progress: 0,
      });
      stepDocs.push(step._id);
    }
    roadmap.steps = stepDocs;
    await roadmap.save();

    const populated = await Roadmap.findById(roadmap._id)
      .populate('steps')
      .lean();
    const steps = (populated.steps || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return res.status(201).json({
      roadmapId: populated._id,
      title: populated.title,
      version: populated.version,
      generatedBy: populated.generatedBy,
      steps: steps.map((s) => ({
        stepId: s._id,
        order: s.order,
        level: s.level,
        title: s.title,
        description: s.description || '',
        subtopics: s.subtopics || [],
        progress: s.progress ?? 0,
        aiContentGenerated: s.aiContentGenerated ?? false,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Update a roadmap step (mentor only). title, description, subtopics, order.
 */
export const updateRoadmapStep = async (req, res) => {
  try {
    const { stepId } = req.params;
    const { title, description, subtopics, order } = req.body;
    const userId = req.user._id;

    if (!stepId) return res.status(400).json({ message: 'stepId is required' });

    const step = await RoadmapStep.findById(stepId).populate('roadmapId');
    if (!step) return res.status(404).json({ message: 'Roadmap step not found' });

    const roadmap = await Roadmap.findById(step.roadmapId).lean();
    if (!roadmap) return res.status(404).json({ message: 'Roadmap not found' });
    if (roadmap.mentorId?.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Mentor only' });
    }

    if (title !== undefined) step.title = title;
    if (description !== undefined) step.description = description;
    if (subtopics !== undefined) step.subtopics = subtopics;
    if (order !== undefined) step.order = order;
    await step.save();

    return res.json({
      stepId: step._id,
      order: step.order,
      level: step.level,
      title: step.title,
      description: step.description || '',
      subtopics: step.subtopics || [],
      progress: step.progress ?? 0,
      aiContentGenerated: step.aiContentGenerated ?? false,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Activate a specific roadmap version (mentor only).
 */
export const activateRoadmapVersion = async (req, res) => {
  try {
    const { roadmapId } = req.params;
    const userId = req.user._id;

    if (!roadmapId) return res.status(400).json({ message: 'roadmapId is required' });

    const roadmap = await Roadmap.findById(roadmapId).lean();
    if (!roadmap) return res.status(404).json({ message: 'Roadmap not found' });
    if (roadmap.mentorId?.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Mentor only' });
    }

    await Roadmap.updateMany(
      { courseId: roadmap.courseId, menteeId: roadmap.menteeId, isActive: true },
      { isActive: false }
    );
    await Roadmap.findByIdAndUpdate(roadmapId, { isActive: true });

    const updated = await Roadmap.findById(roadmapId).populate('steps').lean();
    const steps = (updated.steps || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return res.json({
      roadmapId: updated._id,
      title: updated.title,
      version: updated.version,
      generatedBy: updated.generatedBy,
      isActive: true,
      steps: steps.map((s) => ({
        stepId: s._id,
        order: s.order,
        level: s.level,
        title: s.title,
        description: s.description || '',
        subtopics: s.subtopics || [],
        progress: s.progress ?? 0,
        aiContentGenerated: s.aiContentGenerated ?? false,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
