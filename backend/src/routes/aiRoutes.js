// backend/src/routes/aiRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  aiChat,
  generateLevelContent,
  streamGenerate,
  saveContent,
  publishContent,
  publishLevelContent,
  getCourseLevelContent,
  getVersionHistory,
  rateContent,
  getMetrics,
  getMentorMetrics,
} from '../controllers/aiController.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const aiGenerationLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 10, 
  message: { message: 'Too many generation requests, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ── Mentor AI actions ─────────────────────────────────────────────────── */
router.post('/chat',                      protect, aiGenerationLimiter, aiChat);
router.post('/generate-level-content',    protect, aiGenerationLimiter, generateLevelContent);  // sync
router.post('/stream-level-content',      protect, aiGenerationLimiter, streamGenerate);        // SSE streaming ← NEW
router.post('/content/:courseId',         protect, saveContent);
router.put('/content/:courseId/publish',  protect, publishContent);
router.patch('/content/:courseId/rate',   protect, rateContent);

/* ── Mentor / Admin read endpoints ────────────────────────────────────── */
router.get('/content/:courseId/history',  protect, getVersionHistory);
router.get('/metrics',                    protect, getMetrics);
router.get('/metrics/mentor/:mentorId',   protect, getMentorMetrics);  // ← NEW

/* ── Shared read ───────────────────────────────────────────────────────── */
router.get('/content/:courseId',          protect, getCourseLevelContent);

/* ── Legacy shim ───────────────────────────────────────────────────────── */
router.post('/publish-level-content',     protect, publishLevelContent);

export default router;
