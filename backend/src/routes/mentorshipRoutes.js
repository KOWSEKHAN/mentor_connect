// backend/src/routes/mentorshipRoutes.js
import express from 'express';
import { protect, requireRole } from '../middleware/auth.js';
import {
  sendMentorRequest,
  listPendingRequests,
  acceptRequest,
  rejectRequest
} from '../controllers/mentorRequestController.js';

import {
  mentorListMentees,
  menteeListMentors,
  updateProgress
} from '../controllers/mentorshipController.js';

const router = express.Router();

// Mentee endpoints
router.post('/request', protect, requireRole('mentee'), sendMentorRequest);
router.get('/my/mentors', protect, requireRole('mentee'), menteeListMentors);

// Mentor endpoints
router.get('/requests', protect, requireRole('mentor'), listPendingRequests);
router.post('/requests/:reqId/accept', protect, requireRole('mentor'), acceptRequest);
router.post('/requests/:reqId/reject', protect, requireRole('mentor'), rejectRequest);
router.get('/mentees', protect, requireRole('mentor'), mentorListMentees);
// Alternative route for mentor mentees
router.get('/mentor', protect, requireRole('mentor'), mentorListMentees);

// Update progress (mentor)
router.patch('/mentorship/:mentorshipId/progress', protect, requireRole('mentor'), updateProgress);

export default router;
