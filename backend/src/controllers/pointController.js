import mongoose from 'mongoose';
import User from '../models/User.js';
import PointTransaction from '../models/PointTransaction.js';
import { deductPoints } from '../services/pointService.js';

const balanceOf = (u) => (u?.points != null ? u.points : 0);

export const getPoints = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('points');
    const transactions = await PointTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({
      balance: balanceOf(user),
      transactions,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getPointsSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const oid =
      userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(String(userId));

    const [agg] = await PointTransaction.aggregate([
      { $match: { userId: oid } },
      {
        $group: {
          _id: null,
          totalEarned: {
            $sum: { $cond: [{ $gt: ['$points', 0] }, '$points', 0] },
          },
          totalSpent: {
            $sum: { $cond: [{ $lt: ['$points', 0] }, { $multiply: ['$points', -1] }, 0] },
          },
        },
      },
    ]);

    const user = await User.findById(userId).select('points');

    return res.json({
      balance: balanceOf(user),
      totalEarned: agg?.totalEarned ?? 0,
      totalSpent: agg?.totalSpent ?? 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Future monetization gate: deduct points or return 402.
 */
export const spendPoints = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('points');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (balanceOf(user) <= 0) {
      return res.status(402).json({
        message: 'Insufficient points. Payment system coming soon.',
      });
    }

    const raw = req.body?.points ?? req.body?.amount;
    const points = Number(raw);
    if (!Number.isFinite(points) || points <= 0) {
      return res.status(400).json({ message: 'Valid points amount required' });
    }

    const referenceId = req.body?.referenceId || `spend:${Date.now()}`;

    try {
      const { balance } = await deductPoints(
        req.user._id,
        points,
        'spend',
        String(referenceId),
        req.body?.description || 'Point spend'
      );
      return res.json({ balance, message: 'Spent successfully' });
    } catch (e) {
      if (e.code === 'INSUFFICIENT_POINTS' || e.message === 'INSUFFICIENT_POINTS') {
        return res.status(402).json({
          message: 'Insufficient points. Payment system coming soon.',
        });
      }
      throw e;
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
