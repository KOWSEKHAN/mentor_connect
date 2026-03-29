import express from 'express';
import { protect } from '../middleware/auth.js';
import { getPoints, getPointsSummary, spendPoints } from '../controllers/pointController.js';

const router = express.Router();

router.get('/', protect, getPoints);
router.get('/summary', protect, getPointsSummary);
router.post('/spend', protect, spendPoints);

export default router;
