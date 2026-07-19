import { Events, AttachmentBuilder } from 'discord.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';
import { renderGreetingDm } from '../utils/reports/greeting.js';
import { jstDate } from '../core/format.js';

// In-memory set of Discord user IDs currently online.
// Populated/cleared via PresenceUpdate events.
export const onlineUsers = new Set();

export function register(client) {
  client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
    try {
      const userId = newPresence?.userId;
      if (!userId) return;
      if (newPresence.user?.bot) return;

      const newStatus = newPresence.status; // 'online' | 'idle' | 'dnd' | 'offline' | 'invisible'
      const oldStatus = oldPresence?.status ?? 'offline';

      const isNowActive = newStatus === 'online' || newStatus === 'idle' || newStatus === 'dnd';
      const wasOffline = !oldPresence || oldStatus === 'offline' || oldStatus === 'invisible';

      if (isNowActive) {
        onlineUsers.add(userId);
        await store.setState(`lastSeen:${userId}`, new Date().toISOString());
      } else {
        onlineUsers.delete(userId);
        await store.setState(`lastSeen:${userId}`, new Date().toISOString());
      }

      // Morning greeting fires only when transitioning from offline → active for the first time today.
      if (!wasOffline || !isNowActive) return;

      const links = await store.getLinks();
      if (!Object.prototype.hasOwnProperty.call(links, userId)) return;

      // Persistent dedup — survives restarts and migrations.
      // Only set after a successful send so failures are retried.
      const today = jstDate();
      const stateKey = `greetedMorning:${userId}`;
      const lastGreeted = await store.getState(stateKey).catch(() => null);
      if (lastGreeted === today) return;

      const user = await client.users.fetch(userId);

      // Render the image — failure here is a real error (Playwright/Chromium), not a DM block.
      let attachment;
      try {
        const buf = await renderGreetingDm({ type: 'morning', date: today });
        attachment = new AttachmentBuilder(buf, { name: 'greeting-morning.png' });
      } catch (renderErr) {
        log.warn(`presenceUpdate: morning greeting render failed for ${user.tag} — ${renderErr.message}`);
        return; // don't mark as sent — retry next time they come online
      }

      // Send the image — failure here is typically a DM privacy block.
      try {
        await user.send({ files: [attachment] });
        await store.setState(stateKey, today); // persist only on success
        log.info(`presenceUpdate: sent morning greeting to ${user.tag}`);
      } catch (dmErr) {
        // User has DMs disabled or has blocked the bot — not a real error.
        // Don't persist — retry the next time they come online today.
        log.debug(`presenceUpdate: DM blocked for ${user.tag} — ${dmErr.message}`);
      }
    } catch (err) {
      log.warn(`presenceUpdate handler error: ${err.message}`);
    }
  });
}
