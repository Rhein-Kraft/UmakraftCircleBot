import { SlashCommandBuilder } from 'discord.js';
import { getCircleSnapshot } from '../core/uma.js';
import { formatNumber } from '../core/format.js';
import { getConfiguredCircles } from '../core/config.js';
import { deleteAfter } from '../utils/autoDelete.js';
import { renderCircleTotals, renderInfoCard, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';

function resolveCircle(circleId) {
  const circles = getConfiguredCircles();
  if (!circleId) return circles[0];
  return circles.find(c => c.id === circleId) ?? circles[0];
}

export function buildData() {
  const circles = getConfiguredCircles();
  return new SlashCommandBuilder()
    .setName('total_circlefan_gain')
    .setDescription('Total accumulated fan gain of the entire circle this month')
    .addStringOption(opt =>
      opt
        .setName('circle')
        .setDescription('Which circle to show (default: first circle)')
        .setRequired(false)
        .addChoices(...circles.map(c => ({ name: c.name, value: c.id })))
    );
}

export const data = buildData();

export async function execute(interaction) {
  await interaction.deferReply();

  const circleVal = interaction.options.getString('circle');
  const circle = resolveCircle(circleVal);

  let snapshot;
  try {
    snapshot = await getCircleSnapshot(circle.id);
  } catch {
    const reply = await interaction.editReply(
      '⚠️ Circle data is temporarily unavailable — please try again shortly.'
    );
    deleteAfter(reply);
    return;
  }
  const { tallyStarted } = snapshot;
  const today = new Date().toISOString().slice(0, 10);

  if (!tallyStarted) {
    const buf = await renderInfoCard({
      title: `${snapshot.circle.name} — Circle Totals`,
      body: 'Tally Not Started\n\nNo fan-gain data has been recorded yet for this month. Circle totals will appear once the tally begins.',
      footer: `${snapshot.members.length} active members · members who left are excluded`,
      accent: '#90a4ae',
    });
    const reply = await interaction.editReply({
      files: [bufferToAttachment(buf, buildReportFilename('CircleTotals'))],
    });
    deleteAfter(reply);
    return;
  }

  const withData = snapshot.members.filter(m => m.hasData && !m.joinDay);
  const pendingCount = snapshot.members.length - withData.length;

  const totalDaily = withData.reduce((s, m) => s + m.todayGain, 0);
  const totalWeekly = withData.reduce((s, m) => s + m.weeklyGain, 0);
  const totalMonthly = withData.reduce((s, m) => s + m.monthlyGain, 0);
  const totalLifetime = snapshot.members.reduce((s, m) => s + m.totalLifetimeFans, 0);

  const buf = await renderCircleTotals({
    circleName: snapshot.circle.name,
    date: today,
    totalDaily: formatNumber(totalDaily),
    totalWeekly: formatNumber(totalWeekly),
    totalMonthly: formatNumber(totalMonthly),
    totalLifetime: formatNumber(totalLifetime),
    activeMembers: snapshot.members.length,
    pendingCount,
  });

  const reply = await interaction.editReply({
    files: [bufferToAttachment(buf, buildReportFilename('CircleTotals'))],
  });
  deleteAfter(reply);
}
