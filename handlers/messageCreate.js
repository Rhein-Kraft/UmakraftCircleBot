/**
 * handlers/messageCreate.js
 * ──────────────────────────
 * Slim message router. Delegates heavy logic to:
 *   handlers/onboardingHandler.js     — DM path + #friends linking
 *   handlers/features/behaviourLog.js — behaviour log, media notify, hype reaction
 */

import { Events, PermissionFlagsBits } from 'discord.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';
import { getFriendChannel } from '../core/channels.js';
import { jstTime } from '../core/format.js';
import {
  handleDmMessage,
  handleFriendsChannelMsg,
  handleTrainerId,
  isRestrictedNewMember,
  TRAINER_ID_RE,
  STORE_CMD_RE,
  hasImageAttachment,
} from './onboardingHandler.js';
import {
  sendBehaviour,
  notifyMediaPost,
  maybeHypeReaction,
} from './features/behaviourLog.js';
import {
  isImageReportChannel,
  wrapImagePost,
} from './features/embedWrap.js';

function isAdminMember(member) {
  if (!member) return false;
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

export function register(client) {
  client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    try {
      // ── DM path ───────────────────────────────────────────────────────────
      if (!message.guild) {
        await handleDmMessage(client, message);
        return;
      }

      // ── Guild path ────────────────────────────────────────────────────────
      const guildCfg = await store.getGuildConfig(message.guild.id);

      // #uma-store: trainer ID paste or text command
      if (message.channelId === guildCfg.umaStoreChannelId) {
        await message.delete().catch(() => {});
        const idMatch = message.content.match(TRAINER_ID_RE) || message.content.match(STORE_CMD_RE);
        if (idMatch) await handleTrainerId(message, idMatch[1]);
        return;
      }

      // #uma-results: only admins may post
      if (message.channelId === guildCfg.umaResultsChannelId && !isAdminMember(message.member)) {
        await message.delete().catch(() => {});
        return;
      }

      // #leaderboard and #announcement: bot-only
      if (
        message.channelId === guildCfg.leaderboardChannelId ||
        message.channelId === guildCfg.announcementChannelId
      ) {
        await message.delete().catch(() => {});
        return;
      }

      // ── New-member linking restriction ─────────────────────────────────────
      if (!isAdminMember(message.member)) {
        const restricted = await isRestrictedNewMember(message.author.id, message.guild.id);

        if (restricted) {
          const friendCh    = await getFriendChannel(message.guild).catch(() => null);
          const isInFriends = friendCh && message.channelId === friendCh.id;

          if (isInFriends) {
            // Allow posting in #friends — try to link them; early-return only on profile_ui
            const shouldReturn = await handleFriendsChannelMsg(message);
            if (shouldReturn) return;
            // fall through to behaviour log / media notification
          } else {
            // Any other channel — delete and DM the member
            await message.delete().catch(() => {});
            await message.author.send(
              `🔒 You need to link your account before posting in other channels.\n\n` +
              `Post your **Trainer ID number** (e.g. \`612 856 830 731\`) in ` +
              `${friendCh ? `<#${friendCh.id}>` : '**#friend-channel**'} ` +
              `or DM me directly to get linked! 🏇`
            ).catch(() => {});
            return;
          }
        }
      }

      // ── #image-report: wrap images / GIFs as bot embeds ──────────────────
      if (isImageReportChannel(message.channel)) {
        sendBehaviour(
          message.guild,
          `🖼️ **${message.member?.displayName ?? message.author.username}** posted in #${message.channel.name} · ${jstTime()}`
        ).catch(() => {});
        await wrapImagePost(message);
        return;
      }

      // ── Regular message processing ────────────────────────────────────────

      if (hasImageAttachment(message)) {
        await notifyMediaPost(message);
      }

      const isReply     = !!message.reference;
      const displayName = message.member?.displayName ?? message.author.username;
      const action      = isReply ? 'replied in' : 'posted in';
      sendBehaviour(
        message.guild,
        `💬 **${displayName}** ${action} #${message.channel.name} · ${jstTime()}`
      ).catch(() => {});

      maybeHypeReaction(message).catch(() => {});

    } catch (err) {
      log.warn('messageCreate handler error:', err.message);
    }
  });

  // ── Message delete ──────────────────────────────────────────────────────────
  client.on(Events.MessageDelete, async message => {
    if (!message.guild || message.author?.bot) return;
    try {
      const displayName = message.member?.displayName ?? message.author?.username ?? 'Unknown';
      await sendBehaviour(
        message.guild,
        `🗑️ **${displayName}** deleted a message in #${message.channel?.name ?? 'unknown'} · ${jstTime()}`
      );
    } catch { /* silent */ }
  });

  // ── Message edit ────────────────────────────────────────────────────────────
  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    try {
      const displayName = newMessage.member?.displayName ?? newMessage.author?.username ?? 'Unknown';
      await sendBehaviour(
        newMessage.guild,
        `✏️ **${displayName}** edited a message in #${newMessage.channel?.name ?? 'unknown'} · ${jstTime()}`
      );
    } catch { /* silent */ }
  });

  // ── Reaction add ────────────────────────────────────────────────────────────
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch().catch(() => {});
      if (!reaction.message.guild) return;
      const guild       = reaction.message.guild;
      const member      = await guild.members.fetch(user.id).catch(() => null);
      const displayName = member?.displayName ?? user.username ?? 'Unknown';
      const emoji       = reaction.emoji.id
        ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      await sendBehaviour(
        guild,
        `👍 **${displayName}** reacted ${emoji} in #${reaction.message.channel?.name ?? 'unknown'} · ${jstTime()}`
      );
    } catch { /* silent */ }
  });
}
