// @ts-check
/**
 * linksDb.js
 * ──────────
 * SQLite-backed store for Discord ↔ Uma.moe trainer ID links.
 *
 * Source of truth: SQLite (data/links.db)
 * Committed backup: links_backup.json (project root — NOT gitignored)
 *
 * Boot import priority:
 *   1. data/links.json  (legacy flat-file, data dir)
 *   2. links_backup.json (project root, committed to git — survives fresh imports)
 *
 * Every setLink() / removeLink() immediately rewrites links_backup.json
 * so it always reflects the current state of the DB.
 *
 * All operations are synchronous (better-sqlite3).
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { config } from '../../core/config.js';
import { log } from '../../core/log.js';
import { runMigrations } from '../../db/migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(path.dirname(__dirname));

/** Path to the committed backup file at the project root. */
const BACKUP_PATH = path.join(PROJECT_ROOT, 'links_backup.json');

/**
 * Discord ID → Trainer ID pairs that are permanently protected.
 * These links can never be overwritten or removed via any command.
 */
const PROTECTED_LINKS = new Map();

/** @type {import('better-sqlite3').Database | null} */
let db = null;

// ── Backup helpers ────────────────────────────────────────────────────────────

/**
 * Write the full contents of the links table to links_backup.json,
 * then commit it to git so fresh imports restore all links.
 * Called after every mutation. Non-fatal on error.
 */
function _writeBackup() {
  try {
    const rows = db.prepare('SELECT discord_id, viewer_id FROM links').all();
    const obj  = Object.fromEntries(rows.map(r => [r.discord_id, r.viewer_id]));
    writeFileSync(BACKUP_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    log.debug(`linksDb: backup written (${rows.length} link(s))`);
  } catch (err) {
    log.error('linksDb: FAILED to write links_backup.json:', err.message);
  }
}

/**
 * Force a WAL checkpoint so all committed writes are flushed into the main .db file.
 * This ensures data survives even if the WAL file is wiped on environment reset.
 */
function _checkpoint() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (err) {
    log.warn('linksDb: checkpoint failed (non-fatal):', err.message);
  }
}

/**
 * Import links from a plain { discordId: trainerId } JSON object.
 * Returns the number of records imported.
 * @param {Record<string, string>} data
 * @returns {number}
 */
