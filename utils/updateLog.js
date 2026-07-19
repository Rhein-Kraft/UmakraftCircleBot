/**
 * utils/updateLog.js
 * ──────────────────
 * Posts brief update notifications to the read-only #update channel
 * whenever the bot does something significant (timeline, milestone,
 * leaderboard, restart, etc.).
 */

import { getUpdateChannel } from '../core/channels.js';
import { log } from '../core/log.js';

/**
 * Post a notification to #update in every guild the bot is in.
 *
 * @param {import('discord.js').Client} client
 * @param {string} emoji   — Leading emoji for the message
 * @param {string} title   — Bold title line
 * @param {string} [body]  — Optional detail lines
 */
export async function postUpdate(client, emoji, title, body = null) {
  try {
    const guilds = await client.guilds.fetch();
    for (const [, partial] of guilds) {
      let guild;
      try {
        guild = await partial.fetch();
      } catch {
        continue;
      }

      const channel = await getUpdateChannel(guild);
      if (!channel) continue;

      const lines = [`${emoji} **${title}**`];
      if (body) lines.push(body);
      lines.push(`<t:${Math.floor(Date.now() / 1000)}:R>`);

      try {
        await channel.send(lines.join('\n'));
      } catch (err) {
        log.warn(`updateLog: failed to post in ${guild.name}: ${err.message}`);
      }
    }
  } catch (err) {
    log.warn('updateLog: unexpected error:', err.message);
  }
}
