// src/controllers/menteeController.js
import User from '../models/User.js';
import Mentorship from '../models/Mentorship.js';
import Course from '../models/Course.js';

// mentor wants to see their mentees (example)
export const getMyMentees = async (req, res) => {
  try {
    // This is a placeholder: in a real app you'll store mentorship links in DB.
    // For demo return all mentees (or filter) — adapt to your models later.
    const mentees = await User.find({ role: 'mentee' }).select('-password');
    return res.json({ mentees });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getMyProfile = async (req, res) => {
  // returns req.user from middleware
  res.json({ user: req.user });
};

// GET /api/mentee/recommendations
// Returns mentors sorted by shared interests/expertise match (descending)
// Only shows mentors with at least 1 keyword match
export const getRecommendations = async (req, res) => {
  try {
    const menteeId = req.user?.id || req.user?._id;

    if (!menteeId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const mentee = await User.findById(menteeId).select('interests keywords role');
    if (!mentee || mentee.role !== 'mentee') {
      return res.status(404).json({ message: 'Mentee not found' });
    }

    // Use interests for mentee (fallback to keywords for backward compatibility)
    const menteeTerms = new Set([
      ...(mentee.interests || []).map((s) => s.toLowerCase()),
      ...(mentee.keywords || []).map((s) => s.toLowerCase())
    ]);

    if (!menteeTerms.size) {
      // If no interests/skills, return empty list (no recommendations)
      return res.json({ mentors: [] });
    }

    const mentors = await User.find({ role: 'mentor' })
      .select('name email resumeUrl resumeURL expertise keywords interests profilePhoto createdAt')
      .lean();

    const scoredMentors = mentors
      .map((mentor) => {
        // Use expertise for mentor (fallback to keywords/interests for backward compatibility)
        const mentorTerms = new Set([
          ...(mentor.expertise || []).map((s) => s.toLowerCase()),
          ...(mentor.keywords || []).map((s) => s.toLowerCase()),
          ...(mentor.interests || []).map((s) => s.toLowerCase())
        ]);

        // Calculate match score: intersection of mentee interests and mentor expertise
        let matchScore = 0;
        mentorTerms.forEach((term) => {
          if (menteeTerms.has(term)) matchScore += 1;
        });

        return {
          ...mentor,
          sharedInterestsCount: matchScore
        };
      })
      .filter((m) => m.sharedInterestsCount > 0) // Only show mentors with at least 1 match
      .sort((a, b) => b.sharedInterestsCount - a.sharedInterestsCount);

    return res.json({ mentors: scoredMentors });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get mentee's courses that are linked to accepted mentorships.
 * GET /api/mentee/courses
 */
export const getMenteeCourses = async (req, res) => {
  try {
    const menteeId = req.user._id;

    const mentorships = await Mentorship.find({
      menteeId,
      status: { $in: ['accepted', 'completed'] },
    }).select('mentorId');

    const mentorIds = mentorships
      .map((m) => m.mentorId)
      .filter(Boolean);

    const courseQuery = {
      $or: [
        { mentee: menteeId },
        { menteeId },
      ],
    };

    if (mentorIds.length > 0) {
      courseQuery.$and = [
        {
          $or: [
            { mentor: { $in: mentorIds } },
            { mentorId: { $in: mentorIds } },
          ],
        },
      ];
    }

    const courses = await Course.find(courseQuery)
      .populate('mentor', 'name email')
      .sort({ updatedAt: -1 });

    return res.json({ courses });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};