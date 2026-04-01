import mongoose from 'mongoose';
import Mentorship from '../models/Mentorship.js';
import Course from '../models/Course.js';
import Roadmap from '../models/Roadmap.js';
import AIContent from '../models/AIContent.js';
import Task from '../models/Task.js';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'master'];

const clampProgress = (n) => Math.max(0, Math.min(100, Number(n || 0)));

function toObjectIdOrNull(value) {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(value) ? value : null;
}

async function loadMembership(mentorshipId, userId) {
  if (!mentorshipId || !mongoose.Types.ObjectId.isValid(mentorshipId)) return null;
  const ms = await Mentorship.findById(mentorshipId);
  if (!ms) return null;
  const uid = String(userId);
  const isMentor = String(ms.mentorId) === uid;
  const isMentee = String(ms.menteeId) === uid;
  if (!isMentor && !isMentee) return null;
  return { ms, isMentor, isMentee };
}

async function syncCourseFromMentorship(ms, courseIdHint = null) {
  const queryById = courseIdHint && mongoose.Types.ObjectId.isValid(courseIdHint)
    ? { _id: courseIdHint }
    : null;
  let course = queryById ? await Course.findOne(queryById) : null;
  if (!course) {
    course = await Course.findOne({ mentorshipId: ms._id });
  }
  if (!course) {
    course = await Course.findOne({
      $and: [
        { $or: [{ mentee: ms.menteeId }, { menteeId: ms.menteeId }] },
        { $or: [{ mentor: ms.mentorId }, { mentorId: ms.mentorId }] },
      ],
    });
  }
  if (!course) return null;

  course.progress = clampProgress(ms.progress);
  if (course.progress >= 100) {
    course.status = 'completed';
    if (!course.completedAt) course.completedAt = new Date();
    course.certificateIssued = true;
  }
  course.updatedAt = new Date();
  await course.save();
  return course;
}

function getMentorshipPayload(ms) {
  return {
    mentorshipId: ms._id,
    levels: Array.isArray(ms.levels) && ms.levels.length > 0 ? ms.levels : LEVELS,
    currentLevel: ms.currentLevel || 'beginner',
    progress: clampProgress(ms.progress),
    status: ms.status,
  };
}

function generateLevelTemplate(domain, level, prompt) {
  const pretty = level.charAt(0).toUpperCase() + level.slice(1);
  const focus = prompt?.trim() || domain || 'your selected track';
  return `# ${pretty} Level Content

## Focus Area
${focus}

## What to Learn
- Core concepts for ${pretty.toLowerCase()} stage
- Practical exercises and hands-on implementation
- Mentor feedback checkpoints

## Suggested Activities
1. Read fundamentals and summarize key ideas
2. Implement one guided mini-project
3. Share blockers with your mentor and revise

## Completion Criteria
- Demonstrate understanding in discussion
- Submit level tasks with working outcomes
- Be ready to progress to next level`;
}

