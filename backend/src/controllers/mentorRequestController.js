// backend/src/controllers/mentorRequestController.js
import Mentorship from '../models/Mentorship.js';
import User from '../models/User.js';
import Course from '../models/Course.js';

/**
 * Mentee sends a request to mentor
 * body: { mentorId, domain, message }
 */
export const sendMentorRequest = async (req, res) => {
  try {
    const { mentorId, domain, message } = req.body;
    const menteeId = req.user._id;

    // basic validation
    const mentor = await User.findById(mentorId);
    if (!mentor || mentor.role !== 'mentor') {
      return res.status(400).json({ message: 'Target is not a mentor' });
    }

    const mentorship = await Mentorship.findOneAndUpdate(
      { mentorId, menteeId, domain: domain || '' },
      {
        $setOnInsert: {
          mentorId,
          menteeId,
          domain: domain || '',
          status: 'pending',
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

    // Hard validation
    for (const ms of requests) {
      if (!ms.menteeId || !ms.mentorId) {
        console.error('Invalid mentorship record:', ms);
      }
    }

    // Preserve response shape expected by frontend (`req.mentee?.name`).
    const shaped = requests.map((ms) => ({
      _id: ms._id,
      mentee: ms.menteeId,
      mentor: ms.mentorId,
      domain: ms.domain,
      message: ms.message,
      status: ms.status,
      createdAt: ms.startedAt,
    }));
    return res.json({ requests: shaped });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentee lists their pending/price_set requests
 */
export const menteePendingRequests = async (req, res) => {
  try {
    const menteeId = req.user._id;
    const requests = await Mentorship.find({ 
      menteeId, 
      status: { $in: ['pending', 'price_set'] } 
    }).populate('mentorId', 'name email').sort({ startedAt: -1 });

    const shaped = requests.map((ms) => ({
      _id: ms._id,
      mentee: ms.menteeId,
      mentor: ms.mentorId,
      domain: ms.domain,
      message: ms.message,
      status: ms.status,
      coursePrice: ms.coursePrice,
      createdAt: ms.startedAt,
    }));
    return res.json({ requests: shaped });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentor accepts a request -> attach mentor to existing course + create Mentorship
 * params: reqId
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

    // Hard validation
    if (!mentorship.menteeId || !mentorship.mentorId) {
      console.error('Invalid mentorship record:', mentorship);
    }

    const normalizedDomain = mentorship.domain || '';

    // Strict link priority:
    // 1) exact mentor+mentee+domain
    // 2) mentee+domain with no mentor yet
    const course = await Course.findOne({
      $or: [{ mentee: mentorship.menteeId }, { menteeId: mentorship.menteeId }],
      domain: normalizedDomain,
      $and: [
        {
          $or: [
            { mentor: mentorId },
            { mentorId },
            { mentor: null },
            { mentor: { $exists: false } },
          ],
        },
      ],
    }).sort({ updatedAt: -1 });

    if (course) {
      course.mentor = mentorId;
      course.mentorId = mentorId;
      course.menteeId = mentorship.menteeId;
      await course.save();
    }

    mentorship.status = 'accepted';
    mentorship.startedAt = mentorship.startedAt || new Date();
    if (!Array.isArray(mentorship.levels) || mentorship.levels.length === 0) {
      mentorship.levels = ['beginner', 'intermediate', 'advanced', 'master'];
    }
    if (!mentorship.currentLevel) mentorship.currentLevel = 'beginner';
    if (typeof mentorship.progress !== 'number') mentorship.progress = 0;
    await mentorship.save();

    return res.json({ success: true, mentorship, courseId: course?._id || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentor sets course price
 */
export const setCoursePrice = async (req, res) => {
  try {
    const mentorId = req.user._id;
    const { reqId } = req.params;
    const { price } = req.body;

    if (!price || price <= 0) return res.status(400).json({ message: 'Price must be greater than zero' });

    const mentorship = await Mentorship.findById(reqId);
    if (!mentorship) return res.status(404).json({ message: 'Request not found' });
    if (String(mentorship.mentorId) !== String(mentorId)) return res.status(403).json({ message: 'Unauthorized' });

    mentorship.status = 'price_set';
    mentorship.coursePrice = price;
    await mentorship.save();

    return res.json({ success: true, mentorship });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const acceptAndPayRequest = async (req, res) => {
  try {
    const menteeId = req.user._id;
    const { reqId } = req.params;

    const mentorship = await Mentorship.findById(reqId);
    if (!mentorship) return res.status(404).json({ message: 'Request not found' });
    if (String(mentorship.menteeId) !== String(menteeId)) return res.status(403).json({ message: 'Unauthorized' });
    if (mentorship.status !== 'price_set') return res.status(400).json({ message: 'Request not ready for payment' });

    // Idempotency: Protect against Double Click payments
    const Transaction = (await import('../models/Transaction.js')).default;
    const existing = await Transaction.findOne({
      userId: menteeId,
      referenceId: String(mentorship._id),
      reason: 'course_purchase',
      status: 'completed'
    });

    if (existing) {
      return res.status(400).json({ message: 'Already paid' });
    }

    const { processTransfer } = await import('../services/walletService.js');
    try {
      // Execute the audited transfer with integer conversions inside
      await processTransfer(
        menteeId, 
        mentorship.mentorId, 
        mentorship.coursePrice, 
        'course_purchase', 
        String(mentorship._id),
        menteeId,           // actorId
        'mentee'            // actorRole
      );
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ message: 'Insufficient points' });
      throw err;
    }

    // Now link to course and activate mentorship
    const normalizedDomain = mentorship.domain || '';
    const course = await Course.findOne({
      $or: [{ mentee: mentorship.menteeId }, { menteeId: mentorship.menteeId }],
      domain: normalizedDomain,
      $and: [
        {
          $or: [
            { mentor: mentorship.mentorId },
            { mentorId: mentorship.mentorId },
            { mentor: null },
            { mentor: { $exists: false } },
          ],
        },
      ],
    }).sort({ updatedAt: -1 });

    if (course) {
      course.mentor = mentorship.mentorId;
      course.mentorId = mentorship.mentorId;
      course.menteeId = mentorship.menteeId;
      await course.save();
    }

    // Status lock: Mentorship requests become "accepted" to signal the payment is Complete 
    // AND the course is now Active. (Using 'completed' marks the whole learning journey finished).
    mentorship.status = 'accepted';
    mentorship.startedAt = mentorship.startedAt || new Date();
    if (!Array.isArray(mentorship.levels) || mentorship.levels.length === 0) {
      mentorship.levels = ['beginner', 'intermediate', 'advanced', 'master'];
    }
    if (!mentorship.currentLevel) mentorship.currentLevel = 'beginner';
    if (typeof mentorship.progress !== 'number') mentorship.progress = 0;
    await mentorship.save();

    return res.json({ success: true, mentorship, courseId: course?._id || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentor rejects
 */
export const rejectRequest = async (req, res) => {
  try {
    const mentorId = req.user._id;
    const { reqId } = req.params;

    const mentorship = await Mentorship.findById(reqId);
    if (!mentorship) return res.status(404).json({ message: 'Request not found' });
    if (String(mentorship.mentorId) !== String(mentorId)) return res.status(403).json({ message: 'Not your request' });

    // Only statuses allowed: pending/accepted/completed. Reject removes pending request.
    await Mentorship.deleteOne({ _id: mentorship._id, status: 'pending' });

    return res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
