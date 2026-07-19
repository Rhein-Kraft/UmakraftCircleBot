// @ts-check
/**
 * db/circleDb.js
 * ──────────────
 * CIRCLE REGISTRY — single source of truth for all configured circles.
 *
 * Replaces the CIRCLE_ID / CIRCLE_2_ID env var pattern as the live source
 * of truth. Supports up to 10 pre-reserved slots. A slot is live when it has
 * a real circle_id AND active = 1. Slots 3–10 are reserved but inactive until
 * explicitly assigned.
 *
 * On first boot, CIRCLE_ID and CIRCLE_2_ID env vars are automatically seeded
 * into slots 1 and 2 — no manual migration needed.
 *
 * To activate a new circle:
 *   Use assignCircle(slot, circleId, name)  — or direct SQL:
 *   UPDATE circles SET circle_id = '<id>', name = 'MyCircle', active = 1 WHERE slot = 3;
 *   Restart the bot. All tasks pick it up automatically.
 *
 * After initCircleDb() runs, getConfiguredCircles() in core/config.js is
 * automatically redirected to this registry via setCirclesProvider().
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { config, setCirclesProvider } from '../core/config.js';
import { log } from '../core/log.js';
import { runMigrations } from './migrations.js';

/** @type {import('better-sqlite3').Database | null} */
let db = null;

function getDb() {
  if (!db) throw new Error('circleDb: not initialized — call initCircleDb() first');
  return db;
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initCircleDb() {
  const dbPath = path.join(config.dataDir, 'circles.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS circles (
      slot        INTEGER PRIMARY KEY,
      circle_id   TEXT,
      name        TEXT    NOT NULL DEFAULT '',
      active      INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      added_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  runMigrations(db, [
    {
      name: 'circles_v1_seed_10_slots',
      up: db => {
        // NOTE: slot names were initially "Circle 1"…"Circle 10".
        // Migration v2 below renames them to "UmaKraft 1"…"UmaKraft 10".
        const insertSlot = db.prepare(
          `INSERT OR IGNORE INTO circles (slot, circle_id, name, active, sort_order)
           VALUES (?, ?, ?, ?, ?)`
        );

        // Pre-reserve all 10 slots as inactive placeholders
        for (let slot = 1; slot <= 10; slot++) {
          insertSlot.run(slot, null, `Circle ${slot}`, 0, slot - 1);
        }

        // Seed slot 1 from CIRCLE_ID env var (always present)
        if (config.circleId) {
          db.prepare(
            'UPDATE circles SET circle_id = ?, name = ?, active = 1 WHERE slot = 1'
          ).run(config.circleId, config.circleName);
        }

        // Seed slot 2 from CIRCLE_2_ID env var (optional)
        if (config.circle2Id) {
          db.prepare(
            'UPDATE circles SET circle_id = ?, name = ?, active = 1 WHERE slot = 2'
          ).run(config.circle2Id, config.circle2Name);
        }
      },
    },
    {
      name: 'circles_v2_rename_umakraft_slots',
      up: db => {
        // Rename inactive placeholder slots to UmaKraft branding.
        // Slots 1 and 2 already have real names from v1; only rename placeholders.
        for (let slot = 1; slot <= 10; slot++) {
          const row = db.prepare('SELECT name, circle_id FROM circles WHERE slot = ?').get(slot);
          if (!row) continue;
          // Only rename if still holding the generic "Circle N" placeholder name
          if (row.name === `Circle ${slot}`) {
            const newName = slot === 1 ? 'UmaKraft' : `UmaKraft ${slot}`;
            db.prepare('UPDATE circles SET name = ? WHERE slot = ?').run(newName, slot);
          }
        }
      },
    },
  ]);

  // Register DB as the live provider for getConfiguredCircles()
  setCirclesProvider(getCircles);

  const active = getCircles();
  log.info(
    `circleDb: initialized — ${active.length} active circle(s), ${10 - active.length} reserved slot(s) available`
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Returns all active circles with a real circle_id, ordered by sort_order.
 * This powers getConfiguredCircles() after initCircleDb() is called.
 * @returns {{ id: string, name: string, slot: number }[]}
 */
export function getCircles() {
  return getDb()
    .prepare(
      `SELECT slot, circle_id AS id, name
       FROM   circles
       WHERE  active = 1 AND circle_id IS NOT NULL AND circle_id != ''
       ORDER  BY sort_order ASC, slot ASC`
    )
    .all();
}

/**
 * Returns all 10 slots — including inactive/unassigned — for admin inspection.
 * @returns {{ slot: number, circle_id: string|null, name: string, active: number, sort_order: number }[]}
 */
export function getAllSlots() {
  return getDb()
    .prepare(
      `SELECT slot, circle_id, name, active, sort_order
       FROM   circles
       ORDER  BY slot ASC`
    )
    .all();
}

/**
 * Returns a single slot by number, or null if not found.
 * @param {number} slot
 * @returns {{ slot: number, circle_id: string|null, name: string, active: number }|null}
 */
export function getSlot(slot) {
  return getDb().prepare('SELECT * FROM circles WHERE slot = ?').get(slot) ?? null;
}

/**
 * Returns true if a given circle_id is already registered in any active slot.
 * @param {string} circleId
 * @returns {boolean}
 */
export function circleExists(circleId) {
  return (
    getDb()
      .prepare(`SELECT 1 FROM circles WHERE circle_id = ? AND active = 1`)
      .get(circleId) != null
  );
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Assign a real circle ID to a reserved slot and activate it.
 * Throws if the slot is out of range or the circleId is empty.
 * @param {number} slot    1–10
 * @param {string} circleId
 * @param {string} name
 */
export function assignCircle(slot, circleId, name) {
  if (slot < 1 || slot > 10) throw new Error(`circleDb: slot must be 1–10, got ${slot}`);
  if (!circleId?.trim()) throw new Error('circleDb: circleId cannot be empty');
  getDb()
    .prepare(
      'UPDATE circles SET circle_id = ?, name = ?, active = 1 WHERE slot = ?'
    )
    .run(circleId.trim(), name, slot);
}

/**
 * Enable or disable a circle slot without removing its data.
 * @param {number} slot
 * @param {boolean} active
 */
export function setCircleActive(slot, active) {
  getDb()
    .prepare('UPDATE circles SET active = ? WHERE slot = ?')
    .run(active ? 1 : 0, slot);
}
