import { randomBytes } from 'crypto';
import { createClient } from 'redis';

const LOCK_PREFIX = 'course:';
const LOCK_TTL_SEC = 12;

let redisClient = null;
let redisConnectPromise = null;

function createMutex() {
  let locked = Promise.resolve();
  return async function run(fn) {
    const prev = locked;
    let resolve;
    locked = new Promise((r) => {
      resolve = r;
    });
    await prev;
    try {
      return await fn();
    } finally {
      resolve();
    }
  };
}

const mutexes = new Map();
function memoryLock(id) {
  if (!mutexes.has(id)) mutexes.set(id, createMutex());
  return mutexes.get(id);
}

async function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redisClient?.isOpen) return redisClient;
  if (!redisConnectPromise) {
    redisConnectPromise = (async () => {
      const c = createClient({ url });
      c.on('error', () => {});
      await c.connect();
      redisClient = c;
      return c;
    })().catch(() => {
      redisConnectPromise = null;
      return null;
    });
  }
  return redisConnectPromise;
}

/**
 * Serialize mutating work per course. Redis lock when REDIS_URL is set (multi-instance);
 * otherwise in-process mutex per courseId.
 */
export async function withCourseLock(courseId, fn) {
  const id = String(courseId);
  const r = await getRedis();
  if (r) {
    const key = `${LOCK_PREFIX}${id}:lock`;
    const token = randomBytes(8).toString('hex');
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const ok = await r.set(key, token, { NX: true, EX: LOCK_TTL_SEC });
      if (ok) {
        try {
          return await fn();
        } finally {
          const script =
            'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
          await r.eval(script, { keys: [key], arguments: [token] }).catch(() => {});
        }
      }
      await new Promise((res) => setTimeout(res, 25 + Math.floor(Math.random() * 40)));
    }
    throw new Error('course_lock_timeout');
  }

  return memoryLock(id)(fn);
}
