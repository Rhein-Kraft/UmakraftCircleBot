/**
 * SQLite-backed persistent cache for timeline event deduplication.
 *
 * Survives Railway redeploys and Replit restarts because the DB file lives in
 * DATA_DIR (which should be a mounted volume on Railway).
 */
import Database from 'better-sqlite3';
import path from 'path';
import { config } from '../core/config.js';
import { log } from '../core/log.js';

let db;

export function initTimelineCache() {
  const dbPath = path.join(config.dataDir, 'timeline.db');
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS posted_events (
      event_id  TEXT PRIMARY KEY,
      title     TEXT,
      url       TEXT,
      posted_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS timeline_state (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS timeline_messages (
      event_id   TEXT NOT NULL,
      guild_id   TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      PRIMARY KEY (event_id, guild_id)
    );
  `);

  // Migrations: add columns if they don't exist yet.
  for (const col of [
    `ALTER TABLE posted_events ADD COLUMN end_date TEXT`,
    `ALTER TABLE posted_events ADD COLUMN start_date TEXT`,
    `ALTER TABLE posted_events ADD COLUMN meta_json TEXT`,
    // Tracks whether the "starting soon" reminder has been sent for this event.
    `ALTER TABLE posted_events ADD COLUMN upcoming_reminded INTEGER NOT NULL DEFAULT 0`,
  ]) {
    try {
      db.exec(col);
    } catch {
      /* already exists */
    }
  }

  log.info('timelineCache: initialized');
  return db;
}

function getDb() {
  if (!db) throw new Error('Timeline cache not initialized. Call initTimelineCache() first.');
  return db;
}

/** Returns true if this event has already been posted. */
export function hasPosted(eventId) {
  return !!getDb().prepare('SELECT 1 FROM posted_events WHERE event_id = ?').get(eventId);
}

/** Mark an event as posted so it is never re-sent after a restart. */
export function markPosted(eventId, title, url, endDate = null, startDate = null, metaJson = null) {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO posted_events
         (event_id, title, url, end_date, start_date, meta_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(eventId, title ?? '', url ?? '', endDate ?? null, startDate ?? null, metaJson ?? null);
}

/**
 * Insert or UPDATE an event's metadata — always overwrites meta_json so that
 * events registered by the old code (meta_json = NULL) get backfilled on the
 * next scrape cycle.
 */
export function upsertEventMeta(
  eventId,
  title,
  url,
  endDate = null,
  startDate = null,
  metaJson = null
) {
  getDb()
    .prepare(
      `INSERT INTO posted_events (event_id, title, url, end_date, start_date, meta_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id) DO UPDATE SET
         title      = excluded.title,
         url        = excluded.url,
         end_date   = excluded.end_date,
         start_date = excluded.start_date,
         meta_json  = excluded.meta_json`
    )
    .run(eventId, title ?? '', url ?? '', endDate ?? null, startDate ?? null, metaJson ?? null);
}

/** Store the Discord message ID for a posted event so it can be cleaned up later. */
export function storeEventMessage(eventId, guildId, channelId, messageId) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO timeline_messages (event_id, guild_id, channel_id, message_id)
       VALUES (?, ?, ?, ?)`
    )
    .run(eventId, guildId, channelId, messageId);
}

/**
 * Returns all tracked messages for events whose end_date is in the past.
 * Each row: { event_id, guild_id, channel_id, message_id }
 */
export function getExpiredMessages() {
  return getDb()
    .prepare(
      `SELECT m.event_id, m.guild_id, m.channel_id, m.message_id
       FROM timeline_messages m
       INNER JOIN posted_events e ON e.event_id = m.event_id
       WHERE e.end_date IS NOT NULL
         AND datetime(e.end_date) < datetime('now')`
    )
    .all();
}

/**
 * Returns all tracked messages for active (non-expired) events with their metadata.
 * Each row: { event_id, guild_id, channel_id, message_id, title, url, start_date, end_date, meta_json }
 */
export function getActiveMessages() {
  return getDb()
    .prepare(
      `SELECT m.event_id, m.guild_id, m.channel_id, m.message_id,
              e.title, e.url, e.start_date, e.end_date, e.meta_json
       FROM timeline_messages m
       INNER JOIN posted_events e ON e.event_id = m.event_id
       WHERE e.end_date IS NULL
          OR datetime(e.end_date) > datetime('now')`
    )
    .all();
}

/** Remove all tracked messages for a given event (after deletion). */
export function deleteEventMessages(eventId) {
  getDb().prepare('DELETE FROM timeline_messages WHERE event_id = ?').run(eventId);
}

/**
 * Mark a "starting soon" reminder as sent for this event so it isn't repeated.
 */
export function markUpcomingReminded(eventId) {
  getDb().prepare('UPDATE posted_events SET upcoming_reminded = 1 WHERE event_id = ?').run(eventId);
}

/**
 * Return all posted events that:
 *   - Have a start_date within the next `windowHours` hours
 *   - Have NOT been reminded yet (upcoming_reminded = 0)
 *   - Have NOT already ended
 *   - Have full metadata (meta_json not null)
 *
 * Each row: { event_id, title, url, start_date, end_date, meta_json }
 */
export function getUpcomingToRemind(windowHours = 48) {
  const windowSec = windowHours * 3600;
  return getDb()
    .prepare(
      `SELECT event_id, title, url, start_date, end_date, meta_json
       FROM posted_events
       WHERE upcoming_reminded = 0
         AND meta_json IS NOT NULL
         AND start_date IS NOT NULL
         AND datetime(start_date) > datetime('now')
         AND datetime(start_date) <= datetime('now', '+' || ? || ' seconds')
         AND (end_date IS NULL OR datetime(end_date) > datetime('now'))`
    )
    .all(windowSec);
}

/**
 * Delete ALL tracked message rows (used before a full channel repopulation).
 */
export function clearAllMessageRows() {
  getDb().prepare('DELETE FROM timeline_messages').run();
}

/**
 * Return all posted events that are still active (not ended) with their metadata.
 */
export function getAllActiveEvents() {
  return getDb()
    .prepare(
      `SELECT event_id, title, url, start_date, end_date, meta_json
       FROM posted_events
       WHERE meta_json IS NOT NULL
         AND (end_date IS NULL OR datetime(end_date) > datetime('now'))
       ORDER BY start_date ASC`
    )
    .all();
}

/** Prune events older than retentionDays to prevent unbounded growth. */
export function pruneOldEvents(retentionDays = 90) {
  const result = getDb()
    .prepare(
      `DELETE FROM posted_events
       WHERE posted_at < datetime('now', '-' || ? || ' days')`
    )
    .run(retentionDays);
  if (result.changes > 0) {
    log.debug(`timelineCache: pruned ${result.changes} old event(s)`);
  }
}

export function getState(key) {
  const row = getDb().prepare('SELECT value FROM timeline_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setState(key, value) {
  getDb()
    .prepare('INSERT OR REPLACE INTO timeline_state (key, value) VALUES (?, ?)')
    .run(key, value == null ? '' : String(value));
}
