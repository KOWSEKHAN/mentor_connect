import { getWallet, processCreditSafe, processDebitSafe } from '../services/walletService.js';
import Transaction from '../models/Transaction.js';
import Wallet from '../models/Wallet.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import razorpay from '../config/razorpay.js';

export const getMyWallet = async (req, res) => {
  try {
    const wallet = await getWallet(req.user._id);
    res.json({ wallet });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const getMyTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const rechargeWallet = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });

    let transaction;
    await session.withTransaction(async () => {
      // 6. Recharge = Fake UI (Danger)
      // Do NOT credit immediately. Just register a pending transaction.
      const txPayload = [{
        userId: req.user._id,
        type: 'credit',
        amount: Math.round(Number(amount) * 100), // Scale to int
        reason: 'recharge',
        referenceId: `recharge:${Date.now()}`,
        status: 'pending',
        actorId: req.user._id,
        actorRole: req.user.role
      }];
      const result = await Transaction.create(txPayload, { session });
      transaction = result[0];
    });

    const currentWallet = await getWallet(req.user._id);
    res.json({ message: 'Recharge queued for approval', balance: currentWallet.balance, transaction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    session.endSession();
  }
};

export const withdrawFunds = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { amount, upiId, phone } = req.body;
    if (req.user.role !== 'mentor') return res.status(403).json({ message: 'Only mentors can withdraw' });
    if (!amount || amount < 100) return res.status(400).json({ message: 'Minimum withdrawal amount is 100 pts' });
    if (!upiId || !phone) return res.status(400).json({ message: 'UPI ID and Phone number are required for withdrawal payloads' });

    // Ensure user has saved info
    await User.findByIdAndUpdate(req.user._id, { $set: { upiId, phone } });

    let transaction;
    let payoutResult;
    
    // razorpay singleton already initialised at startup
    const contact = await razorpay.contacts.create({
      name: req.user.name,
      email: req.user.email,
      contact: phone,
      type: "vendor"
    });

    const fundAccount = await razorpay.fund_accounts.create({
      contact_id: contact.id,
      account_type: "vpa",
      vpa: {
        address: upiId
      }
    });

    const integerAmount = Math.round(Number(amount) * 100);

    const payout = await razorpay.payouts.create({
      account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
      fund_account_id: fundAccount.id,
      amount: integerAmount, 
      currency: "INR",
      mode: "UPI",
      purpose: "payout"
    });

    // Payout instance created safely, now lock funds transactionally
    await session.withTransaction(async () => {
      // 3. Withdrawal Double Request Protection
      const existing = await Transaction.findOne({
        userId: req.user._id,
        reason: 'withdrawal',
        status: { $in: ['pending', 'processing'] }
      }).session(session);

      if (existing) {
        throw new Error('WITHDRAWAL_ALREADY_PENDING');
      }

      const currentWallet = await Wallet.findOne({ userId: req.user._id }).session(session);
      
      if (!currentWallet || currentWallet.balance < integerAmount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // Freeze funds safely from wallet
      const wallet = await Wallet.findOneAndUpdate(
        { userId: req.user._id, balance: { $gte: integerAmount }, __v: currentWallet.__v },
        { $inc: { balance: -integerAmount, totalSpent: integerAmount, __v: 1 } },
        { new: true, session }
      );
      if (!wallet) throw new Error('OPTIMISTIC_LOCK_OR_INSUFFICIENT_FUNDS');

      // 5. Withdrawal Safety (status: processing) mapped to Payout Reference
      const txPayload = [{
        userId: req.user._id,
        type: 'debit',
        amount: integerAmount,
        reason: 'withdrawal',
        referenceId: payout.id,
        status: 'processing',
        payoutRef: payout.id, // Full traceability
        actorId: req.user._id,
        actorRole: req.user.role
      }];
      const result = await Transaction.create(txPayload, { session });
      transaction = result[0];
    });

    const newWallet = await getWallet(req.user._id);
    res.json({ message: 'Withdrawal processing started via UPI!', balance: newWallet.balance, transaction });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ message: 'Insufficient funds' });
    if (err.message === 'WITHDRAWAL_ALREADY_PENDING') return res.status(400).json({ message: 'Withdrawal already pending' });
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    session.endSession();
  }
};
