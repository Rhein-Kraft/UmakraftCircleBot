/**
 * commands/set_fans.js
 * ─────────────────────
 * Admin-only command to set the fan requirement for a specific circle and scope,
 * or view current quota settings for all circles.
 *
 * Usage modes:
 *   /set_fans status:True
 *       → Shows a summary card of every circle's current D/W/M quotas.
 *
 *   /set_fans circle:<id> scope:<daily|weekly|monthly> amount:<preset|specified>
 *       → Sets the quota for that circle + scope.
 *
 * Stored in guildConfig under:
 *   quota_<circleId>_<scope>   e.g.  quota_974470619_daily
 *
 * All quotas are stored and read using the unified key format:
 *   quota_<circleId>_<scope>   (applies to all 10 circles uniformly)
 *
 * Note: The legacy monthly_minimum key (from the removed /set_quota command) is
 * not read by any task and is not supported here. Supported scopes: daily / weekly / monthly.
 */

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { store } from '../core/store.js';
import { config, getConfiguredCircles } from '../core/config.js';
import { formatNumber } from '../core/format.js';
import { quotaKey, resolveQuota } from '../core/quotaKeys.js';
import { renderInfoCard, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';
import { getCircleSnapshot } from '../core/uma.js';
import { log } from '../core/log.js';

// ── Amount presets ─────────────────────────────────────────────────────────────

const PRESET_VALUES = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

const AMOUNT_CHOICES = [
  ...PRESET_VALUES.map(n => ({
    name: `${n}M  (${formatNumber(n * 1_000_000)})`,
    value: String(n),
  })),
  { name: 'Specified — enter custom_amount below', value: 'specified' },
];

// ── Command definition ────────────────────────────────────────────────────────

export function buildData() {
  const circles = getConfiguredCircles();
  return new SlashCommandBuilder()
    .setName('set_fans')
    .setDescription('Set fan quotas per circle, or use status:True to view all current settings (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addBooleanOption(opt =>
      opt
        .setName('status')
        .setDescription('Show current daily/weekly/monthly quota settings for all circles')
        .setRequired(false)
    )

    .addStringOption(opt =>
      opt
        .setName('circle')
        .setDescription('Which circle to configure (required when setting a quota)')
        .setRequired(false)
        .addChoices(...circles.map(c => ({ name: c.name, value: c.id })))
    )

    .addStringOption(opt =>
      opt
        .setName('scope')
        .setDescription('Daily, weekly, or monthly target (required when setting a quota)')
        .setRequired(false)
        .addChoices(
          { name: 'Daily', value: 'daily' },
          { name: 'Weekly', value: 'weekly' },
          { name: 'Monthly', value: 'monthly' }
        )
    )

    .addStringOption(opt =>
      opt
        .setName('amount')
        .setDescription(
          'Fan target in millions (10 = 10,000,000). Pick "Specified" for a custom value.'
        )
        .setRequired(false)
        .addChoices(...AMOUNT_CHOICES)
    )

    .addIntegerOption(opt =>
      opt
        .setName('custom_amount')
        .setDescription(
          'Custom fan target (exact number, e.g. 12500000). Only used when amount = Specified.'
        )
        .setMinValue(1)
        .setRequired(false)
    );
}

export const data = buildData();

// ── Handler ──────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const showStatus  = interaction.options.getBoolean('status') ?? false;
  const circleId    = interaction.options.getString('circle');
  const scope       = interaction.options.getString('scope');
  const amountChoice = interaction.options.getString('amount');
  const customAmount = interaction.options.getInteger('custom_amount');

  // ── STATUS MODE — show all circles' current quotas ────────────────────────
  if (showStatus) {
    const circles = getConfiguredCircles();
    const cfg = await store.getGuildConfig(interaction.guildId).catch(() => ({}));

    const lines = circles.map((circle, i) => {
      const daily   = resolveQuota(cfg, circle.id, 'daily',   config.dailyRequirement);
      const weekly  = resolveQuota(cfg, circle.id, 'weekly',  config.weeklyRequirement);
      const monthly = resolveQuota(cfg, circle.id, 'monthly', config.monthlyRequirement);
      const prefix = i === 0 ? '★' : `${i + 1}`;
      return [
        `${prefix}  ${circle.name}`,
        `    Daily:    ${formatNumber(daily)}`,
        `    Weekly:   ${formatNumber(weekly)}`,
        `    Monthly:  ${formatNumber(monthly)}`,
      ].join('\n');
    }).join('\n\n');

    const buf = await renderInfoCard({
      title: '📊 Fan Quota Settings — All Circles',
      body: lines,
      footer: `${circles.length} circle(s) configured · use /set_fans circle: scope: amount: to update`,
      accent: '#5c6bc0',
    });

    await interaction.editReply({ files: [bufferToAttachment(buf, buildReportFilename('QuotaStatus'))] });
    return;
  }

  // ── SET MODE — validate required fields ───────────────────────────────────
  if (!circleId || !scope || !amountChoice) {
    await interaction.editReply({
      content:
        '❌ To set a quota, provide **circle**, **scope**, and **amount**.\n' +
        'To view current settings for all circles, use `status: True`.',
    });
    return;
  }

  // Resolve circle from registry
  const circles = getConfiguredCircles();
  const circle  = circles.find(c => c.id === circleId);

  if (!circle) {
    await interaction.editReply({ content: `❌ Circle not found in registry.` });
    return;
  }

  // ── Resolve fan amount ────────────────────────────────────────────────────
  let fanAmount;
  if (amountChoice === 'specified') {
    if (!customAmount) {
      await interaction.editReply({
        content:
          '❌ You selected **Specified** but did not provide a `custom_amount`. Please run the command again and fill in the custom value.',
      });
      return;
    }
    fanAmount = customAmount;
  } else {
    fanAmount = parseInt(amountChoice, 10) * 1_000_000;
  }

  // ── Save to guildConfig using new unified key format ──────────────────────
  const key = quotaKey(circleId, scope);
  await store.setGuildConfig(interaction.guildId, { [key]: fanAmount });

  // ── Build confirmation card ───────────────────────────────────────────────
  const cfg = await store.getGuildConfig(interaction.guildId);
  const scopeLabel = scope.charAt(0).toUpperCase() + scope.slice(1);

  const dailyVal   = resolveQuota(cfg, circleId, 'daily',   config.dailyRequirement);
  const weeklyVal  = resolveQuota(cfg, circleId, 'weekly',  config.weeklyRequirement);
  const monthlyVal = resolveQuota(cfg, circleId, 'monthly', config.monthlyRequirement);

  const lines = [
    `Circle:   ${circle.name}`,
    ``,
    `Daily:    ${formatNumber(dailyVal)}`,
    `Weekly:   ${formatNumber(weeklyVal)}`,
    `Monthly:  ${formatNumber(monthlyVal)}`,
  ].join('\n');

  const buf = await renderInfoCard({
    title: `✅ Fan Requirement Updated — ${circle.name}`,
    body: lines,
    footer: `${scopeLabel} target set by ${interaction.user.tag}`,
    accent: '#81c784',
  });

  await interaction.editReply({ files: [bufferToAttachment(buf, buildReportFilename('SetFans'))] });

  // ── Impact check: who is currently below the new threshold? ──────────────
  try {
    const snapshot = await getCircleSnapshot(circleId);
    const eligible = (snapshot.members ?? []).filter(m => m.hasData && !m.joinDay);

    // Pick the gain field and label that match the scope that was just set
    const gainField =
      scope === 'daily'   ? 'yesterdayGain' :
      scope === 'weekly'  ? 'weeklyGain'    : 'monthlyGain';
    const gainLabel =
      scope === 'daily'   ? 'Yesterday'  :
      scope === 'weekly'  ? 'This week'  : 'This month';

    const failing = eligible
      .filter(m => (m[gainField] ?? 0) < fanAmount)
      .sort((a, b) => (a[gainField] ?? 0) - (b[gainField] ?? 0)); // worst first

    let description;
    let color;

    if (failing.length === 0) {
      description = `✅ All **${eligible.length}** active member${eligible.length !== 1 ? 's' : ''} currently meet this target.`;
      color = 0x81c784;
    } else {
      const lines = failing.slice(0, 20).map(m => {
        const gain      = m[gainField] ?? 0;
        const shortfall = fanAmount - gain;
        const shortStr  =
          shortfall >= 1_000_000
            ? (shortfall / 1_000_000).toFixed(1) + 'M short'
            : Math.round(shortfall / 1_000) + 'K short';
        return `❌ **${m.trainerName}** — ${gainLabel}: ${formatNumber(gain)} *(${shortStr})*`;
      });
      if (failing.length > 20) lines.push(`*…and ${failing.length - 20} more*`);
      description = lines.join('\n');
      color = 0xef5350;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 Impact Check — ${scopeLabel} target at ${formatNumber(fanAmount)}`)
      .setDescription(description)
      .setColor(color)
      .setFooter({
        text: `${failing.length} of ${eligible.length} member${eligible.length !== 1 ? 's' : ''} currently below threshold · ${circle.name}`,
      });

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } catch (err) {
    // Non-fatal — snapshot may not be ready yet (e.g. first boot, no data)
    log.warn(`set_fans impact check failed for ${circleId}: ${err.message}`);
    await interaction.followUp({
      content: '⚠️ Quota saved. Could not load snapshot data to check current impact — try again after the next data sync.',
      ephemeral: true,
    }).catch(() => {});
  }
}
