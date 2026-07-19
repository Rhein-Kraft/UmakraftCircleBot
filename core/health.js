// @ts-check
/**
 * health.js
 * ─────────
 * HTTP server serving:
 *   GET /           → HTML status dashboard (preview pane)
 *   GET /health     → JSON full status payload
 *   GET /ready      → 200 if bot is logged in, 503 otherwise
 *   GET /download/token.enc → download the encrypted token file
 */
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { log } from './log.js';
import { timelineStatus } from '../umamoe/timeline/timeline.js';
import { getState } from '../db/timelineCache.js';
import { syncStatus } from '../tasks/dataSync.js';
import { getTaskStats, getRegisteredCount } from './taskRegistry.js';
import { getConfiguredCircles } from './config.js';
import { buildReportStudioPage, handleRender } from './reportStudio.js';
import { buildDocsStudioPage } from './docsStudio.js';
import { buildSlidesStudioPage } from './slidesStudio.js';
import { handleFanDeficit } from '../fantracking/warnings/fanDeficitApi.js';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

const FALCON_IMG_PATH = path.join(projectRoot, 'attached_assets', 'smartfalcon_icon_1781245645944.png');
const FALCON_B64 = existsSync(FALCON_IMG_PATH)
  ? `data:image/png;base64,${readFileSync(FALCON_IMG_PATH).toString('base64')}`
  : '';

/** Live club rank per circle, updated by dataSync after each successful snapshot. */
const circleRanks = new Map();

/**
 * Called by dataSync after each successful buildSnapshot.
 * @param {string|number} circleId
 * @param {number} rank
 */
export function setCircleRank(circleId, rank) {
  circleRanks.set(String(circleId), rank);
}

/** @type {import('discord.js').Client | null} */
let botClient = null;

// ── Official club rank badge image mapping ────────────────────────────────
// API club_rank: 1 = lowest (D-), 12 = highest (SS)
const RANK_BADGE_FILES = {
  1:  'Dminus.png',
  2:  'D.png',
  3:  'Dplus.png',
  4:  'C.png',
  5:  'Cplus.png',
  6:  'B.png',
  7:  'Bplus.png',
  8:  'A.png',
  9:  'Aplus.png',
  10: 'S.png',
  11: 'Splus.png',
  12: 'SS.png',
};
const BADGES_DIR = path.join(projectRoot, 'attached_assets', 'badges2');

/** Format fan number: 386475819 → "386.5M" */
function fmtFans(n) {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
}

/** Query active members with latest fan count from store.db (sync). */
function getCircleMembers(circleId) {
  try {
    const dbPath = path.join(config.dataDir, 'store.db');
    if (!existsSync(dbPath)) return [];
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(`
      SELECT m.trainer_name, MAX(g.total_fans) AS fans
      FROM members m
      LEFT JOIN daily_gains g ON g.viewer_id = m.viewer_id AND g.circle_id = m.circle_id
      WHERE m.circle_id = ? AND m.left_at IS NULL
      GROUP BY m.viewer_id
      ORDER BY fans DESC NULLS LAST
    `).all(String(circleId));
    db.close();
    return rows;
  } catch {
    return [];
  }
}