export const getStructuredState = async (req, res) => {
  try {
    const { mentorshipId } = req.params;
    const membership = await loadMembership(mentorshipId, req.user._id);
    if (!membership) return res.status(403).json({ message: 'Not authorized' });
    const { ms } = membership;

    const roadmap = await Roadmap.findOne({
      mentorId: ms.mentorId,
      menteeId: ms.menteeId,
      isActive: true,
    }).populate('steps').lean();

    const steps = (roadmap?.steps || []).map((s) => ({
      stepId: s._id,
      level: s.level,
      title: s.title,
      description: s.description || '',
      order: s.order ?? 0,
      progress: s.progress ?? 0,
      aiContentGenerated: !!s.aiContentGenerated,
    }));

    return res.json({
      ...getMentorshipPayload(ms),
      roadmap: roadmap
        ? {
            roadmapId: roadmap._id,
            title: roadmap.title,
            version: roadmap.version,
            generatedBy: roadmap.generatedBy,
            steps,
          }
        : null,
    });
  } catch (err) {
    console.error('getStructuredState failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getLevelContent = async (req, res) => {
  try {
    const { mentorshipId } = req.params;
    const membership = await loadMembership(mentorshipId, req.user._id);
    if (!membership) return res.status(403).json({ message: 'Not authorized' });
    const { ms, isMentee } = membership;

    const requestedLevel = req.query.level;
    const level = (requestedLevel || ms.currentLevel || 'beginner').toLowerCase();
    if (!LEVELS.includes(level)) return res.status(400).json({ message: 'Invalid level' });
    if (isMentee && level !== (ms.currentLevel || 'beginner')) {
      return res.status(403).json({ message: 'Content locked for this level' });
    }

    const doc = await AIContent.findOne({ mentorshipId: ms._id, level }).lean();
    return res.json({
      ...getMentorshipPayload(ms),
      level,
      content: doc?.content || '',
      contentId: doc?._id || null,
      generatedBy: doc?.generatedBy || null,
      updatedAt: doc?.updatedAt || null,
    });
  } catch (err) {
    console.error('getLevelContent failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const upsertLevelContent = async (req, res) => {
  try {
    const { mentorshipId } = req.params;
    const membership = await loadMembership(mentorshipId, req.user._id);
    if (!membership) return res.status(403).json({ message: 'Not authorized' });
    const { ms, isMentor } = membership;
    if (!isMentor) return res.status(403).json({ message: 'Mentor only' });

    const level = String(req.body.level || ms.currentLevel || 'beginner').toLowerCase();
    if (!LEVELS.includes(level)) return res.status(400).json({ message: 'Invalid level' });

    const prompt = req.body.prompt || '';
    const contentInput = req.body.content;
    const content = typeof contentInput === 'string' && contentInput.trim()
      ? contentInput
      : generateLevelTemplate(ms.domain, level, prompt);

    const doc = await AIContent.findOneAndUpdate(
      { mentorshipId: ms._id, level },
      {
        $set: {
          mentorshipId: ms._id,
          courseId: toObjectIdOrNull(req.body.courseId),
          content,
          generatedBy: req.user._id,
        },
      },
      { new: true, upsert: true }
    );

    return res.json({
      message: 'Level content saved',
      ...getMentorshipPayload(ms),
      level,
      content: doc.content,
      contentId: doc._id,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    console.error('upsertLevelContent failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getLevelTasks = async (req, res) => {
  try {
    const { mentorshipId } = req.params;
    const membership = await loadMembership(mentorshipId, req.user._id);
    if (!membership) return res.status(403).json({ message: 'Not authorized' });
    const { ms, isMentee } = membership;

    const requestedLevel = String(req.query.level || '').toLowerCase();
    const level = isMentee ? (ms.currentLevel || 'beginner') : (requestedLevel || ms.currentLevel || 'beginner');
    if (!LEVELS.includes(level)) return res.status(400).json({ message: 'Invalid level' });

    const tasks = await Task.find({ mentorshipId: ms._id, level })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return res.json({
      ...getMentorshipPayload(ms),
      level,
      tasks: tasks.map((t) => ({
        _id: t._id,
        title: t.title,
        description: t.description || '',
        isCompleted: !!t.isCompleted,
        completedBy: t.completedBy || null,
        level: t.level,
        order: t.order ?? 0,
      })),
    });
  } catch (err) {
    console.error('getLevelTasks failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const createLevelTask = async (req, res) => {
  try {
    const { mentorshipId } = req.params;
    const membership = await loadMembership(mentorshipId, req.user._id);
    if (!membership) return res.status(403).json({ message: 'Not authorized' });
    const { ms, isMentor } = membership;
    if (!isMentor) return res.status(403).json({ message: 'Mentor only' });

    const level = String(req.body.level || ms.currentLevel || 'beginner').toLowerCase();
    if (!LEVELS.includes(level)) return res.status(400).json({ message: 'Invalid level' });

    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Task title is required' });

    const count = await Task.countDocuments({ mentorshipId: ms._id, level });
    const task = await Task.create({
      mentorshipId: ms._id,
      courseId: toObjectIdOrNull(req.body.courseId),
      level,
      title,
      description: String(req.body.description || ''),
      isCompleted: false,
      completedBy: null,
      order: count + 1,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      message: 'Task created',
      task: {
        _id: task._id,
        title: task.title,
        description: task.description || '',
        isCompleted: task.isCompleted,
        completedBy: task.completedBy,
        level: task.level,
        order: task.order,
      },
    });
  } catch (err) {
    console.error('createLevelTask failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const toggleTaskCompletion = async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: 'Invalid task id' });
    }
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const membership = await loadMembership(task.mentorshipId, req.user._id);
    if (!membership) return res.status(403).json({ message: 'Not authorized' });
    const { ms, isMentee } = membership;
    if (!isMentee) return res.status(403).json({ message: 'Mentee only' });

    const currentLevel = ms.currentLevel || 'beginner';
    if (task.level !== currentLevel) {
      return res.status(400).json({ message: 'Task does not belong to current level' });
    }

    task.isCompleted = !task.isCompleted;
    task.completedBy = task.isCompleted ? req.user._id : null;
    await task.save();

    const levelTasks = await Task.find({ mentorshipId: ms._id, level: currentLevel });
    const hasTasks = levelTasks.length > 0;
    const allDone = hasTasks && levelTasks.every((t) => t.isCompleted);
    if (allDone) {
      const levels = Array.isArray(ms.levels) && ms.levels.length > 0 ? ms.levels : LEVELS;
      const currentIndex = Math.max(0, levels.indexOf(currentLevel));
      const nextIndex = Math.min(levels.length - 1, currentIndex + 1);
      ms.progress = clampProgress((currentIndex + 1) * 25);
      if (nextIndex > currentIndex) {
        ms.currentLevel = levels[nextIndex];
      } else {
        ms.currentLevel = levels[levels.length - 1] || 'master';
        ms.progress = 100;
        ms.status = 'completed';
      }
      await ms.save();
      await syncCourseFromMentorship(ms, task.courseId);
    }

    return res.json({
      message: 'Task updated',
      task: {
        _id: task._id,
        title: task.title,
        description: task.description || '',
        isCompleted: task.isCompleted,
        completedBy: task.completedBy,
        level: task.level,
      },
      mentorship: getMentorshipPayload(ms),
    });
  } catch (err) {
    console.error('toggleTaskCompletion failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
