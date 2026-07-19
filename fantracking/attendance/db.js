/**
 * db/attendanceDb.js
 * ──────────────────
 * Tracks per-user per-day attendance and consecutive login streaks.
 *
 * Tables:
 *   attendance(user_id, guild_id, circle_id, date, first_seen)
 *   user_streaks(user_id, guild_id, circle_id, streak, last_date)
 *
 * circle_id scopes attendance to the uma.moe circle the user belongs to.
 * Existing rows (pre-migration) are stamped with '' (empty string = main circle
 * legacy fallback) and continue to work transparently.
 *
 * markAttendance() returns { isFirstToday, streak } so callers can decide
 * whether to post a login notification and what streak badge to show.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { config } from '../../core/config.js';
import { log } from '../../core/log.js';

const TZ = 'Asia/Tokyo';

let db;

export function initAttendanceDb() {
  const dbPath = path.join(config.dataDir, 'attendance.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Create tables (legacy schema only — no circle_id yet) ────────────────
  // We create with the old schema first so IF NOT EXISTS is safe on both
  // fresh installs and existing DBs. Migration runs next to add circle_id.
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      user_id    TEXT NOT NULL,
      guild_id   TEXT NOT NULL,
      date       TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      PRIMARY KEY (user_id, guild_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_att_date  ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_att_guild ON attendance(guild_id, date);
    CREATE INDEX IF NOT EXISTS idx_att_user  ON attendance(user_id, date);

    CREATE TABLE IF NOT EXISTS user_streaks (
      user_id   TEXT NOT NULL,
      guild_id  TEXT NOT NULL,
      streak    INTEGER NOT NULL DEFAULT 1,
      last_date TEXT NOT NULL,
      PRIMARY KEY (user_id, guild_id)
    );
  `);

  // ── Migration: add circle_id to existing databases ────────────────────────
  const attCols = db.pragma('table_info(attendance)').map(r => r.name);
  const strCols = db.pragma('table_info(user_streaks)').map(r => r.name);

  if (!attCols.includes('circle_id')) {
    log.info('attendanceDb: migrating attendance table — adding circle_id...');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE attendance_new (
          user_id    TEXT NOT NULL,
          guild_id   TEXT NOT NULL,
          circle_id  TEXT NOT NULL DEFAULT '',
          date       TEXT NOT NULL,
          first_seen TEXT NOT NULL,
          PRIMARY KEY (user_id, guild_id, circle_id, date)
        );
        INSERT INTO attendance_new (user_id, guild_id, circle_id, date, first_seen)
          SELECT user_id, guild_id, '', date, first_seen FROM attendance;
        DROP TABLE attendance;
        ALTER TABLE attendance_new RENAME TO attendance;
      `);
    })();
    log.info('attendanceDb: attendance migration complete');
  }

  if (!strCols.includes('circle_id')) {
    log.info('attendanceDb: migrating user_streaks table — adding circle_id...');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE user_streaks_new (
          user_id   TEXT NOT NULL,
          guild_id  TEXT NOT NULL,
          circle_id TEXT NOT NULL DEFAULT '',
          streak    INTEGER NOT NULL DEFAULT 1,
          last_date TEXT NOT NULL,
          PRIMARY KEY (user_id, guild_id, circle_id)
        );
        INSERT INTO user_streaks_new (user_id, guild_id, circle_id, streak, last_date)
          SELECT user_id, guild_id, '', streak, last_date FROM user_streaks;
        DROP TABLE user_streaks;
        ALTER TABLE user_streaks_new RENAME TO user_streaks;
      `);
    })();
    log.info('attendanceDb: user_streaks migration complete');
  }

  // ── Ensure all indexes exist (safe after migration) ───────────────────────
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_att_date   ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_att_guild  ON attendance(guild_id, date);
    CREATE INDEX IF NOT EXISTS idx_att_user   ON attendance(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_att_circle ON attendance(circle_id, date);
  `);

  // ── Migration: add max_streak column ──────────────────────────────────────
  const strColsFinal = db.pragma('table_info(user_streaks)').map(r => r.name);
  if (!strColsFinal.includes('max_streak')) {
    db.exec(`ALTER TABLE user_streaks ADD COLUMN max_streak INTEGER NOT NULL DEFAULT 0`);
    db.exec(`UPDATE user_streaks SET max_streak = streak`);
    log.info('attendanceDb: added max_streak column and backfilled from current streak');
  }

  log.info('attendanceDb: initialized');
}

function getDb() {
  if (!db) throw new Error('attendanceDb not initialized');
  return db;
}

// ── Streak helpers ─────────────────────────────────────────────────────────────

/** Returns yesterday's date string in JST (YYYY-MM-DD). */
function jstYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * Update or create a streak row for this user in this circle.
 * Returns the new streak count.
 */
