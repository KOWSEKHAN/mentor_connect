import mongoose from 'mongoose';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';

// ─── internal wallet factory ─────────────────────────────────────────────────
const ensureWallet = async (userId, session) => {
  let wallet = await Wallet.findOne({ userId }).session(session);
  if (!wallet) {
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error(`User not found: ${userId}`);
    if (!['mentor', 'mentee'].includes(user.role)) {
      throw new Error(`Wallet creation blocked: role '${user.role}' is not allowed`);
    }
    // Part 1+3: New wallets start with walletPoints:0, rewardPoints:0
    wallet = await Wallet.create([{
      userId,
      role: user.role,
      walletPoints: 0,   // real money — recharged via Razorpay
      rewardPoints: 0,   // virtual — granted by signup/milestones
      balance: 0,        // legacy mirror, kept for compat
      totalEarned: 0,
      totalSpent: 0,
    }], { session });
    wallet = wallet[0];
  }
  return wallet;
};

export const getWallet = async (userId) => {
  const session = await mongoose.startSession();
  let wallet;
  try {
    await session.withTransaction(async () => {
      wallet = await ensureWallet(userId, session);
    });
  } finally {
    session.endSession();
  }
  return wallet;
};

// ─── Part 3 + 9: walletPoints ONLY for real-money credit (Razorpay recharge) ─
export const processCreditSafe = async (
  userId, amount, reason, referenceId, session, actorId = null, actorRole = null, status = 'completed'
) => {
  if (amount <= 0) throw new Error('Credit amount must be positive');
  const integerAmount = Math.round(Number(amount) * 100);

  await ensureWallet(userId, session);

  // Part 3: Recharge credits walletPoints (real money), NOT rewardPoints
  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { walletPoints: integerAmount, balance: integerAmount, totalEarned: integerAmount } },
    { new: true, session }
  );

  const transaction = await Transaction.create([{
    userId, type: 'credit', amount: integerAmount, reason, referenceId, status, actorId, actorRole,
  }], { session });

  return { wallet, transaction: transaction[0] };
};

// ─── Part 5 + 9: walletPoints ONLY for debits (mentor payments) ──────────────
export const processDebitSafe = async (
  userId, amount, reason, referenceId, session, actorId = null, actorRole = null, status = 'completed'
) => {
  if (amount <= 0) throw new Error('Debit amount must be positive');
  const integerAmount = Math.round(Number(amount) * 100);

  const currentWallet = await ensureWallet(userId, session);

  // Part 5: ONLY walletPoints checked — rewardPoints cannot fund payments
  if (currentWallet.walletPoints < integerAmount) {
    throw new Error('INSUFFICIENT_FUNDS');
  }

  const wallet = await Wallet.findOneAndUpdate(
    { userId, walletPoints: { $gte: integerAmount } },
    { $inc: { walletPoints: -integerAmount, balance: -integerAmount, totalSpent: integerAmount } },
    { new: true, session }
  );

  if (!wallet) throw new Error('INSUFFICIENT_FUNDS');

  const transaction = await Transaction.create([{
    userId, type: 'debit', amount: integerAmount, reason, referenceId, status, actorId, actorRole,
  }], { session });

  return { wallet, transaction: transaction[0] };
};

// ─── Part 4: rewardPoints ONLY for virtual signup/milestone bonuses ───────────
// NEVER callable for financial operations — completely isolated from payment flow
export const creditRewardPointsSafe = async (
  userId, points, reason, referenceId, session, actorId = null, actorRole = null
) => {
  if (points <= 0) throw new Error('Reward points must be positive');
  const integerPoints = Math.round(Number(points));   // reward pts are not scaled (1 pt = 1 pt)

  await ensureWallet(userId, session);

  // Part 4: Credits ONLY rewardPoints — walletPoints untouched
  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { rewardPoints: integerPoints } },
    { new: true, session }
  );

  // Log as a separate transaction type for auditability
  const transaction = await Transaction.create([{
    userId, type: 'credit', amount: integerPoints, reason, referenceId, status: 'completed', actorId, actorRole,
  }], { session });

  return { wallet, transaction: transaction[0] };
};

// ─── Atomic standalones ───────────────────────────────────────────────────────
export const processCredit = async (userId, amount, reason, referenceId, actorId = null, actorRole = null) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await processCreditSafe(userId, amount, reason, referenceId, session, actorId, actorRole);
    });
    return result;
  } finally {
    session.endSession();
  }
};

export const creditRewardPoints = async (userId, points, reason, referenceId, actorId = null, actorRole = null) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await creditRewardPointsSafe(userId, points, reason, referenceId, session, actorId, actorRole);
    });
    return result;
  } finally {
    session.endSession();
  }
};

export const processDebit = async (userId, amount, reason, referenceId, actorId = null, actorRole = null) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await processDebitSafe(userId, amount, reason, referenceId, session, actorId, actorRole);
    });
    return result;
  } finally {
    session.endSession();
  }
};

// ─── Part 5: Transfer uses ONLY walletPoints (real money) ────────────────────
export const processTransfer = async (fromUserId, toUserId, amount, reason, referenceId, actorId = null, actorRole = null) => {
  const session = await mongoose.startSession();
  try {
    let result = {};
    await session.withTransaction(async () => {
      const integerAmount = Math.round(Number(amount) * 100);

      const wFrom = await ensureWallet(fromUserId, session);
      // Part 5 + 9: ONLY walletPoints — rewardPoints must NEVER fund payments
      if (wFrom.walletPoints < integerAmount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }
      const wTo = await ensureWallet(toUserId, session);

      // Optimistic lock debit from mentee walletPoints
      const walletFrom = await Wallet.findOneAndUpdate(
        { userId: fromUserId, __v: wFrom.__v, walletPoints: { $gte: integerAmount } },
        { $inc: { walletPoints: -integerAmount, balance: -integerAmount, totalSpent: integerAmount, __v: 1 } },
        { new: true, session }
      );
      if (!walletFrom) throw new Error('OPTIMISTIC_LOCK_FAILED_OR_INSUFFICIENT_FUNDS');

      // Optimistic lock credit to mentor walletPoints
      const walletTo = await Wallet.findOneAndUpdate(
        { userId: toUserId, __v: wTo.__v },
        { $inc: { walletPoints: integerAmount, balance: integerAmount, totalEarned: integerAmount, __v: 1 } },
        { new: true, session }
      );
      if (!walletTo) throw new Error('OPTIMISTIC_LOCK_FAILED_CREDIT');

      try {
        const txns = await Transaction.create([{
          userId: fromUserId, type: 'debit', amount: integerAmount,
          reason, referenceId, status: 'completed', actorId, actorRole,
        }, {
          userId: toUserId, type: 'credit', amount: integerAmount,
          reason: 'mentor_earning', referenceId, status: 'completed', actorId, actorRole,
        }], { session });

        result = { debit: walletFrom, credit: walletTo, transactions: txns };
      } catch (e) {
        if (e.code === 11000) throw new Error('ALREADY_PROCESSED');
        throw e;
      }
    });

    // Post-commit event emission (best-effort)
    try {
      const { emitWalletUpdate } = await import('./eventService.js');
      emitWalletUpdate(fromUserId);
      emitWalletUpdate(toUserId);
    } catch (_) {}

    return result;
  } finally {
    session.endSession();
  }
};