function _importFromObject(data) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO links (discord_id, viewer_id) VALUES (?, ?)'
  );
  const importAll = db.transaction(entries => {
    let n = 0;
    for (const [discordId, trainerId] of entries) {
      insert.run(String(discordId), String(trainerId));
      n++;
    }
    return n;
  });
  return importAll(Object.entries(data));
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initLinksDb() {
  const dbPath = path.join(config.dataDir, 'links.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      discord_id   TEXT PRIMARY KEY,
      viewer_id    TEXT NOT NULL,
      linked_at    TEXT NOT NULL DEFAULT (datetime('now')),
      is_protected INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_links_viewer ON links(viewer_id);
  `);

  runMigrations(db, [
    {
      name: 'links_add_is_protected',
      up: d => {
        // Column may already exist on older deployments — skip safely if so
        const cols = d.prepare('PRAGMA table_info(links)').all().map(r => r.name);
        if (!cols.includes('is_protected')) {
          d.exec('ALTER TABLE links ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0');
        }
      },
    },
  ]);

  // ── Import on empty DB ───────────────────────────────────────────────────────
  const count = db.prepare('SELECT COUNT(*) AS c FROM links').get()?.c ?? 0;
  if (count === 0) {
    // 1. Legacy data/links.json (old flat-file)
    let imported = 0;
    try {
      const raw  = readFileSync(path.join(config.dataDir, 'links.json'), 'utf8');
      imported   = _importFromObject(JSON.parse(raw));
      if (imported > 0) log.info(`linksDb: imported ${imported} link(s) from data/links.json`);
    } catch (err) {
      if (err.code !== 'ENOENT') log.warn('linksDb: failed to import data/links.json:', err.message);
    }

    // 2. Committed backup (project root) — used on fresh GitHub imports
    if (imported === 0) {
      try {
        const raw  = readFileSync(BACKUP_PATH, 'utf8');
        const data = JSON.parse(raw);
        if (Object.keys(data).length > 0) {
          imported = _importFromObject(data);
          if (imported > 0) log.info(`linksDb: imported ${imported} link(s) from links_backup.json`);
        }
      } catch (err) {
        if (err.code !== 'ENOENT') log.warn('linksDb: failed to import links_backup.json:', err.message);
      }
    }

    // Write the backup so it reflects what's in the DB after import
    if (imported > 0) {
      _writeBackup();
      _checkpoint();
    }
  }

  // ── Ensure protected links are stamped and in the DB ────────────────────────
  const protectStmt = db.prepare(
    `INSERT INTO links (discord_id, viewer_id, is_protected)
     VALUES (?, ?, 1)
     ON CONFLICT(discord_id) DO UPDATE SET
       viewer_id    = excluded.viewer_id,
       is_protected = 1`
  );
  for (const [discordId, trainerId] of PROTECTED_LINKS) {
    protectStmt.run(discordId, trainerId);
  }

  // Always checkpoint on startup so the main .db file is up to date
  _checkpoint();

  log.info('linksDb: initialized');
  return db;
}

/** @returns {boolean} */
export function isLinksDbInitialized() {
  return db !== null;
}

function getDb() {
  if (!db) throw new Error('linksDb: not initialized — call initLinksDb() first');
  return db;
}

// ── Mutations (always sync backup after write) ────────────────────────────────

/**
 * Check whether a Discord user's link is permanently protected.
 * Protected links cannot be overwritten or removed by any command.
 * @param {string} discordId
 * @returns {boolean}
 */
export function isProtectedLink(discordId) {
  if (PROTECTED_LINKS.has(String(discordId))) return true;
  const row = getDb()
    .prepare('SELECT is_protected FROM links WHERE discord_id = ?')
    .get(String(discordId));
  return row?.is_protected === 1;
}

/**
 * Insert or update a Discord ↔ viewer link.
 * Throws if the existing link is protected.
 * Immediately rewrites links_backup.json.
 * @param {string} discordId
 * @param {string} trainerId
 */
export function setLink(discordId, trainerId) {
  if (isProtectedLink(discordId)) {
    throw new Error(`Link for Discord ID ${discordId} is permanently protected and cannot be changed.`);
  }
  getDb()
    .prepare(
      `INSERT INTO links (discord_id, viewer_id) VALUES (?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET viewer_id = excluded.viewer_id,
                                             linked_at = datetime('now')`
    )
    .run(String(discordId), String(trainerId));
  _checkpoint();
  _writeBackup();
}

/**
 * Remove a link by Discord ID.
 * Throws if the link is protected.
 * Immediately rewrites links_backup.json.
 * @param {string} discordId
 */
export function removeLink(discordId) {
  if (isProtectedLink(discordId)) {
    throw new Error(`Link for Discord ID ${discordId} is permanently protected and cannot be removed.`);
  }
  getDb().prepare('DELETE FROM links WHERE discord_id = ?').run(String(discordId));
  _checkpoint();
  _writeBackup();
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Look up the uma.moe viewer ID for a Discord user.
 * Returns the ID as a string, or null if not linked.
 * @param {string} discordId
 * @returns {string | null}
 */
export function getLinkedViewerId(discordId) {
  const row = getDb()
    .prepare('SELECT viewer_id FROM links WHERE discord_id = ?')
    .get(String(discordId));
  return row?.viewer_id ?? null;
}

/**
 * Returns all links as a plain object { discordId: trainerId }.
 * @returns {Record<string, string>}
 */
export function getAllLinks() {
  const rows = getDb().prepare('SELECT discord_id, viewer_id FROM links').all();
  return Object.fromEntries(rows.map(r => [r.discord_id, r.viewer_id]));
}

/**
 * Look up both the viewer ID and link date for a Discord user.
 * Returns null if not linked.
 * @param {string} discordId
 * @returns {{ viewerId: string, linkedAt: string } | null}
 */
export function getLinkedInfo(discordId) {
  const row = getDb()
    .prepare('SELECT viewer_id, linked_at FROM links WHERE discord_id = ?')
    .get(String(discordId));
  return row ? { viewerId: row.viewer_id, linkedAt: row.linked_at } : null;
}

/**
 * Reverse lookup — find the Discord user ID linked to a given uma.moe viewer ID.
 * Returns null if no link exists.
 * @param {string} viewerId
 * @returns {string | null}
 */
export function getDiscordIdByViewerId(viewerId) {
  const row = getDb()
    .prepare('SELECT discord_id FROM links WHERE viewer_id = ?')
    .get(String(viewerId));
  return row?.discord_id ?? null;
}
