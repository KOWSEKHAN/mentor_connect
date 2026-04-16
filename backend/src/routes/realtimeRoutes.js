import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, requireRole } from '../middleware/auth.js';
import {
  syncRealtime,
  getRealtimeMetrics,
  getOpsDashboard,
  getEventTimeline,
  exportCourseState,
  getStateAtVersion,
  replayEventToRoom,
} from '../controllers/realtimeController.js';

const router = express.Router();

const syncLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const exportLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/sync', syncLimiter, protect, syncRealtime);
router.get('/metrics', protect, getRealtimeMetrics);
router.get('/dashboard', protect, requireRole('mentor'), getOpsDashboard);
router.get('/timeline/:courseId', protect, getEventTimeline);
router.get('/export', exportLimiter, protect, exportCourseState);
router.get('/state-at-version', exportLimiter, protect, getStateAtVersion);
router.post('/replay', exportLimiter, protect, requireRole('mentor'), replayEventToRoom);

export default router;
