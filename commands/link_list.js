/**
 * commands/link_list.js
 * ──────────────────────
 * Admin-only: renders a paginated image of all Discord ↔ uma.moe links.
 * Shows Discord display name, trainer name, trainer ID, and circle.
 * Trainers no longer found in any circle are flagged as LEFT.
 */
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { store } from '../core/store.js';
import { getCircleSnapshot } from '../core/uma.js';
import { getConfiguredCircles } from '../core/config.js';
import { log } from '../core/log.js';
import { renderLinkList } from '../utils/reports/linkList.js';
import { bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';
import { jstTime } from '../core/format.js';

const PAGE_SIZE = 25;

export const data = new SlashCommandBuilder()
  .setName('link_list')
  .setDescription('(Admin) Show all linked Discord members and their uma.moe trainer accounts')
  .addIntegerOption(opt =>
    opt
      .setName('page')
      .setDescription('Page number (default: 1)')
      .setMinValue(1)
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const callerMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  if (!callerMember?.permissions.has('ManageGuild')) {
    await interaction.editReply({ content: '🔒 `/link_list` is admin-only.' });
    return;
  }

  const page = interaction.options.getInteger('page') ?? 1;

  // ── Build trainer lookup map from all circles ────────────────────────────
  const circles    = getConfiguredCircles();
  const trainerMap = new Map(); // trainerId -> { trainerName, circleName }

  for (const c of circles) {
    let snapshot;
    try {
      snapshot = await getCircleSnapshot(c.id);
    } catch (err) {
      log.warn(`link_list: failed to fetch circle ${c.id}:`, err.message);
      continue;
    }
    for (const m of snapshot.allMembers) {
      if (!trainerMap.has(String(m.trainerId))) {
        trainerMap.set(String(m.trainerId), {
          trainerName: m.trainerName,
          circleName:  c.name,
        });
      }
    }
  }

  // ── Fetch all links ──────────────────────────────────────────────────────
  const links = await store.getLinks(); // { discordId: trainerId }
  const entries = Object.entries(links); // [[discordId, trainerId], ...]

  if (entries.length === 0) {
    await interaction.editReply({ content: 'No links found — no members have been linked yet.' });
    return;
  }

  // ── Fetch Discord members for display names ──────────────────────────────
  let guildMembers;
  try {
    guildMembers = await interaction.guild.members.fetch();
  } catch (err) {
    log.warn('link_list: failed to fetch guild members:', err.message);
    guildMembers = new Map();
  }

  // ── Build rows sorted by trainer name ───────────────────────────────────
  const allRows = entries.map(([discordId, trainerId]) => {
    const gm          = guildMembers.get(discordId);
    const discordName = gm?.displayName ?? gm?.user?.username ?? `Unknown (${discordId.slice(-4)})`;
    const info        = trainerMap.get(String(trainerId));

    return {
      discordId,
      discordName,
      trainerId:   String(trainerId),
      trainerName: info?.trainerName ?? '—',
      circleName:  info?.circleName  ?? '—',
      status:      info ? 'linked' : 'missing',
    };
  });

  // Sort: active links first (by trainerName), then missing (by discordName)
  allRows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'linked' ? -1 : 1;
    const nameA = a.status === 'linked' ? a.trainerName : a.discordName;
    const nameB = b.status === 'linked' ? b.trainerName : b.discordName;
    return nameA.localeCompare(nameB);
  });

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * PAGE_SIZE;
  const pageRows = allRows.slice(start, start + PAGE_SIZE).map((r, i) => ({
    ...r,
    index: start + i + 1,
  }));

  const missingCount = allRows.filter(r => r.status === 'missing').length;

  // ── Render image ─────────────────────────────────────────────────────────
  let buffer;
  try {
    buffer = await renderLinkList({
      rows:    pageRows,
      total:   allRows.length,
      missing: missingCount,
      date:    `${jstTime()} · Page ${clampedPage}/${totalPages}`,
    });
  } catch (err) {
    log.error('link_list: render failed:', err);
    await interaction.editReply({ content: `❌ Failed to render image: ${err.message}` });
    return;
  }

  const attachment = bufferToAttachment(buffer, buildReportFilename('LinkList'));
  await interaction.editReply({ files: [attachment] });
}
