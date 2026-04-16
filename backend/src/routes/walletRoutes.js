import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/auth.js';
import { getMyWallet, getMyTransactions, rechargeWallet, withdrawFunds } from '../controllers/walletController.js';

const router = express.Router();

const criticalLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { message: 'Too many requests, please try again later.' }
});

router.get('/me', protect, getMyWallet);
router.get('/transactions', protect, getMyTransactions);
router.post('/recharge', protect, criticalLimit, rechargeWallet);
router.post('/withdraw', protect, criticalLimit, withdrawFunds);

export default router;
