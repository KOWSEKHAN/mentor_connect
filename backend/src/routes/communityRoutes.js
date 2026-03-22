import express from 'express';
import { protect } from '../middleware/auth.js';
import { getCommunityMessages } from '../controllers/communityController.js';

const router = express.Router();

router.get('/messages', protect, getCommunityMessages);

export default router;
