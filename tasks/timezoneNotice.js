// @ts-check
/**
 * tasks/timezoneNotice.js
 * ────────────────────────
 * Sends a weekly DM to every linked Discord member (every Monday) reminding
 * them they can personalise their greeting timezone with /set_timezone.
 *
 * Dedup: keyed per user per ISO week in SQLite (`timezoneNotice:<YYYY-WW>:<discordId>`).
 * Each member receives at most one notice per calendar week — survives bot
 * restarts and migrations within the same week.
 */

import { store } from '../core/store.js';
import { log }   from '../core/log.js';

const NOTICE =
  `👋 Hey Trainer-san!\n\n` +
  `The bot will send you daily greetings (morning, noon, night and midnight) ` +
  `based on your local timezone.\n\n` +
  `If you think the timezone is not correct, you can set it using the ` +
  `**/set_timezone** command.\n\n` +
  `— UmaKraft Circle Bot 🐴`;

/**
 * ISO week key — 'YYYY-WW' — used to deduplicate within the same calendar week.
 * @returns {string}
 */
function isoWeekKey() {
  const now       = new Date();
  const thursday  = new Date(now);
  thursday.setUTCDate(now.getUTCDate() + (4 - (now.getUTCDay() || 7)));
  const year      = thursday.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const week      = Math.ceil(((thursday - startOfYear) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Send the weekly timezone notice DM to every linked member who has not yet
 * received it this week.  Safe to call multiple times in the same week —
 * already-notified users are skipped via the per-week SQLite dedup key.
 *
 * Scheduled every Monday so members are reminded at the start of each week.
 *
 * @param {import('discord.js').Client} client
 */
export async function sendTimezoneNotice(client) {
  let links;
  try {
    links = await store.getLinks();
  } catch (err) {
    log.warn('timezoneNotice: could not load links —', err.message);
    return;
  }

  const discordIds = Object.keys(links);
  if (!discordIds.length) return;

  const week = isoWeekKey();
  let sent = 0;
  let skipped = 0;

  for (const discordId of discordIds) {
    try {
      const dedupKey    = `timezoneNotice:${week}:${discordId}`;
      const alreadySent = await store.getState(dedupKey).catch(() => null);
      if (alreadySent) { skipped++; continue; }

      const user = await client.users.fetch(discordId);
      await user.send(NOTICE);

      await store.setState(dedupKey, new Date().toISOString()).catch(() => {});
      sent++;
      log.info(`timezoneNotice: sent to ${discordId} (week ${week})`);
    } catch (err) {
      // DMs disabled, user left server, etc. — non-fatal, retried next Monday.
      log.debug(`timezoneNotice: could not DM ${discordId}: ${err.message}`);
    }
  }

  log.info(`timezoneNotice: done — week=${week} sent=${sent} skipped=${skipped}`);
}
