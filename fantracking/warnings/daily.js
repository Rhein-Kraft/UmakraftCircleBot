// @ts-check
/**
 * tasks/dailyFanWarning.js
 * ─────────────────────────
 * Posts a warning message to every guild's announcement channel (with member
 * pings) and DMs every linked circle member when the circle's total daily fan
 * gain ends the day below 1,000,000 fans.
 *
 * Behaviour:
 *  • Fires once per JST calendar day per circle — persisted in SQLite so the
 *    dedup survives bot restarts and migrations.
 *  • Picks one of 50 variants at random each day.
 *  • Posts image card to announcement channel, pinging all linked members.
 *  • DMs each linked member the same image card individually.
 *
 * Schedule: 23:45 JST — 15 min after the daily tally (23:30).
 */

import { AttachmentBuilder } from 'discord.js';
import { store } from '../../core/store.js';
import { log } from '../../core/log.js';
import { isLocked } from '../../core/busyLock.js';
import { jstDate } from '../../core/format.js';
import { getConfiguredCircles } from '../../core/config.js';
import { getAnnouncementChannel } from '../../core/channels.js';
import { bufferToAttachment, buildReportFilename } from '../../utils/imageReport.js';
import { renderDailyFanWarning } from '../../utils/reports/dailyFanWarning.js';
import { getCircleSnapshot } from '../../core/uma.js';

const DAILY_FAN_GOAL = 1_000_000;

// ── Shared footer (all 50 variants) ──────────────────────────────────────────

const FOOTER =
  `Remember: your effort matters, your Umamusume matters, and every fan you earn helps the circle grow. ` +
  `If you have time before the next tally, consider running a few more races.\n\n` +
  `Let's regroup, race harder, and show what you're truly capable of.\n\n` +
  `🐴 You'll come back stronger.`;

/** @param {string} middle */
function body(middle) {
  return `Your daily fan gain did not reach the goal of 1,000,000 fans today.\n\n${middle}\n\n${FOOTER}`;
}

// ── 50 variants — 5 tones × 10, each with a matching emoji ───────────────────

