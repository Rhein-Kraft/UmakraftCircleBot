import { getCircleSnapshot } from '../../core/uma.js';
import { getLeaderboardChannel } from '../../core/channels.js';
import { formatNumber, jstDate } from '../../core/format.js';
import { config } from '../../core/config.js';
import { resolveQuota } from '../../core/quotaKeys.js';
import { store } from '../../core/store.js';
import { dmByViewerId } from '../../utils/dm.js';
import { log } from '../../core/log.js';
import { isLocked } from '../../core/busyLock.js';
import { postUpdate } from '../../utils/updateLog.js';
import { renderLeaderboard, bufferToAttachment, buildReportFilename } from '../../utils/imageReport.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const MAX_ROWS = 10;

// ── DM templates ─────────────────────────────────────────────────────────────

function dailyDmMsg(trainerName, rank) {
  return (
    `🏆 **Daily Leaderboard Message**\n\n` +
    `Congratulations, Trainer-san!\n\nI'm Smart Falcon 🏇✨\n\n` +
    `You've placed **${MEDALS[rank - 1]} #${rank}** on today's leaderboard! Your hard work really paid off today — let's keep this momentum going!\n\n— Smart Falcon`
  );
}

function weeklyDmMsg(trainerName, rank) {
  return (
    `📊 **Weekly Leaderboard Message**\n\n` +
    `Amazing work this week, Trainer-san!\n\nI'm Smart Falcon 🏇✨\n\n` +
    `You've secured **${MEDALS[rank - 1]} #${rank}** on the weekly leaderboard! Your consistency and dedication are really showing. Thank you for your continued support!\n\n— Smart Falcon`
  );
}

function monthlyDmMsg(trainerName, rank) {
  return (
    `🌟 **Monthly Leaderboard Message**\n\n` +
    `Outstanding performance, Trainer-san!\n\nI'm Smart Falcon 🏇✨\n\n` +
    `You're **${MEDALS[rank - 1]} #${rank}** on the monthly leaderboard! That's a huge achievement and proof of your long-term dedication.\n\n— Smart Falcon`
  );
}

// ── Row builder ───────────────────────────────────────────────────────────────

function buildRows(sorted, gainFn, quota, _tallyStarted) {
  return sorted.slice(0, MAX_ROWS).map((m, i) => {
    const gainRaw = gainFn(m);
    const gapRaw = gainRaw - quota;
    const pct = quota > 0 ? Math.min(200, Math.round((gainRaw / quota) * 100)) : 0;
    return {
      rank: i + 1,
      name: m.trainerName,
      gainRaw,
      gainStr: formatNumber(gainRaw),
      gapRaw,
      gapStr: (gapRaw >= 0 ? '+' : '') + formatNumber(Math.abs(gapRaw)),
      pct,
    };
  });
}

// ── Post or replace leaderboard image in #leaderboard ────────────────────────
// bufferFactory(guildConfig) is called per-guild so each guild gets an image
// rendered with its own stored quota setting.

async function sendToLeaderboardChannel(client, bufferFactory, filename, msgStoreKey) {
  const guilds = await client.guilds.fetch();
  for (const [, partial] of guilds) {
    try {
      const guild = await partial.fetch();
      const channel = await getLeaderboardChannel(guild);
      if (!channel) continue;

      const guildConfig = await store.getGuildConfig(guild.id);
      const prevMsgId = guildConfig[msgStoreKey];
      if (prevMsgId) {
        try {
          const prev = await channel.messages.fetch(prevMsgId);
          await prev.delete();
        } catch {
          /* already gone */
        }
      }

      const imageBuffer = await bufferFactory(guildConfig);
      const msg = await channel.send({ files: [bufferToAttachment(imageBuffer, filename)] });
      await store.setGuildConfig(guild.id, { [msgStoreKey]: msg.id });
    } catch (err) {
      log.warn(`leaderboardAnnouncements: ${partial.name ?? partial.id}: ${err.message}`);
    }
  }
}

// ── DM top-3 ─────────────────────────────────────────────────────────────────

async function dmTop3(client, top3, dmFn) {
  for (let i = 0; i < Math.min(top3.length, 3); i++) {
    const m = top3[i];
    await dmByViewerId(client, m.trainerId, dmFn(m.trainerName, i + 1));
  }
}

// ── Daily ─────────────────────────────────────────────────────────────────────

