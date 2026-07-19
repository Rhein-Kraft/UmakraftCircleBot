/**
 * core/channels.js
 * ─────────────────
 * High-level channel management.
 * Permission constants/helpers live in core/channelPerms.js.
 */

import { ChannelType, PermissionsBitField } from 'discord.js';
import { config } from './config.js';
import { store } from './store.js';
import { log } from './log.js';
import { findTextChannel, ensureChannel, ensureToolsCategory, moveToCategory } from './channel-utils.js';
import {
  UMA_STORE_PERMS,
  applyUmaStorePerms,
  UMA_RESULTS_PERMS,
  applyUmaResultsPerms,
  CHAT_HISTORY_BOT_PERMS,
  applyChatHistoryPerms,
} from './channelPerms.js';

export async function getAnnouncementChannel(guild) {
  return ensureChannel(guild, config.announcementChannel, 'announcementChannelId');
}

const FRIEND_CHANNEL_ID = '1489102558524866711';

/**
 * Find the existing #friends channel (or common variants).
 * Tries the fixed channel ID first, then falls back to name search.
 * Does NOT create it — the channel is expected to already exist.
 */
export async function getFriendChannel(guild) {
  const stored = await store.getGuildConfig(guild.id);
  if (stored.friendChannelId) {
    const ch = guild.channels.cache.get(stored.friendChannelId);
    if (ch) return ch;
  }

  let ch = guild.channels.cache.get(FRIEND_CHANNEL_ID) ?? null;

  if (!ch) {
    ch =
      findTextChannel(guild, 'friends') ||
      findTextChannel(guild, 'friend-channel') ||
      findTextChannel(guild, 'friend') ||
      null;
  }

  if (ch) {
    await store.setGuildConfig(guild.id, { friendChannelId: ch.id });
  } else {
    log.warn(`getFriendChannel: no #friends channel found in ${guild.name}`);
  }
  return ch;
}

export async function ensureGuildChannels(guild) {
  const a  = await getAnnouncementChannel(guild);
  const s  = await getUmaStoreChannel(guild);
  const u  = await getUmaResultsChannel(guild);
  const lb = await getLeaderboardChannel(guild);
  return { announcement: a, umaStore: s, umaResults: u, leaderboard: lb };
}

/**
 * Find or create the #leaderboard channel.
 * The bot posts daily / weekly / monthly fan-gain leaderboards here.
 * Members can read; only the bot can post.
 */
export async function getLeaderboardChannel(guild) {
  const stored = await store.getGuildConfig(guild.id);
  if (stored.leaderboardChannelId) {
    const ch = guild.channels.cache.get(stored.leaderboardChannelId);
    if (ch) return ch;
  }

  const name = 'leaderboard';
  let channel = findTextChannel(guild, name);

  if (!channel) {
    const me = guild.members.me;
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      log.warn(`Guild ${guild.name}: missing ManageChannels; cannot create #${name}`);
      return null;
    }
    try {
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        topic: '📊 Daily · Weekly · Monthly fan-gain leaderboards — auto-updated by the bot.',
        reason: 'Auto-created by Uma circle bot for leaderboard updates',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
            deny: [
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.SendMessagesInThreads,
              PermissionsBitField.Flags.CreatePublicThreads,
              PermissionsBitField.Flags.CreatePrivateThreads,
            ],
          },
          {
            id: me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
        ],
      });
      log.info(`Created #${name} in ${guild.name}`);
    } catch (err) {
      log.warn(`Failed to create #${name} in ${guild.name}:`, err.message);
      return null;
    }
  }

  await store.setGuildConfig(guild.id, { leaderboardChannelId: channel.id });
  return channel;
}

// ── #uma-store ────────────────────────────────────────────────────────────────

export async function getUmaStoreChannel(guild) {
  const me       = guild.members.me;
  const toolsCat = await ensureToolsCategory(guild);

  const stored  = await store.getGuildConfig(guild.id);
  let channel   = stored.umaStoreChannelId
    ? guild.channels.cache.get(stored.umaStoreChannelId)
    : null;

  if (!channel) channel = findTextChannel(guild, 'uma-store');

  if (!channel) {
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      log.warn(`Guild ${guild.name}: missing ManageChannels; cannot create #uma-store`);
      return null;
    }
    try {
      channel = await guild.channels.create({
        name: 'uma-store',
        type: ChannelType.GuildText,
        parent: toolsCat?.id,
        topic: 'Paste your trainer ID or type "store <id>" to save to the database.',
        reason: 'Auto-created by Uma bot for trainer database',
        permissionOverwrites: UMA_STORE_PERMS(guild.roles.everyone.id, me.id),
      });
      log.info(`Created #uma-store in ${guild.name} under Tools`);
    } catch (err) {
      log.warn(`Failed to create #uma-store in ${guild.name}:`, err.message);
      return null;
    }
  } else {
    if (toolsCat) await moveToCategory(channel, toolsCat);
    await applyUmaStorePerms(channel, guild);
  }

  await store.setGuildConfig(guild.id, { umaStoreChannelId: channel.id });
  return channel;
}

