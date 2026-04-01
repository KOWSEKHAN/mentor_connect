// backend/src/controllers/mentorshipController.js
import Mentorship from '../models/Mentorship.js';
import Course from '../models/Course.js';
import { randomBetween, grantPointsOnce, awardCourseCompletion } from '../services/pointService.js';

/**
 * Mentor: list their mentees
 * GET /api/mentorship/mentees or /api/mentorships/mentor
 */
export const mentorListMentees = async (req, res) => {
  try {
    const mentorId = req.user._id;
    const { status = 'accepted' } = req.query;
    console.log('[mentorship] mentorListMentees', {
      mentorId: mentorId?.toString?.() || mentorId,
      status,
    });

    // Mentor dashboard should only list accepted mentees (no pending).
    const list = await Mentorship.find({ mentorId, status: 'accepted' })
      .populate('menteeId', 'name email')
      .populate('mentorId', 'name')
      .sort({ startedAt: -1 });
    console.log('[mentorship] mentorListMentees:result', { count: list?.length || 0 });
    console.log('Mentorship fetch result (mentorListMentees):', list);

    // Standardized response shape for dashboard: mentorships array
    const mentorships = list.map((m) => {
      if (!m.menteeId || !m.mentorId) console.error('Invalid mentorship record:', m);
      return {
        _id: m._id,
        mentee: m.menteeId,
        status: m.status,
        domain: m.domain,
        progress: m.progress,
        currentLevel: m.currentLevel || 'beginner',
        levels: Array.isArray(m.levels) && m.levels.length
          ? m.levels
          : ['beginner', 'intermediate', 'advanced', 'master'],
        startedAt: m.startedAt,
      };
    });

    return res.json({ mentorships });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentee: list my mentors
 */
export const menteeListMentors = async (req, res) => {
  try {
    const menteeId = req.user._id;
    console.log('[mentorship] menteeListMentors', { menteeId: menteeId?.toString?.() || menteeId });
    // Mentee should only see accepted mentorships as "active courses/mentors".
    const list = await Mentorship.find({ menteeId, status: 'accepted' })
      .populate('mentorId', 'name email')
      .sort({ startedAt: -1 });
    console.log('[mentorship] menteeListMentors:result', { count: list?.length || 0 });
    console.log('Mentorship fetch result (menteeListMentors):', list);

    const mentorships = list.map((m) => {
      if (!m.menteeId || !m.mentorId) console.error('Invalid mentorship record:', m);
      return {
        _id: m._id,
        mentor: m.mentorId,
        status: m.status,
        domain: m.domain,
        progress: m.progress,
        currentLevel: m.currentLevel || 'beginner',
        levels: Array.isArray(m.levels) && m.levels.length
          ? m.levels
          : ['beginner', 'intermediate', 'advanced', 'master'],
        startedAt: m.startedAt,
      };
    });

    return res.json({ mentorships });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentor updates mentee progress (body: mentorshipId, progress)
 */
export const updateProgress = async (req, res) => {
  try {
    const mentorId = req.user._id;
    const { mentorshipId } = req.params;
    const { progress } = req.body;

    const ms = await Mentorship.findById(mentorshipId);
    if (!ms) return res.status(404).json({ message: 'Mentorship not found' });
    if (String(ms.mentorId) !== String(mentorId)) return res.status(403).json({ message: 'Not allowed' });

    const prevProgress = ms.progress;
    ms.progress = Math.max(0, Math.min(100, Number(progress ?? ms.progress)));
    // Mark mentorship completed when progress reaches 100.
    if (ms.progress >= 100 && ms.status !== 'completed') ms.status = 'completed';
    await ms.save();

    const oldBand = Math.floor(Number(prevProgress) / 25);
    const newBand = Math.floor(Number(ms.progress) / 25);
    for (let b = oldBand + 1; b <= newBand; b++) {
      grantPointsOnce(
        ms.mentorId,
        randomBetween(3, 8),
        'mentor_reward',
        `${ms._id}:milestone:${b}`,
        'Mentor guidance reward'
      ).catch((e) => console.error('[points] mentor milestone:', e));
    }

    // Keep linked course in sync for certificate / completion (best-effort match).
    let linkedCourse = await Course.findOne({ mentorshipId: ms._id });
    if (!linkedCourse) {
      linkedCourse = await Course.findOne({
        $and: [
          { $or: [{ mentee: ms.menteeId }, { menteeId: ms.menteeId }] },
          { $or: [{ mentor: ms.mentorId }, { mentorId: ms.mentorId }] },
        ],
      });
    }
    if (linkedCourse) {
      const wasCc =
        linkedCourse.status === 'completed' || (linkedCourse.progress ?? 0) >= 100;
      linkedCourse.progress = Math.max(linkedCourse.progress || 0, ms.progress);
      if (ms.progress >= 100) {
        linkedCourse.status = 'completed';
        if (!linkedCourse.completedAt) linkedCourse.completedAt = new Date();
        linkedCourse.certificateIssued = true;
      }
      linkedCourse.updatedAt = new Date();
      await linkedCourse.save();

      const nowCc =
        linkedCourse.status === 'completed' || (linkedCourse.progress ?? 0) >= 100;
      if (!wasCc && nowCc) {
        const menteeOid = linkedCourse.mentee?._id || linkedCourse.mentee;
        awardCourseCompletion(menteeOid, linkedCourse._id).catch((e) =>
          console.error('[points] course completion (sync):', e)
        );
      }
    }

    return res.json({ message: 'Progress updated', mentorship: ms });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
