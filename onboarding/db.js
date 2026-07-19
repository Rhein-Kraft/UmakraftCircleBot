/**
 * db/onboardingDb.js
 * ──────────────────
 * Tracks trainer-card onboarding for new Discord members who joined on or
 * after the ONBOARDING_CUTOFF date (June 1 2026).
 *
 * Members who joined before that date are never enrolled.
 * `circle_id` records which uma.moe circle the member was matched to.
 * Members not found in any configured circle are silently skipped by the
 * reminder task — only confirmed circle members receive reminders.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { config } from '../core/config.js';
import { log } from '../core/log.js';

// Only members who join on/after this ISO date are enrolled in onboarding.
export const ONBOARDING_CUTOFF = '2026-06-01T00:00:00.000Z';

let db;

export function initOnboardingDb() {
  const dbPath = path.join(config.dataDir, 'onboarding.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS onboarding (
      user_id          TEXT    NOT NULL,
      guild_id         TEXT    NOT NULL,
      joined_at        TEXT    NOT NULL,
      first_dm_sent    INTEGER NOT NULL DEFAULT 0,
      card_provided    INTEGER NOT NULL DEFAULT 0,
      last_reminded_at TEXT,
      circle_id        TEXT,
      msg1_sent        INTEGER NOT NULL DEFAULT 0,
      msg2_dm_sent     INTEGER NOT NULL DEFAULT 0,
      msg2_chat_sent   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, guild_id)
    );
    CREATE INDEX IF NOT EXISTS idx_onboarding_pending ON onboarding(card_provided, joined_at);
  `);

  // Migrations: add any columns that are missing from existing tables.
  const cols = db.pragma('table_info(onboarding)').map(r => r.name);
  if (!cols.includes('circle_id')) {
    db.exec(`ALTER TABLE onboarding ADD COLUMN circle_id TEXT;`);
    log.info('onboardingDb: migrated — added circle_id column');
  }
  for (const [col, def] of Object.entries({
    msg1_sent:            'INTEGER NOT NULL DEFAULT 0',
    msg2_dm_sent:         'INTEGER NOT NULL DEFAULT 0',
    msg2_chat_sent:       'INTEGER NOT NULL DEFAULT 0',
    verification_status:  'TEXT',
    pending_trainer_id:   'TEXT',
    pending_trainer_name: 'TEXT',
    pending_card_url:     'TEXT',
  })) {
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE onboarding ADD COLUMN ${col} ${def};`);
      log.info(`onboardingDb: migrated — added ${col} column`);
    }
  }

  log.info('onboardingDb: initialized');
  return db;
}

function getDb() {
  if (!db) throw new Error('onboardingDb: not initialized — call initOnboardingDb() first');
  return db;
}

/** Enroll a new member. No-op if they are already enrolled. */
export function enrollMember(userId, guildId, joinedAt) {
  getDb()
    .prepare(
      `
    INSERT OR IGNORE INTO onboarding (user_id, guild_id, joined_at)
    VALUES (?, ?, ?)
  `
    )
    .run(String(userId), String(guildId), joinedAt);
}

/** Mark the initial onboarding DM as sent. */
export function markFirstDmSent(userId, guildId) {
  getDb()
    .prepare(
      `
    UPDATE onboarding SET first_dm_sent = 1
    WHERE user_id = ? AND guild_id = ?
  `
    )
    .run(String(userId), String(guildId));
}

/** Mark the member's trainer card as provided — stops all future reminders. */
export function markCardProvided(userId, guildId) {
  getDb()
    .prepare(
      `
    UPDATE onboarding SET card_provided = 1
    WHERE user_id = ? AND guild_id = ?
  `
    )
    .run(String(userId), String(guildId));
}

/** Update the timestamp of the last reminder DM sent. */
export function updateLastReminded(userId, guildId) {
  getDb()
    .prepare(
      `
    UPDATE onboarding SET last_reminded_at = datetime('now')
    WHERE user_id = ? AND guild_id = ?
  `
    )
    .run(String(userId), String(guildId));
}

/**
 * Record which uma.moe circle this member was matched to.
 * Called by the reminder task when it resolves the member's circle.
 */
export function updateCircleId(userId, guildId, circleId) {
  getDb()
    .prepare(
      `
    UPDATE onboarding SET circle_id = ?
    WHERE user_id = ? AND guild_id = ?
  `
    )
    .run(String(circleId), String(userId), String(guildId));
}

/**
 * Returns all members who:
 *  • joined on/after the cutoff
 *  • have NOT yet provided their trainer card
 *  • joined more than 24 hours ago (grace period before reminders start)
 */
