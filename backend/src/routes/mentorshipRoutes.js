// backend/src/routes/mentorshipRoutes.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, requireRole } from '../middleware/auth.js';

import {
  sendMentorRequest,
  listPendingRequests,
  acceptRequest,
  rejectRequest,
  setCoursePrice,
  acceptAndPayRequest,
  menteePendingRequests,
} from '../controllers/mentorRequestController.js';

import {
  mentorListMentees,
  menteeListMentors,
  updateProgress,
} from '../controllers/mentorshipController.js';

const router = express.Router();

// Rate limiter for critical financial actions
const criticalLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: 'Too many requests, please try again later.' },
});

// ── Mentee endpoints ──────────────────────────────────────────────────────────
router.post('/request',       protect, requireRole('mentee'), sendMentorRequest);
router.get('/my/requests',    protect, requireRole('mentee'), menteePendingRequests);
router.get('/my/mentors',     protect, requireRole('mentee'), menteeListMentors);

// Mentee: accept & pay for a priced request
router.post('/requests/:reqId/accept-and-pay',
  protect, criticalLimit, requireRole('mentee'), acceptAndPayRequest);

// ── Mentor endpoints ──────────────────────────────────────────────────────────
router.get('/requests',                  protect, requireRole('mentor'), listPendingRequests);
router.post('/requests/:reqId/accept',   protect, requireRole('mentor'), acceptRequest);
router.post('/requests/:reqId/reject',   protect, requireRole('mentor'), rejectRequest);
router.post('/requests/:reqId/set-price', protect, requireRole('mentor'), setCoursePrice);
router.get('/mentees',                   protect, requireRole('mentor'), mentorListMentees);
router.get('/mentor',                    protect, requireRole('mentor'), mentorListMentees);

// ── Shared ────────────────────────────────────────────────────────────────────
router.patch('/mentorship/:mentorshipId/progress',
  protect, requireRole('mentor'), updateProgress);

export default router;
