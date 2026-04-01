import express from 'express';
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

router.get('/:mentorshipId/state', protect, getStructuredState);
router.get('/:mentorshipId/content', protect, getLevelContent);
router.post('/:mentorshipId/content', protect, upsertLevelContent);
router.get('/:mentorshipId/tasks', protect, getLevelTasks);
router.post('/:mentorshipId/tasks', protect, createLevelTask);
router.patch('/tasks/:taskId/toggle', protect, toggleTaskCompletion);

export default router;
