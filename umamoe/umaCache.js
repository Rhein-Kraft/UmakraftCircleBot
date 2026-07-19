/**
 * umamoe/umaCache.js
 * ─────────────────
 * In-memory snapshot cache + historical month cache + previous-month finals.
 * Sits between the API client (umaClient.js) and the stat engine (umaStats.js).
 */

import { config } from '../core/config.js';
import { log } from '../core/log.js';
import { store } from '../core/store.js';
import { getHistoricalMonth, setHistoricalMonth } from '../db/historicalCacheDb.js';
import { jstShiftedNow } from '../core/format.js';
import { fetchCircle } from './umaClient.js';
import { classifyMembers, computeMemberStats } from './umaStats.js';

// How long the in-memory snapshot cache is considered fresh.
// Commands always read from the cache; only dataSync refreshes it.
const SNAPSHOT_TTL_MS = 25 * 60 * 1000; // 25 minutes

// ── Snapshot cache ────────────────────────────────────────────────────────────

// Map<circleId, { snapshot, cachedAt }>
const snapshotCaches = new Map();

// In-flight guard: prevents parallel cold-start calls from firing duplicate
// buildSnapshot() API requests for the same circle.
// Map<circleId, Promise<snapshot>>
const buildInFlight = new Map();

/**
 * Called by dataSync after every successful API pull.
 * Keyed by circleId so multiple circles never overwrite each other.
 */
export function setCachedSnapshot(circleId, snapshot) {
  snapshotCaches.set(String(circleId), { snapshot, cachedAt: Date.now() });
}

/**
 * Return the cached snapshot for the given circle. If the cache is empty or
 * stale AND we have nothing at all, makes one live API call.
 *
 * Commands should always read from the cache and never trigger API calls.
 */
export async function getCircleSnapshot(circleId = config.circleId) {
  const key    = String(circleId);
  const cached = snapshotCaches.get(key) || { snapshot: null, cachedAt: 0 };

  if (cached.snapshot && Date.now() - cached.cachedAt < SNAPSHOT_TTL_MS) {
    return cached.snapshot;
  }

  if (cached.snapshot) {
    log.debug(`getCircleSnapshot(${circleId}): serving stale cache (sync pending)`);
    return cached.snapshot;
  }

  if (buildInFlight.has(key)) {
    log.debug(`getCircleSnapshot(${circleId}): joining in-flight cold-start build`);
    return buildInFlight.get(key);
  }

  log.debug(`getCircleSnapshot(${circleId}): cold start — fetching live`);
  const promise = buildSnapshot(circleId).finally(() => buildInFlight.delete(key));
  buildInFlight.set(key, promise);
  return promise;
}

/**
 * Build a full snapshot object from the API (called by dataSync and on cold start).
 * Also updates the in-memory cache keyed by circleId.
 */
export async function buildSnapshot(circleId = config.circleId) {
  // JST-shifted: daily_fans arrays and stored gain dates are keyed to the
  // JST calendar day, so all getUTC* calendar math here must use JST "today".
  const today      = jstShiftedNow();
  const payload    = await fetchCircle(circleId);
  const classified = classifyMembers(payload, today);
  const prevValues = await getPreviousMonthFinals(circleId, today);

  const enriched = await Promise.all(
    classified.map(async m => {
      const joinedAt = await getStoredJoinedAt(m.trainerId, circleId);
      const stats    = computeMemberStats(m, {
        previousMonthFinal: prevValues[m.trainerId] ?? null,
        joinedAtIso:        joinedAt,
        today,
      });
      return { ...m, ...stats, joinedAt };
    })
  );

  const active = enriched.filter(m => m.active);
  const left   = enriched.filter(m => !m.active);

  const tallyStarted = active.some(m => m.hasData);

  const snapshot = {
    circle:        payload.circle,
    clubRank:      payload.club_rank ?? null,
    members:       active,
    allMembers:    enriched,
    leftMembers:   left,
    rawClassified: classified,
    todayDay:      today.getUTCDate(),
    latestIdx:     classified.reduce((acc, m) => Math.max(acc, m.latestIdx), 0),
    tallyStarted,
  };

  setCachedSnapshot(circleId, snapshot);
  return snapshot;
}

