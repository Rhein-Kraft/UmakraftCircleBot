// @ts-check
/**
 * db/leaderboardSnapshotDb.js
 * ────────────────────────────
 * SQLite store for leaderboard snapshots and personal bests.
 *
 * Tables:
 *   leaderboard_snapshots — one row per trainer per circle per scope per date
 *   personal_bests        — one row per trainer per circle per scope (updated when beaten)
 *
 * Snapshot capture strategy:
 *   Called after every dataSync() — keyed by date (YYYY-MM-DD) so multiple
 *   syncs on the same day simply upsert / overwrite with the latest ranking.
 *   Yesterday's snapshot is therefore always the last sync of that day.
 *
 * Personal best logic:
 *   Updated automatically whenever saveSnapshot() is called.
 *   A personal best is beaten when: new rank < stored best_rank
 *   OR (same rank AND new gain > stored best_gain).
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../core/config.js';
import { log } from '../../core/log.js';
import { runMigrations } from '../../db/migrations.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(path.dirname(__dirname));

/** @type {import('better-sqlite3').Database | null} */
let db = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initLeaderboardSnapshotDb() {
  const dbPath = path.join(config.dataDir, 'leaderboard_snapshots.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      circle_id    TEXT    NOT NULL,
      scope        TEXT    NOT NULL DEFAULT 'daily',
      date         TEXT    NOT NULL,
      trainer_id   TEXT    NOT NULL,
      trainer_name TEXT    NOT NULL,
      rank         INTEGER NOT NULL,
      gain         INTEGER NOT NULL DEFAULT 0,
      total_fans   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(circle_id, scope, date, trainer_id)
    );

    CREATE INDEX IF NOT EXISTS idx_snap_circle_scope_date
      ON leaderboard_snapshots(circle_id, scope, date);
    CREATE INDEX IF NOT EXISTS idx_snap_trainer
      ON leaderboard_snapshots(circle_id, scope, trainer_id, date);

    CREATE TABLE IF NOT EXISTS personal_bests (
      circle_id     TEXT    NOT NULL,
      trainer_id    TEXT    NOT NULL,
      scope         TEXT    NOT NULL,
      best_rank     INTEGER NOT NULL,
      best_gain     INTEGER NOT NULL DEFAULT 0,
      achieved_date TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (circle_id, trainer_id, scope)
    );
  `);

  runMigrations(db, []);
  log.info('leaderboardSnapshotDb: initialized');
  return db;
}

/** @returns {boolean} */
export function isSnapshotDbInitialized() {
  return db !== null;
}

function getDb() {
  if (!db) throw new Error('leaderboardSnapshotDb: not initialized');
  return db;
}

// ── Save snapshot + update personal bests ─────────────────────────────────────

/**
 * Upsert a ranked snapshot for a given circle, scope, and date.
 * Also updates personal_bests for every trainer in the snapshot.
 *
 * @param {string} circleId
 * @param {'daily'|'weekly'|'monthly'} scope
 * @param {string} date  YYYY-MM-DD
 * @param {{ trainerId: string, trainerName: string, rank: number, gain: number, totalFans?: number }[]} rows
 */
export function saveSnapshot(circleId, scope, date, rows) {
  const upsertRow = getDb().prepare(`
    INSERT INTO leaderboard_snapshots
      (circle_id, scope, date, trainer_id, trainer_name, rank, gain, total_fans)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(circle_id, scope, date, trainer_id)
    DO UPDATE SET
      trainer_name = excluded.trainer_name,
      rank         = excluded.rank,
      gain         = excluded.gain,
      total_fans   = excluded.total_fans,
      created_at   = datetime('now')
  `);

  const upsertPB = getDb().prepare(`
    INSERT INTO personal_bests
      (circle_id, trainer_id, scope, best_rank, best_gain, achieved_date)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(circle_id, trainer_id, scope)
    DO UPDATE SET
      best_rank     = CASE WHEN excluded.best_rank < best_rank
                            OR (excluded.best_rank = best_rank AND excluded.best_gain > best_gain)
                      THEN excluded.best_rank ELSE best_rank END,
      best_gain     = CASE WHEN excluded.best_rank < best_rank
                            OR (excluded.best_rank = best_rank AND excluded.best_gain > best_gain)
                      THEN excluded.best_gain ELSE best_gain END,
      achieved_date = CASE WHEN excluded.best_rank < best_rank
                            OR (excluded.best_rank = best_rank AND excluded.best_gain > best_gain)
                      THEN excluded.achieved_date ELSE achieved_date END,
      updated_at    = datetime('now')
  `);

  const run = getDb().transaction(() => {
    for (const r of rows) {
      upsertRow.run(
        circleId, scope, date,
        String(r.trainerId), r.trainerName,
        r.rank, r.gain, r.totalFans ?? 0
      );
      upsertPB.run(
        circleId, String(r.trainerId), scope,
        r.rank, r.gain, date
      );
    }
  });
  run();
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Get a full snapshot for a specific date, sorted by rank.
 * @param {string} circleId
 * @param {string} scope
 * @param {string} date  YYYY-MM-DD
 * @returns {{ trainerId: string, trainerName: string, rank: number, gain: number, totalFans: number }[]}
 */
export function getSnapshot(circleId, scope, date) {
  return getDb()
    .prepare(`
      SELECT trainer_id AS trainerId, trainer_name AS trainerName,
             rank, gain, total_fans AS totalFans
      FROM leaderboard_snapshots
      WHERE circle_id = ? AND scope = ? AND date = ?
      ORDER BY rank ASC
    `)
    .all(circleId, scope, date);
}

/**
 * Returns dates (newest first) where a snapshot exists for this circle + scope.
 * @param {string} circleId
 * @param {string} scope
 * @param {number} [limit=30]
 * @returns {string[]}
 */
export function getAvailableDates(circleId, scope, limit = 30) {
  return getDb()
    .prepare(`
      SELECT DISTINCT date FROM leaderboard_snapshots
      WHERE circle_id = ? AND scope = ?
      ORDER BY date DESC
      LIMIT ?
    `)
    .all(circleId, scope, limit)
    .map(r => r.date);
}

/**
 * Get a trainer's rank history (most recent days first).
 * @param {string} circleId
 * @param {string} scope
 * @param {string} trainerId
 * @param {number} [days=30]
 * @returns {{ date: string, rank: number, gain: number }[]}
 */
export function getTrainerRankHistory(circleId, scope, trainerId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);
  return getDb()
    .prepare(`
      SELECT date, rank, gain
      FROM leaderboard_snapshots
      WHERE circle_id = ? AND scope = ? AND trainer_id = ? AND date >= ?
      ORDER BY date DESC
    `)
    .all(circleId, scope, String(trainerId), sinceStr);
}

/**
 * Get a trainer's personal best for a scope.
 * @param {string} circleId
 * @param {string} scope
 * @param {string} trainerId
 * @returns {{ bestRank: number, bestGain: number, achievedDate: string } | null}
 */
export function getPersonalBest(circleId, scope, trainerId) {
  const row = getDb()
    .prepare(`
      SELECT best_rank AS bestRank, best_gain AS bestGain, achieved_date AS achievedDate
      FROM personal_bests
      WHERE circle_id = ? AND trainer_id = ? AND scope = ?
    `)
    .get(circleId, String(trainerId), scope);
  return row ?? null;
}

// ── Profile extended stats ─────────────────────────────────────────────────────

/**
 * Count how many times this trainer finished #1 in a given scope.
 * @param {string} circleId
 * @param {string} trainerId
 * @param {'daily'|'weekly'|'monthly'} [scope='monthly']
 * @returns {number}
 */
export function getNo1Finishes(circleId, trainerId, scope = 'monthly') {
  const row = getDb()
    .prepare(`
      SELECT COUNT(*) AS cnt
      FROM leaderboard_snapshots
      WHERE circle_id = ? AND trainer_id = ? AND scope = ? AND rank = 1
    `)
    .get(circleId, String(trainerId), scope);
  return row?.cnt ?? 0;
}

/**
 * Average monthly ranking for a trainer across all snapshot dates.
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {number | null}
 */
export function getAvgMonthlyRank(circleId, trainerId) {
  const row = getDb()
    .prepare(`
      SELECT ROUND(AVG(rank)) AS avg_rank
      FROM leaderboard_snapshots
      WHERE circle_id = ? AND trainer_id = ? AND scope = 'monthly'
    `)
    .get(circleId, String(trainerId));
  const v = row?.avg_rank;
  return (v != null && !isNaN(v)) ? Math.round(v) : null;
}

/**
 * Get all personal bests for a circle + scope, keyed by trainerId.
 * @param {string} circleId
 * @param {string} scope
 * @returns {Record<string, { bestRank: number, bestGain: number, achievedDate: string }>}
 */
export function getAllPersonalBests(circleId, scope) {
  const rows = getDb()
    .prepare(`
      SELECT trainer_id AS trainerId, best_rank AS bestRank,
             best_gain AS bestGain, achieved_date AS achievedDate
      FROM personal_bests
      WHERE circle_id = ? AND scope = ?
    `)
    .all(circleId, scope);
  return Object.fromEntries(rows.map(r => [r.trainerId, {
    bestRank: r.bestRank, bestGain: r.bestGain, achievedDate: r.achievedDate,
  }]));
}
