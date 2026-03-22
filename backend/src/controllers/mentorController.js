// backend/src/controllers/mentorController.js
import User from '../models/User.js';

/**
 * Search/recommend mentors by domain
 * GET /api/mentors/search?q=domain
 */
export const searchMentors = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.json({ mentors: [] });
    }
    
    // Search mentors by domain (assuming domain is stored in a field or we search by name)
    // For now, we'll return all mentors and filter by domain if they have expertise
    // In a real app, you'd have an expertise/domain field in User model
    const mentors = await User.find({ role: 'mentor' })
      .select('name email')
      .limit(20);
    
    // Filter by query (name or domain match)
    // Since we don't have domain field, we'll return all mentors for now
    // You can enhance this by adding expertise field to User model
    const filtered = mentors.filter(m => 
      m.name.toLowerCase().includes(q.toLowerCase())
    );
    
    // Map to include domain (using a default or from mentorship data)
    const results = filtered.map(m => ({
      _id: m._id,
      name: m.name,
      email: m.email,
      domain: q // Use search query as domain for now
    }));
    
    return res.json({ mentors: results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get all mentors with pagination
 * GET /api/mentors/all?page=<number>&limit=<number>
 */
export const getAllMentors = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Get total count
    const total = await User.countDocuments({ role: 'mentor' });

    // Get mentors with pagination, sorted by createdAt (latest first)
    const mentors = await User.find({ role: 'mentor' })
      .select('name email createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    return res.json({
      mentors,
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mentor workspace view for a specific mentee
 * GET /api/mentor/workspace/:menteeId
 */
export const getMenteeWorkspace = async (req, res) => {
  try {
    const { menteeId } = req.params;
    const mentorId = req.user._id;
    
    if (!menteeId) {
      return res.status(400).json({ success: false, message: 'Mentee ID is required' });
    }

    const mentee = await User.findById(menteeId).select('-password');
    if (!mentee || mentee.role !== 'mentee') {
      return res.status(404).json({ success: false, message: 'Mentee not found' });
    }

    // Find active mentorship
    const Mentorship = (await import('../models/Mentorship.js')).default;
    const mentorship = await Mentorship.findOne({
      mentor: mentorId,
      mentee: menteeId,
      status: 'active'
    }).populate('mentee', 'name email').populate('mentor', 'name email');

    // Find course for this mentorship
    const Course = (await import('../models/Course.js')).default;
    const course = await Course.findOne({
      mentor: mentorId,
      mentee: menteeId
    }).populate('mentor', 'name email').populate('mentee', 'name email');

    return res.json({
      success: true,
      mentee,
      mentorship: mentorship ? {
        _id: mentorship._id,
        mentorshipId: mentorship._id.toString(),
        domain: mentorship.domain,
        progress: mentorship.progress,
        status: mentorship.status
      } : null,
      course: course ? course.toObject() : null,
      notes: course?.notes || '',
      progress: mentorship?.progress || course?.progress || 0,
      status: mentorship?.status || 'active'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

