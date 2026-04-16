/**
 * Move RealtimeEvent documents older than REALTIME_ARCHIVE_AGE_DAYS (default 14) to RealtimeEventArchive.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import RealtimeEvent from '../src/models/RealtimeEvent.js';
import RealtimeEventArchive from '../src/models/RealtimeEventArchive.js';

const AGE_DAYS = Math.max(1, Number(process.env.REALTIME_ARCHIVE_AGE_DAYS || 14));
const BATCH = Math.min(5000, Math.max(100, Number(process.env.REALTIME_ARCHIVE_BATCH || 500)));

async function run() {
  await connectDB();
  const cutoff = new Date(Date.now() - AGE_DAYS * 24 * 60 * 60 * 1000);
  const batch = await RealtimeEvent.find({ createdAt: { $lt: cutoff } })
    .limit(BATCH)
    .lean();

  let moved = 0;
  for (const doc of batch) {
    const { _id, ...rest } = doc;
    try {
      await RealtimeEventArchive.create({
        ...rest,
        archivedAt: new Date(),
      });
      await RealtimeEvent.deleteOne({ _id });
      moved += 1;
    } catch (e) {
      if (e?.code === 11000) {
        await RealtimeEvent.deleteOne({ _id });
        moved += 1;
      } else {
        console.error('archive row failed', e.message);
      }
    }
  }
  console.log(`archiveRealtimeEvents: moved ${moved} events (cutoff ${cutoff.toISOString()})`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
