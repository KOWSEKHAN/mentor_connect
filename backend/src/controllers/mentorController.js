// backend/src/controllers/mentorController.js
import User from '../models/User.js';
import Review from '../models/Review.js';

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
      .limit(limit)
      .lean();

    const reviewAgg = await Review.aggregate([
      {
        $group: {
          _id: '$mentorId',
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]);
    const aggMap = {};
    for (const row of reviewAgg) {
      aggMap[row._id.toString()] = {
        rating: Number.isFinite(row.avgRating) ? Math.round(row.avgRating * 10) / 10 : 0,
        totalReviews: row.totalReviews || 0,
      };
    }

    const mentorsWithRatings = mentors.map((m) => {
      const agg = aggMap[m._id.toString()] || { rating: 0, totalReviews: 0 };
      return {
        ...m,
        rating: agg.rating,
        totalReviews: agg.totalReviews,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return res.json({
      mentors: mentorsWithRatings,
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
 * Mentee-facing mentor discovery.
 * GET /api/mentors
 *
 * Returns:
 * - name
 * - mentor_id
 * - rating (avg)
 * - totalReviews
 */
export const getMentors = async (req, res) => {
  try {
    const mentors = await User.find({ role: 'mentor' })
      .select('_id name createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const reviewAgg = await Review.aggregate([
      {
        $group: {
          _id: '$mentorId',
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    const aggMap = {};
    for (const row of reviewAgg) {
      const key = row._id.toString();
      aggMap[key] = {
        rating: Number.isFinite(row.avgRating) ? Math.round(row.avgRating * 10) / 10 : 0,
        totalReviews: row.totalReviews || 0,
      };
    }

    const results = mentors.map((m) => {
      const agg = aggMap[m._id.toString()] || { rating: 0, totalReviews: 0 };
      return {
        mentor_id: m._id.toString(),
        name: m.name,
        rating: agg.rating,
        totalReviews: agg.totalReviews,
      };
    });

    return res.json({ mentors: results });
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
      console.log('[mentorWorkspace] byMentee:menteeNotFound', { menteeId });
      return res.status(404).json({ success: false, message: 'Mentee not found' });
    }

    // Find active mentorship
    const Mentorship = (await import('../models/Mentorship.js')).default;
    let mentorship = await Mentorship.findOne({
      mentorId,
      menteeId,
      status: 'accepted'
    }).populate('menteeId', 'name email').populate('mentorId', 'name email');

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
      status: mentorship?.status || null
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Mentor workspace view by mentorship id (backward-compatible addition).
 * GET /api/mentor/mentorship/:id
 */
export const getMentorshipDetails = async (req, res) => {
  try {
    const mentorId = req.user._id;
    const { id } = req.params;

    const Mentorship = (await import('../models/Mentorship.js')).default;
    const Course = (await import('../models/Course.js')).default;

    const mentorship = await Mentorship.findById(id)
      .populate('menteeId', 'name email')
      .populate('mentorId', 'name email');

    if (!mentorship) {
      return res.status(404).json({ message: 'Mentorship not found' });
    }

    if (String(mentorship.mentorId?._id || mentorship.mentorId) !== String(mentorId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const menteeUser = mentorship.menteeId?._id ? mentorship.menteeId : await User.findById(mentorship.menteeId).select('-password');
    if (!menteeUser) {
      console.log('[mentorWorkspace] byMentorship:menteeNotFound', {
        mentee: mentorship.menteeId?.toString?.() || mentorship.menteeId,
      });
      return res.status(404).json({ message: 'Mentee not found' });
    }

    const course = await Course.findOne({
      mentor: mentorship.mentorId?._id || mentorship.mentorId,
      mentee: mentorship.menteeId?._id || mentorship.menteeId,
    }).populate('mentor', 'name email').populate('mentee', 'name email');

    return res.json({
      success: true,
      _id: mentorship._id,
      mentor: mentorship.mentorId,
      mentee: mentorship.menteeId,
      status: mentorship.status,
      domain: mentorship.domain,
      progress: mentorship.progress ?? course?.progress ?? 0,
      course: course ? course.toObject() : null,
      notes: course?.notes || '',
    });
  } catch (err) {
    console.error('getMentorshipDetails failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

