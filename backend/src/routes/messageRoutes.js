// backend/src/routes/messageRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import { getMessagesByMentorship } from '../controllers/messageController.js';

const router = express.Router();

// Get message history for a mentorship - protected
router.get('/:mentorshipId', protect, getMessagesByMentorship);

export default router;