function getStatusPayload() {
  const online = botClient?.isReady() ?? false;
  const lastUpdate = getState('last_update');
  const lastError = getState('last_error');
  const mem = process.memoryUsage();

  return {
    status: online ? 'ok' : 'starting',
    bot_online: online,
    bot_tag: botClient?.user?.tag ?? null,
    active_circles: getConfiguredCircles().length,
    data_sync: Object.fromEntries(
      [...syncStatus.entries()].map(([id, s]) => [
        id,
        {
          last_sync_at: s.lastSyncAt,
          last_sync_error: s.lastSyncError,
          consecutive_failures: s.consecutiveFailures,
        },
      ])
    ),
    timeline: {
      last_update_at: lastUpdate ?? timelineStatus.lastUpdateAt,
      last_error: lastError ?? timelineStatus.lastError,
      total_posted: timelineStatus.totalPosted,
      is_running: timelineStatus.isRunning,
    },
    tasks: {
      registered: getRegisteredCount(),
      stats: getTaskStats(),
    },
    memory: {
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      rss_mb: Math.round(mem.rss / 1024 / 1024),
    },
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Render the official club rank badge as an img served from /badge/:rank.png */
function rankBadgeHtml(circleId) {
  const rank = circleRanks.get(String(circleId));
  if (rank == null) return `<div class="rank-badge-unknown">?</div>`;
  return `<img src="/badge/${rank}.png" class="rank-badge-img" alt="Club Rank ${rank}"/>`;
}

/** Render one expandable circle card (details/summary). */
function circleCardHtml(circleId, displayName, members) {
  const badge = rankBadgeHtml(circleId);
  const count = members.length;
  const rows = members.map((m, i) =>
    `<div class="ml-row">
      <span class="ml-rank">${i + 1}</span>
      <span class="ml-name">${escHtml(m.trainer_name ?? '?')}</span>
      <span class="ml-fans">${fmtFans(m.fans)}</span>
    </div>`
  ).join('');

  return `
  <details class="circle-card">
    <summary class="circle-summary">
      <span class="circle-title">${escHtml(displayName)}</span>
      <div class="circle-meta">
        ${badge}
        <span class="member-count">${count} members</span>
      </div>
      <span class="circle-chevron">▼</span>
    </summary>
    <div class="circle-body">
      ${rows || '<div style="color:#64748b;font-size:12px;padding:8px 0">No members found.</div>'}
    </div>
  </details>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDashboard(p) {
  const statusColor = p.bot_online ? '#22c55e' : '#f59e0b';
  const statusLabel = p.bot_online ? '🟢 Online' : '🟡 Starting…';
  const circles = getConfiguredCircles();

  const syncRows = [...syncStatus.entries()].map(([id, s]) => {
    const circle = circles.find(c => c.id === id);
    const name = circle?.name ?? id;
    const when = s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—';
    const err = s.consecutiveFailures > 0
      ? `<span style="color:#f87171">${s.consecutiveFailures} failure(s)</span>`
      : `<span style="color:#4ade80">OK</span>`;
    return `<tr><td>${name}</td><td>${when}</td><td>${err}</td></tr>`;
  }).join('');

  const tokenEncPath = path.join(projectRoot, 'token.enc');
  const hasTokenEnc = existsSync(tokenEncPath);
  const downloadBtn = hasTokenEnc
    ? `<a href="/download/token.enc" class="btn">⬇ Download token.enc</a>`
    : `<span style="color:#6b7280;font-size:13px">token.enc not found</span>`;

  // Live member data from DB
  const c1Members = getCircleMembers('974470619');
  const c2Members = getCircleMembers('325938032');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>UmaKraft — Status</title>
  <meta http-equiv="refresh" content="30"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    /* ── Top title ── */
    .top {
      width: 100%;
      text-align: center;
      padding: 48px 20px 24px;
    }
    .top h1 {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: -1px;
      background: linear-gradient(135deg, #a78bfa 0%, #5865f2 50%, #818cf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .top .tagline {
      font-size: 13px;
      color: #64748b;
      margin-top: 6px;
      letter-spacing: .04em;
    }
    .badge {
      display: inline-block;
      margin-top: 12px;
      padding: 4px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      background: ${statusColor}22;
      color: ${statusColor};
      border: 1px solid ${statusColor}44;
    }

    /* ── Stats / tools toggle button ── */
    .toggle-wrap {
      width: 100%;
      max-width: 760px;
      display: flex;
      justify-content: center;
      padding: 0 20px;
      margin-top: 4px;
    }
    .toggle-btn {
      background: none;
      border: 1px solid #2d3148;
      border-radius: 999px;
      color: #94a3b8;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.2s, border-color 0.2s;
    }
    .toggle-btn:hover { background: #1e2130; border-color: #5865f2; color: #e2e8f0; }
    .toggle-arrow {
      display: inline-block;
      transition: transform 0.3s;
      font-size: 11px;
    }
    .toggle-arrow.up { transform: rotate(180deg); }

    /* ── Expandable stats panel ── */
    .panel {
      width: 100%;
      max-width: 760px;
      padding: 0 20px;
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition: max-height 0.4s ease, opacity 0.3s ease;
    }
    .panel.open {
      max-height: 2400px;
      opacity: 1;
    }

    /* ── Stats grid ── */
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
      margin-top: 16px;
    }
    @media(max-width:520px){ .grid { grid-template-columns: 1fr; } }
    .card {
      background: #1e2130;
      border: 1px solid #2d3148;
      border-radius: 12px;
      padding: 16px 20px;
    }
    .card-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
    .card-value { font-size: 26px; font-weight: 700; }
    .card-sub { font-size: 12px; color: #94a3b8; margin-top: 3px; }

    /* ── Sections ── */
    .section {
      background: #1e2130;
      border: 1px solid #2d3148;
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 12px;
    }
    .section h2 { font-size: 13px; font-weight: 600; color: #94a3b8; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing:.05em; padding-bottom: 8px; }
    td { padding: 5px 0; border-top: 1px solid #2d3148; }
    td:last-child { text-align: right; }

    /* ── Tool grid ── */
    .tool-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
    }
    @media(max-width:560px){ .tool-grid { grid-template-columns: 1fr; } }
    .tool-card {
      background: #171a2b;
      border: 1px solid #2d3148;
      border-radius: 10px;
      padding: 14px;
    }
    .tool-card h3 { font-size: 12px; font-weight: 600; margin-bottom: 5px; }
    .tool-card p { font-size: 11px; color: #64748b; margin: 0 0 10px; }
    .btn {
      display: inline-block;
      background: #5865f2;
      color: #fff;
      padding: 7px 16px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
      width: 100%;
      text-align: center;
    }
    .btn:hover { background: #4752c4; }

    /* ── Bottom section (falcon + circles) ── */
    .bottom {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      max-width: 760px;
      padding: 24px 20px 32px;
      margin-top: auto;
    }
    .falcon-img {
      width: 400px;
      height: 400px;
      object-fit: contain;
      filter: drop-shadow(0 8px 40px #5865f260);
    }

    /* ── Circle cards row ── */
    .circles-row {
      display: flex;
      gap: 14px;
      width: 100%;
      margin-top: 20px;
    }
    @media(max-width:560px){ .circles-row { flex-direction: column; } }

    .circle-card {
      flex: 1;
      background: #1a1d2e;
      border: 1px solid #2d3148;
      border-radius: 14px;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .circle-card[open] { border-color: #5865f2; }
    .circle-card:hover { border-color: #4752c4; }

    .circle-summary {
      list-style: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 18px 16px 14px;
      cursor: pointer;
      user-select: none;
      position: relative;
    }
    .circle-summary::-webkit-details-marker { display: none; }

    .circle-title {
      font-size: 17px;
      font-weight: 700;
      background: linear-gradient(135deg, #a78bfa 0%, #818cf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .circle-meta {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    /* ── Rank badge (official game image) ── */
    .rank-badge-img {
      width: 110px;
      height: auto;
      display: block;
      filter: drop-shadow(0 2px 8px #0006);
    }
    .rank-badge-unknown {
      width: 80px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1e2130;
      border: 1px dashed #2d3148;
      border-radius: 8px;
      color: #475569;
      font-size: 18px;
    }

    .member-count {
      font-size: 12px;
      color: #64748b;
      font-weight: 500;
    }

    .circle-chevron {
      font-size: 10px;
      color: #4b5563;
      transition: transform 0.25s;
      position: absolute;
      bottom: 10px;
      right: 14px;
    }
    .circle-card[open] .circle-chevron { transform: rotate(180deg); }

    /* ── Member list ── */
    .circle-body {
      padding: 0 12px 12px;
      border-top: 1px solid #2d3148;
      max-height: 340px;
      overflow-y: auto;
    }
    .circle-body::-webkit-scrollbar { width: 4px; }
    .circle-body::-webkit-scrollbar-track { background: transparent; }
    .circle-body::-webkit-scrollbar-thumb { background: #2d3148; border-radius: 2px; }

    .ml-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 4px;
      border-bottom: 1px solid #1e2433;
      font-size: 12px;
    }
    .ml-row:last-child { border-bottom: none; }
    .ml-rank {
      width: 18px;
      text-align: center;
      font-size: 10px;
      color: #475569;
      font-weight: 600;
      flex-shrink: 0;
    }
    .ml-name {
      flex: 1;
      color: #cbd5e1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-fans {
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;
    }

    footer { font-size: 11px; color: #334155; margin-top: 16px; text-align: center; }
  </style>
</head>
<body>

  <!-- TOP: Title + status -->
  <div class="top">
    <h1>UmaKraft</h1>
    <div class="tagline">Uma Musume Circle Bot &nbsp;·&nbsp; UmadolProject#4037</div>
    <span class="badge">${statusLabel}</span>
  </div>

  <!-- Toggle for stats/tools panel (above image) -->
  <div class="toggle-wrap">
    <button class="toggle-btn" id="toggleBtn" onclick="togglePanel()">
      <span>Status &amp; Tools</span>
      <span class="toggle-arrow" id="arrow">▼</span>
    </button>
  </div>

  <!-- Expandable stats / tools panel -->
  <div class="panel" id="panel">
    <div class="grid">
      <div class="card">
        <div class="card-label">Uptime</div>
        <div class="card-value">${formatUptime(p.uptime_seconds)}</div>
        <div class="card-sub">since last restart</div>
      </div>
      <div class="card">
        <div class="card-label">Active Circles</div>
        <div class="card-value">${p.active_circles}</div>
        <div class="card-sub">${circles.map(c => c.name).join(' · ')}</div>
      </div>
      <div class="card">
        <div class="card-label">Memory</div>
        <div class="card-value">${p.memory.heap_used_mb} <span style="font-size:15px;color:#64748b">MB</span></div>
        <div class="card-sub">of ${p.memory.heap_total_mb} MB heap</div>
      </div>
      <div class="card">
        <div class="card-label">Scheduled Tasks</div>
        <div class="card-value">${p.tasks.registered}</div>
        <div class="card-sub">active cron jobs</div>
      </div>
    </div>

    <div class="section">
      <h2>Data Sync Status</h2>
      ${syncRows
        ? `<table><thead><tr><th>Circle</th><th>Last Sync (JST)</th><th>Status</th></tr></thead><tbody>${syncRows}</tbody></table>`
        : `<p style="color:#64748b;font-size:13px">No sync data yet — first sync runs at next hour mark.</p>`}
    </div>

    <div class="section">
      <h2>Timeline</h2>
      <table><tbody>
        <tr><td>Total posted</td><td>${p.timeline.total_posted ?? 0}</td></tr>
        <tr><td>Currently running</td><td>${p.timeline.is_running ? 'Yes' : 'No'}</td></tr>
        <tr><td>Last update</td><td>${p.timeline.last_update_at ? new Date(p.timeline.last_update_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—'}</td></tr>
        <tr><td>Last error</td><td>${p.timeline.last_error ?? '—'}</td></tr>
      </tbody></table>
    </div>

    <div class="section">
      <h2>🛠 Tools &amp; Utilities</h2>
      <div class="tool-grid">
        <div class="tool-card">
          <h3>🖼 Report Studio</h3>
          <p>Preview bot image reports as PNG — leaderboards, fan gains, milestones.</p>
          <a href="/reports" class="btn">Open →</a>
        </div>
        <div class="tool-card">
          <h3>📊 Docs Studio</h3>
          <p>Browser spreadsheet editor. Import/export CSV or JSON.</p>
          <a href="/docs" class="btn">Open →</a>
        </div>
        <div class="tool-card">
          <h3>🎞 Slides Studio</h3>
          <p>Build and save presentation slides — text, shapes, formatting.</p>
          <a href="/slides" class="btn">Open →</a>
        </div>
        <div class="tool-card">
          <h3>🔐 Token File</h3>
          <p>Download token.enc for the Google Drive auto-load chain.</p>
          ${downloadBtn}
        </div>
      </div>
    </div>
  </div>

  <!-- BOTTOM: SmartFalcon + expandable circle cards -->
  <div class="bottom">
    ${FALCON_B64 ? `<img src="${FALCON_B64}" class="falcon-img" alt="SmartFalcon"/>` : ''}

    <div class="circles-row">
      ${circleCardHtml('974470619', 'UmaKraft', c1Members)}
      ${circleCardHtml('325938032', 'UmaKraft II', c2Members)}
    </div>

    <footer>Auto-refreshes every 30 s &nbsp;·&nbsp; ${p.timestamp}</footer>
  </div>

  <script>
    function togglePanel() {
      const panel = document.getElementById('panel');
      const arrow = document.getElementById('arrow');
      const isOpen = panel.classList.toggle('open');
      arrow.classList.toggle('up', isOpen);
    }
  </script>
</body>
</html>`;
}

/**
 * Create and start the health HTTP server.
 * @param {import('discord.js').Client} client
 */
export function startHealthServer(client) {
  botClient = client;

  const primaryPort = parseInt(process.env.PORT || process.env.HEALTH_PORT || '8080', 10);
  const PORTS_TO_TRY = [primaryPort, 8081, 3000].filter((p, i, arr) => arr.indexOf(p) === i);

  async function requestHandler(req, res) {
    const online = botClient?.isReady() ?? false;
    const url = req.url?.split('?')[0] ?? '/';

    // ── /ready ──────────────────────────────────────────────────────────────
    if (url === '/ready') {
      res.writeHead(online ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: online }));
      return;
    }

    // ── /health (JSON) ───────────────────────────────────────────────────────
    if (url === '/health') {
      const payload = getStatusPayload();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload, null, 2));
      return;
    }

    // ── /download/token.enc ──────────────────────────────────────────────────
    if (url === '/download/token.enc') {
      const filePath = path.join(projectRoot, 'token.enc');
      if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('token.enc not found. Run: node scripts/generate-token-enc.js');
        return;
      }
      const data = readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="token.enc"',
        'Content-Length': data.length,
      });
      res.end(data);
      return;
    }

    // ── /api/slides/load (GET — load saved slides from disk) ────────────────
    if (url === '/api/slides/load') {
      const filePath = path.join(config.dataDir, 'slides.json');
      if (!existsSync(filePath)) { res.writeHead(204); res.end(); return; }
      try {
        const data = readFileSync(filePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(data);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Load failed: ' + err.message);
      }
      return;
    }

    // ── /api/slides/save (POST — save slides to disk) ────────────────────────
    if (url === '/api/slides/save' && req.method === 'POST') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          JSON.parse(body); // validate
          mkdirSync(config.dataDir, { recursive: true });
          const filePath = path.join(config.dataDir, 'slides.json');
          writeFileSync(filePath, body, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, savedAt: new Date().toISOString() }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Save failed: ' + err.message);
        }
      });
      req.on('error', err => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Request error: ' + err.message);
      });
      return;
    }

    // ── /api/docs/load (GET — load saved spreadsheet from disk) ─────────────
    if (url === '/api/docs/load') {
      const filePath = path.join(config.dataDir, 'docsStudio.json');
      if (!existsSync(filePath)) {
        res.writeHead(204); res.end(); return;
      }
      try {
        const data = readFileSync(filePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(data);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Load failed: ' + err.message);
      }
      return;
    }

    // ── /api/docs/save (POST — save spreadsheet to disk) ────────────────────
    if (url === '/api/docs/save' && req.method === 'POST') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          JSON.parse(body); // validate — throws if malformed
          mkdirSync(config.dataDir, { recursive: true });
          const filePath = path.join(config.dataDir, 'docsStudio.json');
          writeFileSync(filePath, body, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, savedAt: new Date().toISOString() }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Save failed: ' + err.message);
        }
      });
      req.on('error', err => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Request error: ' + err.message);
      });
      return;
    }

    // ── /badge/:rank.png (GET — official club rank badge image) ─────────────
    if (url.startsWith('/badge/') && url.endsWith('.png')) {
      const rank = parseInt(url.slice(7, -4), 10);
      const file = RANK_BADGE_FILES[rank];
      if (file) {
        const imgPath = path.join(BADGES_DIR, file);
        if (existsSync(imgPath)) {
          const data = readFileSync(imgPath);
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
          res.end(data);
          return;
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Badge not found');
      return;
    }

    // ── /api/fan-deficit (GET — live fan deficit report) ─────────────────────
    if (url === '/api/fan-deficit') {
      handleFanDeficit(req, res);
      return;
    }

    // ── /slides (Slides Studio) ──────────────────────────────────────────────
    if (url === '/slides') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildSlidesStudioPage());
      return;
    }

    // ── /docs (Docs Studio) ──────────────────────────────────────────────────
    if (url === '/docs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildDocsStudioPage());
      return;
    }

    // ── /reports (Report Studio) ─────────────────────────────────────────────
    if (url === '/reports') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildReportStudioPage());
      return;
    }

    // ── /api/render (POST — PNG generation) ─────────────────────────────────
    if (url === '/api/render' && req.method === 'POST') {
      await handleRender(req, res);
      return;
    }

    // ── / (HTML dashboard) ───────────────────────────────────────────────────
    const payload = getStatusPayload();
    const html = buildDashboard(payload);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  function tryBind(index) {
    if (index >= PORTS_TO_TRY.length) {
      log.warn('[Health] No available port found — health server disabled');
      return;
    }

    const port = PORTS_TO_TRY[index];
    const server = http.createServer(requestHandler);

    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        log.warn(`[Health] Port ${port} in use — trying next port`);
        tryBind(index + 1);
      } else {
        log.warn(`[Health] Health server error on port ${port}: ${err.message}`);
      }
    });

    server.listen(port, '0.0.0.0', () => {
      log.info(`[Health] Health server listening on port ${port} → GET /health`);
    });
  }

  tryBind(0);
}
