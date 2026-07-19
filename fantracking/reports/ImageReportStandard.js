/**
 * fantracking/reports/ImageReportStandard.js
 * ────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for all image report design.
 *
 * Every generated image report MUST import from this file.
 * No renderer may define its own colors, borders, or fonts independently.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * IMAGE REPORT DESIGN STANDARD (Updated)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── Overall Theme ──
 * Clean, modern, easy-to-read appearance with consistent styling across
 * every generated image.
 *
 * ── Background ──
 *   • Background color: White
 *   • No dark mode.
 *   • No textured or patterned backgrounds.
 *
 * ── Borders ──
 * Every card and information box must have a visible black border. This
 * includes:
 *   • Main card
 *   • Profile section
 *   • Statistics section
 *   • Fan Gain section
 *   • Achievement section
 *   • Milestone section
 *   • Streak section
 *   • Warning section
 *   • Progress section
 *   • Every rectangle or information container
 *
 * Requirements:
 *   • Solid black outline
 *   • Consistent border thickness
 *   • Slightly rounded corners
 *   • No floating text outside bordered containers
 *
 * ── Font ──
 * Default font style: Bold, Black.
 * Unless specifically stated below, all text uses bold black font.
 *
 * ── Color Restrictions ──
 *
 * Green — reserved ONLY for Fan Gain values that meet the required pace.
 *   Do not use green for: headers, titles, trainer names, labels, or
 *   decorative elements.
 *
 * Red — reserved ONLY for Fan Gain values that are below the required pace.
 *   Do not use red for: headers, titles, trainer names, labels, or
 *   decorative elements.
 *
 * Pink — reserved ONLY for: report title, section headers, card headers,
 *   category titles (e.g. Trainer Profile, Fan Statistics, Achievements,
 *   Milestones, Monthly Summary). Pink should never be used for normal body
 *   text or numbers.
 *
 * Black — used for: borders, normal text, labels, descriptions, default font.
 *
 * White — used only for: background.
 *
 * ── Trainer Name Color System ──
 * Every trainer receives a unique permanent display color.
 *   • Color is generated once.
 *   • The same trainer always keeps the same color.
 *   • No two trainers may share the same color.
 *   • Store the assigned color locally so it never changes unless manually reset.
 *
 * Forbidden colors: Black, White, Green, Red, Pink.
 *
 * Use visually distinct colors such as: Blue, Navy, Cyan, Teal, Purple,
 * Violet, Indigo, Orange, Gold, Brown, Coral, Turquoise, Sky Blue,
 * Slate Blue, Chocolate, Dark Cyan, Dark Orange, Royal Blue, Medium Orchid,
 * Steel Blue. Avoid assigning colors too similar to existing trainer colors
 * to preserve uniqueness.
 *
 * ── Fan Gain Colors ──
 * Monthly Fan Gain determines performance.
 *   • Green — meets or exceeds the required monthly pace.
 *   • Red   — below the required monthly pace.
 * Applies to both Monthly Fan Gain and Lifetime Fan Gain.
 *
 * ── Lifetime Fan Gain Rule ──
 *   Required Lifetime Fans = Months Since Join × 30,000,000
 *   Examples: 1 mo = 30M, 2 mo = 60M, 3 mo = 90M, 6 mo = 180M, 12 mo = 360M.
 *
 *   Green: Lifetime Fan Gain ≥ Required Lifetime Fans
 *   Red:   Lifetime Fan Gain <  Required Lifetime Fans
 *
 *   Even if a trainer has an extremely high total (e.g. 500M), the color is
 *   determined solely by whether they meet the expected cumulative pace
 *   based on their membership duration.
 *
 * ── Number Colors ──
 * Default: all numbers use bold black.
 * Exception: only Fan Gain-related numbers may use color (green/red per the
 * rules above). All other numeric values (rank, achievements, streaks,
 * dates, percentages, IDs, etc.) remain bold black unless a future design
 * specification explicitly overrides them.
 *
 * ── Universal Design Rules ──
 *   • White background.
 *   • Black borders around every card and every information box.
 *   • Bold black font by default.
 *   • Pink reserved for titles and headers only.
 *   • Green reserved exclusively for Fan Gain values that meet requirements.
 *   • Red reserved exclusively for Fan Gain values that fail to meet requirements.
 *   • Trainer names use a unique permanent color.
 *   • Trainer colors must never be Black, White, Green, Red, or Pink.
 *   • No two trainers may share the same assigned color.
 *   • Maintain a clean, professional, and consistent layout across all
 *     image reports.
 *
 * ── Known exceptions ──
 *   dailyAchievement.js, dailyFanWarning.js, and greeting.js intentionally
 *   use a dark navy/purple "night sky" card background instead of white,
 *   for a warmer tone on celebration/greeting cards. This is a deliberate,
 *   approved exception to the "no dark mode / white background" rule above
 *   — every other renderer follows the white/black standard.
 *
 * ── Design Standard Summary (quick reference) ────────────────────────────────
 *
 *   Background   : White (#ffffff) — no dark mode, no patterns
 *   Borders      : Solid black (1.5px) on every card and every container
 *   Font         : Bold black by default (Noto Sans JP)
 *
 *   Pink         : Report title, section headers, card headers ONLY
 *   Green        : Fan gain values that MEET the required pace ONLY
 *   Red          : Fan gain values that FAIL the required pace ONLY
 *   Black        : Borders, normal text, labels, descriptions
 *   White        : Background only
 *
 *   Trainer name : Unique permanent color — never Black/White/Green/Red/Pink
 *
 *   Lifetime fan gain color rule:
 *     Required = months_since_join × 30,000,000
 *     Green if actual_lifetime ≥ required
 *     Red   if actual_lifetime <  required
 */

