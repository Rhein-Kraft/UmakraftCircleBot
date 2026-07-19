import { store } from '../core/store.js';
import { log } from '../core/log.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delete bot-generated slash command replies older than 24 hours.
 * Normal member messages are never touched.
 */
export async function cleanupCommandMessages(client) {
  const due = await store.takeCommandMessagesOlderThan(ONE_DAY_MS);
  if (due.length === 0) return;

  let deleted = 0;
  for (const entry of due) {
    try {
      const channel = await client.channels.fetch(entry.channelId);
      if (!channel?.isTextBased()) continue;
      const msg = await channel.messages.fetch(entry.messageId).catch(() => null);
      if (msg) {
        await msg.delete();
        deleted += 1;
      }
    } catch (err) {
      // Already deleted or no permission; not worth alarming about.
      log.debug(`messageCleanup: skipped ${entry.messageId}: ${err.message}`);
    }
  }
  log.info(`messageCleanup: deleted ${deleted} of ${due.length} aged bot replies`);
}
