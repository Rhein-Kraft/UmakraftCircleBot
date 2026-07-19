// @ts-check
/**
 * reportStudio.js
 * ───────────────
 * Serves the /reports builder page and handles /api/render POST requests.
 * Imports render functions from utils/reports/* (Pipeline 1 — Chromium).
 */
import { renderLeaderboard, renderInterCircleLeaderboard } from '../utils/reports/leaderboard.js';
import { renderFanGain, renderTotalFan, renderCircleTotals } from '../utils/reports/fanGain.js';
import {
  renderDailyWarnings, renderWeeklyReport, renderTallyResults,
  renderInfoCard, renderMonthlyWarningCard, renderPlayerWarning,
} from '../utils/reports/warnings.js';
import { renderMilestone } from '../utils/reports/milestone.js';
import { renderStoreConfirmation } from '../utils/reports/store.js';
import { renderCircleMaster, renderCircleMasterDay } from '../utils/reports/circleMaster.js';
import { renderHelpCard } from '../utils/reports/help.js';

const RENDERERS = {
  leaderboard:           renderLeaderboard,
  interCircleLeaderboard: renderInterCircleLeaderboard,
  fanGain:               renderFanGain,
  totalFan:              renderTotalFan,
  circleTotals:          renderCircleTotals,
  dailyWarnings:         renderDailyWarnings,
  weeklyReport:          renderWeeklyReport,
  tallyResults:          renderTallyResults,
  infoCard:              renderInfoCard,
  monthlyWarningCard:    renderMonthlyWarningCard,
  playerWarning:         renderPlayerWarning,
  milestone:             renderMilestone,
  storeConfirmation:     renderStoreConfirmation,
  circleMaster:          renderCircleMaster,
  circleMasterDay:       renderCircleMasterDay,
};

// ── Field schema per report type ────────────────────────────────────────────