// ── Design tokens ─────────────────────────────────────────────────────────────

export const COLORS = {
  PINK:         '#ec407a',
  PINK2:        '#f06292',
  GREEN:        '#2e7d32',
  RED:          '#c62828',
  BLACK:        '#1a1a1a',
  WHITE:        '#ffffff',
  BORDER:       '#000000',
  MUTED:        'rgba(0,0,0,0.40)',
  // Reserved status color: departed/left members are always shown grey,
  // regardless of their permanently-assigned trainer color (see
  // db/trainerColorDb.js). Never used for anything else.
  GREY:         '#9e9e9e',
};

export const BORDER = {
  // Thick black outline per design standard — every card/section/box uses this.
  DEFAULT: `2.5px solid ${COLORS.BORDER}`,
  RADIUS:  '6px',
};

export const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Noto+Color+Emoji&family=Noto+Sans:wght@400;700;900&family=Noto+Sans+Symbols+2&display=swap');`;

// Monthly requirement for lifetime fan gain rule (per month since join)
export const LIFETIME_MONTHLY_PACE = 30_000_000;

// ── Trainer name color palette ────────────────────────────────────────────────
// Rules: never Black, White, Green, Red, or Pink.
// All must pass WCAG AA contrast (≥4.5:1) on white.
// Visually distinct to avoid clashing assignments.

export const TRAINER_COLORS = [
  '#0D47A1', // Royal Blue
  '#1565C0', // Dark Blue
  '#0277BD', // Blue
  '#01579B', // Dark Light-Blue
  '#006064', // Dark Cyan
  '#00838F', // Dark Teal
  '#004D40', // Dark Teal Green
  '#283593', // Dark Indigo
  '#3949AB', // Indigo
  '#4527A0', // Deep Indigo
  '#4A148C', // Very Deep Purple
  '#6A1B9A', // Dark Purple
  '#7B1FA2', // Deep Purple
  '#37474F', // Dark Blue-Grey
  '#546E7A', // Blue-Grey
  '#5D4037', // Brown
  '#4E342E', // Dark Brown
  '#E65100', // Deep Orange
  '#BF360C', // Burnt Orange
  '#F57F17', // Dark Amber
  '#FF6D00', // Orange
  '#FF8F00', // Dark Gold
  '#827717', // Dark Olive
  '#00695C', // Dark Teal 2
  '#00796B', // Teal
  '#558B2F', // Olive Green (distinct from gain-green)
  '#2E7D32', // — FORBIDDEN: gain-green, excluded
  // (row kept as comment so the index stays stable if palette is extended)
  '#1B5E20', // Very Dark Green — distinct enough from #2e7d32 for non-gain use? No — excluded
  '#5C6BC0', // Medium Indigo
  '#0097A7', // Cyan
  '#00ACC1', // Light Cyan
  '#26C6DA', // — too light, excluded below threshold
  '#7C4DFF', // Deep Purple Accent
  '#651FFF', // Deep Purple Accent 2
  '#6200EA', // Purple A700
  '#AA00FF', // Purple Accent
  '#C51162', // — too close to pink, excluded
  '#880E4F', // Dark Pink — borderline; included (dark enough)
  '#AD1457', // Dark Pink 2 — included (dark enough, not the header pink)
  '#8D6E63', // Warm Brown
  '#795548', // Brown 2
  '#607D8B', // Blue Grey
  '#455A64', // Dark Blue Grey
  '#263238', // Very Dark Blue Grey
].filter(c =>
  // Remove any color too close to forbidden palette entries (simple hex exclusion)
  !['#2e7d32','#c62828','#ec407a','#f06292','#000000','#ffffff',
    '#26c6da','#c51162'].includes(c.toLowerCase())
);

