/**
 * umamoe/index.js
 * ───────────────
 * Single-entry barrel for all uma.moe related modules.
 *
 * Usage:
 *   import { getCircleSnapshot, scrapeTimeline, screenshotTrainer } from './umamoe/index.js';
 *
 * Sub-modules:
 *   ./uma.js                            — core barrel (umaClient + umaStats + umaCache)
 *   ./umaQueue.js                       — request rate-limit queue
 *   ./timeline/timeline.js              — timeline orchestrator
 *   ./timeline/timelineScraper.js       — Playwright + axios scraper
 *   ./timeline/timelineScheduler.js     — cron scheduler
 *   ./trainer/screenshotter.js          — Playwright profile screenshot (deprecated; renderTrainerCard is used instead)
 *   ./trainer/trainerLeaderboard.js     — #uma-results leaderboard builder
 *   ./trainer/skillScraper.js           — inherited skill name scraper (Playwright; API has IDs only)
 *   ./trainer/resumeCard.js             — Discord embed resume card builder
 *   ./history/generatePastHistoryMd.js  — PastHistoryTrainer.md generator
 *   ./history/pastHistoryReader.js      — PastHistoryTrainer.md parser
 *   ./profileBackfill.js                — historical daily gain backfill
 */

// ── Core API client, stat engine, caches ─────────────────────────────────────
export {
  fetchTrainerProfile,
  fetchProfile,
  fetchCircle,
  UMA_HEADERS,
  fetchWithRetry,
} from './umaClient.js';

export {
  classifyMembers,
  computeMemberStats,
} from './umaStats.js';

export {
  setCachedSnapshot,
  getCircleSnapshot,
  buildSnapshot,
  findEarliestJoinDate,
  clearHistoricalCache,
  getPreviousMonthFinals,
} from './umaCache.js';

export { enqueue } from './umaQueue.js';

// ── Timeline ──────────────────────────────────────────────────────────────────
export {
  timelineStatus,
  runTimelineUpdate,
  updateTimelineCountdowns,
  cleanupEndedTimeline,
} from './timeline/timeline.js';

export {
  scrapeTimeline,
  closeBrowser as closeTimelineBrowser,
} from './timeline/timelineScraper.js';

export { startTimelineScheduler } from './timeline/timelineScheduler.js';

// ── Trainer ───────────────────────────────────────────────────────────────────
export {
  screenshotTrainer,
  invalidateCache as invalidateScreenshotCache,
} from './trainer/screenshotter.js';

export { refreshLeaderboard } from './trainer/trainerLeaderboard.js';

export { scrapeSkillNames } from './trainer/skillScraper.js';

export { buildResumeEmbed } from './trainer/resumeCard.js';

// ── History ───────────────────────────────────────────────────────────────────
export { regeneratePastHistoryMd } from './history/generatePastHistoryMd.js';

export {
  getPastProfile,
  getAllPastProfiles,
  reloadPastHistory,
} from './history/pastHistoryReader.js';

// ── Profile backfill ──────────────────────────────────────────────────────────
export { backfillHistoricalGains } from './profileBackfill.js';
