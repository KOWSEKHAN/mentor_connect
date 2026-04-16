import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import {
  createRoadmap,
  getActiveRoadmap,
  updateRoadmap,
  generateRoadmapAI,
} from '../controllers/roadmapController.js';

const router = express.Router();

router.post('/create', protect, requireRole('mentor'), createRoadmap);
router.get('/:courseId/:menteeId', protect, getActiveRoadmap);
router.put('/update/:roadmapId', protect, requireRole('mentor'), updateRoadmap);
router.post('/generate-ai', protect, requireRole('mentor'), generateRoadmapAI);

export default router;
