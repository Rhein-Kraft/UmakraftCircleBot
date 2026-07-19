/**
 * tasks/weeklyWarning.js
 * ──────────────────────
 * Weekly 7.5M fan goal warning.
 *
 * Runs daily at 8:15 AM JST. Skips on Monday (week just started).
 * For each circle, posts a grouped image card to #announcement listing
 * every member below the 7,500,000 weekly goal, with their gap, days
 * left in the week, and required daily pace. Also DMs each failing member.
 *
 * Week resets on Monday (Mon = day 1, Sun = day 7).
 * State-keyed per date + circle to prevent double-posting on restart.
 */

import { getCircleSnapshot } from '../../core/uma.js';
import { ensureGuildChannels } from '../../core/channels.js';
import { config } from '../../core/config.js';
import { store } from '../../core/store.js';
import { formatNumber } from '../../core/format.js';
import { dmByViewerId, dmLeader } from '../../utils/dm.js';
import { log } from '../../core/log.js';
import { isLocked } from '../../core/busyLock.js';
import { postUpdate } from '../../utils/updateLog.js';
import { renderMonthlyWarningCard, bufferToAttachment, buildReportFilename } from '../../utils/imageReport.js';
import { sendWrappedCard } from '../../handlers/features/embedWrap.js';
import { resolveQuota } from '../../core/quotaKeys.js';

/**
 * Days remaining in the current week including today (week starts Monday).
 * Monday → 7, Tuesday → 6, … Saturday → 2, Sunday → 1.
 * @param {Date} [date]
 * @returns {number}
 */
function daysRemainingInWeek(date = new Date()) {
  const dow = date.getDay(); // 0=Sun, 1=Mon, … 6=Sat
  return dow === 0 ? 1 : 8 - dow;
}

/**
 * Short label for the current week, e.g. "May 26 – Jun 1".
 * @param {Date} [date]
 * @returns {string}
 */
