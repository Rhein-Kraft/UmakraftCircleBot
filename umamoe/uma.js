/**
 * umamoe/uma.js
 * ─────────────
 * Re-export barrel — maintains 100% backwards-compatible API.
 *
 * Implementation is split across three focused modules:
 *   umamoe/umaClient.js  — HTTP API client (fetch, retry, trainer/circle endpoints)
 *   umamoe/umaStats.js   — Pure stat engine (classifyMembers, computeMemberStats)
 *   umamoe/umaCache.js   — Snapshot + historical + prev-month caches
 */

export { fetchTrainerProfile, fetchCircle, UMA_HEADERS, fetchWithRetry } from './umaClient.js';
export { classifyMembers, computeMemberStats }                            from './umaStats.js';
export {
  setCachedSnapshot,
  getCircleSnapshot,
  buildSnapshot,
  findEarliestJoinDate,
  clearHistoricalCache,
  getPreviousMonthFinals,
} from './umaCache.js';
