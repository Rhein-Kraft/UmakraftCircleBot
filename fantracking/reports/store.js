/**
 * fantracking/reports/store.js
 * ─────────────────────────────
 * renderStoreConfirmation — trainer database store/update confirmation card
 */

import { renderHtml } from '../../utils/imageReport-browser.js';
import { esc, STANDARD_CSS } from './ImageReportStandard.js';

export async function renderStoreConfirmation(data) {
  const action      = data.isUpdate ? 'Updated' : 'Stored';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STANDARD_CSS}
body{width:500px}</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="hrow">
      <div class="htitle" style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;padding:2px 8px;background:rgba(255,255,255,0.22);color:#ffffff;border:1px solid rgba(255,255,255,0.40);border-radius:4px;font-weight:700;letter-spacing:0.5px">${action}</span>
        ${esc(data.trainerName)}
      </div>
    </div>
    <div class="hsub">Trainer ID: <span style="font-family:monospace;color:rgba(255,255,255,0.75)">${esc(data.trainerId)}</span></div>
  </div>
  <div class="stat-grid">
    <div class="stat-cell">
      <div class="stat-lbl">Trainee Rank</div>
      <div class="stat-val">${esc(data.rank)}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-lbl">Affinity</div>
      <div class="stat-val">${esc(data.affinity)}</div>
    </div>
    <div class="stat-cell" style="grid-column:1/-1">
      <div class="stat-lbl">White Skills</div>
      <div class="stat-val">${esc(data.whiteSkills)}</div>
      <div class="stat-sub">Rebuilding #uma-results leaderboard…</div>
    </div>
  </div>
  <div class="footer">
    <span>Submitted by ${esc(data.submittedBy)}</span>
    <span>uma.moe/profile/${esc(data.trainerId)}</span>
  </div>
</div></body></html>`;
  return renderHtml(html, 500);
}