const SCHEMAS = {
  leaderboard: {
    label: 'Leaderboard',
    fields: [
      { key: 'scope',       label: 'Scope',       type: 'select', options: ['Daily','Weekly','Monthly'] },
      { key: 'circleName',  label: 'Circle Name', type: 'text',   default: 'UmaKraft' },
      { key: 'date',        label: 'Date',        type: 'text',   default: new Date().toLocaleDateString('ja-JP') },
      { key: 'quotaLabel',  label: 'Quota Label', type: 'text',   default: '30,000,000' },
      { key: 'rows',        label: 'Rows (JSON)', type: 'textarea', default: JSON.stringify([
          { name: 'Trainer A', isNew: false, pct: 85, gainStr: '25,500,000', gapRaw: 4500000, gapStr: '4,500,000' },
          { name: 'Trainer B', isNew: true,  pct: 60, gainStr: '18,000,000', gapRaw: 12000000, gapStr: '12,000,000' },
        ], null, 2) },
    ],
  },
  interCircleLeaderboard: {
    label: 'Inter-Circle Leaderboard',
    fields: [
      { key: 'scope',        label: 'Scope',         type: 'select', options: ['Daily','Weekly','Monthly'] },
      { key: 'date',         label: 'Date',          type: 'text',   default: new Date().toLocaleDateString('ja-JP') },
      { key: 'circleCount',  label: 'Circle Count',  type: 'number', default: '2' },
      { key: 'totalMembers', label: 'Total Members', type: 'number', default: '20' },
      { key: 'rows',         label: 'Rows (JSON)',   type: 'textarea', default: JSON.stringify([
          { name: 'Trainer A', circleName: 'UmaKraft',   gainStr: '28,000,000' },
          { name: 'Trainer B', circleName: 'UmaKraft 2', gainStr: '22,000,000' },
        ], null, 2) },
    ],
  },
  fanGain: {
    label: 'Fan Gain Card',
    fields: [
      { key: 'trainerName', label: 'Trainer Name', type: 'text',   default: 'Trainer A' },
      { key: 'date',        label: 'Date',         type: 'text',   default: new Date().toLocaleDateString('ja-JP') },
      { key: 'circleName',  label: 'Circle Name',  type: 'text',   default: 'UmaKraft' },
      { key: 'monthlyReq',  label: 'Monthly Req',  type: 'number', default: '30000000' },
      { key: 'dailyRaw',    label: 'Daily (raw)',  type: 'number', default: '1200000' },
      { key: 'weeklyRaw',   label: 'Weekly (raw)', type: 'number', default: '8500000' },
      { key: 'monthlyRaw',  label: 'Monthly (raw)',type: 'number', default: '22000000' },
      { key: 'daily',       label: 'Daily (fmt)',  type: 'text',   default: '1,200,000' },
      { key: 'weekly',      label: 'Weekly (fmt)', type: 'text',   default: '8,500,000' },
      { key: 'monthly',     label: 'Monthly (fmt)',type: 'text',   default: '22,000,000' },
      { key: 'rank',        label: 'Rank',         type: 'number', default: '3' },
      { key: 'weekLabel',   label: 'Week Label',   type: 'text',   default: 'Week 2' },
      { key: 'daysLeft',    label: 'Days Left',    type: 'number', default: '12' },
    ],
  },
  totalFan: {
    label: 'Total Fan Card',
    fields: [
      { key: 'trainerName', label: 'Trainer Name', type: 'text',   default: 'Trainer A' },
      { key: 'circleName',  label: 'Circle Name',  type: 'text',   default: 'UmaKraft' },
      { key: 'rank',        label: 'Rank',         type: 'number', default: '5' },
      { key: 'totalFans',   label: 'Total Fans',   type: 'text',   default: '450,000,000' },
    ],
  },
  circleTotals: {
    label: 'Circle Totals',
    fields: [
      { key: 'circleName',    label: 'Circle Name',    type: 'text',   default: 'UmaKraft' },
      { key: 'date',          label: 'Date',           type: 'text',   default: new Date().toLocaleDateString('ja-JP') },
      { key: 'activeMembers', label: 'Active Members', type: 'number', default: '18' },
      { key: 'pendingCount',  label: 'Pending Count',  type: 'number', default: '2' },
      { key: 'totalDaily',    label: 'Total Daily',    type: 'text',   default: '18,500,000' },
      { key: 'totalWeekly',   label: 'Total Weekly',   type: 'text',   default: '130,000,000' },
      { key: 'totalMonthly',  label: 'Total Monthly',  type: 'text',   default: '450,000,000' },
      { key: 'totalLifetime', label: 'Total Lifetime', type: 'text',   default: '12,000,000,000' },
    ],
  },
  dailyWarnings: {
    label: 'Daily Warnings',
    fields: [
      { key: 'threshold',  label: 'Threshold',   type: 'text',   default: '1,000,000' },
      { key: 'date',       label: 'Date',        type: 'text',   default: new Date().toLocaleDateString('ja-JP') },
      { key: 'circleName', label: 'Circle Name', type: 'text',   default: 'UmaKraft' },
      { key: 'rows',       label: 'Rows (JSON)', type: 'textarea', default: JSON.stringify([
          { name: 'Trainer C', yesterday: '500,000',  monthly: '8,000,000' },
          { name: 'Trainer D', yesterday: '200,000',  monthly: '3,000,000' },
        ], null, 2) },
    ],
  },
  weeklyReport: {
    label: 'Weekly Report',
    fields: [
      { key: 'circleName', label: 'Circle Name', type: 'text', default: 'UmaKraft' },
      { key: 'date',       label: 'Date',        type: 'text', default: new Date().toLocaleDateString('ja-JP') },
      { key: 'rows',       label: 'Rows (JSON)', type: 'textarea', default: JSON.stringify([
          { rank: 1, name: 'Trainer A', daily: '1,200,000', weekly: '9,000,000', monthly: '25,000,000' },
          { rank: 2, name: 'Trainer B', daily: '800,000',   weekly: '6,500,000', monthly: '18,000,000' },
        ], null, 2) },
    ],
  },
  tallyResults: {
    label: 'Tally Results',
    fields: [
      { key: 'circleName',       label: 'Circle Name',        type: 'text',   default: 'UmaKraft' },
      { key: 'weekLabel',        label: 'Week Label',         type: 'text',   default: 'Week 2' },
      { key: 'date',             label: 'Date',               type: 'text',   default: new Date().toLocaleDateString('ja-JP') },
      { key: 'circleWeekTotal',  label: 'Circle Week Total',  type: 'text',   default: '180,000,000' },
      { key: 'rows',             label: 'Rows (JSON)',        type: 'textarea', default: JSON.stringify([
          { rank: 1, name: 'Trainer A', weekGain: '9,000,000', monthly: '25,000,000' },
          { rank: 2, name: 'Trainer B', weekGain: '6,500,000', monthly: '18,000,000' },
        ], null, 2) },
    ],
  },
  infoCard: {
    label: 'Info Card',
    fields: [
      { key: 'accent', label: 'Accent Color', type: 'text',     default: '#5865f2' },
      { key: 'title',  label: 'Title',        type: 'text',     default: 'Notice' },
      { key: 'body',   label: 'Body',         type: 'textarea', default: 'This is an informational message.' },
      { key: 'footer', label: 'Footer',       type: 'text',     default: 'UmaKraft Bot' },
    ],
  },
  monthlyWarningCard: {
    label: 'Monthly Warning Card',
    fields: [
      { key: 'monthName', label: 'Month Name',  type: 'text',   default: 'June' },
      { key: 'daysLeft',  label: 'Days Left',   type: 'number', default: '12' },
      { key: 'circleName',label: 'Circle Name', type: 'text',   default: 'UmaKraft' },
      { key: 'date',      label: 'Date',        type: 'text',   default: new Date().toLocaleDateString('ja-JP') },
      { key: 'rows',      label: 'Rows (JSON)', type: 'textarea', default: JSON.stringify([
          { name: 'Trainer A', monthlyRaw: 22000000, monthly: '22,000,000', gap: '8,000,000', onTrack: true },
          { name: 'Trainer B', monthlyRaw: 10000000, monthly: '10,000,000', gap: '20,000,000', onTrack: false },
        ], null, 2) },
    ],
  },
  playerWarning: {
    label: 'Player Warning',
    fields: [
      { key: 'trainerName',  label: 'Trainer Name',   type: 'text',   default: 'Trainer B' },
      { key: 'date',         label: 'Date',           type: 'text',   default: new Date().toLocaleDateString('ja-JP') },
      { key: 'circleName',   label: 'Circle Name',    type: 'text',   default: 'UmaKraft' },
      { key: 'yesterdayRaw', label: 'Yesterday (raw)',type: 'number', default: '200000' },
      { key: 'dailyReqRaw',  label: 'Daily Req (raw)',type: 'number', default: '1000000' },
      { key: 'yesterday',    label: 'Yesterday (fmt)',type: 'text',   default: '200,000' },
      { key: 'dailyReq',     label: 'Daily Req (fmt)',type: 'text',   default: '1,000,000' },
      { key: 'monthly',      label: 'Monthly (fmt)',  type: 'text',   default: '3,000,000' },
      { key: 'daysLeft',     label: 'Days Left',      type: 'number', default: '18' },
    ],
  },
  milestone: {
    label: 'Milestone',
    fields: [
      { key: 'isSpecial',     label: 'Is Special?',    type: 'select', options: ['false','true'] },
      { key: 'imagePath',     label: 'Image Path',     type: 'text',   default: '' },
      { key: 'message',       label: 'Message',        type: 'textarea', default: 'Congratulations on reaching this milestone!' },
      { key: 'thresholdLabel',label: 'Threshold Label',type: 'text',   default: '10,000,000' },
      { key: 'trainerName',   label: 'Trainer Name',   type: 'text',   default: 'Trainer A' },
      { key: 'posLabel',      label: 'Position Label', type: 'text',   default: '🥇 1st' },
      { key: 'monthlyGain',   label: 'Monthly Gain',   type: 'text',   default: '22,000,000' },
      { key: 'circleName',    label: 'Circle Name',    type: 'text',   default: 'UmaKraft' },
    ],
  },
  storeConfirmation: {
    label: 'Store Confirmation',
    fields: [
      { key: 'isUpdate',     label: 'Is Update?',   type: 'select', options: ['false','true'] },
      { key: 'trainerName',  label: 'Trainer Name', type: 'text',   default: 'Trainer A' },
      { key: 'trainerId',    label: 'Trainer ID',   type: 'text',   default: '12345678' },
      { key: 'rank',         label: 'Rank',         type: 'number', default: '50' },
      { key: 'affinity',     label: 'Affinity',     type: 'text',   default: 'Speed' },
      { key: 'whiteSkills',  label: 'White Skills', type: 'number', default: '3' },
      { key: 'submittedBy',  label: 'Submitted By', type: 'text',   default: 'User#0001' },
    ],
  },
  circleMasterDay: {
    label: 'Circle Master (Day)',
    fields: [
      { key: 'circleName', label: 'Circle Name', type: 'text',   default: 'UmaKraft' },
      { key: 'day',        label: 'Day',         type: 'number', default: '11' },
      { key: 'monthName',  label: 'Month Name',  type: 'text',   default: 'June' },
      { key: 'year',       label: 'Year',        type: 'number', default: new Date().getFullYear().toString() },
      { key: 'totalGain',  label: 'Total Gain',  type: 'text',   default: '18,500,000' },
      { key: 'date',       label: 'Date',        type: 'text',   default: new Date().toLocaleDateString('ja-JP') },
      { key: 'rows',       label: 'Rows (JSON)', type: 'textarea', default: JSON.stringify([
          { rank: 1, name: 'Trainer A', gain: '1,200,000' },
          { rank: 2, name: 'Trainer B', gain: '800,000' },
        ], null, 2) },
    ],
  },
};

