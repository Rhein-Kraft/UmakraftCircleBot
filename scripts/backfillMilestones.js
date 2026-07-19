/**
 * scripts/backfillMilestones.js
 * ──────────────────────────────
 * One-off script: backfills milestone_fired from daily_gains history.
 *
 * Safe to run multiple times — uses INSERT OR IGNORE throughout.
 * Never overwrites live bot records. Never sends retroactive messages.
 *
 * What it does:
 *   1. Reads monthly fan totals per member per circle from daily_gains (store.db)
 *   2. Standard tiers (10M / 20M / 30M / 40M):
 *        → Every member who crossed the threshold that month earns the milestone
 *   3. Special tiers (60M / 80M / 100M):
 *        → Top 3 earners per circle per month who also crossed the threshold
 *   4. Marks all backfilled rows as already-sent (channel_sent=1, dm_member_sent=1,
 *      dm_leader_sent=1) — no retroactive DMs or channel posts will fire
 *   5. Achievements auto-sync from milestone_fired on next bot restart
 *
 * Gaps in the data:
 *   - Nov 2025: no CSV was available — cannot be recovered
 *   - Jul 2025: only partial CSV data (Day 30 only) — monthly total unreliable, skipped
 *   - Current month (Jun 2026): live bot handles this; INSERT OR IGNORE protects existing records
 *
 * Run:
 *   node scripts/backfillMilestones.js
 */

import Database from 'better-sqlite3';
import { join } from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const DATA_DIR    = join(process.cwd(), process.env.DATA_DIR ?? 'data');
const STORE_DB    = join(DATA_DIR, 'store.db');
const MILESTONE_DB = join(DATA_DIR, 'milestones.db');

// Standard tiers: every qualifying member gets it
const STANDARD_TIERS = [
  { key: '10m', threshold: 10_000_000 },
  { key: '20m', threshold: 20_000_000 },
  { key: '30m', threshold: 30_000_000 },
  { key: '40m', threshold: 40_000_000 },
];

// Special tiers: top 3 earners per circle per month who also crossed the threshold
const SPECIAL_TIERS = [
  { key: '60m', threshold: 60_000_000 },
  { key: '80m', threshold: 80_000_000 },
  { key: '100m', threshold: 100_000_000 },
];

// Skip months where data is known-incomplete or already fully handled by live bot
// Jul 2025: only 1 day of delta data — monthly total is not reliable
const SKIP_MONTHS = new Set(['2025-07']);

// ── Open databases ────────────────────────────────────────────────────────────

const storeDb     = new Database(STORE_DB, { readonly: true });
const milestoneDb = new Database(MILESTONE_DB);

// ── Load monthly totals from daily_gains ──────────────────────────────────────

const monthlyRows = storeDb.prepare(`
  SELECT
    strftime('%Y-%m', dg.date)  AS month,
    dg.circle_id                AS circle_id,
    dg.viewer_id                AS viewer_id,
    SUM(dg.gain)                AS monthly_gain
  FROM daily_gains dg
  GROUP BY strftime('%Y-%m', dg.date), dg.circle_id, dg.viewer_id
  ORDER BY month ASC, circle_id ASC, monthly_gain DESC
`).all();

storeDb.close();

// Group by month → circle → sorted members (already sorted DESC by monthly_gain)
// Structure: Map<month, Map<circleId, [{viewer_id, monthly_gain}]>>
const byMonthCircle = new Map();
for (const row of monthlyRows) {
  if (SKIP_MONTHS.has(row.month)) continue;
  if (!byMonthCircle.has(row.month)) byMonthCircle.set(row.month, new Map());
  const byCircle = byMonthCircle.get(row.month);
  if (!byCircle.has(row.circle_id)) byCircle.set(row.circle_id, []);
  byCircle.get(row.circle_id).push({ viewerId: row.viewer_id, monthlyGain: row.monthly_gain });
}

// ── Prepare insert statement ──────────────────────────────────────────────────

// INSERT OR IGNORE — never touch existing records
// channel_sent / dm_member_sent / dm_leader_sent = 1 — no retroactive messages
const insertStmt = milestoneDb.prepare(`
  INSERT OR IGNORE INTO milestone_fired
    (viewer_id, tier_key, month, circle_id, position, fired_at,
     channel_sent, dm_member_sent, dm_leader_sent)
  VALUES
    (?, ?, ?, ?, ?, datetime('now'), 1, 1, 1)
`);

// ── Run all insertions in a single transaction ────────────────────────────────

let totalInserted = 0;
let totalSkipped  = 0;

const run = milestoneDb.transaction(() => {
  for (const [month, byCircle] of byMonthCircle) {
    for (const [circleId, members] of byCircle) {
      // members is already sorted DESC by monthly_gain

      // ── Standard tiers ──────────────────────────────────────────────────────
      for (const tier of STANDARD_TIERS) {
        for (const m of members) {
          if (m.monthlyGain < tier.threshold) break; // sorted DESC — once below, all below
          const result = insertStmt.run(m.viewerId, tier.key, month, circleId, 1);
          if (result.changes > 0) totalInserted++;
          else                    totalSkipped++;
        }
      }

      // ── Special tiers (top 3 per circle per month) ───────────────────────────
      for (const tier of SPECIAL_TIERS) {
        const eligible = members.filter(m => m.monthlyGain >= tier.threshold);
        const winners  = eligible.slice(0, 3); // top 3 max
        winners.forEach((m, idx) => {
          const result = insertStmt.run(m.viewerId, tier.key, month, circleId, idx + 1);
          if (result.changes > 0) totalInserted++;
          else                    totalSkipped++;
        });
      }
    }
  }
});

run();
milestoneDb.close();

// ── Summary ───────────────────────────────────────────────────────────────────

const months = [...byMonthCircle.keys()];
console.log('\n══════════════════════════════════════════════');
console.log(`  Months processed : ${months.join(', ')}`);
console.log(`  Rows inserted    : ${totalInserted}`);
console.log(`  Already existed  : ${totalSkipped} (skipped — INSERT OR IGNORE)`);
console.log('══════════════════════════════════════════════');
console.log('\nDone. Restart the bot to sync achievements from updated milestone_fired.\n');