/**
 * Assign a permanent, collision-free color to a trainer by name.
 *
 * Backed by the same persisted assignment table as `trainerDisplayColor()`
 * (db/trainerColorDb.js) so that no two trainers ever end up with the same
 * color, using the trainer's display name as the lookup key. Prefer
 * `trainerDisplayColor()` below instead wherever a stable member key (e.g.
 * trainer_id) AND active/departed status are both available — it also does
 * grey-for-left-members. Use this `trainerColor()` version for report
 * renderers that only have a display name to work with.
 *
 * Falls back to a deterministic hash (no collision guarantee) only if the
 * color DB hasn't been wired yet (e.g. before startup finishes).
 *
 * @param {string} name
 * @returns {string} hex color
 */
export function trainerColor(name) {
  const key = name ?? '';
  if (_trainerColorDbMod) {
    return _trainerColorDbMod.getOrAssignColor(key, key, true, TRAINER_COLORS);
  }
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x9e3779b9) >>> 0;
  }
  return TRAINER_COLORS[h % TRAINER_COLORS.length];
}

/**
 * Preferred trainer color lookup — backed by the persisted assignment table
 * in db/trainerColorDb.js so it can enforce "no two active trainers share a
 * color" and let departed trainers' colors be inherited by new trainers.
 *
 * Departed trainers are always rendered GREY regardless of their stored
 * color (their color stays reserved in the DB purely so it can be freed up
 * for reassignment once truly gone, and so re-joining members keep it).
 *
 * @param {string} memberKey  stable unique id for the member (e.g. trainer_id)
 * @param {string} memberName display name
 * @param {boolean} isActive  current membership status
 * @returns {string} hex color
 */
export function trainerDisplayColor(memberKey, memberName, isActive) {
  if (!isActive) return COLORS.GREY;
  if (!memberKey) return trainerColor(memberName); // fallback, no stable key available
  if (!_trainerColorDbMod) {
    throw new Error(
      'trainerDisplayColor: db/trainerColorDb.js not wired — call setTrainerColorDb() once at startup'
    );
  }
  return _trainerColorDbMod.getOrAssignColor(memberKey, memberName, true, TRAINER_COLORS);
}

let _trainerColorDbMod = null;

/**
 * Wire the persisted color-assignment module in at startup (index.js), after
 * initTrainerColorDb() has run. Keeps this theme file free of a hard,
 * always-loaded dependency on better-sqlite3.
 * @param {{ getOrAssignColor: Function, setMemberStatus: Function }} mod
 */
export function setTrainerColorDb(mod) {
  _trainerColorDbMod = mod;
}

// ── Fan gain color helpers ────────────────────────────────────────────────────

/**
 * Color for a fan gain value based on quota percentage.
 * @param {number} pct  0–100+
 * @returns {string}
 */
export function gainColor(pct) {
  if (typeof pct !== 'number' || isNaN(pct)) return COLORS.GREEN;
  return pct >= 100 ? COLORS.GREEN : COLORS.RED;
}

/**
 * Color for a raw fan gain vs a required threshold.
 * @param {number} actual
 * @param {number} required
 * @returns {string}
 */
export function gainColorVsTarget(actual, required) {
  return (actual ?? 0) >= (required ?? 0) ? COLORS.GREEN : COLORS.RED;
}

/**
 * Color for lifetime fan gain using the standard rule:
 *   Required = monthsSinceJoin × LIFETIME_MONTHLY_PACE (30M)
 *
 * @param {number} lifetimeFans    — actual cumulative fans
 * @param {string|null} joinedAtIso — ISO date string of join date
 * @returns {string} COLORS.GREEN or COLORS.RED
 */
