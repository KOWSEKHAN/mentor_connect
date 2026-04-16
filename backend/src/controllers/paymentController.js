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

    // razorpay singleton already initialised at startup
    const integerAmount = Math.round(Number(amount) * 100); // Razorpay needs paise

    const receipt = generateReceipt(req.user._id); // guaranteed ≤ 40 chars
    const order = await razorpay.orders.create({
      amount: integerAmount,
      currency: 'INR',
      receipt
    });

    let transaction;
    await session.withTransaction(async () => {
      // Create pending transaction mapped correctly to Integer balance logic
      const txPayload = [{
        userId: req.user._id,
        type: 'credit',
        amount: integerAmount, 
        reason: 'recharge',
        referenceId: order.id,
        status: 'pending',
        actorId: req.user._id,
        actorRole: req.user.role
      }];

      const result = await Transaction.create(txPayload, { session });
      transaction = result[0];
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      transaction
    });
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
    if (!secret) throw new Error("Missing RAZORPAY_WEBHOOK_SECRET");

    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (generated_signature !== req.headers["x-razorpay-signature"]) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body.event;

    // 1. RECHARGE FLOW COMPLETION
    if (event === "payment.captured") {
      const paymentEntity = req.body.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const tx = await Transaction.findOne({ referenceId: orderId }).session(session);
          if (!tx || tx.status === "completed") return; // Idempotency check

          const w = await Wallet.findOne({ userId: tx.userId }).session(session);
          
          await Wallet.updateOne(
            { userId: tx.userId, __v: w.__v },
            { $inc: { balance: tx.amount, totalEarned: tx.amount, __v: 1 } },
            { session }
          );

          tx.status = 'completed';
          await tx.save({ session });
        });
      } finally {
        session.endSession();
      }
    }

    // 2. WITHDRAWAL FLOW COMPLETION
    if (event === "payout.processed") {
      const payoutEntity = req.body.payload.payout.entity;
      const payoutId = payoutEntity.id;

      await Transaction.updateOne(
        { referenceId: payoutId, status: { $ne: 'completed' } },
        { $set: { status: 'completed' } }
      );
    }
    
    // Fallback/failure handlers
    if (event === "payout.failed" || event === "payout.rejected") {
       const payoutEntity = req.body.payload.payout.entity;
       const payoutId = payoutEntity.id;
       await Transaction.updateOne(
         { referenceId: payoutId },
         { $set: { status: 'failed' } }
       );
       // We're not refunding the wallet logic natively here yet without human approval logic, 
       // but marking it failed ensures strict accuracy.
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error('[WEBHOOK_ERROR]', err);
    return res.status(500).json({ error: 'Server validation error' });
  }
};