function weekLabel(date = new Date()) {
  const dow = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = d =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export async function postWeeklyWarning(client, circleId) {
  if (isLocked()) {
    log.info('weeklyWarning: skipped — notification lock held');
    return;
  }

  const today = new Date();
  const dow = today.getDay(); // 0=Sun … 6=Sat

  // Skip Monday — week just started, no meaningful data yet.
  if (dow === 1) {
    log.debug('weeklyWarning: Monday — skipping (week just reset)');
    return;
  }

  // Deduplicate: only post once per calendar date per circle.
  const dateStr = today.toISOString().slice(0, 10);
  const stateKey = `lastWeeklyWarningDate_${circleId}`;
  const lastPosted = await store.getState(stateKey).catch(() => null);
  if (lastPosted === dateStr) {
    log.info(`weeklyWarning(${circleId}): already posted today — skipping`);
    return;
  }

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn('weeklyWarning: failed to fetch circle data:', err.message);
    return;
  }

  if (!snapshot?.members?.length) return;
  if (!snapshot.tallyStarted) {
    log.debug('weeklyWarning: tally not started — skipping');
    return;
  }

  const daysLeft = daysRemainingInWeek(today);
  const label = weekLabel(today);
  const weeklyGoal = config.weeklyRequirement;

  // Members eligible: have data, not on join-day grace period.
  const eligible = snapshot.members.filter(m => m.hasData && !m.joinDay);

  const failing = eligible
    .filter(m => (m.weeklyGain ?? 0) < weeklyGoal)
    .sort((a, b) => (a.weeklyGain ?? 0) - (b.weeklyGain ?? 0)); // worst first

  if (failing.length === 0) {
    log.info(`weeklyWarning(${circleId}): all members on track — no warnings`);
    await store.setState(stateKey, dateStr).catch(() => {});
    return;
  }

  log.info(
    `weeklyWarning(${circleId}): ${failing.length} member(s) below weekly goal (${daysLeft} days left)`
  );

  // ── Post image card to announcement channel in every guild ────────────────
  try {
    const guilds = await client.guilds.fetch();
    for (const [, partial] of guilds) {
      try {
        const guild = await partial.fetch();

        // Per-guild weekly goal — uses unified quota key with backward-compat fallback.
        const cfg = await store.getGuildConfig(guild.id).catch(() => ({}));
        const guildGoal = resolveQuota(cfg, circleId, 'weekly', weeklyGoal);

        const guildFailing = eligible
          .filter(m => (m.weeklyGain ?? 0) < guildGoal)
          .sort((a, b) => (a.weeklyGain ?? 0) - (b.weeklyGain ?? 0));

        if (guildFailing.length === 0) continue;

        const rows = guildFailing.map(m => {
          const gain = m.weeklyGain ?? 0;
          const gap = guildGoal - gain;
          const needed = daysLeft > 0 ? Math.ceil(gap / daysLeft) : gap;
          return {
            name: m.trainerName,
            monthly: formatNumber(gain),
            monthlyRaw: gain,
            gap: formatNumber(gap),
            gapRaw: gap,
            onTrack: needed <= config.dailyRequirement,
          };
        });

        const buf = await renderMonthlyWarningCard({
          circleName: snapshot.circle.name,
          daysLeft,
          monthName: `Week of ${label}`,
          date: dateStr,
          rows,
        });
        const attachment = bufferToAttachment(buf, buildReportFilename('WeeklyWarning'));

        const { announcement } = await ensureGuildChannels(guild);
        if (announcement) {
          await sendWrappedCard(announcement, attachment, {
            color: 0xffd54f,
            circleName: snapshot.circle.name,
            date: dateStr,
          });
        }
      } catch (err) {
        log.warn(`weeklyWarning(channel): ${err.message}`);
      }
    }
  } catch (err) {
    log.warn('weeklyWarning: guild fetch failed:', err.message);
  }

  // Notify #update channel.
  await postUpdate(
    client,
    '📅',
    `Weekly goal warning — ${failing.length} trainer${failing.length !== 1 ? 's' : ''} below ${formatNumber(weeklyGoal)}`,
    `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining this week (${label})`
  ).catch(() => {});

  // ── DM each failing member ─────────────────────────────────────────────────
  for (const m of failing) {
    const gain = m.weeklyGain ?? 0;
    const gap = weeklyGoal - gain;
    const needed = daysLeft > 0 ? Math.ceil(gap / daysLeft) : gap;

    const dmText =
      `📅 **Weekly Fan Goal — Progress Update**\n\n` +
      `Hello, Trainer-san! I'm Smart Falcon 🏇\n\n` +
      `I wanted to check in on your weekly progress!\n\n` +
      `Your current weekly fan total is **${formatNumber(gain)}**, but the weekly circle goal is **${formatNumber(weeklyGoal)} fans**.\n\n` +
      `You still need **${formatNumber(gap)} more fans** to reach the goal, and there are **${daysLeft} day${daysLeft !== 1 ? 's' : ''}** remaining this week.\n\n` +
      (daysLeft > 0
        ? `To reach the goal in time, you'll need to gain around **${formatNumber(needed)} fans per day** for the rest of the week.\n\n`
        : '') +
      `Every day counts — keep pushing forward and I'll be cheering for you all the way! 🏇✨\n\n` +
      `— Smart Falcon`;

    await dmByViewerId(client, m.trainerId, dmText);
  }

  // ── DM the leader — full weekly summary ───────────────────────────────────
  if (eligible.length > 0) {
    const sorted = [...eligible].sort((a, b) => (b.weeklyGain ?? 0) - (a.weeklyGain ?? 0));

    const reportLines = sorted.map((m, i) => {
      const gain = m.weeklyGain ?? 0;
      const onTrack = gain >= weeklyGoal;
      const icon = onTrack ? '✅' : '❌';
      return (
        `${icon} **#${i + 1} ${m.trainerName}**\n` +
        `   Weekly: **${formatNumber(gain)}**  ·  Gap: ${onTrack ? '—' : formatNumber(weeklyGoal - gain)}`
      );
    });

    const header =
      `📅 **Weekly Fan Gain Report — ${dateStr}**\n` +
      `${snapshot.circle.name} · Week of ${label} · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left\n\n`;

    const chunks = [];
    let current = header;
    for (const line of reportLines) {
      const next = current + line + '\n';
      if (next.length > 1900) {
        chunks.push(current);
        current = line + '\n';
      } else {
        current = next;
      }
    }
    if (current.trim()) chunks.push(current);

    for (const chunk of chunks) {
      await dmLeader(client, snapshot, chunk);
    }
  }

  await store.setState(stateKey, dateStr).catch(() => {});
  log.info(`weeklyWarning(${circleId}): done — warned ${failing.length} member(s)`);
}
