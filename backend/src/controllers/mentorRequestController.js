// backend/src/controllers/mentorRequestController.js
import MentorRequest from '../models/MentorRequest.js';
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

    const existing = await MentorRequest.findOne({ mentee: menteeId, mentor: mentorId, status: 'pending' });
    if (existing) return res.status(400).json({ message: 'You already have a pending request to this mentor' });

    const reqDoc = await MentorRequest.create({
      mentee: menteeId,
      mentor: mentorId,
      domain,
      message
    });

    return res.status(201).json({ message: 'Request sent', request: reqDoc });
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
    const requests = await MentorRequest.find({ mentor: mentorId, status: 'pending' })
      .populate('mentee', 'name email')
      .sort({ createdAt: -1 });
    return res.json({ requests });
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

    const reqDoc = await MentorRequest.findById(reqId);
    if (!reqDoc) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Ensure mentorId matches logged-in mentor
    if (reqDoc.mentor.toString() !== mentorId.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Find existing course created by mentee for this domain
    const course = await Course.findOne({
      mentee: reqDoc.mentee,
      domain: reqDoc.domain || ''
    });

    // Attach mentor to course if course exists
    if (course) {
      course.mentor = mentorId;
      await course.save();
    } else {
      // If no course exists, create one
      await Course.create({
        title: `${reqDoc.domain || 'Learning'} Course`,
        domain: reqDoc.domain || 'General',
        mentor: mentorId,
        mentee: reqDoc.mentee
      });
    }

    // Create or update mentorship (single source of truth)
    const mentorship = await Mentorship.findOneAndUpdate(
      {
        mentor: mentorId,
        mentee: reqDoc.mentee,
        domain: reqDoc.domain || ''
      },
      {
        mentor: mentorId,
        mentee: reqDoc.mentee,
        domain: reqDoc.domain || '',
        status: 'active',
        startedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Update request status
    reqDoc.status = 'accepted';
    reqDoc.respondedAt = new Date();
    await reqDoc.save();

    return res.json({ success: true, mentorship });
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

    const reqDoc = await MentorRequest.findById(reqId);
    if (!reqDoc) return res.status(404).json({ message: 'Request not found' });
    if (!reqDoc.mentor.equals(mentorId)) return res.status(403).json({ message: 'Not your request' });

    reqDoc.status = 'rejected';
    reqDoc.respondedAt = new Date();
    await reqDoc.save();

    return res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
