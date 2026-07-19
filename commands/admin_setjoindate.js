import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getCircleSnapshot, buildSnapshot } from '../core/uma.js';
import { getConfiguredCircles } from '../core/config.js';
import { store } from '../core/store.js';
import { formatDateLong } from '../core/format.js';
import { log } from '../core/log.js';

export const data = new SlashCommandBuilder()
  .setName('admin_setjoindate')
  .setDescription("Manually override a circle member's join date")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(opt =>
    opt
      .setName('date')
      .setDescription('Join date in YYYY-MM-DD format (e.g. 2025-07-23)')
      .setRequired(true)
  )
  .addUserOption(opt =>
    opt
      .setName('member')
      .setDescription('The Discord member to update (leave blank to use trainer name)')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt
      .setName('trainer')
      .setDescription('Uma.moe trainer name to update (used if no Discord member is specified)')
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const dateStr = interaction.options.getString('date', true).trim();
  const targetUser = interaction.options.getUser('member');
  const trainerOption = interaction.options.getString('trainer');

  // Validate date format YYYY-MM-DD.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    await interaction.editReply(
      'Invalid date format. Please use **YYYY-MM-DD** (e.g. `2025-07-23`).'
    );
    return;
  }
  const parsed = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(parsed.getTime())) {
    await interaction.editReply(`"${dateStr}" is not a valid calendar date.`);
    return;
  }
  if (parsed > new Date()) {
    await interaction.editReply('The join date cannot be in the future.');
    return;
  }

  // Search all configured circles for the target member.
  const circles = getConfiguredCircles();
  let member = null;
  let foundCircleId = null;

  for (const circle of circles) {
    let snapshot;
    try {
      snapshot = await getCircleSnapshot(circle.id);
    } catch {
      continue;
    }

    const pool = snapshot.allMembers;
    let candidate = null;

    if (trainerOption) {
      const needle = trainerOption.toLowerCase();
      candidate =
        pool.find(m => m.trainerName.toLowerCase() === needle) ||
        pool.find(m => m.trainerName.toLowerCase().includes(needle));
    } else if (targetUser) {
      const trainerId = await store.getLinkedViewerId(targetUser.id);
      if (trainerId) candidate = pool.find(m => m.trainerId === trainerId);
      if (!candidate) {
        const guildMember = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
        const candidates = [guildMember?.nickname, targetUser.globalName, targetUser.username]
          .filter(Boolean)
          .map(s => s.toLowerCase());
        candidate = pool.find(m => candidates.includes(m.trainerName.toLowerCase()));
      }
    } else {
      // Default to the command caller.
      const trainerId = await store.getLinkedViewerId(interaction.user.id);
      if (trainerId) candidate = pool.find(m => m.trainerId === trainerId);
    }

    if (candidate) {
      member = candidate;
      foundCircleId = circle.id;
      break;
    }
  }

  if (!member) {
    await interaction.editReply(
      'Could not find that member in the circle data. ' +
        'Try specifying their exact uma.moe trainer name with the `trainer` option.'
    );
    return;
  }

  const newJoinedAt = parsed.toISOString();
  await store.upsertMemberForCircle(foundCircleId, member.trainerId, { joinedAt: newJoinedAt });
  log.info(
    `admin_setjoindate: ${member.trainerName} (${member.trainerId}) circle=${foundCircleId} ` +
      `joinedAt → ${newJoinedAt} (set by ${interaction.user.tag})`
  );

  // Rebuild the snapshot cache for the affected circle so commands reflect the change immediately.
  try {
    await buildSnapshot(foundCircleId);
  } catch (err) {
    log.warn('admin_setjoindate: snapshot rebuild failed (non-fatal):', err.message);
  }

  const embed = new EmbedBuilder()
    .setTitle('Join Date Updated')
    .setColor(0x81c784)
    .setDescription(
      `**${member.trainerName}**'s circle join date has been set to **${formatDateLong(parsed)}**.`
    )
    .setFooter({ text: `Updated by ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
