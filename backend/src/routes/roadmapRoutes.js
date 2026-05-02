// backend/src/routes/roadmapRoutes.js
import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import {
  getCourseRoadmap,
  updateRoadmapStep,
  activateRoadmapVersion,
} from '../controllers/roadmapController.js';

/**
 * Non-AI roadmap operations (read, step edit, version switch).
 * AI roadmap generation lives in roadmapRoutesV2.js (/api/roadmap/v2/generate-ai).
 *
 * REMOVED:
 *   POST /generate          — was generateRoadmap()   (blank 4-step duplicate)
 *   POST /regenerate/:id    — was regenerateRoadmap() (identical duplicate)
 */
const router = express.Router();

router.get('/:courseId',              protect,                    getCourseRoadmap);
router.put('/step/:stepId',           protect, requireRole('mentor'), updateRoadmapStep);
router.put('/activate/:roadmapId',    protect, requireRole('mentor'), activateRoadmapVersion);

export default router;
