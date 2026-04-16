import mongoose from 'mongoose';
import { transactionsMandatory } from '../src/config/replicaSet.js';

/**
 * Start a MongoDB session with an active transaction.
 * In production (or REQUIRE_MONGODB_TRANSACTIONS=true), fails if transactions cannot start.
 * In local dev on standalone MongoDB, returns null so callers can run without a transaction.
 */
export async function startSafeSession() {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    return session;
  } catch (err) {
    await session.endSession().catch(() => {});
    if (transactionsMandatory()) {
      throw new Error(
        `MongoDB transactions unavailable: ${err?.message || err}. Use a replica set or unset REQUIRE_MONGODB_TRANSACTIONS.`
      );
    }
    return null;
  }
}
