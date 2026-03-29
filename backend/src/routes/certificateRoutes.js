import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import { getCertificate } from '../controllers/certificateController.js';

const router = express.Router();

router.get('/:courseId', protect, requireRole('mentee'), getCertificate);

export default router;
