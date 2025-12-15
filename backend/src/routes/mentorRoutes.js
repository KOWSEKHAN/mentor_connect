// backend/src/routes/mentorRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import { searchMentors, getAllMentors, getMenteeWorkspace } from '../controllers/mentorController.js';

const router = express.Router();

router.get('/search', protect, searchMentors);
router.get('/all', protect, getAllMentors);
router.get('/workspace/:menteeId', protect, getMenteeWorkspace);
router.get('/mentee/:menteeId', protect, getMenteeWorkspace);

export default router;

