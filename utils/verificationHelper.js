// @ts-check
/**
 * utils/verificationHelper.js
 * ───────────────────────────
 * Shared verification utilities used by both messageCreate and interactionCreate
 * handlers.
 *
 * Exports:
 *   resolveAndLink        — link by trainer ID (circle membership check)
 *   resolveAndLinkByName  — link by trainer name (case-insensitive uma.moe lookup)
 *   notifyOwnerPending    — DM the guild owner with Accept/Reject buttons
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getCircleSnapshot, buildSnapshot } from '../core/uma.js';
import { getConfiguredCircles } from '../core/config.js';
import { store } from '../core/store.js';
import { log } from '../core/log.js';

// ── Link by trainer ID ─────────────────────────────────────────────────────

/**
 * Verify circle membership by trainer ID and persist the link.
 * On cache miss, retries once with a live API fetch.
 * @param {string} discordId
 * @param {string} rawId
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, trainerName?: string, trainerId?: string, circleName?: string }>}
 */
export async function resolveAndLink(discordId, rawId, { forceRefresh = false } = {}) {
  const trainerId = rawId.replace(/\s+/g, '');
  const circles = getConfiguredCircles();

  for (const circle of circles) {
    let snapshot;
    try {
      snapshot = forceRefresh
        ? await buildSnapshot(circle.id)
        : await getCircleSnapshot(circle.id);
    } catch { continue; }

    const member =
      snapshot.members.find(m => String(m.trainerId) === trainerId) ||
      snapshot.allMembers?.find(m => String(m.trainerId) === trainerId);

    if (member) {
      await store.setLink(discordId, trainerId);
      return { ok: true, trainerName: member.trainerName, trainerId, circleName: circle.name };
    }
  }

  if (!forceRefresh) {
    log.info(`resolveAndLink: ${trainerId} not in cache — retrying with live fetch`);
    return resolveAndLink(discordId, rawId, { forceRefresh: true });
  }

  return { ok: false };
}

// ── Link by trainer name (case-insensitive uma.moe lookup) ─────────────────

/**
 * Verify circle membership by matching trainer name against all circle members
 * (case-insensitive). Links to the matched member's trainer ID if found.
 * On cache miss, retries once with a live API fetch.
 * @param {string} discordId
 * @param {string} trainerName
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, trainerName?: string, trainerId?: string, circleName?: string }>}
 */
export async function resolveAndLinkByName(discordId, trainerName, { forceRefresh = false } = {}) {
  if (!trainerName) return { ok: false };
  const needle = trainerName.toLowerCase().trim();
  const circles = getConfiguredCircles();

  for (const circle of circles) {
    let snapshot;
    try {
      snapshot = forceRefresh
        ? await buildSnapshot(circle.id)
        : await getCircleSnapshot(circle.id);
    } catch { continue; }

    const allMembers = [
      ...(snapshot.members ?? []),
      ...(snapshot.allMembers ?? []),
    ];

    const member = allMembers.find(
      m => m.trainerName && m.trainerName.toLowerCase().trim() === needle
    );

    if (member) {
      await store.setLink(discordId, String(member.trainerId));
      return {
        ok: true,
        trainerName: member.trainerName,
        trainerId: String(member.trainerId),
        circleName: circle.name,
      };
    }
  }

  if (!forceRefresh) {
    log.info(`resolveAndLinkByName: "${trainerName}" not in cache — retrying with live fetch`);
    return resolveAndLinkByName(discordId, trainerName, { forceRefresh: true });
  }

  return { ok: false };
}

// ── DM the guild owner with Accept/Reject buttons ──────────────────────────

/**
 * Send the guild owner a DM containing the submitted card and two buttons:
 * ✅ Accept  /  ❌ Reject
 *
 * Button custom IDs: `uma_verify_accept:USERID:GUILDID` / `uma_verify_reject:USERID:GUILDID`
 *
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').User} user       the member who submitted the card
 * @param {{ trainerName?: string|null, trainerId?: string|null, cardUrl?: string|null, displayName: string }} details
 */
export async function notifyOwnerPending(guild, user, { trainerName, trainerId, cardUrl, displayName }) {
  let owner;
  try {
    owner = await guild.fetchOwner();
  } catch (err) {
    log.warn(`notifyOwnerPending: could not fetch guild owner: ${err.message}`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🔔 Trainer Card — Pending Review')
    .setDescription(
      `**${displayName}** (<@${user.id}>) submitted a trainer card but their name ` +
      `could not be matched to any member in **${guild.name}** on uma.moe.\n\n` +
      `Please review and accept or reject their application below.`
    )
    .addFields(
      { name: 'Discord Name', value: displayName, inline: true },
      { name: 'Trainer Name (card)', value: trainerName || '_Not extracted_', inline: true },
      { name: 'Trainer ID (card)', value: trainerId || '_Not extracted_', inline: true },
      { name: 'Guild', value: guild.name, inline: false },
    )
    .setColor(0xFFAA00)
    .setTimestamp();

  if (cardUrl) embed.setImage(cardUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`uma_verify_accept:${user.id}:${guild.id}`)
      .setLabel('✅ Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`uma_verify_reject:${user.id}:${guild.id}`)
      .setLabel('❌ Reject')
      .setStyle(ButtonStyle.Danger),
  );

  await owner.user.send({ embeds: [embed], components: [row] }).catch(err => {
    log.warn(`notifyOwnerPending: failed to DM owner ${owner.user.tag}: ${err.message}`);
  });

  log.info(
    `notifyOwnerPending: sent pending review DM to ${owner.user.tag} ` +
    `for ${user.tag} (name: ${trainerName ?? 'n/a'}, id: ${trainerId ?? 'n/a'})`
  );
}
