// backend/src/routes/courseRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getMyCourses,
  getCourse,
  updateCourse,
  createCourse,
  startCourse,
  assignMentorToCourse
} from '../controllers/courseController.js';

const router = express.Router();

router.get('/me', protect, getMyCourses);
router.get('/:courseId', protect, getCourse);
router.patch('/:courseId', protect, updateCourse);
router.patch('/:courseId/assign-mentor', protect, assignMentorToCourse);
router.post('/', protect, createCourse);
router.post('/start', protect, startCourse);

export default router;

