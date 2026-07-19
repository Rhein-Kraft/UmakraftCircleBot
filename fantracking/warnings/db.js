// @ts-check
/**
 * db/warningDb.js
 * ───────────────
 * SQLite store for the intelligent warning system.
 *
 * Tables:
 *   warning_state   — current warning level per (circle, trainer, date).
 *                     Updated every engine run; drives cooldown/escalation logic.
 *   warning_history — append-only audit log of every warning event.
 *
 * Anti-spam design (mirrors milestoneDb pattern):
 *   - Level-change escalation:  only send a DM when level rises.
 *   - Cooldown via last_dm_level: same level → no second DM.
 *   - Recovery flag:  exactly one recovery DM per trainer per day.
 *   - Final flag:     exactly one final-reminder DM per trainer per day.
 *   - Date-scoped:    all state resets automatically each JST day.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { config } from '../../core/config.js';
import { log } from '../../core/log.js';
import { runMigrations } from '../../db/migrations.js';

/** @type {import('better-sqlite3').Database | null} */
let db = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initWarningDb() {
  const dbPath = path.join(config.dataDir, 'warnings.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS warning_state (
      circle_id      TEXT    NOT NULL,
      trainer_id     TEXT    NOT NULL,
      date           TEXT    NOT NULL,
      level          TEXT    NOT NULL DEFAULT 'safe',
      last_dm_level  TEXT,
      last_dm_at     TEXT,
      recovery_sent  INTEGER NOT NULL DEFAULT 0,
      final_sent     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (circle_id, trainer_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_ws_date  ON warning_state(circle_id, date);

    CREATE TABLE IF NOT EXISTS warning_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      circle_id      TEXT    NOT NULL,
      trainer_id     TEXT    NOT NULL,
      trainer_name   TEXT,
      date           TEXT    NOT NULL,
      level          TEXT    NOT NULL,
      current_gain   INTEGER NOT NULL DEFAULT 0,
      expected_gain  INTEGER NOT NULL DEFAULT 0,
      quota          INTEGER NOT NULL DEFAULT 0,
      deficit        INTEGER NOT NULL DEFAULT 0,
      remaining      INTEGER NOT NULL DEFAULT 0,
      dm_sent        INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_wh_date ON warning_history(circle_id, date);
  `);

  runMigrations(db, []);
  log.info('warningDb: initialized');
}

export function isWarningDbInitialized() {
  return db !== null;
}

function getDb() {
  if (!db) throw new Error('warningDb: not initialized');
  return db;
}

// ── Warning state ─────────────────────────────────────────────────────────────

/**
 * @param {string} circleId
 * @param {string} trainerId
 * @param {string} date YYYY-MM-DD
 * @returns {{ level: string, last_dm_level: string|null, last_dm_at: string|null, recovery_sent: number, final_sent: number } | null}
 */
export function getWarningState(circleId, trainerId, date) {
  return getDb()
    .prepare(`SELECT * FROM warning_state WHERE circle_id=? AND trainer_id=? AND date=?`)
    .get(circleId, String(trainerId), date) ?? null;
}

/**
 * Upsert the current warning state for a trainer.
 * @param {string} circleId
 * @param {string} trainerId
 * @param {string} date
 * @param {{ level?: string, last_dm_level?: string, last_dm_at?: string, recovery_sent?: number, final_sent?: number }} patch
 */
export function upsertWarningState(circleId, trainerId, date, patch) {
  const existing = getWarningState(circleId, trainerId, date);
  if (!existing) {
    getDb()
      .prepare(`
        INSERT INTO warning_state (circle_id, trainer_id, date, level, last_dm_level, last_dm_at, recovery_sent, final_sent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        circleId, String(trainerId), date,
        patch.level ?? 'safe',
        patch.last_dm_level ?? null,
        patch.last_dm_at ?? null,
        patch.recovery_sent ?? 0,
        patch.final_sent ?? 0,
      );
  } else {
    const fields = [];
    const vals = [];
    for (const [k, v] of Object.entries(patch)) {
      fields.push(`${k} = ?`);
      vals.push(v);
    }
    if (fields.length === 0) return;
    vals.push(circleId, String(trainerId), date);
    getDb().prepare(`UPDATE warning_state SET ${fields.join(', ')} WHERE circle_id=? AND trainer_id=? AND date=?`).run(...vals);
  }
}

/**
 * Returns all non-safe warning states for a circle on a date.
 * Used to build the officer summary.
 * @param {string} circleId
 * @param {string} date
 */
export function getActiveWarningsForDate(circleId, date) {
  return getDb()
    .prepare(`SELECT * FROM warning_state WHERE circle_id=? AND date=? AND level != 'safe' ORDER BY trainer_id`)
    .all(circleId, date);
}

// ── Warning history ───────────────────────────────────────────────────────────

/**
 * @param {string} circleId
 * @param {string} trainerId
 * @param {string} trainerName
 * @param {string} date
 * @param {string} level
 * @param {{ currentGain: number, expectedGain: number, quota: number, deficit: number, remaining: number }} gainData
 * @param {boolean} dmSent
 */
export function insertWarningHistory(circleId, trainerId, trainerName, date, level, gainData, dmSent) {
  getDb()
    .prepare(`
      INSERT INTO warning_history
        (circle_id, trainer_id, trainer_name, date, level, current_gain, expected_gain, quota, deficit, remaining, dm_sent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      circleId, String(trainerId), trainerName, date, level,
      gainData.currentGain, gainData.expectedGain, gainData.quota,
      gainData.deficit, gainData.remaining,
      dmSent ? 1 : 0,
    );
}

/**
 * Count the number of times a trainer has recovered from a warning in the
 * stored history (level = 'recovered' rows in warning_history).
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {number}
 */
export function getWarningRecoveryCount(circleId, trainerId) {
  const row = getDb()
    .prepare(`
      SELECT COUNT(*) AS c FROM warning_history
      WHERE circle_id = ? AND trainer_id = ? AND level = 'recovered'
    `)
    .get(circleId, String(trainerId));
  return row?.c ?? 0;
}

/**
 * Prune history older than `days` days.
 * @param {number} days
 */
export function pruneWarningHistory(days = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const { changes } = getDb()
    .prepare(`DELETE FROM warning_state WHERE date < ?`)
    .run(cutoffStr);
  getDb()
    .prepare(`DELETE FROM warning_history WHERE date < ?`)
    .run(cutoffStr);
  if (changes > 0) log.info(`warningDb: pruned ${changes} old records before ${cutoffStr}`);
}