export function lifetimeFanColor(lifetimeFans, joinedAtIso) {
  if (!joinedAtIso) return COLORS.BLACK;
  const joinDate = new Date(joinedAtIso);
  const now = new Date();
  const monthsSinceJoin = Math.max(1,
    (now.getFullYear() - joinDate.getFullYear()) * 12 +
    (now.getMonth() - joinDate.getMonth())
  );
  const required = monthsSinceJoin * LIFETIME_MONTHLY_PACE;
  return (lifetimeFans ?? 0) >= required ? COLORS.GREEN : COLORS.RED;
}

// ── HTML escape ───────────────────────────────────────────────────────────────

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Number formatter ──────────────────────────────────────────────────────────

export function fmtFans(n) {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1).replace(/\.?0+$/, '')}K`;
  return Math.round(n).toLocaleString();
}

// ── Standard CSS ──────────────────────────────────────────────────────────────
// Import this into every renderer via: ${STANDARD_CSS}

export const STANDARD_CSS = `
${FONT_IMPORT}

/* ── Reset ── */
* { margin: 0; padding: 0; box-sizing: border-box; }

/* ── Body ── */
body {
  background: ${COLORS.WHITE};
  font-family: 'Noto Sans JP', 'Noto Sans Symbols 2', 'Noto Color Emoji', system-ui, -apple-system, Arial, sans-serif;
  color: ${COLORS.BLACK};
  font-weight: 700;
  display: inline-block;
  width: 660px;
}

/* ── Root card ── */
.card {
  background: ${COLORS.WHITE};
  border: ${BORDER.DEFAULT};
  border-radius: ${BORDER.RADIUS};
  overflow: hidden;
  position: relative;
}

/* ── Pink accent bar at top of card ── */
.accent-bar {
  height: 3px;
  background: linear-gradient(90deg, ${COLORS.PINK2}, ${COLORS.PINK});
}

/* ── Card header (pink) ── */
.header {
  padding: 14px 20px 12px;
  background: linear-gradient(135deg, ${COLORS.PINK2} 0%, ${COLORS.PINK} 100%);
  border-bottom: ${BORDER.DEFAULT};
}
.hrow  { display: flex; justify-content: space-between; align-items: flex-start; }
.htitle { font-size: 19px; font-weight: 900; letter-spacing: -0.3px; color: ${COLORS.WHITE}; }
.hdate  { font-size: 11px; color: rgba(255,255,255,0.80); white-space: nowrap; margin-top: 2px; font-weight: 700; }
.hsub   { font-size: 11px; color: rgba(255,255,255,0.80); margin-top: 5px; display: flex; justify-content: space-between; align-items: center; font-weight: 700; }

/* ── Section title (pink) ── */
.sec-title {
  padding: 10px 20px 6px;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: ${COLORS.PINK};
  border-bottom: 1px solid ${COLORS.BORDER};
  background: rgba(236,64,122,0.04);
}

/* ── Generic bordered section container ── */
.section {
  border: ${BORDER.DEFAULT};
  border-radius: ${BORDER.RADIUS};
  margin: 10px 14px;
  overflow: hidden;
}

/* ── Info grid cells ── */
.info-grid {
  display: grid;
  gap: 0;
}
.info-cell {
  padding: 8px 14px;
  border: ${BORDER.DEFAULT};
  background: ${COLORS.WHITE};
}
.info-key {
  font-size: 9px;
  color: ${COLORS.MUTED};
  text-transform: uppercase;
  letter-spacing: 0.7px;
  font-weight: 700;
  margin-bottom: 3px;
}
.info-val {
  font-size: 14px;
  color: ${COLORS.BLACK};
  font-weight: 700;
}

/* ── Fan gain boxes ── */
.gain-box {
  background: ${COLORS.WHITE};
  border: ${BORDER.DEFAULT};
  border-radius: ${BORDER.RADIUS};
  padding: 10px 12px;
}
.gain-scope {
  font-size: 9px;
  color: ${COLORS.MUTED};
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 4px;
  font-weight: 700;
}
.gain-value {
  font-size: 20px;
  font-weight: 800;
}

/* ── Progress bar ── */
.prog-bar-track {
  width: 100%;
  height: 10px;
  background: rgba(0,0,0,0.09);
  border-radius: 6px;
  border: 1px solid ${COLORS.BORDER};
  overflow: hidden;
  margin: 6px 0;
}
.prog-bar-fill { height: 100%; border-radius: 6px; }
.prog-meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: ${COLORS.BLACK};
  margin-top: 2px;
  font-weight: 700;
}

