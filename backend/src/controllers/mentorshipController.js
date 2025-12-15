// backend/src/controllers/mentorshipController.js
import Mentorship from '../models/Mentorship.js';
import User from '../models/User.js';

/**
 * Mentor: list their mentees
 * GET /api/mentorship/mentees or /api/mentorships/mentor
 */
export const mentorListMentees = async (req, res) => {
  try {
    const mentorId = req.user._id;
    const { status = 'active' } = req.query;

    const statusFilter = (() => {
      if (status === 'all') return { $in: ['active', 'completed'] };
      if (status === 'completed') return 'completed';
      return 'active';
    })();

    // Find mentorships with mentor matching logged-in mentor and status filter
    const list = await Mentorship.find({ mentor: mentorId, status: statusFilter })
      .populate('mentee', 'name email')
      .populate('mentor', 'name')
      .sort({ startedAt: -1 });
    
    return res.json({ mentees: list });
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
    const list = await Mentorship.find({ mentee: menteeId, status: 'active' })
      .populate('mentor', 'name email')
      .sort({ startedAt: -1 });
    return res.json({ mentors: list });
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
    if (!ms.mentor.equals(mentorId)) return res.status(403).json({ message: 'Not allowed' });

    ms.progress = Math.max(0, Math.min(100, Number(progress || ms.progress)));
    await ms.save();

    return res.json({ message: 'Progress updated', mentorship: ms });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
