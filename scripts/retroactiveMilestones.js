/**
 * scripts/retroactiveMilestones.js
 * ──────────────────────────────────
 * Retroactively seeds milestones and achievements for all members
 * based on historical monthly gain data already in daily_gains.
 *
 * Run AFTER importCsvGains.js.
 * Run:  node scripts/retroactiveMilestones.js
 *
 * What it does:
 *   1. Groups daily_gains by (circle_id, viewer_id, YYYY-MM)
 *   2. For each month, finds the highest milestone tier the member crossed
 *   3. Inserts into milestone_fired (all send-flags = 1 → no Discord notifications)
 *   4. Inserts into member_achievements
 *
 * Safe: idempotent — uses INSERT OR IGNORE everywhere.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT     = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');

console.log('=== Retroactive Milestone & Achievement Seeder ===\n');

// ── Tier definitions (mirror of milestone-tiers.js, no file imports needed) ───
const TIERS = [
  { key: '100m', threshold: 100_000_000, achievementId: 'milestone_100m_special', rarity: 'Legendary', title: '100 Million Legend', special: true  },
  { key: '80m',  threshold:  80_000_000, achievementId: 'milestone_80m_special',  rarity: 'Mythic',    title: '80M Legend',         special: true  },
  { key: '60m',  threshold:  60_000_000, achievementId: 'milestone_60m_special',  rarity: 'Mythic',    title: '60M Club',            special: true  },
  { key: '40m',  threshold:  40_000_000, achievementId: 'milestone_40m',          rarity: 'Epic',      title: 'Falco Elite',         special: false },
  { key: '30m',  threshold:  30_000_000, achievementId: 'milestone_30m',          rarity: 'Rare',      title: '30M Strong',          special: false },
  { key: '20m',  threshold:  20_000_000, achievementId: 'milestone_20m',          rarity: 'Rare',      title: 'Rising Star',         special: false },
  { key: '10m',  threshold:  10_000_000, achievementId: 'milestone_10m',          rarity: 'Common',    title: 'Monthly Idol',        special: false },
];

// ── Open databases ────────────────────────────────────────────────────────────
const storeDb = new Database(path.join(DATA_DIR, 'store.db'), { readonly: true });

const milestoneDb = new Database(path.join(DATA_DIR, 'milestones.db'));
milestoneDb.pragma('journal_mode = WAL');

const achievementDb = new Database(path.join(DATA_DIR, 'achievements.db'));
achievementDb.pragma('journal_mode = WAL');

// Ensure tables exist (created by bot on first run, but safety check)
milestoneDb.exec(`
  CREATE TABLE IF NOT EXISTS milestone_fired (
    viewer_id        TEXT    NOT NULL,
    tier_key         TEXT    NOT NULL,
    month            TEXT    NOT NULL,
    circle_id        TEXT    NOT NULL DEFAULT '',
    position         INTEGER NOT NULL DEFAULT 1,
    fired_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    channel_sent     INTEGER NOT NULL DEFAULT 0,
    dm_member_sent   INTEGER NOT NULL DEFAULT 0,
    dm_leader_sent   INTEGER NOT NULL DEFAULT 0,
    channel_msg_id   TEXT,
    channel_id       TEXT,
    guild_id         TEXT,
    PRIMARY KEY (viewer_id, tier_key, month, circle_id)
  )
`);

achievementDb.exec(`
  CREATE TABLE IF NOT EXISTS member_achievements (
    viewer_id      TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    tier_key       TEXT NOT NULL,
    month          TEXT NOT NULL,
    circle_id      TEXT NOT NULL DEFAULT '',
    position       INTEGER NOT NULL DEFAULT 1,
    earned_at      TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (viewer_id, achievement_id, month, circle_id)
  )
`);

// ── Prepared statements ───────────────────────────────────────────────────────
const insertMilestone = milestoneDb.prepare(`
  INSERT OR IGNORE INTO milestone_fired
    (viewer_id, tier_key, month, circle_id, position,
     fired_at, channel_sent, dm_member_sent, dm_leader_sent)
  VALUES (?, ?, ?, ?, 1, ?, 1, 1, 1)
`);

const insertAchievement = achievementDb.prepare(`
  INSERT OR IGNORE INTO member_achievements
    (viewer_id, achievement_id, tier_key, month, circle_id, position, earned_at)
  VALUES (?, ?, ?, ?, ?, 1, ?)
`);

// ── Get monthly totals from daily_gains ───────────────────────────────────────
const monthlyRows = storeDb.prepare(`
  SELECT
    circle_id,
    viewer_id,
    strftime('%Y-%m', date) AS month,
    SUM(gain)               AS monthly_gain
  FROM daily_gains
  GROUP BY circle_id, viewer_id, strftime('%Y-%m', date)
  HAVING SUM(gain) > 0
  ORDER BY circle_id, viewer_id, month
`).all();

console.log(`Found ${monthlyRows.length} member-month combinations with gains.\n`);

let milestonesInserted   = 0;
let achievementsInserted = 0;
let processedMonths      = 0;

const seedAll = milestoneDb.transaction(() => {
  for (const row of monthlyRows) {
    const { circle_id, viewer_id, month, monthly_gain } = row;

    // Find highest tier this member crossed this month
    const earned = TIERS.filter(t => monthly_gain >= t.threshold);
    if (!earned.length) continue;

    const highestTier = earned[0]; // TIERS is sorted highest → lowest

    // Compute a consistent fired_at for this month (last day of month)
    const [y, m] = month.split('-');
    const lastDay = new Date(parseInt(y), parseInt(m), 0); // last day
    const firedAt = `${y}-${m}-${String(lastDay.getDate()).padStart(2, '0')}T23:59:00.000Z`;

    // Insert milestone (highest tier only per member per month)
    const r = insertMilestone.run(viewer_id, highestTier.key, month, circle_id, firedAt);
    if (r.changes > 0) milestonesInserted++;

    // Insert achievements for ALL tiers crossed (builds full trophy cabinet)
    for (const tier of earned) {
      if (!tier.achievementId) continue;
      const r2 = insertAchievement.run(
        viewer_id, tier.achievementId, tier.key, month, circle_id, firedAt
      );
      if (r2.changes > 0) achievementsInserted++;
    }

    processedMonths++;
  }
});

seedAll();

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('Per-member milestone summary:');
const summaryRows = storeDb.prepare(`
  SELECT
    m.trainer_name,
    m.circle_id,
    dg.viewer_id,
    COUNT(DISTINCT strftime('%Y-%m', dg.date)) AS months_with_data,
    SUM(dg.gain) AS lifetime_gain
  FROM daily_gains dg
  JOIN members m ON m.viewer_id = dg.viewer_id AND m.circle_id = dg.circle_id
  GROUP BY dg.circle_id, dg.viewer_id
  ORDER BY lifetime_gain DESC
`).all();

for (const r of summaryRows) {
  const gain = r.lifetime_gain >= 1e9
    ? `${(r.lifetime_gain / 1e9).toFixed(2)}B`
    : r.lifetime_gain >= 1e6
      ? `${(r.lifetime_gain / 1e6).toFixed(1)}M`
      : `${Math.round(r.lifetime_gain / 1e3)}K`;
  console.log(`  ${r.trainer_name.padEnd(22)} circle=${r.circle_id}  months=${r.months_with_data}  lifetime=${gain}`);
}

storeDb.close();
milestoneDb.close();
achievementDb.close();

console.log(`
════════════════════════════════
Retroactive seeding complete!
  Months processed  : ${processedMonths}
  Milestones seeded : ${milestonesInserted}
  Achievements seeded: ${achievementsInserted}

All done — restart the bot and run /profile to see updated cards.
════════════════════════════════`);
