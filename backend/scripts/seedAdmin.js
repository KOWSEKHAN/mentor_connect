/**
 * seedAdmin.js — Create or reset the admin account.
 * Run ONCE from the backend root:
 *   node scripts/seedAdmin.js
 *
 * Set credentials via env or edit the defaults below.
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import User from '../src/models/User.js';

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@mentorconnect.dev';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234!';
const ADMIN_NAME     = process.env.ADMIN_NAME     || 'Platform Admin';

async function seed() {
  await connectDB();
  console.log('[SEED_ADMIN] Connected to DB');

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    if (existing.role !== 'admin') {
      console.error(`[SEED_ADMIN] ${ADMIN_EMAIL} exists but is not an admin. Aborting.`);
      process.exit(1);
    }
    // Reset password
    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await User.findByIdAndUpdate(existing._id, { password: hashed, blocked: false });
    console.log(`[SEED_ADMIN] Admin password reset for ${ADMIN_EMAIL}`);
  } else {
    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: hashed,
      role: 'admin',
      keywords: [],
    });
    console.log(`[SEED_ADMIN] Admin created: ${ADMIN_EMAIL}`);
  }

  console.log('[SEED_ADMIN] Done. Login at /auth with the admin credentials.');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[SEED_ADMIN] Fatal:', err);
  process.exit(1);
});
