import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getCircleSnapshot } from '../core/uma.js';
import { formatNumber } from '../core/format.js';
import { config, getConfiguredCircles } from '../core/config.js';
import { store } from '../core/store.js';
import { resolveQuota } from '../core/quotaKeys.js';
import { deleteAfter } from '../utils/autoDelete.js';
import {
  renderCircleMaster,
  renderCircleMasterDay,
  renderInfoCard,
  bufferToAttachment,
  buildReportFilename,
} from '../utils/imageReport.js';
import { checkMilestones } from '../tasks/milestones.js';
import { regeneratePastHistoryMd } from '../umamoe/history/generatePastHistoryMd.js';
import { reloadPastHistory } from '../umamoe/history/pastHistoryReader.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function resolveCircle(circleId) {
  const circles = getConfiguredCircles();
  if (!circleId) return circles[0];
  return circles.find(c => c.id === circleId) ?? circles[0];
}

export function buildData() {
  const circles = getConfiguredCircles();
  return new SlashCommandBuilder()
    .setName('circle_master')
    .setDescription('Daily Top 3 contributors for the current month, day-by-day')
    .addIntegerOption(opt =>
      opt
        .setName('day')
        .setDescription('Show only this specific day (1–31). Omit to see all days.')
        .setMinValue(1)
        .setMaxValue(31)
    )
    .addStringOption(opt =>
      opt
        .setName('circle')
        .setDescription('Which circle to show (default: first circle)')
        .setRequired(false)
        .addChoices(...circles.map(c => ({ name: c.name, value: c.id })))
    )
    .addBooleanOption(opt =>
      opt
        .setName('trigger_milestones')
        .setDescription('[Admin] Immediately run the milestone check for the selected circle.')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt
        .setName('rebuild_history')
        .setDescription('[Admin] Rebuild PastHistoryTrainer.md from live uma.moe data + CSVs.')
        .setRequired(false)
    );
}

export const data = buildData();

export async function execute(interaction) {
  const isTrigger = interaction.options.getBoolean('trigger_milestones') ?? false;
  const isRebuildHistory = interaction.options.getBoolean('rebuild_history') ?? false;
  await interaction.deferReply({ ephemeral: isTrigger || isRebuildHistory });

  const circleVal = interaction.options.getString('circle');
  const circle = resolveCircle(circleVal);

  if (isTrigger) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply('❌ You need Administrator permission to trigger milestones manually.');
      return;
    }
    await interaction.editReply(`⏳ Running milestone check for **${circle.name}**…`);
    try {
      await checkMilestones(interaction.client, circle.id);
      await interaction.editReply(`✅ Milestone check complete for **${circle.name}**. Any eligible milestones have been fired.`);
    } catch (err) {
      await interaction.editReply(`❌ Milestone check failed: ${err.message}`);
    }
    return;
  }

  if (isRebuildHistory) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply('❌ You need Administrator permission to rebuild history.');
      return;
    }
    await interaction.editReply('⏳ Rebuilding PastHistoryTrainer.md from uma.moe + CSVs…');
    try {
      await regeneratePastHistoryMd();
      reloadPastHistory();
      await interaction.editReply('✅ PastHistoryTrainer.md rebuilt. The `/profile` and `/memberlist` commands now reflect the latest data.');
    } catch (err) {
      await interaction.editReply(`❌ Rebuild failed: ${err.message}`);
    }
    return;
  }

  const snapshot = await getCircleSnapshot(circle.id);
  const today = new Date();
  const monthName = MONTH_NAMES[today.getUTCMonth()];
  const year = today.getUTCFullYear();
  const dateStr = today.toISOString().slice(0, 10);

  // Resolve quotas so gain cells can be colored green (met) / red (below)
  // per the fan-gain color standard, instead of arbitrary fixed thresholds.
  const guildCfg    = interaction.guildId
    ? await store.getGuildConfig(interaction.guildId).catch(() => ({}))
    : {};
  const monthlyReq  = resolveQuota(guildCfg, circle.id, 'monthly', config.monthlyRequirement);
  const dailyReq    = resolveQuota(guildCfg, circle.id, 'daily',   config.dailyRequirement);

  if (!snapshot.tallyStarted) {
    const buf = await renderInfoCard({
      title: `${snapshot.circle.name} — Circle Master (${monthName} ${year})`,
      body: `No Circle Master data yet — the ${monthName} ${year} tally has not started. Check back once fan gains have been recorded.`,
      footer: `${snapshot.members.length} active members`,
      accent: '#90a4ae',
    });
    const reply = await interaction.editReply({
      files: [bufferToAttachment(buf, buildReportFilename('CircleMaster'))],
    });
    deleteAfter(reply);
    return;
  }

  const lastDayWithData = snapshot.latestIdx + 1;
  const dayOption = interaction.options.getInteger('day');

  if (dayOption !== null) {
    const idx = dayOption - 1;
    const dayContribs = snapshot.members
      .map(m => ({ name: m.trainerName, gain: m.deltas[idx] ?? 0 }))
      .filter(m => m.gain > 0)
      .sort((a, b) => b.gain - a.gain);

    if (dayContribs.length === 0) {
      const reply = await interaction.editReply(
        `No daily contribution data available for Day ${dayOption}.`
      );
      deleteAfter(reply);
      return;
    }

    const totalGain = dayContribs.reduce((sum, c) => sum + c.gain, 0);

    const buf = await renderCircleMasterDay({
      circleName: snapshot.circle.name,
      monthName,
      year,
      day: dayOption,
      date: dateStr,
      totalGain: formatNumber(totalGain),
      rows: dayContribs.map((c, i) => ({
        rank: i + 1,
        name: c.name,
        gain: formatNumber(c.gain),
        pct: dailyReq > 0 ? Math.round((c.gain / dailyReq) * 100) : 0,
      })),
    });

    const reply = await interaction.editReply({
      files: [bufferToAttachment(buf, buildReportFilename('CircleMasterDay'))],
    });
    deleteAfter(reply);
    return;
  }

  const days = Array.from({ length: lastDayWithData }, (_, i) => i + 1);

  const sorted = [...snapshot.members]
    .filter(m => !m.joinDay)
    .sort((a, b) => b.monthlyGain - a.monthlyGain);

  if (sorted.length === 0) {
    const reply = await interaction.editReply(
      'No active member data available yet for this month.'
    );
    deleteAfter(reply);
    return;
  }

  const members = sorted.map(m => ({
    name: m.trainerName,
    gains: days.map(d => m.deltas[d - 1] ?? 0),
    monthly: m.monthlyGain,
  }));

  const totals = days.map(d => sorted.reduce((sum, m) => sum + (m.deltas[d - 1] ?? 0), 0));
  const circleMonthly = sorted.reduce((sum, m) => sum + m.monthlyGain, 0);

  const buf = await renderCircleMaster({
    circleName: snapshot.circle.name,
    monthName,
    year,
    date: dateStr,
    days,
    members,
    totals,
    circleMonthly,
    dailyReq,
    monthlyReq,
  });

  const reply = await interaction.editReply({
    files: [bufferToAttachment(buf, buildReportFilename('CircleMaster'))],
  });
  deleteAfter(reply);
}