export function getPendingReminders() {
  return getDb()
    .prepare(
      `
    SELECT user_id, guild_id, joined_at, last_reminded_at, circle_id
    FROM onboarding
    WHERE card_provided = 0
      AND joined_at >= ?
      AND joined_at < datetime('now', '-24 hours')
  `
    )
    .all(ONBOARDING_CUTOFF);
}

/** Members who joined ≥ 48h ago and haven't received Message 1 yet. */
export function getMsg1Pending() {
  return getDb()
    .prepare(`
      SELECT user_id, guild_id, joined_at FROM onboarding
      WHERE msg1_sent = 0
        AND joined_at >= ?
        AND joined_at <= datetime('now', '-48 hours')
    `)
    .all(ONBOARDING_CUTOFF);
}

/** Members who joined ≥ 169h (7 days + 1h) ago and haven't received the Message 2 DM yet. */
export function getMsg2DmPending() {
  return getDb()
    .prepare(`
      SELECT user_id, guild_id, joined_at FROM onboarding
      WHERE msg2_dm_sent = 0
        AND joined_at >= ?
        AND joined_at <= datetime('now', '-169 hours')
    `)
    .all(ONBOARDING_CUTOFF);
}

/** Members who joined ≥ 170h (7 days + 2h) ago and haven't received the Message 2 chat mention yet. */
export function getMsg2ChatPending() {
  return getDb()
    .prepare(`
      SELECT user_id, guild_id, joined_at FROM onboarding
      WHERE msg2_chat_sent = 0
        AND joined_at >= ?
        AND joined_at <= datetime('now', '-170 hours')
    `)
    .all(ONBOARDING_CUTOFF);
}

export function markMsg1Sent(userId, guildId) {
  getDb()
    .prepare(`UPDATE onboarding SET msg1_sent = 1 WHERE user_id = ? AND guild_id = ?`)
    .run(String(userId), String(guildId));
}

export function markMsg2DmSent(userId, guildId) {
  getDb()
    .prepare(`UPDATE onboarding SET msg2_dm_sent = 1 WHERE user_id = ? AND guild_id = ?`)
    .run(String(userId), String(guildId));
}

export function markMsg2ChatSent(userId, guildId) {
  getDb()
    .prepare(`UPDATE onboarding SET msg2_chat_sent = 1 WHERE user_id = ? AND guild_id = ?`)
    .run(String(userId), String(guildId));
}

/**
 * Set a member's verification to pending status and store the card details.
 * @param {string} userId
 * @param {string} guildId
 * @param {{ trainerId?: string|null, trainerName?: string|null, cardUrl?: string|null }} details
 */
export function setPendingVerification(userId, guildId, { trainerId = null, trainerName = null, cardUrl = null } = {}) {
  getDb()
    .prepare(`
      UPDATE onboarding
      SET verification_status  = 'pending',
          pending_trainer_id   = ?,
          pending_trainer_name = ?,
          pending_card_url     = ?
      WHERE user_id = ? AND guild_id = ?
    `)
    .run(
      trainerId  ? String(trainerId)  : null,
      trainerName ? String(trainerName) : null,
      cardUrl    ? String(cardUrl)    : null,
      String(userId),
      String(guildId)
    );
}

/**
 * Approve a pending verification — sets status to 'approved' and clears pending data.
 * @param {string} userId
 * @param {string} guildId
 */
export function approveVerification(userId, guildId) {
  getDb()
    .prepare(`
      UPDATE onboarding
      SET verification_status  = 'approved',
          pending_trainer_id   = NULL,
          pending_trainer_name = NULL,
          pending_card_url     = NULL
      WHERE user_id = ? AND guild_id = ?
    `)
    .run(String(userId), String(guildId));
}

/**
 * Reject a pending verification — clears status and all pending data so the
 * member can resubmit from scratch.
 * @param {string} userId
 * @param {string} guildId
 */
export function rejectVerification(userId, guildId) {
  getDb()
    .prepare(`
      UPDATE onboarding
      SET verification_status  = NULL,
          pending_trainer_id   = NULL,
          pending_trainer_name = NULL,
          pending_card_url     = NULL
      WHERE user_id = ? AND guild_id = ?
    `)
    .run(String(userId), String(guildId));
}

/** Returns the onboarding row for a specific user, or null. */
export function getOnboardingRow(userId, guildId) {
  return (
    getDb()
      .prepare(
        `
    SELECT * FROM onboarding WHERE user_id = ? AND guild_id = ?
  `
      )
      .get(String(userId), String(guildId)) ?? null
  );
}
