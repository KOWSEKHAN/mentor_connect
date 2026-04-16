import mongoose from 'mongoose';
import Mentorship from '../models/Mentorship.js';
import Course from '../models/Course.js';
import Roadmap from '../models/Roadmap.js';
import AIContent from '../models/AIContent.js';
import Task from '../models/Task.js';
import { generateStructuredContent } from '../services/phiService.js';
import { metrics } from '../observability/metrics.js';
import {
  emitCourseEvent,
  persistCourseEvent,
  deliverAndSnapshot,
} from '../socket/eventBuilder.js';
import { sanitizeLearningContent } from '../utils/sanitizeContent.js';
import { auditFromRequest } from '../utils/auditContext.js';
import { withCourseLock } from '../services/courseResourceLock.js';
import { computeCourseProgress } from '../services/courseProgressService.js';
import { transactionsMandatory } from '../config/replicaSet.js';

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

async function syncCourseFromMentorship(ms, courseIdHint = null, session = null) {
  const queryById = courseIdHint && mongoose.Types.ObjectId.isValid(courseIdHint)
    ? { _id: courseIdHint }
    : null;
  const withSess = (q) => (session ? q.session(session) : q);
  let course = queryById ? await withSess(Course.findOne(queryById)) : null;
  if (!course) {
    course = await withSess(Course.findOne({ mentorshipId: ms._id }));
  }
  if (!course) {
    course = await withSess(
      Course.findOne({
        $and: [
          { $or: [{ mentee: ms.menteeId }, { menteeId: ms.menteeId }] },
          { $or: [{ mentor: ms.mentorId }, { mentorId: ms.mentorId }] },
        ],
      })
    );
  }
  if (!course) return null;

  const cp = await computeCourseProgress(course._id, session);
  course.progress = clampProgress(cp?.overallProgress ?? ms.progress);
  if (course.progress >= 100) {
    course.status = 'completed';
    if (!course.completedAt) course.completedAt = new Date();
    course.certificateIssued = true;
  }
  course.updatedAt = new Date();
  await course.save(session ? { session } : {});
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

function safeParseJson(text) {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(
      text
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim()
    );
  } catch {
    return null;
  }
}

function formatLevelContentFromJson(level, parsed, fallbackText) {
  if (!parsed || typeof parsed !== 'object') return fallbackText;
  const explanation = String(parsed.explanation || '').trim();
  const examples = Array.isArray(parsed.examples) ? parsed.examples.filter(Boolean).map((v) => String(v)) : [];
  const resources = Array.isArray(parsed.resources) ? parsed.resources.filter(Boolean).map((v) => String(v)) : [];
  if (!explanation) return fallbackText;
  const prettyLevel = level.charAt(0).toUpperCase() + level.slice(1);
  return `# ${prettyLevel} Level Content

## Explanation
${explanation}

## Examples
${examples.length ? examples.map((item) => `- ${item}`).join('\n') : '- No examples provided.'}

## Resources
${resources.length ? resources.map((item) => `- ${item}`).join('\n') : '- No resources provided.'}`;
}

