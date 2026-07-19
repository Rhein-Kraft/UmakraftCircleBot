/**
 * core/channel-utils.js
 * ──────────────────────
 * Internal helpers for channel lookup and creation.
 * Not part of the public channels API — imported only by core/channels.js.
 */

import { ChannelType, PermissionsBitField } from 'discord.js';
import { store } from './store.js';
import { log } from './log.js';

export const TOOLS_CATEGORY_NAME = 'Tools';

/**
 * Find a text channel by exact name or common slug variants.
 * "result-contribution" also matches "results", "resultcontribution", etc.
 */
export function findTextChannel(guild, wanted) {
  const lower = wanted.toLowerCase();
  return guild.channels.cache.find(
    c =>
      c.type === ChannelType.GuildText &&
      (c.name === lower ||
        c.name === lower.replace(/-/g, '_') ||
        c.name === lower.replace(/-/g, ''))
  );
}

/**
 * Generic find-or-create for a simple text channel with no special permissions.
 * Caches the channel ID in guild_config under `configKey`.
 */
export async function ensureChannel(guild, name, configKey) {
  const stored = await store.getGuildConfig(guild.id);
  if (stored[configKey]) {
    const ch = guild.channels.cache.get(stored[configKey]);
    if (ch) return ch;
  }

  let channel = findTextChannel(guild, name);
  if (!channel) {
    const me = guild.members.me;
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      log.warn(`Guild ${guild.name}: missing ManageChannels permission; cannot create #${name}`);
      return null;
    }
    try {
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        reason: 'Auto-created by Uma circle bot',
      });
      log.info(`Created #${name} in ${guild.name}`);
    } catch (err) {
      log.warn(`Failed to create #${name} in ${guild.name}:`, err.message);
      return null;
    }
  }
  await store.setGuildConfig(guild.id, { [configKey]: channel.id });
  return channel;
}

/**
 * Find or create the "Tools" category in the guild.
 */
export async function ensureToolsCategory(guild) {
  let cat = guild.channels.cache.find(
    c =>
      c.type === ChannelType.GuildCategory &&
      c.name.toLowerCase() === TOOLS_CATEGORY_NAME.toLowerCase()
  );
  if (!cat) {
    const me = guild.members.me;
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      log.warn(`Guild ${guild.name}: missing ManageChannels; cannot create Tools category`);
      return null;
    }
    cat = await guild.channels.create({
      name: TOOLS_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      reason: 'Auto-created by Uma bot for tool channels',
    });
    log.info(`Created category "${TOOLS_CATEGORY_NAME}" in ${guild.name}`);
  }
  return cat;
}

/**
 * Move a channel into the given category (no-op if already there).
 */
export async function moveToCategory(channel, category) {
  if (channel.parentId === category.id) return;
  try {
    await channel.setParent(category.id, { lockPermissions: false });
    log.info(`Moved #${channel.name} into "${TOOLS_CATEGORY_NAME}"`);
  } catch (err) {
    log.warn(`moveToCategory #${channel.name}: ${err.message}`);
  }
}
