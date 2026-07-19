// @ts-check
/**
 * db/stadiumDb.js
 * ───────────────
 * SQLite-backed cache for Team Stadium data scraped from uma.moe.
 *
 * Table: stadium_cache
 *   viewer_id   TEXT PK  — uma.moe trainer ID
 *   data_json   TEXT     — JSON blob: { stadiumClass, horses, topHorses, scrapedAt, source }
 *   fetched_at  TEXT     — ISO timestamp of last successful scrape
 *   error_at    TEXT     — ISO timestamp of last failed attempt (nullable)
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
  if (!db) throw new Error('stadiumDb: not initialized — call initStadiumDb() first');
  return db;
}

export function initStadiumDb() {
  mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, 'stadium.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS stadium_cache (
      viewer_id   TEXT PRIMARY KEY,
      data_json   TEXT NOT NULL DEFAULT '{}',
      fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
      error_at    TEXT
    )
  `);

  runMigrations(db, []);

  log.info('stadiumDb: initialized');
  return db;
}

/**
 * Write or update a stadium cache entry.
 * @param {string} viewerId
 * @param {object} data  — { stadiumClass, horses, topHorses, scrapedAt, source }
 */
export function setStadiumCache(viewerId, data) {
  getDb()
    .prepare(`
      INSERT INTO stadium_cache (viewer_id, data_json, fetched_at, error_at)
      VALUES (?, ?, datetime('now'), NULL)
      ON CONFLICT(viewer_id) DO UPDATE SET
        data_json  = excluded.data_json,
        fetched_at = excluded.fetched_at,
        error_at   = NULL
    `)
    .run(String(viewerId), JSON.stringify(data));
}

/**
 * Record a failed scrape attempt without overwriting existing good data.
 * @param {string} viewerId
 */
export function recordStadiumError(viewerId) {
  getDb()
    .prepare(`
      INSERT INTO stadium_cache (viewer_id, data_json, fetched_at, error_at)
      VALUES (?, '{}', datetime('now'), datetime('now'))
      ON CONFLICT(viewer_id) DO UPDATE SET error_at = datetime('now')
    `)
    .run(String(viewerId));
}

/**
 * Get cached stadium data for a trainer.
 * @param {string} viewerId
 * @returns {{ data: object, fetchedAt: string } | null}
 */
export function getStadiumCache(viewerId) {
  const row = getDb()
    .prepare('SELECT data_json, fetched_at FROM stadium_cache WHERE viewer_id = ?')
    .get(String(viewerId));
  if (!row) return null;
  try {
    return { data: JSON.parse(row.data_json), fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

/**
 * Returns viewer_ids whose cache is missing or older than maxAgeHours.
 * @param {string[]} viewerIds
 * @param {number}   maxAgeHours
 * @returns {string[]}
 */
export function getStaleViewerIds(viewerIds, maxAgeHours = 22) {
  if (!viewerIds.length) return [];
  const placeholders = viewerIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`
      SELECT viewer_id, fetched_at FROM stadium_cache
      WHERE viewer_id IN (${placeholders})
    `)
    .all(...viewerIds);

  const cached = new Map(rows.map(r => [r.viewer_id, r.fetched_at]));
  const cutoff  = new Date(Date.now() - maxAgeHours * 3_600_000).toISOString();

  return viewerIds.filter(id => {
    const at = cached.get(id);
    return !at || at < cutoff;
  });
}

/**
 * Delete a single cache entry (forces re-scrape on next sync).
 * @param {string} viewerId
 */
export function clearStadiumCache(viewerId) {
  getDb()
    .prepare('DELETE FROM stadium_cache WHERE viewer_id = ?')
    .run(String(viewerId));
}
