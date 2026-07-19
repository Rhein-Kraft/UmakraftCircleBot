/**
 * tasks/milestoneCleanup.js
 * ─────────────────────────
 * Deletes milestone announcement messages from #announcement after 24 hours.
 * Runs on the same cadence as the milestone checker (every 30 minutes).
 */

import { getMilestoneMessagesToDelete, clearMilestoneMessageId } from './db.js';
import { log } from '../../core/log.js';

export async function cleanupMilestoneMessages(client) {
  const rows = getMilestoneMessagesToDelete();
  if (rows.length === 0) return;

  let deleted = 0;
  let cleared = 0;

  for (const row of rows) {
    try {
      const channel = await client.channels.fetch(row.channel_id).catch(() => null);
      if (channel?.isTextBased()) {
        const msg = await channel.messages.fetch(row.channel_msg_id).catch(() => null);
        if (msg) {
          await msg.delete();
          deleted += 1;
        }
      }
    } catch (err) {
      log.debug(`milestoneCleanup: skipped ${row.channel_msg_id}: ${err.message}`);
    }

    // Always clear the stored ID — whether the message was found or was already gone.
    clearMilestoneMessageId(row.viewer_id, row.tier_key, row.month, row.circle_id);
    cleared += 1;
  }

  if (cleared > 0) {
    log.info(`milestoneCleanup: deleted ${deleted}/${cleared} milestone messages (24h expired)`);
  }
}
