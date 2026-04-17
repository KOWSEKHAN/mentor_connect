import { getWallet } from '../services/walletService.js';
import Transaction from '../models/Transaction.js';
import Wallet      from '../models/Wallet.js';
import User        from '../models/User.js';
import mongoose    from 'mongoose';

// ─── shared role guard ────────────────────────────────────────────────────────
const requireWalletRole = (req, res) => {
  if (!['mentor', 'mentee'].includes(req.user?.role)) {
    res.status(403).json({ error: 'Wallet not accessible for this role' });
    return false;
  }
  return true;
};

// GET /api/wallet/me
export const getMyWallet = async (req, res) => {
  if (!requireWalletRole(req, res)) return;
  try {
    const wallet = await getWallet(req.user._id);
    res.json({
      wallet,
      walletPoints: wallet?.walletPoints ?? 0,
      rewardPoints: wallet?.rewardPoints ?? 0,
      lockedPoints: wallet?.lockedPoints ?? 0,
      balance:      wallet?.balance      ?? 0,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/wallet/transactions
export const getMyTransactions = async (req, res) => {
  if (!requireWalletRole(req, res)) return;
  try {
    const transactions = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/wallet/recharge  (creates Razorpay order — webhook completes the credit)
export const rechargeWallet = async (req, res) => {
  if (!requireWalletRole(req, res)) return;
  const session = await mongoose.startSession();
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });

    let transaction;
    await session.withTransaction(async () => {
      const result = await Transaction.create([{
        userId:      req.user._id,
        type:        'credit',
        amount:      Math.round(Number(amount) * 100),
        reason:      'recharge',
        referenceId: `recharge:${Date.now()}`,
        status:      'pending',
        actorId:     req.user._id,
        actorRole:   req.user.role,
      }], { session });
      transaction = result[0];
    });

    const currentWallet = await getWallet(req.user._id);
    res.json({ message: 'Recharge queued', balance: currentWallet.balance, transaction });
  } catch (err) {
    console.error('[RECHARGE]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    session.endSession();
  }
};

/**
 * POST /api/wallet/withdraw
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 1 of withdrawal flow: mentor requests a payout.
 *
 * What happens here:
 *  1. Validate role, amount, UPI details
 *  2. Block duplicate pending/processing withdrawals
 *  3. Store UPI + phone on User (used by admin approval later)
 *  4. Lock funds atomically: walletPoints → lockedPoints
 *  5. Create a pending Transaction
 *
 * ⚠️  NO Razorpay calls here — all Razorpay contact/fund_account/payout
 *     creation happens in adminController.approveWithdrawal so this endpoint
 *     works in development without live Razorpay credentials.
 */
export const withdrawFunds = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    console.log('[WITHDRAW] Request received', req.body);

    const { amount, upiId, phone } = req.body;

    // ── Input guards ──────────────────────────────────────────────────────────
    if (req.user.role !== 'mentor') {
      return res.status(403).json({ message: 'Only mentors can withdraw' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    if (!upiId || !String(upiId).includes('@')) {
      return res.status(400).json({ message: 'Valid UPI ID is required (e.g. name@upi)' });
    }
    if (!phone || String(phone).replace(/\D/g, '').length < 10) {
      return res.status(400).json({ message: 'Valid 10-digit phone number is required' });
    }

    // amount entered in rupees (or points as shown in UI), stored in paise
    const integerAmount = Math.round(Number(amount) * 100);

    if (integerAmount < 10000) {   // ₹100 minimum = 10000 paise
      return res.status(400).json({ message: 'Minimum withdrawal is ₹100 (enter 100 or more)' });
    }

    // ── Duplicate guard ───────────────────────────────────────────────────────
    const alreadyPending = await Transaction.findOne({
      userId: req.user._id,
      reason: 'withdrawal',
      status: { $in: ['pending', 'processing'] },
    });
    if (alreadyPending) {
      return res.status(400).json({ message: 'A withdrawal is already pending or processing. Wait for it to resolve first.' });
    }

    // ── Persist UPI + phone on User (no Razorpay here) ───────────────────────
    await User.findByIdAndUpdate(req.user._id, {
      $set: { upiId: String(upiId).trim(), phone: String(phone).trim() },
    });

    // ── Atomic lock + Transaction ─────────────────────────────────────────────
    let transaction;
    await session.withTransaction(async () => {
      const currentWallet = await Wallet.findOne({ userId: req.user._id }).session(session);
      if (!currentWallet) throw new Error('WALLET_NOT_FOUND');
      if (currentWallet.walletPoints < integerAmount) throw new Error('INSUFFICIENT_FUNDS');

      // Move walletPoints → lockedPoints atomically (optimistic lock)
      const wallet = await Wallet.findOneAndUpdate(
        { userId: req.user._id, walletPoints: { $gte: integerAmount }, __v: currentWallet.__v },
        { $inc: { walletPoints: -integerAmount, lockedPoints: integerAmount,
                  balance: -integerAmount, __v: 1 } },
        { new: true, session }
      );
      if (!wallet) throw new Error('OPTIMISTIC_LOCK_FAILED');

      const result = await Transaction.create([{
        userId:      req.user._id,
        type:        'debit',
        amount:      integerAmount,
        reason:      'withdrawal',
        referenceId: `wd_${req.user._id}_${Date.now()}`,
        status:      'pending',
        actorId:     req.user._id,
        actorRole:   req.user.role,
      }], { session });
      transaction = result[0];
    });

    const newWallet = await getWallet(req.user._id);
    console.log('[WITHDRAW] Success', { walletPoints: newWallet.walletPoints, lockedPoints: newWallet.lockedPoints });

    return res.status(200).json({
      message:      'Withdrawal request submitted. Awaiting admin approval.',
      walletPoints: newWallet.walletPoints,
      lockedPoints: newWallet.lockedPoints,
      transaction,
    });

  } catch (err) {
    const knownErrors = {
      WALLET_NOT_FOUND:      [404, 'Wallet not found'],
      INSUFFICIENT_FUNDS:    [400, 'Insufficient walletPoints balance'],
      OPTIMISTIC_LOCK_FAILED:[400, 'Concurrent update — please retry'],
    };
    const [status, message] = knownErrors[err.message] ?? [500, 'Server error'];
    if (status === 500) console.error('[WITHDRAW_ERROR]', err);
    return res.status(status).json({ message });
  } finally {
    session.endSession();
  }
};
