import { SlashCommandBuilder } from 'discord.js';
import { getCircleSnapshot } from '../core/uma.js';
import { store } from '../core/store.js';
import { formatNumber } from '../core/format.js';
import { getConfiguredCircles } from '../core/config.js';
import { deleteAfter } from '../utils/autoDelete.js';
import { renderTotalFan, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';

function resolveCircle(circleId) {
  const circles = getConfiguredCircles();
  if (!circleId) return circles[0];
  return circles.find(c => c.id === circleId) ?? circles[0];
}

export function buildData() {
  const circles = getConfiguredCircles();
  return new SlashCommandBuilder()
    .setName('total_fan')
    .setDescription("Show a member's lifetime total fan count and rank")
    .addUserOption(opt =>
      opt
        .setName('member')
        .setDescription('Look up another circle member instead of yourself')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('trainer').setDescription('Look up by Uma.moe trainer name').setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('circle')
        .setDescription('Which circle to look up in (default: first circle)')
        .setRequired(false)
        .addChoices(...circles.map(c => ({ name: c.name, value: c.id })))
    );
}

export const data = buildData();

export async function execute(interaction) {
  await interaction.deferReply();

  const targetUser = interaction.options.getUser('member') ?? interaction.user;
  const trainerOption = interaction.options.getString('trainer');
  const circleVal = interaction.options.getString('circle');
  const circle = resolveCircle(circleVal);

  const snapshot = await getCircleSnapshot(circle.id);
  const pool = snapshot.allMembers;

  let member = null;
  if (trainerOption) {
    const needle = trainerOption.toLowerCase();
    member =
      pool.find(m => m.trainerName.toLowerCase() === needle) ||
      pool.find(m => m.trainerName.toLowerCase().includes(needle));
  } else {
    const trainerId = await store.getLinkedViewerId(targetUser.id);
    if (trainerId) member = pool.find(m => m.trainerId === trainerId);
    if (!member) {
      const guildMember = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
      const candidates = [guildMember?.nickname, targetUser.globalName, targetUser.username]
        .filter(Boolean)
        .map(s => s.toLowerCase());
      member = pool.find(m => candidates.includes(m.trainerName.toLowerCase()));
    }
  }

  if (!member) {
    const errReply = await interaction.editReply(
      'Could not find that member. Use `/link` to connect a Discord account to a Uma.moe trainer name.'
    );
    deleteAfter(errReply);
    return;
  }

  const ranked = [...snapshot.members].sort((a, b) => b.totalLifetimeFans - a.totalLifetimeFans);
  const rankIdx = ranked.findIndex(m => m.trainerId === member.trainerId);
  const rank = rankIdx >= 0 ? `#${rankIdx + 1}` : '–';

  const buf = await renderTotalFan({
    trainerName: member.trainerName,
    circleName: snapshot.circle.name,
    rank,
    totalFans: formatNumber(member.totalLifetimeFans),
  });

  const reply = await interaction.editReply({
    files: [bufferToAttachment(buf, buildReportFilename('TotalFan', member.trainerName))],
  });
  deleteAfter(reply);
}
