/**
 * scripts/renderKoeruProfile.js
 * ──────────────────────────────
 * Generates Koeru's profile card using live uma.moe API data.
 * daily_fans values are cumulative totals — gains are computed as deltas.
 *
 * Usage: node scripts/renderKoeruProfile.js [outputPath]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT   = path.dirname(__dirname);
const OUTPUT    = process.argv[2] ?? path.join(PROJECT, 'attached_assets', 'koeru_profile.png');

mkdirSync(path.dirname(OUTPUT), { recursive: true });
process.env.DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'standalone-render';

const UMA_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: 'https://uma.moe/',
  Origin:  'https://uma.moe',
};

const TRAINER_ID = '612856830731';
const CIRCLE_ID  = '974470619';

// ── Fetch one month of circle data ────────────────────────────────────────────
async function fetchCircleMonth(year, month) {
  const url = `https://uma.moe/api/v4/circles?circle_id=${CIRCLE_ID}&year=${year}&month=${month}`;
  try {
    const res = await fetch(url, { headers: UMA_HEADERS });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

/**
 * Compute per-day gains from cumulative daily_fans array.
 * prevMonthFinal: the last value from the previous month (used for day-1 delta).
 */
function computeGains(dailyFans, prevMonthFinal = null) {
  const fans = (dailyFans ?? []).map(v => Math.max(0, v ?? 0));
  return fans.map((v, i) => {
    if (i === 0) {
      const prev = prevMonthFinal != null ? prevMonthFinal : v;
      return Math.max(0, v - prev);
    }
    return Math.max(0, v - fans[i - 1]);
  });
}

// ── Fetch last 12 months sequentially to get prev-month context ───────────────
console.log('Fetching monthly history from uma.moe…');

const now       = new Date();
const curYear   = now.getUTCFullYear();
const curMonth  = now.getUTCMonth() + 1;
const today     = now.getUTCDate();

// Build list oldest → newest
const monthList = [];
for (let i = 11; i >= 0; i--) {
  let m = curMonth - i;
  let y = curYear;
  while (m <= 0) { m += 12; y--; }
  monthList.push({ year: y, month: m });
}

const payloads = await Promise.all(monthList.map(({ year, month }) => fetchCircleMonth(year, month)));

// ── Build monthly history ──────────────────────────────────────────────────────
const monthlyHistory = [];
let prevMonthFinal = null;
let totalFans      = 0;
let joinedAt       = null;

const currentMonthStr = `${curYear}-${String(curMonth).padStart(2, '0')}`;

for (let i = 0; i < monthList.length; i++) {
  const { year, month } = monthList[i];
  const payload  = payloads[i];
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const member = (payload?.members ?? []).find(m => String(m.viewer_id) === TRAINER_ID);

  if (!member) {
    prevMonthFinal = null;
    continue;
  }

  const fans   = (member.daily_fans ?? []).map(v => Math.max(0, v ?? 0));
  const gains  = computeGains(fans, prevMonthFinal);
  const isCurrent = monthKey === currentMonthStr;

  // For current month: sum only up to today
  const limit    = isCurrent ? today : fans.length;
  const totalGain = gains.slice(0, limit).reduce((s, v) => s + v, 0);

  // Last non-zero value = end-of-month total fans
  let lastNonZero = 0;
  for (let j = fans.length - 1; j >= 0; j--) {
    if (fans[j] > 0) { lastNonZero = fans[j]; break; }
  }
  prevMonthFinal = lastNonZero || null;

  if (isCurrent) totalFans = fans[today - 1] || lastNonZero;

  if (totalGain > 0 || isCurrent) {
    monthlyHistory.push({ month: monthKey, totalGain, milestone: null, isCurrent });
  }

  if (member.join_date && !joinedAt) joinedAt = member.join_date;
}

console.log(`Monthly history: ${monthlyHistory.length} months | Total fans: ${(totalFans / 1e6).toFixed(1)}M`);

