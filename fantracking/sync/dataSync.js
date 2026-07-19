// @ts-check
import {
  buildSnapshot,
  setCachedSnapshot,
  findEarliestJoinDate,
  clearHistoricalCache,
  getPreviousMonthFinals,
  computeMemberStats,
} from '../../core/uma.js';
import { store } from '../../core/store.js';
import { log } from '../../core/log.js';
import { config } from '../../core/config.js';
import { setCircleRank } from '../../core/health.js';
import { jstDate, jstShiftedNow, jstDateOffset } from '../../core/format.js';
import { getJoinDateFromNotes } from '../../umamoe/history/joinDateNotes.js';
import { computeAndSaveAggregates } from '../aggregation/index.js';
import { computeAndSaveVelocity } from '../velocity/index.js';
import { setMemberStatus } from '../../db/trainerColorDb.js';

/**
 * Per-circle live sync status. Map<circleId, {lastSyncAt, lastSyncError, consecutiveFailures}>
 * Read by core/health.js and commands/circle_status.js.
 */
export const syncStatus = new Map();

function getSyncStatus(circleId) {
  if (!syncStatus.has(circleId)) {
    syncStatus.set(circleId, { lastSyncAt: null, lastSyncError: null, consecutiveFailures: 0 });
  }
  return syncStatus.get(circleId);
}

/**
 * Processing order (per spec):
 *  1. Fetch fresh data from uma.moe and build a snapshot
 *  2. Detect newly joined / returned members
 *  3. Assign historically accurate join dates (walks back up to 6 months)
 *  4. Calculate daily fan gains with join-day zero + 30M spike guard
 *  5. Save corrected values (dedup-safe — safe to run multiple times per day)
 *  6. Update the in-memory cache so commands get fresh data without extra API calls
 *  7. Mark left members; never overwrite an existing join date unless an earlier one is found
 *  8. Persist aggregated weekly/monthly totals and velocity projections
 *
 * circleId defaults to the main circle. Pass a different ID to sync a secondary circle.
 * Each circle uses its own namespaced storage so data never cross-contaminates.
 */
