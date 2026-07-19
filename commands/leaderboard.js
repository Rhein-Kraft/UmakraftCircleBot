// @ts-check
import { SlashCommandBuilder } from 'discord.js';
import { getCircleSnapshot } from '../core/uma.js';
import { store } from '../core/store.js';
import { formatNumber, formatGain, jstDate } from '../core/format.js';
import { config, getConfiguredCircles } from '../core/config.js';
import { resolveQuota } from '../core/quotaKeys.js';
import { deleteAfter } from '../utils/autoDelete.js';
import { renderLeaderboard, renderInfoCard, bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';

const SCOPES = [
  { name: 'Daily',   value: 'daily'   },
  { name: 'Weekly',  value: 'weekly'  },
  { name: 'Monthly', value: 'monthly' },
];

function resolveCircle(circleId) {
  const circles = getConfiguredCircles();
  if (!circleId) return circles[0];
  return circles.find(c => c.id === circleId) ?? circles[0];
}

function pickValue(member, scope) {
  if (scope === 'daily')   return member.todayGain   ?? 0;
  if (scope === 'weekly')  return member.weeklyGain  ?? 0;
  return member.monthlyGain ?? 0;
}

function isNewMember(member) {
  if (!member.joinedAt) return false;
  const joined = new Date(member.joinedAt);
  const now    = new Date();
  return (
    joined.getUTCFullYear() === now.getUTCFullYear() &&
    joined.getUTCMonth()    === now.getUTCMonth()
  );
}

async function getQuota(guildId, circleId, scope) {
  const cfg = await store.getGuildConfig(guildId).catch(() => ({}));
  if (scope === 'daily')   return resolveQuota(cfg, circleId, 'daily',   config.dailyRequirement);
  if (scope === 'weekly')  return resolveQuota(cfg, circleId, 'weekly',  config.weeklyRequirement);
  return resolveQuota(cfg, circleId, 'monthly', config.monthlyRequirement);
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmtCompact(n) {
  if (!n || n === 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return String(Math.round(n));
}

export function buildData() {
  const circles = getConfiguredCircles();
  return new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Circle fan-gain rankings (daily / weekly / monthly)')
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
    )
    .addStringOption(opt =>
      opt
        .setName('circle')
        .setDescription('Which circle to show (default: first circle)')
        .setRequired(false)
        .addChoices(...circles.map(c => ({ name: c.name, value: c.id })))
    )
    .addStringOption(opt =>
      opt
        .setName('date')
        .setDescription('View historical snapshot (YYYY-MM-DD). Omit for today\'s live rankings.')
        .setRequired(false)
    );
}

export const data = buildData();

// ── Historical mode ────────────────────────────────────────────────────────────

async function executeHistorical(interaction, circle, scope, scopeLabel, dateStr, top, quota) {
  const rows = store.getLeaderboardSnapshot(circle.id, 'daily', dateStr);
  if (!rows || rows.length === 0) {
    const available = store.getAvailableSnapshotDates(circle.id, 'daily', 7);
    const hint = available.length
      ? `Available dates: ${available.slice(0, 5).join(', ')}`
      : 'No snapshots have been captured yet — run the bot for at least one day.';
    const reply = await interaction.editReply(
      `📭 No snapshot found for **${dateStr}**.\n${hint}`
    );
    deleteAfter(reply);
    return;
  }

  // Get the previous day's snapshot for movement arrows
  const prevDate = new Date(dateStr);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr  = prevDate.toISOString().slice(0, 10);
  const prevRows     = store.getLeaderboardSnapshot(circle.id, 'daily', prevDateStr);
  const prevRankMap  = {};
  for (const r of prevRows) prevRankMap[String(r.trainerId)] = r.rank;

  const allPBs = store.getAllPersonalBests(circle.id, 'daily');

  // Caller's position in the historical snapshot
  const callerTrainerId = await store.getLinkedViewerId(interaction.user.id);
  let caller = null;
  if (callerTrainerId) {
    const callerRow = rows.find(r => String(r.trainerId) === String(callerTrainerId));
    if (callerRow) {
      const aboveRow = rows.find(r => r.rank === callerRow.rank - 1);
      caller = {
        rank:       callerRow.rank,
        gain:       callerRow.gain,
        gainStr:    formatNumber(callerRow.gain),
        gapToNext:  aboveRow ? Math.max(0, aboveRow.gain - callerRow.gain) : null,
        nextRank:   callerRow.rank > 1 ? callerRow.rank - 1 : null,
        inTopTen:   callerRow.rank <= top,
        rankHistory: null,
      };
    }
  }

  const topRows = rows.slice(0, top).map(r => {
    const tid      = String(r.trainerId);
    const gainRaw  = r.gain;
    const gapRaw   = gainRaw - quota;
    const pct      = quota > 0 ? Math.min(200, Math.round((gainRaw / quota) * 100)) : 0;
    const pb       = allPBs[tid];
    const isAtPB   = pb && r.rank <= pb.bestRank;
    const prevRank = prevRankMap[tid];
    const movement = prevRank != null ? prevRank - r.rank : null;

    const badges = [];
    if (r.rank === 1) badges.push('🏆');
    if (r.rank <= 10) badges.push('⭐');
    if (pct >= 100)   badges.push('🔥');
    if (isAtPB)       badges.push('💎');

    return {
      rank:        r.rank,
      name:        r.trainerName,
      discordName: null,
      trainerId:   tid,
      gainRaw,
      gainStr:     '+' + fmtCompact(gainRaw),
      gapRaw,
      gapStr:      (gapRaw >= 0 ? '+' : '') + formatNumber(Math.abs(gapRaw)),
      pct,
      isNew:       false,
      movement,
      badges,
    };
  });

  const allGains      = rows.map(r => r.gain).filter(g => g > 0);
  const completedCount = rows.filter(r => r.gain >= quota).length;
  const avgGain        = allGains.length ? Math.round(allGains.reduce((s,g)=>s+g,0)/allGains.length) : 0;
  const highestGain    = allGains.length ? Math.max(...allGains) : 0;
  const medianGain     = (() => {
    if (!allGains.length) return 0;
    const s = [...allGains].sort((a,b)=>a-b);
    const m = Math.floor(s.length/2);
    return s.length%2 ? s[m] : Math.round((s[m-1]+s[m])/2);
  })();

  const buf = await renderLeaderboard({
    circleName:   circle.name,
    scope:        scopeLabel,
    date:         dateStr,
    lastUpdated:  'Archived',
    quotaLabel:   formatNumber(quota),
    isHistorical: true,
    rows:         topRows,
    guildStats: {
      completedCount,
      totalMembers:  rows.length,
      completionPct: rows.length ? Math.round((completedCount/rows.length)*100) : 0,
      highestGain,
      avgGain,
      medianGain,
    },
    caller,
    biggestClimber: null,
  });

  const reply = await interaction.editReply({
    files: [bufferToAttachment(buf, buildReportFilename('Leaderboard', null, dateStr))],
  });
  deleteAfter(reply);
}

// ── Live mode ──────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  await interaction.deferReply();

  const scope      = interaction.options.getString('scope') ?? 'daily';
  const top        = interaction.options.getInteger('top')  ?? 10;
  const circleVal  = interaction.options.getString('circle');
  const dateOpt    = interaction.options.getString('date');
  const scopeLabel = SCOPES.find(s => s.value === scope)?.name ?? 'Daily';
  const today      = jstDate();
  const circle     = resolveCircle(circleVal);

  let quota;
  try {
    quota = await getQuota(interaction.guildId, circle.id, scope);
  } catch {
    quota = 0;
  }

  // ── Historical mode ──────────────────────────────────────────────────────────
  if (dateOpt) {
    const dateClean = dateOpt.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateClean) || dateClean >= today) {
      const reply = await interaction.editReply(
        '⚠️ Date must be in `YYYY-MM-DD` format and must be a past date.'
      );
      deleteAfter(reply);
      return;
    }
    await executeHistorical(interaction, circle, scope, scopeLabel, dateClean, top, quota);
    return;
  }

  const lastUpdated = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false,
  }) + ' UTC';

  // ── Fetch live data ──────────────────────────────────────────────────────────
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

  if (!snapshot.tallyStarted) {
    const buf = await renderInfoCard({
      title:  `${snapshot.circle.name} — ${scopeLabel} Leaderboard`,
      body:   'Tally Not Started\n\nThe fan-gain tally for this month has not begun yet.\nRankings will appear once the first valid gains are recorded.',
      footer: `${snapshot.members.length} active members · check back shortly`,
      accent: '#90a4ae',
    });
    const reply = await interaction.editReply({ files: [bufferToAttachment(buf, buildReportFilename('Leaderboard'))] });
    deleteAfter(reply);
    return;
  }

  const eligible = snapshot.members.filter(m => !m.joinDay);
  const withData = eligible.filter(m => m.hasData);
  const noData   = eligible.filter(m => !m.hasData);

  const sorted = [
    ...[...withData].sort((a, b) => pickValue(b, scope) - pickValue(a, scope)),
    ...noData,
  ];

  // ── Rank movement: yesterday's snapshot vs today ───────────────────────────
  const prevRankMap = {};
  if (scope === 'daily') {
    try {
      const prevRows = store.getLeaderboardSnapshot(circle.id, 'daily', yesterday());
      for (const r of prevRows) prevRankMap[String(r.trainerId)] = r.rank;
    } catch { /* non-fatal */ }

    // Fallback: yesterday's daily_gains if no snapshot exists yet
    if (Object.keys(prevRankMap).length === 0) {
      try {
        const prevGains = await store.getDailyGainsForDateForCircle(circle.id, yesterday());
        if (prevGains.length > 0) {
          [...prevGains]
            .sort((a, b) => b.gain - a.gain)
            .forEach((g, i) => { prevRankMap[String(g.trainer_id)] = i + 1; });
        }
      } catch { /* non-fatal */ }
    }
  }

  // ── Discord display names ─────────────────────────────────────────────────
  const linksMap         = await store.getLinks();
  const trainerToDiscord = {};
  for (const [did, tid] of Object.entries(linksMap)) {
    trainerToDiscord[String(tid)] = did;
  }

  const discordNames = {};
  const topSlice     = sorted.slice(0, Math.min(top, sorted.length));
  try {
    const toFetch = topSlice
      .map(m => trainerToDiscord[String(m.trainerId)])
      .filter(Boolean);
    if (toFetch.length > 0 && interaction.guild) {
      await Promise.all(toFetch.map(async did => {
        try {
          const gm  = await interaction.guild.members.fetch(did);
          const tid = linksMap[did];
          if (tid) discordNames[String(tid)] = gm.displayName;
        } catch { /* left or error */ }
      }));
    }
  } catch { /* non-fatal */ }

  // ── Personal bests ────────────────────────────────────────────────────────
  const allPBs = store.getAllPersonalBests(circle.id, scope);

  // ── Biggest Climber ───────────────────────────────────────────────────────
  let biggestClimber = null;
  if (Object.keys(prevRankMap).length > 0) {
    let bestClimb = 0;
    for (let i = 0; i < sorted.length; i++) {
      const m        = sorted[i];
      const prevRank = prevRankMap[String(m.trainerId)];
      if (prevRank && prevRank > i + 1) {
        const climb = prevRank - (i + 1);
        if (climb > bestClimb) {
          bestClimb      = climb;
          biggestClimber = {
            name:        m.trainerName,
            discordName: discordNames[String(m.trainerId)] ?? null,
            climb,
            nowRank:     i + 1,
            wasRank:     prevRank,
          };
        }
      }
    }
  }

  // ── Caller's position + rank history ─────────────────────────────────────
  const callerTrainerId = await store.getLinkedViewerId(interaction.user.id);
  let caller = null;
  if (callerTrainerId) {
    const idx = sorted.findIndex(m => String(m.trainerId) === String(callerTrainerId));
    if (idx !== -1) {
      const callerGain = pickValue(sorted[idx], scope) ?? 0;
      const aboveGain  = idx > 0 ? (pickValue(sorted[idx - 1], scope) ?? 0) : null;

      // Rank history from snapshots (daily scope only)
      let rankHistory = null;
      if (scope === 'daily') {
        try {
          const history = store.getTrainerRankHistory(circle.id, 'daily', callerTrainerId, 31);
          if (history.length > 0) {
            const yesterdayEntry = history.find(h => h.date === yesterday());
            const weekBest  = Math.min(...history.slice(0, 7).map(h => h.rank));
            const monthBest = Math.min(...history.map(h => h.rank));
            rankHistory = {
              yesterday:  yesterdayEntry?.rank ?? null,
              weekBest:   weekBest  < Infinity ? weekBest  : null,
              monthBest:  monthBest < Infinity ? monthBest : null,
            };
          }
        } catch { /* non-fatal */ }
      }

      caller = {
        rank:       idx + 1,
        gain:       callerGain,
        gainStr:    formatNumber(callerGain),
        gapToNext:  aboveGain != null ? Math.max(0, aboveGain - callerGain) : null,
        nextRank:   idx > 0 ? idx : null,
        inTopTen:   idx + 1 <= top,
        rankHistory,
      };
    }
  }

  // ── Guild statistics ──────────────────────────────────────────────────────
  const completedCount = withData.filter(m => (pickValue(m, scope) ?? 0) >= quota).length;
  const allGains       = withData.map(m => pickValue(m, scope) ?? 0).filter(g => g > 0);
  const avgGain        = allGains.length
    ? Math.round(allGains.reduce((s, g) => s + g, 0) / allGains.length) : 0;
  const highestGain    = allGains.length ? Math.max(...allGains) : 0;
  const medianGain     = (() => {
    if (!allGains.length) return 0;
    const s = [...allGains].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  })();

  // ── Build enriched rows ───────────────────────────────────────────────────
  const rows = topSlice.map((m, i) => {
    const rank     = i + 1;
    const gainRaw  = m.hasData ? (pickValue(m, scope) ?? 0) : 0;
    const gapRaw   = gainRaw - quota;
    const pct      = quota > 0 ? Math.min(200, Math.round((gainRaw / quota) * 100)) : 0;
    const gainStr  = formatGain(pickValue(m, scope), m, snapshot.tallyStarted, scope);
    const gapStr   = (gapRaw >= 0 ? '+' : '') + formatNumber(Math.abs(gapRaw));
    const tid      = String(m.trainerId);
    const prevRank = prevRankMap[tid];
    const movement = prevRank != null ? prevRank - rank : null;
    const pb       = allPBs[tid];
    const isAtPB   = pb && rank <= pb.bestRank;

    const badges = [];
    if (rank === 1) badges.push('🏆');
    if (rank <= 10) badges.push('⭐');
    if (pct >= 100) badges.push('🔥');
    if (biggestClimber?.name === m.trainerName) badges.push('🚀');
    if (isAtPB)     badges.push('💎');

    return {
      rank,
      name:        m.trainerName,
      discordName: discordNames[tid] ?? null,
      trainerId:   tid,
      gainRaw,
      gainStr,
      gapRaw,
      gapStr,
      pct,
      isNew:       isNewMember(m),
      movement,
      badges,
    };
  });

  // ── Render ────────────────────────────────────────────────────────────────
  const buf = await renderLeaderboard({
    circleName:    snapshot.circle.name,
    scope:         scopeLabel,
    date:          today,
    lastUpdated,
    quotaLabel:    formatNumber(quota),
    isHistorical:  false,
    rows,
    guildStats: {
      completedCount,
      totalMembers:  eligible.length,
      completionPct: eligible.length
        ? Math.round((completedCount / eligible.length) * 100) : 0,
      highestGain,
      avgGain,
      medianGain,
    },
    caller,
    biggestClimber,
  });

  const reply = await interaction.editReply({
    files: [bufferToAttachment(buf, buildReportFilename('Leaderboard'))],
  });
  deleteAfter(reply);
}
