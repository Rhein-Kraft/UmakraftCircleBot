// @ts-check
/**
 * store.js
 * ────────
 * Public persistence API for the bot.
 *
 * All storage is now backed by SQLite via db/storeDb.js.
 * The public interface is unchanged — every caller continues to work as-is.
 *
 * Initialization: store.init() calls initStoreDb() which creates the tables
 * and automatically imports any existing JSON flat-files on first boot.
 */
import { config } from './config.js';
import {
  initStoreDb,
  getMembers,
  upsertMember,
  setMembers,
  storeDailyGain,
  settleDailyGain,
  getDailyGainsForDate,
  pruneDailyGains,
  getGuildConfig,
  setGuildConfig,
  getAllGuildConfigs,
  getBotState,
  setBotState,
  getTimezone,
  setTimezone,
  recordCommandMessage as dbRecordCommandMessage,
  takeCommandMessagesOlderThan as dbTakeCommandMessages,
  incrementSyncCount as dbIncrementSyncCount,
  getMemberGainStats as dbGetMemberGainStats,
  getCurrentMonthGain as dbGetCurrentMonthGain,
  getCompletionStreakStats as dbGetCompletionStreakStats,
  getCirclePeriodAggregates as dbGetCirclePeriodAggregates,
  getCircleVelocities as dbGetCircleVelocities,
  getTrainerVelocity as dbGetTrainerVelocity,
} from '../db/storeDb.js';
import {
  setLink as dbSetLink,
  removeLink as dbRemoveLink,
  getLinkedViewerId as dbGetViewerId,
  getAllLinks as dbGetAllLinks,
  isLinksDbInitialized,
} from '../db/linksDb.js';
import {
  saveSnapshot as dbSaveSnapshot,
  getSnapshot as dbGetSnapshot,
  getAvailableDates as dbGetAvailableDates,
  getTrainerRankHistory as dbGetTrainerRankHistory,
  getPersonalBest as dbGetPersonalBest,
  getAllPersonalBests as dbGetAllPersonalBests,
  isSnapshotDbInitialized,
} from '../db/leaderboardSnapshotDb.js';

