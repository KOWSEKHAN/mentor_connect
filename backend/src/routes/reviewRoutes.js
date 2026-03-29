import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import {
  createReview,
  getMentorReviews,
  getMyReviewForMentorship,
} from '../controllers/reviewController.js';

const router = express.Router();

router.post('/', protect, requireRole('mentee'), createReview);
router.get('/for-mentorship/:mentorshipId', protect, requireRole('mentee'), getMyReviewForMentorship);
router.get('/mentor/:mentorId', protect, getMentorReviews);

export default router;

