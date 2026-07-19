/**
 * db/trainerColorDb.js
 * ─────────────────────
 * Persisted trainer display-color assignments, used by the Image Report
 * Design Standard (see fantracking/reports/ImageReportStandard.js).
 *
 * Rules implemented here:
 *   • Each trainer gets a permanent color the first time they're seen.
 *   • No two ACTIVE trainers may share a color.
 *   • Colors are picked from the fixed TRAINER_COLORS palette (never
 *     black/white/green/red/pink/grey — those are reserved/status colors).
 *   • When a trainer leaves, their row is marked status='left'. Their color
 *     becomes available again for a brand-new trainer to inherit — active
 *     trainers keep their colors untouched.
 *   • Departed trainers are always displayed grey (see COLORS.GREY in
 *     ImageReportStandard.js) regardless of what color is stored here; the
 *     stored color is only tracked so it can be freed up / reassigned.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { config } from '../core/config.js';
import { log } from '../core/log.js';

/** @type {import('better-sqlite3').Database | null} */
let db = null;

export function initTrainerColorDb() {
  const dbPath = path.join(config.dataDir, 'trainer_colors.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS trainer_colors (
      member_key   TEXT PRIMARY KEY,
      member_name  TEXT NOT NULL,
      color        TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active', -- 'active' | 'left'
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trainer_colors_status ON trainer_colors(status);
    CREATE INDEX IF NOT EXISTS idx_trainer_colors_color  ON trainer_colors(color);
  `);

  log.info('trainerColorDb: initialized');
  return db;
}

function getDb() {
  if (!db) throw new Error('trainerColorDb: not initialized — call initTrainerColorDb() first');
  return db;
}

/**
 * Mark a trainer active or left. Does NOT change their stored color —
 * it only affects whether that color is considered "in use" when picking
 * a color for a brand-new trainer.
 * @param {string} memberKey  stable unique id for the member (e.g. trainer_id)
 * @param {string} memberName display name (for reference only)
 * @param {boolean} isActive
 */
export function setMemberStatus(memberKey, memberName, isActive) {
  getDb()
    .prepare(
      `UPDATE trainer_colors SET status = ?, member_name = ?, updated_at = datetime('now')
       WHERE member_key = ?`
    )
    .run(isActive ? 'active' : 'left', memberName ?? '', memberKey);
}

/**
 * Get the set of colors currently claimed by ACTIVE trainers.
 * @returns {Set<string>}
 */
function activeColorSet() {
  const rows = getDb().prepare(`SELECT color FROM trainer_colors WHERE status = 'active'`).all();
  return new Set(rows.map(r => r.color));
}

/**
 * Get (or assign, if new) the permanent color for a trainer.
 * Call this whenever you need a trainer's color for rendering, passing
 * their current active/left status so it stays in sync.
 *
 * @param {string} memberKey     stable unique id for the member (e.g. trainer_id)
 * @param {string} memberName    display name (used only if a new row is created)
 * @param {boolean} isActive     current membership status
 * @param {string[]} palette     ordered list of allowed hex colors (TRAINER_COLORS)
 * @returns {string} hex color assigned to this trainer
 */
export function getOrAssignColor(memberKey, memberName, isActive, palette) {
  const existing = getDb()
    .prepare('SELECT color, status FROM trainer_colors WHERE member_key = ?')
    .get(memberKey);

  if (existing) {
    if ((existing.status === 'active') !== isActive) {
      setMemberStatus(memberKey, memberName, isActive);
    }
    return existing.color;
  }

  // New trainer — pick the first palette color not currently claimed by an
  // active trainer. This naturally reuses colors freed up by departed
  // trainers before reaching for colors that have never been used.
  const claimed = activeColorSet();
  let color = palette.find(c => !claimed.has(c));

  // Palette exhausted (more active trainers than palette colors) — fall back
  // to the least-recently-used color rather than crashing.
  if (!color) {
    const lru = getDb()
      .prepare(`SELECT color FROM trainer_colors ORDER BY updated_at ASC LIMIT 1`)
      .get();
    color = lru?.color ?? palette[0];
    log.warn(`trainerColorDb: palette exhausted, reusing color ${color} for ${memberKey}`);
  }

  getDb()
    .prepare(
      `INSERT INTO trainer_colors (member_key, member_name, color, status)
       VALUES (?, ?, ?, ?)`
    )
    .run(memberKey, memberName ?? '', color, isActive ? 'active' : 'left');

  return color;
}
