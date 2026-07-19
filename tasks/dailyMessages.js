/**
 * dailyMessages.js
 * ─────────────────
 * Sends timed greeting DMs to every linked member based on THEIR local timezone.
 * Called every hour by the scheduler. Each greeting type fires at most once per
 * calendar day per member (dedup guards), preventing duplicate DMs.
 *
 * Greeting schedule (local time):
 *   12:00 → noon greeting
 *   21:00 → night greeting
 *   00:00 → midnight greeting
 *   Morning → handled separately via presenceUpdate (first online of the day)
 */

import { AttachmentBuilder } from 'discord.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';
import { isLocked } from '../core/busyLock.js';
import { renderGreetingDm } from '../utils/reports/greeting.js';

const DEFAULT_TZ = 'Asia/Tokyo';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get the local hour (0–23) for a given IANA timezone.
 * Handles the edge case where some environments return "24" for midnight.
 */
function getLocalHour(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    return h === 24 ? 0 : h;
  } catch {
    return -1;
  }
}

/**
 * Get the local calendar date string (YYYY-MM-DD) for a given timezone.
 */
function getLocalDateStr(tz) {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Check every linked member's local time and send the appropriate greeting.
 * Called once per hour by the scheduler.
 * Each greeting type is sent at most once per calendar day per member.
 * Dedup state is persisted to SQLite — survives restarts and migrations.
 */
export async function checkAndSendGreetings(client) {
  if (isLocked()) {
    log.info('dailyMessages: skipped — notification lock held');
    return;
  }
  const links = await store.getLinks();
  const discordIds = Object.keys(links);
  if (!discordIds.length) return;

  let sent = 0;

  for (const discordId of discordIds) {
    try {
      const tz = (await store.getTimezone(discordId)) || DEFAULT_TZ;
      const hour = getLocalHour(tz);
      if (hour < 0) continue;

      let type = null;
      if (hour === 12) type = 'noon';
      else if (hour === 21) type = 'night';
      else if (hour === 0) type = 'midnight';

      if (!type) continue;

      // Persistent dedup keyed by member's local date — survives restarts and migrations.
      // Only written after a successful send so failures are retried on next scheduler tick.
      const date = getLocalDateStr(tz);
      const stateKey = `greetedDm:${type}:${discordId}`;
      const lastGreeted = await store.getState(stateKey).catch(() => null);
      if (lastGreeted === date) continue;

      const user = await client.users.fetch(discordId);
      const buf = await renderGreetingDm({ type, date });
      const attachment = new AttachmentBuilder(buf, { name: `greeting-${type}.png` });
      await user.send({ files: [attachment] });
      await store.setState(stateKey, date); // persist only on success
      sent++;
    } catch (err) {
      log.warn(`dailyMessages: could not greet ${discordId}: ${err.message}`);
    }
  }

  if (sent > 0) {
    log.info(`dailyMessages: sent ${sent} greeting(s)`);
  }
}
