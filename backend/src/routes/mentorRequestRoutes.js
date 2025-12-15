// backend/src/routes/mentorRequestRoutes.js
import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import {
  sendMentorRequest,
  listPendingRequests,
  acceptRequest,
  rejectRequest
} from '../controllers/mentorRequestController.js';
import { mentorListMentees } from '../controllers/mentorshipController.js';

const router = express.Router();

// Mentee: send a request to a mentor
router.post('/request', protect, requireRole('mentee'), sendMentorRequest);

// Mentor: list pending requests
router.get('/requests', protect, requireRole('mentor'), listPendingRequests);

// Mentor accepts a request
router.post('/requests/:reqId/accept', protect, requireRole('mentor'), acceptRequest);

// Mentor rejects a request
router.post('/requests/:reqId/reject', protect, requireRole('mentor'), rejectRequest);

// Mentor: list my active mentees
router.get('/mentees', protect, requireRole('mentor'), mentorListMentees);

export default router;
