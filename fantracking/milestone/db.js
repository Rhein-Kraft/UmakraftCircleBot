/**
 * milestoneDb.js
 * ──────────────
 * Persistent SQLite store for milestone tracking.
 *
 * Anti-spam design:
 *  • Each milestone is CLAIMED (INSERT) atomically BEFORE any message is sent.
 *  • Three send-state flags track each delivery independently:
 *      channel_sent   — announcement posted to #announcement-channel
 *      dm_member_sent — personal DM sent to the trainer
 *      dm_leader_sent — DM sent to the circle leader
 *  • On bot restart, rows with flags = 0 are retried individually,
 *    so a crash mid-send never causes a full re-fire.
 *  • Pre-migration rows (old schema, no flags) are marked fully-sent on first boot.
 *
 * Multi-circle:
 *  • circle_id is part of the PRIMARY KEY so the same trainer can reach the
 *    same milestone independently in each circle they belong to.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { config } from '../../core/config.js';
import { log } from '../../core/log.js';

let db;

export function initMilestoneDb() {
  const dbPath = path.join(config.dataDir, 'milestones.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Create table with multi-circle schema (fresh installs) ───────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS milestone_fired (
      viewer_id        TEXT    NOT NULL,
      tier_key         TEXT    NOT NULL,
      month            TEXT    NOT NULL,
      circle_id        TEXT    NOT NULL DEFAULT '',
      position         INTEGER NOT NULL DEFAULT 1,
      fired_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      channel_sent     INTEGER NOT NULL DEFAULT 0,
      dm_member_sent   INTEGER NOT NULL DEFAULT 0,
      dm_leader_sent   INTEGER NOT NULL DEFAULT 0,
      channel_msg_id   TEXT,
      channel_id       TEXT,
      guild_id         TEXT,
      PRIMARY KEY (viewer_id, tier_key, month, circle_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mf_month      ON milestone_fired(month);
    CREATE INDEX IF NOT EXISTS idx_mf_tier_month ON milestone_fired(tier_key, month);
  `);

  // ── Migration: add circle_id to existing databases ────────────────────────
  // If the table existed without circle_id (old single-circle schema), rebuild
  // it atomically with circle_id in the PK. Existing rows are stamped with
  // the main circle ID so they continue to match all existing milestone checks.
  const cols = db.pragma('table_info(milestone_fired)').map(r => r.name);
  if (!cols.includes('circle_id')) {
    log.info('milestoneDb: migrating to multi-circle schema — adding circle_id to PRIMARY KEY...');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE milestone_fired_new (
          viewer_id        TEXT    NOT NULL,
          tier_key         TEXT    NOT NULL,
          month            TEXT    NOT NULL,
          circle_id        TEXT    NOT NULL DEFAULT '',
          position         INTEGER NOT NULL DEFAULT 1,
          fired_at         TEXT    NOT NULL DEFAULT (datetime('now')),
          channel_sent     INTEGER NOT NULL DEFAULT 0,
          dm_member_sent   INTEGER NOT NULL DEFAULT 0,
          dm_leader_sent   INTEGER NOT NULL DEFAULT 0,
          channel_msg_id   TEXT,
          channel_id       TEXT,
          guild_id         TEXT,
          PRIMARY KEY (viewer_id, tier_key, month, circle_id)
        )
      `);
      db.prepare(
        `
        INSERT INTO milestone_fired_new
          (viewer_id, tier_key, month, circle_id, position, fired_at,
           channel_sent, dm_member_sent, dm_leader_sent,
           channel_msg_id, channel_id, guild_id)
        SELECT viewer_id, tier_key, month, ?, position, fired_at,
               channel_sent, dm_member_sent, dm_leader_sent,
               channel_msg_id, channel_id, guild_id
        FROM milestone_fired
      `
      ).run(config.circleId);
      db.exec(`DROP TABLE milestone_fired`);
      db.exec(`ALTER TABLE milestone_fired_new RENAME TO milestone_fired`);
    })();
    log.info(
      `milestoneDb: migration complete — existing rows stamped with circle_id=${config.circleId}`
    );
  }

  // ── Safe column migrations for existing databases ─────────────────────────
  for (const [col, def] of [
    ['channel_sent', 'INTEGER NOT NULL DEFAULT 0'],
    ['dm_member_sent', 'INTEGER NOT NULL DEFAULT 0'],
    ['dm_leader_sent', 'INTEGER NOT NULL DEFAULT 0'],
    ['channel_msg_id', 'TEXT'],
    ['channel_id', 'TEXT'],
    ['guild_id', 'TEXT'],
  ]) {
    try {
      db.exec(`ALTER TABLE milestone_fired ADD COLUMN ${col} ${def}`);
    } catch {
      /* already present */
    }
  }

  // ── Mark pre-tracking rows as fully sent ──────────────────────────────────
  // Rows written before the three-flag system existed have all flags = 0.
  // We use a 30-day threshold so genuine pending milestones from bot outages
  // (which can last several hours) are never silently buried. Pre-flag rows
  // are old by definition and will always fall outside this window.
  const legacy =
    db
      .prepare(
        `
    SELECT COUNT(*) AS c FROM milestone_fired
    WHERE channel_sent = 0 AND dm_member_sent = 0 AND dm_leader_sent = 0
      AND fired_at < datetime('now', '-30 days')
  `
      )
      .get()?.c ?? 0;

  if (legacy > 0) {
    db.prepare(
      `
      UPDATE milestone_fired
      SET channel_sent = 1, dm_member_sent = 1, dm_leader_sent = 1
      WHERE channel_sent = 0 AND dm_member_sent = 0 AND dm_leader_sent = 0
        AND fired_at < datetime('now', '-30 days')
    `
    ).run();
    log.info(`milestoneDb: migrated ${legacy} legacy row(s) to send-tracking schema`);
  }

  // ── Special-tier eligibility tracker ─────────────────────────────────────
  // Records the FIRST moment a trainer qualifies for a special tier (60M/80M/100M)
  // within a given month. Used to determine priority order for the 3-slot cap:
  //   1st — earliest first_qualified_at
  //   2nd — highest monthly_gain (tiebreak when qualified at the same cron tick)
  //   3rd — random (true tie)
  db.exec(`
    CREATE TABLE IF NOT EXISTS special_tier_eligible (
      trainer_id          TEXT    NOT NULL,
      tier_key            TEXT    NOT NULL,
      month               TEXT    NOT NULL,
      circle_id           TEXT    NOT NULL,
      first_qualified_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      monthly_gain        INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (trainer_id, tier_key, month, circle_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ste_tier_month ON special_tier_eligible(tier_key, month, circle_id);
  `);

  log.info('milestoneDb: initialized');
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────