function toStructuredContentPayload(level, content) {
  const text = String(content || '');
  const explanationMatch = text.match(/## Explanation\s*([\s\S]*?)\n## /i);
  const examplesMatch = text.match(/## Examples\s*([\s\S]*?)\n## /i);
  const resourcesMatch = text.match(/## Resources\s*([\s\S]*)$/i);
  const parseBullets = (block) =>
    String(block || '')
      .split('\n')
      .map((line) => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  return {
    level,
    explanation: explanationMatch ? explanationMatch[1].trim() : text,
    examples: parseBullets(examplesMatch?.[1] || ''),
    resources: parseBullets(resourcesMatch?.[1] || ''),
  };
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

    if (doc && isMentee && doc.status !== 'published') {
      return res.json({
        ...getMentorshipPayload(ms),
        level,
        content: '',
        contentId: null,
        generatedBy: null,
        updatedAt: null,
      });
    }

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
    const hasManualContent = typeof contentInput === 'string' && contentInput.trim();
    let content = hasManualContent ? contentInput : '';
    if (!hasManualContent) {
      const fallbackContent = generateLevelTemplate(ms.domain, level, prompt);
      try {
        const raw = await generateStructuredContent({
          type: 'level_content',
          level,
          domain: ms.domain || prompt || 'general',
          role: 'mentor',
        });
        const parsed = safeParseJson(raw);
        content = formatLevelContentFromJson(level, parsed, fallbackContent);
      } catch (aiErr) {
        console.error('AI level content generation failed:', aiErr);
        metrics.recordAiCall({
          latencyMs: 0,
          usedFallback: true,
          failed: true,
          responseChars: 0,
        });
        content = fallbackContent;
      }
    }
    content = sanitizeLearningContent(content);

    const eventCourseId = String(req.body.courseId || '').trim();
    const audit = auditFromRequest(req);
    let doc;

    if (eventCourseId && mongoose.Types.ObjectId.isValid(eventCourseId)) {
      await withCourseLock(eventCourseId, async () => {
        const session = await mongoose.startSession();
        try {
          let emitted;
          await session.withTransaction(async () => {
            doc = await AIContent.findOneAndUpdate(
              { mentorshipId: ms._id, level },
              {
                $set: {
                  mentorshipId: ms._id,
                  courseId: toObjectIdOrNull(req.body.courseId),
                  content,
                  generatedBy: req.user._id,
                },
              },
              { new: true, upsert: true, session }
            );
            emitted = await persistCourseEvent(
              'ai_content_generated',
              eventCourseId,
              {
                courseId: eventCourseId,
                level,
                content: toStructuredContentPayload(level, doc.content),
                updatedAt: doc.updatedAt,
              },
              audit,
              session
            );
          });
          await deliverAndSnapshot(emitted ? [emitted] : []);
        } finally {
          await session.endSession();
        }
      });
    } else {
      doc = await AIContent.findOneAndUpdate(
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
    }

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

    const audit = auditFromRequest(req);
    const eventCourseId = String(req.body.courseId || '').trim();
    let task;

    if (eventCourseId && mongoose.Types.ObjectId.isValid(eventCourseId)) {
      await withCourseLock(eventCourseId, async () => {
        const session = await mongoose.startSession();
        try {
          let emitted;
          await session.withTransaction(async () => {
            const count = await Task.countDocuments({ mentorshipId: ms._id, level }).session(session);
            const [t] = await Task.create(
              [
                {
                  mentorshipId: ms._id,
                  courseId: toObjectIdOrNull(req.body.courseId),
                  level,
                  title,
                  description: String(req.body.description || ''),
                  isCompleted: false,
                  completedBy: null,
                  order: count + 1,
                  createdBy: req.user._id,
                },
              ],
              { session }
            );
            task = t;
            emitted = await persistCourseEvent(
              'task_created',
              eventCourseId,
              {
                courseId: eventCourseId,
                level,
                task: {
                  _id: task._id,
                  title: task.title,
                  description: task.description || '',
                  isCompleted: task.isCompleted,
                  completedBy: task.completedBy,
                  level: task.level,
                  order: task.order,
                },
              },
              audit,
              session
            );
          });
          await deliverAndSnapshot(emitted ? [emitted] : []);
        } finally {
          await session.endSession();
        }
      });
    } else {
      const count = await Task.countDocuments({ mentorshipId: ms._id, level });
      task = await Task.create({
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
    }

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
    const taskPreview = await Task.findById(taskId);
    if (!taskPreview) return res.status(404).json({ message: 'Task not found' });

    const membership = await loadMembership(taskPreview.mentorshipId, req.user._id);
    if (!membership) return res.status(403).json({ message: 'Not authorized' });
    const { ms: msPreview, isMentee } = membership;
    if (!isMentee) return res.status(403).json({ message: 'Mentee only' });

    const currentLevel = msPreview.currentLevel || 'beginner';
    if (taskPreview.level !== currentLevel) {
      return res.status(400).json({ message: 'Task does not belong to current level' });
    }

    const audit = auditFromRequest(req);
    const lockId = String(taskPreview.courseId || taskPreview.mentorshipId);
    let emittedEvents = [];
    let responseMs = msPreview;

    try {
      await withCourseLock(lockId, async () => {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const task = await Task.findById(taskId).session(session);
            if (!task) throw new Error('Task not found');

            task.isCompleted = !task.isCompleted;
            task.completedBy = task.isCompleted ? req.user._id : null;
            await task.save({ session });

            const ms = await Mentorship.findById(task.mentorshipId).session(session);
            if (!ms) throw new Error('Mentorship not found');

            const levelTasks = await Task.find({ mentorshipId: ms._id, level: currentLevel }).session(session);
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
              await ms.save({ session });
              await syncCourseFromMentorship(ms, task.courseId, session);
            }

            const levelCompleted = levelTasks.filter((t) => t.isCompleted).length;
            const levelProgress = hasTasks ? clampProgress((levelCompleted / levelTasks.length) * 100) : 0;
            const overallProgress = clampProgress(ms.progress);
            const eventCourseId = String(task.courseId || '');
            if (eventCourseId) {
              const ev1 = await persistCourseEvent(
                'task_completed',
                eventCourseId,
                {
                  courseId: eventCourseId,
                  taskId: String(task._id),
                  updatedProgress: overallProgress,
                  task: {
                    _id: task._id,
                    title: task.title,
                    description: task.description || '',
                    isCompleted: task.isCompleted,
                    completedBy: task.completedBy,
                    level: task.level,
                    order: task.order ?? 0,
                  },
                },
                audit,
                session
              );
              const ev2 = await persistCourseEvent(
                'progress_updated',
                eventCourseId,
                {
                  courseId: eventCourseId,
                  level: currentLevel,
                  levelProgress,
                  overallProgress,
                  currentLevel: ms.currentLevel || currentLevel,
                },
                audit,
                session
              );
              emittedEvents = [ev1, ev2];
            }
          });
          await deliverAndSnapshot(emittedEvents);
        } finally {
          await session.endSession();
        }
      });
    } catch (txnErr) {
      if (transactionsMandatory()) {
        console.error('toggleTaskCompletion transaction failed:', txnErr);
        return res.status(503).json({ message: 'Consistency store unavailable. Retry.' });
      }
      console.error('toggleTaskCompletion transaction failed, fallback:', txnErr);
      const task = await Task.findById(taskId);
      if (!task) return res.status(404).json({ message: 'Task not found' });
      const ms = await Mentorship.findById(task.mentorshipId);
      if (!ms) return res.status(404).json({ message: 'Mentorship not found' });

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

      const levelCompleted = levelTasks.filter((t) => t.isCompleted).length;
      const levelProgress = hasTasks ? clampProgress((levelCompleted / levelTasks.length) * 100) : 0;
      const overallProgress = clampProgress(ms.progress);
      const eventCourseId = String(task.courseId || '');
      if (eventCourseId) {
        await emitCourseEvent(
          'task_completed',
          eventCourseId,
          {
            courseId: eventCourseId,
            taskId: String(task._id),
            updatedProgress: overallProgress,
            task: {
              _id: task._id,
              title: task.title,
              description: task.description || '',
              isCompleted: task.isCompleted,
              completedBy: task.completedBy,
              level: task.level,
              order: task.order ?? 0,
            },
          },
          audit
        );
        await emitCourseEvent(
          'progress_updated',
          eventCourseId,
          {
            courseId: eventCourseId,
            level: currentLevel,
            levelProgress,
            overallProgress,
            currentLevel: ms.currentLevel || currentLevel,
          },
          audit
        );
      }
      responseMs = ms;
    }

    const taskOut = await Task.findById(taskId);
    if (!taskOut) {
      return res.status(500).json({ message: 'Task state lost' });
    }
    const msOut = await Mentorship.findById(taskOut.mentorshipId);

    return res.json({
      message: 'Task updated',
      task: {
        _id: taskOut._id,
        title: taskOut.title,
        description: taskOut.description || '',
        isCompleted: taskOut.isCompleted,
        completedBy: taskOut.completedBy,
        level: taskOut.level,
      },
      mentorship: getMentorshipPayload(msOut || responseMs),
    });
  } catch (err) {
    console.error('toggleTaskCompletion failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
