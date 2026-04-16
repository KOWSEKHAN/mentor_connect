import express from 'express';
import { protect } from '../middleware/auth.js';
import { createOrder, handleWebhook } from '../controllers/paymentController.js';

const router = express.Router();

// Protected Payment Route for generating Orders (Recharge)
router.post('/create-order', protect, createOrder);

// Public Webhook (verified internally via HMAC signature)
router.post('/webhook', handleWebhook);

export default router;
