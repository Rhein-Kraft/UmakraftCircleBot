// @ts-check
/**
 * commands/profile.js
 * ────────────────────
 * /profile [member] [trainer] [circle] [stadium]
 *
 * Full member profile dashboard: tracking info, current gains, all-time
 * records, yearly performance, full monthly history, circle status,
 * and trainer inheritance profile.
 *
 * Data sources
 * ─────────────────────────────────────────────────────
 *   store.db  daily_gains  — gains, PBs, monthly history
 *   store.db  members      — trainer name, join date
 *   milestone.db           — milestone badges per month
 *   PastHistoryTrainer.md  — historical monthly data
 *   uma.moe API            — trainer inheritance + circle rank (live, cached)
 */
import { SlashCommandBuilder } from 'discord.js';
import { getConfiguredCircles, config } from '../core/config.js';
import { store } from '../core/store.js';
import { resolveQuota } from '../core/quotaKeys.js';
import { deleteAfter } from '../utils/autoDelete.js';
import { renderProfile } from '../utils/reports/profile.js';
import { bufferToAttachment, buildReportFilename } from '../utils/imageReport.js';
import { getMemberMilestones } from '../db/milestoneDb.js';
import { TIERS } from '../tasks/milestone-tiers.js';
import { getPastProfile, getAllPastProfiles } from '../utils/pastHistoryReader.js';
import { getJoinDateFromNotes } from '../umamoe/history/joinDateNotes.js';
import { fetchTrainerProfile } from '../umamoe/umaClient.js';
import { getCircleSnapshot } from '../umamoe/umaCache.js';
import { getStadiumCache } from '../db/stadiumDb.js';
import { charNameById, charIconUrl } from '../utils/characterData.js';
import {
  getMemberRow,
  getActiveMembers,
  getLatestTotalFans,
  getCurrentMonthGain,
  getMemberGainForDate,
  getLastNDaysGain,
  getMemberMonthlyHistoryDetailed,
  getMemberGainStats,
  getCompletionStreakStats,
} from '../db/storeDb.js';

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