// ── HTML page ────────────────────────────────────────────────────────────────

export function buildReportStudioPage() {
  const typeOptions = Object.entries(SCHEMAS)
    .map(([k, s]) => `<option value="${k}">${s.label}</option>`)
    .join('\n');

  const allSchemas = JSON.stringify(SCHEMAS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Report Studio — UmadolProject</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f1117; color: #e2e8f0;
      min-height: 100vh; padding: 28px 20px;
    }
    .wrap { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 380px 1fr; gap: 24px; align-items: start; }
    @media(max-width: 820px){ .wrap { grid-template-columns: 1fr; } }
    header { grid-column: 1/-1; display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
    header a { color: #64748b; text-decoration: none; font-size: 13px; }
    header a:hover { color: #e2e8f0; }
    h1 { font-size: 20px; font-weight: 700; }
    .panel { background: #1e2130; border: 1px solid #2d3148; border-radius: 12px; padding: 20px; }
    label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px; margin-top: 14px; }
    label:first-of-type { margin-top: 0; }
    select, input[type=text], input[type=number], textarea {
      width: 100%; background: #0f1117; border: 1px solid #2d3148;
      color: #e2e8f0; border-radius: 7px; padding: 8px 10px; font-size: 13px;
      font-family: inherit; outline: none;
    }
    select:focus, input:focus, textarea:focus { border-color: #5865f2; }
    textarea { resize: vertical; min-height: 100px; font-family: 'Menlo','Consolas',monospace; font-size: 12px; }
    .btn-row { margin-top: 18px; display: flex; gap: 10px; }
    .btn {
      flex: 1; padding: 10px; border-radius: 8px; font-size: 14px; font-weight: 600;
      cursor: pointer; border: none;
    }
    .btn-primary { background: #5865f2; color: #fff; }
    .btn-primary:hover { background: #4752c4; }
    .btn-primary:disabled { background: #2d3148; color: #64748b; cursor: default; }
    .btn-secondary { background: #2d3148; color: #e2e8f0; }
    .btn-secondary:hover { background: #374165; }
    .btn-secondary:disabled { opacity: .4; cursor: default; }
    .preview-panel { display: flex; flex-direction: column; gap: 14px; }
    .preview-box {
      background: #1e2130; border: 1px solid #2d3148; border-radius: 12px;
      min-height: 220px; display: flex; align-items: center; justify-content: center;
      overflow: hidden; position: relative;
    }
    .preview-box img { max-width: 100%; display: block; border-radius: 8px; }
    .placeholder { color: #475569; font-size: 13px; text-align: center; padding: 20px; }
    .spinner {
      width: 32px; height: 32px; border: 3px solid #2d3148;
      border-top-color: #5865f2; border-radius: 50%;
      animation: spin .8s linear infinite; display: none;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-msg { color: #f87171; font-size: 12px; padding: 12px; background: #2d1a1a; border-radius: 8px; display: none; }
    .meta { font-size: 11px; color: #64748b; }
    select#reportType { margin-bottom: 18px; font-weight: 600; font-size: 14px; }
    .section-divider { border: none; border-top: 1px solid #2d3148; margin: 16px 0; }
  </style>
</head>
<body>
<div class="wrap">
  <header>
    <a href="/">← Dashboard</a>
    <h1>🖼 Report Studio</h1>
  </header>

  <!-- LEFT: form -->
  <div class="panel">
    <label for="reportType" style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Report Type</label>
    <select id="reportType">${typeOptions}</select>
    <hr class="section-divider"/>
    <div id="fields"></div>
    <div class="btn-row">
      <button class="btn btn-primary" id="generateBtn" onclick="generate()">Generate</button>
      <button class="btn btn-secondary" id="downloadBtn" onclick="download()" disabled>⬇ Download</button>
    </div>
  </div>

  <!-- RIGHT: preview -->
  <div class="preview-panel">
    <div class="preview-box" id="previewBox">
      <div class="placeholder" id="placeholder">Select a report type and click Generate</div>
      <div class="spinner" id="spinner"></div>
      <img id="previewImg" style="display:none" alt="preview"/>
    </div>
    <div class="error-msg" id="errorMsg"></div>
    <div class="meta" id="metaLine"></div>
  </div>
</div>

<script>
const SCHEMAS = ${allSchemas};
let lastBlob = null;
let currentType = null;

function buildFields(type) {
  currentType = type;
  const schema = SCHEMAS[type];
  if (!schema) return;
  const container = document.getElementById('fields');
  container.innerHTML = '';
  for (const f of schema.fields) {
    const lbl = document.createElement('label');
    lbl.textContent = f.label;
    container.appendChild(lbl);
    if (f.type === 'select') {
      const sel = document.createElement('select');
      sel.id = 'f_' + f.key;
      for (const opt of f.options) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        sel.appendChild(o);
      }
      container.appendChild(sel);
    } else if (f.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.id = 'f_' + f.key;
      ta.value = f.default ?? '';
      container.appendChild(ta);
    } else {
      const inp = document.createElement('input');
      inp.type = f.type === 'number' ? 'number' : 'text';
      inp.id = 'f_' + f.key;
      inp.value = f.default ?? '';
      container.appendChild(inp);
    }
  }
}

function collectData(type) {
  const schema = SCHEMAS[type];
  const data = {};
  for (const f of schema.fields) {
    const el = document.getElementById('f_' + f.key);
    let val = el.value;
    if (f.type === 'number') val = Number(val);
    else if (f.type === 'textarea') {
      try { val = JSON.parse(val); } catch { /* keep as string */ }
    } else if (f.type === 'select' && (val === 'true' || val === 'false')) {
      val = val === 'true';
    }
    data[f.key] = val;
  }
  return data;
}

async function generate() {
  const type = document.getElementById('reportType').value;
  const data = collectData(type);

  document.getElementById('placeholder').style.display = 'none';
  document.getElementById('previewImg').style.display = 'none';
  document.getElementById('spinner').style.display = 'block';
  document.getElementById('errorMsg').style.display = 'none';
  document.getElementById('generateBtn').disabled = true;
  document.getElementById('downloadBtn').disabled = true;
  document.getElementById('metaLine').textContent = '';

  const t0 = Date.now();
  try {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || res.statusText);
    }
    const blob = await res.blob();
    lastBlob = blob;
    const url = URL.createObjectURL(blob);
    const img = document.getElementById('previewImg');
    img.onload = () => {
      document.getElementById('metaLine').textContent =
        \`\${img.naturalWidth}×\${img.naturalHeight}px · rendered in \${Date.now()-t0}ms\`;
    };
    img.src = url;
    img.style.display = 'block';
    document.getElementById('downloadBtn').disabled = false;
  } catch (err) {
    const em = document.getElementById('errorMsg');
    em.textContent = '⚠ ' + err.message;
    em.style.display = 'block';
    document.getElementById('placeholder').style.display = 'block';
    document.getElementById('placeholder').textContent = 'Generation failed';
  } finally {
    document.getElementById('spinner').style.display = 'none';
    document.getElementById('generateBtn').disabled = false;
  }
}

function download() {
  if (!lastBlob) return;
  const type = document.getElementById('reportType').value;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(lastBlob);
  a.download = type + '_' + Date.now() + '.png';
  a.click();
}

// Init
document.getElementById('reportType').addEventListener('change', e => buildFields(e.target.value));
buildFields(document.getElementById('reportType').value);
</script>
</body>
</html>`;
}

// ── API handler ──────────────────────────────────────────────────────────────

/**
 * Handle POST /api/render — returns a PNG buffer.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleRender(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    let type, data;
    try {
      ({ type, data } = JSON.parse(body));
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid JSON body');
      return;
    }

    const renderer = RENDERERS[type];
    if (!renderer) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`Unknown report type: ${type}`);
      return;
    }

    try {
      const buffer = await renderer(data);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': buffer.length,
        'Cache-Control': 'no-store',
      });
      res.end(buffer);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Render failed: ${err.message}`);
    }
  });
}
