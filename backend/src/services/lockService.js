// backend/src/services/lockService.js
/**
 * Distributed lock service.
 *
 * Strategy:
 *  - If REDIS_URL is set and Redis is reachable → Redis SET NX EX (distributed-safe).
 *  - Otherwise → in-process Map with TTL (single-node dev fallback).
 *
 * Usage:
 *   const acquired = await acquireLock('gen:courseId:level', 60);
 *   if (!acquired) return res.status(409)...
 *   const heartbeat = setInterval(() => extendLock('gen:courseId:level', 60), 15_000);
 *   try { ... } finally { clearInterval(heartbeat); await releaseLock('gen:courseId:level'); }
 */
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

let redis = null;

if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      lazyConnect:          true,
      enableOfflineQueue:   false,
      connectTimeout:       2000,
      maxRetriesPerRequest: 0,
    });
    redis.connect().catch((err) => {
      console.warn('[LockService] Redis unavailable — falling back to in-process lock:', err.message);
      redis = null;
    });
    redis.on('error', (err) => {
      if (redis) {
        console.warn('[LockService] Redis error — switching to in-process fallback:', err.message);
        redis = null;
      }
    });
  } catch (err) {
    console.warn('[LockService] Redis init failed — using in-process fallback:', err.message);
    redis = null;
  }
} else {
  console.info('[LockService] REDIS_URL not set — using in-process lock.');
}

const localLocks = new Map(); // key -> { timer, token }

export async function acquireLock(key, ttlSecs = 60) {
  const token = randomUUID();

  if (redis) {
    try {
      const result = await redis.set(key, token, 'NX', 'EX', ttlSecs);
      return result === 'OK' ? token : null;
    } catch (err) {
      console.warn('[LockService] Redis acquireLock error:', err.message);
    }
  }

  if (localLocks.has(key)) return null;
  const timer = setTimeout(() => localLocks.delete(key), ttlSecs * 1000);
  localLocks.set(key, { timer, token });
  return token;
}

export async function extendLock(key, token, ttlSecs = 60) {
  if (redis) {
    try {
      // Basic Lua script to strictly enforce ownership during extension
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
      const result = await redis.eval(script, 1, key, token, ttlSecs);
      return result === 1;
    } catch (err) {
      console.warn('[LockService] Redis extendLock error:', err.message);
    }
  }

  const existing = localLocks.get(key);
  if (!existing || existing.token !== token) return false;
  
  clearTimeout(existing.timer);
  const newTimer = setTimeout(() => localLocks.delete(key), ttlSecs * 1000);
  localLocks.set(key, { timer: newTimer, token });
  return true;
}

export async function releaseLock(key, token) {
  if (redis) {
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await redis.eval(script, 1, key, token);
      return;
    } catch (err) {
      console.warn('[LockService] Redis releaseLock error:', err.message);
    }
  }

  const existing = localLocks.get(key);
  if (existing && existing.token === token) {
    clearTimeout(existing.timer);
    localLocks.delete(key);
  }
}

export async function isLocked(key) {
  if (redis) {
    try {
      return (await redis.exists(key)) === 1;
    } catch { /* fall through */ }
  }
  return localLocks.has(key);
}