/** Fetch trainer profile with a hard timeout — returns null on any failure. */
async function safeTrainerProfile(viewerId, timeoutMs = 10_000) {
  try {
    return await Promise.race([
      fetchTrainerProfile(viewerId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
  } catch { return null; }
}

/** Get circle snapshot (in-memory cache) — returns null if unavailable. */
async function safeCircleSnapshot(circleId, timeoutMs = 5_000) {
  try {
    return await Promise.race([
      getCircleSnapshot(circleId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
  } catch { return null; }
}

// ── Command definition ────────────────────────────────────────────────────────

export function buildData() {
  const circles = getConfiguredCircles();
  return new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Show a full profile dashboard: tracking info, gains, records, and monthly history')
    .addUserOption(opt =>
      opt
        .setName('member')
        .setDescription('Look up another circle member instead of yourself')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('trainer')
        .setDescription('Pick a trainer from the list (or type to search) — includes past members')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName('circle')
        .setDescription('Which circle to look up in (default: first circle)')
        .setRequired(false)
        .addChoices(...circles.map(c => ({ name: c.name, value: c.id })))
    )
    ;
}

export const data = buildData();

// ── Autocomplete ──────────────────────────────────────────────────────────────

export async function autocomplete(interaction) {
  const circleVal = interaction.options.getString('circle');
  const partial   = (interaction.options.getFocused() ?? '').toLowerCase().trim();

  const circles = getConfiguredCircles();
  const targets = circleVal ? circles.filter(c => c.id === circleVal) : circles;

  const results  = [];
  const seenIds  = new Set();

  for (const { id: circleId, name: circleName } of targets) {
    const members = getActiveMembers(circleId);
    for (const m of members) {
      if (seenIds.has(m.viewer_id)) continue;
      if (partial && !(m.trainer_name ?? '').toLowerCase().includes(partial)) continue;

      seenIds.add(m.viewer_id);
      const label = targets.length > 1
        ? `[${circleName}] ${m.trainer_name ?? m.viewer_id}`
        : (m.trainer_name ?? m.viewer_id);

      results.push({ name: label, value: String(m.viewer_id) });
      if (results.length >= 20) break;
    }
    if (results.length >= 20) break;
  }

  if (results.length < 25) {
    for (const p of getAllPastProfiles()) {
      if (results.length >= 25) break;
      if (seenIds.has(p.trainerId)) continue;
      if (partial && !p.name.toLowerCase().includes(partial)) continue;
      seenIds.add(p.trainerId);
      results.push({ name: `[Past] ${p.name}`, value: p.trainerId });
    }
  }

  await interaction.respond(results);
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  await interaction.deferReply();

  const targetUser    = interaction.options.getUser('member') ?? interaction.user;
  const trainerOption = interaction.options.getString('trainer');
  const circleVal     = interaction.options.getString('circle');
  const circle        = resolveCircle(circleVal);

  const jstToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });

  // ── Resolve local DB member ───────────────────────────────────────────────
  let localMember = null;

  if (trainerOption) {
    const isId = /^\d{6,}$/.test(trainerOption.trim());
    if (isId) {
      localMember = getMemberRow(circle.id, trainerOption.trim());
    }
    if (!localMember) {
      const needle = trainerOption.toLowerCase();
      const all = getActiveMembers(circle.id);
      localMember =
        all.find(m => (m.trainer_name ?? '').toLowerCase() === needle) ||
        all.find(m => (m.trainer_name ?? '').toLowerCase().includes(needle)) ||
        null;
    }
  } else {
    const trainerId = await store.getLinkedViewerId(targetUser.id);
    if (trainerId) {
      localMember = getMemberRow(circle.id, String(trainerId));
    }
    if (!localMember) {
      const guildMember = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
      const candidates  = [guildMember?.nickname, targetUser.globalName, targetUser.username]
        .filter(Boolean)
        .map(s => s.toLowerCase());
      const all = getActiveMembers(circle.id);
      localMember = all.find(m =>
        candidates.includes((m.trainer_name ?? '').toLowerCase())
      ) ?? null;
    }
  }

  // ── Resolve past profile ───────────────────────────────────────────────────
  let pastProfile = null;

  if (trainerOption) {
    pastProfile = getPastProfile(trainerOption.trim());
  } else if (localMember) {
    pastProfile = getPastProfile(String(localMember.viewer_id));
  } else {
    const guildMember = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
    const candidates  = [guildMember?.nickname, targetUser.globalName, targetUser.username]
      .filter(Boolean);
    for (const name of candidates) {
      pastProfile = getPastProfile(name);
      if (pastProfile) break;
    }
  }

  if (!localMember && !pastProfile) {
    const label = trainerOption ? `trainer "${trainerOption}"` : `<@${targetUser.id}>`;
    const reply = await interaction.editReply(
      `Could not find ${label} in the circle or in past history. ` +
      `Use \`/link\` to connect your Discord account to your trainer name.`
    );
    deleteAfter(reply);
    return;
  }

  // ── Trainer identity ──────────────────────────────────────────────────────
  const trainerName = localMember?.trainer_name ?? pastProfile?.name ?? 'Unknown';
  const viewerId    = localMember?.viewer_id ?? pastProfile?.trainerId ?? '';

  // ── Live API fetches (run in parallel, both have timeouts) ────────────────
  const [trainerProfile, circleSnapshot] = await Promise.all([
    viewerId ? safeTrainerProfile(viewerId) : Promise.resolve(null),
    safeCircleSnapshot(circle.id),
  ]);

  // ── Join date ─────────────────────────────────────────────────────────────
  const notesJoinedAt = viewerId ? getJoinDateFromNotes(viewerId) : null;
  const rawJoinedAt = notesJoinedAt
    ?? localMember?.joined_at
    ?? localMember?.first_seen_at
    ?? (pastProfile?.joined ? `${pastProfile.joined}-01` : null);
  const joinedAtIso = rawJoinedAt ?? null;
  const daysInCircle = joinedAtIso
    ? Math.max(0, Math.floor((Date.now() - new Date(joinedAtIso).getTime()) / 86_400_000))
    : 0;

  // ── Resolve live snapshot member (prefer live API over local DB) ──────────
  const hasLocalData = !!localMember && !!viewerId;
  const snapshotMember = viewerId && circleSnapshot
    ? (circleSnapshot.allMembers ?? circleSnapshot.members ?? [])
        .find(m => String(m.trainerId) === String(viewerId)) ?? null
    : null;

  /** Sum the last N entries from the snapshot deltas array. */
  function sumLastNDeltas(deltas, n) {
    if (!Array.isArray(deltas) || deltas.length === 0) return 0;
    return deltas.slice(-n).reduce((s, v) => s + (v ?? 0), 0);
  }

  // ── Current gains — live snapshot first, DB fallback ─────────────────────
  const todayRow           = hasLocalData ? getMemberGainForDate(circle.id, viewerId, jstToday) : null;
  const currentDailyGain   = snapshotMember?.todayGain
    ?? todayRow?.gain
    ?? 0;
  const currentWeeklyGain  = snapshotMember?.weeklyGain
    ?? (hasLocalData ? getLastNDaysGain(circle.id, viewerId, 7).total : 0);
  const currentMonthlyGain = snapshotMember?.monthlyGain
    ?? (hasLocalData ? getCurrentMonthGain(circle.id, viewerId) : 0);

  // ── Rolling gains — compute from snapshot deltas, DB fallback ─────────────
  // deltas[] covers the current month (day 1 → today); this is more accurate
  // than the local DB which may lag if the bot was offline.
  const rolling3d = {
    total: snapshotMember
      ? sumLastNDeltas(snapshotMember.deltas, 3)
      : (hasLocalData ? getLastNDaysGain(circle.id, viewerId, 3).total : 0),
  };
  const rolling30d = {
    total: snapshotMember
      ? sumLastNDeltas(snapshotMember.deltas, 30)
      : (hasLocalData ? getLastNDaysGain(circle.id, viewerId, 30).total : 0),
  };

  // ── Extended stats — DB (historical), boosted with live month's active days ─
  const gainStats   = hasLocalData ? getMemberGainStats(circle.id, viewerId) : null;
  const streakStats = hasLocalData ? getCompletionStreakStats(circle.id, viewerId) : null;

  // If the DB has no data but the snapshot does, compute active days for this
  // month from the live deltas so Activity Stats isn't entirely zeroed out.
  const liveActiveDaysThisMonth = snapshotMember?.deltas
    ? snapshotMember.deltas.filter(d => d > 0).length
    : 0;

  // ── Total fans ────────────────────────────────────────────────────────────
  const localTotalFans = hasLocalData ? getLatestTotalFans(circle.id, viewerId) : 0;
  const totalFans = localTotalFans || pastProfile?.totalFans || 0;

  // ── Monthly history — merge SQLite (detailed) + PastHistoryTrainer.md ─────
  const dbMonthly  = hasLocalData ? getMemberMonthlyHistoryDetailed(circle.id, viewerId) : [];
  const mdMonthly  = pastProfile?.monthlyHistory ?? [];

  const mergedMonths = new Map();
  for (const row of mdMonthly) {
    mergedMonths.set(row.month, {
      month:      row.month,
      totalGain:  row.totalGain,
      activeDays: null,
      bestDay:    null,
      milestone:  row.milestone ?? null,
    });
  }
  for (const row of dbMonthly) {
    if (!mergedMonths.has(row.month) || row.totalGain > 0) {
      const existing = mergedMonths.get(row.month);
      mergedMonths.set(row.month, {
        month:      row.month,
        totalGain:  row.totalGain > 0 ? row.totalGain : (existing?.totalGain ?? 0),
        activeDays: row.activeDays ?? null,
        bestDay:    row.bestDay    ?? null,
        milestone:  existing?.milestone ?? null,
      });
    }
  }

  // ── Quota ─────────────────────────────────────────────────────────────────
  const monthlyReq   = await getMonthlyReq(interaction.guildId, circle.id);
  const dailyTarget  = Math.round(monthlyReq / 30);
  const weeklyTarget = Math.round(monthlyReq / 4);

  // ── Milestone badges ──────────────────────────────────────────────────────
  const TIER_MAP   = new Map(TIERS.map(t => [t.key, t]));
  const milestones = viewerId ? getMemberMilestones(viewerId) : [];

  const msByMonth = new Map();
  for (const ms of milestones) {
    const existing = msByMonth.get(ms.month);
    if (!existing) {
      msByMonth.set(ms.month, ms);
    } else {
      const existTier = TIER_MAP.get(existing.tier_key);
      const thisTier  = TIER_MAP.get(ms.tier_key);
      if ((thisTier?.threshold ?? 0) > (existTier?.threshold ?? 0)) {
        msByMonth.set(ms.month, ms);
      }
    }
  }

  const currentMonthStr = (() => {
    const n = new Date();
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`;
  })();

  const monthlyHistory = [...mergedMonths.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(row => ({
      month:      row.month,
      totalGain:  row.totalGain,
      activeDays: row.activeDays,
      bestDay:    row.bestDay,
      milestone:  msByMonth.get(row.month) ?? row.milestone ?? null,
      isCurrent:  row.month === currentMonthStr,
    }));

  // ── Derived stats ─────────────────────────────────────────────────────────
  const completedMonths = monthlyHistory.filter(r => !r.isCurrent && r.totalGain >= monthlyReq).length;
  const avgPerMonth = monthlyHistory.length > 0
    ? Math.round(monthlyHistory.reduce((s, r) => s + r.totalGain, 0) / monthlyHistory.length)
    : 0;

  // ── Circle stats from snapshot ────────────────────────────────────────────
  const circleStats = circleSnapshot?.circle ?? null;

  // ── Render ────────────────────────────────────────────────────────────────
  const dateLabel = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo',
  });

  const buf = await renderProfile({
    trainerName,
    viewerId,
    circleName:  circle.name,
    date:        dateLabel,
    totalFans,

    joinedAtIso,
    daysInCircle,

    currentDailyGain,
    currentWeeklyGain,
    currentMonthlyGain,
    monthlyReq,
    dailyTarget,
    weeklyTarget,

    rolling3d:   rolling3d.total,
    rolling7d:   currentWeeklyGain,
    rolling30d:  rolling30d.total,

    hasGainData:     (gainStats?.totalDays ?? 0) > 0 || liveActiveDaysThisMonth > 0,
    activeDays:      gainStats?.successfulDays ?? liveActiveDaysThisMonth,
    pbDaily:         gainStats?.pbDaily        ?? 0,
    pbMonthly:       gainStats?.pbMonthly      ?? 0,
    pbWeekly:        gainStats?.pbWeekly       ?? 0,
    streakCurrent:   streakStats?.current      ?? 0,
    streakLongest:   streakStats?.longest      ?? 0,
    hasPerfectMonth: streakStats?.hasPerfectMonth ?? false,

    avgPerMonth,
    completedMonths,
    lifetimeTotal: totalFans,

    monthlyHistory,
    TIER_MAP,

    // Live API additions
    trainerProfile,   // { team_class, win_count, white_count, parent_rank, affinity, blue_stars, pink_stars, green_stars, white_stars, trophy }
    circleStats,      // { monthly_rank, live_rank, monthly_point, last_month_rank, last_month_point, live_points }

    stadiumData: viewerId ? (getStadiumCache(viewerId)?.data ?? null) : null,

    // Inheritance parent portraits + skill names
    inheritanceData: trainerProfile ? {
      main:  { name: charNameById(trainerProfile.main_parent_id),  icon: charIconUrl(trainerProfile.main_parent_id)  },
      left:  { name: charNameById(trainerProfile.parent_left_id),  icon: charIconUrl(trainerProfile.parent_left_id)  },
      right: { name: charNameById(trainerProfile.parent_right_id), icon: charIconUrl(trainerProfile.parent_right_id) },
      affinity:    trainerProfile.affinity    ?? null,
      win_count:   trainerProfile.win_count   ?? null,
      white_count: trainerProfile.white_count ?? null,
      parent_rank: trainerProfile.parent_rank ?? null,
      blue_stars:  trainerProfile.blue_stars  ?? 0,
      pink_stars:  trainerProfile.pink_stars  ?? 0,
      green_stars: trainerProfile.green_stars ?? 0,
      white_stars: trainerProfile.white_stars ?? 0,
      blue_count:  (trainerProfile.blue_sparks  ?? []).length,
      pink_count:  (trainerProfile.pink_sparks  ?? []).length,
      green_count: (trainerProfile.green_sparks ?? []).length,
      skill_names: trainerProfile.skill_names  ?? {},
    } : null,
  });

  const reply = await interaction.editReply({
    files: [bufferToAttachment(buf, buildReportFilename('Profile', trainerName))],
  });
  deleteAfter(reply);
}