function getDb() {
  if (!db) throw new Error('milestoneDb: not initialized — call initMilestoneDb() first');
  return db;
}

// ── Claim / query ─────────────────────────────────────────────────────────────

/**
 * Atomically claim a milestone slot BEFORE sending any messages.
 * Returns true  → slot was just created; proceed to send.
 * Returns false → already existed; check getMilestoneRecord() for pending sends.
 */
export function claimMilestone(trainerId, tierKey, month, position, circleId) {
  const r = getDb()
    .prepare(
      `
    INSERT OR IGNORE INTO milestone_fired (viewer_id, tier_key, month, circle_id, position)
    VALUES (?, ?, ?, ?, ?)
  `
    )
    .run(String(trainerId), tierKey, month, circleId, position);
  return r.changes > 0;
}

/**
 * Fetch the full row for a member/tier/month/circle.
 * Returns null if the milestone has never been claimed.
 */
export function getMilestoneRecord(trainerId, tierKey, month, circleId) {
  return (
    getDb()
      .prepare(
        `
    SELECT * FROM milestone_fired
    WHERE viewer_id = ? AND tier_key = ? AND month = ? AND circle_id = ?
  `
      )
      .get(String(trainerId), tierKey, month, circleId) ?? null
  );
}

/**
 * How many distinct members have already claimed the given tier this month
 * within this circle. Used to compute the ordinal position for the next claimant.
 */
export function getPositionCount(tierKey, month, circleId) {
  return (
    getDb()
      .prepare(
        `
    SELECT COUNT(*) AS c FROM milestone_fired
    WHERE tier_key = ? AND month = ? AND circle_id = ?
  `
      )
      .get(tierKey, month, circleId)?.c ?? 0
  );
}

// ── Send-state flags ──────────────────────────────────────────────────────────

/** Mark the channel announcement as successfully posted. */
export function markChannelSent(trainerId, tierKey, month, circleId) {
  getDb()
    .prepare(
      `
    UPDATE milestone_fired SET channel_sent = 1
    WHERE viewer_id = ? AND tier_key = ? AND month = ? AND circle_id = ?
  `
    )
    .run(String(trainerId), tierKey, month, circleId);
}

/** Mark the member DM as successfully sent. */
export function markDmMemberSent(trainerId, tierKey, month, circleId) {
  getDb()
    .prepare(
      `
    UPDATE milestone_fired SET dm_member_sent = 1
    WHERE viewer_id = ? AND tier_key = ? AND month = ? AND circle_id = ?
  `
    )
    .run(String(trainerId), tierKey, month, circleId);
}

/**
 * Get all milestone_fired rows for a viewer across all circles, newest first.
 * @param {string} viewerId
 * @returns {Array<object>}
 */
export function getMemberMilestones(viewerId) {
  return getDb()
    .prepare(`
      SELECT viewer_id, tier_key, month, circle_id, position, fired_at,
             channel_sent, dm_member_sent, dm_leader_sent
      FROM milestone_fired
      WHERE viewer_id = ?
      ORDER BY fired_at DESC
    `)
    .all(String(viewerId));
}

