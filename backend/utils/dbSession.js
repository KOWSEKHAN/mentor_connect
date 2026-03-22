import mongoose from 'mongoose';

/**
 * Start a safe MongoDB session with transaction.
 * Returns session when replica set is available, null otherwise (graceful fallback).
 */
export async function startSafeSession() {
  try {
    const session = await mongoose.startSession();
    await session.startTransaction();
    return session;
  } catch {
    return null;
  }
}
