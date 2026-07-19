/**
 * core/channelPerms.js
 * ─────────────────────
 * Discord permission overwrite constants and apply-helpers for each
 * channel type managed by channels.js.
 *
 * Exported:
 *   UMA_STORE_PERMS(everyoneId, botId)   — factory for #uma-store
 *   applyUmaStorePerms(channel, guild)   — re-apply permissions on existing channel
 *   UMA_RESULTS_PERMS(everyoneId, botId) — factory for #uma-results
 *   applyUmaResultsPerms(channel, guild) — re-apply permissions on existing channel
 *   CHAT_HISTORY_BOT_PERMS               — static allow-list for bot in #chat-history
 *   applyChatHistoryPerms(channel, guild)— repair bot permissions on existing channel
 */

import { PermissionsBitField } from 'discord.js';
import { log } from './log.js';

// ── #uma-store ────────────────────────────────────────────────────────────────

export const UMA_STORE_PERMS = (everyoneId, botId) => [
  {
    id: everyoneId,
    allow: [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.UseApplicationCommands,
    ],
    deny: [
      PermissionsBitField.Flags.SendMessagesInThreads,
      PermissionsBitField.Flags.CreatePublicThreads,
      PermissionsBitField.Flags.CreatePrivateThreads,
    ],
  },
  {
    id: botId,
    allow: [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.AttachFiles,
      PermissionsBitField.Flags.ManageMessages,
      PermissionsBitField.Flags.UseApplicationCommands,
    ],
  },
];

export async function applyUmaStorePerms(channel, guild) {
  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;
  try {
    const perms = UMA_STORE_PERMS(guild.roles.everyone.id, me.id);
    for (const overwrite of perms) {
      await channel.permissionOverwrites.edit(overwrite.id, {
        ...Object.fromEntries((overwrite.allow ?? []).map(f => [f, true])),
        ...Object.fromEntries((overwrite.deny ?? []).map(f => [f, false])),
      });
    }
    log.info(`Applied permissions to #${channel.name} in ${guild.name}`);
  } catch (err) {
    log.warn(`applyUmaStorePerms: ${err.message}`);
  }
}

// ── #uma-results ──────────────────────────────────────────────────────────────

export const UMA_RESULTS_PERMS = (everyoneId, botId) => [
  {
    id: everyoneId,
    allow: [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.UseApplicationCommands,
    ],
    deny: [
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.SendMessagesInThreads,
      PermissionsBitField.Flags.CreatePublicThreads,
      PermissionsBitField.Flags.CreatePrivateThreads,
    ],
  },
  {
    id: botId,
    allow: [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.AttachFiles,
      PermissionsBitField.Flags.ManageMessages,
      PermissionsBitField.Flags.UseApplicationCommands,
    ],
  },
];

export async function applyUmaResultsPerms(channel, guild) {
  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;
  try {
    const perms = UMA_RESULTS_PERMS(guild.roles.everyone.id, me.id);
    for (const overwrite of perms) {
      await channel.permissionOverwrites.edit(overwrite.id, {
        ...Object.fromEntries((overwrite.allow ?? []).map(f => [f, true])),
        ...Object.fromEntries((overwrite.deny ?? []).map(f => [f, false])),
      });
    }
    log.info(`Applied permissions to #${channel.name} in ${guild.name}`);
  } catch (err) {
    log.warn(`applyUmaResultsPerms: ${err.message}`);
  }
}

// ── #chat-history ─────────────────────────────────────────────────────────────

export const CHAT_HISTORY_BOT_PERMS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.AttachFiles,
  PermissionsBitField.Flags.ManageMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
];

export async function applyChatHistoryPerms(channel, guild) {
  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;
  try {
    await channel.permissionOverwrites.edit(me.id, {
      ViewChannel:        true,
      SendMessages:       true,
      EmbedLinks:         true,
      AttachFiles:        true,
      ManageMessages:     true,
      ReadMessageHistory: true,
    });
    log.debug(`applyChatHistoryPerms: repaired bot permissions on #${channel.name} in ${guild.name}`);
  } catch (err) {
    log.warn(`applyChatHistoryPerms: ${err.message}`);
  }
}
