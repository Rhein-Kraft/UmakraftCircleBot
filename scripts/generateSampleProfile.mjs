/**
 * scripts/generateSampleProfile.mjs
 * Run: DISCORD_TOKEN=dummy CIRCLE_ID=999 node scripts/generateSampleProfile.mjs
 *
 * Generates a real /profile card for a member from docs-notes/PastHistoryTrainer.md
 * and saves it to attached_assets/sample_profile.png
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Use Monmon (538892445749) — has data Jul 2025 → Jun 2026
const TARGET_ID = '538892445749';

const { getPastProfile } = await import('../umamoe/history/pastHistoryReader.js');
const { TIERS }          = await import('../tasks/milestone-tiers.js');
const { renderProfile }  = await import('../fantracking/reports/profile.js');

const pastProfile = getPastProfile(TARGET_ID);
if (!pastProfile) {
  console.error('Profile not found — check the trainer ID');
  process.exit(1);
}

console.log(`Loaded profile: ${pastProfile.name} (${pastProfile.trainerId})`);
console.log(`Monthly history entries: ${pastProfile.monthlyHistory.length}`);

const TIER_MAP = new Map(TIERS.map(t => [t.key, t]));

const currentMonthStr = new Date().toISOString().slice(0, 7);

const monthlyHistory = pastProfile.monthlyHistory.map(row => ({
  month:     row.month,
  totalGain: row.totalGain,
  milestone: row.milestone,
  isCurrent: row.month === currentMonthStr,
}));

const totalFans   = pastProfile.totalFans ?? 0;
const lifetimeTotal = monthlyHistory.reduce((s, r) => s + r.totalGain, 0);
const bestMonth   = monthlyHistory.length
  ? monthlyHistory.reduce((b, r) => r.totalGain > b.totalGain ? r : b)
  : null;

const joinedAtIso = pastProfile.joined ? `${pastProfile.joined}-01` : null;
const daysInCircle = joinedAtIso
  ? Math.max(0, Math.floor((Date.now() - new Date(joinedAtIso).getTime()) / 86_400_000))
  : 0;

const profileData = {
  trainerName:   pastProfile.name,
  circleName:    'Uma Circle',
  date:          new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' }),

  totalFans,
  lifetimeTotal,

  joinedAtIso,
  daysInCircle,

  currentDailyGain:   1_240_000,
  currentWeeklyGain:  8_550_000,
  currentMonthlyGain: monthlyHistory.find(r => r.isCurrent)?.totalGain ?? 34_676_553,
  monthlyReq:         50_000_000,

  monthlyHistory,
  TIER_MAP,
};

console.log('Rendering...');
const buf = await renderProfile(profileData);

const outPath = path.join(ROOT, 'attached_assets', 'sample_profile.png');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, buf);
console.log(`Saved → ${outPath}`);
console.log(`Months shown: ${monthlyHistory.map(r => r.month).join(', ')}`);
