import crypto from 'crypto';
import mongoose from 'mongoose';
import razorpay from '../config/razorpay.js';
import { generateReceipt } from '../utils/generateReceipt.js';
import Transaction from '../models/Transaction.js';
import Wallet from '../models/Wallet.js';

export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });

    const integerAmount = Math.round(Number(amount) * 100); // Razorpay needs paise
    const receipt = generateReceipt(req.user._id);
    const order = await razorpay.orders.create({ amount: integerAmount, currency: 'INR', receipt });

    let transaction;
    await session.withTransaction(async () => {
      const txPayload = [{
        userId:      req.user._id,
        type:        'credit',
        amount:      integerAmount,
        reason:      'recharge',
        referenceId: order.id,
        status:      'pending',
        actorId:     req.user._id,
        actorRole:   req.user.role,
      }];
      const result = await Transaction.create(txPayload, { session });
      transaction = result[0];
    });

    res.json({ success: true, orderId: order.id, amount: order.amount, currency: order.currency, transaction });
  } catch (err) {
    console.error('[CREATE_ORDER_ERROR]', err);
    res.status(500).json({ message: 'Failed to create order', error: err.message });
  } finally {
    session.endSession();
  }
};

export const handleWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new Error('Missing RAZORPAY_WEBHOOK_SECRET');

    const generated_signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (generated_signature !== req.headers['x-razorpay-signature']) {
      return res.status(400).send('Invalid signature');
    }

    const event = req.body.event;

    // 1. RECHARGE FLOW — Part 3: credits walletPoints (real INR-backed money)
    if (event === 'payment.captured') {
      const orderId = req.body.payload.payment.entity.order_id;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const tx = await Transaction.findOne({ referenceId: orderId }).session(session);
          if (!tx || tx.status === 'completed') return; // Idempotency check

          const w = await Wallet.findOne({ userId: tx.userId }).session(session);

          // Part 3: Recharge → walletPoints (real money). balance kept in sync (legacy).
          await Wallet.updateOne(
            { userId: tx.userId, __v: w.__v },
            { $inc: { walletPoints: tx.amount, balance: tx.amount, totalEarned: tx.amount, __v: 1 } },
            { session }
          );

          tx.status = 'completed';
          await tx.save({ session });
        });
      } finally {
        session.endSession();
      }
    }

    // 2. WITHDRAWAL completion — Part 4: clear lockedPoints on success
    if (event === 'payout.processed') {
      const payoutId = req.body.payload.payout.entity.id;
      const session  = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const tx = await Transaction.findOne({ payoutRef: payoutId }).session(session);
          if (!tx || tx.status === 'completed') return; // idempotent

          // Part 4: Payout succeeded — clear locked balance
          await Wallet.findOneAndUpdate(
            { userId: tx.userId },
            { $inc: { lockedPoints: -tx.amount } },
            { session }
          );

          tx.status = 'completed';
          await tx.save({ session });
        });
      } finally {
        session.endSession();
      }
    }

    // 3. WITHDRAWAL failure — Part 4: refund lockedPoints → walletPoints
    if (event === 'payout.failed' || event === 'payout.rejected') {
      const payoutId = req.body.payload.payout.entity.id;
      const session  = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const tx = await Transaction.findOne({ payoutRef: payoutId }).session(session);
          if (!tx || tx.status === 'failed') return; // idempotent

          // Part 4: Payout failed — refund: lockedPoints → walletPoints
          await Wallet.findOneAndUpdate(
            { userId: tx.userId },
            { $inc: { walletPoints: tx.amount, lockedPoints: -tx.amount, balance: tx.amount } },
            { session }
          );

          tx.status = 'failed';
          await tx.save({ session });
        });
      } finally {
        session.endSession();
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[WEBHOOK_ERROR]', err);
    return res.status(500).json({ error: 'Server validation error' });
  }
};
