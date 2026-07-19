/**
 * Monthly 30M fan goal warning.
 *
 * Runs daily at 8 AM JST. If the day of the month is ≥ 10 (to avoid
 * false alarms early in a cycle), it:
 *   1. Posts a grouped image card to #announcement listing every member
 *      below the 30 000 000 monthly goal, with their gap and progress bar.
 *   2. Sends a personal DM (as Smart Falcon) to each of those members.
 *
 * Members on their join-day grace period are excluded.
 */
import { getCircleSnapshot } from '../../core/uma.js';
import { ensureGuildChannels } from '../../core/channels.js';
import { config } from '../../core/config.js';
import { store } from '../../core/store.js';
import { formatNumber, jstShiftedNow, jstDate } from '../../core/format.js';
import { daysRemainingInMonth } from '../../core/tally.js';
import { dmByViewerId } from '../../utils/dm.js';
import { log } from '../../core/log.js';
import { isLocked } from '../../core/busyLock.js';
import { postUpdate } from '../../utils/updateLog.js';
import { renderMonthlyWarningCard, bufferToAttachment, buildReportFilename } from '../../utils/imageReport.js';
import { sendWrappedCard } from '../../handlers/features/embedWrap.js';
import { resolveQuota } from '../../core/quotaKeys.js';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export async function postMonthlyWarning(client, circleId) {
  if (isLocked()) {
    log.info('monthlyWarning: skipped — notification lock held');
    return;
  }
  // JST-shifted: daily_gains/snapshot gain fields are keyed to the JST
  // calendar day, so day-of-month/month-name math must use JST "today".
  const today = jstShiftedNow();
  const dayOfMonth = today.getUTCDate();

  // Only send warnings once we're at least 10 days into the month.
  if (dayOfMonth < 10) {
    log.debug('monthlyWarning: day < 10 — skipping');
    return;
  }

  // Dedup: only post once per day per circle (same pattern as dailyWarnings/weeklyWarning).
  const dateStr = jstDate();
  const stateKey = `lastMonthlyWarningDate_${circleId}`;
  const lastPosted = await store.getState(stateKey).catch(() => null);
  if (lastPosted === dateStr) {
    log.info(`monthlyWarning(${circleId}): already posted today — skipping`);
    return;
  }

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circleId);
  } catch (err) {
    log.warn('monthlyWarning: failed to fetch circle data:', err.message);
    return;
  }

  if (!snapshot?.members?.length) return;
  if (!snapshot.tallyStarted) {
    log.debug('monthlyWarning: tally not started — skipping');
    return;
  }

  const daysLeft = daysRemainingInMonth(today);
  const monthName = MONTH_NAMES[today.getUTCMonth()];

  // Members eligible: have data, not on join-day grace period.
  const eligible = snapshot.members.filter(m => m.hasData && !m.joinDay);

  // Use config default for DMs (guild-agnostic).
  const globalGoal = config.monthlyRequirement;
  const failing = eligible
    .filter(m => m.monthlyGain < globalGoal)
    .sort((a, b) => a.monthlyGain - b.monthlyGain); // worst first

  if (failing.length === 0) {
    log.info('monthlyWarning: all eligible members are at or above goal — no warnings');
    return;
  }

  log.info(
    `monthlyWarning: ${failing.length} member(s) below goal (day ${dayOfMonth}, ${daysLeft} days left)`
  );

  // ── Post to announcement channel in every guild with per-guild quota ───────
  try {
    const guilds = await client.guilds.fetch();
    for (const [, partial] of guilds) {
      try {
        const guild = await partial.fetch();

        // Resolve this guild's configured monthly goal — unified key with backward-compat fallback.
        const cfg = await store.getGuildConfig(guild.id).catch(() => ({}));
        const guildGoal = resolveQuota(cfg, circleId, 'monthly', config.monthlyRequirement);

        const guildFailing = eligible
          .filter(m => m.monthlyGain < guildGoal)
          .sort((a, b) => a.monthlyGain - b.monthlyGain);

        if (guildFailing.length === 0) continue;

        const rows = guildFailing.map(m => {
          const gap = guildGoal - m.monthlyGain;
          const needed = daysLeft > 0 ? Math.ceil(gap / daysLeft) : gap;
          return {
            name: m.trainerName,
            monthly: formatNumber(m.monthlyGain),
            monthlyRaw: m.monthlyGain,
            gap: formatNumber(gap),
            gapRaw: gap,
            onTrack: needed <= config.dailyRequirement,
          };
        });

        const buf = await renderMonthlyWarningCard({
          circleName: snapshot.circle.name,
          daysLeft,
          monthName,
          date: dateStr,
          rows,
        });
        const attachment = bufferToAttachment(buf, buildReportFilename('MonthlyWarning'));

        const { announcement } = await ensureGuildChannels(guild);
        if (announcement) {
          await sendWrappedCard(announcement, attachment, {
            color: 0xff7043,
            circleName: snapshot.circle.name,
            date: dateStr,
          });
        }
      } catch (err) {
        log.warn(`monthlyWarning(channel): ${err.message}`);
      }
    }
  } catch (err) {
    log.warn('monthlyWarning: guild fetch failed:', err.message);
  }

  // Notify #update channel.
  await postUpdate(
    client,
    '📊',
    `Monthly goal warning — ${failing.length} trainer${failing.length !== 1 ? 's' : ''} below ${formatNumber(globalGoal)}`,
    `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining in ${monthName}`
  ).catch(() => {});

  // ── DM each failing member — image card ───────────────────────────────────
  for (const m of failing) {
    const gap    = globalGoal - m.monthlyGain;
    const needed = daysLeft > 0 ? Math.ceil(gap / daysLeft) : gap;

    try {
      const buf = await renderMonthlyWarningCard({
        circleName: snapshot.circle.name,
        daysLeft,
        monthName,
        date: dateStr,
        rows: [{
          name:       m.trainerName,
          monthly:    formatNumber(m.monthlyGain),
          monthlyRaw: m.monthlyGain,
          gap:        formatNumber(gap),
          gapRaw:     gap,
          onTrack:    needed <= config.dailyRequirement,
        }],
      });
      await dmByViewerId(client, m.trainerId, {
        content: `📊 **Monthly Fan Goal — Progress Update** · ${monthName}\nHello, Trainer-san! Here's your current progress. Keep going! 🏇✨`,
        files:   [bufferToAttachment(buf, buildReportFilename('MonthlyWarning'))],
      });
    } catch (err) {
      log.warn(`monthlyWarning: DM image failed for ${m.trainerName}: ${err.message}`);
    }
  }

  await store.setState(stateKey, dateStr).catch(() => {});
  log.info(`monthlyWarning: done — warned ${failing.length} member(s)`);
}
