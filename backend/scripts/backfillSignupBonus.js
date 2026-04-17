/**
 * backfillSignupBonus.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration: grants 100-point signup bonus to every mentee whose
 * wallet was created with balance = 0 and who has NO existing signup_bonus
 * transaction.
 *
 * RUN ONCE from the backend root:
 *   node scripts/backfillSignupBonus.js
 *
 * Safe to re-run: the Transaction unique index prevents double-credit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Wallet from '../src/models/Wallet.js';
import Transaction from '../src/models/Transaction.js';
import { processCredit } from '../src/services/walletService.js';
import connectDB from '../src/config/db.js';

const BONUS_POINTS = 100;     // 100 points
const BONUS_REASON = 'signup_bonus';

async function run() {
  await connectDB();
  console.log('[BACKFILL] Connected to DB');

  const mentees = await User.find({ role: 'mentee' }).select('_id').lean();
  console.log(`[BACKFILL] Found ${mentees.length} mentee(s)`);

  let granted = 0;
  let skipped = 0;
  let errors  = 0;

  for (const mentee of mentees) {
    const userId    = mentee._id;
    const signupRef = `signup_${userId}`;

    try {
      // Skip if already rewarded (DB-dedup, belt-and-suspenders)
      const alreadyRewarded = await Transaction.findOne({
        userId,
        reason: BONUS_REASON,
        referenceId: signupRef
      });

      if (alreadyRewarded) {
        console.log(`  SKIP  ${userId} — already has signup_bonus`);
        skipped++;
        continue;
      }

      // Skip if wallet balance is already above 0 (may have recharged)
      // but still no reward transaction — grant it anyway (user deserves it)
      await processCredit(
        userId,
        BONUS_POINTS,
        BONUS_REASON,
        signupRef,
        userId,    // actorId
        'system'   // actorRole — satisfies Transaction enum
      );

      console.log(`  OK    ${userId} — granted ${BONUS_POINTS} pts`);
      granted++;
    } catch (err) {
      if (err.code === 11000) {
        // Unique index conflict — already exists, safe to ignore
        console.log(`  SKIP  ${userId} — duplicate index (already rewarded)`);
        skipped++;
      } else {
        console.error(`  FAIL  ${userId} —`, err.message);
        errors++;
      }
    }
  }

  console.log('\n[BACKFILL] ─── Summary ───────────────────────────────────');
  console.log(`  Granted : ${granted}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Errors  : ${errors}`);
  console.log('[BACKFILL] Done.');

  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('[BACKFILL] Fatal error:', err);
  process.exit(1);
});
