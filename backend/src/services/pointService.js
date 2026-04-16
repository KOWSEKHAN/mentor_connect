import mongoose from 'mongoose';
import { processCredit, processDebit, getWallet } from './walletService.js';
import { randomBetween } from '../utils/randomBetween.js';

export { randomBetween };

// Map old type literals to new Transaction ENUM reasons
const mapReason = (type) => {
  const map = {
    'signup': 'signup_bonus',
    'course_completion': 'course_reward',
    'task_completion': 'task_reward',
    'mentor_reward': 'mentor_earning',
    'spend': 'course_purchase',
  };
  return map[type] || 'recharge'; // Default fallback
};

export async function grantPointsOnce(userId, amount, type, referenceId, description) {
  if (!userId || amount == null || amount <= 0) {
    return { granted: false, reason: 'invalid_amount' };
  }
  if (referenceId == null || referenceId === '') {
    return { granted: false, reason: 'reference_required' };
  }

  // Deduplication check
  const Transaction = (await import('../models/Transaction.js')).default;
  const dup = await Transaction.findOne({ userId, reason: mapReason(type), referenceId });
  if (dup) return { granted: false, duplicate: true };

  try {
    await processCredit(userId, amount, mapReason(type), referenceId);
    return { granted: true };
  } catch (err) {
    console.error('grantPointsOnce failed', err);
    return { granted: false };
  }
}

export async function addPoints(userId, points, type, referenceId, description) {
  await processCredit(userId, points, mapReason(type), referenceId || 'manual');
}

export async function deductPointsSafe(userId, points, type, referenceId, description) {
  const res = await processDebit(userId, points, mapReason(type), referenceId);
  return { balance: res.wallet.balance };
}

export async function deductPoints(userId, points, type, referenceId, description) {
  return deductPointsSafe(userId, points, type, referenceId, description);
}

export async function awardCourseCompletion(menteeId, courseId, mentorDefinedReward = 0) {
  const ref = `course:${courseId}`;
  const amount = Math.max(randomBetween(3, 5), Math.min(Number(mentorDefinedReward) || 0, 10));
  return grantPointsOnce(menteeId, amount, 'course_completion', ref, 'Course completed');
}

export async function awardTaskCompletion(menteeId, mentorId, courseId, taskRef) {
  const base = `task:${courseId}:${taskRef}`;
  // Mentee reward 1 to 2.5
  const menteeRes = await grantPointsOnce(menteeId, randomBetween(1, 2.5), 'task_completion', base, 'Task completed');
  let mentorRes = { granted: false };
  
  if (mentorId) {
    mentorRes = await grantPointsOnce(mentorId, randomBetween(2, 5), 'mentor_reward', `${base}:mentor`, 'Mentor guidance reward');
  }
  
  return { mentee: menteeRes, mentor: mentorRes };
}

export function taskRefFromTask(task, index) {
  if (task && task._id) return String(task._id);
  return `i${index}:${(task && task.title) || ''}`;
}
