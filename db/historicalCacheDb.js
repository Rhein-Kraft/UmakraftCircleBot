import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { runMigrations } from './migrations.js';
import { log } from '../core/log.js';

const DATA_DIR = process.env.DATA_DIR || './data';
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'historical_cache.db'));
db.pragma('journal_mode = WAL');

runMigrations(db, [
  {
    name: '001_create_historical_month_cache',
    up: db =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS historical_month_cache (
          circle_id   TEXT    NOT NULL,
          year        INTEGER NOT NULL,
          month       INTEGER NOT NULL,
          payload     TEXT    NOT NULL,
          cached_at   TEXT    NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (circle_id, year, month)
        )
      `),
  },
]);

const stmtGet = db.prepare(
  'SELECT payload FROM historical_month_cache WHERE circle_id = ? AND year = ? AND month = ?'
);

const stmtSet = db.prepare(`
  INSERT INTO historical_month_cache (circle_id, year, month, payload, cached_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT (circle_id, year, month) DO UPDATE
    SET payload = excluded.payload, cached_at = excluded.cached_at
`);

/**
 * Returns the cached payload for a given circle/year/month, or null if not found.
 * @param {string|number} circleId
 * @param {number} year
 * @param {number} month  1-indexed
 * @returns {object|null}
 */
export function getHistoricalMonth(circleId, year, month) {
  try {
    const row = stmtGet.get(String(circleId), year, month);
    if (!row) return null;
    return JSON.parse(row.payload);
  } catch (err) {
    log.warn(`historicalCacheDb.get(${circleId}, ${year}-${month}): ${err.message}`);
    return null;
  }
}

/**
 * Persist a monthly payload so it survives bot restarts.
 * @param {string|number} circleId
 * @param {number} year
 * @param {number} month  1-indexed
 * @param {object} payload  Raw uma.moe API response
 */
export function setHistoricalMonth(circleId, year, month, payload) {
  try {
    stmtSet.run(String(circleId), year, month, JSON.stringify(payload));
  } catch (err) {
    log.warn(`historicalCacheDb.set(${circleId}, ${year}-${month}): ${err.message}`);
  }
}