// ── Historical join-date finder ───────────────────────────────────────────────

const historicalMonthCache = new Map();
const MAX_LOOKBACK         = 6;

/**
 * Walk backwards through monthly API data to find the earliest month
 * `trainerId` appears in. Returns an ISO date string, or null.
 *
 * Uses a shared in-process cache so multiple new members discovered in
 * the same sync run don't re-fetch the same historical months.
 */
export async function findEarliestJoinDate(
  trainerId,
  currentYear,
  currentMonth,
  circleId = config.circleId
) {
  const months = [];
  let year  = currentYear;
  let month = currentMonth;
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
    months.push({ year, month });
  }

  for (const { year, month } of months) {
    const cacheKey = `${circleId}:${year}-${month}`;
    if (historicalMonthCache.has(cacheKey)) continue;

    const persisted = getHistoricalMonth(circleId, year, month);
    if (persisted) {
      historicalMonthCache.set(cacheKey, persisted);
      continue;
    }

    try {
      const payload = await fetchCircle(circleId, year, month);
      historicalMonthCache.set(cacheKey, payload);
      setHistoricalMonth(circleId, year, month, payload);
    } catch (err) {
      log.debug(`findEarliestJoinDate: prefetch ${year}-${month}: ${err.message}`);
    }
  }

  let earliest = null;
  for (const { year, month } of months) {
    const cacheKey = `${circleId}:${year}-${month}`;
    const payload  = historicalMonthCache.get(cacheKey);
    if (!payload) break;

    const found = (payload.members ?? []).find(m => String(m.viewer_id) === String(trainerId));
    if (!found) break;

    const fans     = found.daily_fans || [];
    let firstDay   = 1;
    for (let d = 0; d < fans.length; d++) {
      if (fans[d] > 0) { firstDay = d + 1; break; }
    }
    earliest = new Date(Date.UTC(year, month - 1, firstDay)).toISOString();
  }

  return earliest;
}

/**
 * Clear the historical month cache after a sync run.
 * Pass circleId to clear only that circle's entries (safe with parallel syncs).
 * Omit circleId to clear everything (e.g. test teardown).
 */
export function clearHistoricalCache(circleId) {
  if (circleId) {
    for (const key of historicalMonthCache.keys()) {
      if (key.startsWith(`${circleId}:`)) historicalMonthCache.delete(key);
    }
  } else {
    historicalMonthCache.clear();
  }
}

// ── Previous-month finals cache ───────────────────────────────────────────────

// Map<`${circleId}:${year}-${month}`, {expires, data}>
const prevMonthCache = new Map();

export async function getPreviousMonthFinals(circleId, today) {
  let year  = today.getUTCFullYear();
  let month = today.getUTCMonth();
  if (month === 0) { year -= 1; month = 12; }

  const key    = `${circleId}:${year}-${month}`;
  const cached = prevMonthCache.get(key);
  if (cached && Date.now() < cached.expires) return cached.data;

  try {
    const payload = await fetchCircle(circleId, year, month);
    const out     = {};
    for (const m of payload.members ?? []) {
      const fans = m.daily_fans || [];
      for (let i = fans.length - 1; i >= 0; i--) {
        if (fans[i] > 0) { out[String(m.viewer_id)] = fans[i]; break; }
      }
    }
    prevMonthCache.set(key, { expires: Date.now() + 60 * 60 * 1000, data: out });
    return out;
  } catch (err) {
    log.warn('Could not fetch previous month finals:', err.message);
    return {};
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function getStoredJoinedAt(trainerId, circleId) {
  const members = await store.getMembersForCircle(circleId);
  return members[trainerId]?.joinedAt || null;
}