// ── #uma-results ──────────────────────────────────────────────────────────────

/**
 * Find or create the #uma-results channel inside the Tools category.
 * Members can read; only the bot can post.
 */
export async function getUmaResultsChannel(guild) {
  const me       = guild.members.me;
  const toolsCat = await ensureToolsCategory(guild);

  const stored  = await store.getGuildConfig(guild.id);
  let channel   = stored.umaResultsChannelId
    ? guild.channels.cache.get(stored.umaResultsChannelId)
    : null;

  if (!channel) channel = findTextChannel(guild, 'uma-results');

  if (!channel) {
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      log.warn(`Guild ${guild.name}: missing ManageChannels; cannot create #uma-results`);
      return null;
    }
    try {
      channel = await guild.channels.create({
        name: 'uma-results',
        type: ChannelType.GuildText,
        parent: toolsCat?.id,
        topic: 'Trainer database search results and stored entries. Read-only for members.',
        reason: 'Auto-created by Uma bot for trainer database results',
        permissionOverwrites: UMA_RESULTS_PERMS(guild.roles.everyone.id, me.id),
      });
      log.info(`Created #uma-results in ${guild.name} under Tools`);
    } catch (err) {
      log.warn(`Failed to create #uma-results in ${guild.name}:`, err.message);
      return null;
    }
  } else {
    if (toolsCat) await moveToCategory(channel, toolsCat);
    await applyUmaResultsPerms(channel, guild);
  }

  await store.setGuildConfig(guild.id, { umaResultsChannelId: channel.id });
  return channel;
}

// ── #chat (source) ────────────────────────────────────────────────────────────

/**
 * Find the existing #chat channel. Does NOT create it — it's expected to exist.
 */
export async function getChatChannel(guild) {
  const stored = await store.getGuildConfig(guild.id);
  if (stored.chatChannelId) {
    const ch = guild.channels.cache.get(stored.chatChannelId);
    if (ch) return ch;
  }

  const ch =
    findTextChannel(guild, 'chat') ||
    findTextChannel(guild, 'general-chat') ||
    findTextChannel(guild, 'general');

  if (ch) {
    await store.setGuildConfig(guild.id, { chatChannelId: ch.id });
  } else {
    log.warn(`getChatChannel: no #chat channel found in ${guild.name}`);
  }
  return ch ?? null;
}

// ── #chat-history (archive, read-only) ────────────────────────────────────────

/**
 * Find or create the #chat-history channel.
 * Members can read; only the bot posts (archived messages).
 * If the channel already exists, bot permissions are re-applied so
 * "Missing Access" errors from manual permission changes are self-healing.
 */
export async function getChatHistoryChannel(guild) {
  const stored = await store.getGuildConfig(guild.id);
  if (stored.chatHistoryChannelId) {
    const ch = guild.channels.cache.get(stored.chatHistoryChannelId);
    if (ch) {
      await applyChatHistoryPerms(ch, guild);
      return ch;
    }
  }

  const name = 'chat-history';
  let channel = findTextChannel(guild, name);

  if (!channel) {
    const me = guild.members.me;
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      log.warn(`Guild ${guild.name}: missing ManageChannels; cannot create #${name}`);
      return null;
    }
    try {
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        topic: '📜 Archived messages from #chat — read-only.',
        reason: 'Auto-created by Uma bot for chat archiving',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
            deny: [
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.SendMessagesInThreads,
              PermissionsBitField.Flags.CreatePublicThreads,
              PermissionsBitField.Flags.CreatePrivateThreads,
            ],
          },
          {
            id: guild.members.me.id,
            allow: CHAT_HISTORY_BOT_PERMS,
          },
        ],
      });
      log.info(`Created #${name} in ${guild.name}`);
    } catch (err) {
      log.warn(`Failed to create #${name} in ${guild.name}:`, err.message);
      return null;
    }
  } else {
    await applyChatHistoryPerms(channel, guild);
  }

  await store.setGuildConfig(guild.id, { chatHistoryChannelId: channel.id });
  return channel;
}

