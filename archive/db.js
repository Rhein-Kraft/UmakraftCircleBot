// @ts-check
/**
 * imageArchiveDb.js
 * ─────────────────
 * SQLite persistence for the image archiver task.
 *
 * Two tables:
 *   image_archive_cursors — per-channel "last processed message ID" so the
 *     archiver always picks up where it left off after a restart.
 *   image_archive_hashes  — per-guild SHA-256 hashes of every image already
 *     archived, used to skip exact duplicates across any Media channel.
 *
 * All writes are synchronous (better-sqlite3) so no partial state can be
 * left behind by a crash mid-write.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { config } from '../core/config.js';
import { log } from '../core/log.js';
import { runMigrations } from '../db/migrations.js';

/** @type {import('better-sqlite3').Database | null} */
let db = null;

const MIGRATIONS = [
  {
    name: 'image_archive_v1',
    up: db => db.exec(`
      CREATE TABLE IF NOT EXISTS image_archive_cursors (
        guild_id        TEXT NOT NULL,
        channel_id      TEXT NOT NULL,
        last_message_id TEXT NOT NULL DEFAULT '0',
        PRIMARY KEY (guild_id, channel_id)
      );
      CREATE TABLE IF NOT EXISTS image_archive_hashes (
        guild_id TEXT NOT NULL,
        hash     TEXT NOT NULL,
        PRIMARY KEY (guild_id, hash)
      );
    `),
  },
];

export function initImageArchiveDb() {
  const dbPath = path.join(config.dataDir, 'image_archive.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  runMigrations(db, MIGRATIONS);
  log.info('imageArchiveDb: initialized');
}

/** @returns {import('better-sqlite3').Database} */
function requireDb() {
  if (!db) throw new Error('imageArchiveDb: not initialized — call initImageArchiveDb() first');
  return db;
}

/**
 * Return the last processed message ID for a channel, or '0' if unseen.
 * @param {string} guildId
 * @param {string} channelId
 * @returns {string}
 */
export function getCursor(guildId, channelId) {
  const row = requireDb()
    .prepare('SELECT last_message_id FROM image_archive_cursors WHERE guild_id = ? AND channel_id = ?')
    .get(guildId, channelId);
  return row?.last_message_id ?? '0';
}

/**
 * Persist the cursor for a channel (upsert).
 * @param {string} guildId
 * @param {string} channelId
 * @param {string} messageId
 */
export function setCursor(guildId, channelId, messageId) {
  requireDb()
    .prepare(`
      INSERT INTO image_archive_cursors (guild_id, channel_id, last_message_id)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id, channel_id) DO UPDATE SET last_message_id = excluded.last_message_id
    `)
    .run(guildId, channelId, messageId);
}

/**
 * Return true if this SHA-256 hash has already been archived for the guild.
 * @param {string} guildId
 * @param {string} hash
 * @returns {boolean}
 */
export function hasHash(guildId, hash) {
  return !!requireDb()
    .prepare('SELECT 1 FROM image_archive_hashes WHERE guild_id = ? AND hash = ?')
    .get(guildId, hash);
}

/**
 * Record a SHA-256 hash as archived for the guild.
 * @param {string} guildId
 * @param {string} hash
 */
export function addHash(guildId, hash) {
  requireDb()
    .prepare('INSERT OR IGNORE INTO image_archive_hashes (guild_id, hash) VALUES (?, ?)')
    .run(guildId, hash);
}