export async function postDailyTop3(client, circleId) {
  if (isLocked()) {
    log.info('leaderboard: skipped — notification lock held');
    return;
  }

  const today = jstDate();
  const stateKey = `lastDailyLbDate_${circleId}`;
  const lastPosted = await store.getState(stateKey).catch(() => null);
  if (lastPosted === today) {
    log.info(`leaderboard(daily,${circleId}): already posted today — skipping`);
    return;
  }

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn('leaderboardAnnouncements(daily):', err.message);
    return;
  }

  const tallyStarted = snapshot.members.some(m => m.hasData);
  const eligible = snapshot.members.filter(m => m.hasData && !m.joinDay);
  const sorted = [...eligible]
    .filter(m => m.yesterdayGain >= 1_000_000)
    .sort((a, b) => b.yesterdayGain - a.yesterdayGain);
  if (sorted.length === 0) return;

  await sendToLeaderboardChannel(
    client,
    async (cfg) => {
      const quota = resolveQuota(cfg, circleId, 'daily', config.dailyRequirement);
      return renderLeaderboard({
        circleName: snapshot.circle.name,
        scope: 'Daily',
        date: today,
        totalMembers: snapshot.members.length,
        quotaLabel: formatNumber(quota),
        rows: buildRows(sorted, m => m.yesterdayGain, quota, tallyStarted),
      });
    },
    buildReportFilename('LeaderboardDaily'),
    `lbMsgDaily_${circleId}`
  );
  await dmTop3(client, sorted, dailyDmMsg);
  await store.setState(stateKey, today).catch(() => {});
  await postUpdate(
    client,
    '🏆',
    'Daily leaderboard posted',
    `Top ${Math.min(sorted.length, MAX_ROWS)} trainers · ${today}`
  ).catch(() => {});
  log.info(`leaderboardAnnouncements: posted daily leaderboard (${circleId})`);
}

// ── Weekly ────────────────────────────────────────────────────────────────────

export async function postWeeklyTop3(client, circleId) {
  if (isLocked()) {
    log.info('leaderboard: skipped — notification lock held');
    return;
  }

  const today = jstDate();
  const stateKey = `lastWeeklyLbDate_${circleId}`;
  const lastPosted = await store.getState(stateKey).catch(() => null);
  if (lastPosted === today) {
    log.info(`leaderboard(weekly,${circleId}): already posted today — skipping`);
    return;
  }

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn('leaderboardAnnouncements(weekly):', err.message);
    return;
  }

  const tallyStarted = snapshot.members.some(m => m.hasData);
  const eligible = snapshot.members.filter(m => m.hasData && !m.joinDay);
  const sorted = [...eligible]
    .filter(m => m.weeklyGain >= 1_000_000)
    .sort((a, b) => b.weeklyGain - a.weeklyGain);
  if (sorted.length === 0) return;

  await sendToLeaderboardChannel(
    client,
    async (cfg) => {
      const quota = resolveQuota(cfg, circleId, 'weekly', config.weeklyRequirement);
      return renderLeaderboard({
        circleName: snapshot.circle.name,
        scope: 'Weekly',
        date: `Week ending ${today}`,
        totalMembers: snapshot.members.length,
        quotaLabel: formatNumber(quota),
        rows: buildRows(sorted, m => m.weeklyGain, quota, tallyStarted),
      });
    },
    buildReportFilename('LeaderboardWeekly'),
    `lbMsgWeekly_${circleId}`
  );
  await dmTop3(client, sorted, weeklyDmMsg);
  await store.setState(stateKey, today).catch(() => {});
  await postUpdate(
    client,
    '📊',
    'Weekly leaderboard posted',
    `Top ${Math.min(sorted.length, MAX_ROWS)} trainers · week ending ${today}`
  ).catch(() => {});
  log.info(`leaderboardAnnouncements: posted weekly leaderboard (${circleId})`);
}

// ── Monthly ───────────────────────────────────────────────────────────────────

export async function postMonthlyTop3(client, circleId) {
  if (isLocked()) {
    log.info('leaderboard: skipped — notification lock held');
    return;
  }

  const today = jstDate();
  const stateKey = `lastMonthlyLbDate_${circleId}`;
  const lastPosted = await store.getState(stateKey).catch(() => null);
  if (lastPosted === today) {
    log.info(`leaderboard(monthly,${circleId}): already posted today — skipping`);
    return;
  }

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn('leaderboardAnnouncements(monthly):', err.message);
    return;
  }

  const tallyStarted = snapshot.members.some(m => m.hasData);
  const eligible = snapshot.members.filter(m => m.hasData && !m.joinDay);
  const sorted = [...eligible].sort((a, b) => b.monthlyGain - a.monthlyGain);
  if (sorted.length === 0) return;

  await sendToLeaderboardChannel(
    client,
    async (cfg) => {
      const quota = resolveQuota(cfg, circleId, 'monthly', config.monthlyRequirement);
      return renderLeaderboard({
        circleName: snapshot.circle.name,
        scope: 'Monthly',
        date: today,
        totalMembers: snapshot.members.length,
        quotaLabel: formatNumber(quota),
        rows: buildRows(sorted, m => m.monthlyGain, quota, tallyStarted),
      });
    },
    buildReportFilename('LeaderboardMonthly'),
    `lbMsgMonthly_${circleId}`
  );
  await dmTop3(client, sorted, monthlyDmMsg);
  await store.setState(stateKey, today).catch(() => {});
  await postUpdate(
    client,
    '🌟',
    'Monthly leaderboard posted',
    `${sorted.length} trainers ranked · ${today}`
  ).catch(() => {});
  log.info(`leaderboardAnnouncements: posted monthly leaderboard (${circleId})`);
}
