/**
 * backend/scripts/dropAIContent.js
 *
 * One-time migration: drops the old AIContent collection so Mongoose
 * re-creates it with the new { courseId, level } unique index.
 *
 * Run: node --env-file=.env scripts/dropAIContent.js
 */
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI;
if (!uri) { console.error('MONGO_URI not set'); process.exit(1); }

try {
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  await mongoose.connection.dropCollection('aicontents');
  console.log('✅ aicontents collection dropped — Mongoose will recreate it with the new schema on next request.');
} catch (err) {
  if (err.code === 26) {
    console.log('ℹ  aicontents collection did not exist — nothing to drop (fresh start).');
  } else {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
} finally {
  await mongoose.disconnect();
  console.log('Done.');
}
