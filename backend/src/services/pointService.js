import mongoose from 'mongoose';
import User from '../models/User.js';
import PointTransaction from '../models/PointTransaction.js';
import { randomBetween } from '../utils/randomBetween.js';

export { randomBetween };

/**
 * Idempotent credit: at most one row per (userId, type, referenceId).
 * referenceId must be a non-null string for deduplication.
 */
export async function grantPointsOnce(userId, amount, type, referenceId, description) {
  if (!userId || amount == null || amount <= 0) {
    return { granted: false, reason: 'invalid_amount' };
  }
  if (referenceId == null || referenceId === '') {
    return { granted: false, reason: 'reference_required' };
  }

  const ref = String(referenceId);
  const uid = userId.toString ? userId.toString() : String(userId);
  const session = await mongoose.startSession();

  try {
    let granted = false;
    await session.withTransaction(async () => {
      const dup = await PointTransaction.findOne({
        userId: uid,
        type,
        referenceId: ref,
      }).session(session);
      if (dup) return;

      const updated = await User.findOneAndUpdate(
        { _id: uid },
        { $inc: { points: amount } },
        { new: true, session }
      );
      if (!updated) return;

      await PointTransaction.create(
        [
          {
            userId: uid,
            points: amount,
            type,
            referenceId: ref,
            description: description || '',
          },
        ],
        { session }
      );
      granted = true;
    });
    return { granted };
  } catch (err) {
    if (err?.code === 11000) return { granted: false, duplicate: true };
    throw err;
  } finally {
    session.endSession();
  }
}

export async function addPoints(userId, points, type, referenceId, description) {
  if (!points || points <= 0) {
    throw new Error('addPoints expects positive points');
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const updated = await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { points } },
        { new: true, session }
      );
      if (!updated) throw new Error('User not found');
      await PointTransaction.create(
        [
          {
            userId,
            points,
            type,
            referenceId: referenceId != null ? String(referenceId) : null,
            description: description || '',
          },
        ],
        { session }
      );
    });
  } finally {
    session.endSession();
  }
}

/**
 * @param {string} referenceId — required for spend audit trail
 */
export async function deductPointsSafe(userId, points, type, referenceId, description) {
  const amt = Number(points);
  if (!amt || amt <= 0) {
    throw new Error('deductPointsSafe expects positive points amount');
  }
  if (referenceId == null || referenceId === '') {
    throw new Error('deductPointsSafe requires referenceId');
  }

  const session = await mongoose.startSession();
  try {
    let newBalance = null;
    await session.withTransaction(async () => {
      const updated = await User.findOneAndUpdate(
        { _id: userId, points: { $gte: amt } },
        { $inc: { points: -amt } },
        { new: true, session }
      );
      if (!updated) {
        const err = new Error('INSUFFICIENT_POINTS');
        err.code = 'INSUFFICIENT_POINTS';
        throw err;
      }
      newBalance = updated.points;
      await PointTransaction.create(
        [
          {
            userId,
            points: -amt,
            type,
            referenceId: String(referenceId),
            description: description || '',
          },
        ],
        { session }
      );
    });
    return { balance: newBalance };
  } finally {
    session.endSession();
  }
}

/** Spec alias: validates balance, writes negative transaction row. */
export async function deductPoints(userId, points, type, referenceId, description) {
  return deductPointsSafe(userId, points, type, referenceId, description);
}

export async function awardCourseCompletion(menteeId, courseId) {
  const ref = `course:${courseId}`;
  const amount = randomBetween(10, 15);
  return grantPointsOnce(
    menteeId,
    amount,
    'course_completion',
    ref,
    'Course completed'
  );
}

export async function awardTaskCompletion(menteeId, mentorId, courseId, taskRef) {
  const base = `task:${courseId}:${taskRef}`;
  const menteeRes = await grantPointsOnce(
    menteeId,
    randomBetween(1, 10),
    'task_completion',
    base,
    'Task completed'
  );
  let mentorRes = { granted: false };
  if (mentorId) {
    mentorRes = await grantPointsOnce(
      mentorId,
      randomBetween(2, 5),
      'mentor_reward',
      `${base}:mentor`,
      'Mentor guidance reward'
    );
  }
  return { mentee: menteeRes, mentor: mentorRes };
}

export function taskRefFromTask(task, index) {
  if (task && task._id) return String(task._id);
  return `i${index}:${(task && task.title) || ''}`;
}
