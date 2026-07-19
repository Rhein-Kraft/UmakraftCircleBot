import { getCircleSnapshot } from '../../core/uma.js';
import { getAnnouncementChannel } from '../../core/channels.js';
import { formatNumber } from '../../core/format.js';
import { getConfiguredCircles } from '../../core/config.js';
import { store } from '../../core/store.js';
import { log } from '../../core/log.js';
import { isLocked } from '../../core/busyLock.js';
import { renderInterCircleLeaderboard, bufferToAttachment, buildReportFilename } from '../../utils/imageReport.js';

function pickValue(member, scope) {
  if (scope === 'daily') return member.yesterdayGain ?? 0;
  if (scope === 'weekly') return member.weeklyGain ?? 0;
  return member.monthlyGain ?? 0;
}

async function fetchMergedMembers(_scope) {
  const circles = getConfiguredCircles();

  const snapshots = await Promise.all(circles.map(c => getCircleSnapshot(c.id)));

  return {
    members: snapshots.flatMap((snap, i) =>
      snap.members
        .filter(m => m.hasData && !m.joinDay)
        .map(m => ({ ...m, circleName: circles[i].name }))
    ),
    totalMembers: snapshots.reduce((s, snap) => s + snap.members.length, 0),
    circleCount: circles.length,
  };
}

async function postInterCircle(client, { scope, scopeLabel, stateKey, filename, minGain }) {
  if (isLocked()) {
    log.info('interCircleLeaderboard: skipped — notification lock held');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const lastPosted = await store.getState(stateKey).catch(() => null);
  if (lastPosted === today) {
    log.info(`interCircle(${scope}): already posted today — skipping`);
    return;
  }

  let result;
  try {
    result = await fetchMergedMembers(scope);
  } catch (err) {
    log.warn(`interCircleAnnouncements(${scope}):`, err.message);
    return;
  }

  const { members: allMembers, totalMembers, circleCount } = result;

  const sorted = [...allMembers]
    .filter(m => pickValue(m, scope) >= minGain)
    .sort((a, b) => pickValue(b, scope) - pickValue(a, scope))
    .slice(0, 10);

  if (sorted.length === 0) {
    log.info(`interCircle(${scope}): no qualifying members — skipping`);
    return;
  }

  const dateLabel = scope === 'weekly' ? `Week ending ${today}` : today;

  const rows = sorted.map(m => ({
    name: m.trainerName,
    circleName: m.circleName,
    gainRaw: pickValue(m, scope),
    gainStr: formatNumber(pickValue(m, scope)),
  }));

  const buf = await renderInterCircleLeaderboard({
    scope: scopeLabel,
    date: dateLabel,
    totalMembers,
    circleCount,
    rows,
  });

  const guilds = await client.guilds.fetch();
  for (const [, partial] of guilds) {
    try {
      const guild = await partial.fetch();
      const channel = await getAnnouncementChannel(guild);
      if (!channel) continue;

      const guildConfig = await store.getGuildConfig(guild.id);
      const prevMsgId = guildConfig[`icLbMsg_${scope}`];
      if (prevMsgId) {
        try {
          const prev = await channel.messages.fetch(prevMsgId);
          await prev.delete();
        } catch {
          /* already gone */
        }
      }

      const msg = await channel.send({ files: [bufferToAttachment(buf, filename)] });
      await store.setGuildConfig(guild.id, { [`icLbMsg_${scope}`]: msg.id });
    } catch (err) {
      log.warn(`interCircleAnnouncements(${scope}): ${partial.name ?? partial.id}: ${err.message}`);
    }
  }

  await store.setState(stateKey, today).catch(() => {});
  log.info(`interCircleAnnouncements: posted ${scope} inter-circle leaderboard (${sorted.length} members)`);
}

export function postInterCircleDaily(client) {
  return postInterCircle(client, {
    scope: 'daily',
    scopeLabel: 'Daily',
    stateKey: 'lastICLbDaily',
    filename: buildReportFilename('InterCircleLeaderboardDaily'),
    minGain: 1_000_000,
  });
}

export function postInterCircleWeekly(client) {
  return postInterCircle(client, {
    scope: 'weekly',
    scopeLabel: 'Weekly',
    stateKey: 'lastICLbWeekly',
    filename: buildReportFilename('InterCircleLeaderboardWeekly'),
    minGain: 1_000_000,
  });
}

export function postInterCircleMonthly(client) {
  return postInterCircle(client, {
    scope: 'monthly',
    scopeLabel: 'Monthly',
    stateKey: 'lastICLbMonthly',
    filename: buildReportFilename('InterCircleLeaderboardMonthly'),
    minGain: 0,
  });
}
