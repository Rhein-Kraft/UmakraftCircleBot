import { getCircleSnapshot } from '../core/uma.js';
import { getLeaderboardChannel } from '../core/channels.js';
import { formatNumber, jstShiftedNow, jstDate } from '../core/format.js';
import { tallyResultDayFor } from '../core/tally.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';
import { isLocked } from '../core/busyLock.js';
import { config } from '../core/config.js';
import { resolveQuota } from '../core/quotaKeys.js';
import { renderTallyResults, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';

const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];

/**
 * Posts the weekly tally results to #leaderboard.
 * Triggered daily at 23:30 local time; posts only on tally boundary days
 * (day 7, 14, 21 and the last day of the month).
 */
export async function maybePostTallyResults(client, force = false, circleId) {
  if (isLocked()) {
    log.info('tallyResults: skipped — notification lock held');
    return;
  }
  // JST-shifted: tally boundary days (7/14/21/last-day) are JST calendar days.
  const today = jstShiftedNow();
  const week = tallyResultDayFor(today);
  if (!force && !week) return;
  const effectiveWeek = week || 4;

  // Dedup: only post once per tally boundary day per circle (protects against restarts).
  const dateStr = jstDate();
  const stateKey = `lastTallyResultsDate_${circleId}`;
  if (!force) {
    const lastPosted = await store.getState(stateKey).catch(() => null);
    if (lastPosted === dateStr) {
      log.info(`tallyResults(${circleId}): already posted today — skipping`);
      return;
    }
  }

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn('tallyResults: failed to fetch data:', err.message);
    return;
  }

  if (!snapshot.tallyStarted) {
    log.debug('tallyResults: tally not started yet, skipping');
    return;
  }

  const ranked = [...snapshot.members]
    .filter(m => m.hasData)
    .map(m => {
      const todayIdx = snapshot.latestIdx;
      const start = Math.max(0, todayIdx - 6);
      let gain = 0;
      for (let i = start; i <= todayIdx; i++) gain += m.deltas[i] ?? 0;
      return { name: m.trainerName, gain, monthly: m.monthlyGain };
    })
    .sort((a, b) => b.gain - a.gain);

  const top20 = ranked.slice(0, 20);
  const circleWeekTotal = ranked.reduce((s, r) => s + r.gain, 0);

  // Resolve quotas so gains can be colored green (met) / red (below) per the
  // fan-gain color standard, instead of a hardcoded color.
  const guildCfg = config.guildId
    ? await store.getGuildConfig(config.guildId).catch(() => ({}))
    : {};
  const weeklyReq  = resolveQuota(guildCfg, circleId, 'weekly',  config.weeklyRequirement);
  const monthlyReq = resolveQuota(guildCfg, circleId, 'monthly', config.monthlyRequirement);

  const buf = await renderTallyResults({
    circleName: snapshot.circle.name,
    weekLabel: ORDINAL[effectiveWeek],
    date: dateStr,
    rows: top20.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      weekGain: formatNumber(r.gain),
      weekGainPct: weeklyReq > 0 ? Math.round((r.gain / weeklyReq) * 100) : 0,
      monthly: formatNumber(r.monthly),
      monthlyPct: monthlyReq > 0 ? Math.round((r.monthly / monthlyReq) * 100) : 0,
    })),
    circleWeekTotal: formatNumber(circleWeekTotal),
  });

  const attachment = bufferToAttachment(buf, buildReportFilename('TallyResults'));

  const guilds = await client.guilds.fetch();
  for (const [, partial] of guilds) {
    try {
      const guild = await partial.fetch();
      const lbChannel = await getLeaderboardChannel(guild);
      if (lbChannel) {
        await lbChannel.send({ files: [attachment] });
      }
    } catch (err) {
      log.warn(`tallyResults: ${partial.name || partial.id}: ${err.message}`);
    }
  }

  await store.setState(stateKey, dateStr).catch(() => {});
  log.info(`tallyResults: posted ${ORDINAL[effectiveWeek]} week results`);
}
