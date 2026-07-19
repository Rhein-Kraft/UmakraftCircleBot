import { SlashCommandBuilder } from 'discord.js';
import { getCircleSnapshot } from '../core/uma.js';
import { store } from '../core/store.js';
import { formatGain, jstShiftedNow, jstDate, jstDateOffset } from '../core/format.js';
import { daysRemainingInMonth } from '../core/tally.js';
import { config, getConfiguredCircles } from '../core/config.js';
import { resolveQuota } from '../core/quotaKeys.js';
import { deleteAfter } from '../utils/autoDelete.js';
import { renderFanGain, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';
import { getMemberGainForDate } from '../db/storeDb.js';

function resolveCircle(circleId) {
  const circles = getConfiguredCircles();
  if (!circleId) return circles[0];
  return circles.find(c => c.id === circleId) ?? circles[0];
}

async function getMonthlyReq(guildId, circleId) {
  if (!guildId) return config.monthlyRequirement;
  const cfg = await store.getGuildConfig(guildId).catch(() => ({}));
  return resolveQuota(cfg, circleId, 'monthly', config.monthlyRequirement);
}

/**
 * Compute the daily status indicator based on progress toward today's target.
 * Without hourly data we use simple percentage thresholds.
 */
function dailyStatus(gainRaw, dailyTarget) {
  if (!dailyTarget || typeof gainRaw !== 'number') return null;
  const pct = gainRaw / dailyTarget;
  if (pct >= 1)    return { emoji: '🟢', label: 'Completed' };
  if (pct >= 0.5)  return { emoji: '🟡', label: 'On Pace' };
  return               { emoji: '🔴', label: 'Behind' };
}

export function buildData() {
  const circles = getConfiguredCircles();
  return new SlashCommandBuilder()
    .setName('fan_gain')
    .setDescription('Show your daily, weekly, and monthly fan gain plus your daily ranking')
    .addUserOption(opt =>
      opt
        .setName('member')
        .setDescription('Look up another circle member instead of yourself')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('trainer')
        .setDescription('Pick a trainer from the list (or type to search)')
        .setRequired(false)
        .setAutocomplete(true)
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

// ── Autocomplete handler ──────────────────────────────────────────────────────

export async function autocomplete(interaction) {
  const circleVal = interaction.options.getString('circle');
  const partial   = (interaction.options.getFocused() ?? '').toLowerCase().trim();

  const circles = getConfiguredCircles();
  const targets = circleVal ? circles.filter(c => c.id === circleVal) : circles;

  const results = [];
  const seen    = new Set();

  for (const { id: circleId, name: circleName } of targets) {
    let snapshot;
    try { snapshot = await getCircleSnapshot(circleId); } catch { continue; }

    for (const m of snapshot.members) {
      if (seen.has(m.trainerId)) continue;
      if (partial && !m.trainerName.toLowerCase().includes(partial)) continue;

      seen.add(m.trainerId);

      const label = targets.length > 1
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
  await interaction.deferReply();

  const targetUser    = interaction.options.getUser('member') ?? interaction.user;
  const trainerOption = interaction.options.getString('trainer');
  const circleVal     = interaction.options.getString('circle');
  const circle        = resolveCircle(circleVal);

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

  let member = null;
  let lookupLabel;

  if (trainerOption) {
    const isId = /^\d{6,}$/.test(trainerOption.trim());
    if (isId) {
      member = snapshot.members.find(m => String(m.trainerId) === trainerOption.trim());
    }
    if (!member) {
      const needle = trainerOption.toLowerCase();
      member =
        snapshot.members.find(m => m.trainerName.toLowerCase() === needle) ||
        snapshot.members.find(m => m.trainerName.toLowerCase().includes(needle));
    }
    lookupLabel = `trainer "${trainerOption}"`;
  } else {
    const trainerId = await store.getLinkedViewerId(targetUser.id);
    if (trainerId) member = snapshot.members.find(m => String(m.trainerId) === String(trainerId));
    if (!member) {
      const guildMember = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
      const candidates  = [guildMember?.nickname, targetUser.globalName, targetUser.username]
        .filter(Boolean)
        .map(s => s.toLowerCase());
      member = snapshot.members.find(m => candidates.includes(m.trainerName.toLowerCase()));
    }
    lookupLabel = `<@${targetUser.id}>`;
  }

  if (!member) {
    const errReply = await interaction.editReply(
      `Could not find ${lookupLabel} in the active ${circle.name} circle members. ` +
      `Use \`/link\` to connect your Discord account to your Uma.moe trainer name.`
    );
    deleteAfter(errReply);
    return;
  }

  // ── Date helpers ────────────────────────────────────────────────────────────
  // JST-shifted: daily_gains rows and the snapshot's gain fields are keyed to
  // the JST calendar day, so all calendar math below must use JST "today",
  // not real UTC "today" (see core/format.js jstShiftedNow doc comment).
  const today       = jstShiftedNow();
  const dateLabel   = jstDate();
  const yesterdayStr = jstDateOffset(-1);
  const daysLeft    = daysRemainingInMonth(today);

  const todayDow     = today.getUTCDay();
  const daysSinceMon = (todayDow + 6) % 7;
  const monDate      = new Date(today);
  monDate.setUTCDate(today.getUTCDate() - daysSinceMon);
  const weekLabel = `${monDate.toISOString().slice(0, 10)} – ${dateLabel}`;

  // ── Quota / targets ─────────────────────────────────────────────────────────
  const monthlyReq = await getMonthlyReq(interaction.guildId, circle.id);
  const dailyTarget = Math.round(monthlyReq / 30);
  const weeklyTarget = Math.round(monthlyReq / 4);

  // ── Build eligible member pool (same rule used for rankings everywhere) ─────
  const { tallyStarted } = snapshot;
  const eligible = tallyStarted
    ? snapshot.members.filter(m => m.hasData && !m.joinDay)
    : [];

  // ── Rank calculations ───────────────────────────────────────────────────────
  const byDaily   = [...eligible].sort((a, b) => b.todayGain   - a.todayGain);
  const byWeekly  = [...eligible].sort((a, b) => b.weeklyGain  - a.weeklyGain);
  const byMonthly = [...eligible].sort((a, b) => b.monthlyGain - a.monthlyGain);

  let dailyRankNum   = null;
  let weeklyRankNum  = null;
  let monthlyRankNum = null;
  let rankStr;

  const memberIsEligible = eligible.some(m => m.trainerId === member.trainerId);

  if (!tallyStarted) {
    rankStr = 'Not Started';
  } else if (!memberIsEligible) {
    rankStr = member.joinDay ? 'Pending (Join Day)' : 'Pending';
  } else {
    dailyRankNum   = byDaily.findIndex(m   => m.trainerId === member.trainerId) + 1;
    weeklyRankNum  = byWeekly.findIndex(m  => m.trainerId === member.trainerId) + 1;
    monthlyRankNum = byMonthly.findIndex(m => m.trainerId === member.trainerId) + 1;
    rankStr = `#${dailyRankNum} of ${eligible.length}`;
  }

  // ── Competition: nearest rival just ahead in daily rank ─────────────────────
  let competition = null;
  if (dailyRankNum !== null) {
    if (dailyRankNum === 1) {
      competition = { firstPlace: true };
    } else {
      const rival = byDaily[dailyRankNum - 2]; // person one rank above
      if (rival) {
        competition = {
          firstPlace: false,
          name: rival.trainerName,
          gap: rival.todayGain - member.todayGain,
        };
      }
    }
  }

  // ── Trend: today vs yesterday ───────────────────────────────────────────────
  let trend = null;
  try {
    const yday = getMemberGainForDate(circle.id, String(member.trainerId), yesterdayStr);
    if (yday && member.hasData && !member.joinDay) {
      const todayGain = member.todayGain ?? 0;
      const yGain     = yday.gain ?? 0;
      trend = {
        yesterdayGain: yGain,
        todayGain,
        pct: yGain > 0
          ? Math.round(((todayGain - yGain) / yGain) * 100)
          : null,
      };
    }
  } catch {
    // non-fatal — trend section is optional
  }

  // ── Guild statistics ────────────────────────────────────────────────────────
  const guildCompleted = eligible.filter(m => m.todayGain >= dailyTarget).length;
  const guildPct = eligible.length > 0
    ? Math.round((guildCompleted / eligible.length) * 100)
    : 0;

  // ── Daily status ────────────────────────────────────────────────────────────
  const status = memberIsEligible
    ? dailyStatus(member.todayGain, dailyTarget)
    : null;

  // ── Render ──────────────────────────────────────────────────────────────────
  const buf = await renderFanGain({
    // Identity
    trainerName: member.trainerName,
    circleName:  snapshot.circle.name,
    totalFans:   member.totalFans ?? 0,
    date:        dateLabel,
    weekLabel,
    daysLeft,

    // Raw gains
    dailyRaw:   member.hasData ? (member.todayGain   ?? 0) : 0,
    weeklyRaw:  member.hasData ? (member.weeklyGain  ?? 0) : 0,
    monthlyRaw: member.hasData ? (member.monthlyGain ?? 0) : 0,

    // Formatted gains (status-aware labels for join day / no data)
    daily:   formatGain(member.todayGain,   member, tallyStarted, 'daily'),
    weekly:  formatGain(member.weeklyGain,  member, tallyStarted, 'weekly'),
    monthly: formatGain(member.monthlyGain, member, tallyStarted, 'monthly'),

    // Targets
    dailyTarget,
    weeklyTarget,
    monthlyReq,

    // Status
    status,

    // Rankings
    rank:          rankStr,
    dailyRankNum,
    weeklyRankNum,
    monthlyRankNum,
    totalEligible: eligible.length,

    // Competition
    competition,

    // Trend
    trend,

    // Guild stats
    guildCompleted,
    guildTotal: eligible.length,
    guildPct,
  });

  const reply = await interaction.editReply({
    files: [bufferToAttachment(buf, buildReportFilename('FanGain', member.trainerName))],
  });
  deleteAfter(reply);
}
