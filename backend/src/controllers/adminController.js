/**
 * adminController.js
 * All admin operations. Every mutating action writes an AuditLog entry.
 * Routes: /api/admin/*  (all protected by protect + isAdmin middleware)
 */

import mongoose from 'mongoose';
import User        from '../models/User.js';
import Wallet      from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import Course      from '../models/Course.js';
import AuditLog    from '../models/AuditLog.js';

// ─── helpers ──────────────────────────────────────────────────────────────────
const audit = (actorId, action, targetId, metadata = {}, targetRef = '') =>
  AuditLog.create({ actorId, actorRole: 'admin', action, targetId, targetRef, metadata });

// Fix 2: Correlation ID — links related events across approve → payout → webhook
const corrId = (userId) =>
  `adm_${Date.now()}_${String(userId).slice(-4)}_${Math.random().toString(36).slice(-4)}`;

// Fix 3: Module-level metrics cache (6-second TTL prevents DB pressure spikes)
const _metricsCache = { data: null, ts: 0 };
const METRICS_TTL_MS = 6_000;

// ─────────────────────────────────────────────────────────────────────────────
// 1. PLATFORM OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
export const getOverview = async (req, res) => {
  try {
    const [
      totalUsers,
      totalMentors,
      totalMentees,
      totalAdmins,
      totalCourses,
      walletAgg,
      rechargeAgg,
      payoutAgg,
      rewardAgg,
      pendingWithdrawals,
      recentUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'mentor' }),
      User.countDocuments({ role: 'mentee' }),
      User.countDocuments({ role: 'admin' }),
      Course.countDocuments(),
      Wallet.aggregate([{ $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } }]),
      Transaction.aggregate([{ $match: { reason: 'recharge', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([{ $match: { reason: 'withdrawal', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([{ $match: { reason: { $in: ['signup_bonus', 'task_reward', 'course_reward'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.countDocuments({ reason: 'withdrawal', status: 'processing' }),
      User.find().sort({ createdAt: -1 }).limit(5).select('name email role createdAt blocked'),
    ]);

    res.json({
      users: { total: totalUsers, mentors: totalMentors, mentees: totalMentees, admins: totalAdmins },
      courses: totalCourses,
      wallet: {
        systemBalance:    (walletAgg[0]?.total    ?? 0) / 100,
        totalWallets:      walletAgg[0]?.count    ?? 0,
        totalRecharged:   (rechargeAgg[0]?.total  ?? 0) / 100,
        totalPaidOut:     (payoutAgg[0]?.total    ?? 0) / 100,
        totalRewards:     (rewardAgg[0]?.total    ?? 0) / 100,
      },
      pendingWithdrawals,
      recentUsers,
    });
  } catch (err) {
    console.error('[ADMIN_OVERVIEW]', err);
    res.status(500).json({ message: 'Failed to fetch overview' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
export const getUsers = async (req, res) => {
  try {
    const { search = '', role = '', blocked = '', page = 1, limit = 20 } = req.query;
    const filter = {};
    if (search)  filter.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    if (role)    filter.role = role;
    if (blocked !== '') filter.blocked = blocked === 'true';

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error('[ADMIN_GET_USERS]', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

export const getUserDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [wallet, transactions] = await Promise.all([
      Wallet.findOne({ userId: user._id }),
      Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50),
    ]);

    res.json({ user, wallet, transactions });
  } catch (err) {
    console.error('[ADMIN_USER_DETAIL]', err);
    res.status(500).json({ message: 'Failed to fetch user detail' });
  }
};

export const blockUser = async (req, res) => {
  try {
    // Fix 1: Self-lockout protection
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'You cannot block yourself' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Fix 2: Super admin layer — only super_admin can block admin-tier accounts
    if (['admin', 'super_admin'].includes(user.role) && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admins can block admin accounts' });
    }

    // Fix 1: tokenVersion increment — instantly kills all active sessions for this user
    const cId = corrId(req.user._id);
    await User.findByIdAndUpdate(req.params.id, { $set: { blocked: true }, $inc: { tokenVersion: 1 } });
    console.log('[ADMIN_BLOCK]', { correlationId: cId, actor: req.user.email, target: user.email });
    await audit(req.user._id, 'block_user', user._id, { email: user.email, role: user.role, correlationId: cId }, user.email);

    res.json({ message: `User ${user.email} blocked successfully` });
  } catch (err) {
    console.error('[ADMIN_BLOCK_USER]', err);
    res.status(500).json({ message: 'Failed to block user' });
  }
};

export const unblockUser = async (req, res) => {
  try {
    // Defensive: prevent no-op on self
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'Cannot perform this action on yourself' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Fix 1: tokenVersion increment — re-validates all sessions after unblock
    const cId = corrId(req.user._id);
    await User.findByIdAndUpdate(req.params.id, { $set: { blocked: false }, $inc: { tokenVersion: 1 } });
    console.log('[ADMIN_UNBLOCK]', { correlationId: cId, actor: req.user.email, target: user.email });
    await audit(req.user._id, 'unblock_user', user._id, { email: user.email, correlationId: cId }, user.email);

    res.json({ message: `User ${user.email} unblocked successfully` });
  } catch (err) {
    console.error('[ADMIN_UNBLOCK_USER]', err);
    res.status(500).json({ message: 'Failed to unblock user' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────
export const getAllTransactions = async (req, res) => {
  try {
    const { reason = '', status = '', page = 1, limit = 30 } = req.query;
    const filter = {};
    if (reason) filter.reason = reason;
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Transaction.countDocuments(filter),
    ]);

    res.json({ transactions, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error('[ADMIN_GET_TRANSACTIONS]', err);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
};

// Financial summary (daily + totals)
export const getFinancials = async (req, res) => {
  try {
    const [recharge, payouts, rewards, dailyRecharge] = await Promise.all([
      Transaction.aggregate([{ $match: { reason: 'recharge',    status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([{ $match: { reason: 'withdrawal',  status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([{ $match: { reason: { $in: ['signup_bonus','task_reward','course_reward'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([
        { $match: { reason: 'recharge', status: 'completed' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$amount' } } },
        { $sort:  { _id: -1 } },
        { $limit: 14 },
      ]),
    ]);

    res.json({
      totals: {
        recharge: (recharge[0]?.total ?? 0) / 100,
        payouts:  (payouts[0]?.total  ?? 0) / 100,
        rewards:  (rewards[0]?.total  ?? 0) / 100,
      },
      dailyRecharge: dailyRecharge.map(d => ({ date: d._id, amount: d.total / 100 })),
    });
  } catch (err) {
    console.error('[ADMIN_FINANCIALS]', err);
    res.status(500).json({ message: 'Failed to fetch financials' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. WITHDRAWAL CONTROL
// ─────────────────────────────────────────────────────────────────────────────
export const getPendingWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Transaction.find({
      reason: 'withdrawal',
      status: { $in: ['processing', 'pending', 'failed'] },
    })
      .populate('userId', 'name email upiId phone')
      .sort({ createdAt: -1 });

    res.json({ withdrawals });
  } catch (err) {
    console.error('[ADMIN_PENDING_WITHDRAWALS]', err);
    res.status(500).json({ message: 'Failed to fetch withdrawals' });
  }
};

export const approveWithdrawal = async (req, res) => {
  const cId = corrId(req.user._id);
  const session = await mongoose.startSession();
  try {
    // ── Step 1: Load TX (outside session — read only) ─────────────────────────
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });
    if (tx.reason !== 'withdrawal') return res.status(400).json({ message: 'Not a withdrawal transaction' });
    if (tx.status !== 'pending')    return res.status(400).json({ message: 'Only pending withdrawals can be approved' });

    // ── Step 2: Load mentor + ensure Razorpay contact/fund account exist ──────
    // (Done OUTSIDE session — Razorpay HTTP calls cannot participate in MongoDB TX)
    const mentor = await User.findById(tx.userId);
    if (!mentor) return res.status(404).json({ message: 'Mentor not found' });
    if (!mentor.upiId) return res.status(400).json({ message: 'Mentor has no UPI ID on record — ask them to re-submit the withdrawal with UPI details' });

    const razorpay = (await import('../config/razorpay.js')).default;

    let { fundAccountId, razorpayContactId } = mentor;

    // Create contact once, store for reuse
    if (!razorpayContactId) {
      const contact = await razorpay.contacts.create({
        name:    mentor.name,
        email:   mentor.email,
        contact: mentor.phone ?? '',
        type:    'vendor',
      });
      razorpayContactId = contact.id;
    }

    // Create VPA fund account once, store for reuse
    if (!fundAccountId) {
      const fa = await razorpay.fund_accounts.create({
        contact_id:   razorpayContactId,
        account_type: 'vpa',
        vpa:          { address: mentor.upiId },
      });
      fundAccountId = fa.id;
    }

    // Persist both on User so future approvals skip this step
    await User.findByIdAndUpdate(tx.userId, {
      $set: { fundAccountId, razorpayContactId },
    });

    // ── Step 3: Fire Razorpay payout (outside session) ────────────────────────
    const payout = await razorpay.payouts.create({
      account_number:      process.env.RAZORPAY_ACCOUNT_NUMBER,
      fund_account_id:     fundAccountId,
      amount:              tx.amount,         // already in paise
      currency:            'INR',
      mode:                'UPI',
      purpose:             'payout',
      queue_if_low_balance: true,
      reference_id:        String(tx._id),    // idempotency key
    });

    // ── Step 4: Atomically mark TX as processing ───────────────────────────────
    await session.withTransaction(async () => {
      const fresh = await Transaction.findById(tx._id).session(session);
      if (!fresh || fresh.status !== 'pending') throw new Error('RACE');

      fresh.status    = 'processing';
      fresh.payoutRef = payout.id;
      await fresh.save({ session });
    });

    await audit(
      req.user._id, 'approve_withdrawal', tx._id,
      { userId: tx.userId, amount: tx.amount, payoutId: payout.id, correlationId: cId },
      String(tx._id)
    );

    res.json({ message: 'Payout triggered via Razorpay', payoutId: payout.id });
  } catch (err) {
    if (err.message === 'RACE') return res.status(409).json({ message: 'Withdrawal already processed by another admin — refresh and try again' });
    console.error('[ADMIN_APPROVE_WITHDRAWAL]', err);
    res.status(500).json({ message: 'Failed to approve withdrawal', error: err.message });
  } finally {
    session.endSession();
  }
};

export const rejectWithdrawal = async (req, res) => {
  const cId = corrId(req.user._id);
  const session = await mongoose.startSession();
  try {
    let tx;
    await session.withTransaction(async () => {
      tx = await Transaction.findById(req.params.id).session(session);
      if (!tx) throw new Error('NOT_FOUND');
      if (tx.reason !== 'withdrawal') throw new Error('NOT_WITHDRAWAL');
      if (['completed', 'failed'].includes(tx.status)) throw new Error('ALREADY_RESOLVED');

      // Part 4 (reject path): Refund lockedPoints → walletPoints atomically
      await Wallet.findOneAndUpdate(
        { userId: tx.userId },
        { $inc: { walletPoints: tx.amount, lockedPoints: -tx.amount,
                  balance: tx.amount, totalSpent: -tx.amount } },
        { session }
      );

      tx.status = 'failed';
      await tx.save({ session });
    });

    await audit(
      req.user._id, 'reject_withdrawal', tx._id,
      { userId: tx.userId, amount: tx.amount, refunded: true, correlationId: cId },
      String(tx._id)
    );

    res.json({ message: 'Withdrawal rejected — lockedPoints refunded to walletPoints' });
  } catch (err) {
    if (err.message === 'NOT_FOUND')        return res.status(404).json({ message: 'Transaction not found' });
    if (err.message === 'NOT_WITHDRAWAL')   return res.status(400).json({ message: 'Not a withdrawal transaction' });
    if (err.message === 'ALREADY_RESOLVED') return res.status(400).json({ message: 'Already resolved' });
    console.error('[ADMIN_REJECT_WITHDRAWAL]', err);
    res.status(500).json({ message: 'Failed to reject withdrawal' });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. COURSES
// ─────────────────────────────────────────────────────────────────────────────
export const getCourses = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [courses, total] = await Promise.all([
      Course.find()
        .populate('mentor', 'name email')
        .populate('mentee', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Course.countDocuments(),
    ]);

    res.json({ courses, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error('[ADMIN_GET_COURSES]', err);
    res.status(500).json({ message: 'Failed to fetch courses' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. AUDIT LOGS
// ─────────────────────────────────────────────────────────────────────────────
export const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action = '' } = req.query;
    const filter = action ? { action } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actorId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error('[ADMIN_AUDIT_LOGS]', err);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. METRICS  (Fix 6: dedicated real-time metrics endpoint)
// ─────────────────────────────────────────────────────────────────────────────
export const getMetrics = async (req, res) => {
  // Fix 3: Cache check — serve stale-but-fresh data, prevent DB pressure on frequent polls
  if (_metricsCache.data && Date.now() - _metricsCache.ts < METRICS_TTL_MS) {
    return res.json({ ..._metricsCache.data, cached: true });
  }
  try {
    const oneMinuteAgo = new Date(Date.now() - 60_000);

    const [
      totalUsers,
      totalMentors,
      totalMentees,
      activeCourses,
      revenueAgg,
      payoutsAgg,
      pendingWithdrawals,
      txPerMin,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'mentor' }),
      User.countDocuments({ role: 'mentee' }),
      Course.countDocuments(),
      Transaction.aggregate([{ $match: { reason: 'recharge',   status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([{ $match: { reason: 'withdrawal', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.countDocuments({ reason: 'withdrawal', status: { $in: ['processing', 'pending'] } }),
      Transaction.countDocuments({ createdAt: { $gte: oneMinuteAgo } }),
    ]);

    const payload = {
      users:                 { total: totalUsers, mentors: totalMentors, mentees: totalMentees },
      activeCourses,
      revenue:               (revenueAgg[0]?.total  ?? 0) / 100,
      payouts:               (payoutsAgg[0]?.total  ?? 0) / 100,
      pendingWithdrawals,
      transactionsPerMinute: txPerMin,
      timestamp:             new Date().toISOString(),
    };
    _metricsCache.data = payload;
    _metricsCache.ts   = Date.now();
    res.json(payload);
  } catch (err) {
    console.error('[ADMIN_METRICS]', err);
    res.status(500).json({ message: 'Failed to fetch metrics' });
  }
};
