/**
 * scripts/testInheritanceRender.js
 * Quick render test for the Inheritance section using hardcoded data.
 * Usage: node scripts/testInheritanceRender.js
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DISCORD_TOKEN = 'test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '..', 'attached_assets', 'inheritance_test.png');

const { renderProfile } = await import('../fantracking/reports/profile.js');

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonth(ym) { const [y,m]=ym.split('-'); return `${MONTH_NAMES[parseInt(m,10)-1]} ${y}`; }

const buf = await renderProfile({
  trainerName:  'Koeru',
  viewerId:     '612856830731',
  circleName:   'UmaKraft',
  date:         'Jul 13, 2026',
  totalFans:    307_580_370,

  joinedAtIso:  '2025-09-01T00:00:00.000Z',
  daysInCircle: 315,

  currentDailyGain:   1_234_567,
  currentWeeklyGain:  8_765_432,
  currentMonthlyGain: 23_004_564,
  monthlyReq:         30_000_000,
  dailyTarget:        null,
  weeklyTarget:       null,

  rolling3d:  4_432_027,
  rolling7d:  8_765_432,
  rolling30d: 15_331_819,

  hasGainData:     true,
  activeDays:      247,
  pbDaily:         3_954_441,
  pbMonthly:       64_724_964,
  pbWeekly:        12_000_000,
  streakCurrent:   5,
  streakLongest:   31,
  hasPerfectMonth: false,

  avgPerMonth:    28_000_000,
  completedMonths: 4,
  lifetimeTotal:  307_580_370,

  monthlyHistory: [
    { month:'2025-09', totalGain:18_363_438, activeDays:27, milestone:null, isCurrent:false },
    { month:'2025-10', totalGain:32_898_882, activeDays:29, milestone:{ tier_key:'30m' }, isCurrent:false },
    { month:'2025-11', totalGain:13_887_956, activeDays:24, milestone:null, isCurrent:false },
    { month:'2025-12', totalGain:14_638_995, activeDays:24, milestone:null, isCurrent:false },
    { month:'2026-01', totalGain:11_926_967, activeDays:21, milestone:null, isCurrent:false },
    { month:'2026-02', totalGain:19_220_059, activeDays:25, milestone:null, isCurrent:false },
    { month:'2026-03', totalGain:64_724_964, activeDays:31, milestone:{ tier_key:'60m' }, isCurrent:false },
    { month:'2026-04', totalGain:62_803_503, activeDays:30, milestone:{ tier_key:'60m' }, isCurrent:false },
    { month:'2026-05', totalGain:46_111_042, activeDays:30, milestone:{ tier_key:'30m' }, isCurrent:false },
    { month:'2026-06', totalGain:23_004_564, activeDays:28, milestone:null, isCurrent:false },
    { month:'2026-07', totalGain:5_432_100,  activeDays:13, milestone:null, isCurrent:true  },
  ],
  TIER_MAP: new Map([
    ['30m', { key:'30m', theme:{ accent:'#ec407a', icon:'🌸' }, achievement:{ title:'30M' } }],
    ['60m', { key:'60m', theme:{ accent:'#f59e0b', icon:'⭐' }, achievement:{ title:'60M' } }],
  ]),

  trainerProfile: null,
  circleStats: {
    monthly_rank: 42, live_rank: 38,
    monthly_point: 23_004_564, last_month_rank: 51,
    last_month_point: 46_111_042, live_points: 5_432_100,
  },
  stadiumData: null,

  // ── NEW: Inheritance data ─────────────────────────────────────────────────
  inheritanceData: {
    main:  { name: 'Taiki Shuttle',        icon: 'https://gametora.com/images/umamusume/characters/taiki-shuttle.webp' },
    left:  { name: 'Oguri Cap (X\'mas)',   icon: 'https://gametora.com/images/umamusume/characters/oguri-cap.webp' },
    right: { name: 'Nishino Flower',       icon: 'https://gametora.com/images/umamusume/characters/nishino-flower.webp' },
    affinity:    102,
    win_count:   16,
    white_count: 23,
    parent_rank: 15532,
    blue_stars:  9,
    pink_stars:  5,
    green_stars: 5,
    white_stars: 44,
    blue_count:  1,
    pink_count:  2,
    green_count: 3,
    skill_names: {
      blue:  ['Power'],
      pink:  ['Pace Chaser', 'Turf'],
      green: ['Shooting for Victory!', 'Festive Miracle', 'Budding Blossom'],
      white: [
        'Oka Sho', 'Yasuda Kinen', 'Ramp Up', 'Nimble Navigator',
        'Tactical Tweak', 'Ignited Spirit: Power+', 'Unity Cup', 'Osaka Hai',
        'Victoria Mile', 'Kikuka Sho', 'Mile Ch.', 'Hopeful S.',
        'Nakayama Racecourse', 'Corner Recovery', 'Straightaway Adept',
        'Prepared to Pass', 'Up-Tempo', 'Slipstream', 'TS Climax Scenario',
        'Corner Adept', 'Straightaway Recovery', 'Straight Descent', 'Pace Chaser Savvy',
      ],
    },
  },
});

writeFileSync(OUTPUT, buf);
console.log('Written to', OUTPUT);