/** Mark the leader DM as successfully sent. */
export function markDmLeaderSent(trainerId, tierKey, month, circleId) {
  getDb()
    .prepare(
      `
    UPDATE milestone_fired SET dm_leader_sent = 1
    WHERE viewer_id = ? AND tier_key = ? AND month = ? AND circle_id = ?
  `
    )
    .run(String(trainerId), tierKey, month, circleId);
}

// ── Channel message tracking (for 24h auto-delete) ────────────────────────────

/**
 * Save the Discord message ID of the announcement channel post so it can be
 * auto-deleted after 24 hours.
 */
export function saveMilestoneMessageId(
  trainerId,
  tierKey,
  month,
  guildId,
  channelId,
  msgId,
  circleId
) {
  getDb()
    .prepare(
      `
    UPDATE milestone_fired
    SET guild_id = ?, channel_id = ?, channel_msg_id = ?
    WHERE viewer_id = ? AND tier_key = ? AND month = ? AND circle_id = ?
  `
    )
    .run(
      String(guildId),
      String(channelId),
      String(msgId),
      String(trainerId),
      tierKey,
      month,
      circleId
    );
}

/**
 * Returns all milestone rows that:
 *  • have a stored channel_msg_id (we know which Discord message to delete)
 *  • were fired more than 24 hours ago
 */
export function getMilestoneMessagesToDelete() {
  return getDb()
    .prepare(
      `
    SELECT viewer_id, tier_key, month, circle_id, guild_id, channel_id, channel_msg_id
    FROM milestone_fired
    WHERE channel_msg_id IS NOT NULL
      AND fired_at < datetime('now', '-24 hours')
  `
    )
    .all();
}

/** Clear the stored Discord message ID after it has been deleted. */
export function clearMilestoneMessageId(trainerId, tierKey, month, circleId) {
  getDb()
    .prepare(
      `
    UPDATE milestone_fired
    SET channel_msg_id = NULL, channel_id = NULL, guild_id = NULL
    WHERE viewer_id = ? AND tier_key = ? AND month = ? AND circle_id = ?
  `
    )
    .run(String(trainerId), tierKey, month, circleId);
}

// ── Special-tier eligibility tracking ────────────────────────────────────────

/**
 * Record that a trainer first qualified for a special tier this month.
 * Uses INSERT OR IGNORE so the timestamp and gain are written ONCE — on the
 * very first cron tick they cross the threshold — and never overwritten.
 * @param {string} trainerId
 * @param {string} tierKey
 * @param {string} month
 * @param {string} circleId
 * @param {number} monthlyGain  — fan count at the moment they first qualified
 */
export function stampSpecialEligible(trainerId, tierKey, month, circleId, monthlyGain) {
  getDb()
    .prepare(
      `
    INSERT OR IGNORE INTO special_tier_eligible
      (trainer_id, tier_key, month, circle_id, monthly_gain)
    VALUES (?, ?, ?, ?, ?)
  `
    )
    .run(String(trainerId), tierKey, month, circleId, monthlyGain);
}

/**
 * Return all eligible members for a special tier this month, sorted by
 * priority order:
 *   1st — earliest first_qualified_at (reached threshold first)
 *   2nd — highest monthly_gain (tiebreak: more fans wins)
 * Callers should shuffle equal-priority tails for true random tiebreak.
 * @param {string} tierKey
 * @param {string} month
 * @param {string} circleId
 * @returns {{ trainer_id: string, first_qualified_at: string, monthly_gain: number }[]}
 */
export function getSpecialEligibleSorted(tierKey, month, circleId) {
  return getDb()
    .prepare(
      `
    SELECT trainer_id, first_qualified_at, monthly_gain
    FROM special_tier_eligible
    WHERE tier_key = ? AND month = ? AND circle_id = ?
    ORDER BY first_qualified_at ASC, monthly_gain DESC
  `
    )
    .all(tierKey, month, circleId);
}

/**
 * Prune special_tier_eligible rows for months older than keepMonths.
 * Called alongside pruneOldMilestoneMonths.
 * @param {string} cutoffMonth  e.g. '2025-03'
 */
export function pruneSpecialEligible(cutoffMonth) {
  const r = getDb()
    .prepare('DELETE FROM special_tier_eligible WHERE month < ?')
    .run(cutoffMonth);
  if (r.changes > 0) {
    log.info(`milestoneDb: pruned ${r.changes} special_tier_eligible row(s) older than ${cutoffMonth}`);
  }
}

// ── Maintenance ───────────────────────────────────────────────────────────────

/**
 * Delete rows for months older than keepMonths (default 2).
 * Keeps the DB lean without losing current-month history.
 */
export function pruneOldMilestoneMonths(keepMonths = 2) {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - keepMonths, 1);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
  const r = getDb().prepare('DELETE FROM milestone_fired WHERE month < ?').run(cutoffStr);
  if (r.changes > 0) log.info(`milestoneDb: pruned ${r.changes} row(s) older than ${cutoffStr}`);
}
