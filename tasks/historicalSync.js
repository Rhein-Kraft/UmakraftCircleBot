// @ts-check
/**
 * tasks/historicalSync.js
 * ────────────────────────
 * Monthly historical data sync — runs on the 2nd of each month at 06:00 JST.
 * This gives uma.moe 1+ day after the monthly tally to finalize results.
 *
 * What it does:
 *   1. Determines the just-completed month (previous calendar month in JST)
 *   2. Checks profile_month_sync — skips if already completed
 *   3. Fetches that month's daily fan data for every circle member
 *   4. Writes all records into daily_gains (INSERT OR REPLACE — idempotent)
 *   5. Marks the month as completed in profile_month_sync
 *
 * Restart safety:
 *   profileSyncDb.initProfileSyncDb() resets any stuck 'syncing' rows to
 *   'pending' on startup. runPendingMonths() can be called at boot to
 *   resume any incomplete months.
 *
 * Rate-limit aware:
 *   Uses fetchCircle() directly (not the umaClient queue) since this is a
 *   scheduled background task with generous inter-circle delays.
 */

import { fetchCircle } from '../core/umaClient.js';
import { storeDailyGain } from '../db/storeDb.js';
import {
  isMonthSynced,
  markMonthSyncing,
  markMonthCompleted,
  markMonthFailed,
  getPendingMonths,
} from '../db/profileSyncDb.js';
import { getConfiguredCircles } from '../core/config.js';
import { log } from '../core/log.js';

const INTER_CIRCLE_DELAY_MS = 5_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the year and month (1-indexed) that just completed,
 * relative to the current time in JST.
 * @returns {{ year: number, month: number }}
 */
function getPreviousMonth() {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const m0  = jst.getMonth(); // 0-indexed current month
  return m0 === 0
    ? { year: jst.getFullYear() - 1, month: 12 }
    : { year: jst.getFullYear(),     month: m0 };
}

/**
 * Sync one (circleId, year, month) from uma.moe into daily_gains.
 * @param {string} circleId
 * @param {number} year
 * @param {number} month   1-indexed
 * @returns {Promise<number>}  number of daily_gain rows written
 */
async function syncMonth(circleId, year, month) {
  const payload = await fetchCircle(circleId, year, month);
  const members = payload?.members ?? [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const todayStr    = new Date().toISOString().slice(0, 10);

  let written = 0;
  for (const member of members) {
    const trainerId = String(member.viewer_id ?? member.trainerId ?? '');
    if (!trainerId) continue;

    const fans = member.daily_fans ?? [];
    for (let dayIdx = 0; dayIdx < fans.length && dayIdx < daysInMonth; dayIdx++) {
      const totalFans = fans[dayIdx];
      if (!totalFans || totalFans <= 0) continue;

      const dateStr = new Date(Date.UTC(year, month - 1, dayIdx + 1)).toISOString().slice(0, 10);
      if (dateStr > todayStr) continue;

      const prevFans = dayIdx > 0 ? (fans[dayIdx - 1] ?? 0) : 0;
      const gain     = Math.max(0, totalFans - prevFans);

      storeDailyGain(circleId, trainerId, dateStr, gain, totalFans);
      written++;
    }
  }

  return written;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sync the previous calendar month for a single circle.
 * Idempotent — skips if already completed.
 *
 * @param {string} circleId
 * @returns {Promise<void>}
 */
export async function runHistoricalMonthSync(circleId) {
  const { year, month } = getPreviousMonth();
  const label = `${circleId} ${year}-${String(month).padStart(2, '0')}`;

  if (isMonthSynced(circleId, year, month)) {
    log.debug(`historicalSync: ${label} already completed — skipping`);
    return;
  }

  log.info(`historicalSync: starting sync for ${label}…`);
  markMonthSyncing(circleId, year, month);

  try {
    const count = await syncMonth(circleId, year, month);
    markMonthCompleted(circleId, year, month);
    log.info(`historicalSync: ${label} completed — ${count} gain rows written`);
  } catch (err) {
    markMonthFailed(circleId, year, month);
    log.error(`historicalSync: ${label} failed:`, err.message);
    throw err;
  }
}

/**
 * Sync the previous month for every configured circle, sequentially.
 * Called by the cron task on the 2nd of each month.
 *
 * @returns {Promise<void>}
 */
export async function runAllCirclesHistoricalSync() {
  const circles = getConfiguredCircles();
  for (let i = 0; i < circles.length; i++) {
    try {
      await runHistoricalMonthSync(circles[i].id);
    } catch (err) {
      log.error(`historicalSync: circle ${circles[i].id} errored — continuing with next:`, err.message);
    }
    if (i < circles.length - 1) {
      await new Promise(r => setTimeout(r, INTER_CIRCLE_DELAY_MS));
    }
  }
}

/**
 * On startup, resume any months that were interrupted (left in 'pending' status
 * after the boot-time reset of stuck 'syncing' rows).
 *
 * Call this from runStartupTasks() — it is a no-op if nothing is pending.
 *
 * @returns {Promise<void>}
 */
export async function runPendingMonths() {
  const pending = getPendingMonths();
  if (pending.length === 0) return;

  log.info(`historicalSync: resuming ${pending.length} pending month(s) from previous run…`);

  for (const { circleId, year, month } of pending) {
    const label = `${circleId} ${year}-${String(month).padStart(2, '0')}`;
    log.info(`historicalSync: resuming ${label}…`);
    markMonthSyncing(circleId, year, month);
    try {
      const count = await syncMonth(circleId, year, month);
      markMonthCompleted(circleId, year, month);
      log.info(`historicalSync: ${label} resumed + completed — ${count} rows`);
    } catch (err) {
      markMonthFailed(circleId, year, month);
      log.error(`historicalSync: ${label} resume failed:`, err.message);
    }
  }
}
