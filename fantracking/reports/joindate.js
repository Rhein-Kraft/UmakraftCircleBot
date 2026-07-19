/**
 * fantracking/reports/joindate.js
 * ─────────────────────────────────
 * Produces two images:
 *   renderJoindateCurrent(rows)  — active members sorted oldest→newest join
 *   renderJoindateAlumni(rows)   — alumni sorted newest→oldest last active
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import {
  esc,
  FONT_IMPORT,
  COLORS,
  BORDER,
  STANDARD_CSS,
  trainerColor,
  trainerDisplayColor,
} from './ImageReportStandard.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then.getTime())) return '';
  const diffMs = Date.now() - then.getTime();
  if (diffMs < 0) return '';
  const totalDays = Math.floor(diffMs / 86_400_000);
  const years  = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30);
  const parts = [];
  if (years  > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}mo`);
  if (parts.length === 0) parts.push(`${totalDays || 1}d`);
  return parts.join(' ');
}

function tenure(joinedAt, leftAt) {
  if (!joinedAt) return '—';
  const end = leftAt ? new Date(leftAt) : new Date();
  const start = new Date(joinedAt);
  if (isNaN(start.getTime())) return '—';
  const totalDays = Math.floor((end - start) / 86_400_000);
  const months = Math.floor(totalDays / 30);
  if (months >= 12) {
    const y = Math.floor(months / 12);
    const m = months % 12;
    return m > 0 ? `${y}y ${m}mo` : `${y}y`;
  }
  if (months > 0) return `${months}mo`;
  return `${totalDays}d`;
}

function baseHtml(accent, width, bodyContent, headerContent, footerContent) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${FONT_IMPORT}
* { margin:0;padding:0;box-sizing:border-box; }
body { background:#ffffff;font-family:'Noto Sans JP','Noto Color Emoji',system-ui,Arial,sans-serif;color:#1a1a1a;font-weight:700;display:inline-block;width:${width}px; }
.card { background:#ffffff;position:relative;overflow:hidden;border:1.5px solid #000000;border-radius:6px; }
.header { padding:14px 18px 12px;border-bottom:1.5px solid #000000;background:linear-gradient(135deg,#f06292 0%,#ec407a 100%); }
.htitle { font-size:17px;font-weight:900;letter-spacing:-0.2px;display:flex;align-items:center;gap:8px;color:#ffffff; }
.hsub { font-size:11px;color:rgba(255,255,255,0.72);margin-top:4px;font-weight:700; }
table { width:100%;border-collapse:collapse; }
thead th { padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:rgba(0,0,0,0.42);border-bottom:1.5px solid #000000;background:#fafafa; }
thead th:first-child { padding-left:16px; }
thead th:last-child  { padding-right:16px; }
td { border-bottom:1.5px solid #000000; }
tr:nth-child(odd)  { background:rgba(240,98,146,0.04); }
tr:nth-child(even) { background:#ffffff; }
.footer { padding:9px 18px;border-top:1.5px solid #000000;font-size:10px;color:rgba(0,0,0,0.38);display:flex;justify-content:space-between;font-weight:700; }
</style></head>
<body><div class="card">
  <div style="height:3px;background:linear-gradient(90deg,#f06292,#ec407a)"></div>
  <div class="header">${headerContent}</div>
  ${bodyContent}
  <div class="footer">${footerContent}</div>
</div></body></html>`;
}

// ── Single Member Card ────────────────────────────────────────────────────────

/**
 * Renders a single member lookup card (/memberlist without list:True) using
 * the ImageReportStandard theme — white card, thick black borders, pink
 * header/section strips, avatar circle when a linked Discord profile picture
 * is available.
 *
 * @param {object} d
 *  @param {string} d.trainerId
 *  @param {string} d.trainerName
 *  @param {boolean} d.isActive
 *  @param {string} d.circleName
 *  @param {string|null} d.joinedAt      ISO date
 *  @param {string|null} d.leftAt        ISO date (alumni only)
 *  @param {string|null} d.avatarUrl     Discord CDN avatar URL, or null
 * @returns {Promise<Buffer>}
 */
