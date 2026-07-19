// @ts-check
/**
 * commands/joindate.js
 * ────────────────────
 * /joindate [@member] [trainer:name] [list:True]
 *
 * - Default: shows join date for yourself or a mentioned member
 * - list:True: shows full roster — current members + alumni with left dates
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getCircleSnapshot } from '../core/uma.js';
import { getConfiguredCircles } from '../core/config.js';
import { store } from '../core/store.js';
import { formatDateLong } from '../core/format.js';
import { renderJoindateCurrent, renderJoindateAlumni, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Human-readable relative duration from a past ISO date string to now.
 * e.g. "1 year, 3 months" | "2 months" | "18 days"
 * @param {string | null | undefined} isoDate
 * @returns {string | null}
 */
function relativeTime(isoDate) {
  if (!isoDate) return null;
  const then = new Date(isoDate);
  if (isNaN(then.getTime())) return null;

  const diffMs    = Date.now() - then.getTime();
  if (diffMs < 0) return null;

  const totalDays = Math.floor(diffMs / 86_400_000);
  const years     = Math.floor(totalDays / 365);
  const months    = Math.floor((totalDays % 365) / 30);

  const parts = [];
  if (years  > 0) parts.push(`${years} yr${years  > 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} mo`);
  if (parts.length === 0) parts.push(`${totalDays || 1}d`);

  return parts.join(' ');
}

// ── List handler (image) ──────────────────────────────────────────────────────

async function handleList(interaction) {
  const circles = getConfiguredCircles();

  /** @type {{ trainerId: string, trainerName: string, circleName: string, joinedAt: string|null, leftAt: string|null }[]} */
  const allRows = [];

  for (const circle of circles) {
    const storedMap = await store.getMembersForCircle(circle.id);
    for (const [trainerId, info] of Object.entries(storedMap)) {
      allRows.push({
        trainerId,
        trainerName: info.trainerName ?? `Trainer ${trainerId}`,
        circleName:  circle.name,
        joinedAt:    info.joinedAt ?? info.firstSeenAt ?? null,
        leftAt:      info.leftAt ?? null,
      });
    }
  }

  const current = allRows
    .filter(r => !r.leftAt)
    .sort((a, b) => {
      if (!a.joinedAt && !b.joinedAt) return 0;
      if (!a.joinedAt) return 1;
      if (!b.joinedAt) return -1;
      return a.joinedAt.localeCompare(b.joinedAt);
    });

  const alumni = allRows
    .filter(r => !!r.leftAt)
    .sort((a, b) => b.leftAt.localeCompare(a.leftAt));

  // Render both images in parallel
  const [currentBuf, alumniBuf] = await Promise.all([
    renderJoindateCurrent(current),
    renderJoindateAlumni(alumni),
  ]);

  await interaction.editReply({
    files: [bufferToAttachment(currentBuf, buildReportFilename('MembersCurrent'))],
  });
  await interaction.followUp({
    files: [bufferToAttachment(alumniBuf, buildReportFilename('MembersAlumni'))],
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
      const needle = trainerOption.toLowerCase();
      member =
        snapshot.allMembers.find(m => m.trainerName.toLowerCase() === needle) ||
        snapshot.allMembers.find(m => m.trainerName.toLowerCase().includes(needle));
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
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffcc00)
          .setDescription(
            `⚠️ Could not find ${lookupLabel} in the circle data.\n\n` +
            `If this is you, use \`/link\` to connect your Discord account to your Uma.moe trainer.`
          ),
      ],
    });
    return;
  }

  const storedMembers = await store.getMembersForCircle(foundCircleId);
  const stored        = storedMembers[member.trainerId];

  const joinedAt = stored?.joinedAt ?? stored?.firstSeenAt ?? member.joinedAt ?? null;
  const isAlumni = !!stored?.leftAt;

  const embed = new EmbedBuilder()
    .setTitle(`${isAlumni ? '🔖' : '🗓️'}  ${member.trainerName}`)
    .setColor(isAlumni ? 0x9e9e9e : 0x81c784)
    .setThumbnail(targetUser.displayAvatarURL({ size: 64 }));

  if (joinedAt) {
    const duration = relativeTime(joinedAt);
    embed.addFields({
      name: '📅 Joined UmaKraft',
      value: duration
        ? `**${formatDateLong(new Date(joinedAt))}** *(${duration} ago)*`
        : `**${formatDateLong(new Date(joinedAt))}**`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: '📅 Joined UmaKraft',
      value: '_Not yet recorded — data sync pending_',
      inline: false,
    });
  }

  embed.addFields(
    { name: '⭕ Circle',     value: foundCircleName ?? foundCircleId, inline: true },
    { name: '🆔 Trainer ID', value: `\`${member.trainerId}\``,         inline: true },
  );

  if (isAlumni) {
    embed.addFields({
      name:  '📤 Left Circle',
      value: formatDateLong(new Date(stored.leftAt)),
      inline: false,
    });
    embed.setFooter({ text: 'Former member — no longer in the circle.' });
  } else {
    embed.setFooter({ text: 'Active member ✅' });
  }

  embed.setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

// ── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('joindate')
  .setDescription('Show when a circle member joined UmaKraft, or list all members')
  .addBooleanOption(opt =>
    opt
      .setName('list')
      .setDescription('Show the full roster: current members + alumni with left dates')
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
      .setDescription('Look up by Uma.moe trainer name instead of Discord mention')
      .setRequired(false)
  );

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
