/**
 * fantracking/reports/profile.js
 * ─────────────────────────────
 * renderProfile — unified member profile card (Pipeline 1 — image generation).
 *
 * Sections:
 *   Header (name, trainer ID, team class, circle, date)
 *   Tracking Info (join date, days in circle, active days)
 *   Circle Status (monthly rank, live rank, monthly fans, last month)
 *   Current Fan Gain (daily / weekly / monthly + progress bar)
 *   Rolling Gains (3d / 7d / 30d)
 *   Activity Stats (streaks, quota months, avg/month)
 *   All-Time Records (best month, PB daily, PB weekly, lifetime)
 *   Trainer Profile (inheritance score, GS wins, white skills, spark stars)
 *   Yearly Performance
 *   Monthly Performance table (gain, active days, avg/day, milestone, quota)
 *   Team Stadium (optional — pass includeStadium: true + stadiumData)
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, gainColor, FONT_IMPORT } from './ImageReportStandard.js';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtFans(n) {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1).replace(/\.?0+$/, '')}K`;
  return Math.round(n).toLocaleString();
}

function fmtRank(n) {
  if (!n || n <= 0) return '—';
  return `#${Number(n).toLocaleString()}`;
}

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo',
  });
}

function pct(raw, target) {
  if (typeof raw !== 'number' || !target || raw <= 0) return 0;
  return Math.min(100, Math.round((raw / target) * 100));
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMonth(ym) {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export async function renderProfile(d) {
  const PINK  = '#ec407a';
  const PINK2 = '#f06292';
  const BLUE  = '#5865f2';
  const TEAL  = '#00b4d8';
  const AMBER = '#f59e0b';
  const GREEN = '#22c55e';
  const GOLD  = '#E65100';

  const history = d.monthlyHistory ?? [];

  /** Show '—' instead of '0' / '0 fans' for any zero or missing fan count. */
  const fmt0 = n => (n != null && n !== 0) ? fmtFans(n) : '—';
  const tp      = d.trainerProfile ?? null;   // trainer inheritance data
  const cs      = d.circleStats ?? null;       // circle rank data

  const bestMonth = history.length
    ? history.reduce((best, r) => (r.totalGain > (best?.totalGain ?? -1) ? r : best), null)
    : null;

  const monthlyPct       = d.monthlyReq > 0 ? Math.min(100, Math.round((d.currentMonthlyGain / d.monthlyReq) * 100)) : 0;
  const monthlyBarColor  = gainColor(monthlyPct);
  const dailyGainColor   = d.dailyTarget  ? gainColor(pct(d.currentDailyGain,   d.dailyTarget))  : PINK;
  const weeklyGainColor  = d.weeklyTarget ? gainColor(pct(d.currentWeeklyGain,  d.weeklyTarget)) : PINK;
  const monthlyGainColor = d.monthlyReq   ? gainColor(monthlyPct)                                 : PINK;

  // ── Team Class badge ──────────────────────────────────────────────────────
  const teamClass = tp?.team_class ?? null;
  const teamClassBadge = teamClass != null
    ? `<span class="class-badge">Class ${teamClass}</span>`
    : '';

  // ── Circle Status section ─────────────────────────────────────────────────
  const hasCircleStats = cs && (cs.monthly_rank || cs.live_rank);
  const circleStatusHtml = hasCircleStats ? `
  <div class="sec-title">🏟 Circle Status</div>
  <div class="cs-grid">
    <div class="cs-box">
      <div class="cs-key">Monthly Rank</div>
      <div class="cs-val">${esc(fmtRank(cs.monthly_rank))}</div>
      <div class="cs-sub">${esc(fmtFans(cs.monthly_point ?? 0))} fans</div>
    </div>
    <div class="cs-box">
      <div class="cs-key">Last Month</div>
      <div class="cs-val">${esc(fmtRank(cs.last_month_rank))}</div>
      <div class="cs-sub">${esc(fmtFans(cs.last_month_point ?? 0))} fans</div>
    </div>
    <div class="cs-box">
      <div class="cs-key">Live Rank</div>
      <div class="cs-val" style="color:${TEAL}">${esc(fmtRank(cs.live_rank))}</div>
      <div class="cs-sub">${esc(fmtFans(cs.live_points ?? 0))} fans</div>
    </div>
    <div class="cs-box">
      <div class="cs-key">Yesterday</div>
      <div class="cs-val" style="color:rgba(0,0,0,0.65)">${esc(fmtRank(cs.yesterday_rank))}</div>
      <div class="cs-sub">${esc(fmtFans(cs.yesterday_points ?? 0))} fans</div>
    </div>
  </div>
  <div class="divider"></div>
  ` : '';

  // ── Trainer Profile / Inheritance section ─────────────────────────────────
  const hasTrainerProfile = tp && (tp.win_count != null || tp.white_count != null || tp.parent_rank != null);
  const trainerProfileHtml = hasTrainerProfile ? (() => {
    const totalStars = (tp.blue_stars ?? 0) + (tp.pink_stars ?? 0) + (tp.green_stars ?? 0) + (tp.white_stars ?? 0);
    const trophyStr  = [
      tp.trophy?.g1  ? `G1 ×${tp.trophy.g1}`  : '',
      tp.trophy?.g2  ? `G2 ×${tp.trophy.g2}`  : '',
      tp.trophy?.g3  ? `G3 ×${tp.trophy.g3}`  : '',
      tp.trophy?.ex  ? `EX ×${tp.trophy.ex}`  : '',
    ].filter(Boolean).join('  ');

    return `
  <div class="sec-title">🧬 Trainer Profile</div>
  <div class="tp-stat-row">
    <div class="tp-stat">
      <div class="tp-key">Parent Score</div>
      <div class="tp-val" style="color:${GOLD}">${tp.parent_rank != null ? tp.parent_rank.toLocaleString() : '—'}</div>
    </div>
    <div class="tp-stat">
      <div class="tp-key">GS Wins</div>
      <div class="tp-val" style="color:${AMBER}">${tp.win_count ?? '—'}</div>
    </div>
    <div class="tp-stat">
      <div class="tp-key">White Skills</div>
      <div class="tp-val" style="color:#9e9e9e">${tp.white_count ?? '—'}</div>
    </div>
    <div class="tp-stat">
      <div class="tp-key">Affinity</div>
      <div class="tp-val" style="color:${PINK}">${tp.affinity ?? '—'}</div>
    </div>
  </div>
  <div class="spark-row">
    <div class="spark-box spark-white">
      <div class="spark-stars">${tp.white_stars ?? 0}</div>
      <div class="spark-label">⬜ White</div>
    </div>
    <div class="spark-box spark-green">
      <div class="spark-stars">${tp.green_stars ?? 0}</div>
      <div class="spark-label">🟢 Green</div>
    </div>
    <div class="spark-box spark-pink">
      <div class="spark-stars">${tp.pink_stars ?? 0}</div>
      <div class="spark-label">🩷 Pink</div>
    </div>
    <div class="spark-box spark-blue">
      <div class="spark-stars">${tp.blue_stars ?? 0}</div>
      <div class="spark-label">🔵 Blue</div>
    </div>
    <div class="spark-box spark-total">
      <div class="spark-stars">${totalStars}</div>
      <div class="spark-label">Total ★</div>
    </div>
  </div>
  ${trophyStr ? `<div class="trophy-row">${esc(trophyStr)}</div>` : ''}
  <div class="divider"></div>
  `;
  })() : '';

  // ── Monthly Performance rows ───────────────────────────────────────────────
  const monthRows = history.map(row => {
    const isBest    = bestMonth && row.month === bestMonth.month;
    const isCurrent = !!row.isCurrent;
    const tier      = row.milestone ? d.TIER_MAP?.get(row.milestone.tier_key) : null;
    const msLabel   = tier?.achievement?.title ?? tier?.key?.toUpperCase() ?? '🏅';
    const tierAccent = tier?.theme?.accent ?? PINK;
    const metQuota  = !isCurrent && row.totalGain >= d.monthlyReq;
    const msCell    = tier
      ? `<span class="ms-pill" style="color:${tierAccent};border-color:${tierAccent}55;background:${tierAccent}12">${tier.theme?.icon ?? '🏅'} ${esc(msLabel)}</span>`
      : `<span style="color:rgba(0,0,0,0.20)">—</span>`;

    const rowBg = isBest    ? 'rgba(255,193,7,0.07)'
                : isCurrent ? 'rgba(236,64,122,0.06)'
                : 'transparent';

    const activeDays = row.activeDays ? row.activeDays : null;
    const avgDay     = (row.activeDays && row.totalGain && row.activeDays > 0)
      ? fmtFans(Math.round(row.totalGain / row.activeDays))
      : (row.totalGain > 0 ? fmtFans(Math.round(row.totalGain / 30)) : '—');

    return `
      <tr class="mp-row" style="background:${rowBg}">
        <td class="mp-td mp-month">${esc(fmtMonth(row.month))}${isCurrent ? '<span class="mp-tag">now</span>' : ''}</td>
        <td class="mp-td mp-gain" style="color:${isBest ? GOLD : '#1a1a1a'}">${isBest ? '💎 ' : ''}${esc(fmt0(row.totalGain))}</td>
        <td class="mp-td mp-days">${activeDays != null ? activeDays : '—'}</td>
        <td class="mp-td mp-avgday">${esc(avgDay)}</td>
        <td class="mp-td mp-ms">${msCell}</td>
        <td class="mp-td mp-quota">${metQuota ? '<span class="quota-tick">✓</span>' : '<span class="quota-cross">✗</span>'}</td>
      </tr>`;
  }).join('');

  const monthlyTotal = history.reduce((s, r) => s + (r.totalGain ?? 0), 0);

  // ── Yearly Performance rollup ─────────────────────────────────────────────
  const now         = new Date();
  const currentYear = now.getUTCFullYear();
  const byYear      = new Map();

  for (const row of history) {
    const year = parseInt(row.month.split('-')[0], 10);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(row);
  }

  const yearCards = [...byYear.keys()].sort((a, b) => a - b).map(year => {
    const rows      = byYear.get(year);
    const total     = rows.reduce((s, r) => s + (r.totalGain ?? 0), 0);
    const isOngoing = year === currentYear;
    const lastMonth = rows[rows.length - 1];
    const lastM     = parseInt(lastMonth.month.split('-')[1], 10) - 1;
    const spanLabel = isOngoing
      ? `${MONTH_NAMES[0]} – ${MONTH_NAMES[lastM]} ${year}`
      : `${MONTH_NAMES[0]} – ${MONTH_NAMES[11]} ${year}`;
    const best = rows.reduce((b, r) => (r.totalGain > (b?.totalGain ?? -1) ? r : b), null);

    return `
      <div class="year-card${isOngoing ? ' ongoing' : ''}">
        <div class="year-head">
          <span class="year-num">${year}</span>
          ${isOngoing
            ? `<span class="ongoing-badge">● Ongoing</span>`
            : `<span class="complete-badge">Complete</span>`}
        </div>
        <div class="year-total">${esc(fmtFans(total))}</div>
        <div class="year-span">${esc(spanLabel)} · ${rows.length} month${rows.length !== 1 ? 's' : ''}</div>
        ${best ? `<div class="year-best">🏆 Best: ${esc(fmtMonth(best.month))} — ${esc(fmtFans(best.totalGain))}</div>` : ''}
      </div>`;
  }).join('');

  // ── Activity badges ───────────────────────────────────────────────────────
  const perfectBadge = d.hasPerfectMonth
    ? `<span class="activity-badge perfect">🌟 Perfect Month</span>` : '';
  const streakBadge  = d.streakCurrent >= 7
    ? `<span class="activity-badge streak">🔥 ${d.streakCurrent}-day streak</span>` : '';

  // ── Inheritance section ───────────────────────────────────────────────────
  const inheritanceHtml = (() => {
    const inh = d.inheritanceData;
    if (!inh) return '';

    const RANK_STARS = {
      15: 'SSS', 14: 'SS+', 13: 'SS', 12: 'S+', 11: 'S',
      10: '★★★★★★★★★★', 9: '★×9', 8: '★×8', 7: '★×7',
    };
    const rankLabel = inh.parent_rank != null
      ? `#${Number(inh.parent_rank).toLocaleString()}`
      : '—';

    // Parent portrait helper
    const portrait = (p, label) => {
      const img = p.icon
        ? `<img class="inh-portrait" src="${p.icon}" alt="${esc(p.name)}" onerror="this.style.display='none'">`
        : `<div class="inh-portrait inh-portrait--empty"></div>`;
      return `
        <div class="inh-parent">
          ${img}
          <div class="inh-parent-label">${esc(label)}</div>
          <div class="inh-parent-name">${esc(p.name)}</div>
        </div>`;
    };

    // Skill list rows
    const sparkRow = (color, borderColor, bgColor, emoji, label, stars, count, names) => {
      const nameList = (names ?? []).length > 0
        ? names.slice(0, 12).map(n => `<span class="inh-skill-chip">${esc(n)}</span>`).join('')
        : `<span class="inh-skill-count">${stars > 0 ? `★×${stars}` : '—'}  ·  ${count} skill${count !== 1 ? 's' : ''}</span>`;
      return `
        <div class="inh-spark-row" style="border-left-color:${borderColor};background:${bgColor}">
          <div class="inh-spark-head">
            <span class="inh-spark-dot" style="background:${borderColor}"></span>
            <span class="inh-spark-label">${emoji} ${esc(label)}</span>
            <span class="inh-spark-stars" style="color:${borderColor}">★×${stars}</span>
          </div>
          <div class="inh-skill-chips">${nameList}</div>
        </div>`;
    };

    const sn = inh.skill_names ?? {};

    return `
  <div class="divider"></div>
  <div class="sec-title">🧬 Inheritance</div>

  <div class="inh-top">
    <div class="inh-parents">
      ${portrait(inh.main,  'MAIN')}
      ${portrait(inh.left,  'LEFT')}
      ${portrait(inh.right, 'RIGHT')}
    </div>
    <div class="inh-stats">
      <div class="inh-stat">
        <div class="inh-stat-key">Affinity</div>
        <div class="inh-stat-val" style="color:${PINK}">${inh.affinity ?? '—'}</div>
      </div>
      <div class="inh-stat">
        <div class="inh-stat-key">G1 Wins</div>
        <div class="inh-stat-val" style="color:${AMBER}">${inh.win_count ?? '—'}</div>
      </div>
      <div class="inh-stat">
        <div class="inh-stat-key">White Skills</div>
        <div class="inh-stat-val" style="color:#9e9e9e">${inh.white_count ?? '—'}</div>
      </div>
      <div class="inh-stat">
        <div class="inh-stat-key">Score</div>
        <div class="inh-stat-val" style="color:${GOLD};font-size:14px">${rankLabel}</div>
      </div>
    </div>
  </div>

  <div class="inh-sparks">
    ${sparkRow('blue',  '#4a9eff', 'rgba(74,158,255,0.05)', '🔵', 'Blue (Speed)',   inh.blue_stars,  inh.blue_count,  sn.blue)}
    ${sparkRow('pink',  '#ec407a', 'rgba(236,64,122,0.05)', '🩷', 'Pink (Power)',   inh.pink_stars,  inh.pink_count,  sn.pink)}
    ${sparkRow('green', '#4ade80', 'rgba(74,222,128,0.05)', '🟢', 'Green (Skill)',  inh.green_stars, inh.green_count, sn.green)}
    ${sparkRow('white', '#9e9e9e', 'rgba(158,158,158,0.05)','⬜', 'White (Inherit)',inh.white_stars, inh.white_count, sn.white)}
  </div>
  `;
  })();

  // ── Team Stadium section (always shown) ───────────────────────────────────
  const stadiumHtml = (() => {
    const sd     = d.stadiumData;
    const horses = sd?.horses ?? [];

    // No cache yet — show syncing notice
    if (!sd) {
      return `
  <div class="divider"></div>
  <div class="sec-title">🏇 Team Stadium</div>
  <div class="stadium-empty">⏳ Stadium data is syncing — check back in a few minutes.</div>`;
    }

    // Cache exists but scraper found nothing useful
    if (!horses.length) {
      return `
  <div class="divider"></div>
  <div class="sec-title">🏇 Team Stadium</div>
  <div class="stadium-empty">No horse data found on uma.moe for this trainer.</div>`;
    }

    // ── Stadium class banner ─────────────────────────────────────────
    const classBanner = sd.stadiumClass
      ? `<div class="stadium-class-banner">🏟 ${esc(sd.stadiumClass)}</div>`
      : '';

    // ── Group horses by distance for slot table ──────────────────────
    const ORDER   = ['Sprint', 'Mile', 'Medium', 'Long', 'Dirt', null];
    const byDist  = new Map();
    for (const h of horses) {
      const key = h.distance ?? 'Other';
      if (!byDist.has(key)) byDist.set(key, []);
      byDist.get(key).push(h);
    }

    const sortedKeys = [...byDist.keys()].sort((a, b) => {
      const ai = ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a);
      const bi = ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b);
      return ai - bi;
    });

    const horseCards = sortedKeys.flatMap(dist =>
      byDist.get(dist).map(h => {
        const slotLabel = [h.distance, h.surface].filter(Boolean).join(' / ') || 'Unknown';
        const skillChips = (h.skills ?? []).slice(0, 5).map(s =>
          `<div class="horse-skill">${esc(s)}</div>`
        ).join('');
        const winsTag = h.wins != null
          ? `<div class="horse-wins">${h.wins} wins</div>`
          : '';
        return `
      <div class="horse-card">
        <div class="horse-slot">${esc(slotLabel)}</div>
        <div class="horse-name">${esc(h.name ?? '?')}</div>
        ${winsTag}
        ${skillChips ? `<div class="horse-skills">${skillChips}</div>` : ''}
      </div>`;
      })
    ).join('');

    const updatedAt = sd.scrapedAt
      ? `<div class="stadium-updated">Updated ${new Date(sd.scrapedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' })}</div>`
      : '';

    return `
  <div class="divider"></div>
  <div class="sec-title">🏇 Team Stadium</div>
  ${classBanner}
  <div class="stadium-grid">${horseCards}</div>
  ${updatedAt}`;
  })();

  // ── HTML ──────────────────────────────────────────────────────────────────

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body {
  background:#ffffff;
  font-family:'Noto Sans JP','Noto Sans Symbols 2','Noto Color Emoji',system-ui,-apple-system,Arial,sans-serif;
  color:#1a1a1a;
  font-weight:700;
  display:inline-block;
  width:680px;
}
.card { background:#ffffff;position:relative;overflow:hidden;border:1.5px solid #000000;border-radius:6px; }

/* ── Header ── */
.header { padding:14px 20px 12px;border-bottom:1.5px solid #000000;background:linear-gradient(135deg,${PINK2} 0%,${PINK} 100%); }
.hrow { display:flex;justify-content:space-between;align-items:flex-start; }
.htitle { font-size:19px;font-weight:900;letter-spacing:-0.3px;color:#ffffff; }
.hdate { font-size:11px;color:rgba(255,255,255,0.72);white-space:nowrap;margin-top:2px;font-weight:700; }
.hsub { font-size:11px;color:rgba(255,255,255,0.72);margin-top:5px;display:flex;justify-content:space-between;align-items:center;font-weight:700; }
.trainer-id { font-size:10px;color:rgba(255,255,255,0.55);letter-spacing:0.3px;margin-top:2px;font-weight:600; }
.class-badge {
  display:inline-block;font-size:10px;font-weight:800;
  background:rgba(255,255,255,0.20);color:#ffffff;
  border:1px solid rgba(255,255,255,0.40);
  border-radius:6px;padding:2px 8px;margin-left:8px;
  vertical-align:middle;letter-spacing:0.3px;
}
.divider { height:1px;background:rgba(0,0,0,0.07);margin:0; }

/* ── Section titles ── */
.sec-title {
  padding:10px 20px 4px;
  font-size:10px;font-weight:700;
  text-transform:uppercase;letter-spacing:0.8px;
  color:rgba(0,0,0,0.40);
}

/* ── Tracking info ── */
.info-grid { display:grid;grid-template-columns:repeat(3,1fr);padding:10px 20px 12px;gap:0; }
.info-cell { padding:6px 0; }
.info-cell + .info-cell { border-left:1.5px solid #000000;padding-left:14px; }
.info-key { font-size:10px;color:rgba(0,0,0,0.40);text-transform:uppercase;letter-spacing:0.7px;font-weight:700; }
.info-val { font-size:14px;color:#1a1a1a;font-weight:700;margin-top:3px; }

/* ── Circle Status ── */
.cs-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:6px 20px 14px; }
.cs-box {
  background:rgba(0,180,216,0.05);
  border:1.5px solid rgba(0,180,216,0.22);
  border-radius:8px;padding:9px 10px;text-align:center;
}
.cs-key { font-size:9px;color:rgba(0,0,0,0.40);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;font-weight:700; }
.cs-val { font-size:17px;font-weight:800;color:#1a1a1a; }
.cs-sub { font-size:9px;color:rgba(0,0,0,0.38);margin-top:2px;font-weight:700; }

/* ── Fan gain grid ── */
.gains-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:6px 20px 14px; }
.gain-box { background:rgba(0,0,0,0.04);border-radius:8px;padding:10px 12px;border:1.5px solid #000000; }
.gain-scope { font-size:9px;color:rgba(0,0,0,0.40);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;font-weight:700; }
.gain-value { font-size:19px;font-weight:800; }

/* ── Progress bar ── */
.progress-section { padding:4px 20px 14px; }
.prog-bar-track { width:100%;height:10px;background:rgba(0,0,0,0.09);border-radius:6px;overflow:hidden;margin:6px 0; }
.prog-bar-fill { height:100%;border-radius:6px; }
.prog-meta { display:flex;justify-content:space-between;font-size:10px;color:rgba(0,0,0,0.40);margin-top:2px;font-weight:700; }

/* ── Rolling gains ── */
.rolling-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:6px 20px 14px; }
.rolling-box {
  background:rgba(0,180,216,0.06);
  border:1.5px solid rgba(0,180,216,0.30);
  border-radius:8px;padding:10px 12px;text-align:center;
}
.rolling-scope { font-size:9px;color:rgba(0,0,0,0.40);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;font-weight:700; }
.rolling-value { font-size:19px;font-weight:800;color:${TEAL}; }

/* ── Activity stats ── */
.activity-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:6px 20px 10px; }
.activity-box {
  background:rgba(0,0,0,0.03);border:1.5px solid rgba(0,0,0,0.10);
  border-radius:8px;padding:9px 10px;text-align:center;
}
.activity-key { font-size:9px;color:rgba(0,0,0,0.40);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;font-weight:700; }
.activity-val { font-size:17px;font-weight:800;color:#1a1a1a; }
.activity-sub { font-size:9px;color:rgba(0,0,0,0.35);margin-top:2px;font-weight:700; }
.badges-row { display:flex;gap:6px;padding:2px 20px 12px;flex-wrap:wrap; }
.activity-badge { font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px;border:1px solid; }
.activity-badge.perfect { color:#7c3aed;background:rgba(124,58,237,0.08);border-color:rgba(124,58,237,0.30); }
.activity-badge.streak  { color:${AMBER};background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.30); }

/* ── Records ── */
.records-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:6px 20px 14px; }
.record-box { background:rgba(0,0,0,0.03);border:1.5px solid #000000;border-radius:10px;padding:12px 14px;text-align:center; }
.record-box.gold { background:rgba(255,193,7,0.07);border-color:rgba(255,193,7,0.30); }
.record-icon { font-size:20px; }
.record-label { font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:rgba(0,0,0,0.42);margin-top:3px;font-weight:700; }
.record-value { font-size:20px;font-weight:900;margin-top:2px; }
.record-sub { font-size:10px;color:rgba(0,0,0,0.45);margin-top:2px;font-weight:700; }

/* ── Trainer Profile ── */
.tp-stat-row { display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:6px 20px 10px; }
.tp-stat { background:rgba(255,193,7,0.05);border:1.5px solid rgba(255,193,7,0.25);border-radius:8px;padding:9px 10px;text-align:center; }
.tp-key { font-size:9px;color:rgba(0,0,0,0.40);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;font-weight:700; }
.tp-val { font-size:18px;font-weight:900; }
.spark-row { display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:4px 20px 10px; }
.spark-box { border-radius:8px;padding:8px 6px;text-align:center;border:1.5px solid; }
.spark-white { background:rgba(200,200,200,0.12);border-color:rgba(180,180,180,0.40); }
.spark-green  { background:rgba(34,197,94,0.08);border-color:rgba(34,197,94,0.35); }
.spark-pink   { background:rgba(236,64,122,0.08);border-color:rgba(236,64,122,0.35); }
.spark-blue   { background:rgba(88,101,242,0.08);border-color:rgba(88,101,242,0.35); }
.spark-total  { background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.35); }
.spark-stars  { font-size:18px;font-weight:900;color:#1a1a1a; }
.spark-label  { font-size:9px;color:rgba(0,0,0,0.42);margin-top:2px;font-weight:700; }
.trophy-row   { padding:2px 20px 10px;font-size:11px;color:rgba(0,0,0,0.45);font-weight:700; }

/* ── Yearly cards ── */
.year-row { display:flex;gap:10px;padding:6px 20px 16px;flex-wrap:wrap; }
.year-card {
  flex:1 1 200px;background:rgba(0,0,0,0.04);border:1.5px solid #000000;
  border-radius:10px;padding:14px 16px;
}
.year-card.ongoing { background:rgba(236,64,122,0.06);border-color:rgba(236,64,122,0.30); }
.year-head { display:flex;justify-content:space-between;align-items:center;margin-bottom:6px; }
.year-num { font-size:15px;font-weight:800;color:#1a1a1a; }
.ongoing-badge { font-size:9px;font-weight:700;color:${PINK};background:rgba(236,64,122,0.12);border:1px solid rgba(236,64,122,0.35);border-radius:10px;padding:2px 8px;text-transform:uppercase;letter-spacing:0.5px; }
.complete-badge { font-size:9px;font-weight:700;color:rgba(0,0,0,0.40);background:rgba(0,0,0,0.05);border:1px solid rgba(0,0,0,0.12);border-radius:10px;padding:2px 8px;text-transform:uppercase;letter-spacing:0.5px; }
.year-total { font-size:24px;font-weight:900;color:${PINK};margin-bottom:2px; }
.year-span  { font-size:10px;color:rgba(0,0,0,0.42);margin-bottom:6px;font-weight:700; }
.year-best  { font-size:11px;color:rgba(0,0,0,0.55);font-weight:700; }

/* ── Monthly table ── */
.mp-table { width:100%;border-collapse:collapse;font-size:12px;margin:0 0 6px; }
.mp-table thead tr { border-bottom:1.5px solid #000000;background:#fafafa; }
.mp-th { font-size:9px;font-weight:700;letter-spacing:1px;color:rgba(0,0,0,0.40);text-transform:uppercase;padding:5px 10px 5px 0;text-align:left; }
.mp-th:first-child { padding-left:20px; }
.mp-row { border-bottom:1.5px solid rgba(0,0,0,0.07); }
.mp-row:last-child { border-bottom:none; }
.mp-td { padding:6px 10px 6px 0;vertical-align:middle; }
.mp-td:first-child { padding-left:20px; }
.mp-month { font-weight:700;color:#1a1a1a;white-space:nowrap; }
.mp-tag { display:inline-block;font-size:8px;font-weight:700;background:${PINK}20;color:${PINK};border-radius:4px;padding:1px 5px;margin-left:6px;vertical-align:middle;text-transform:uppercase;letter-spacing:0.5px; }
.mp-gain { font-weight:700;color:#1a1a1a; }
.mp-days { font-size:11px;color:rgba(0,0,0,0.55);text-align:right; }
.mp-avgday { font-size:11px;color:rgba(0,0,0,0.55); }
.ms-pill { font-size:10px;font-weight:700;padding:2px 9px;border-radius:10px;border:1px solid;white-space:nowrap; }
.mp-quota { text-align:center; }
.quota-tick  { font-size:11px;color:${GREEN};font-weight:900; }
.quota-cross { font-size:11px;color:#ef4444;font-weight:900; }
.mp-total-row { display:flex;justify-content:space-between;align-items:center;padding:10px 20px 14px;border-top:1.5px solid #000000;margin-top:2px; }
.mp-total-label { font-size:11px;color:rgba(0,0,0,0.45);font-weight:700; }
.mp-total-value { font-size:16px;font-weight:800;color:${PINK}; }

/* ── Stadium ── */
.stadium-empty        { padding:8px 20px 16px;font-size:12px;color:rgba(0,0,0,0.35);font-weight:700; }
.stadium-class-banner { margin:4px 20px 4px;padding:6px 12px;font-size:12px;font-weight:800;
                        background:rgba(88,101,242,0.07);border:1.5px solid rgba(88,101,242,0.25);
                        border-radius:8px;color:#5865f2; }
.stadium-grid         { display:flex;flex-wrap:wrap;gap:8px;padding:6px 20px 4px; }
.horse-card           { background:rgba(0,0,0,0.04);border:1.5px solid #000000;border-radius:10px;
                        padding:10px 12px;min-width:160px;flex:1; }
.horse-slot           { font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;
                        color:rgba(0,0,0,0.38);margin-bottom:3px; }
.horse-name           { font-size:13px;font-weight:800;margin-bottom:2px; }
.horse-wins           { font-size:10px;color:${AMBER};font-weight:700;margin-bottom:4px; }
.horse-skills         { display:flex;flex-wrap:wrap;gap:3px;margin-top:4px; }
.horse-skill          { font-size:9px;color:rgba(0,0,0,0.55);padding:2px 6px;border-radius:4px;
                        background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.10);font-weight:700; }
.stadium-updated      { padding:2px 20px 10px;font-size:9px;color:rgba(0,0,0,0.28);font-weight:700; }

.no-data { padding:8px 20px 16px;font-size:12px;color:rgba(0,0,0,0.35);font-weight:700; }

/* ── No-gain notice ── */
.no-gain-notice {
  display:flex;flex-direction:column;align-items:center;text-align:center;
  padding:14px 20px 18px;gap:4px;
  background:rgba(0,0,0,0.03);border-top:1.5px solid rgba(0,0,0,0.06);
}
.no-gain-notice--slim {
  flex-direction:row;justify-content:center;gap:8px;
  padding:8px 20px 10px;
}
.no-gain-icon { font-size:22px;line-height:1; }
.no-gain-notice--slim .no-gain-icon { font-size:14px;color:rgba(0,0,0,0.30); }
.no-gain-text { font-size:12px;font-weight:700;color:rgba(0,0,0,0.45); }
.no-gain-sub  { font-size:10px;font-weight:600;color:rgba(0,0,0,0.30);max-width:480px;line-height:1.5; }

/* ── Muted states ── */
.activity-box--muted { opacity:0.40;border-style:dashed; }
.activity-val--muted { color:rgba(0,0,0,0.30) !important;font-size:20px; }
.record-box--muted   { opacity:0.42;border-style:dashed; }

/* ── Inheritance ── */
.inh-top { display:flex;gap:12px;padding:8px 20px 12px;align-items:flex-start; }
.inh-parents { display:flex;gap:14px;flex-shrink:0; }
.inh-parent { display:flex;flex-direction:column;align-items:center;gap:4px; }
.inh-portrait {
  width:70px;height:70px;border-radius:50%;object-fit:cover;
  border:2.5px solid rgba(0,0,0,0.15);background:rgba(0,0,0,0.06);
}
.inh-portrait--empty { width:70px;height:70px;border-radius:50%;background:rgba(0,0,0,0.06);border:2px dashed rgba(0,0,0,0.15); }
.inh-parent-label { font-size:8px;font-weight:800;color:rgba(0,0,0,0.35);text-transform:uppercase;letter-spacing:0.8px; }
.inh-parent-name { font-size:9px;font-weight:700;color:#1a1a1a;text-align:center;max-width:76px;line-height:1.3; }
.inh-stats { display:grid;grid-template-columns:repeat(2,1fr);gap:6px;flex:1; }
.inh-stat { background:rgba(0,0,0,0.03);border:1.5px solid rgba(0,0,0,0.10);border-radius:8px;padding:8px 10px;text-align:center; }
.inh-stat-key { font-size:9px;color:rgba(0,0,0,0.40);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;font-weight:700; }
.inh-stat-val { font-size:18px;font-weight:900; }
.inh-sparks { display:flex;flex-direction:column;gap:5px;padding:0 20px 14px; }
.inh-spark-row {
  border-left:4px solid;border-radius:6px;padding:7px 10px 7px 12px;
}
.inh-spark-head { display:flex;align-items:center;gap:6px;margin-bottom:4px; }
.inh-spark-dot { width:8px;height:8px;border-radius:50%;flex-shrink:0; }
.inh-spark-label { font-size:11px;font-weight:800;color:#1a1a1a;flex:1; }
.inh-spark-stars { font-size:11px;font-weight:700; }
.inh-skill-chips { display:flex;flex-wrap:wrap;gap:4px; }
.inh-skill-chip {
  font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;
  background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.10);color:rgba(0,0,0,0.65);
}
.inh-skill-count { font-size:10px;color:rgba(0,0,0,0.40);font-weight:700; }

/* ── Footer ── */
.footer { padding:9px 20px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;font-weight:700;background:#ffffff; }
</style>
</head>
<body><div class="card">

  <div class="header">
    <div class="hrow">
      <div>
        <div class="htitle">🏇 ${esc(d.trainerName)}${teamClassBadge}</div>
        ${d.viewerId ? `<div class="trainer-id">#${esc(String(d.viewerId))}</div>` : ''}
      </div>
      <div class="hdate">${esc(d.date)}</div>
    </div>
    <div class="hsub">
      <span>${esc(d.circleName)} · Profile Dashboard</span>
      <span>${esc(fmtFans(d.totalFans))} fans total</span>
    </div>
  </div>

  <div class="divider"></div>

  <div class="sec-title">🗓️ Tracking Info</div>
  <div class="info-grid">
    <div class="info-cell">
      <div class="info-key">Joined / First Tracked</div>
      <div class="info-val">${esc(fmtDate(d.joinedAtIso))}</div>
    </div>
    <div class="info-cell">
      <div class="info-key">Days in Circle</div>
      <div class="info-val">${(d.daysInCircle ?? 0).toLocaleString()} days</div>
    </div>
    <div class="info-cell">
      <div class="info-key">Active Days</div>
      <div class="info-val">${d.activeDays ? d.activeDays.toLocaleString() + ' days' : '—'}</div>
    </div>
  </div>

  <div class="divider"></div>

  ${circleStatusHtml}

  <div class="sec-title">📈 Current Fan Gain</div>
  ${d.hasGainData ? `
  <div class="gains-grid">
    <div class="gain-box">
      <div class="gain-scope">📅 Daily</div>
      <div class="gain-value" style="color:${dailyGainColor}">${esc(fmt0(d.currentDailyGain))}</div>
    </div>
    <div class="gain-box">
      <div class="gain-scope">📆 Weekly</div>
      <div class="gain-value" style="color:${weeklyGainColor}">${esc(fmt0(d.currentWeeklyGain))}</div>
    </div>
    <div class="gain-box">
      <div class="gain-scope">🗓️ Monthly</div>
      <div class="gain-value" style="color:${monthlyGainColor}">${esc(fmt0(d.currentMonthlyGain))}</div>
    </div>
  </div>
  <div class="progress-section">
    <div class="prog-bar-track">
      <div class="prog-bar-fill" style="width:${monthlyPct}%;background:${monthlyBarColor}"></div>
    </div>
    <div class="prog-meta">
      <span>${monthlyPct}% of monthly quota (${esc(fmtFans(d.monthlyReq))})</span>
    </div>
  </div>` : `<div class="no-gain-notice">
    <span class="no-gain-icon">📭</span>
    <div class="no-gain-text">Day-level tracking not yet available for this member.</div>
    <div class="no-gain-sub">Historical monthly totals are shown in the table below. Run the backfill script to enable daily tracking, streaks, and PBs.</div>
  </div>`}

  <div class="divider"></div>

  <div class="sec-title">📊 Rolling Gains</div>
  ${d.hasGainData ? `
  <div class="rolling-grid">
    <div class="rolling-box">
      <div class="rolling-scope">3 Days</div>
      <div class="rolling-value">${esc(fmt0(d.rolling3d))}</div>
    </div>
    <div class="rolling-box">
      <div class="rolling-scope">7 Days</div>
      <div class="rolling-value">${esc(fmt0(d.rolling7d))}</div>
    </div>
    <div class="rolling-box">
      <div class="rolling-scope">30 Days</div>
      <div class="rolling-value">${esc(fmt0(d.rolling30d))}</div>
    </div>
  </div>` : `<div class="no-gain-notice no-gain-notice--slim">
    <span class="no-gain-icon">—</span>
    <div class="no-gain-text">Available after backfill</div>
  </div>`}

  <div class="divider"></div>

  <div class="sec-title">🔥 Activity Stats</div>
  ${d.hasGainData ? `
  <div class="activity-grid">
    <div class="activity-box">
      <div class="activity-key">Current Streak</div>
      <div class="activity-val">${d.streakCurrent || '—'}</div>
      <div class="activity-sub">days</div>
    </div>
    <div class="activity-box">
      <div class="activity-key">Longest Streak</div>
      <div class="activity-val">${d.streakLongest || '—'}</div>
      <div class="activity-sub">days</div>
    </div>
    <div class="activity-box">
      <div class="activity-key">Quota Months</div>
      <div class="activity-val">${(d.completedMonths ?? 0)}</div>
      <div class="activity-sub">completed</div>
    </div>
    <div class="activity-box">
      <div class="activity-key">Avg / Month</div>
      <div class="activity-val" style="font-size:14px">${esc(fmtFans(d.avgPerMonth ?? 0))}</div>
      <div class="activity-sub">all-time avg</div>
    </div>
  </div>
  ${(perfectBadge || streakBadge)
    ? `<div class="badges-row">${perfectBadge}${streakBadge}</div>`
    : ''}` : `<div class="activity-grid">
    <div class="activity-box">
      <div class="activity-key">Quota Months</div>
      <div class="activity-val">${(d.completedMonths ?? 0)}</div>
      <div class="activity-sub">from history</div>
    </div>
    <div class="activity-box">
      <div class="activity-key">Avg / Month</div>
      <div class="activity-val" style="font-size:14px">${esc(fmtFans(d.avgPerMonth ?? 0))}</div>
      <div class="activity-sub">all-time avg</div>
    </div>
    <div class="activity-box activity-box--muted">
      <div class="activity-key">Current Streak</div>
      <div class="activity-val activity-val--muted">—</div>
      <div class="activity-sub">needs backfill</div>
    </div>
    <div class="activity-box activity-box--muted">
      <div class="activity-key">Active Days</div>
      <div class="activity-val activity-val--muted">—</div>
      <div class="activity-sub">needs backfill</div>
    </div>
  </div>`}

  <div class="divider"></div>

  <div class="sec-title">🏆 All-Time Records</div>
  <div class="records-grid">
    <div class="record-box gold">
      <div class="record-icon">💎</div>
      <div class="record-label">Best Month</div>
      <div class="record-value" style="color:${GOLD}">${bestMonth ? esc(fmtFans(bestMonth.totalGain)) : '—'}</div>
      <div class="record-sub">${bestMonth ? esc(fmtMonth(bestMonth.month)) : 'No data yet'}</div>
    </div>
    <div class="record-box${d.hasGainData ? '' : ' record-box--muted'}">
      <div class="record-icon">📅</div>
      <div class="record-label">Best Day (PB)</div>
      <div class="record-value" style="color:${d.hasGainData ? PINK : 'rgba(0,0,0,0.25)'}">
        ${esc(fmt0(d.pbDaily))}
      </div>
      <div class="record-sub">${d.hasGainData ? 'single day record' : 'needs backfill'}</div>
    </div>
    <div class="record-box${d.hasGainData ? '' : ' record-box--muted'}">
      <div class="record-icon">📆</div>
      <div class="record-label">Best Week (PB)</div>
      <div class="record-value" style="color:${d.hasGainData ? TEAL : 'rgba(0,0,0,0.25)'}">
        ${esc(fmt0(d.pbWeekly))}
      </div>
      <div class="record-sub">${d.hasGainData ? 'single week record' : 'needs backfill'}</div>
    </div>
    <div class="record-box">
      <div class="record-icon">⭐</div>
      <div class="record-label">Total Fans (Lifetime)</div>
      <div class="record-value" style="color:#1a1a1a;font-size:17px">${esc(fmtFans(d.lifetimeTotal))}</div>
      <div class="record-sub">since joining circle</div>
    </div>
  </div>

  <div class="divider"></div>

  ${trainerProfileHtml}

  <div class="sec-title">📊 Yearly Performance</div>
  ${yearCards
    ? `<div class="year-row">${yearCards}</div>`
    : '<div class="no-data">No yearly data recorded yet.</div>'}

  <div class="divider"></div>

  <div class="sec-title">🗓️ Monthly Performance — Full History</div>
  ${history.length
    ? `<table class="mp-table">
        <thead>
          <tr>
            <th class="mp-th">Month</th>
            <th class="mp-th">Fan Gain</th>
            <th class="mp-th" style="text-align:right">Days</th>
            <th class="mp-th">Avg/Day</th>
            <th class="mp-th">Milestone</th>
            <th class="mp-th" style="text-align:center">Quota</th>
          </tr>
        </thead>
        <tbody>${monthRows}</tbody>
      </table>
      <div class="mp-total-row">
        <span class="mp-total-label">Total across ${history.length} month${history.length !== 1 ? 's' : ''} · ${d.completedMonths ?? 0} above quota</span>
        <span class="mp-total-value">${esc(fmtFans(monthlyTotal))}</span>
      </div>`
    : '<div class="no-data">No monthly data recorded yet.</div>'}

  ${stadiumHtml}

  ${inheritanceHtml}

  <div class="footer">
    <span>${esc(d.circleName)}</span>
    <span>/profile · uma.moe circle data</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 680);
}