export async function renderMemberCard(d) {
  const nameColor = trainerDisplayColor(d.trainerId, d.trainerName, d.isActive);
  const joined    = fmtDate(d.joinedAt);
  const joinedRel = relativeTime(d.joinedAt);
  const today     = new Date().toISOString().slice(0, 10);

  const initial = (d.trainerName ?? '?').trim().charAt(0).toUpperCase() || '?';
  const avatarHtml = d.avatarUrl
    ? `<img src="${esc(d.avatarUrl)}" style="width:64px;height:64px;border-radius:50%;border:${BORDER.DEFAULT};object-fit:cover;flex-shrink:0;background:${COLORS.WHITE}" onerror="this.style.display='none'" />`
    : `<div style="width:64px;height:64px;border-radius:50%;border:${BORDER.DEFAULT};background:${COLORS.WHITE};color:${nameColor};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;flex-shrink:0">${esc(initial)}</div>`;

  const infoCells = [
    { key: 'Circle',     val: esc(d.circleName ?? '—') },
    { key: 'Trainer ID', val: `<code style="font-family:inherit">${esc(d.trainerId ?? '—')}</code>` },
    d.isActive
      ? { key: 'Joined UmaKraft', val: joinedRel ? `${esc(joined)} <span style="font-weight:700;color:${COLORS.MUTED};font-size:11px">(${esc(joinedRel)} ago)</span>` : esc(joined) }
      : { key: 'Left Circle',     val: esc(fmtDate(d.leftAt)) },
  ];

  const infoCellsHtml = infoCells.map(c => `
    <div class="info-cell">
      <div class="info-key">${esc(c.key)}</div>
      <div class="info-val">${c.val}</div>
    </div>`).join('');

  const statusHtml = d.isActive
    ? `<span style="color:${COLORS.BLACK}">Active member ✅</span>`
    : `<span style="color:${COLORS.GREY}">Former member — no longer in the circle 🔖</span>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>${STANDARD_CSS}</style>
</head>
<body><div class="card">
  <div class="accent-bar"></div>

  <div class="header">
    <div class="hrow" style="align-items:center;gap:14px">
      ${avatarHtml}
      <div style="flex:1;min-width:0">
        <div class="htitle" style="color:${COLORS.WHITE};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${d.isActive ? '🗓️' : '🔖'} <span style="color:${COLORS.WHITE}">${esc(d.trainerName)}</span>
        </div>
        <div class="hsub" style="justify-content:flex-start;gap:8px">
          <span>${esc(d.circleName ?? '')}</span>
        </div>
      </div>
      <div class="hdate">${esc(today)}</div>
    </div>
  </div>

  <div class="sec-title">${d.isActive ? '🗓️ Membership Info' : '📤 Membership Info'}</div>
  <div class="info-grid" style="grid-template-columns:repeat(${infoCells.length},1fr);margin:10px 14px">
    ${infoCellsHtml}
  </div>

  <div class="divider"></div>

  <div class="footer">
    <span>${statusHtml}</span>
    <span>UmaKraft · uma.moe</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 660);
}

// ── Current Members Image ─────────────────────────────────────────────────────

export async function renderJoindateCurrent(rows) {
  const today  = new Date().toISOString().slice(0, 10);

  const tableRows = rows.map((r, i) => {
    const num  = String(i + 1).padStart(2, ' ');
    const date = fmtDate(r.joinedAt);
    const dur  = relativeTime(r.joinedAt);
    const nClr = trainerColor(r.trainerName);
    return `<tr>
      <td style="padding:8px 8px 8px 16px;font-size:12px;font-weight:700;color:rgba(0,0,0,0.35);width:30px;white-space:nowrap">${esc(num)}</td>
      <td style="padding:8px 6px;font-size:13px;font-weight:700;color:${nClr};max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.trainerName)}</td>
      <td style="padding:8px 6px;font-size:11px;color:rgba(0,0,0,0.42);white-space:nowrap;font-weight:700">${esc(r.circleName)}</td>
      <td style="padding:8px 6px;font-size:12px;font-weight:700;color:#1565C0;white-space:nowrap;text-align:right">${esc(date)}</td>
      <td style="padding:8px 16px 8px 6px;font-size:11px;color:rgba(0,0,0,0.38);white-space:nowrap;text-align:right;font-weight:700">${dur ? `(${esc(dur)})` : ''}</td>
    </tr>`;
  }).join('');

  const body = `
  <table>
    <thead><tr>
      <th style="text-align:left">#</th>
      <th style="text-align:left">Trainer</th>
      <th style="text-align:left">Circle</th>
      <th style="text-align:right">Joined</th>
      <th style="text-align:right">Duration</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`;

  const header = `
    <div class="htitle">✅ Current Members</div>
    <div class="hsub">${rows.length} active member${rows.length !== 1 ? 's' : ''} · sorted oldest → newest join date · ${today}</div>`;

  const footer = `<span>UmaKraft · uma.moe</span><span>${today}</span>`;

  return renderHtml(baseHtml('#ec407a', 660, body, header, footer), 660);
}

// ── Alumni Image ──────────────────────────────────────────────────────────────

export async function renderJoindateAlumni(rows) {
  const today  = new Date().toISOString().slice(0, 10);
  const COLS   = 3;
  const CARD_W = 1020;

  const perCol = Math.ceil(rows.length / COLS);
  const chunks = Array.from({ length: COLS }, (_, c) =>
    rows.slice(c * perCol, (c + 1) * perCol)
  );

  function renderColTable(chunk, colOffset) {
    const trs = chunk.map((r, i) => {
      const num        = String(colOffset + i + 1).padStart(3, ' ');
      const lastActive = r.lastActiveMonth ?? (r.leftAt ? r.leftAt.slice(0, 7) : '—');
      const joined     = r.joinedAt ? r.joinedAt.slice(0, 7) : '—';
      const nClr       = trainerColor(r.trainerName);
      return `<tr>
        <td style="padding:6px 4px 6px 10px;font-size:10px;font-weight:700;color:rgba(0,0,0,0.30);white-space:nowrap;width:24px">${esc(num)}</td>
        <td style="padding:6px 4px;font-size:12px;font-weight:700;color:${nClr};max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.trainerName)}</td>
        <td style="padding:6px 4px;font-size:10px;color:rgba(0,0,0,0.38);white-space:nowrap;text-align:right;font-weight:700">${esc(joined)}</td>
        <td style="padding:6px 10px 6px 4px;font-size:11px;font-weight:700;color:#c62828;white-space:nowrap;text-align:right">${esc(lastActive)}</td>
      </tr>`;
    }).join('');

    return `
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        <thead>
          <tr style="border-bottom:1.5px solid #000000;background:#fafafa">
            <th style="padding:5px 4px 5px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:rgba(0,0,0,0.38);text-align:left;width:24px">#</th>
            <th style="padding:5px 4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:rgba(0,0,0,0.38);text-align:left">Name</th>
            <th style="padding:5px 4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:rgba(0,0,0,0.38);text-align:right">Joined</th>
            <th style="padding:5px 10px 5px 4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:rgba(0,0,0,0.38);text-align:right">Last Active</th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>`;
  }

  const cols = chunks.map((chunk, c) => {
    const isLast = c === COLS - 1;
    return `
      <div style="flex:1;min-width:0;${!isLast ? 'border-right:1.5px solid #000000;' : ''}">
        ${renderColTable(chunk, c * perCol)}
      </div>`;
  }).join('');

  const body = `
    <div style="display:flex;align-items:flex-start;">
      ${cols}
    </div>`;

  const header = `
    <div class="htitle">🔖 Former Members</div>
    <div class="hsub">${rows.length} former member${rows.length !== 1 ? 's' : ''} · sorted newest → oldest last active · sourced from PastHistoryTrainer.md</div>`;

  const footer = `<span>UmaKraft · uma.moe</span><span>${today}</span>`;

  return renderHtml(baseHtml('#ec407a', CARD_W, body, header, footer), CARD_W);
}
