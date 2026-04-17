/**
 * cleanAdminWallets.js  — Part 4: One-time migration
 * ───────────────────────────────────────────────────
 * Removes any Wallet documents whose role is not 'mentor' or 'mentee'.
 * Also cross-checks: finds users with admin/super_admin role that somehow
 * have an associated wallet and deletes them.
 *
 * Safe to re-run — no-ops if there are no invalid records.
 *
 * Usage:
 *   node scripts/cleanAdminWallets.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Wallet from '../src/models/Wallet.js';
import User   from '../src/models/User.js';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('🔗 Connected to MongoDB');

  // 1. Delete any wallet where role is not mentor or mentee
  const byRole = await Wallet.deleteMany({ role: { $nin: ['mentor', 'mentee'] } });
  console.log(`🗑  Deleted ${byRole.deletedCount} wallet(s) with invalid role`);

  // 2. Find all admin-tier user IDs and remove any wallets referencing them
  const adminUsers = await User.find({ role: { $in: ['admin', 'super_admin'] } }).select('_id email');
  if (adminUsers.length > 0) {
    const adminIds = adminUsers.map(u => u._id);
    const byUserId = await Wallet.deleteMany({ userId: { $in: adminIds } });
    console.log(`🗑  Deleted ${byUserId.deletedCount} wallet(s) belonging to admin-tier accounts:`);
    adminUsers.forEach(u => console.log(`   • ${u.email}`));
  } else {
    console.log('✅  No admin-tier users found with wallets — nothing to clean');
  }

  console.log('\n✅  Migration complete');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
