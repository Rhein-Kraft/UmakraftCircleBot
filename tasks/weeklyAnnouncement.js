import { getCircleSnapshot } from '../core/uma.js';
import { ensureGuildChannels, getLeaderboardChannel } from '../core/channels.js';
import { formatNumber } from '../core/format.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';
import { isLocked } from '../core/busyLock.js';
import { config } from '../core/config.js';
import { resolveQuota } from '../core/quotaKeys.js';
import { renderWeeklyReport, renderHelpCard, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';

export async function postWeeklyLeaderboard(client, circleId) {
  if (isLocked()) {
    log.info('weeklyAnnouncement: skipped — notification lock held');
    return;
  }

  // Dedup: only post once per week per circle (protects against Monday restarts).
  const today = new Date().toISOString().slice(0, 10);
  const stateKey = `lastWeeklyLbPosted_${circleId}`;
  const lastPosted = await store.getState(stateKey).catch(() => null);
  if (lastPosted === today) {
    log.info(`weeklyAnnouncement(${circleId}): already posted today — skipping`);
    return;
  }

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn('weeklyAnnouncement: failed to fetch data:', err.message);
    return;
  }

  const eligible = snapshot.members.filter(m => m.hasData && !m.joinDay);
  const sorted = [...eligible].sort((a, b) => b.weeklyGain - a.weeklyGain);
  const top = sorted.slice(0, 20);

  // Resolve quotas so gains can be colored green (met) / red (below) per the
  // fan-gain color standard, instead of a hardcoded color.
  const guildCfg = config.guildId
    ? await store.getGuildConfig(config.guildId).catch(() => ({}))
    : {};
  const dailyReq   = resolveQuota(guildCfg, circleId, 'daily',   config.dailyRequirement);
  const weeklyReq  = resolveQuota(guildCfg, circleId, 'weekly',  config.weeklyRequirement);
  const monthlyReq = resolveQuota(guildCfg, circleId, 'monthly', config.monthlyRequirement);

  const rows = top.map((m, i) => ({
    rank: i + 1,
    name: m.trainerName,
    daily: formatNumber(m.todayGain),
    dailyPct: dailyReq > 0 ? Math.round((m.todayGain / dailyReq) * 100) : 0,
    weekly: formatNumber(m.weeklyGain),
    weeklyPct: weeklyReq > 0 ? Math.round((m.weeklyGain / weeklyReq) * 100) : 0,
    monthly: formatNumber(m.monthlyGain),
    monthlyPct: monthlyReq > 0 ? Math.round((m.monthlyGain / monthlyReq) * 100) : 0,
  }));

  const buf = await renderWeeklyReport({
    circleName: snapshot.circle.name,
    date: today,
    rows,
  });

  const attachment = bufferToAttachment(buf, buildReportFilename('WeeklyReport'));

  const guilds = await client.guilds.fetch();
  for (const [, partial] of guilds) {
    try {
      const guild = await partial.fetch();

      // Post to #announcement
      const { announcement } = await ensureGuildChannels(guild);
      if (announcement) {
        await announcement.send({ files: [attachment] });
      }

      // Replace pinned weekly entry in #leaderboard
      const lbChannel = await getLeaderboardChannel(guild);
      if (lbChannel) {
        const guildConfig = await store.getGuildConfig(guild.id);
        const weeklyKey = `lbMsgWeeklyReport_${circleId}`;
        const prevMsgId = guildConfig[weeklyKey];
        if (prevMsgId) {
          try {
            const prev = await lbChannel.messages.fetch(prevMsgId);
            await prev.delete();
          } catch {
            /* already gone */
          }
        }
        const msg = await lbChannel.send({ files: [attachment] });
        await store.setGuildConfig(guild.id, { [weeklyKey]: msg.id });
      }
    } catch (err) {
      log.warn(`weeklyAnnouncement: ${partial.name || partial.id}: ${err.message}`);
    }
  }
  await store.setState(stateKey, today).catch(() => {});
}

export async function postWeeklyHelp(client) {
  if (isLocked()) {
    log.info('weeklyHelp: skipped — notification lock held');
    return;
  }

  // Dynamic import avoids circular-module init race with deploy-commands.js
  const { COMMAND_MODULES } = await import('../core/deploy-commands.js');
  const buf = await renderHelpCard(COMMAND_MODULES);
  const attachment = bufferToAttachment(buf, buildReportFilename('BotCommands'));

  const guilds = await client.guilds.fetch();
  for (const [, partial] of guilds) {
    try {
      const guild = await partial.fetch();
      const { announcement } = await ensureGuildChannels(guild);
      if (announcement) {
        await announcement.send({ files: [attachment] });
      }
    } catch (err) {
      log.warn(`postWeeklyHelp: ${partial.name || partial.id}: ${err.message}`);
    }
  }
}
