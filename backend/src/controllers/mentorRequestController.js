// backend/src/controllers/mentorRequestController.js
import Mentorship from '../models/Mentorship.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import { getRealtimeIO } from '../socket/realtime.js';

// ─── shared workspace factory ─────────────────────────────────────────────────
// Called ONLY when status transitions to 'accepted' — never at request creation.
async function ensureWorkspace(mentorship) {
  const { mentorId, menteeId, domain, _id: mentorshipId } = mentorship;
  const normalizedDomain = domain || '';

  // Correct query: $and with two $or arrays (duplicate $or key is a silent JS bug)
  let course = await Course.findOne({
    $and: [
      { $or: [{ mentee: menteeId }, { menteeId }] },
      { domain: normalizedDomain },
      { $or: [{ mentor: mentorId }, { mentorId }, { mentor: null }, { mentor: { $exists: false } }] },
    ],
  }).sort({ updatedAt: -1 });

  if (course) {
    // Link mentor if not already set
    course.mentor   = mentorId;
    course.mentorId = mentorId;
    course.menteeId = menteeId;
    course.mentorshipId = mentorshipId;
    await course.save();
  } else {
    // Part 1 + 3: Create workspace ONLY on acceptance — never before
    course = await Course.create({
      title:        normalizedDomain || 'Mentorship Course',
      domain:       normalizedDomain,
      mentor:       mentorId,
      mentorId,
      mentee:       menteeId,
      menteeId,
      mentorshipId,
      progress:     0,
      currentLevel: 'beginner',
      status:       'in_progress',
    });
  }
  return course;
}

// ─── helper: stamp accepted mentorship fields ─────────────────────────────────
function stampAccepted(mentorship) {
  mentorship.status       = 'accepted';
  mentorship.startedAt    = mentorship.startedAt || new Date();
  if (!Array.isArray(mentorship.levels) || mentorship.levels.length === 0) {
    mentorship.levels = ['beginner', 'intermediate', 'advanced', 'master'];
  }
  if (!mentorship.currentLevel) mentorship.currentLevel = 'beginner';
  if (typeof mentorship.progress !== 'number') mentorship.progress = 0;
}

/**
 * Mentee sends a request to mentor
 * body: { mentorId, domain, message }
 */
