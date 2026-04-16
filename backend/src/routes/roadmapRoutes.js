import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import {
  generateRoadmap,
  getCourseRoadmap,
  regenerateRoadmap,
  updateRoadmapStep,
  activateRoadmapVersion,
} from '../controllers/roadmapController.js';

const router = express.Router();

router.post('/generate', protect, requireRole('mentor'), generateRoadmap);
router.get('/:courseId', protect, getCourseRoadmap);
router.put('/step/:stepId', protect, requireRole('mentor'), updateRoadmapStep);
router.post('/regenerate/:courseId', protect, requireRole('mentor'), regenerateRoadmap);
router.put('/activate/:roadmapId', protect, requireRole('mentor'), activateRoadmapVersion);

export default router;
