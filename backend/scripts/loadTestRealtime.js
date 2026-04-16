/**
 * Realtime + sync load harness (run from backend/: npm run loadtest:realtime).
 *
 * Env:
 *   LOADTEST_JWT        — Bearer token for a user who is a member of LOADTEST_COURSE_ID
 *   LOADTEST_COURSE_ID  — Course ObjectId
 *   LOADTEST_API        — API base (default http://localhost:5000)
 *   LOADTEST_USERS      — Concurrent socket clients (default 100, max 200)
 *   LOADTEST_DURATION_MS — How long to run after all connected (default 30000)
 *   LOADTEST_TASK_ID     — Optional mentee task id: mixed PATCH /toggle stress
 *
 * Example:
 *   set LOADTEST_JWT=eyJ...
 *   set LOADTEST_COURSE_ID=674...
 *   npm run loadtest:realtime
 */
import { io } from 'socket.io-client';

const BASE = process.env.LOADTEST_API || 'http://localhost:5000';
const TOKEN = process.env.LOADTEST_JWT;
const COURSE_ID = process.env.LOADTEST_COURSE_ID;
const USERS = Math.min(200, Math.max(1, Number(process.env.LOADTEST_USERS || 100)));
const TASK_ID = process.env.LOADTEST_TASK_ID;
const DURATION_MS = Number(process.env.LOADTEST_DURATION_MS || 30_000);

if (!TOKEN || !COURSE_ID) {
  console.error('Missing LOADTEST_JWT or LOADTEST_COURSE_ID');
  process.exit(1);
}

const syncLatencies = [];
const errors = { sync: 0, socket: 0, taskToggle: 0 };

async function oneSync(lastVersion) {
  const t0 = Date.now();
  try {
    const res = await fetch(
      `${BASE}/api/realtime/sync?courseId=${encodeURIComponent(COURSE_ID)}&lastVersion=${lastVersion}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    syncLatencies.push(Date.now() - t0);
  } catch {
    errors.sync += 1;
  }
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (s.length - 1));
  return s[idx];
}

async function main() {
  console.log(`Load test: ${USERS} sockets + periodic sync, ${DURATION_MS}ms steady state`);

  const sockets = [];
  for (let i = 0; i < USERS; i += 1) {
    const s = io(BASE, {
      auth: { token: TOKEN },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(s);
    s.on('connect_error', () => {
      errors.socket += 1;
    });
    s.on('connect', () => {
      s.emit('join_course_room', { courseId: COURSE_ID });
    });
  }

  await new Promise((r) => setTimeout(r, Math.min(15_000, 2000 + USERS * 30)));

  const syncBurst = Math.min(80, USERS * 2);
  for (let b = 0; b < syncBurst; b += 1) {
    await oneSync(0);
  }

  const parallelSyncs = Math.min(10, Math.ceil(USERS / 10));
  const interval = setInterval(() => {
    void Promise.all(Array.from({ length: parallelSyncs }, () => oneSync(0)));
  }, 400);

  let taskInterval;
  if (TASK_ID) {
    taskInterval = setInterval(() => {
      void fetch(`${BASE}/api/structured/tasks/${encodeURIComponent(TASK_ID)}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${TOKEN}` },
      })
        .then((r) => {
          if (!r.ok) errors.taskToggle += 1;
        })
        .catch(() => {
          errors.taskToggle += 1;
        });
    }, 400);
  }

  await new Promise((r) => setTimeout(r, DURATION_MS));
  clearInterval(interval);
  if (taskInterval) clearInterval(taskInterval);

  sockets.forEach((s) => s.close());

  const ok = syncLatencies.length;
  const errRate = ok + errors.sync === 0 ? 0 : errors.sync / (ok + errors.sync);
  console.log('\n--- Results ---');
  console.log(
    'Sync requests ok:',
    ok,
    'errors:',
    errors.sync,
    'socket connect_errors:',
    errors.socket,
    'task_toggle_errors:',
    errors.taskToggle
  );
  console.log('Sync error rate:', (errRate * 100).toFixed(2) + '%');
  if (ok) {
    console.log('Sync latency p50:', percentile(syncLatencies, 50), 'ms');
    console.log('Sync latency p95:', percentile(syncLatencies, 95), 'ms');
    const intervalReqs = Math.floor(DURATION_MS / 400) * parallelSyncs;
    console.log('Sync requests (interval phase, est.):', intervalReqs);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
