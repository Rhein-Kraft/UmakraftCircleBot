// @ts-check
/**
 * fantracking/velocity/index.js
 * ──────────────────────────────
 * Computes and persists a rolling 7-day average fan gain (velocity) and a
 * projected end-of-month total for each active member after every sync.
 *
 * velocity_7d        — average daily fans over the last 7 calendar days
 *                      sourced from daily_gains so it's a true rolling window,
 *                      not tied to week boundaries
 * projected_monthly  — current_monthly + velocity_7d × days_remaining_in_month
 * current_monthly    — month-to-date gain from the enriched snapshot
 *
 * Downstream consumers (warning engine, milestone eval, profile command)
 * can call getCircleVelocities() to get pre-computed trajectory data without
 * touching daily_gains themselves.
 */

import { log } from '../../core/log.js';
import {
  upsertTrainerVelocity,
  getLastNDaysGain,
  getCircleVelocities as _getCircleVelocities,
  getTrainerVelocity as _getTrainerVelocity,
} from '../../db/storeDb.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Number of calendar days remaining in the month after today, in JST.
 * Returns 0 on the last day of the month.
 *
 * @param {Date} date
 * @returns {number}
 */
function daysRemainingInMonth(date) {
  const jst = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }); // 'YYYY-MM-DD'
  const [y, m, d] = jst.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // days in month (28/29/30/31)
  return Math.max(0, lastDay - d);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute and persist velocity data for all active, non-grace-period members.
 * Called synchronously at the end of each syncCircleData run.
 *
 * @param {string} circleId
 * @param {object[]} enrichedMembers  — output of computeMemberStats
 * @param {Date} date
 */
export function computeAndSaveVelocity(circleId, enrichedMembers, date) {
  const nowIso   = date.toISOString();
  const daysLeft = daysRemainingInMonth(date);

  // Only compute velocity for members with established data (not join-day grace period).
  const eligible = enrichedMembers.filter(m => m.active && m.hasData && !m.joinDay);

  let saved = 0;
  for (const m of eligible) {
    try {
      const trainerId = String(m.trainerId);

      // Rolling 7-day gain from stored daily_gains (true calendar window, not week-boundary).
      // Missing days count as 0 — velocity degrades naturally when a member is inactive.
      const { total: last7Sum } = getLastNDaysGain(circleId, trainerId, 7);
      const velocity7d          = last7Sum / 7; // fans per day

      const currentMonthly   = m.monthlyGain ?? 0;
      const projectedMonthly = currentMonthly + velocity7d * daysLeft;

      upsertTrainerVelocity(circleId, trainerId, {
        computedAt:       nowIso,
        velocity7d,
        projectedMonthly,
        currentMonthly,
      });
      saved++;
    } catch (err) {
      log.warn(`velocity(${circleId}): failed for trainer ${m.trainerId}: ${err.message}`);
    }
  }

  log.debug(
    `velocity(${circleId}): computed ${saved} trainer(s), ${daysLeft} day(s) remaining in month`
  );
}

/**
 * Read velocity data for all members in a circle.
 * Returns one row per trainer with velocity_7d, projected_monthly, current_monthly.
 *
 * @param {string} circleId
 * @returns {{ viewerId: string, velocity7d: number, projectedMonthly: number, currentMonthly: number, computedAt: string }[]}
 */
export function getCircleVelocities(circleId) {
  return _getCircleVelocities(circleId);
}

/**
 * Read velocity data for a single trainer.
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {{ viewerId: string, velocity7d: number, projectedMonthly: number, currentMonthly: number, computedAt: string } | null}
 */
export function getTrainerVelocity(circleId, trainerId) {
  return _getTrainerVelocity(circleId, trainerId);
}
