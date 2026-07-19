/**
 * umamoe/profileBackfill.js
 * ──────────────────────────
 * Historical fan gain backfill for the /profile command.
 *
 * On first detection of a trainer, fetches up to the past month of daily fan
 * data from uma.moe and writes it into daily_gains so the profile card shows
 * real history instead of a gap.
 *
 * Dedup-safe: storeDailyGain uses INSERT OR REPLACE so running this twice
 * for the same member is harmless.
 *
 * Rate-limit aware: uses the existing umaClient queue (enqueue) so backfill
 * calls don't stomp on the main sync loop.
 */

import { fetchCircle } from './umaClient.js';
import { storeDailyGain, getMemberDailyGains } from '../db/storeDb.js';
import { log } from '../core/log.js';

// How many calendar days back to backfill (covers current + previous month)
const BACKFILL_DAYS = 60;

// In-memory set to avoid redundant backfills within the same process session
const _backfilled = new Set();

/**
 * Backfill up to BACKFILL_DAYS of daily fan gains for a single trainer.
 *
 * Skips silently if:
 *   - Already backfilled this session (in-memory guard)
 *   - Already has >= 20 days of records (data is sufficiently populated)
 *
 * @param {string} circleId
 * @param {string} trainerId
 * @returns {Promise<void>}
 */
export async function backfillHistoricalGains(circleId, trainerId) {
  const key = `${circleId}:${trainerId}`;
  if (_backfilled.has(key)) return;
  _backfilled.add(key);

  // Check how many days of data we already have for this trainer
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setUTCDate(today.getUTCDate() - BACKFILL_DAYS);
  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr   = today.toISOString().slice(0, 10);

  const existing = getMemberDailyGains(circleId, trainerId, fromStr, toStr);
  if (existing.length >= 20) {
    log.debug(`profileBackfill: ${trainerId} already has ${existing.length} days — skipping`);
    return;
  }

  log.debug(`profileBackfill: backfilling ${trainerId} in circle ${circleId} (${existing.length} days existing)`);

  // Fetch current month and previous month
  const months = [];
  let yr = today.getUTCFullYear();
  let mo = today.getUTCMonth() + 1;
  for (let i = 0; i < 2; i++) {
    months.push({ year: yr, month: mo });
    mo -= 1;
    if (mo === 0) { mo = 12; yr -= 1; }
  }

  for (const { year, month } of months) {
    let payload;
    try {
      payload = await fetchCircle(circleId, year, month);
    } catch (err) {
      log.debug(`profileBackfill: fetchCircle(${circleId}, ${year}, ${month}) failed: ${err.message}`);
      continue;
    }

    const member = (payload.members ?? []).find(m => String(m.viewer_id) === String(trainerId));
    if (!member) continue;

    const fans    = member.daily_fans ?? [];
    const daysInM = new Date(Date.UTC(year, month, 0)).getUTCDate(); // days in month

    let written = 0;
    for (let dayIdx = 0; dayIdx < fans.length && dayIdx < daysInM; dayIdx++) {
      const totalFans = fans[dayIdx];
      if (!totalFans || totalFans <= 0) continue;

      const dateStr = new Date(Date.UTC(year, month - 1, dayIdx + 1))
        .toISOString().slice(0, 10);

      // Skip future dates
      if (dateStr > toStr) continue;

      // Compute gain = today's fans - yesterday's fans (or 0 on day 1)
      const prevFans = dayIdx > 0 ? (fans[dayIdx - 1] ?? 0) : 0;
      const gain     = Math.max(0, totalFans - prevFans);

      storeDailyGain(circleId, trainerId, dateStr, gain, totalFans);
      written++;
    }

    if (written > 0) {
      log.debug(`profileBackfill: wrote ${written} day(s) for ${trainerId} — ${year}-${String(month).padStart(2,'0')}`);
    }
  }
}
