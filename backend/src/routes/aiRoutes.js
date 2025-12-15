// backend/src/routes/aiRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import { aiChat, generateContent } from '../controllers/aiController.js';

const router = express.Router();

router.post('/chat', protect, aiChat);
router.post('/generate-content', protect, generateContent);

export default router;

