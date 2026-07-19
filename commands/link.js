// @ts-check
/**
 * commands/link.js
 * ────────────────
 * Link a Discord account to an Uma.moe trainer record.
 *
 * Options (all optional except you must supply trainer OR trainer_id):
 *   circle     — any configured circle (choices from registry; leave blank to search all)
 *   trainer    — autocomplete: live list of active members from the circle
 *   trainer_id — fast path: numeric uma.moe trainer ID (skips name lookup)
 *   member     — (Admin) link another Discord user instead of yourself
 *
 * Autocomplete value:
 *   Each trainer choice carries the trainerId as its value so the execute
 *   handler receives an ID directly when a user picks from the list.
 *   If someone submits without selecting (free-text), the input is treated
 *   as a trainer name and resolved by fuzzy match.
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getCircleSnapshot } from '../core/uma.js';
import { store } from '../core/store.js';
import { getConfiguredCircles } from '../core/config.js';
import { isProtectedLink } from '../db/linksDb.js';
import { log } from '../core/log.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve which circles to search based on the `circle` option value.
 * circleVal is now a circle ID string (or null = search all).
 * @param {string | null} circleVal
 * @returns {{ id: string, name: string }[]}
 */
function resolveCircles(circleVal) {
  const all = getConfiguredCircles();
  if (!circleVal) return all;
  const match = all.find(c => c.id === circleVal);
  return match ? [match] : all;
}

// ── Command definition ────────────────────────────────────────────────────────

export function buildData() {
  const circles = getConfiguredCircles();
  return new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to your Uma.moe trainer')
    .addStringOption(opt =>
      opt
        .setName('circle')
        .setDescription('Which circle to search in (leave blank to search all)')
        .setRequired(false)
        .addChoices(...circles.map(c => ({ name: c.name, value: c.id })))
    )
    .addStringOption(opt =>
      opt
        .setName('trainer')
        .setDescription('Select your trainer name from the list')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName('trainer_id')
        .setDescription('Fast path: enter your uma.moe trainer ID directly')
        .setRequired(false)
    )
    .addUserOption(opt =>
      opt
        .setName('member')
        .setDescription('(Admin) Link this Discord member instead of yourself')
        .setRequired(false)
    );
}

export const data = buildData();

// ── Autocomplete handler ──────────────────────────────────────────────────────

/**
 * Called live as the user types in the `trainer` field.
 * Returns up to 25 active members from the selected circle(s), filtered by
 * whatever the user has typed so far.
 * The value carried by each choice is the trainerId — execute() receives it
 * directly when the user picks from the list.
 */
export async function autocomplete(interaction) {
  const circleVal = interaction.options.getString('circle');
  const partial = (interaction.options.getFocused() ?? '').toLowerCase().trim();
  const circles = resolveCircles(circleVal);

  /** @type {{ name: string, value: string }[]} */
  const results = [];
  const seen = new Set();

  for (const { id: circleId, name: circleName } of circles) {
    let snapshot;
    try {
      snapshot = await getCircleSnapshot(circleId);
    } catch {
      continue;
    }

    for (const m of snapshot.members) {
      if (seen.has(m.trainerId)) continue;
      if (partial && !m.trainerName.toLowerCase().includes(partial)) continue;

      seen.add(m.trainerId);

      const label =
        circles.length > 1
          ? `[${circleName}] ${m.trainerName}`
          : m.trainerName;

      results.push({ name: label, value: String(m.trainerId) });
      if (results.length >= 25) break;
    }

    if (results.length >= 25) break;
  }

  await interaction.respond(results);
}

// ── Execute handler ───────────────────────────────────────────────────────────

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const circleVal    = interaction.options.getString('circle');
  const trainerInput = interaction.options.getString('trainer');
  const viewerInput  = interaction.options.getString('trainer_id');
  const targetUser   = interaction.options.getUser('member') ?? interaction.user;

  // ── Admin-only command ────────────────────────────────────────────────────
  const callerMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  if (!callerMember?.permissions.has('ManageGuild')) {
    await interaction.editReply({
      content:
        '🔒 `/link` is admin-only.\n\n' +
        'To link your own account, DM me your **Trainer ID** (e.g. `612 856 830 731`) ' +
        'or send your **Trainer Card** screenshot — I\'ll handle the rest!',
    });
    return;
  }

  // ── Must supply trainer OR trainer_id ────────────────────────────────────
  if (!trainerInput && !viewerInput) {
    await interaction.editReply({
      content: 'Please provide either a **trainer name** (select from the list) or a **trainer ID**.',
    });
    return;
  }

  const circles = resolveCircles(circleVal);
  let found = null;

  // ── Fast path: trainer_id field ──────────────────────────────────────────
  if (viewerInput) {
    const id = viewerInput.trim();
    for (const { id: circleId } of circles) {
      let snapshot;
      try { snapshot = await getCircleSnapshot(circleId); } catch { continue; }
      const match =
        snapshot.members.find(m => String(m.trainerId) === id) ||
        snapshot.allMembers.find(m => String(m.trainerId) === id);
      if (match) { found = match; break; }
    }

    if (!found) {
      await interaction.editReply({
        content: `No active trainer with viewer ID \`${viewerInput.trim()}\` was found in the circle(s).`,
      });
      return;
    }
  }

  // ── Trainer field (autocomplete selection OR free-text fallback) ──────────
  if (!found && trainerInput) {
    const val = trainerInput.trim();
    const isId = /^\d{6,}$/.test(val);

    for (const { id: circleId } of circles) {
      let snapshot;
      try { snapshot = await getCircleSnapshot(circleId); } catch { continue; }

      if (isId) {
        found = snapshot.members.find(m => String(m.trainerId) === val);
      } else {
        const lower = val.toLowerCase();
        found =
          snapshot.members.find(m => m.trainerName.toLowerCase() === lower) ||
          snapshot.members.find(m => m.trainerName.toLowerCase().includes(lower));
      }

      if (found) break;
    }

    if (!found) {
      const hint = isId
        ? `No active trainer with ID \`${val}\` found in the circle(s).`
        : `No active trainer matching **${val}** found. Make sure they're currently in the circle.`;
      await interaction.editReply({ content: hint });
      return;
    }
  }

  // ── Block re-linking a protected account ──────────────────────────────────
  if (isProtectedLink(targetUser.id)) {
    await interaction.editReply({
      content: '🔒 This account has a permanently protected link and cannot be re-linked.',
    });
    return;
  }

  // ── Persist the link ──────────────────────────────────────────────────────
  try {
    await store.setLink(targetUser.id, found.trainerId);
  } catch (err) {
    log.error('link: failed to save link:', err);
    await interaction.editReply({ content: 'Failed to save the link — please try again.' });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Linked!')
    .setColor(0x81c784)
    .setDescription(
      `<@${targetUser.id}> is now linked to **${found.trainerName}**\n` +
      `Viewer ID: \`${found.trainerId}\``
    );

  await interaction.editReply({ embeds: [embed] });
}
