/**
 * scripts/generateLiveProfile.js
 * ────────────────────────────────
 * Generates a profile card PNG by merging live uma.moe data with local
 * SQLite history (CSV-imported) — identical data sources to the /profile
 * Discord command, but runnable standalone without Discord.
 *
 * Usage:
 *   node scripts/generateLiveProfile.js [trainerNameOrId] [circleId] [outputPath]
 *
 * Examples:
 *   node scripts/generateLiveProfile.js                          # first member of first circle
 *   node scripts/generateLiveProfile.js Koeru                   # search by name
 *   node scripts/generateLiveProfile.js 612856830731            # search by trainer ID
 *   node scripts/generateLiveProfile.js Koeru 974470619 out.png
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT   = path.dirname(__dirname);

// ── CLI args ──────────────────────────────────────────────────────────────────
const ARG_TRAINER = process.argv[2] ?? null;   // name or numeric ID, optional
const ARG_CIRCLE  = process.argv[3] ?? null;   // circle ID, optional
const ARG_OUTPUT  = process.argv[4]
  ?? path.join(PROJECT, 'attached_assets', 'live_profile.png');

// ── Load token (needed for Discord avatar fetch + config bootstrapping) ───────
const { loadToken } = await import('../core/tokenLoader.js');
const BOT_TOKEN = await loadToken();           // sets process.env.DISCORD_TOKEN

// ── Init DBs ──────────────────────────────────────────────────────────────────
mkdirSync(path.join(PROJECT, process.env.DATA_DIR ?? 'data'), { recursive: true });
mkdirSync(path.dirname(ARG_OUTPUT), { recursive: true });

const { initCircleDb }              = await import('../db/circleDb.js');
const { initLinksDb, getDiscordIdByViewerId } = await import('../db/linksDb.js');
const { store }                     = await import('../core/store.js');
const { initMilestoneDb, getMemberMilestones } = await import('../db/milestoneDb.js');
const { initAchievementDb }         = await import('../db/achievementDb.js');
const { initAttendanceDb }          = await import('../db/attendanceDb.js');
const { initLeaderboardSnapshotDb } = await import('../db/leaderboardSnapshotDb.js');
const { initWarningDb }             = await import('../db/warningDb.js');
const { getMemberGainStats, getMemberMonthlyHistory } = await import('../db/storeDb.js');

initCircleDb();
initLinksDb();
await store.init();
initMilestoneDb();
initAchievementDb();
initAttendanceDb();
initLeaderboardSnapshotDb();
initWarningDb();

// ── Resolve circle ────────────────────────────────────────────────────────────
const { getConfiguredCircles, config } = await import('../core/config.js');
const { resolveQuota }                 = await import('../core/quotaKeys.js');

const circles = getConfiguredCircles();
const circle  = ARG_CIRCLE
  ? (circles.find(c => c.id === ARG_CIRCLE) ?? circles[0])
  : circles[0];

console.log(`Circle: ${circle.name} (${circle.id})`);

// ── Fetch live uma.moe snapshot ───────────────────────────────────────────────
const { getCircleSnapshot } = await import('../core/uma.js');

console.log('Fetching live circle snapshot from uma.moe…');
let snapshot;
try {
  snapshot = await getCircleSnapshot(circle.id);
} catch (err) {
  console.error('Failed to fetch uma.moe snapshot:', err.message);
  process.exit(1);
}

console.log(`Snapshot: ${snapshot.members.length} member(s) in ${snapshot.circle.name}`);

// ── Resolve trainer from snapshot ─────────────────────────────────────────────
let member = null;

if (ARG_TRAINER) {
  const isId = /^\d{6,}$/.test(ARG_TRAINER.trim());
  if (isId) {
    member = snapshot.members.find(m => String(m.trainerId) === ARG_TRAINER.trim());
  }
  if (!member) {
    const needle = ARG_TRAINER.toLowerCase();
    member =
      snapshot.members.find(m => m.trainerName.toLowerCase() === needle) ||
      snapshot.members.find(m => m.trainerName.toLowerCase().includes(needle));
  }
  if (!member) {
    console.error(`Trainer "${ARG_TRAINER}" not found in snapshot.`);
    console.error('Available:', snapshot.members.map(m => m.trainerName).join(', '));
    process.exit(1);
  }
} else {
  member = snapshot.members[0];
}

const viewerId = String(member.trainerId);
console.log(`Trainer: ${member.trainerName} (${viewerId})`);

// ── Quota (monthly requirement) ───────────────────────────────────────────────
const guildCfg   = {};   // no guild context in standalone mode
const monthlyReq = resolveQuota(guildCfg, circle.id, 'monthly', config.monthlyRequirement);

// ── Local DB: gain stats ──────────────────────────────────────────────────────
const gainStats = getMemberGainStats(circle.id, viewerId);

// ── Local DB: milestones → annotate monthly history ──────────────────────────
const { TIERS } = await import('../tasks/milestone-tiers.js');
const TIER_MAP  = new Map(TIERS.map(t => [t.key, t]));
const milestones = getMemberMilestones(viewerId);

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

const monthlyHistory = getMemberMonthlyHistory(circle.id, viewerId).map(row => ({
  month:     row.month,
  totalGain: row.totalGain,
  milestone: msByMonth.get(row.month) ?? null,
  isCurrent: row.month === currentMonthStr,
}));

// ── Summary log ───────────────────────────────────────────────────────────────
console.log(`Monthly history: ${monthlyHistory.length} month(s) in local DB`);
console.log(`Milestones:      ${milestones.length}`);
console.log(`Lifetime total:  ${(gainStats.lifetimeTotal / 1e6).toFixed(1)}M (from DB)`);
console.log(`uma.moe today/weekly/monthly: ${member.todayGain?.toLocaleString() ?? '—'} / ${member.weeklyGain?.toLocaleString() ?? '—'} / ${member.monthlyGain?.toLocaleString() ?? '—'}`);

// ── Discord avatar (optional, requires linked account) ────────────────────────
let avatarBase64 = null;
try {
  const linkedDiscordId = getDiscordIdByViewerId(viewerId);
  if (linkedDiscordId) {
    const apiRes = await fetch(`https://discord.com/api/v10/users/${linkedDiscordId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (apiRes.ok) {
      const user = await apiRes.json();
      if (user.avatar) {
        const avatarUrl = `https://cdn.discordapp.com/avatars/${linkedDiscordId}/${user.avatar}.png?size=128`;
        const imgRes = await fetch(avatarUrl);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          avatarBase64 = `data:image/png;base64,${buf.toString('base64')}`;
          console.log(`Avatar loaded from Discord for ${user.username}`);
        }
      } else {
        console.log('Discord user found but has no custom avatar.');
      }
    } else {
      console.warn(`Discord API returned ${apiRes.status} — avatar skipped.`);
    }
  } else {
    console.log('No linked Discord account — rendering without avatar.');
  }
} catch (err) {
  console.warn('Avatar fetch failed (non-fatal):', err.message);
}

// ── Derive joining info from uma.moe snapshot ─────────────────────────────────
const joinedAtIso  = member.joinedAt ?? null;
const daysInCircle = joinedAtIso
  ? Math.max(0, Math.floor((Date.now() - new Date(joinedAtIso).getTime()) / 86_400_000))
  : 0;

const dateLabel = new Date().toLocaleDateString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo',
});

// ── Render ────────────────────────────────────────────────────────────────────
const { renderProfile } = await import('../utils/reports/profile.js');

console.log('\nRendering profile image…');

const buffer = await renderProfile({
  // ── Identity (from uma.moe) ──────────────────────────────────────────────
  trainerName: member.trainerName,
  circleName:  snapshot.circle.name,
  date:        dateLabel,
  totalFans:   member.totalLifetimeFans ?? 0,

  // ── Tracking info (uma.moe joined date) ─────────────────────────────────
  joinedAtIso,
  daysInCircle,

  // ── Current gains (uma.moe live) ────────────────────────────────────────
  currentDailyGain:   member.hasData ? (member.todayGain   ?? 0) : 0,
  currentWeeklyGain:  member.hasData ? (member.weeklyGain  ?? 0) : 0,
  currentMonthlyGain: member.hasData ? (member.monthlyGain ?? 0) : 0,
  monthlyReq,

  // ── All-time records (local DB) ──────────────────────────────────────────
  lifetimeTotal: gainStats.lifetimeTotal,

  // ── Full monthly history + milestone badges (local DB) ──────────────────
  monthlyHistory,
  TIER_MAP,

  // ── Optional avatar ──────────────────────────────────────────────────────
  avatarBase64: avatarBase64 ?? undefined,
});

writeFileSync(ARG_OUTPUT, buffer);
console.log(`\n✅ Profile saved → ${ARG_OUTPUT}`);