export async function syncCircleData(circleId = config.circleId) {
  const today = new Date();
  // Use JST date as the storage key so it matches jstDate() used by all consumers
  const todayStr = jstDate();
  const nowIso = today.toISOString();
  // JST-shifted: daily_fans arrays and stored gain dates are keyed to the JST
  // calendar day, so any getUTC* calendar math below (day-of-month index,
  // day-of-week, current-month checks) must use JST "today", not real UTC
  // "today" — otherwise it's off by one for ~9 hours every day (UTC
  // 15:00-23:59 = JST 00:00-08:59).
  const jstToday = jstShiftedNow(today);

  // ── Step 1: Fetch raw data ─────────────────────────────────────────────────
  let snapshot;
  try {
    snapshot = await buildSnapshot(circleId);
    if (snapshot.clubRank != null) setCircleRank(circleId, snapshot.clubRank);
  } catch (err) {
    const errStatus = getSyncStatus(circleId);
    errStatus.lastSyncError = err.message;
    errStatus.consecutiveFailures += 1;
    log.error(`dataSync(${circleId}): failed to fetch uma.moe data:`, err.message);
    return;
  }

  const classified = snapshot.rawClassified;
  const known = await store.getMembersForCircle(circleId);

  // ── Steps 2-3: Detect new/returned members and resolve join dates ──────────
  const newViewerIds = new Set();
  for (const m of classified) {
    if (!m.active) continue;
    const existing = known[m.trainerId];
    if (!existing || existing.leftAt) {
      newViewerIds.add(m.trainerId);
    }
  }

  const resolvedJoinDates = new Map();
  for (const trainerId of newViewerIds) {
    let joinDate;
    try {
      // Joindate.md is a curated, day-precision reference derived from raw
      // CSV first-appearance data — prefer it over anything guessed from
      // uma.moe's own monthly daily_fans arrays, which can only see back a
      // few months and often lands on day 1 when it runs out of history.
      const notesDate = getJoinDateFromNotes(trainerId);
      const historical = notesDate
        ? `${notesDate}T00:00:00.000Z`
        : await findEarliestJoinDate(
            trainerId,
            jstToday.getUTCFullYear(),
            jstToday.getUTCMonth() + 1,
            circleId
          );
      if (historical) {
        joinDate = historical;
        log.debug(`dataSync(${circleId}): ${trainerId} historical join → ${joinDate}`);
      } else {
        const raw = classified.find(m => m.trainerId === trainerId);
        if (raw && raw.firstNonZeroIdx >= 0) {
          joinDate = new Date(
            Date.UTC(jstToday.getUTCFullYear(), jstToday.getUTCMonth(), raw.firstNonZeroIdx + 1)
          ).toISOString();
        } else {
          joinDate = nowIso;
        }
      }
    } catch (err) {
      log.warn(
        `dataSync(${circleId}): could not determine join date for ${trainerId}: ${err.message}`
      );
      joinDate = nowIso;
    }

    const existingJoin = known[trainerId]?.joinedAt;
    if (!existingJoin || joinDate < existingJoin) {
      resolvedJoinDates.set(trainerId, joinDate);
    }
  }

  clearHistoricalCache(circleId);

  // ── Step 5a: Persist member records (circle-scoped) ────────────────────────
  const seenViewerIds = new Set();
  let newCount = 0;
  let leftCount = 0;
  let returnedCount = 0;

  for (const m of classified) {
    if (!m.active) continue;
    seenViewerIds.add(m.trainerId);

    const existing = known[m.trainerId];
    const joinedAt = resolvedJoinDates.get(m.trainerId) ?? existing?.joinedAt ?? nowIso;

    if (!existing) {
      newCount += 1;
      await store.upsertMemberForCircle(circleId, m.trainerId, {
        trainerName: m.trainerName,
        joinedAt,
        firstSeenAt: nowIso,
        lastSeen: nowIso,
        leftAt: null,
      });
    } else if (existing.leftAt) {
      returnedCount += 1;
      await store.upsertMemberForCircle(circleId, m.trainerId, {
        trainerName: m.trainerName,
        joinedAt,
        lastSeen: nowIso,
        leftAt: null,
      });
    } else {
      const patch = { trainerName: m.trainerName, lastSeen: nowIso };
      if (resolvedJoinDates.has(m.trainerId)) {
        patch.joinedAt = resolvedJoinDates.get(m.trainerId);
      }
      await store.upsertMemberForCircle(circleId, m.trainerId, patch);
    }
  }

  // Mark members no longer in THIS circle as having left.
  // Only looks at members stored for this specific circle — other circles unaffected.
  for (const [trainerId, info] of Object.entries(known)) {
    if (!seenViewerIds.has(trainerId) && !info.leftAt) {
      leftCount += 1;
      await store.upsertMemberForCircle(circleId, trainerId, { leftAt: nowIso });
    }
  }

  // Increment sync_count for every active member seen in this run.
  for (const trainerId of seenViewerIds) {
    store.incrementSyncCount(circleId, trainerId);
  }

  // ── Steps 4-5b: Compute and save daily gains (circle-scoped) ──────────────
  const prevValues = await getPreviousMonthFinals(circleId, jstToday).catch(err => {
    log.warn(`dataSync(${circleId}): could not get previous month finals:`, err.message);
    return {};
  });

  const updatedMembers = await store.getMembersForCircle(circleId);
  let savedGains = 0;

  // The index into daily_fans[] that corresponds to today in UTC (0-based).
  // classifyMembers sets latestIdx to the highest index that has non-zero fan
  // data across all members. When the game API hasn't pushed today's data yet,
  // latestIdx is still pointing at yesterday, so computeMemberStats would
  // return yesterday's gain. Writing that under today's date — combined with
  // the MAX() upsert — permanently inflates today's record and causes the daily
  // achievement task to fire incorrectly. Guard: skip writing until the API has
  // actual data for today.
  const todayDateIdx = jstToday.getUTCDate() - 1;
  // latestIdx is shared across all members (classifyMembers picks the max);
  // grab it from the first active member — safe because all share the same value.
  const firstActive = classified.find(m => m.active);
  const apiHasTodayData = firstActive ? firstActive.latestIdx >= todayDateIdx : false;

  if (!apiHasTodayData) {
    log.debug(`dataSync(${circleId}): API hasn't updated today's fan data yet (latestIdx=${firstActive?.latestIdx ?? '?'} < ${todayDateIdx}) — skipping daily gain writes to avoid stale carry-over`);
  }

  // Date strings for the two most-recently completed days (JST).
  // We re-settle these on every sync because uma.moe retroactively adjusts
  // previous days' cumulative totals (late fan attributions), which shifts
  // the baseline used to compute past-day deltas. MAX upsert can never
  // correct an inflated gain downward, so we overwrite completed days.
  const yesterdayStr        = jstDateOffset(-1);
  const dayBeforeYesterday  = jstDateOffset(-2);

  for (const m of classified) {
    if (!m.active) continue;
    const storedMember = updatedMembers[m.trainerId];
    const stats = computeMemberStats(m, {
      previousMonthFinal: prevValues[m.trainerId] ?? null,
      joinedAtIso: storedMember?.joinedAt ?? null,
      today: jstToday,
    });

    // ── Today: MAX upsert (running total grows throughout the day) ────────────
    if (apiHasTodayData) {
      await store.storeDailyGainForCircle(
        circleId,
        m.trainerId,
        todayStr,
        stats.todayGain,
        m.latestValue
      );
      savedGains += 1;
    }

    // ── Yesterday: REPLACE (overwrite) — corrects retroactive baseline shifts ──
    // Re-compute from the daily_fans array which has the latest uma.moe values.
    // Only settle if we actually have that day's data (idx >= 1) and the month
    // hasn't just rolled over (todayDateIdx > 0 means yesterday is same month).
    if (todayDateIdx > 0 && stats.yesterdayGain != null) {
      const yesterdayTotalFans = m.dailyFans[todayDateIdx - 1] ?? 0;
      await store.settleDailyGainForCircle(
        circleId,
        m.trainerId,
        yesterdayStr,
        stats.yesterdayGain,
        yesterdayTotalFans
      );
    }

    // ── Day-before-yesterday: REPLACE — covers uma.moe's 2-day retroactive window
    if (todayDateIdx > 1) {
      const d2Gain      = stats.deltas?.[todayDateIdx - 2] ?? null;
      const d2TotalFans = m.dailyFans[todayDateIdx - 2] ?? 0;
      if (d2Gain != null) {
        await store.settleDailyGainForCircle(
          circleId,
          m.trainerId,
          dayBeforeYesterday,
          d2Gain,
          d2TotalFans
        );
      }
    }
  }

  // Prune old gain records once a month (per circle).
  const pruneKey = `lastGainPrune_${circleId}`;
  const lastPrune = await store.getState(pruneKey);
  if (!lastPrune || Date.now() - new Date(lastPrune).getTime() > 30 * 24 * 60 * 60 * 1000) {
    await store.pruneDailyGainsForCircle(circleId, 1095);
    await store.setState(pruneKey, nowIso);
  }

  // ── Step 6: Rebuild cache in-process (no extra API call) ──────────────────
  let enriched = null;
  try {
    enriched = classified.map(m => {
      const stored = updatedMembers[m.trainerId];
      const joinedAt = stored?.joinedAt ?? null;
      const stats = computeMemberStats(m, {
        previousMonthFinal: prevValues[m.trainerId] ?? null,
        joinedAtIso: joinedAt,
        today: jstToday,
      });
      return { ...m, ...stats, joinedAt };
    });
    const activeMembers = enriched.filter(m => m.active);
    const leftMembers = enriched.filter(m => !m.active);

    // Keep the persisted trainer-color assignment table in sync with active/
    // left status, so departed members render grey and their color becomes
    // available for a new trainer to inherit (see db/trainerColorDb.js).
    try {
      for (const m of enriched) {
        setMemberStatus(m.trainerId, m.trainerName ?? '', !!m.active);
      }
    } catch (err) {
      log.warn(`dataSync(${circleId}): trainer color status sync failed:`, err.message);
    }
    const tallyStarted = activeMembers.some(m => m.hasData);
    setCachedSnapshot(circleId, {
      circle: snapshot.circle,
      members: activeMembers,
      allMembers: enriched,
      leftMembers,
      rawClassified: classified,
      todayDay: jstToday.getUTCDate(),
      latestIdx: classified.reduce((acc, m) => Math.max(acc, m.latestIdx), 0),
      tallyStarted,
    });
  } catch (err) {
    log.warn(
      `dataSync(${circleId}): in-process snapshot rebuild failed — cache may be stale:`,
      err.message
    );
  }

  await store.setState(`lastDataSync_${circleId}`, nowIso);

  // ── Step 7: Capture daily leaderboard snapshot ─────────────────────────────
  // Keyed by JST date so multiple syncs on the same day simply upsert.
  // This powers historical leaderboards, rank history, and personal bests.
  try {
    const snapshotDate  = jstDate();
    const freshMembers  = await store.getMembersForCircle(circleId);
    const eligible      = classified.filter(m => m.active);
    const withData      = eligible.filter(m => {
      const s = freshMembers[m.trainerId];
      return s && !s.joinDay;
    });

    // Re-derive stats so we can rank by today's gain
    const prevVals = await getPreviousMonthFinals(circleId, jstToday).catch(() => ({}));
    const ranked   = withData
      .map(m => {
        const stored = freshMembers[m.trainerId];
        const stats  = computeMemberStats(m, {
          previousMonthFinal: prevVals[m.trainerId] ?? null,
          joinedAtIso:        stored?.joinedAt ?? null,
          today: jstToday,
        });
        return { trainerId: m.trainerId, trainerName: m.trainerName, gain: stats.todayGain ?? 0, totalFans: m.latestValue ?? 0 };
      })
      .filter(r => r.gain > 0)
      .sort((a, b) => b.gain - a.gain)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    if (ranked.length > 0) {
      store.saveLeaderboardSnapshot(circleId, 'daily', snapshotDate, ranked);
      log.debug(`dataSync(${circleId}): snapshot saved — ${ranked.length} ranked trainer(s) for ${snapshotDate}`);
    }
  } catch (err) {
    log.warn(`dataSync(${circleId}): snapshot capture failed (non-fatal):`, err.message);
  }

  // ── Step 8: Persist aggregated stats and velocity projections ─────────────
  if (enriched) {
    try {
      computeAndSaveAggregates(circleId, enriched, today);
    } catch (err) {
      log.warn(`dataSync(${circleId}): aggregation save failed (non-fatal):`, err.message);
    }
    try {
      computeAndSaveVelocity(circleId, enriched, today);
    } catch (err) {
      log.warn(`dataSync(${circleId}): velocity save failed (non-fatal):`, err.message);
    }
  }

  // Update per-circle live sync status so health endpoint can reflect it.
  const okStatus = getSyncStatus(circleId);
  okStatus.lastSyncAt = nowIso;
  okStatus.lastSyncError = null;
  okStatus.consecutiveFailures = 0;

  const summary = `${seenViewerIds.size} active, +${newCount} new${returnedCount ? ` (${returnedCount} returned)` : ''}, -${leftCount} left`;
  if (newCount || leftCount || returnedCount) {
    log.info(`dataSync(${circleId}): ${summary}, saved ${savedGains} daily records`);
  } else {
    log.debug(`dataSync(${circleId}): ${summary}`);
  }

  return { activeCount: seenViewerIds.size, newCount, leftCount, returnedCount };
}
