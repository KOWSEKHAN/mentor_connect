import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, requireRole } from '../middleware/auth.js';
import {
  sendMentorRequest,
  listPendingRequests,
  acceptRequest,
  rejectRequest,
  setCoursePrice,
  acceptAndPayRequest
} from '../controllers/mentorRequestController.js';
import { mentorListMentees } from '../controllers/mentorshipController.js';

const router = express.Router();

const criticalLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: 'Too many requests, please try again later.' }
});

// Mentee: send a request to a mentor
router.post('/request', protect, requireRole('mentee'), sendMentorRequest);

// Mentor: list pending requests
router.get('/requests', protect, requireRole('mentor'), listPendingRequests);

// Mentor accepts a request (free)
router.post('/requests/:reqId/accept', protect, requireRole('mentor'), acceptRequest);

// Mentor sets a price for a request
router.post('/requests/:reqId/set-price', protect, requireRole('mentor'), setCoursePrice);

// Mentee accepts and pays for the priced request
router.post('/requests/:reqId/accept-and-pay', protect, criticalLimit, requireRole('mentee'), acceptAndPayRequest);

// Mentor rejects a request
router.post('/requests/:reqId/reject', protect, requireRole('mentor'), rejectRequest);

// Mentor: list my active mentees
router.get('/mentees', protect, requireRole('mentor'), mentorListMentees);

export default router;
