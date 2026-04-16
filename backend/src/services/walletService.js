import mongoose from 'mongoose';
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';

const ensureWallet = async (userId, session) => {
  let wallet = await Wallet.findOne({ userId }).session(session);
  if (!wallet) {
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error(`User not found: ${userId}`);
    // Backward comp: Start at 0, or legacy points (0 here as requested strictly)
    wallet = await Wallet.create([{ userId, role: user.role, balance: 0, totalEarned: 0, totalSpent: 0 }], { session });
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

export const processCreditSafe = async (userId, amount, reason, referenceId, session, actorId = null, actorRole = null, status = 'completed') => {
  if (amount <= 0) throw new Error('Credit amount must be positive');
  
  // Floating point fix: force integers
  const integerAmount = Math.round(Number(amount) * 100);

  await ensureWallet(userId, session);

  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: integerAmount, totalEarned: integerAmount } },
    { new: true, session }
  );

  const transaction = await Transaction.create([{
    userId,
    type: 'credit',
    amount: integerAmount,
    reason,
    referenceId,
    status,
    actorId,
    actorRole,
  }], { session });

  return { wallet, transaction: transaction[0] };
};

export const processDebitSafe = async (userId, amount, reason, referenceId, session, actorId = null, actorRole = null, status = 'completed') => {
  if (amount <= 0) throw new Error('Debit amount must be positive');
  
  // Floating point fix: force integers
  const integerAmount = Math.round(Number(amount) * 100);

  const currentWallet = await ensureWallet(userId, session);
  if (currentWallet.balance < integerAmount) {
    throw new Error('INSUFFICIENT_FUNDS');
  }

  const wallet = await Wallet.findOneAndUpdate(
    { userId, balance: { $gte: integerAmount } },
    { $inc: { balance: -integerAmount, totalSpent: integerAmount } },
    { new: true, session }
  );

  if (!wallet) throw new Error('INSUFFICIENT_FUNDS');

  const transaction = await Transaction.create([{
    userId,
    type: 'debit',
    amount: integerAmount,
    reason,
    referenceId,
    status,
    actorId,
    actorRole,
  }], { session });

  return { wallet, transaction: transaction[0] };
};

// Atomic standalones
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

export const processTransfer = async (fromUserId, toUserId, amount, reason, referenceId, actorId = null, actorRole = null) => {
  const session = await mongoose.startSession();
  try {
    let result = {};
    await session.withTransaction(async () => {
      const integerAmount = Math.round(Number(amount) * 100);

      const wFrom = await ensureWallet(fromUserId, session);
      if (wFrom.balance < integerAmount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }
      const wTo = await ensureWallet(toUserId, session);

      // Wallet-level optimistic lock for Debit
      const walletFrom = await Wallet.findOneAndUpdate(
        { userId: fromUserId, __v: wFrom.__v, balance: { $gte: integerAmount } },
        { $inc: { balance: -integerAmount, totalSpent: integerAmount, __v: 1 } },
        { new: true, session }
      );
      if (!walletFrom) throw new Error('OPTIMISTIC_LOCK_FAILED_OR_INSUFFICIENT_FUNDS');

      // Wallet-level optimistic lock for Credit
      const walletTo = await Wallet.findOneAndUpdate(
        { userId: toUserId, __v: wTo.__v },
        { $inc: { balance: integerAmount, totalEarned: integerAmount, __v: 1 } },
        { new: true, session }
      );
      if (!walletTo) throw new Error('OPTIMISTIC_LOCK_FAILED_CREDIT');

      try {
        // Exactly-once debit/credit pair matching within same block
        const txns = await Transaction.create([{
          userId: fromUserId,
          type: 'debit',
          amount: integerAmount,
          reason,
          referenceId,
          status: 'completed',
          actorId,
          actorRole
        }, {
          userId: toUserId,
          type: 'credit',
          amount: integerAmount,
          reason: 'mentor_earning', // Credit reason explicitly split
          referenceId,
          status: 'completed',
          actorId,
          actorRole
        }], { session });

        result = { debit: walletFrom, credit: walletTo, transactions: txns };
      } catch (e) {
        if (e.code === 11000) throw new Error('ALREADY_PROCESSED');
        throw e;
      }
    });

    // Event emission after commit only 
    try {
      const { emitWalletUpdate } = await import('./eventService.js');
      emitWalletUpdate(fromUserId);
      emitWalletUpdate(toUserId);
    } catch(err) {
      // Optional event fail-safe
    }

    return result;
  } finally {
    session.endSession();
  }
};
