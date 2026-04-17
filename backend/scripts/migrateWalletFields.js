/**
 * migrateWalletFields.js — Part 2: One-time migration
 * ─────────────────────────────────────────────────────
 * Copies each wallet's `balance` → `walletPoints`.
 * Sets `rewardPoints` = 0 (virtual, not backed by existing balance).
 * Safe to re-run: already-migrated wallets are no-ops.
 *
 * Usage:
 *   node scripts/migrateWalletFields.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Wallet from '../src/models/Wallet.js';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('🔗 Connected to MongoDB\n');

  // Part 2: Convert balance → walletPoints for every existing wallet
  const result = await Wallet.updateMany(
    // Match wallets that haven't been migrated yet (field missing OR still 0) AND have real balance
    {
      $and: [
        { $or: [{ walletPoints: { $exists: false } }, { walletPoints: 0 }] },
        { balance: { $gt: 0 } },
      ],
    },
    [
      {
        $set: {
          walletPoints: '$balance',   // real money carried over
          rewardPoints: 0,            // virtual — starts at 0 for existing users
        },
      },
    ]
  );

  console.log(`✅  Migrated ${result.modifiedCount} wallet(s):`);
  console.log(`    walletPoints ← balance (existing real money preserved)`);
  console.log(`    rewardPoints = 0 (virtual gamification — starts fresh)\n`);

  // Show current state
  const wallets = await Wallet.find({}).select('userId role balance walletPoints rewardPoints');
  if (wallets.length === 0) {
    console.log('  No wallets found.');
  } else {
    for (const w of wallets) {
      console.log(`  User ${w.userId} [${w.role}] → balance:${w.balance} walletPts:${w.walletPoints} rewardPts:${w.rewardPoints}`);
    }
  }

  console.log('\n✅  Migration complete');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