export const sendMentorRequest = async (req, res) => {
  try {
    const { mentorId, domain, message } = req.body;
    const menteeId = req.user._id;

    const mentor = await User.findById(mentorId);
    if (!mentor || mentor.role !== 'mentor') {
      return res.status(400).json({ message: 'Target is not a mentor' });
    }

    // Part 1: NEVER create workspace here — only create the Mentorship doc
    const mentorship = await Mentorship.findOneAndUpdate(
      { mentorId, menteeId, domain: domain || '' },
      {
        $setOnInsert: {
          mentorId,
          menteeId,
          domain: domain || '',
          status: 'pending',
          coursePrice: 0,
          startedAt: new Date(),
        },
        $set: {
          message: message || '',
          status: 'pending',
        },
      },
      { upsert: true, new: true }
    ).populate('menteeId', 'name email');

    return res.status(201).json({ message: 'Request sent', request: mentorship });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentor lists pending requests
 */
export const listPendingRequests = async (req, res) => {
  try {
    const mentorId = req.user._id;
    const requests = await Mentorship.find({ mentorId, status: 'pending' })
      .populate('menteeId', 'name email')
      .sort({ startedAt: -1 });

    const shaped = requests.map((ms) => ({
      _id:       ms._id,
      mentee:    ms.menteeId,
      mentor:    ms.mentorId,
      domain:    ms.domain,
      message:   ms.message,
      status:    ms.status,
      createdAt: ms.startedAt,
    }));
    return res.json({ requests: shaped });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentee lists their active requests (all non-completed statuses)
 * GET /api/mentorship/my/requests
 */
export const menteePendingRequests = async (req, res) => {
  try {
    const menteeId = req.user._id;
    // Part 4: Include rejected so mentee can see "Request Rejected" state
    const requests = await Mentorship.find({
      menteeId,
      status: { $in: ['pending', 'price_set', 'rejected'] },
    }).populate('mentorId', 'name email').sort({ startedAt: -1 });

    const shaped = requests.map((ms) => ({
      _id:         ms._id,
      mentor:      ms.mentorId,
      domain:      ms.domain,
      message:     ms.message,
      status:      ms.status,
      coursePrice: ms.coursePrice,
      createdAt:   ms.startedAt,
    }));
    return res.json({ requests: shaped });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentor accepts a request (free — no payment)
 * Part 2: Sets status to 'accepted' THEN creates workspace
 */
export const acceptRequest = async (req, res) => {
  try {
    const mentorId = req.user._id;
    const { reqId } = req.params;

    const mentorship = await Mentorship.findById(reqId);
    if (!mentorship) return res.status(404).json({ message: 'Request not found' });
    if (String(mentorship.mentorId) !== String(mentorId)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    if (!['pending', 'price_set'].includes(mentorship.status)) {
      return res.status(400).json({ message: 'Request cannot be accepted in its current state' });
    }

    stampAccepted(mentorship);
    await mentorship.save();

    // Part 2 & 6: Workspace created ONLY after acceptance — never at request creation
    const course = await ensureWorkspace(mentorship);

    // Part 5: Notify mentee via their user room
    const io = getRealtimeIO();
    if (io) {
      io.to(`user_${mentorship.menteeId}`).emit('request_accepted', {
        requestId: mentorship._id,
        courseId:  course._id,
        status:    'accepted',
      });
    }

    return res.json({ success: true, mentorship, courseId: course._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentor sets course price → transitions to price_set
 * Part 2 + 5: Sets price and emits real-time update to mentee
 */
export const setCoursePrice = async (req, res) => {
  try {
    const mentorId = req.user._id;
    const { reqId } = req.params;
    const { price } = req.body;

    if (!price || price <= 0) {
      return res.status(400).json({ message: 'Price must be greater than zero' });
    }

    const mentorship = await Mentorship.findById(reqId);
    if (!mentorship) return res.status(404).json({ message: 'Request not found' });
    if (String(mentorship.mentorId) !== String(mentorId)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    if (mentorship.status !== 'pending') {
      return res.status(400).json({ message: 'Price can only be set on pending requests' });
    }

    mentorship.status      = 'price_set';
    mentorship.coursePrice = price;
    await mentorship.save();

    // Part 5: Real-time price notification to mentee's user room
    const io = getRealtimeIO();
    if (io) {
      io.to(`user_${mentorship.menteeId}`).emit('price_updated', {
        requestId:   String(mentorship._id),
        coursePrice: mentorship.coursePrice,
        status:      'price_set',
        mentor:      { _id: mentorId },
      });
    }

    return res.json({ success: true, mentorship });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentee accepts and pays for a priced request
 * Part 3: Deduct wallet → create workspace → set accepted
 */
export const acceptAndPayRequest = async (req, res) => {
  try {
    const menteeId = req.user._id;
    const { reqId } = req.params;

    const mentorship = await Mentorship.findById(reqId);
    if (!mentorship) return res.status(404).json({ message: 'Request not found' });
    if (String(mentorship.menteeId) !== String(menteeId)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    if (mentorship.status !== 'price_set') {
      return res.status(400).json({ message: 'Request not ready for payment' });
    }

    // Idempotency: protect against double-click payments
    const Transaction = (await import('../models/Transaction.js')).default;
    const existing = await Transaction.findOne({
      userId:      menteeId,
      referenceId: String(mentorship._id),
      reason:      'course_purchase',
      status:      'completed',
    });
    if (existing) return res.status(400).json({ message: 'Already paid' });

    const { processTransfer } = await import('../services/walletService.js');
    try {
      await processTransfer(
        menteeId,
        mentorship.mentorId,
        mentorship.coursePrice,
        'course_purchase',
        String(mentorship._id),
        menteeId,
        'mentee'
      );
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') {
        return res.status(400).json({ message: 'Insufficient points' });
      }
      throw err;
    }

    // Part 3: Status → accepted THEN create workspace
    stampAccepted(mentorship);
    await mentorship.save();

    const course = await ensureWorkspace(mentorship);

    return res.json({ success: true, mentorship, courseId: course._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentor rejects a request
 * Part 2 + 6: Sets status to 'rejected' (soft) so mentee can see the outcome
 */
export const rejectRequest = async (req, res) => {
  try {
    const mentorId = req.user._id;
    const { reqId } = req.params;

    const mentorship = await Mentorship.findById(reqId);
    if (!mentorship) return res.status(404).json({ message: 'Request not found' });
    if (String(mentorship.mentorId) !== String(mentorId)) {
      return res.status(403).json({ message: 'Not your request' });
    }
    if (!['pending', 'price_set'].includes(mentorship.status)) {
      return res.status(400).json({ message: 'Can only reject pending or price_set requests' });
    }

    // Part 6: Soft reject — preserve record so mentee sees "Request Rejected"
    mentorship.status = 'rejected';
    await mentorship.save();

    // Part 5: Notify mentee
    const io = getRealtimeIO();
    if (io) {
      io.to(`user_${mentorship.menteeId}`).emit('request_rejected', {
        requestId: String(mentorship._id),
        status:    'rejected',
      });
    }

    return res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