export const store = {
  async init() {
    initStoreDb();
  },

  // ── Members ─────────────────────────────────────────────────────────────────

  // ── Circle-scoped members ───────────────────────────────────────────────────

  /** @param {string} circleId @returns {Promise<Record<string, object>>} */
  async getMembersForCircle(circleId) {
    return getMembers(circleId);
  },

  /**
   * @param {string} circleId
   * @param {string} trainerId
   * @param {object} patch
   */
  async upsertMemberForCircle(circleId, trainerId, patch) {
    return upsertMember(circleId, trainerId, patch);
  },

  /** @param {string} circleId @param {Record<string, object>} map */
  async setMembersForCircle(circleId, map) {
    setMembers(circleId, map);
  },

  // ── Daily gain records ──────────────────────────────────────────────────────

  // ── Circle-scoped daily gains ───────────────────────────────────────────────

  /**
   * @param {string} circleId
   * @param {string} trainerId
   * @param {string} dateStr
   * @param {number} gain
   * @param {number} totalFans
   */
  async storeDailyGainForCircle(circleId, trainerId, dateStr, gain, totalFans) {
    storeDailyGain(circleId, trainerId, dateStr, gain, totalFans);
  },

  /**
   * Re-settle a completed day's gain using REPLACE (overwrite, not MAX).
   * Call for yesterday and day-before-yesterday on each sync to correct
   * gains that were inflated by uma.moe retroactively adjusting prior days'
   * cumulative totals after those days ended.
   *
   * @param {string} circleId
   * @param {string} trainerId
   * @param {string} dateStr   YYYY-MM-DD (a past date, never today)
   * @param {number} gain
   * @param {number} totalFans
   */
  async settleDailyGainForCircle(circleId, trainerId, dateStr, gain, totalFans) {
    settleDailyGain(circleId, trainerId, dateStr, gain, totalFans);
  },

  /** @param {string} circleId @param {string} dateStr @returns {Promise<object[]>} */
  async getDailyGainsForDateForCircle(circleId, dateStr) {
    return getDailyGainsForDate(circleId, dateStr);
  },

  /** @param {string} circleId @param {number} [retentionDays] */
  async pruneDailyGainsForCircle(circleId, retentionDays = 90) {
    pruneDailyGains(circleId, retentionDays);
  },

  // ── Discord ↔ Uma links (backed by linksDb) ─────────────────────────────────

  /** @returns {Promise<Record<string, string>>} */
  async getLinks() {
    if (isLinksDbInitialized()) return dbGetAllLinks();
    return {};
  },

  /**
   * @param {string} discordUserId
   * @param {string} trainerId
   */
  async setLink(discordUserId, trainerId) {
    if (isLinksDbInitialized()) dbSetLink(discordUserId, trainerId);
  },

  /** @param {string} discordUserId */
  async removeLink(discordUserId) {
    if (isLinksDbInitialized()) dbRemoveLink(discordUserId);
  },

  /**
   * @param {string} discordUserId
   * @returns {Promise<string | null>}
   */
  async getLinkedViewerId(discordUserId) {
    if (isLinksDbInitialized()) return dbGetViewerId(discordUserId);
    return null;
  },

  // ── Leaderboard snapshots ─────────────────────────────────────────────────────

  /**
   * @param {string} circleId
   * @param {'daily'|'weekly'|'monthly'} scope
   * @param {string} date
   * @param {object[]} rows
   */
  saveLeaderboardSnapshot(circleId, scope, date, rows) {
    if (isSnapshotDbInitialized()) dbSaveSnapshot(circleId, scope, date, rows);
  },

  /**
   * @param {string} circleId
   * @param {string} scope
   * @param {string} date
   * @returns {object[]}
   */
  getLeaderboardSnapshot(circleId, scope, date) {
    if (isSnapshotDbInitialized()) return dbGetSnapshot(circleId, scope, date);
    return [];
  },

  /**
   * @param {string} circleId
   * @param {string} scope
   * @param {number} [limit]
   * @returns {string[]}
   */
  getAvailableSnapshotDates(circleId, scope, limit) {
    if (isSnapshotDbInitialized()) return dbGetAvailableDates(circleId, scope, limit);
    return [];
  },

  /**
   * @param {string} circleId
   * @param {string} scope
   * @param {string} trainerId
   * @param {number} [days]
   * @returns {object[]}
   */
  getTrainerRankHistory(circleId, scope, trainerId, days) {
    if (isSnapshotDbInitialized()) return dbGetTrainerRankHistory(circleId, scope, trainerId, days);
    return [];
  },

  /**
   * @param {string} circleId
   * @param {string} scope
   * @param {string} trainerId
   * @returns {object|null}
   */
  getPersonalBest(circleId, scope, trainerId) {
    if (isSnapshotDbInitialized()) return dbGetPersonalBest(circleId, scope, trainerId);
    return null;
  },

  /**
   * @param {string} circleId
   * @param {string} scope
   * @returns {Record<string, object>}
   */
  getAllPersonalBests(circleId, scope) {
    if (isSnapshotDbInitialized()) return dbGetAllPersonalBests(circleId, scope);
    return {};
  },

  // ── Guild config ─────────────────────────────────────────────────────────────

  /** @param {string} guildId @returns {Promise<object>} */
  async getGuildConfig(guildId) {
    return getGuildConfig(guildId);
  },

  /**
   * @param {string} guildId
   * @param {object} patch
   * @returns {Promise<object>}
   */
  async setGuildConfig(guildId, patch) {
    return setGuildConfig(guildId, patch);
  },

  /** @returns {Promise<Record<string, object>>} */
  async getAllGuildConfigs() {
    return getAllGuildConfigs();
  },

  // ── Generic state ─────────────────────────────────────────────────────────────

  /**
   * @template T
   * @param {string} key
   * @param {T} [defaultValue]
   * @returns {Promise<T>}
   */
  async getState(key, defaultValue = null) {
    return getBotState(key, defaultValue);
  },

  /**
   * @param {string} key
   * @param {*} value
   */
  async setState(key, value) {
    setBotState(key, value);
  },

  // ── Timezones ─────────────────────────────────────────────────────────────────

  /** @param {string} discordId @returns {Promise<string | null>} */
  async getTimezone(discordId) {
    return getTimezone(discordId);
  },

  /** @param {string} discordId @param {string} tz */
  async setTimezone(discordId, tz) {
    setTimezone(discordId, tz);
  },

  // ── Command messages (for 24h cleanup) ───────────────────────────────────────

  /** @param {{ channelId: string, messageId: string }} entry */
  async recordCommandMessage(entry) {
    dbRecordCommandMessage(entry.channelId, entry.messageId);
  },

  /** @param {number} ageMs @returns {Promise<object[]>} */
  async takeCommandMessagesOlderThan(ageMs) {
    return dbTakeCommandMessages(ageMs);
  },

  // ── Profile data helpers ──────────────────────────────────────────────────

  /** @param {string} circleId @param {string} trainerId */
  incrementSyncCount(circleId, trainerId) {
    dbIncrementSyncCount(circleId, trainerId);
  },

  /** @param {string} circleId @param {string} trainerId */
  getMemberGainStats(circleId, trainerId) {
    return dbGetMemberGainStats(circleId, trainerId);
  },

  /** @param {string} circleId @param {string} trainerId */
  getCurrentMonthGain(circleId, trainerId) {
    return dbGetCurrentMonthGain(circleId, trainerId);
  },

  /** @param {string} circleId @param {string} trainerId */
  getCompletionStreakStats(circleId, trainerId) {
    return dbGetCompletionStreakStats(circleId, trainerId);
  },

  // ── Period aggregates (pre-computed weekly / monthly totals) ──────────────

  /**
   * Read all pre-computed aggregate rows for a circle / period combination.
   * @param {string} circleId
   * @param {'weekly'|'monthly'} periodType
   * @param {string} periodKey  — e.g. '2026-W28' or '2026-07'
   * @returns {{ viewerId: string, totalGain: number, computedAt: string }[]}
   */
  getCircleAggregates(circleId, periodType, periodKey) {
    return dbGetCirclePeriodAggregates(circleId, periodType, periodKey);
  },

  // ── Trainer velocity (rolling 7-day average + monthly projection) ──────────

  /**
   * Read velocity data for all members in a circle.
   * @param {string} circleId
   * @returns {{ viewerId: string, velocity7d: number, projectedMonthly: number, currentMonthly: number, computedAt: string }[]}
   */
  getCircleVelocities(circleId) {
    return dbGetCircleVelocities(circleId);
  },

  /**
   * Read velocity data for a single trainer.
   * @param {string} circleId
   * @param {string} trainerId
   * @returns {{ viewerId: string, velocity7d: number, projectedMonthly: number, currentMonthly: number, computedAt: string } | null}
   */
  getTrainerVelocity(circleId, trainerId) {
    return dbGetTrainerVelocity(circleId, trainerId);
  },
};
