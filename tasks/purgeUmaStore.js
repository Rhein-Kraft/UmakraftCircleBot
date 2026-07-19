/**
 * tasks/purgeUmaStore.js
 * ──────────────────────
 * Runs on every bot startup.
 *
 * #uma-store is a submit-only channel — no message should ever persist there:
 *  • Human messages are deleted live by messageCreate.js, but anything posted
 *    while the bot was offline survives.
 *  • Before the ephemeral fix, /store slash-command replies were posted
 *    publicly and accumulated as permanent bot messages.
 *
 * This task deletes every message in #uma-store (human or bot) so the channel
 * is always empty and ready for the next trainer ID paste.
 *
 * Discord bulkDelete only works for messages < 14 days old; messages older
 * than that are deleted individually (rate-limited to avoid hammering the API).
 */

import { store } from '../core/store.js';
import { log } from '../core/log.js';

const BULK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 60_000; // ~14 days minus 1 min

async function fetchAllMessages(channel) {
  const recent = [];
  const old = [];
  const cutoff = Date.now() - BULK_MAX_AGE_MS;
  let before;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;

    for (const msg of batch.values()) {
      if (msg.createdTimestamp >= cutoff) {
        recent.push(msg);
      } else {
        old.push(msg);
      }
    }

    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return { recent, old };
}

export async function purgeUmaStore(client) {
  try {
    const guilds = await client.guilds.fetch();

    for (const [, partial] of guilds) {
      let guild;
      try {
        guild = await partial.fetch();
      } catch {
        continue;
      }

      const guildCfg = await store.getGuildConfig(guild.id);
      if (!guildCfg.umaStoreChannelId) continue;

      const channel = guild.channels.cache.get(guildCfg.umaStoreChannelId);
      if (!channel) continue;

      log.info(`purgeUmaStore: scanning #${channel.name} in ${guild.name}`);

      let recent, old;
      try {
        ({ recent, old } = await fetchAllMessages(channel));
      } catch (err) {
        log.warn(`purgeUmaStore: fetch failed in ${guild.name}: ${err.message}`);
        continue;
      }

      let deleted = 0;

      // Bulk-delete recent messages (< 14 days) in batches of up to 100
      for (let i = 0; i < recent.length; i += 100) {
        const batch = recent.slice(i, i + 100);
        try {
          if (batch.length === 1) {
            await batch[0].delete();
          } else {
            await channel.bulkDelete(batch);
          }
          deleted += batch.length;
        } catch (err) {
          log.warn(`purgeUmaStore: bulkDelete error in ${guild.name}: ${err.message}`);
        }
      }

      // Delete old messages (>= 14 days) one by one with a small delay
      for (const msg of old) {
        try {
          await msg.delete();
          deleted++;
          await new Promise(r => setTimeout(r, 300));
        } catch {
          // Missing access or already deleted — skip silently
        }
      }

      if (deleted > 0) {
        log.info(
          `purgeUmaStore: removed ${deleted} message(s) from #${channel.name} in ${guild.name}`
        );
      } else {
        log.info(`purgeUmaStore: #${channel.name} already clean in ${guild.name}`);
      }
    }
  } catch (err) {
    log.error('purgeUmaStore: unexpected error:', err.message);
  }
}
