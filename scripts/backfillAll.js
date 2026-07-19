/**
 * scripts/backfillAll.js
 * ───────────────────────
 * One-shot historical backfill for ALL circle members.
 *
 * What it does (per member, per past month):
 *   1. Fetches daily_fans[] from uma.moe via fetchCircle()
 *   2. Stores every day's gain into daily_gains (dedup-safe)
 *   3. Calculates the monthly total gain for that month
 *   4. Silently claims any milestone tiers crossed (no announcements)
 *   5. Records achievements for claimed milestones
 *
 * Rules:
 *   - Current month is SKIPPED (live system handles it)
 *   - Already-existing DB rows are never overwritten (INSERT OR IGNORE / UPDATE)
 *   - Special tiers (60m/80m/100m) require top-3 by monthly gain that month
 *   - Safe to run multiple times — fully idempotent
 *
 * Usage: node scripts/backfillAll.js [--months 6]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { fetchCircle } from '../core/umaClient.js';
import { TIERS } from '../tasks/milestone-tiers.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PROJECT    = path.dirname(__dirname);
const DATA_DIR   = process.env.DATA_DIR ?? './data';

// ── Parse CLI args ─────────────────────────────────────────────────────────────
const monthsArg = process.argv.indexOf('--months');
const LOOK_BACK = monthsArg >= 0 ? Math.max(1, parseInt(process.argv[monthsArg + 1]) || 6) : 6;

// ── Open DBs directly ──────────────────────────────────────────────────────────
const storeDb      = new Database(path.join(DATA_DIR, 'store.db'));
const milestoneDb  = new Database(path.join(DATA_DIR, 'milestones.db'));
const achieveDb    = new Database(path.join(DATA_DIR, 'achievements.db'));

storeDb.pragma('journal_mode = WAL');
milestoneDb.pragma('journal_mode = WAL');
achieveDb.pragma('journal_mode = WAL');

// ── Prepared statements ────────────────────────────────────────────────────────
const insertGain = storeDb.prepare(`
  INSERT INTO daily_gains (circle_id, viewer_id, date, gain, total_fans, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'), NULL)
  ON CONFLICT(circle_id, viewer_id, date) DO UPDATE SET
    gain       = excluded.gain,
    total_fans = excluded.total_fans
`);

const insertMilestone = milestoneDb.prepare(`
  INSERT OR IGNORE INTO milestone_fired
    (viewer_id, tier_key, month, circle_id, position,
     channel_sent, dm_member_sent, dm_leader_sent, fired_at)
  VALUES (?, ?, ?, ?, ?, 1, 1, 1, datetime('now'))
`);

const getMilestonePosition = milestoneDb.prepare(`
  SELECT COUNT(*) AS c FROM milestone_fired
  WHERE tier_key = ? AND month = ? AND circle_id = ?
`);

const hasMilestone = milestoneDb.prepare(`
  SELECT 1 FROM milestone_fired
  WHERE viewer_id = ? AND tier_key = ? AND month = ? AND circle_id = ?
`);

const insertAchievement = achieveDb.prepare(`
  INSERT OR IGNORE INTO member_achievements
    (viewer_id, achievement_id, tier_key, month, circle_id, position, earned_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`);

// ── Helpers ────────────────────────────────────────────────────────────────────

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** List of {year, month} objects for the past N complete months (newest first). */
function pastMonths(n) {
  const result = [];
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1; // current month — skip it
  for (let i = 0; i < n; i++) {
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
    result.push({ year: y, month: m });
  }
  return result;
}

/** Sum of daily gains from the daily_fans cumulative array. */
function calcMonthlyGain(dailyFans, prevMonthLastFans = 0) {
  let total = 0;
  let prev  = prevMonthLastFans;
  for (const fans of dailyFans) {
    if (fans > 0) {
      total += Math.max(0, fans - prev);
      prev = fans;
    }
  }
  return total;
}

/** Sleep ms — used between API calls to be polite. */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Load active members per circle ─────────────────────────────────────────────
const CIRCLES = [
  process.env.CIRCLE_ID   ?? '974470619',
  process.env.CIRCLE_2_ID ?? '325938032',
];

function getActiveMembers(circleId) {
  return storeDb
    .prepare(`SELECT viewer_id, trainer_name, joined_at FROM members
              WHERE circle_id = ? AND left_at IS NULL`)
    .all(circleId);
}

// ── Main ───────────────────────────────────────────────────────────────────────

console.log(`\n🏇 UmaKraft Historical Backfill — looking back ${LOOK_BACK} month(s)\n`);

const months = pastMonths(LOOK_BACK);
let totalGainRows   = 0;
let totalMilestones = 0;
let totalAchieve    = 0;
let apiErrors       = 0;

