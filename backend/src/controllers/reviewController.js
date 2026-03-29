import mongoose from 'mongoose';
import Review from '../models/Review.js';
import Mentorship from '../models/Mentorship.js';
import Course from '../models/Course.js';

/**
 * Create a mentor review.
 * Enforces: mentee can review ONLY after mentorship.status === 'completed'
 */
export const createReview = async (req, res) => {
  try {
    const menteeId = req.user?._id;
    const { mentorshipId, rating, reviewText } = req.body || {};

    if (!mentorshipId) {
      return res.status(400).json({ message: 'mentorshipId is required' });
    }

    const ms = await Mentorship.findById(mentorshipId);
    if (!ms) return res.status(404).json({ message: 'Mentorship not found' });

    if (!menteeId || String(ms.menteeId) !== String(menteeId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const linkedCourse = await Course.findOne({ mentorshipId: ms._id }).select(
      'status progress certificateIssued'
    );
    const courseComplete =
      linkedCourse &&
      (linkedCourse.status === 'completed' ||
        (linkedCourse.progress >= 100 && linkedCourse.certificateIssued === true));

    if (ms.status !== 'completed' && !courseComplete) {
      return res.status(403).json({
        message: 'Complete your course or mentorship before reviewing your mentor',
      });
    }

    const parsedRating = Number(rating);
    if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ message: 'rating must be a number between 1 and 5' });
    }

    const existing = await Review.findOne({ mentorshipId: ms._id, menteeId });
    if (existing) {
      return res.status(409).json({ message: 'Review already exists for this mentorship' });
    }

    const review = await Review.create({
      mentorshipId: ms._id,
      mentorId: ms.mentorId,
      menteeId: ms.menteeId,
      rating: parsedRating,
      reviewText: reviewText ?? '',
    });

    return res.status(201).json({ message: 'Review created', review });
  } catch (err) {
    console.error('createReview failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/review/mentor/:mentorId (also mounted at /api/reviews/mentor/:mentorId)
 * Average rating + recent reviews (no mentee PII).
 */
/**
 * GET /api/reviews/for-mentorship/:mentorshipId
 * Current mentee's review for a mentorship (if any).
 */
export const getMyReviewForMentorship = async (req, res) => {
  try {
    const { mentorshipId } = req.params;
    const menteeId = req.user._id;
    if (!mentorshipId || !mongoose.Types.ObjectId.isValid(mentorshipId)) {
      return res.status(400).json({ message: 'Invalid mentorship id' });
    }
    const ms = await Mentorship.findById(mentorshipId).select('menteeId').lean();
    if (!ms) return res.status(404).json({ message: 'Mentorship not found' });
    if (String(ms.menteeId) !== String(menteeId)) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const review = await Review.findOne({ mentorshipId, menteeId })
      .select('rating reviewText createdAt')
      .lean();
    return res.json({ review: review || null });
  } catch (err) {
    console.error('getMyReviewForMentorship failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getMentorReviews = async (req, res) => {
  try {
    const { mentorId } = req.params;
    if (!mentorId || !mongoose.Types.ObjectId.isValid(mentorId)) {
      return res.status(400).json({ message: 'Invalid mentor id' });
    }

    const reviews = await Review.find({ mentorId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('rating reviewText createdAt')
      .lean();

    const totalReviews = reviews.length;
    const avgRating =
      totalReviews > 0
        ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / totalReviews) * 10) / 10
        : 0;

    return res.json({
      avgRating,
      totalReviews,
      reviews: reviews.map((r) => ({
        rating: r.rating,
        reviewText: r.reviewText || '',
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error('getMentorReviews failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

