/**
 * tasks/purgeAnnouncement.js
 * ──────────────────────────
 * Runs on startup AND every hour via cron:
 *  • Deletes ALL non-bot messages from #announcement (live deletion is also
 *    handled in messageCreate, but this catches anything while bot was offline).
 *  • Deletes ALL bot-posted messages that are older than 24 hours — regardless
 *    of type (milestone cards, image reports, embeds, plain text, etc.).
 *  • Handles both the Discord bulkDelete window (< 14 days) AND older messages
 *    that must be deleted individually one at a time.
 */

import { getAnnouncementChannel } from '../core/channels.js';
import { log } from '../core/log.js';

/** Discord bulk-delete only works for messages < 14 days old. */
const BULK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 60_000;
const MAX_AGE_24H_MS = 24 * 60 * 60 * 1000;
/** Maximum individual deletes per run to stay comfortably within rate limits. */
const INDIVIDUAL_DELETE_CAP = 50;
/** Small pause between individual deletes (ms) to avoid 429s. */
const DELETE_PAUSE_MS = 600;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Fetch all messages that Discord will accept for bulkDelete (< 14 days old).
 * Returns them newest-first.
 */
async function fetchBulkDeletableMessages(channel) {
  const cutoff = Date.now() - BULK_MAX_AGE_MS;
  const all = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;

    for (const msg of batch.values()) {
      if (msg.createdTimestamp >= cutoff) all.push(msg);
    }

    const oldest = batch.last();
    if (oldest.createdTimestamp < cutoff) break;

    before = oldest.id;
    if (batch.size < 100) break;
  }

  return all;
}

/**
 * Fetch messages older than the bulkDelete window — these must be deleted
 * individually. We stop once we hit the cap to avoid long-running sweeps.
 */
async function fetchAncientBotMessages(channel, botId, cap = INDIVIDUAL_DELETE_CAP) {
  const cutoff = Date.now() - BULK_MAX_AGE_MS; // older than 14 days
  const age24h = Date.now() - MAX_AGE_24H_MS;
  const results = [];
  let before;

  // Start from the oldest fetched bulk batch's last message if possible —
  // but since we don't have that cursor, do a full paginated walk.
  outer: while (results.length < cap) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;

    for (const msg of batch.values()) {
      if (msg.createdTimestamp >= cutoff) {
        // Still in the bulkDelete window — skip forward.
        continue;
      }
      // Older than 14 days: only delete bot messages older than 24 h.
      if (msg.author.id === botId && msg.createdTimestamp < age24h) {
        results.push(msg);
        if (results.length >= cap) break outer;
      }
    }

    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return results;
}

export async function purgeAnnouncementChannel(client) {
  try {
    const guilds = await client.guilds.fetch();

    for (const [, partial] of guilds) {
      let guild;
      try {
        guild = await partial.fetch();
      } catch {
        continue;
      }

      const channel = await getAnnouncementChannel(guild);
      if (!channel) continue;

      log.info(`purgeAnnouncement: scanning #${channel.name} in ${guild.name}`);

      // ── 1. Messages within the bulk-delete window (< 14 days) ────────────
      let recentMessages = [];
      try {
        recentMessages = await fetchBulkDeletableMessages(channel);
      } catch (err) {
        log.warn(`purgeAnnouncement: fetch failed in ${guild.name}: ${err.message}`);
        continue;
      }

      const now = Date.now();

      const humanMessages = recentMessages.filter(m => m.author.id !== client.user.id);
      const oldBotMessages = recentMessages.filter(
        m => m.author.id === client.user.id && now - m.createdTimestamp > MAX_AGE_24H_MS
      );

      const toDelete = [...humanMessages, ...oldBotMessages];
      let deleted = 0;

      for (let i = 0; i < toDelete.length; i += 100) {
        const batch = toDelete.slice(i, i + 100);
        try {
          if (batch.length === 1) {
            await batch[0].delete();
          } else {
            await channel.bulkDelete(batch);
          }
          deleted += batch.length;
        } catch (err) {
          log.warn(`purgeAnnouncement: bulkDelete error: ${err.message}`);
        }
      }

      // ── 2. Ancient messages older than 14 days (individual delete) ────────
      let ancientDeleted = 0;
      try {
        const ancient = await fetchAncientBotMessages(channel, client.user.id);
        for (const msg of ancient) {
          try {
            await msg.delete();
            ancientDeleted++;
            if (ancient.indexOf(msg) < ancient.length - 1) await sleep(DELETE_PAUSE_MS);
          } catch (err) {
            if (err.code === 10008) continue; // Unknown Message — already gone
            log.warn(`purgeAnnouncement: ancient delete error: ${err.message}`);
          }
        }
      } catch (err) {
        log.warn(`purgeAnnouncement: ancient fetch error: ${err.message}`);
      }

      const total = deleted + ancientDeleted;
      log.info(
        `purgeAnnouncement: removed ${total} message(s) in ${guild.name} ` +
          `(${humanMessages.length} human, ${oldBotMessages.length} recent bot, ${ancientDeleted} ancient bot)`
      );
    }
  } catch (err) {
    log.error('purgeAnnouncement: unexpected error:', err.message);
  }
}
