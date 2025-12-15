// src/routes/protectedRoutes.js
import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import { getMyMentees, getMyProfile } from "../controllers/menteeController.js";

const router = express.Router();

// any authenticated user: profile
router.get('/me', protect, getMyProfile);

// mentor-only endpoint
router.get('/mentor/mentees', protect, requireRole('mentor'), getMyMentees);

// add more protected endpoints here

export default router;