// ── #urgent-warning (fan deficit + operational alerts, read-only) ─────────────

const URGENT_WARNING_ID   = '1506619521455362168';
const URGENT_WARNING_NAME = 'urgent-warning';

/**
 * Resolve the #urgent-warning channel by its fixed ID.
 * Falls back to finding/creating a channel by name if the ID is not in cache.
 * Renames the channel to "urgent-warning" if it still has the old "logs-update" name.
 */
export async function getUpdateChannel(guild) {
  let channel = guild.channels.cache.get(URGENT_WARNING_ID) ?? null;

  if (!channel) {
    channel =
      findTextChannel(guild, URGENT_WARNING_NAME) ||
      findTextChannel(guild, 'logs-update') ||
      findTextChannel(guild, 'update') ||
      findTextChannel(guild, 'bot-updates') ||
      findTextChannel(guild, 'updates');
  }

  if (channel) {
    if (channel.name !== URGENT_WARNING_NAME) {
      channel.setName(URGENT_WARNING_NAME, 'Renamed by Uma bot').catch(() => {});
    }
  } else {
    const me = guild.members.me;
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      log.warn(`Guild ${guild.name}: missing ManageChannels; cannot create #${URGENT_WARNING_NAME}`);
      return null;
    }
    try {
      channel = await guild.channels.create({
        name: URGENT_WARNING_NAME,
        type: ChannelType.GuildText,
        topic: '🚨 Fan deficit reports and urgent bot alerts. Read-only.',
        reason: 'Auto-created by Uma bot for urgent warnings',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
            deny: [
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.SendMessagesInThreads,
              PermissionsBitField.Flags.CreatePublicThreads,
              PermissionsBitField.Flags.CreatePrivateThreads,
            ],
          },
          {
            id: me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
        ],
      });
      log.info(`Created #${URGENT_WARNING_NAME} in ${guild.name}`);
    } catch (err) {
      log.warn(`Failed to create #${URGENT_WARNING_NAME} in ${guild.name}:`, err.message);
      return null;
    }
  }

  await store.setGuildConfig(guild.id, { updateChannelId: channel.id });
  return channel;
}

// ── #changelog (human-written release notes, read-only) ──────────────────────

const CHANGELOG_CHANNEL_ID = '1510085902259458078';

/**
 * Resolve the #changelog channel by its fixed ID.
 * Returns null if the channel is not accessible — never creates it.
 */
export async function getChangelogChannel(guild) {
  const ch = guild.channels.cache.get(CHANGELOG_CHANNEL_ID) ?? null;
  if (!ch) log.debug(`getChangelogChannel: channel ${CHANGELOG_CHANNEL_ID} not in cache for ${guild.name}`);
  return ch;
}

// ── #behaviour-panel (member action log, read-only, no notifications) ─────────

const BEHAVIOUR_CHANNEL_ID = '1510086497804615772';

/**
 * Resolve the #behaviour-panel channel by its fixed ID.
 * Returns null if the channel is not accessible — never creates it.
 */
export async function getBehaviourChannel(guild) {
  const ch = guild.channels.cache.get(BEHAVIOUR_CHANNEL_ID) ?? null;
  if (!ch) log.debug(`getBehaviourChannel: channel ${BEHAVIOUR_CHANNEL_ID} not in cache for ${guild.name}`);
  return ch;
}

/**
 * Find or create the #uma-timeline channel in a guild.
 * Members can read but not write; the bot can post.
 * Channel ID is saved to guildConfig.timelineChannelId.
 */
export async function getTimelineChannel(guild) {
  const stored = await store.getGuildConfig(guild.id);
  if (stored.timelineChannelId) {
    const ch = guild.channels.cache.get(stored.timelineChannelId);
    if (ch) return ch;
  }

  const name = 'uma-timeline';
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
        topic: 'Automatic Uma Musume event & timeline updates ✦ Updated every 5 minutes.',
        reason: 'Auto-created by Uma circle bot for timeline news feed',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionsBitField.Flags.ViewChannel],
            deny: [PermissionsBitField.Flags.SendMessages],
          },
          {
            id: me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
            ],
          },
        ],
      });
      log.info(`Created #${name} in ${guild.name}`);
    } catch (err) {
      log.warn(`Failed to create #${name} in ${guild.name}:`, err.message);
      return null;
    }
  }

  await store.setGuildConfig(guild.id, { timelineChannelId: channel.id });
  return channel;
}

