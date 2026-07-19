// @ts-check
/**
 * fantracking/aggregation/index.js
 * ─────────────────────────────────
 * Materialises per-member weekly / monthly gain totals into a dedicated SQLite
 * table after every sync.  Consumers can read pre-computed aggregates instead
 * of re-summing daily_gains rows on every request.
 *
 * Period keys:
 *   monthly → 'YYYY-MM'  (JST)
 *   weekly  → 'YYYY-Www' (ISO 8601 week, Monday-start)
 *
 * The weekly and monthly gain values come directly from the enriched snapshot
 * produced by computeMemberStats() during sync — no second DB pass needed.
 */

import { log } from '../../core/log.js';
import { upsertPeriodAggregate, getCirclePeriodAggregates } from '../../db/storeDb.js';

// ── Period key helpers ────────────────────────────────────────────────────────

/**
 * Returns the ISO 8601 week key for a JST date, e.g. '2026-W28'.
 * Week 1 is the week containing the year's first Thursday (Monday start).
 *
 * Uses JST (Asia/Tokyo) date components to stay consistent with jstDate()
 * and the YYYY-MM-DD keys stored in daily_gains.
 *
 * @param {Date} date
 * @returns {string}
 */
function isoWeekKey(date) {
  // Derive the calendar date in JST first — this is the date that will appear
  // in daily_gains.date, so both must agree on which week they belong to.
  const jstStr = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }); // 'YYYY-MM-DD'
  const [y, m, d] = jstStr.split('-').map(Number);
  // Treat the JST calendar date as a UTC noon point for arithmetic only.
  const jst = new Date(Date.UTC(y, m - 1, d));
  const day = jst.getUTCDay() || 7; // Mon=1 … Sun=7
  jst.setUTCDate(jst.getUTCDate() + 4 - day); // shift to Thursday of this week
  const yearStart = new Date(Date.UTC(jst.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((jst - yearStart) / 86_400_000 + 1) / 7);
  return `${jst.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Returns the month key for a date in JST, e.g. '2026-07'.
 * JST is UTC+9 — using toLocaleDateString to stay consistent with jstDate().
 *
 * @param {Date} date
 * @returns {string}
 */
function monthKey(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }).slice(0, 7);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Persist weekly and monthly gain totals for all enriched members into the
 * period_aggregates table.  Called synchronously at the end of each syncCircleData run.
 *
 * @param {string} circleId
 * @param {object[]} enrichedMembers  — output of computeMemberStats; must have weeklyGain / monthlyGain
 * @param {Date} date
 */
export function computeAndSaveAggregates(circleId, enrichedMembers, date) {
  const wk = isoWeekKey(date);
  const mo = monthKey(date);

  let saved = 0;
  for (const m of enrichedMembers) {
    if (!m.active) continue;
    try {
      upsertPeriodAggregate(circleId, String(m.trainerId), 'weekly',  wk, m.weeklyGain  ?? 0);
      upsertPeriodAggregate(circleId, String(m.trainerId), 'monthly', mo, m.monthlyGain ?? 0);
      saved++;
    } catch (err) {
      log.warn(`aggregation(${circleId}): failed to save for trainer ${m.trainerId}: ${err.message}`);
    }
  }

  log.debug(`aggregation(${circleId}): saved ${saved} member(s) — week=${wk} month=${mo}`);
}

/**
 * Read all pre-computed aggregates for a circle / period combination.
 * Useful for leaderboards, warning checks, or any consumer that wants
 * pre-aggregated data without hitting daily_gains directly.
 *
 * @param {string} circleId
 * @param {'weekly'|'monthly'} periodType
 * @param {string} periodKey  — e.g. '2026-W28' or '2026-07'
 * @returns {{ viewerId: string, totalGain: number, computedAt: string }[]}
 */
export function getCircleAggregates(circleId, periodType, periodKey) {
  return getCirclePeriodAggregates(circleId, periodType, periodKey);
}
