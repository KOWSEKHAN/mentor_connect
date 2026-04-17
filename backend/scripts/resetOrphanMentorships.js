/**
 * resetOrphanMentorships.js  — Part 8: One-time DB cleanup
 * ───────────────────────────────────────────────────────────
 * Resets any "accepted" Mentorship rows that have coursePrice: 0
 * AND were never paid for — these are orphan records created by
 * the old courseController.assignMentorToCourse() bug.
 *
 * Safe to re-run: no-ops if nothing matches.
 *
 * Usage:
 *   node scripts/resetOrphanMentorships.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Mentorship from '../src/models/Mentorship.js';
import Course    from '../src/models/Course.js';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('🔗 Connected to MongoDB\n');

  // 1. Find all accepted mentorships with coursePrice 0 (never paid)
  const suspects = await Mentorship.find({
    status:      'accepted',
    coursePrice: 0,
  }).select('_id mentorId menteeId domain');

  console.log(`Found ${suspects.length} suspect "accepted + coursePrice:0" mentorship(s)\n`);

  let reset = 0;
  for (const ms of suspects) {
    // Only reset if NO linked course exists (no real workspace was created legitimately)
    const linkedCourse = await Course.findOne({
      $and: [
        { $or: [{ mentee: ms.menteeId }, { menteeId: ms.menteeId }] },
        { $or: [{ mentor: ms.mentorId }, { mentorId: ms.mentorId }] },
      ],
    });

    if (!linkedCourse) {
      await Mentorship.updateOne({ _id: ms._id }, { $set: { status: 'pending' } });
      console.log(`  ✅ Reset ${ms._id} → pending  (no workspace found)`);
      reset++;
    } else {
      console.log(`  ⚠  Kept  ${ms._id} as accepted (workspace ${linkedCourse._id} exists)`);
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  Reset: ${reset} / ${suspects.length}`);
  console.log(`─────────────────────────────────────────\n`);
  console.log('✅  Cleanup complete');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Cleanup failed:', err.message);
  process.exit(1);
});