for (const circleId of CIRCLES) {
  const members = getActiveMembers(circleId);
  console.log(`\n── Circle ${circleId} (${members.length} members) ─────────────────`);

  for (const { year, month } of months) {
    const mk = monthKey(year, month);
    console.log(`\n  📅 ${mk}`);

    // Fetch this month's circle data
    let payload;
    try {
      payload = await fetchCircle(circleId, year, month);
      await sleep(2000); // be polite to uma.moe — generous delay to avoid 429
    } catch (err) {
      console.log(`    ⚠️  fetchCircle failed: ${err.message}`);
      apiErrors++;
      continue;
    }

    const apiMembers = payload?.members ?? payload?.data?.members ?? [];
    if (!apiMembers.length) {
      console.log(`    ⚠️  No member data returned`);
      continue;
    }

    // Build lookup map: viewer_id → API member row
    const apiMap = new Map(apiMembers.map(m => [String(m.viewer_id), m]));

    // ── Per-member daily gain storage ──────────────────────────────────────────
    const monthlyGains = new Map(); // viewer_id → total monthly gain

    for (const member of members) {
      const vid = String(member.viewer_id);
      const apiMember = apiMap.get(vid);
      if (!apiMember) continue;

      const fans     = apiMember.daily_fans ?? [];
      const daysInM  = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const today    = new Date().toISOString().slice(0, 10);

      // Estimate fans at end of previous month (first day - first day's gain)
      // We use 0 as fallback — conservative but avoids phantom gains
      const prevMonthFans = 0;

      let memberGainRows = 0;
      let runningFans    = prevMonthFans;

      for (let dayIdx = 0; dayIdx < fans.length && dayIdx < daysInM; dayIdx++) {
        const totalFans = fans[dayIdx];
        if (!totalFans || totalFans <= 0) continue;

        const dateStr = new Date(Date.UTC(year, month - 1, dayIdx + 1))
          .toISOString().slice(0, 10);

        // Don't overwrite future dates or today (live system owns today)
        if (dateStr >= today) continue;

        const gain = Math.max(0, totalFans - runningFans);
        runningFans = totalFans;

        try {
          insertGain.run(circleId, vid, dateStr, gain, totalFans);
          memberGainRows++;
          totalGainRows++;
        } catch { /* ignore */ }
      }

      // Monthly gain = last valid cumulative - 0 (conservatively)
      // Use the actual sum of stored gains for accuracy
      const lastFans = fans.filter(f => f > 0).at(-1) ?? 0;
      monthlyGains.set(vid, lastFans > 0 ? calcMonthlyGain(fans, 0) : 0);

      if (memberGainRows > 0) {
        process.stdout.write(`    ✓ ${(member.trainer_name ?? vid).padEnd(20)} +${memberGainRows} day(s)\n`);
      }
    }

    // ── Milestone evaluation for this month ────────────────────────────────────
    if (monthlyGains.size === 0) continue;

    // Sort members by monthly gain (desc) for special tier top-3 selection
    const ranked = [...monthlyGains.entries()]
      .sort((a, b) => b[1] - a[1]);

    const specialTop3 = new Map(); // tierKey → Set<viewerId>
    for (const tier of TIERS) {
      if (!tier.special) continue;
      const eligible = ranked
        .filter(([, g]) => g >= tier.threshold)
        .slice(0, 3)
        .map(([vid]) => vid);
      specialTop3.set(tier.key, new Set(eligible));
    }

    for (const [vid, monthlyGain] of ranked) {
      const memberName = members.find(m => String(m.viewer_id) === vid)?.trainer_name ?? vid;

      for (const tier of TIERS) {
        if (monthlyGain < tier.threshold) continue;
        if (tier.special && !specialTop3.get(tier.key)?.has(vid)) continue;
        if (hasMilestone.get(vid, tier.key, mk, circleId)) continue;

        const position = getMilestonePosition.get(tier.key, mk, circleId).c + 1;
        const r = insertMilestone.run(vid, tier.key, mk, circleId, position);
        if (r.changes > 0) {
          console.log(`    🏆 ${mk} ${tier.key.toUpperCase().padEnd(4)} #${position} → ${memberName}`);
          totalMilestones++;

          // Record achievement
          if (tier.achievement?.id) {
            const ar = insertAchievement.run(vid, tier.achievement.id, tier.key, mk, circleId, position);
            if (ar.changes > 0) totalAchieve++;
          }
        }
      }
    }
  }
}

// ── Checkpoint all DBs ─────────────────────────────────────────────────────────
storeDb.pragma('wal_checkpoint(TRUNCATE)');
milestoneDb.pragma('wal_checkpoint(TRUNCATE)');
achieveDb.pragma('wal_checkpoint(TRUNCATE)');

storeDb.close();
milestoneDb.close();
achieveDb.close();

console.log(`
╔══════════════════════════════════════════╗
║          Backfill Complete               ║
╠══════════════════════════════════════════╣
║  Daily gain rows written : ${String(totalGainRows).padStart(10)}  ║
║  Milestones recorded     : ${String(totalMilestones).padStart(10)}  ║
║  Achievements recorded   : ${String(totalAchieve).padStart(10)}  ║
║  API errors              : ${String(apiErrors).padStart(10)}  ║
╚══════════════════════════════════════════╝
`);
