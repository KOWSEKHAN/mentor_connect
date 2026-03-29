// backend/src/routes/mentorRoutes.js
import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import { searchMentors, getAllMentors, getMenteeWorkspace, getMentors, getMentorshipDetails } from '../controllers/mentorController.js';

const router = express.Router();

// Mentee-facing mentor discovery with aggregated ratings.
router.get('/', protect, requireRole('mentee'), getMentors);
router.get('/search', protect, requireRole('mentee'), searchMentors);
router.get('/all', protect, requireRole('mentee'), getAllMentors);
router.get('/workspace/:menteeId', protect, requireRole('mentor'), getMenteeWorkspace);
router.get('/mentee/:menteeId', protect, requireRole('mentor'), getMenteeWorkspace);
// Backward-compatible: allow mentor workspace by mentorship id.
router.get('/mentorship/:id', protect, requireRole('mentor'), getMentorshipDetails);

export default router;

