/**
 * umamoe/umaStats.js
 * ─────────────────
 * Pure stat computation — no API calls, no cache, no side effects.
 * classifyMembers  — determines active vs. left status from raw API payload
 * computeMemberStats — calculates daily/weekly/monthly gains and flags
 */

const SPIKE_THRESHOLD = 30_000_000;

/**
 * Classify which members are currently in the circle vs. those who left.
 * Members who are still active keep having their daily_fans updated;
 * those who left have their array frozen on the day they left.
 */
export function classifyMembers(payload, today = new Date()) {
  const members = payload?.members ?? [];
  const isCurrentMonth =
    members.length > 0 &&
    members[0].year === today.getUTCFullYear() &&
    members[0].month === today.getUTCMonth() + 1;

  let latestIdx = 0;
  for (const m of members) {
    for (let i = m.daily_fans.length - 1; i >= 0; i--) {
      if (m.daily_fans[i] > 0) {
        if (i > latestIdx) latestIdx = i;
        break;
      }
    }
  }

  return members.map(m => {
    const fans      = m.daily_fans;
    const lastValue = fans[latestIdx] || 0;
    const prevValue = latestIdx > 0 ? fans[latestIdx - 1] : 0;

    const lastUpdatedDate = m.last_updated ? new Date(m.last_updated) : null;
    const updatedThisMonth =
      lastUpdatedDate != null &&
      lastUpdatedDate.getUTCFullYear() === today.getUTCFullYear() &&
      lastUpdatedDate.getUTCMonth() === today.getUTCMonth();

    let active;
    if (!isCurrentMonth) {
      active = lastValue > 0;
    } else if (lastValue === 0) {
      active = false;
    } else if (lastValue > prevValue) {
      active = true;
    } else if (updatedThisMonth) {
      active = true;
    } else {
      active = false;
    }

    let firstNonZeroIdx = -1;
    for (let i = 0; i < fans.length; i++) {
      if (fans[i] > 0) { firstNonZeroIdx = i; break; }
    }

    return {
      trainerId:       String(m.viewer_id),
      trainerName:     m.trainer_name,
      year:            m.year,
      month:           m.month,
      dailyFans:       fans,
      lastUpdated:     m.last_updated,
      active,
      latestIdx,
      latestValue:     lastValue,
      firstNonZeroIdx,
    };
  });
}

/**
 * Compute per-member contribution stats.
 *
 * Rules applied:
 *  1. Join-day gain is always zero.
 *  2. Any day where fans jump from 0 by > 30M is treated as a registration
 *     spike and zeroed (handles members who had fans before the bot started).
 *  3. Weekly gain = calendar week (Mon 00:00 UTC → today).
 *  4. Monthly gain = day 1 → today.
 */
export function computeMemberStats(member, opts = {}) {
  const { previousMonthFinal = null, joinedAtIso = null, today = new Date() } = opts;

  const fans = member.dailyFans.map(v => Math.max(0, v ?? 0));

  const todayIdx          = Math.min(fans.length - 1, today.getUTCDate() - 1);
  const effectiveTodayIdx = Math.min(todayIdx, member.latestIdx);

  const deltas = [];
  for (let i = 0; i <= member.latestIdx; i++) {
    if (i === 0) {
      const prev = previousMonthFinal != null ? Math.max(0, previousMonthFinal) : fans[0];
      deltas.push(Math.max(0, fans[0] - prev));
    } else {
      deltas.push(Math.max(0, fans[i] - fans[i - 1]));
    }
  }

  let joinIdx = -1;
  if (joinedAtIso) {
    const joined = new Date(joinedAtIso);
    if (joined.getUTCFullYear() === member.year && joined.getUTCMonth() + 1 === member.month) {
      joinIdx = joined.getUTCDate() - 1;
    }
  }

  if (joinIdx < 0 && (previousMonthFinal === null || previousMonthFinal === undefined)) {
    const hasRawPriorData = member.dailyFans
      .slice(0, effectiveTodayIdx)
      .some(v => v !== 0 && v !== null && v !== undefined);
    if (!hasRawPriorData && fans[effectiveTodayIdx] > 0) {
      joinIdx = effectiveTodayIdx;
    }
  }

  for (let i = 0; i < deltas.length; i++) {
    const isJoinDay     = i === joinIdx;
    const isPrevZero    = i === 0 ? previousMonthFinal === null || previousMonthFinal === 0 : fans[i - 1] === 0;
    const isPrevJoinDay = joinIdx >= 0 && i === joinIdx + 1;
    const isSpike       = (isPrevZero || isPrevJoinDay) && deltas[i] > SPIKE_THRESHOLD;
    if (isJoinDay || isSpike) deltas[i] = 0;
  }

  const gainStartIdx   = joinIdx >= 0 ? joinIdx : 0;
  const daysSinceMon   = (today.getUTCDay() + 6) % 7;
  const weekStartIdx   = Math.max(gainStartIdx, today.getUTCDate() - daysSinceMon - 1);

  let weeklyGain = 0;
  for (let i = weekStartIdx; i <= todayIdx; i++) weeklyGain += deltas[i] ?? 0;

  let monthlyGain = 0;
  for (let i = gainStartIdx; i <= todayIdx; i++) monthlyGain += deltas[i] ?? 0;

  const hasData = fans.some(v => v > 0);

  let joinDay = false;
  if (joinedAtIso) {
    const j = new Date(joinedAtIso);
    joinDay =
      j.getUTCFullYear() === today.getUTCFullYear() &&
      j.getUTCMonth() === today.getUTCMonth() &&
      j.getUTCDate() === today.getUTCDate();
  }
  if (!joinDay && joinIdx === effectiveTodayIdx) {
    joinDay = true;
  }

  return {
    deltas,
    todayGain:         deltas[effectiveTodayIdx] ?? 0,
    yesterdayGain:     effectiveTodayIdx >= 1 ? (deltas[effectiveTodayIdx - 1] ?? 0) : 0,
    weeklyGain,
    monthlyGain,
    totalLifetimeFans: fans[member.latestIdx] || 0,
    hasData,
    joinDay,
  };
}
