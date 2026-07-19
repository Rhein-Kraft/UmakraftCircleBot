/**
 * utils/activityLog.js
 * ─────────────────────
 * Posts command-usage entries to #logs-update.
 *
 * Attendance is NOT recorded here — that is handled exclusively by the 6AM
 * daily attendance cron in tasks/attendanceCheck.js.
 *
 * Per slash command fired:
 *   ⚡  **username** used `/commandname` in #channel · HH:MM JST
 */

import { getBehaviourChannel } from '../core/channels.js';
import { log } from '../core/log.js';
import { jstTime } from '../core/format.js';

// ── Channel cache ─────────────────────────────────────────────────────────────
const _channelCache = new Map();
const CACHE_TTL_MS = 5 * 60_000;

async function getLogChannel(client, guildId) {
  const now = Date.now();
  const cached = _channelCache.get(guildId);
  if (cached && now - cached.resolvedAt < CACHE_TTL_MS) return cached.channel;

  let guild;
  try {
    guild = await client.guilds.fetch(guildId);
  } catch {
    return null;
  }

  const channel = await getBehaviourChannel(guild).catch(() => null);
  _channelCache.set(guildId, { channel, resolvedAt: now });
  return channel;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Log command usage for a slash command interaction.
 * Fire-and-forget — never throws, never blocks command execution.
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function logActivity(client, interaction) {
  try {
    if (!interaction.guildId) return;

    const username =
      interaction.member?.displayName ?? interaction.user.displayName ?? interaction.user.username;
    const cmdName = interaction.commandName;
    const channelName = interaction.channel?.name ?? 'unknown';
    const time = jstTime();

    const logCh = await getLogChannel(client, interaction.guildId);
    if (!logCh) return;

    await logCh.send({
      content: `⚡ **${username}** used \`/${cmdName}\` in #${channelName} · ${time}`,
      flags: [4096], // SuppressNotifications
    });
  } catch (err) {
    log.warn('[activityLog] error:', err.message);
  }
}