// ── Current gains from this month ─────────────────────────────────────────────
const curPayload = payloads[payloads.length - 1];
const curMember  = (curPayload?.members ?? []).find(m => String(m.viewer_id) === TRAINER_ID);
const curFans    = (curMember?.daily_fans ?? []).map(v => Math.max(0, v ?? 0));
const prevFinal  = (() => {
  // Find last month's final value
  for (let i = payloads.length - 2; i >= 0; i--) {
    const m = (payloads[i]?.members ?? []).find(m => String(m.viewer_id) === TRAINER_ID);
    if (m) {
      const f = (m.daily_fans ?? []).map(v => Math.max(0, v ?? 0));
      for (let j = f.length - 1; j >= 0; j--) { if (f[j] > 0) return f[j]; }
    }
  }
  return null;
})();

const curGains  = computeGains(curFans, prevFinal);
const monthGain = curGains.slice(0, today).reduce((s, v) => s + v, 0);
const todayGain = curGains[today - 1] ?? 0;
const weekGain  = curGains.slice(Math.max(0, today - 7), today).reduce((s, v) => s + v, 0);
const rolling3d = curGains.slice(Math.max(0, today - 3), today).reduce((s, v) => s + v, 0);

// ── Derived stats ─────────────────────────────────────────────────────────────
const monthlyReq      = 30_000_000;
const dailyTarget     = Math.round(monthlyReq / 30);
const weeklyTarget    = Math.round(monthlyReq / 4);
const completedMonths = monthlyHistory.filter(r => !r.isCurrent && r.totalGain >= monthlyReq).length;
const avgPerMonth     = monthlyHistory.length
  ? Math.round(monthlyHistory.reduce((s, r) => s + r.totalGain, 0) / monthlyHistory.length)
  : 0;
const daysInCircle    = joinedAt
  ? Math.max(0, Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86_400_000))
  : 0;

// Active days = months with any gain (rough approximation without day-level data across history)
const activeDays = monthlyHistory.reduce((s, r) => s + (r.totalGain > 0 ? 1 : 0), 0);

// PB monthly
const pbMonthly = Math.max(...monthlyHistory.map(r => r.totalGain), 0);
const pbDaily   = Math.max(...curGains.slice(0, today), 0);

const dateLabel = now.toLocaleDateString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo',
});

console.log(`Today: ${(todayGain / 1e3).toFixed(0)}K | 7d: ${(weekGain / 1e6).toFixed(1)}M | Month: ${(monthGain / 1e6).toFixed(1)}M`);
console.log(`Quota months: ${completedMonths} | Avg/month: ${(avgPerMonth / 1e6).toFixed(1)}M | PB month: ${(pbMonthly / 1e6).toFixed(1)}M`);

// ── Render ────────────────────────────────────────────────────────────────────
const { renderProfile } = await import('../utils/reports/profile.js');
const { TIERS }         = await import('../tasks/milestone-tiers.js');
const TIER_MAP          = new Map(TIERS.map(t => [t.key, t]));

console.log('\nRendering…');

const buffer = await renderProfile({
  trainerName: 'Koeru',
  viewerId:    TRAINER_ID,
  circleName:  'UmaKraft',
  date:        dateLabel,
  totalFans,

  joinedAtIso:  joinedAt ?? null,
  daysInCircle,

  currentDailyGain:   todayGain,
  currentWeeklyGain:  weekGain,
  currentMonthlyGain: monthGain,
  monthlyReq,
  dailyTarget,
  weeklyTarget,

  rolling3d,
  rolling7d:  weekGain,
  rolling30d: monthGain,

  activeDays,
  pbDaily,
  pbMonthly,
  pbWeekly:   0,

  streakCurrent:   0,
  streakLongest:   0,
  hasPerfectMonth: false,

  avgPerMonth,
  completedMonths,
  lifetimeTotal: totalFans,

  monthlyHistory,
  TIER_MAP,
});

writeFileSync(OUTPUT, buffer);
console.log(`\n✅ Saved → ${OUTPUT}`);
