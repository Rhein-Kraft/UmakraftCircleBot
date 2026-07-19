// @ts-check
/**
 * commands/memberlist.js
 * ──────────────────────
 * /memberlist [@member] [trainer:name] [list:True]
 *
 * - Default: shows join date for yourself or a mentioned member
 * - list:True: full roster from PastHistoryTrainer.md — active + former members
 *
 * Replaces /joindate. Join-date single-lookup behaviour is unchanged.
 * List mode now sources data from PastHistoryTrainer.md via getAllPastProfiles()
 * so former members are always included and no rows are left blank.
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getCircleSnapshot } from '../core/uma.js';
import { getConfiguredCircles } from '../core/config.js';
import { store } from '../core/store.js';
import { renderJoindateCurrent, renderJoindateAlumni, renderMemberCard, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';
import { getAllPastProfiles } from '../utils/pastHistoryReader.js';
import { deleteAfter } from '../utils/autoDelete.js';
import { getDiscordIdByViewerId } from '../fantracking/links/db.js';

// ── List handler ──────────────────────────────────────────────────────────────

async function handleList(interaction) {
  const circles    = getConfiguredCircles();
  const circleName = circles[0]?.name ?? 'UmaKraft';

  const all = getAllPastProfiles();

  // Active members — must have a join date (skip unknowns)
  const current = all
    .filter(p => p.isActive && p.joined)
    .map(p => ({
      trainerId:   p.trainerId,
      trainerName: p.name,
      circleName,
      joinedAt:    `${p.joined}-01`,
    }))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));

  // Former members — include even if joined is unknown, as long as we have
  // at least a last-active month or a name to display
  const former = all
    .filter(p => !p.isActive && p.name)
    .map(p => ({
      trainerId:       p.trainerId,
      trainerName:     p.name,
      circleName,
      joinedAt:        p.joined ? `${p.joined}-01` : null,
      lastActiveMonth: p.lastActiveMonth ?? null,
    }))
    .sort((a, b) => {
      // Newest last-active month first; unknown last-active goes to the bottom
      const am = a.lastActiveMonth ?? '';
      const bm = b.lastActiveMonth ?? '';
      return bm.localeCompare(am);
    });

  const [currentBuf, formerBuf] = await Promise.all([
    renderJoindateCurrent(current),
    renderJoindateAlumni(former),
  ]);

  await interaction.editReply({
    files: [bufferToAttachment(currentBuf, buildReportFilename('MembersCurrent'))],
  });
  await interaction.followUp({
    files: [bufferToAttachment(formerBuf, buildReportFilename('MembersFormer'))],
    ephemeral: false,
  });
}

// ── Single member handler ─────────────────────────────────────────────────────

async function handleSingle(interaction) {
  const targetUser    = interaction.options.getUser('member') ?? interaction.user;
  const trainerOption = interaction.options.getString('trainer');
  const circles       = getConfiguredCircles();

  let member          = null;
  let foundCircleId   = null;
  let foundCircleName = null;
  let lookupLabel     = '';

  for (const circle of circles) {
    let snapshot;
    try {
      snapshot = await getCircleSnapshot(circle.id);
    } catch {
      continue;
    }

    if (trainerOption) {
      const isId = /^\d{6,}$/.test(trainerOption.trim());
      if (isId) {
        member = snapshot.allMembers.find(m => String(m.trainerId) === trainerOption.trim());
      }
      if (!member) {
        const needle = trainerOption.toLowerCase();
        member =
          snapshot.allMembers.find(m => m.trainerName.toLowerCase() === needle) ||
          snapshot.allMembers.find(m => m.trainerName.toLowerCase().includes(needle));
      }
      lookupLabel = `trainer "${trainerOption}"`;
    } else {
      const trainerId = await store.getLinkedViewerId(targetUser.id);
      if (trainerId) {
        member = snapshot.allMembers.find(m => m.trainerId === trainerId);
      }
      if (!member) {
        const guildMember = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
        const candidates  = [guildMember?.nickname, targetUser.globalName, targetUser.username]
          .filter(Boolean)
          .map(s => s.toLowerCase());
        member = snapshot.allMembers.find(m => candidates.includes(m.trainerName.toLowerCase()));
      }
      lookupLabel = `<@${targetUser.id}>`;
    }

    if (member) {
      foundCircleId   = circle.id;
      foundCircleName = circle.name;
      break;
    }
  }

  if (!member) {
    const reply = await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffcc00)
          .setDescription(
            `⚠️ Could not find ${lookupLabel} in the circle data.\n\n` +
            `If this is you, use \`/link\` to connect your Discord account to your Uma.moe trainer.`
          ),
      ],
    });
    deleteAfter(reply);
    return;
  }

  const storedMembers = await store.getMembersForCircle(foundCircleId);
  const stored        = storedMembers[member.trainerId];

  const joinedAt = stored?.joinedAt ?? stored?.firstSeenAt ?? member.joinedAt ?? null;
  const isAlumni = !!stored?.leftAt;

  // ── Resolve a profile picture for the *matched trainer* ──────────────────
  // Prefer the Discord account actually linked to this trainer (works even
  // when the lookup was by trainer name / a different mention), falling
  // back to the mentioned/self Discord user when no link exists.
  let avatarUrl = null;
  try {
    const linkedDiscordId = getDiscordIdByViewerId(member.trainerId);
    if (linkedDiscordId) {
      const linkedUser = await interaction.client.users.fetch(linkedDiscordId).catch(() => null);
      if (linkedUser) avatarUrl = linkedUser.displayAvatarURL({ size: 128, extension: 'png' });
    }
    if (!avatarUrl && !trainerOption) {
      avatarUrl = targetUser.displayAvatarURL({ size: 128, extension: 'png' });
    }
  } catch {
    avatarUrl = null;
  }

  const buffer = await renderMemberCard({
    trainerId:   member.trainerId,
    trainerName: member.trainerName,
    isActive:    !isAlumni,
    circleName:  foundCircleName ?? foundCircleId,
    joinedAt,
    leftAt:      stored?.leftAt ?? null,
    avatarUrl,
  });

  const reply = await interaction.editReply({
    files: [bufferToAttachment(buffer, buildReportFilename('Member'))],
  });
  deleteAfter(reply);
}

// ── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('memberlist')
  .setDescription('Show when a circle member joined UmaKraft, or list all members including former ones')
  .addBooleanOption(opt =>
    opt
      .setName('list')
      .setDescription('Show the full roster: active members + former members with last active date')
      .setRequired(false)
  )
  .addUserOption(opt =>
    opt
      .setName('member')
      .setDescription('Look up another circle member (leave blank to check yourself)')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt
      .setName('trainer')
      .setDescription('Pick a trainer from the list (or type to search)')
      .setRequired(false)
      .setAutocomplete(true)
  );

// ── Autocomplete handler ──────────────────────────────────────────────────────

export async function autocomplete(interaction) {
  const partial = (interaction.options.getFocused() ?? '').toLowerCase().trim();
  const circles = getConfiguredCircles();

  const results = [];
  const seen    = new Set();

  for (const { id: circleId, name: circleName } of circles) {
    let snapshot;
    try { snapshot = await getCircleSnapshot(circleId); } catch { continue; }

    for (const m of snapshot.allMembers) {
      if (seen.has(m.trainerId)) continue;
      if (partial && !m.trainerName.toLowerCase().includes(partial)) continue;

      seen.add(m.trainerId);

      const label = circles.length > 1
        ? `[${circleName}] ${m.trainerName}`
        : m.trainerName;

      results.push({ name: label, value: String(m.trainerId) });
      if (results.length >= 25) break;
    }
    if (results.length >= 25) break;
  }

  await interaction.respond(results);
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const showList = interaction.options.getBoolean('list') ?? false;

  if (showList) {
    await handleList(interaction);
  } else {
    await handleSingle(interaction);
  }
}
