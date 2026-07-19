/**
 * tasks/stadiumSync.js
 * ─────────────────────
 * Daily task that refreshes the Team Stadium cache for all active members.
 *
 * - Runs once per day (04:30 JST) plus on startup for any member with no cache.
 * - Uses a 3-second delay between Playwright calls to avoid hammering uma.moe.
 * - Non-destructive: existing good data is never overwritten with null.
 * - INSERT OR IGNORE semantics: stadiumDb.recordStadiumError() marks failures
 *   without clearing the last good payload.
 */

import { getConfiguredCircles } from '../core/config.js';
import { getActiveMembers }      from '../db/storeDb.js';
import { getStaleViewerIds, setStadiumCache, recordStadiumError } from '../db/stadiumDb.js';
import { scrapeStadiumData } from '../umamoe/trainer/stadiumScraper.js';
import { log } from '../core/log.js';

const DELAY_BETWEEN_MS = 3_000;
const MAX_AGE_HOURS    = 22;

/** Collect all unique viewer_ids across all active circles. */
function getAllViewerIds() {
  const circles = getConfiguredCircles();
  const seen    = new Set();
  for (const { id: circleId } of circles) {
    for (const m of getActiveMembers(circleId)) {
      if (m.viewer_id) seen.add(String(m.viewer_id));
    }
  }
  return [...seen];
}

/**
 * Refresh stadium cache for members whose data is missing or stale.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.forceAll]       — refresh even fresh entries
 * @param {string}  [opts.singleViewerId] — only refresh one specific member
 */
export async function runStadiumSync({ forceAll = false, singleViewerId = null } = {}) {
  const allIds = singleViewerId ? [singleViewerId] : getAllViewerIds();
  if (!allIds.length) {
    log.info('[stadiumSync] No active members — nothing to sync.');
    return;
  }

  const toSync = forceAll ? allIds : getStaleViewerIds(allIds, MAX_AGE_HOURS);
  if (!toSync.length) {
    log.info('[stadiumSync] All caches fresh — skipping.');
    return;
  }

  log.info(`[stadiumSync] Syncing ${toSync.length} / ${allIds.length} members…`);

  let ok = 0, fail = 0;
  for (const viewerId of toSync) {
    try {
      const data = await scrapeStadiumData(viewerId);
      if (data) {
        setStadiumCache(viewerId, data);
        ok++;
        log.debug(`[stadiumSync] ✓ ${viewerId} — ${data.horses.length} horse(s)`);
      } else {
        recordStadiumError(viewerId);
        fail++;
        log.warn(`[stadiumSync] ✗ ${viewerId} — scrape returned null`);
      }
    } catch (err) {
      recordStadiumError(viewerId);
      fail++;
      log.warn(`[stadiumSync] ✗ ${viewerId} — ${err.message}`);
    }

    if (toSync.indexOf(viewerId) < toSync.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS));
    }
  }

  log.info(`[stadiumSync] Done — ${ok} updated, ${fail} failed.`);
}

/**
 * Startup check: sync members who have no cache entry at all.
 * Fire-and-forget. Does not block bot startup.
 */
export async function maybeStartupStadiumSync() {
  try {
    const allIds = getAllViewerIds();
    const stale  = getStaleViewerIds(allIds, 23 * 365); // "never synced" = very old cutoff
    if (!stale.length) return;
    log.info(`[stadiumSync] Startup: ${stale.length} member(s) have no stadium cache — syncing.`);
    await runStadiumSync({ forceAll: false });
  } catch (err) {
    log.warn(`[stadiumSync] Startup sync failed (non-fatal): ${err.message}`);
  }
}
