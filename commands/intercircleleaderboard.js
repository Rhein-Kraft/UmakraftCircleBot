import { SlashCommandBuilder } from 'discord.js';
import { getCircleSnapshot } from '../core/uma.js';
import { formatNumber } from '../core/format.js';
import { getConfiguredCircles } from '../core/config.js';
import { deleteAfter } from '../utils/autoDelete.js';
import { renderInterCircleLeaderboard, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';

const SCOPES = [
  { name: 'Daily', value: 'daily' },
  { name: 'Weekly', value: 'weekly' },
  { name: 'Monthly', value: 'monthly' },
];

export const data = new SlashCommandBuilder()
  .setName('intercircleleaderboard')
  .setDescription('Unified cross-circle fan-gain rankings (daily / weekly / monthly)')
  .addStringOption(opt =>
    opt
      .setName('scope')
      .setDescription('Which gain to rank by')
      .setRequired(false)
      .addChoices(...SCOPES)
  )
  .addIntegerOption(opt =>
    opt
      .setName('top')
      .setDescription('How many members to show (10–30, default 10)')
      .setMinValue(10)
      .setMaxValue(30)
      .setRequired(false)
  );

function pickValue(member, scope) {
  if (scope === 'daily') return member.todayGain ?? 0;
  if (scope === 'weekly') return member.weeklyGain ?? 0;
  return member.monthlyGain ?? 0;
}

export async function execute(interaction) {
  await interaction.deferReply();

  const scope = interaction.options.getString('scope') ?? 'daily';
  const top = interaction.options.getInteger('top') ?? 10;
  const scopeLabel = SCOPES.find(s => s.value === scope)?.name ?? 'Daily';
  const today = new Date().toISOString().slice(0, 10);

  const circles = getConfiguredCircles();

  let snapshots;
  try {
    snapshots = await Promise.all(circles.map(c => getCircleSnapshot(c.id)));
  } catch {
    const reply = await interaction.editReply(
      'Failed to fetch circle data — please try again shortly.'
    );
    deleteAfter(reply);
    return;
  }

  const allMembers = snapshots.flatMap((snap, i) =>
    snap.members
      .filter(m => m.hasData && !m.joinDay)
      .map(m => ({ ...m, circleName: circles[i].name }))
  );

  if (allMembers.length === 0) {
    const reply = await interaction.editReply(
      'No data available yet — check back after the next sync.'
    );
    deleteAfter(reply);
    return;
  }

  const sorted = [...allMembers]
    .sort((a, b) => pickValue(b, scope) - pickValue(a, scope))
    .slice(0, top);

  const totalMembers = snapshots.reduce((s, snap) => s + snap.members.length, 0);

  const rows = sorted.map(m => ({
    name: m.trainerName,
    circleName: m.circleName,
    gainRaw: pickValue(m, scope),
    gainStr: formatNumber(pickValue(m, scope)),
  }));

  const buf = await renderInterCircleLeaderboard({
    scope: scopeLabel,
    date: today,
    totalMembers,
    circleCount: circles.length,
    rows,
  });

  const reply = await interaction.editReply({
    files: [bufferToAttachment(buf, buildReportFilename('InterCircleLeaderboard'))],
  });
  deleteAfter(reply);
}