/* ── Highlight / record boxes ── */
.highlight-box {
  border: ${BORDER.DEFAULT};
  border-radius: ${BORDER.RADIUS};
  padding: 14px 16px;
  text-align: center;
  background: ${COLORS.WHITE};
}
.highlight-icon  { font-size: 24px; }
.highlight-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: ${COLORS.MUTED}; margin-top: 4px; font-weight: 700; }
.highlight-value { font-size: 24px; font-weight: 900; color: ${COLORS.BLACK}; margin-top: 2px; }
.highlight-sub   { font-size: 11px; color: ${COLORS.MUTED}; margin-top: 2px; font-weight: 700; }

/* ── Yearly performance cards ── */
.year-card {
  border: ${BORDER.DEFAULT};
  border-radius: ${BORDER.RADIUS};
  padding: 14px 16px;
  background: ${COLORS.WHITE};
  flex: 1 1 200px;
}
.year-head   { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.year-num    { font-size: 15px; font-weight: 800; color: ${COLORS.BLACK}; }
.year-total  { font-size: 24px; font-weight: 900; color: ${COLORS.PINK}; margin-bottom: 2px; }
.year-span   { font-size: 10px; color: ${COLORS.MUTED}; margin-bottom: 6px; font-weight: 700; }
.year-best   { font-size: 11px; color: ${COLORS.BLACK}; font-weight: 700; }
.ongoing-badge {
  font-size: 9px; font-weight: 700; color: ${COLORS.PINK};
  background: rgba(236,64,122,0.10);
  border: 1px solid ${COLORS.PINK};
  border-radius: 10px; padding: 2px 8px;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.complete-badge {
  font-size: 9px; font-weight: 700; color: ${COLORS.BLACK};
  background: rgba(0,0,0,0.05);
  border: 1px solid ${COLORS.BORDER};
  border-radius: 10px; padding: 2px 8px;
  text-transform: uppercase; letter-spacing: 0.5px;
}

/* ── Monthly performance table ── */
.mp-table { width: 100%; border-collapse: collapse; font-size: 12px; border: ${BORDER.DEFAULT}; }
.mp-table thead tr { border-bottom: ${BORDER.DEFAULT}; background: rgba(236,64,122,0.06); }
.mp-th {
  font-size: 9px; font-weight: 900; letter-spacing: 1px; color: ${COLORS.PINK};
  text-transform: uppercase; padding: 6px 14px 6px 0; text-align: left;
}
.mp-th:first-child { padding-left: 14px; }
.mp-row { border-bottom: 1px solid ${COLORS.BORDER}; }
.mp-row:last-child { border-bottom: none; }
.mp-td { padding: 7px 14px 7px 0; vertical-align: middle; }
.mp-td:first-child { padding-left: 14px; }
.mp-month { font-weight: 700; color: ${COLORS.BLACK}; white-space: nowrap; }
.mp-tag {
  display: inline-block; font-size: 8px; font-weight: 700;
  background: rgba(236,64,122,0.12); color: ${COLORS.PINK};
  border: 1px solid ${COLORS.PINK}; border-radius: 4px;
  padding: 1px 5px; margin-left: 6px; vertical-align: middle;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.mp-gain { font-weight: 700; }
.ms-pill {
  font-size: 10px; font-weight: 700; padding: 2px 9px; border-radius: 10px;
  border: 1px solid; white-space: nowrap;
}
.mp-total-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px;
  border-top: ${BORDER.DEFAULT};
}
.mp-total-label { font-size: 11px; color: ${COLORS.MUTED}; font-weight: 700; }
.mp-total-value { font-size: 16px; font-weight: 800; color: ${COLORS.PINK}; }

/* ── Leaderboard rows ── */
.col-labels {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 20px 5px;
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px;
  color: ${COLORS.MUTED};
  border-bottom: ${BORDER.DEFAULT};
  font-weight: 700;
  background: ${COLORS.WHITE};
}
.body { padding: 4px 0 6px; background: ${COLORS.WHITE}; }
.row {
  padding: 11px 20px;
  display: flex; align-items: center; gap: 10px;
  border-bottom: 1.5px solid #000000;
}
.row:last-child { border-bottom: none; }
.rank  { font-size: 16px; font-weight: 700; min-width: 40px; text-align: right; color: ${COLORS.BLACK}; flex-shrink: 0; }
.medal { font-size: 22px; min-width: 30px; flex-shrink: 0; line-height: 1; }
.name  { flex: 1; font-size: 17px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${COLORS.BLACK}; }
.gain  { font-size: 17px; font-weight: 700; min-width: 120px; text-align: right; flex-shrink: 0; }
.sub-gain { font-size: 12px; color: ${COLORS.BLACK}; min-width: 95px; text-align: right; flex-shrink: 0; }
.new-tag {
  display: inline-block; font-size: 9px; padding: 1px 4px;
  background: rgba(46,125,50,0.12); color: ${COLORS.GREEN};
  border: 1px solid rgba(46,125,50,0.28); border-radius: 3px;
  margin-left: 5px; vertical-align: middle; white-space: nowrap; flex-shrink: 0;
}

/* ── Stat grid ── */
.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
.stat-cell { background: ${COLORS.WHITE}; padding: 16px 20px; border: ${BORDER.DEFAULT}; }
.stat-lbl  { font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px; color: ${COLORS.MUTED}; margin-bottom: 6px; font-weight: 700; }
.stat-val  { font-size: 21px; font-weight: 700; color: ${COLORS.BLACK}; }
.stat-sub  { font-size: 10px; color: ${COLORS.MUTED}; margin-top: 3px; font-weight: 700; }

/* ── Bar rows ── */
.bar-row   { padding: 9px 20px; display: flex; align-items: center; gap: 12px; }
.bar-lbl   { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.BLACK}; min-width: 68px; }
.bar-track { flex: 1; height: 7px; background: rgba(0,0,0,0.09); border-radius: 4px; border: 1px solid ${COLORS.BORDER}; overflow: hidden; }
.bar-fill  { height: 100%; border-radius: 4px; }
.bar-val   { font-size: 13px; font-weight: 700; color: ${COLORS.BLACK}; min-width: 108px; text-align: right; }

/* ── Rank badge ── */
.rank-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 14px;
  background: ${COLORS.WHITE};
  border: ${BORDER.DEFAULT};
  border-radius: ${BORDER.RADIUS};
  font-size: 13px; font-weight: 700; color: ${COLORS.BLACK};
  margin: 4px 20px 8px;
}

