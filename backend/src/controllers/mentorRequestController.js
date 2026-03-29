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
