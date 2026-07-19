// @ts-check
/**
 * db/achievementDb.js
 * ────────────────────
 * Tracks earned achievements per member, derived from milestone_fired.
 *
 * Populated automatically when milestones fire (tasks/milestones.js).
 * Backfilled from existing milestone_fired rows on first boot so veteran
 * members get correct histories immediately.
 *
 * achievement_id values are the stable IDs from tasks/milestone-tiers.js
 * tier.achievement.id — treat them as permanent foreign keys.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { config } from '../../core/config.js';
import { log } from '../../core/log.js';
import { TIERS } from '../milestone/tiers.js';

/** @type {import('better-sqlite3').Database | null} */
let db = null;

const TIER_ACHIEVEMENT_MAP = new Map(
  TIERS.filter(t => t.achievement).map(t => [t.key, t.achievement])
);

// ── Init ──────────────────────────────────────────────────────────────────────

export function initAchievementDb() {
  const dbPath = path.join(config.dataDir, 'achievements.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS member_achievements (
      viewer_id      TEXT    NOT NULL,
      achievement_id TEXT    NOT NULL,
      tier_key       TEXT    NOT NULL,
      month          TEXT    NOT NULL,
      circle_id      TEXT    NOT NULL DEFAULT '',
      position       INTEGER NOT NULL DEFAULT 1,
      earned_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (viewer_id, achievement_id, month, circle_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ma_viewer ON member_achievements(viewer_id);
    CREATE INDEX IF NOT EXISTS idx_ma_tier   ON member_achievements(tier_key, month, circle_id);
  `);

  _backfillFromMilestones();
  log.info('achievementDb: initialized');
  return db;
}

export function isAchievementDbInitialized() { return db !== null; }

function getDb() {
  if (!db) throw new Error('achievementDb: not initialized — call initAchievementDb() first');
  return db;
}

// ── Backfill from existing milestone_fired rows ────────────────────────────────

function _backfillFromMilestones() {
  const milestonesPath = path.join(config.dataDir, 'milestones.db');
  let milestonesDb;
  try {
    milestonesDb = new Database(milestonesPath, { readonly: true });
  } catch {
    return;
  }

  let rows;
  try {
    rows = milestonesDb.prepare('SELECT * FROM milestone_fired').all();
  } catch {
    milestonesDb.close();
    return;
  }
  milestonesDb.close();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO member_achievements
      (viewer_id, achievement_id, tier_key, month, circle_id, position, earned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    let count = 0;
    for (const row of rows) {
      const achievement = TIER_ACHIEVEMENT_MAP.get(row.tier_key);
      if (!achievement) continue;
      insert.run(
        row.viewer_id, achievement.id, row.tier_key,
        row.month, row.circle_id ?? '', row.position ?? 1,
        row.fired_at ?? new Date().toISOString()
      );
      count++;
    }
    return count;
  });

  const n = run();
  if (n > 0) log.info(`achievementDb: backfilled ${n} achievement(s) from milestone_fired`);
}

// ── Record achievement ─────────────────────────────────────────────────────────

/**
 * Record an earned achievement. INSERT OR IGNORE — safe to call multiple times.
 * @param {string} viewerId
 * @param {string} achievementId  — stable ID from tier.achievement.id
 * @param {string} tierKey
 * @param {string} month          — YYYY-MM
 * @param {string} circleId
 * @param {number} [position=1]
 */
export function recordAchievement(viewerId, achievementId, tierKey, month, circleId, position = 1) {
  if (!achievementId) return;
  getDb().prepare(`
    INSERT OR IGNORE INTO member_achievements
      (viewer_id, achievement_id, tier_key, month, circle_id, position, earned_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(String(viewerId), achievementId, tierKey, month, circleId ?? '', position);
}

// ── Queries ────────────────────────────────────────────────────────────────────

/**
 * Get all achievements earned by a viewer (all circles), newest first.
 * Result rows are merged with tier achievement metadata (rarity, badge, title, etc.)
 * @param {string} viewerId
 * @returns {Array<object>}
 */
export function getMemberAchievements(viewerId) {
  const rows = getDb()
    .prepare(`
      SELECT achievement_id, tier_key, month, circle_id, position, earned_at
      FROM member_achievements
      WHERE viewer_id = ?
      ORDER BY earned_at DESC
    `)
    .all(String(viewerId));

  return rows.map(r => {
    const achievement = TIER_ACHIEVEMENT_MAP.get(r.tier_key) ?? {};
    return { ...r, ...achievement };
  });
}

/**
 * Summary of achievements earned by a viewer.
 * @param {string} viewerId
 * @returns {{ total: number, uniqueEarned: number, totalPossible: number, completionPct: number, byRarity: Record<string, number> }}
 */
export function getAchievementSummary(viewerId) {
  const rows = getMemberAchievements(viewerId);
  const byRarity = { Common: 0, Rare: 0, Epic: 0, Mythic: 0, Legendary: 0 };
  for (const r of rows) {
    if (r.rarity && byRarity[r.rarity] !== undefined) byRarity[r.rarity]++;
  }
  const totalPossible = TIERS.filter(t => t.achievement).length;
  const uniqueEarned  = new Set(rows.map(r => r.achievement_id)).size;
  const completionPct = totalPossible > 0
    ? Math.round((uniqueEarned / totalPossible) * 100)
    : 0;
  return { total: rows.length, uniqueEarned, totalPossible, completionPct, byRarity };
}
