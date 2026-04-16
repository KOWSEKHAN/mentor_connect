import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/auth.js';
import {
  getStructuredState,
  getLevelContent,
  upsertLevelContent,
  getLevelTasks,
  createLevelTask,
  toggleTaskCompletion,
} from '../controllers/structuredLearningController.js';

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const toggleLimiter = rateLimit({
  windowMs: 60_000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:mentorshipId/state', protect, getStructuredState);
router.get('/:mentorshipId/content', protect, getLevelContent);
router.post('/:mentorshipId/content', writeLimiter, protect, upsertLevelContent);
router.get('/:mentorshipId/tasks', protect, getLevelTasks);
router.post('/:mentorshipId/tasks', writeLimiter, protect, createLevelTask);
router.patch('/tasks/:taskId/toggle', toggleLimiter, protect, toggleTaskCompletion);

export default router;