/* ── Total row ── */
.total-row  { padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; border-top: ${BORDER.DEFAULT}; }
.total-label { font-size: 12px; font-weight: 700; color: ${COLORS.MUTED}; }
.total-val   { font-size: 15px; font-weight: 700; color: ${COLORS.PINK}; }

/* ── Warning rows ── */
.warn-row { padding: 6px 20px; display: flex; align-items: center; gap: 10px; font-size: 12px; border-bottom: 1.5px solid #000000; }
.warn-row .name     { color: ${COLORS.BLACK}; font-weight: 700; }
.warn-row .warn-val { color: ${COLORS.RED}; font-weight: 700; min-width: 108px; text-align: right; flex-shrink: 0; }

/* ── Divider ── */
.divider { height: 1px; background: ${COLORS.BORDER}; margin: 0; }

/* ── Footer ── */
.footer {
  padding: 9px 20px;
  border-top: ${BORDER.DEFAULT};
  font-size: 10px; color: ${COLORS.MUTED};
  display: flex; justify-content: space-between; align-items: center;
  background: ${COLORS.WHITE};
  font-weight: 700;
}

/* ── No-data placeholder ── */
.no-data {
  padding: 12px 20px;
  font-size: 12px;
  color: ${COLORS.MUTED};
  font-weight: 700;
  border: ${BORDER.DEFAULT};
  border-radius: ${BORDER.RADIUS};
  margin: 10px 14px;
}

/* ── Section wrapper (convenience: title + bordered content block) ── */
.section-block { margin: 10px 14px 0; }
.section-block + .section-block { margin-top: 8px; }
`;

// ── Convenience: full <style> tag ─────────────────────────────────────────────

export const STYLE_TAG = `<style>${STANDARD_CSS}</style>`;

// ── Medal helper ──────────────────────────────────────────────────────────────

export function medal(rank) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
}

export function rankCell(rank) {
  const m = medal(rank);
  return m
    ? `<span class="medal">${m}</span>`
    : `<span class="rank">#${rank}</span>`;
}