function updateStreak(userId, guildId, circleId, today) {
  const row = getDb()
    .prepare(
      'SELECT streak, last_date FROM user_streaks WHERE user_id=? AND guild_id=? AND circle_id=?'
    )
    .get(userId, guildId, circleId);

  if (!row) {
    getDb()
      .prepare(
        'INSERT INTO user_streaks (user_id, guild_id, circle_id, streak, max_streak, last_date) VALUES (?,?,?,1,1,?)'
      )
      .run(userId, guildId, circleId, today);
    return 1;
  }

  if (row.last_date === today) return row.streak;

  const newStreak = row.last_date === jstYesterday() ? row.streak + 1 : 1;
  getDb()
    .prepare(
      'UPDATE user_streaks SET streak=?, last_date=?, max_streak=CASE WHEN ?>max_streak THEN ? ELSE max_streak END WHERE user_id=? AND guild_id=? AND circle_id=?'
    )
    .run(newStreak, today, newStreak, newStreak, userId, guildId, circleId);
  return newStreak;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Mark a user as active today for a specific circle.
 *
 * Returns { isFirstToday: boolean, streak: number }
 *
 * @param {string} userId
 * @param {string} guildId
 * @param {string} circleId  — uma.moe circle ID (empty string = legacy/unknown)
 * @param {string} date      — YYYY-MM-DD in JST
 * @param {string} firstSeen — human-readable time for the log row
 */
export function markAttendance(userId, guildId, circleId, date, firstSeen) {
  const existing = getDb()
    .prepare('SELECT 1 FROM attendance WHERE user_id=? AND guild_id=? AND circle_id=? AND date=?')
    .get(userId, guildId, circleId, date);

  if (existing) {
    const streakRow = getDb()
      .prepare('SELECT streak FROM user_streaks WHERE user_id=? AND guild_id=? AND circle_id=?')
      .get(userId, guildId, circleId);
    return { isFirstToday: false, streak: streakRow?.streak ?? 1 };
  }

  // Wrap the attendance INSERT and streak UPDATE in a single transaction so
  // a crash between the two statements can never leave them out of sync.
  const run = getDb().transaction(() => {
    getDb()
      .prepare(
        'INSERT OR IGNORE INTO attendance (user_id, guild_id, circle_id, date, first_seen) VALUES (?,?,?,?,?)'
      )
      .run(userId, guildId, circleId, date, firstSeen);
    return updateStreak(userId, guildId, circleId, date);
  });

  const streak = run();
  return { isFirstToday: true, streak };
}

/**
 * Return the current login streak for a user in a given circle.
 *
 * @param {string} userId
 * @param {string} guildId
 * @param {string} [circleId='']
 */
export function getStreak(userId, guildId, circleId = '') {
  const row = getDb()
    .prepare('SELECT streak FROM user_streaks WHERE user_id=? AND guild_id=? AND circle_id=?')
    .get(userId, guildId, circleId);
  return row?.streak ?? 0;
}

/**
 * Return the all-time maximum login streak for a user in a given circle.
 *
 * @param {string} userId
 * @param {string} guildId
 * @param {string} [circleId='']
 */
export function getMaxStreak(userId, guildId, circleId = '') {
  const row = getDb()
    .prepare('SELECT max_streak FROM user_streaks WHERE user_id=? AND guild_id=? AND circle_id=?')
    .get(userId, guildId, circleId);
  return row?.max_streak ?? 0;
}

/**
 * Return all attendance rows for a given guild, circle, and date.
 *
 * @param {string} guildId
 * @param {string} date      — YYYY-MM-DD
 * @param {string} [circleId='']
 */
export function getAttendanceForDate(guildId, date, circleId = '') {
  return getDb()
    .prepare(
      'SELECT user_id, first_seen FROM attendance WHERE guild_id=? AND circle_id=? AND date=? ORDER BY first_seen ASC'
    )
    .all(guildId, circleId, date);
}

/**
 * Prune attendance rows older than retentionDays.
 */
export function pruneAttendance(retentionDays = 90) {
  const result = getDb()
    .prepare(`DELETE FROM attendance WHERE date < date('now', '-' || ? || ' days')`)
    .run(retentionDays);
  if (result.changes > 0) log.info(`attendanceDb: pruned ${result.changes} old row(s)`);
}
