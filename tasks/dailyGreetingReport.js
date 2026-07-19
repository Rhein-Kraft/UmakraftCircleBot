/**
 * tasks/dailyGreetingReport.js
 * ─────────────────────────────
 * Two distinct greeting flows:
 *
 *  1. postDailyGreetingReport(client)
 *     Posts a greeting image to every guild's announcement channel at 7:00 AM in
 *     config.timezone (server-wide broadcast). Dedup keyed by JST date — survives
 *     bot restarts and migrations.
 *
 *  2. sendPerUserGreetings(client)
 *     Runs every hour. DMs each linked member at 07:00 in THEIR configured timezone
 *     (set via /set_timezone or auto-detected from Discord locale). Dedup is per-user
 *     per-local-date — also persisted in SQLite, survives restarts and migrations.
 */

import { getAnnouncementChannel } from '../core/channels.js';
import { store } from '../core/store.js';
import { config } from '../core/config.js';
import { jstDate } from '../core/format.js';
import { log } from '../core/log.js';
import { isLocked } from '../core/busyLock.js';
import { renderDailyGreeting, renderGreetingDm } from '../utils/reports/greeting.js';
import { bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';

const STATE_KEY = 'lastDailyGreetingDate';

/**
 * Post the daily greeting image to all guilds' announcement channels.
 * Skips if already posted today (persisted dedup — survives restarts).
 *
 * @param {import('discord.js').Client} client
 */
export async function postDailyGreetingReport(client) {
  if (isLocked()) {
    log.info('dailyGreetingReport: skipped — notification lock held');
    return;
  }

  // Persistent dedup — keyed by JST calendar date
  const today    = jstDate();
  const lastDate = await store.getState(STATE_KEY).catch(() => null);
  if (lastDate === today) {
    log.info('dailyGreetingReport: already posted today — skipping');
    return;
  }

  // Count linked members for the card subtitle
  let memberCount = 0;
  try {
    const links = await store.getLinks();
    memberCount = Object.keys(links).length;
  } catch {
    // non-fatal — card still renders without the count
  }

  let buf;
  try {
    buf = await renderDailyGreeting({ date: today, memberCount });
  } catch (err) {
    log.warn(`dailyGreetingReport: render failed: ${err.message}`);
    return;
  }

  const attachment = bufferToAttachment(buf, buildReportFilename('Greeting', null, today));

  let posted = 0;
  try {
    const guilds = await client.guilds.fetch();
    for (const [, partial] of guilds) {
      let guild;
      try { guild = await partial.fetch(); } catch { continue; }

      const ch = await getAnnouncementChannel(guild).catch(() => null);
      if (!ch) continue;

      try {
        await ch.send({ files: [attachment] });
        log.info(`dailyGreetingReport: posted to ${guild.name} #${ch.name}`);
        posted++;
      } catch (err) {
        log.warn(`dailyGreetingReport: failed in ${guild.name}: ${err.message}`);
      }
    }
  } catch (err) {
    log.warn(`dailyGreetingReport: guild fetch failed: ${err.message}`);
  }

  // Persist the date only after at least one successful post
  if (posted > 0) {
    await store.setState(STATE_KEY, today).catch(() => {});
  }
  log.info(`dailyGreetingReport: done — posted to ${posted} guild(s)`);
}

// ── Greeting stage schedule ───────────────────────────────────────────────────
// Each entry maps a local hour (0–23) in the user's timezone to a greeting type.
// renderGreetingDm supports: 'morning' | 'noon' | 'night' | 'midnight'
const GREETING_STAGES = [
  { hour: 8,  type: 'morning'  },
  { hour: 12, type: 'noon'     },
  { hour: 20, type: 'night'    },
  { hour: 0,  type: 'midnight' },
];

/**
 * Per-user greeting DMs — runs every hour.
 *
 * For each linked Discord member and each of the 4 greeting stages, checks whether
 * it is currently the target hour in their configured timezone (set via /set_timezone
 * or auto-detected from Discord locale). If so, DMs them the appropriate greeting card.
 *
 * Dedup key: `dailyGreeting:dm:<discordId>:<type>:<localDate>` (SQLite — survives
 * restarts and migrations). One key per stage per user per local calendar day.
 * Falls back to config.timezone when the user has no timezone set.
 *
 * @param {import('discord.js').Client} client
 */
export async function sendPerUserGreetings(client) {
  if (isLocked()) return;

  let links;
  try {
    links = await store.getLinks();
  } catch {
    return;
  }

  const discordIds = Object.keys(links);
  if (!discordIds.length) return;

  for (const discordId of discordIds) {
    try {
      // Resolve the user's timezone — fall back to the bot's configured timezone.
      const tz = await store.getTimezone(discordId).catch(() => null) ?? config.timezone;

      // Current hour in the user's local timezone (0–23).
      // toLocaleTimeString with hour12:false + 2-digit gives "00"–"23".
      const localHour = parseInt(
        new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', hour12: false }),
        10
      );

      // Find a matching stage for this hour (at most one per tick).
      const stage = GREETING_STAGES.find(s => s.hour === localHour);
      if (!stage) continue;

      // Local calendar date for dedup — computed in the user's timezone.
      const localDate = new Date().toLocaleDateString('en-CA', { timeZone: tz });
      const dedupKey  = `dailyGreeting:dm:${discordId}:${stage.type}:${localDate}`;

      const alreadySent = await store.getState(dedupKey).catch(() => null);
      if (alreadySent) continue;

      // Render the stage-appropriate card and DM the user.
      const buf        = await renderGreetingDm({ type: stage.type, date: localDate });
      const attachment = bufferToAttachment(buf, buildReportFilename(`Greeting${stage.type}`, null, localDate));

      const user = await client.users.fetch(discordId);
      await user.send({ files: [attachment] });

      await store.setState(dedupKey, localDate).catch(() => {});
      log.info(`dailyGreetingReport: ${stage.type} DM sent to ${discordId} (${tz})`);
    } catch (err) {
      // DMs disabled, user left, etc. — non-fatal.
      log.debug(`dailyGreetingReport: could not DM ${discordId}: ${err.message}`);
    }
  }
}
