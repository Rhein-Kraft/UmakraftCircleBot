import { Events } from 'discord.js';
import { log } from '../core/log.js';
import { ensureGuildChannels } from '../core/channels.js';

export function register(client, onReady) {
  client.once(Events.ClientReady, async readyClient => {
    log.info(`Logged in as ${readyClient.user.tag} (id=${readyClient.user.id})`);
    log.info(`Connected to ${readyClient.guilds.cache.size} guild(s)`);

    // Ensure announcement and results channels exist in every guild we're in.
    for (const [, guild] of readyClient.guilds.cache) {
      try {
        await ensureGuildChannels(guild);
      } catch (err) {
        log.warn(`Could not configure channels for ${guild.name}: ${err.message}`);
      }
    }

    if (onReady) {
      try {
        await onReady(readyClient);
      } catch (err) {
        log.error('Startup tasks failed:', err);
      }
    }
  });
}
