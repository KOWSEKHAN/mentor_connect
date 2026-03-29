import mongoose from 'mongoose';

/**
 * One-time migration:
 * - mentorship.mentor -> mentorId
 * - mentorship.mentee -> menteeId
 * - status: active -> accepted
 *
 * Run:
 *   node scripts/migrate-mentorships.js
 */

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set');
  process.exit(1);
}

await mongoose.connect(MONGO_URI, {});
console.log('[migration] connected');

const db = mongoose.connection.db;
const col = db.collection('mentorships');

// 1) Rename mentor/mentee fields if present.
const renameRes = await col.updateMany(
  { $or: [{ mentor: { $exists: true } }, { mentee: { $exists: true } }] },
  [
    {
      $set: {
        mentorId: { $ifNull: ['$mentorId', '$mentor'] },
        menteeId: { $ifNull: ['$menteeId', '$mentee'] },
      },
    },
    { $unset: ['mentor', 'mentee'] },
  ]
);
console.log('[migration] renamed fields', renameRes.modifiedCount);

// 2) Map status active -> accepted, leave completed, default missing -> pending.
const statusRes = await col.updateMany(
  {},
  [
    {
      $set: {
        status: {
          $switch: {
            branches: [
              { case: { $eq: ['$status', 'active'] }, then: 'accepted' },
              { case: { $eq: ['$status', 'accepted'] }, then: 'accepted' },
              { case: { $eq: ['$status', 'pending'] }, then: 'pending' },
              { case: { $eq: ['$status', 'completed'] }, then: 'completed' },
            ],
            default: 'pending',
          },
        },
      },
    },
  ]
);
console.log('[migration] normalized statuses', statusRes.modifiedCount);

// 3) Basic integrity report (missing mentorId/menteeId).
const invalidCount = await col.countDocuments({
  $or: [{ mentorId: { $exists: false } }, { menteeId: { $exists: false } }, { mentorId: null }, { menteeId: null }],
});
console.log('[migration] invalid mentorship records:', invalidCount);

await mongoose.disconnect();
console.log('[migration] done');

