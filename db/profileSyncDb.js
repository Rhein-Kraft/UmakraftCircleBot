// @ts-check
/**
 * db/profileSyncDb.js
 * ────────────────────
 * Sync-state tracking for the monthly historical import.
 *
 * Table: profile_month_sync
 *   circle_id    — which circle
 *   year         — 4-digit year
 *   month        — 1-12
 *   status       — pending | syncing | completed | failed
 *   processed_at — ISO timestamp of last status change
 *
 * Restart safety:
 *   Any row still in `syncing` status on startup was interrupted mid-run.
 *   Call resetStuckRows() during init to return them to `pending` so they
 *   are retried on the next scheduled sync pass.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from '../core/config.js';
import { log } from '../core/log.js';
import { runMigrations } from './migrations.js';

/** @type {import('better-sqlite3').Database | null} */
let db = null;

function getDb() {
  if (!db) throw new Error('profileSyncDb: not initialized — call initProfileSyncDb() first');
  return db;
}

export function initProfileSyncDb() {
  mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, 'profile_sync.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_month_sync (
      circle_id    TEXT    NOT NULL,
      year         INTEGER NOT NULL,
      month        INTEGER NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'pending',
      processed_at TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (circle_id, year, month)
    )
  `);

  runMigrations(db, []);

  // Restart safety: any row stuck in 'syncing' was interrupted — reset to pending.
  const stuck = getDb()
    .prepare(`UPDATE profile_month_sync SET status = 'pending', processed_at = datetime('now') WHERE status = 'syncing'`)
    .run();
  if (stuck.changes > 0) {
    log.info(`profileSyncDb: reset ${stuck.changes} stuck syncing row(s) → pending`);
  }

  log.info('profileSyncDb: initialized');
  return db;
}

/**
 * @param {string} circleId
 * @param {number} year
 * @param {number} month
 * @returns {boolean}
 */
export function isMonthSynced(circleId, year, month) {
  const row = getDb()
    .prepare(`SELECT status FROM profile_month_sync WHERE circle_id = ? AND year = ? AND month = ?`)
    .get(circleId, year, month);
  return row?.status === 'completed';
}

/**
 * @param {string} circleId
 * @param {number} year
 * @param {number} month
 */
export function markMonthPending(circleId, year, month) {
  getDb().prepare(`
    INSERT INTO profile_month_sync (circle_id, year, month, status, processed_at)
    VALUES (?, ?, ?, 'pending', datetime('now'))
    ON CONFLICT(circle_id, year, month) DO UPDATE SET
      status = 'pending',
      processed_at = datetime('now')
    WHERE status != 'completed'
  `).run(circleId, year, month);
}

/**
 * @param {string} circleId
 * @param {number} year
 * @param {number} month
 */
export function markMonthSyncing(circleId, year, month) {
  getDb().prepare(`
    INSERT INTO profile_month_sync (circle_id, year, month, status, processed_at)
    VALUES (?, ?, ?, 'syncing', datetime('now'))
    ON CONFLICT(circle_id, year, month) DO UPDATE SET
      status = 'syncing',
      processed_at = datetime('now')
  `).run(circleId, year, month);
}

/**
 * @param {string} circleId
 * @param {number} year
 * @param {number} month
 */
export function markMonthCompleted(circleId, year, month) {
  getDb().prepare(`
    INSERT INTO profile_month_sync (circle_id, year, month, status, processed_at)
    VALUES (?, ?, ?, 'completed', datetime('now'))
    ON CONFLICT(circle_id, year, month) DO UPDATE SET
      status = 'completed',
      processed_at = datetime('now')
  `).run(circleId, year, month);
}

/**
 * @param {string} circleId
 * @param {number} year
 * @param {number} month
 */
export function markMonthFailed(circleId, year, month) {
  getDb().prepare(`
    INSERT INTO profile_month_sync (circle_id, year, month, status, processed_at)
    VALUES (?, ?, ?, 'failed', datetime('now'))
    ON CONFLICT(circle_id, year, month) DO UPDATE SET
      status = 'failed',
      processed_at = datetime('now')
  `).run(circleId, year, month);
}

/**
 * Returns all (circleId, year, month) rows with status = 'pending'.
 * @returns {{ circleId: string, year: number, month: number }[]}
 */
export function getPendingMonths() {
  return getDb()
    .prepare(`SELECT circle_id AS circleId, year, month FROM profile_month_sync WHERE status = 'pending' ORDER BY year, month`)
    .all();
}

/**
 * Returns a summary of sync status for all tracked months.
 * @returns {{ circleId: string, year: number, month: number, status: string, processedAt: string }[]}
 */
export function getAllSyncStatus() {
  return getDb()
    .prepare(`SELECT circle_id AS circleId, year, month, status, processed_at AS processedAt FROM profile_month_sync ORDER BY year DESC, month DESC`)
    .all();
}