/** @type {Array<{ emoji: string, body: string }>} */
const WARNING_VARIANTS = [
  // ── Gentle Reminder (×10) ────────────────────────────────────────────────
  {
    emoji: '🕊️',
    body: body(`You fell short of the 1,000,000 daily fan goal today. Every race tomorrow can help you bounce back stronger.`),
  },
  {
    emoji: '🌸',
    body: body(`You fell short of the 1,000,000 daily fan goal today. Every race tomorrow can help you bounce back stronger.`),
  },
  {
    emoji: '🍃',
    body: body(`You fell short of the 1,000,000 daily fan goal today. Every race tomorrow can help you bounce back stronger.`),
  },
  {
    emoji: '🌿',
    body: body(`You fell short of the 1,000,000 daily fan goal today. Every race tomorrow can help you bounce back stronger.`),
  },
  {
    emoji: '💐',
    body: body(`You fell short of the 1,000,000 daily fan goal today. Every race tomorrow can help you bounce back stronger.`),
  },
  {
    emoji: '🌙',
    body: body(`You fell short of the 1,000,000 daily fan goal today. Every race tomorrow can help you bounce back stronger.`),
  },
  {
    emoji: '📋',
    body: body(`You fell short of the 1,000,000 daily fan goal today. Every race tomorrow can help you bounce back stronger.`),
  },
  {
    emoji: '🌾',
    body: body(`You fell short of the 1,000,000 daily fan goal today. Every race tomorrow can help you bounce back stronger.`),
  },
  {
    emoji: '🎋',
    body: body(`You fell short of the 1,000,000 daily fan goal today. Every race tomorrow can help you bounce back stronger.`),
  },
  {
    emoji: '💭',
    body: body(`You fell short of the 1,000,000 daily fan goal today. Every race tomorrow can help you bounce back stronger.`),
  },

  // ── Disappointed (×10) ───────────────────────────────────────────────────
  {
    emoji: '😔',
    body: body(`You're capable of more. Today's result didn't reflect your true potential. Let's change that tomorrow.`),
  },
  {
    emoji: '💔',
    body: body(`You're capable of more. Today's result didn't reflect your true potential. Let's change that tomorrow.`),
  },
  {
    emoji: '😞',
    body: body(`You're capable of more. Today's result didn't reflect your true potential. Let's change that tomorrow.`),
  },
  {
    emoji: '🌧️',
    body: body(`You're capable of more. Today's result didn't reflect your true potential. Let's change that tomorrow.`),
  },
  {
    emoji: '😢',
    body: body(`You're capable of more. Today's result didn't reflect your true potential. Let's change that tomorrow.`),
  },
  {
    emoji: '🥺',
    body: body(`You're capable of more. Today's result didn't reflect your true potential. Let's change that tomorrow.`),
  },
  {
    emoji: '😓',
    body: body(`You're capable of more. Today's result didn't reflect your true potential. Let's change that tomorrow.`),
  },
  {
    emoji: '💧',
    body: body(`You're capable of more. Today's result didn't reflect your true potential. Let's change that tomorrow.`),
  },
  {
    emoji: '🌫️',
    body: body(`You're capable of more. Today's result didn't reflect your true potential. Let's change that tomorrow.`),
  },
  {
    emoji: '🫂',
    body: body(`You're capable of more. Today's result didn't reflect your true potential. Let's change that tomorrow.`),
  },

  // ── Encouraging (×10) ────────────────────────────────────────────────────
  {
    emoji: '💪',
    body: body(`Don't lose heart. Every champion has off days. Tomorrow is another chance for you to shine.`),
  },
  {
    emoji: '🌟',
    body: body(`Don't lose heart. Every champion has off days. Tomorrow is another chance for you to shine.`),
  },
  {
    emoji: '✨',
    body: body(`Don't lose heart. Every champion has off days. Tomorrow is another chance for you to shine.`),
  },
  {
    emoji: '🦋',
    body: body(`Don't lose heart. Every champion has off days. Tomorrow is another chance for you to shine.`),
  },
  {
    emoji: '🌈',
    body: body(`Don't lose heart. Every champion has off days. Tomorrow is another chance for you to shine.`),
  },
  {
    emoji: '🎯',
    body: body(`Don't lose heart. Every champion has off days. Tomorrow is another chance for you to shine.`),
  },
  {
    emoji: '🌤️',
    body: body(`Don't lose heart. Every champion has off days. Tomorrow is another chance for you to shine.`),
  },
  {
    emoji: '🔆',
    body: body(`Don't lose heart. Every champion has off days. Tomorrow is another chance for you to shine.`),
  },
  {
    emoji: '🎖️',
    body: body(`Don't lose heart. Every champion has off days. Tomorrow is another chance for you to shine.`),
  },
  {
    emoji: '🙌',
    body: body(`Don't lose heart. Every champion has off days. Tomorrow is another chance for you to shine.`),
  },

  // ── Motivating (×10) ─────────────────────────────────────────────────────
  {
    emoji: '⚡',
    body: body(`A few extra races from you can completely change the outcome. Let's make the next tally count.`),
  },
  {
    emoji: '🔥',
    body: body(`A few extra races from you can completely change the outcome. Let's make the next tally count.`),
  },
  {
    emoji: '🚀',
    body: body(`A few extra races from you can completely change the outcome. Let's make the next tally count.`),
  },
  {
    emoji: '💨',
    body: body(`A few extra races from you can completely change the outcome. Let's make the next tally count.`),
  },
  {
    emoji: '⚔️',
    body: body(`A few extra races from you can completely change the outcome. Let's make the next tally count.`),
  },
  {
    emoji: '🏃',
    body: body(`A few extra races from you can completely change the outcome. Let's make the next tally count.`),
  },
  {
    emoji: '💢',
    body: body(`A few extra races from you can completely change the outcome. Let's make the next tally count.`),
  },
  {
    emoji: '🎽',
    body: body(`A few extra races from you can completely change the outcome. Let's make the next tally count.`),
  },
  {
    emoji: '🏅',
    body: body(`A few extra races from you can completely change the outcome. Let's make the next tally count.`),
  },
  {
    emoji: '🎯',
    body: body(`A few extra races from you can completely change the outcome. Let's make the next tally count.`),
  },

  // ── Hopeful (×10) ────────────────────────────────────────────────────────
  {
    emoji: '🌅',
    body: body(`Today's target slipped away, but your determination hasn't. The next milestone starts now.`),
  },
  {
    emoji: '🌻',
    body: body(`Today's target slipped away, but your determination hasn't. The next milestone starts now.`),
  },
  {
    emoji: '🌄',
    body: body(`Today's target slipped away, but your determination hasn't. The next milestone starts now.`),
  },
  {
    emoji: '🌠',
    body: body(`Today's target slipped away, but your determination hasn't. The next milestone starts now.`),
  },
  {
    emoji: '🌱',
    body: body(`Today's target slipped away, but your determination hasn't. The next milestone starts now.`),
  },
  {
    emoji: '🌺',
    body: body(`Today's target slipped away, but your determination hasn't. The next milestone starts now.`),
  },
  {
    emoji: '⭐',
    body: body(`Today's target slipped away, but your determination hasn't. The next milestone starts now.`),
  },
  {
    emoji: '🌝',
    body: body(`Today's target slipped away, but your determination hasn't. The next milestone starts now.`),
  },
  {
    emoji: '🌤️',
    body: body(`Today's target slipped away, but your determination hasn't. The next milestone starts now.`),
  },
  {
    emoji: '🌈',
    body: body(`Today's target slipped away, but your determination hasn't. The next milestone starts now.`),
  },
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Check each trainer's OWN daily fan gain against the 1,000,000 goal
 * individually — this is NOT a circle-wide total. Any trainer who ends the
 * day below the goal gets their own warning: a personalised channel post
 * (naming/pinging just them, if linked) and an individual DM.
 *
 * Fires at most once per trainer per JST calendar day — dedup persisted in
 * SQLite so it survives restarts and migrations.
 *
 * @param {import('discord.js').Client} client
 */
export async function checkDailyFanWarning(client) {
  if (isLocked()) {
    log.info('dailyFanWarning: skipped — notification lock held');
    return;
  }

  const today = jstDate();
  const circles = getConfiguredCircles();

  // trainerId → discordId, built once per run.
  const allLinks = await store.getLinks(); // { discordId: trainerId }
  const trainerToDiscord = new Map();
  for (const [discordId, trainerId] of Object.entries(allLinks)) {
    trainerToDiscord.set(String(trainerId), discordId);
  }

  for (const circle of circles) {
    try {
      // ── Load snapshot (same data /fan_gain uses) ──────────────────────────
      let snapshot;
      try {
        snapshot = await getCircleSnapshot(circle.id);
      } catch (err) {
        log.warn(`dailyFanWarning(${circle.id}): snapshot unavailable: ${err.message}`);
        continue;
      }

      if (!snapshot.tallyStarted) continue;

      // Trainers below goal today — excludes members whose data isn't
      // trustworthy yet (join day / no data), same as the officer-summary logic.
      const belowGoal = snapshot.members.filter(
        m => m.hasData && !m.joinDay && (m.todayGain || 0) < DAILY_FAN_GOAL
      );
      if (belowGoal.length === 0) continue;

      // Resolve each guild's announcement channel ONCE per circle per run,
      // then reuse it for every trainer below — avoids re-fetching guilds
      // and channels inside the per-trainer loop.
      let announcementChannels = [];
      try {
        const guilds = await client.guilds.fetch();
        announcementChannels = (
          await Promise.all(
            [...guilds.values()].map(async partial => {
              let guild;
              try { guild = await partial.fetch(); } catch { return null; }
              const ch = await getAnnouncementChannel(guild).catch(() => null);
              return ch ? { guild, ch } : null;
            })
          )
        ).filter(Boolean);
      } catch (err) {
        log.warn(`dailyFanWarning(${circle.id}): guild fetch error: ${err.message}`);
      }

      for (const member of belowGoal) {
        const trainerId = String(member.trainerId);

        // ── Dedup: fire at most once per trainer per JST day ────────────────
        const stateKey = `dailyFanWarning:${circle.id}:${trainerId}:${today}`;
        const alreadyFired = await store.getState(stateKey).catch(() => null);
        if (alreadyFired) continue;

        const gain = member.todayGain || 0;
        const discordId = trainerToDiscord.get(trainerId) ?? null;
        // Escape mention-like syntax in raw trainer names so an unlinked
        // trainer's display name can never trigger @everyone/@here/role pings.
        const safeName = String(member.trainerName || trainerId).replace(/@/g, '@\u200b');
        const pingOrName = discordId ? `<@${discordId}>` : safeName;

        // ── Pick a random variant ───────────────────────────────────────────
        const variant = WARNING_VARIANTS[Math.floor(Math.random() * WARNING_VARIANTS.length)];

        // ── Render image card (personalised — always has trainerName) ───────
        let buf;
        try {
          buf = await renderDailyFanWarning({
            emoji: variant.emoji,
            body: variant.body,
            date: today,
            circleName: circle.name ?? circle.id,
            circleDailyGain: gain,
            goalFans: DAILY_FAN_GOAL,
            trainerName: member.trainerName,
          });
        } catch (renderErr) {
          log.warn(`dailyFanWarning(${circle.id}): render failed for ${safeName}: ${renderErr.message}`);
          continue; // don't mark as fired — try again next run
        }

        let channelSent = false;
        let dmSent = false;

        // ── Post to every guild's announcement channel, naming/pinging just this trainer ──
        for (const { guild, ch } of announcementChannels) {
          try {
            const attachment = bufferToAttachment(buf, buildReportFilename('FanWarning', member.trainerName, today));
            await ch.send({
              content: `${pingOrName} didn't reach today's 1,000,000 fan goal.`,
              files: [attachment],
              // Only ever ping the specific trainer (if linked) — never let a
              // raw display name accidentally trigger @everyone/@here/roles.
              allowedMentions: { users: discordId ? [discordId] : [] },
            });
            channelSent = true;
            log.info(`dailyFanWarning(${circle.id}): ${safeName} → #${ch.name} in ${guild.name}`);
          } catch (sendErr) {
            log.warn(`dailyFanWarning(${circle.id}): channel send failed in ${guild.name}: ${sendErr.message}`);
          }
        }

        // ── DM the trainer individually, if linked (with one retry) ─────────
        if (discordId) {
          const trySend = async () => {
            const user = await client.users.fetch(discordId);
            const dmAttachment = new AttachmentBuilder(buf, {
              name: `fan-warning-${trainerId}-${today}.png`,
            });
            await user.send({ files: [dmAttachment] });
          };
          try {
            await trySend();
            dmSent = true;
          } catch {
            await new Promise(r => setTimeout(r, 5_000));
            try {
              await trySend();
              dmSent = true;
            } catch {
              log.debug(`dailyFanWarning: DM to ${discordId} (${safeName}) failed after retry — likely DM-disabled`);
            }
          }
        }

        // ── Persist dedup only after at least one successful delivery ────────
        if (channelSent || dmSent) {
          await store.setState(stateKey, today).catch(() => {});
          log.info(
            `dailyFanWarning(${circle.id}): ${safeName} — fired — gain=${gain.toLocaleString()} channel=${channelSent} dm=${dmSent}`
          );
        } else {
          log.warn(`dailyFanWarning(${circle.id}): ${safeName} — no delivery succeeded — will retry next run`);
        }
      }
    } catch (err) {
      log.warn(`dailyFanWarning: error processing circle ${circle.id}: ${err.message}`);
    }
  }
}
