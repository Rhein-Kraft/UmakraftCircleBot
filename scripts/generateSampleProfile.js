/**
 * scripts/generateSampleProfile.js
 * ──────────────────────────────────
 * Generates a profile card PNG for a given trainer ID without Discord.
 *
 * Usage: node scripts/generateSampleProfile.js [trainerId] [outputPath]
 * Default: Koeru (612856830731) → attached_assets/sample_profile.png
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT   = path.dirname(__dirname);

// ── CLI ───────────────────────────────────────────────────────────────────────
const TRAINER_ID  = process.argv[2] || '612856830731';
const CIRCLE_ID   = process.env.CIRCLE_ID || '974470619';
const OUTPUT_PATH = process.argv[3] || path.join(PROJECT, 'attached_assets', 'sample_profile.png');

// ── Load the real token FIRST so config.js and Discord API both get it ────────
const { loadToken } = await import('../core/tokenLoader.js');
const BOT_TOKEN = await loadToken(); // sets process.env.DISCORD_TOKEN

// ── Init DBs (must mirror what index.js does) ─────────────────────────────────
mkdirSync(path.join(PROJECT, process.env.DATA_DIR || 'data'), { recursive: true });

const { initCircleDb }             = await import('../db/circleDb.js');
const { initLinksDb }              = await import('../db/linksDb.js');
const { store }                    = await import('../core/store.js');
const { initMilestoneDb }          = await import('../db/milestoneDb.js');
const { initAchievementDb }        = await import('../db/achievementDb.js');
const { initAttendanceDb }         = await import('../db/attendanceDb.js');
const { initLeaderboardSnapshotDb }= await import('../db/leaderboardSnapshotDb.js');
const { initWarningDb }            = await import('../db/warningDb.js');

initCircleDb();
initLinksDb();
await store.init();
initMilestoneDb();
initAchievementDb();
initAttendanceDb();
initLeaderboardSnapshotDb();
initWarningDb();

// ── DB functions ──────────────────────────────────────────────────────────────
const {
  getMembers, getMemberGainStats, getCurrentMonthGain,
  getCompletionStreakStats, getMonthsPlayed, getMemberMonthlyHistory,
} = await import('../db/storeDb.js');
const { getMemberMilestones }            = await import('../db/milestoneDb.js');
const { getMemberAchievements, getAchievementSummary } = await import('../db/achievementDb.js');
const { getPersonalBest, getNo1Finishes, getAvgMonthlyRank } = await import('../db/leaderboardSnapshotDb.js');
const { getWarningRecoveryCount }        = await import('../db/warningDb.js');
const { getStreak, getMaxStreak }        = await import('../db/attendanceDb.js');
const { TIERS }                          = await import('../tasks/milestone-tiers.js');
const { renderProfile }                  = await import('../utils/reports/profile.js');

// ── Fetch member data ─────────────────────────────────────────────────────────
const members = getMembers(CIRCLE_ID);
const member  = members[TRAINER_ID];

if (!member) {
  console.error(`Trainer ${TRAINER_ID} not found in circle ${CIRCLE_ID}. Available:`, Object.keys(members).slice(0, 5));
  process.exit(1);
}

console.log(`Generating profile for: ${member.trainerName} (${TRAINER_ID})`);

// ── Replicate commands/profile.js data assembly ───────────────────────────────

const primaryCircle = { id: CIRCLE_ID, name: 'UmaKraft' };
const primaryMember = member;
const viewerId      = TRAINER_ID;
const firstSeenAt   = primaryMember.firstSeenAt || primaryMember.joinedAt || new Date().toISOString();
const daysInCircle  = Math.max(0, Math.floor((Date.now() - new Date(primaryMember.joinedAt || firstSeenAt).getTime()) / 86400000));

const primaryGain = getCurrentMonthGain(CIRCLE_ID, viewerId);

// Combined stats (single circle for now)
const gainStats = getMemberGainStats(CIRCLE_ID, viewerId);
const combined = {
  lifetimeTotal:  gainStats.lifetimeTotal,
  pbDaily:        gainStats.pbDaily,
  pbWeekly:       gainStats.pbWeekly,
  pbMonthly:      gainStats.pbMonthly,
  successfulDays: gainStats.successfulDays,
  totalDays:      gainStats.totalDays,
};

const streakStats    = getCompletionStreakStats(CIRCLE_ID, viewerId);
const completionRate = combined.totalDays > 0
  ? Math.round((combined.successfulDays / combined.totalDays) * 100)
  : 0;

// Milestones
const TIER_MAP       = new Map(TIERS.map(t => [t.key, t]));
const milestones     = getMemberMilestones(viewerId);
const earnedTierKeys = new Set(milestones.map(m => m.tier_key));
const specialCount   = milestones.filter(m => TIER_MAP.get(m.tier_key)?.special).length;

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

const monthlyHistory = getMemberMonthlyHistory(CIRCLE_ID, viewerId).map(row => ({
  month:     row.month,
  totalGain: row.totalGain,
  milestone: msByMonth.get(row.month) ?? null,
  isCurrent: row.month === currentMonthStr,
}));

const highestMilestone = milestones.length > 0
  ? milestones.reduce((best, m) => {
      const t  = TIER_MAP.get(m.tier_key);
      const bt = TIER_MAP.get(best.tier_key);
      return (t?.threshold ?? 0) > (bt?.threshold ?? 0) ? m : best;
    })
  : null;

// Achievements
const achievements       = getMemberAchievements(viewerId);
const achievementSummary = getAchievementSummary(viewerId);

// Personal bests
let bestDailyRank = null, bestWeeklyRank = null, bestMonthlyRank = null;
for (const [scope, ref] of [['daily', 'bestDailyRank'], ['weekly', 'bestWeeklyRank'], ['monthly', 'bestMonthlyRank']]) {
  const pb = getPersonalBest(CIRCLE_ID, scope, viewerId);
  if (pb) {
    if (ref === 'bestDailyRank')   bestDailyRank   = pb.bestRank;
    if (ref === 'bestWeeklyRank')  bestWeeklyRank  = pb.bestRank;
    if (ref === 'bestMonthlyRank') bestMonthlyRank = pb.bestRank;
  }
}

const totalMonthsPlayed   = getMonthsPlayed(CIRCLE_ID, viewerId);
const totalNo1Finishes    = getNo1Finishes(CIRCLE_ID, viewerId);
const avgMonthlyRankValue = getAvgMonthlyRank(CIRCLE_ID, viewerId);

const fastestMilestoneUnlock = milestones.length > 0
  ? Math.min(...milestones.map(m => new Date(m.fired_at).getUTCDate()))
  : null;

// Grade
const sortedTiers = [...TIERS].sort((a, b) => a.threshold - b.threshold);
const nextTier    = sortedTiers.find(t => t.threshold > primaryGain) ?? null;
const progressPct = nextTier
  ? Math.min(99, Math.round((primaryGain / nextTier.threshold) * 100))
  : 100;

const lifetimeB = combined.lifetimeTotal / 1e9;
const grade =
  lifetimeB >= 1    ? 'S+' :
  lifetimeB >= 0.5  ? 'S'  :
  lifetimeB >= 0.25 ? 'A+' :
  lifetimeB >= 0.1  ? 'A'  :
  lifetimeB >= 0.05 ? 'B'  : 'C';

// Status
const now        = new Date();
const dayOfMonth = now.getUTCDate();
const daysInMon  = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
let status = 'unknown';
if (nextTier) {
  const targetPct  = (primaryGain / nextTier.threshold) * 100;
  const elapsedPct = (dayOfMonth / daysInMon) * 100;
  if      (targetPct >= 100)               status = 'complete';
  else if (targetPct >= elapsedPct * 0.90) status = 'on_pace';
  else if (targetPct >= elapsedPct * 0.65) status = 'behind';
  else                                     status = 'critical';
} else {
  status = 'on_pace';
}

// Badge/title from highest milestone
let currentBadge = '🏅';
let currentTitle  = 'Circle Member';
if (highestMilestone) {
  const tier = TIER_MAP.get(highestMilestone.tier_key);
  if (tier?.achievement) {
    currentBadge = tier.theme?.icon ?? '🏆';
    currentTitle  = tier.achievement.title;
  }
}

// Honors
const honors = [];
if (daysInCircle >= 90)                           honors.push('Circle Veteran');
if (milestones.length >= 5)                       honors.push('Milestone Hunter');
if (streakStats.longest >= 7)                     honors.push('Perfect Week');
if (streakStats.hasPerfectMonth)                  honors.push('Perfect Month');
if (bestDailyRank === 1 || bestMonthlyRank === 1) honors.push('Top Performer');

console.log(`Monthly history: ${monthlyHistory.length} months`);
console.log(`Milestones: ${milestones.length} | Lifetime: ${(combined.lifetimeTotal / 1e6).toFixed(1)}M | Grade: ${grade}`);
monthlyHistory.forEach(h =>
  console.log(`  ${h.month}: ${(h.totalGain / 1e6).toFixed(1)}M${h.milestone ? ` [${h.milestone.tier_key}]` : ''}`)
);

// ── Load avatar from Discord via bot token ────────────────────────────────────
let avatarBase64 = null;
try {
  const { getDiscordIdByViewerId } = await import('../db/linksDb.js');
  const linkedDiscordId = getDiscordIdByViewerId(TRAINER_ID);

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
          console.log(`Avatar loaded from Discord for user ${user.username}.`);
        }
      } else {
        console.log(`Discord user found but has no custom avatar.`);
      }
    } else {
      console.warn(`Discord API returned ${apiRes.status} — avatar skipped.`);
    }
  } else {
    console.log('No linked Discord account found for this trainer — rendering without avatar.');
  }
} catch (err) {
  console.warn('Avatar fetch failed (non-fatal):', err.message);
}

// ── Render ────────────────────────────────────────────────────────────────────
console.log('\nRendering profile image...');

const buffer = await renderProfile({
  avatarBase64,
  displayName:     primaryMember.trainerName,
  trainerName:     primaryMember.trainerName,
  viewerId,
  circleName:      primaryCircle.name,
  circleCount:     1,
  grade,
  currentBadge,
  currentTitle,
  linkedAt:        null,
  linkedDaysAgo:   null,
  joinedAtIso:     primaryMember.joinedAt ?? firstSeenAt,
  daysInCircle,
  lastSyncHoursAgo: 0,
  syncCount:       primaryMember.syncCount ?? 0,

  milestones,
  highestMilestone,
  earnedTierKeys,
  specialCount,
  TIER_MAP,

  currentStreak:   streakStats.current,
  longestStreak:   streakStats.longest,
  hasPerfectMonth: streakStats.hasPerfectMonth,
  discordStreak:   0,
  discordMaxStreak: 0,
  completionRate,

  ...combined,
  bestDailyRank,
  bestWeeklyRank,
  bestMonthlyRank,
  currentMonthlyRank: null,
  currentDailyRank:   null,
  currentWeeklyRank:  null,

  currentMonthlyGain: primaryGain,
  currentWeeklyGain:  0,
  currentDailyGain:   0,
  monthlyHistory,
  nextTier,
  progressPct,

  achievements,
  achievementSummary,
  honors,
  recoveries:    getWarningRecoveryCount(CIRCLE_ID, viewerId),
  status,

  totalMonthsPlayed,
  totalNo1Finishes,
  avgMonthlyRank: avgMonthlyRankValue,
  fastestMilestoneUnlock,
});

writeFileSync(OUTPUT_PATH, buffer);
console.log(`\n✅ Profile image saved → ${OUTPUT_PATH}`);
