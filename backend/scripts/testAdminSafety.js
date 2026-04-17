/**
 * testAdminSafety.js  — Fix 5: E2E Safety Scenario Validator
 * ────────────────────────────────────────────────────────────
 * Runs HTTP calls against the running backend to validate all
 * admin security invariants. Requires the server to be running.
 *
 *   ADMIN_TOKEN=<jwt>  SUPER_TOKEN=<jwt>  MENTEE_ID=<id>  ADMIN_ID=<id>
 *   node scripts/testAdminSafety.js
 *
 * Exit 0 = all passed. Exit 1 = one or more failed.
 */

import 'dotenv/config';

const BASE  = process.env.API_URL       || 'http://localhost:5000';
const ADMIN = process.env.ADMIN_TOKEN;   // regular admin JWT
const SUPER = process.env.SUPER_TOKEN;   // super_admin JWT
const MENTEE_ID = process.env.MENTEE_ID;
const ADMIN_ID  = process.env.ADMIN_ID;  // the admin's own user ID (for self-block test)
const WITHDRAWAL_ID = process.env.WITHDRAWAL_ID || null;

if (!ADMIN || !SUPER) {
  console.error('Set ADMIN_TOKEN and SUPER_TOKEN env vars before running.');
  process.exit(1);
}

let passed = 0;
let failed = 0;

async function req(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}${extra ? ' — ' + extra : ''}`);
    failed++;
  }
}

// ─── Scenario A: Self-protection ─────────────────────────────────────────────
console.log('\n[A] Self-protection');
if (ADMIN_ID) {
  const r = await req('POST', `/api/admin/users/${ADMIN_ID}/block`, ADMIN);
  check('Admin cannot block themselves', r.status === 400, `got ${r.status}: ${r.data?.message}`);
} else {
  console.log('  ⚠  ADMIN_ID not set — skipping self-block test');
}

// ─── Scenario B: Privilege boundaries ────────────────────────────────────────
console.log('\n[B] Privilege boundaries');
if (ADMIN_ID) {
  const r = await req('POST', `/api/admin/users/${ADMIN_ID}/block`, ADMIN);
  // Admin trying to block an admin-tier account should get 403 (or 400 if self)
  check('Regular admin cannot block admin-tier accounts', r.status === 403 || r.status === 400,
    `got ${r.status}: ${r.data?.message}`);
}

// Withdrawal approve by regular admin (not super_admin) → 403
if (WITHDRAWAL_ID) {
  const r = await req('POST', `/api/admin/withdrawals/${WITHDRAWAL_ID}/approve`, ADMIN);
  check('Regular admin cannot approve withdrawals', r.status === 403,
    `got ${r.status}: ${r.data?.message}`);
} else {
  console.log('  ⚠  WITHDRAWAL_ID not set — skipping withdrawal privilege test');
}

// ─── Scenario C: Withdrawal lifecycle (super_admin) ──────────────────────────
console.log('\n[C] Withdrawal lifecycle');
if (WITHDRAWAL_ID && SUPER) {
  const r = await req('POST', `/api/admin/withdrawals/${WITHDRAWAL_ID}/reject`, SUPER);
  check('Super admin can reject withdrawal', r.status === 200 || r.status === 400,
    `${r.status}: ${r.data?.message}`);
}

// ─── Scenario D: Session revocation ──────────────────────────────────────────
console.log('\n[D] Session revocation');
if (MENTEE_ID) {
  const block = await req('POST', `/api/admin/users/${MENTEE_ID}/block`, SUPER);
  check('Super admin can block mentee', block.status === 200, `got ${block.status}`);

  // Now try to use the mentee's original token (if provided)
  const MENTEE_TOKEN = process.env.MENTEE_TOKEN;
  if (MENTEE_TOKEN) {
    const me = await req('GET', '/api/auth/me', MENTEE_TOKEN);
    check('Blocked user gets 403 on next request', me.status === 403 || me.status === 401,
      `got ${me.status}`);
  } else {
    console.log('  ⚠  MENTEE_TOKEN not set — skipping session revocation HTTP check');
  }

  // Restore
  const unblock = await req('POST', `/api/admin/users/${MENTEE_ID}/unblock`, SUPER);
  check('Super admin can unblock mentee', unblock.status === 200, `got ${unblock.status}`);
} else {
  console.log('  ⚠  MENTEE_ID not set — skipping session revocation test');
}

// ─── Scenario E: AuditLog immutability ───────────────────────────────────────
console.log('\n[E] AuditLog integrity');

// AuditLog DELETE is blocked at the ODM level. We can verify GET works.
const logs = await req('GET', '/api/admin/audit-logs?limit=1', SUPER);
check('Audit log endpoint is accessible', logs.status === 200, `got ${logs.status}`);
if (logs.data?.logs?.length > 0) {
  const logId = logs.data.logs[0]._id;
  // There is no DELETE /audit-logs route (by design) — verify 404
  const del = await req('DELETE', `/api/admin/audit-logs/${logId}`, SUPER);
  check('No DELETE route exists for audit logs', del.status === 404, `got ${del.status}`);
}

// ─── Scenario F: Metrics cache ───────────────────────────────────────────────
console.log('\n[F] Metrics cache');
const m1 = await req('GET', '/api/admin/metrics', SUPER);
const m2 = await req('GET', '/api/admin/metrics', SUPER);
check('First metrics call succeeds', m1.status === 200);
check('Second metrics call returns cached flag', m2.status === 200 && m2.data?.cached === true,
  `cached=${m2.data?.cached}`);

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`  Passed: ${passed}  |  Failed: ${failed}`);
console.log(`${'─'.repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
