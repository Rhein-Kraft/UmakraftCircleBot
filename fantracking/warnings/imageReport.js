/**
 * tasks/fanDeficitImageReport.js
 * ───────────────────────────────
 * Posts three image-based fan deficit reports to #urgent-warning daily at 7:35 AM JST.
 *
 * Order: Daily → Weekly → Monthly (three separate images, one after another).
 * Sort:  Lowest gain at the TOP. Quota-met members at the bottom with 👍 banner.
 *
 * Quotas come from guildConfig (set via /set_fans), falling back to config defaults.
 */

import { getCircleSnapshot } from '../../core/uma.js';
import { computeMemberStats } from '../../core/umaStats.js';
import { getUpdateChannel } from '../../core/channels.js';
import { config, getConfiguredCircles } from '../../core/config.js';
import { store } from '../../core/store.js';
import { formatNumber, jstDate, jstShiftedNow } from '../../core/format.js';
import { daysRemainingInMonth } from '../../core/tally.js';
import { log } from '../../core/log.js';
import { isLocked } from '../../core/busyLock.js';
import { resolveQuota } from '../../core/quotaKeys.js';
import {
  renderDailyDeficitReport,
  renderWeeklyDeficitReport,
  renderMonthlyDeficitReport,
} from '../../utils/reports/fanDeficit.js';
import { bufferToAttachment, buildReportFilename } from '../../utils/imageReport.js';

// ── Quota resolvers ───────────────────────────────────────────────────────────

async function getQuotas(guildId, circleId) {
  const cfg = guildId
    ? await store.getGuildConfig(guildId).catch(() => ({}))
    : {};
  return {
    daily:   resolveQuota(cfg, circleId, 'daily',   config.dailyRequirement),
    weekly:  resolveQuota(cfg, circleId, 'weekly',  config.weeklyRequirement),
    monthly: resolveQuota(cfg, circleId, 'monthly', config.monthlyRequirement),
  };
}

// ── Member stat extraction ────────────────────────────────────────────────────

/**
 * From a circle snapshot, build stats for every eligible member.
 * Returns members sorted lowest-first by the given gain field.
 *
 * @param {object}  snapshot
 * @param {'yesterdayGain'|'weeklyGain'|'monthlyGain'} field
 * @returns {{ name:string, gain:number }[]}
 */
function sortedMembers(snapshot, field) {
  const rows = [];
  for (const m of snapshot.members) {
    if (!m.hasData || m.joinDay) continue;
    rows.push({ name: m.trainerName ?? '(unknown)', gain: m[field] ?? 0 });
  }
  // Lowest gain first
  rows.sort((a, b) => a.gain - b.gain);
  return rows;
}

/**
 * Split a sorted list into below-quota and met-quota sections.
 * Met-quota members keep their relative order (were originally sorted lowest-first
 * within their group; for met members highest gain first looks nicer so we reverse).
 */
function splitByQuota(rows, quota) {
  const below = rows.filter(r => r.gain < quota);
  const met   = rows.filter(r => r.gain >= quota).reverse(); // highest on top of met group
  return { below, met };
}

// ── Core post function ────────────────────────────────────────────────────────

/**
 * Post daily + weekly + monthly deficit image cards for one circle to all guilds.
 * @param {object} client
 * @param {string} circleId
 */
export async function postFanDeficitImageReport(client, circleId) {
  if (isLocked()) {
    log.info(`fanDeficitImageReport(${circleId}): skipped — lock held`);
    return;
  }

  // Dedup guard — only post once per JST day per circle
  const today    = jstDate();
  const stateKey = `lastFanDeficitImageDate_${circleId}`;
  const lastDate = await store.getState(stateKey).catch(() => null);
  if (lastDate === today) {
    log.info(`fanDeficitImageReport(${circleId}): already posted today — skipping`);
    return;
  }

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn(`fanDeficitImageReport(${circleId}): snapshot failed: ${err.message}`);
    return;
  }

  if (!snapshot?.members?.length) return;
  if (!snapshot.tallyStarted) {
    log.debug(`fanDeficitImageReport(${circleId}): tally not started — skipping`);
    return;
  }

  const circleName = snapshot.circle?.name ?? circleId;
  const daysLeft   = daysRemainingInMonth(jstShiftedNow());

  // Pre-sort member lists for each period
  const dailyRows   = sortedMembers(snapshot, 'yesterdayGain');
  const weeklyRows  = sortedMembers(snapshot, 'weeklyGain');
  const monthlyRows = sortedMembers(snapshot, 'monthlyGain');

  const guilds = await client.guilds.fetch();

  for (const [, partial] of guilds) {
    let guild;
    try { guild = await partial.fetch(); } catch { continue; }

    const ch = await getUpdateChannel(guild).catch(() => null);
    if (!ch) continue;

    const quotas = await getQuotas(guild.id, circleId);

    // ── DAILY ──────────────────────────────────────────────────────────────
    try {
      const { below, met } = splitByQuota(dailyRows, quotas.daily);
      const buf = await renderDailyDeficitReport({
        circleName,
        date:  today,
        quota: quotas.daily,
        below,
        met,
      });
      await ch.send({ files: [bufferToAttachment(buf, buildReportFilename(`FanDeficitDaily${circleId}`))] });
      log.info(`fanDeficitImageReport(${circleId}): daily posted to ${guild.name} — ${below.length} below, ${met.length} met`);
    } catch (err) {
      log.warn(`fanDeficitImageReport(${circleId}): daily failed in ${guild.name}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1_200));

    // ── WEEKLY ─────────────────────────────────────────────────────────────
    try {
      const { below, met } = splitByQuota(weeklyRows, quotas.weekly);
      const buf = await renderWeeklyDeficitReport({
        circleName,
        date:  today,
        quota: quotas.weekly,
        below,
        met,
      });
      await ch.send({ files: [bufferToAttachment(buf, buildReportFilename(`FanDeficitWeekly${circleId}`))] });
      log.info(`fanDeficitImageReport(${circleId}): weekly posted to ${guild.name} — ${below.length} below, ${met.length} met`);
    } catch (err) {
      log.warn(`fanDeficitImageReport(${circleId}): weekly failed in ${guild.name}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1_200));

    // ── MONTHLY ────────────────────────────────────────────────────────────
    try {
      const { below, met } = splitByQuota(monthlyRows, quotas.monthly);
      const buf = await renderMonthlyDeficitReport({
        circleName,
        date:  today,
        quota: quotas.monthly,
        daysLeft,
        below,
        met,
      });
      await ch.send({ files: [bufferToAttachment(buf, buildReportFilename(`FanDeficitMonthly${circleId}`))] });
      log.info(`fanDeficitImageReport(${circleId}): monthly posted to ${guild.name} — ${below.length} below, ${met.length} met`);
    } catch (err) {
      log.warn(`fanDeficitImageReport(${circleId}): monthly failed in ${guild.name}: ${err.message}`);
    }
  }

  await store.setState(stateKey, today).catch(() => {});
  log.info(`fanDeficitImageReport(${circleId}): done`);
}
