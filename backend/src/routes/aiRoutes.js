// backend/src/routes/aiRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import { aiChat, generateContent, generateLevelContent, publishLevelContent, getCourseLevelContent } from '../controllers/aiController.js';

const router = express.Router();

router.post('/chat', protect, aiChat);
router.post('/generate-content', protect, generateContent);
router.post('/generate-level-content', protect, generateLevelContent);
router.post('/publish-level-content', protect, publishLevelContent);
router.get('/content/:courseId', protect, getCourseLevelContent);

export default router;

