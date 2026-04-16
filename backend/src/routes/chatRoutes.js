// backend/src/routes/chatRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import { getChatHistory } from '../controllers/chatController.js';

const router = express.Router();

router.get('/:courseId', protect, getChatHistory);

export default router;
