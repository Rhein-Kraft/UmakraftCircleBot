/**
 * tests/smoke.js
 * ───────────────
 * Basic smoke tests for all SQLite DB modules.
 * Run with: node tests/smoke.js
 *
 * Tests:
 *   • Every DB initialises without error
 *   • Core storeDb CRUD (member upsert, config patch, timezone)
 *   • linksDb set/get/remove
 *   • milestoneDb claim/get
 *   • attendanceDb mark/get
 *   • onboardingDb enroll/get
 *   • imageArchiveDb addHash/hasHash
 *
 * Exit 0 = all passed, exit 1 = at least one failure.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// Use a temp directory so smoke tests never touch live data.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uma-smoke-'));
process.env.DATA_DIR = TMP;

// Must set required env vars before importing config-dependent modules.
process.env.DISCORD_TOKEN = 'smoke-test-token';
process.env.CIRCLE_ID = '000000000';
process.env.GUILD_ID = '111111111';

const {
  initStoreDb,
  upsertMember,
  getMembers,
  setGuildConfig,
  getGuildConfig,
  setTimezone,
  getTimezone,
  runInTransaction,
} = await import('../db/storeDb.js');

const { initLinksDb, setLink, getLinkedViewerId, removeLink } = await import('../db/linksDb.js');
const { initMilestoneDb, claimMilestone, getMilestoneRecord } = await import('../db/milestoneDb.js');
const { initAttendanceDb, markAttendance, getAttendanceForDate } = await import('../db/attendanceDb.js');
const { initOnboardingDb, enrollMember, getOnboardingRow } = await import('../db/onboardingDb.js');
const { initImageArchiveDb, addHash, hasHash } = await import('../db/imageArchiveDb.js');

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✔ ${label}`);
    passed++;
  } else {
    console.error(`  ✘ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n── ${name}`);
}

// ── Init ──────────────────────────────────────────────────────────────────────

section('DB initialisation');
try { initStoreDb();        assert('storeDb init', true); } catch (e) { assert('storeDb init', false, e.message); }
try { initLinksDb();        assert('linksDb init', true); } catch (e) { assert('linksDb init', false, e.message); }
try { initMilestoneDb();    assert('milestoneDb init', true); } catch (e) { assert('milestoneDb init', false, e.message); }
try { initAttendanceDb();   assert('attendanceDb init', true); } catch (e) { assert('attendanceDb init', false, e.message); }
try { initOnboardingDb();   assert('onboardingDb init', true); } catch (e) { assert('onboardingDb init', false, e.message); }
try { initImageArchiveDb(); assert('imageArchiveDb init', true); } catch (e) { assert('imageArchiveDb init', false, e.message); }

// ── storeDb ───────────────────────────────────────────────────────────────────

section('storeDb — member CRUD');
try {
  upsertMember('test-circle', 'viewer-001', { trainerName: 'TestTrainer' });
  const members = getMembers('test-circle');
  const m = members['viewer-001'];
  assert('upsertMember + getMembers', m?.trainerName === 'TestTrainer', JSON.stringify(m));
} catch (e) { assert('upsertMember + getMembers', false, e.message); }

section('storeDb — guild config patch');
try {
  setGuildConfig('guild-001', { quotaMonthly: 30_000_000 });
  setGuildConfig('guild-001', { quotaDaily: 1_000_000 });
  const cfg = getGuildConfig('guild-001');
  assert(
    'setGuildConfig merges keys',
    cfg.quotaMonthly === 30_000_000 && cfg.quotaDaily === 1_000_000,
    JSON.stringify(cfg)
  );
} catch (e) { assert('setGuildConfig merges keys', false, e.message); }

section('storeDb — timezone');
try {
  setTimezone('discord-001', 'Asia/Tokyo');
  const tz = getTimezone('discord-001');
  assert('setTimezone + getTimezone', tz === 'Asia/Tokyo', tz);
} catch (e) { assert('setTimezone + getTimezone', false, e.message); }

section('storeDb — runInTransaction');
try {
  runInTransaction(() => {
    upsertMember('test-circle', 'viewer-txn-a', { trainerName: 'TxnA' });
    upsertMember('test-circle', 'viewer-txn-b', { trainerName: 'TxnB' });
  });
  const members = getMembers('test-circle');
  assert(
    'runInTransaction writes both rows',
    members['viewer-txn-a']?.trainerName === 'TxnA' && members['viewer-txn-b']?.trainerName === 'TxnB',
    JSON.stringify({ a: members['viewer-txn-a'], b: members['viewer-txn-b'] })
  );
} catch (e) { assert('runInTransaction', false, e.message); }

// ── linksDb ───────────────────────────────────────────────────────────────────

section('linksDb — link CRUD');
try {
  setLink('discord-002', 'viewer-002');
  const link = getLinkedViewerId('discord-002');
  assert('setLink + getLinkedViewerId', link === 'viewer-002', link);
  removeLink('discord-002');
  const gone = getLinkedViewerId('discord-002');
  assert('removeLink removes link', gone == null, String(gone));
} catch (e) { assert('linksDb CRUD', false, e.message); }

// ── milestoneDb ───────────────────────────────────────────────────────────────

section('milestoneDb — claim');
try {
  const month = '2026-05';
  const ok = claimMilestone('viewer-003', '10m', month, 1, 'circle-001');
  assert('claimMilestone returns true on first claim', ok === true, String(ok));
  const dup = claimMilestone('viewer-003', '10m', month, 2, 'circle-001');
  assert('claimMilestone returns false on duplicate', dup === false, String(dup));
  const rec = getMilestoneRecord('viewer-003', '10m', month, 'circle-001');
  assert('getMilestoneRecord returns correct position', rec?.position === 1, JSON.stringify(rec));
} catch (e) { assert('milestoneDb claim', false, e.message); }

// ── attendanceDb ──────────────────────────────────────────────────────────────

section('attendanceDb — mark/get');
try {
  const today = new Date().toISOString().slice(0, 10);
  markAttendance('user-004', 'guild-001', 'circle-002', today, today);
  const rows = getAttendanceForDate('guild-001', today, 'circle-002');
  assert(
    'markAttendance + getAttendanceForDate',
    Array.isArray(rows) && rows.some(r => r.user_id === 'user-004'),
    JSON.stringify(rows)
  );
} catch (e) { assert('attendanceDb mark/get', false, e.message); }

// ── onboardingDb ──────────────────────────────────────────────────────────────

section('onboardingDb — enroll/get');
try {
  enrollMember('discord-005', 'guild-001', Date.now());
  const row = getOnboardingRow('discord-005', 'guild-001');
  assert(
    'enrollMember + getOnboardingRow',
    row?.user_id === 'discord-005',
    JSON.stringify(row)
  );
} catch (e) { assert('onboardingDb enroll/get', false, e.message); }

// ── imageArchiveDb ────────────────────────────────────────────────────────────

section('imageArchiveDb — hash');
try {
  const hash = 'abc123deadbeef';
  const gid = 'guild-002';
  assert('hasHash false before add', hasHash(gid, hash) === false);
  addHash(gid, hash);
  assert('hasHash true after add', hasHash(gid, hash) === true);
  assert('hasHash false for different guild', hasHash('guild-999', hash) === false);
} catch (e) { assert('imageArchiveDb hash', false, e.message); }

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(52)}`);
console.log(`  Tests: ${passed + failed}  ✔ ${passed} passed  ✘ ${failed} failed`);
console.log(`${'─'.repeat(52)}\n`);

// Clean up temp directory.
fs.rmSync(TMP, { recursive: true, force: true });

process.exit(failed > 0 ? 1 : 0);