// ── #image-archive (Media category, read-only) ────────────────────────────────

const MEDIA_CATEGORY_NAME = 'Media';
const IMAGE_ARCHIVE_NAME  = 'image-archive';

/**
 * Find the "Media" category channel in the guild (case-insensitive).
 * Returns null if not found.
 */
export function getMediaCategory(guild) {
  return (
    guild.channels.cache.find(
      c =>
        c.type === ChannelType.GuildCategory &&
        c.name.toLowerCase() === MEDIA_CATEGORY_NAME.toLowerCase()
    ) ?? null
  );
}

/**
 * Return all text channels inside the Media category, excluding:
 *   • #image-archive itself
 *   • any channel whose name contains "store" (e.g. comic-art-store)
 *
 * Returns an empty array if the category doesn't exist.
 */
export function getMediaCategoryChannels(guild) {
  const cat = getMediaCategory(guild);
  if (!cat) return [];
  return guild.channels.cache
    .filter(
      c =>
        c.type === ChannelType.GuildText &&
        c.parentId === cat.id &&
        c.name !== IMAGE_ARCHIVE_NAME &&
        !c.name.toLowerCase().includes('store')
    )
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(c => c);
}

/**
 * Find or create the #image-archive channel inside the Media category.
 * Read-only for @everyone; full posting rights for the bot.
 */
export async function getImageArchiveChannel(guild) {
  const stored = await store.getGuildConfig(guild.id);
  if (stored.imageArchiveChannelId) {
    const ch = guild.channels.cache.get(stored.imageArchiveChannelId);
    if (ch) return ch;
  }

  let channel =
    guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name === IMAGE_ARCHIVE_NAME
    ) ?? null;

  const me = guild.members.me;

  if (!channel) {
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      log.warn(`Guild ${guild.name}: missing ManageChannels; cannot create #${IMAGE_ARCHIVE_NAME}`);
      return null;
    }

    const cat = getMediaCategory(guild);

    try {
      channel = await guild.channels.create({
        name: IMAGE_ARCHIVE_NAME,
        type: ChannelType.GuildText,
        parent: cat?.id ?? null,
        topic: '🖼️ Preserved images from the Media category — collected automatically by the bot.',
        reason: 'Auto-created by Uma bot for media preservation',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
            deny: [
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.SendMessagesInThreads,
              PermissionsBitField.Flags.CreatePublicThreads,
              PermissionsBitField.Flags.CreatePrivateThreads,
              PermissionsBitField.Flags.AddReactions,
            ],
          },
          {
            id: me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
        ],
      });
      log.info(`Created #${IMAGE_ARCHIVE_NAME} in ${guild.name} (Media category)`);
    } catch (err) {
      log.warn(`Failed to create #${IMAGE_ARCHIVE_NAME} in ${guild.name}:`, err.message);
      return null;
    }
  } else {
    const cat = getMediaCategory(guild);
    if (cat && channel.parentId !== cat.id) {
      await channel.setParent(cat.id, { lockPermissions: false }).catch(() => {});
    }
    if (me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
      await channel.permissionOverwrites
        .edit(guild.roles.everyone.id, {
          [PermissionsBitField.Flags.ViewChannel]:             true,
          [PermissionsBitField.Flags.ReadMessageHistory]:      true,
          [PermissionsBitField.Flags.SendMessages]:            false,
          [PermissionsBitField.Flags.SendMessagesInThreads]:   false,
          [PermissionsBitField.Flags.CreatePublicThreads]:     false,
          [PermissionsBitField.Flags.CreatePrivateThreads]:    false,
          [PermissionsBitField.Flags.AddReactions]:            false,
        })
        .catch(() => {});
      await channel.permissionOverwrites
        .edit(me.id, {
          [PermissionsBitField.Flags.ViewChannel]:        true,
          [PermissionsBitField.Flags.SendMessages]:       true,
          [PermissionsBitField.Flags.EmbedLinks]:         true,
          [PermissionsBitField.Flags.AttachFiles]:        true,
          [PermissionsBitField.Flags.ManageMessages]:     true,
          [PermissionsBitField.Flags.ReadMessageHistory]: true,
        })
        .catch(() => {});
    }
  }

  await store.setGuildConfig(guild.id, { imageArchiveChannelId: channel.id });
  return channel;
}
