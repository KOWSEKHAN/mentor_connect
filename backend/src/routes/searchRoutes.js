// backend/src/routes/searchRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  searchCourseAndDomain,
  searchMentorByName
} from '../controllers/courseController.js';

const router = express.Router();

router.get('/course', protect, searchCourseAndDomain);
router.get('/mentor', protect, searchMentorByName);

export default router;



