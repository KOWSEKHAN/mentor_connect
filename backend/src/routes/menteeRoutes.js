import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import { getRecommendations, getMenteeCourses } from '../controllers/menteeController.js';

const router = express.Router();

// Simple test route to verify mentee routes are wired correctly
// GET /api/mentee/test
router.get('/test', (req, res) => {
  res.json({ message: 'Mentee route OK' });
});

// GET /api/mentee/recommendations
router.get('/recommendations', protect, requireRole('mentee'), getRecommendations);

// GET /api/mentee/courses - mentee's courses backed by accepted mentorships
router.get('/courses', protect, requireRole('mentee'), getMenteeCourses);

export default router;

