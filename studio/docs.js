// @ts-check
/**
 * docsStudio.js — v2
 * ──────────────────
 * Spreadsheet editor with cell merging, font size, and font family support.
 * Pure client-side; data persists in localStorage (key: docsStudio_v2).
 *
 * Cell data model:
 *   { v, fs, ff, b, i, cs, rs, hd, pr, pc }
 *   v  = value (string)
 *   fs = font-size override (number px) | null → default
 *   ff = font-family override (string)  | null → default
 *   b  = bold (boolean)
 *   i  = italic (boolean)
 *   cs = colspan (default 1)
 *   rs = rowspan (default 1)
 *   hd = hidden — covered by a merge (boolean)
 *   pr = parent row index (when hd=true)
 *   pc = parent col index (when hd=true)
 */

export function buildDocsStudioPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Docs Studio — UmadolProject</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f1117; --surface: #1e2130; --border: #2d3148;
      --text: #e2e8f0; --muted: #64748b; --accent: #5865f2;
      --ah: #4752c4; --head-bg: #161924; --sel: #5865f228;
      --sel-b: #5865f2; --range: #5865f215;
    }
    html, body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg); color: var(--text);
      display: flex; flex-direction: column; height: 100vh; overflow: hidden;
    }

    /* ── Top bar ── */
    .topbar {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 8px 14px; background: var(--surface);
      border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .topbar a { color: var(--muted); text-decoration: none; font-size: 13px; }
    .topbar a:hover { color: var(--text); }
    .sheet-title {
      font-size: 15px; font-weight: 700; background: none; border: none;
      color: var(--text); outline: none; border-bottom: 1px solid transparent;
      padding: 2px 4px; min-width: 110px;
    }
    .sheet-title:focus { border-bottom-color: var(--accent); }
    .sep { width: 1px; height: 20px; background: var(--border); flex-shrink: 0; }
    .bg { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
    .tbtn {
      background: var(--border); color: var(--text); border: none;
      border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 600;
      cursor: pointer; white-space: nowrap; height: 26px;
    }
    .tbtn:hover { background: #374165; }
    .tbtn.accent { background: var(--accent); }
    .tbtn.accent:hover { background: var(--ah); }
    .tbtn.danger { background: #7f1d1d; }
    .tbtn.danger:hover { background: #991b1b; }
    .tbtn.active { background: #374165; outline: 1px solid var(--accent); }

    /* ── Format bar ── */
    .fmtbar {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      padding: 5px 14px; background: var(--head-bg);
      border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .fmtbar select, .fmtbar input[type=number] {
      background: var(--border); color: var(--text); border: 1px solid #3d4468;
      border-radius: 5px; padding: 3px 6px; font-size: 12px; outline: none; height: 26px;
    }
    .fmtbar select:focus, .fmtbar input:focus { border-color: var(--accent); }
    #fmtFontFamily { min-width: 140px; }
    #fmtFontSize   { width: 54px; }
    .fmt-label { font-size: 11px; color: var(--muted); }
    .fmtbtn {
      background: var(--border); color: var(--text); border: 1px solid transparent;
      border-radius: 5px; width: 26px; height: 26px; font-size: 13px; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      line-height: 1;
    }
    .fmtbtn:hover { background: #374165; }
    .fmtbtn.on { background: #374165; border-color: var(--accent); color: var(--accent); }
    .merge-btn {
      background: var(--border); color: var(--text); border: none;
      border-radius: 5px; padding: 3px 10px; font-size: 12px; font-weight: 600;
      cursor: pointer; height: 26px;
    }
    .merge-btn:hover { background: #374165; }

    /* ── Formula bar ── */
    .formulabar {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 14px; background: var(--surface);
      border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .cell-ref {
      font-size: 12px; font-family: monospace; color: var(--muted);
      min-width: 58px; text-align: center; background: var(--border);
      border-radius: 4px; padding: 3px 6px; white-space: nowrap;
    }
    .formula-input {
      flex: 1; background: var(--bg); border: 1px solid var(--border);
      color: var(--text); border-radius: 6px; padding: 4px 10px;
      font-size: 13px; font-family: inherit; outline: none;
    }
    .formula-input:focus { border-color: var(--accent); }

    /* ── Sheet tabs ── */
    .sheet-tabs {
      display: flex; align-items: center; gap: 4px;
      padding: 5px 14px 0; background: var(--head-bg);
      border-bottom: 1px solid var(--border); flex-shrink: 0; overflow-x: auto;
    }
    .tab {
      padding: 4px 14px; border-radius: 5px 5px 0 0;
      font-size: 12px; cursor: pointer; border: 1px solid transparent;
      border-bottom: none; white-space: nowrap; background: var(--border); color: var(--muted);
    }
    .tab.active { background: var(--surface); color: var(--text); border-color: var(--border); }
    .tab-add { padding: 4px 10px; color: var(--muted); cursor: pointer; font-size: 14px; }
    .tab-add:hover { color: var(--text); }

    /* ── Grid ── */
    .grid-wrap { flex: 1; overflow: auto; }
    table { border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid var(--border); }

    .th-corner {
      position: sticky; top: 0; left: 0; z-index: 4;
      width: 46px; min-width: 46px; max-width: 46px;
      background: var(--head-bg);
    }
    .th-col {
      position: sticky; top: 0; z-index: 3;
      background: var(--head-bg); color: var(--muted);
      font-size: 11px; font-weight: 600; text-align: center;
      padding: 4px 2px; user-select: none; min-width: 96px; white-space: nowrap;
    }
    .th-col.sel { background: #252b42; color: var(--text); }
    .th-row {
      position: sticky; left: 0; z-index: 2;
      background: var(--head-bg); color: var(--muted);
      font-size: 11px; font-weight: 600; text-align: right;
      padding: 3px 8px; user-select: none; min-width: 46px; max-width: 46px;
    }
    .th-row.sel { background: #252b42; color: var(--text); }

    td.cell {
      font-size: 13px; padding: 0; height: 26px; min-width: 96px;
      overflow: hidden; white-space: nowrap; cursor: cell; vertical-align: middle;
    }
    td.cell.selected {
      background: var(--sel) !important;
      outline: 2px solid var(--sel-b); outline-offset: -2px;
    }
    td.cell.in-range { background: var(--range); }
    td.cell span {
      display: block; padding: 2px 6px; width: 100%;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    td.cell input {
      width: 100%; height: 100%; min-height: 26px; padding: 2px 6px;
      background: #2d3148; color: var(--text);
      border: 2px solid var(--accent); outline: none;
      font-size: inherit; font-family: inherit; box-sizing: border-box;
    }

    /* ── Status bar ── */
    .statusbar {
      display: flex; align-items: center; gap: 16px;
      padding: 3px 14px; background: var(--head-bg);
      border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); flex-shrink: 0;
    }
    #statusSum { margin-left: auto; }

    /* Scrollbar */
    .grid-wrap::-webkit-scrollbar { width: 8px; height: 8px; }
    .grid-wrap::-webkit-scrollbar-track { background: var(--bg); }
    .grid-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    .grid-wrap::-webkit-scrollbar-thumb:hover { background: #3d4468; }
  </style>
</head>
<body>

<!-- ── Top bar ── -->
<div class="topbar">
  <a href="/">← Dashboard</a>
  <div class="sep"></div>
  <input class="sheet-title" id="sheetTitle" value="Untitled Sheet" spellcheck="false"/>
  <div class="sep"></div>
  <div class="bg">
    <button class="tbtn" onclick="addRow()">+ Row</button>
    <button class="tbtn" onclick="addCol()">+ Column</button>
    <button class="tbtn danger" onclick="deleteRow()">− Row</button>
    <button class="tbtn danger" onclick="deleteCol()">− Column</button>
  </div>
  <div class="sep"></div>
  <div class="bg">
    <button class="tbtn" onclick="clearSheet()">Clear</button>
    <button class="tbtn" onclick="importCsv()">Import CSV</button>
    <button class="tbtn accent" onclick="exportCsv()">Export CSV</button>
    <button class="tbtn accent" onclick="exportJson()">Export JSON</button>
  </div>
  <input type="file" id="csvInput" accept=".csv" style="display:none" onchange="handleImport(event)"/>
  <div class="sep"></div>
  <button class="tbtn accent" id="btnFanDeficit" onclick="loadFanDeficit()">📊 Fan Deficit</button>
  <div class="sep"></div>
  <button class="tbtn accent" id="btnSave" onclick="saveToServer()">💾 Save</button>
  <span id="saveStatus" style="font-size:11px;color:var(--muted);white-space:nowrap"></span>
</div>

<!-- ── Format bar ── -->
<div class="fmtbar">
  <span class="fmt-label">Font</span>
  <select id="fmtFontFamily" onchange="applyFmt('ff', this.value || null)">
    <option value="">Default</option>
    <option value="Arial">Arial</option>
    <option value="'Times New Roman',serif">Times New Roman</option>
    <option value="'Courier New',monospace">Courier New</option>
    <option value="Georgia,serif">Georgia</option>
    <option value="Verdana,sans-serif">Verdana</option>
    <option value="'Trebuchet MS',sans-serif">Trebuchet MS</option>
    <option value="Impact,sans-serif">Impact</option>
    <option value="'Comic Sans MS',cursive">Comic Sans MS</option>
  </select>
  <span class="fmt-label">Size</span>
  <input id="fmtFontSize" type="number" min="6" max="96" value="13"
    onchange="applyFmt('fs', this.value ? parseInt(this.value) : null)"
    onkeydown="if(event.key==='Enter') applyFmt('fs', this.value ? parseInt(this.value) : null)"/>
  <button class="fmtbtn" id="btnBold"   onclick="toggleFmt('b')" title="Bold">B</button>
  <button class="fmtbtn" id="btnItalic" onclick="toggleFmt('i')" title="Italic" style="font-style:italic">I</button>
  <div class="sep"></div>
  <button class="merge-btn" onclick="mergeCells()" title="Merge selected cells">⊞ Merge</button>
  <button class="merge-btn" onclick="unmergeCells()" title="Unmerge cell">⊟ Unmerge</button>
  <div class="sep"></div>
  <span id="fmtHint" style="font-size:11px;color:var(--muted)"></span>
</div>

<!-- ── Formula bar ── -->
<div class="formulabar">
  <div class="cell-ref" id="cellRef">A1</div>
  <input class="formula-input" id="formulaInput" placeholder="Cell value…"
    oninput="onFormulaInput()"
    onkeydown="onFormulaKey(event)"/>
</div>

<!-- ── Sheet tabs ── -->
<div class="sheet-tabs" id="tabBar">
  <div class="tab active" ondblclick="renameSheet(0)">Sheet1</div>
  <div class="tab-add" onclick="addSheet()">＋</div>
</div>

<!-- ── Grid ── -->
<div class="grid-wrap" id="gridWrap">
  <table id="grid"></table>
</div>

<!-- ── Status bar ── -->
<div class="statusbar">
  <span id="statusSel">A1</span>
  <span id="statusSum"></span>
</div>

<script>
// ── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'docsStudio_v2';
const DEF_ROWS = 30, DEF_COLS = 12;
const FONTS = {
  '': 'Default', 'Arial': 'Arial',
  "'Times New Roman',serif": 'Times New Roman',
  "'Courier New',monospace": 'Courier New',
  'Georgia,serif': 'Georgia', 'Verdana,sans-serif': 'Verdana',
  "'Trebuchet MS',sans-serif": 'Trebuchet MS',
  'Impact,sans-serif': 'Impact', "'Comic Sans MS',cursive": 'Comic Sans MS',
};

// ── State ────────────────────────────────────────────────────────────────────
let sheets = [], sheetIdx = 0;
let selR = 0, selC = 0;      // anchor cell
let selR2 = 0, selC2 = 0;    // range end (=anchor if single cell)
let editMode = false;
let mouseDown = false;

function sheet() { return sheets[sheetIdx]; }

// ── Cell helpers ─────────────────────────────────────────────────────────────
function makeCell(v = '') {
  return { v, fs: null, ff: null, b: false, i: false, cs: 1, rs: 1, hd: false, pr: null, pc: null };
}

function getCell(r, c) {
  const s = sheet();
  if (!s.data[r]) s.data[r] = [];
  if (!s.data[r][c]) s.data[r][c] = makeCell();
  return s.data[r][c];
}

function cellVal(r, c) { return getCell(r, c).v ?? ''; }

// ── Column label ─────────────────────────────────────────────────────────────
function colLabel(c) {
  let s = ''; c++;
  while (c > 0) { s = String.fromCharCode(64 + (c % 26 || 26)) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
function cellId(r, c) { return colLabel(c) + (r + 1); }

// ── Range helpers ─────────────────────────────────────────────────────────────
function rangeBox() {
  return {
    r1: Math.min(selR, selR2), c1: Math.min(selC, selC2),
    r2: Math.max(selR, selR2), c2: Math.max(selC, selC2),
  };
}
function inRange(r, c) {
  const { r1, c1, r2, c2 } = rangeBox();
  return r >= r1 && r <= r2 && c >= c1 && c <= c2;
}
function rangeLabel() {
  const { r1, c1, r2, c2 } = rangeBox();
  if (r1 === r2 && c1 === c2) return cellId(r1, c1);
  return cellId(r1, c1) + ':' + cellId(r2, c2);
}

// ── Persistence ──────────────────────────────────────────────────────────────

let _dirty = false;       // true when there are unsaved-to-server changes
let _autoSaveTimer = null;

function setDirty(dirty) {
  _dirty = dirty;
  const el = document.getElementById('saveStatus');
  if (!el) return;
  if (dirty) {
    el.textContent = '● Unsaved';
    el.style.color = '#f59e0b';
  } else {
    el.textContent = '✓ Saved';
    el.style.color = '#4ade80';
    clearTimeout(_autoSaveTimer);
    _autoSaveTimer = setTimeout(() => { el.textContent = ''; }, 4000);
  }
}

/** Fast local save (called on every cell change). */
function save() {
  try {
    const payload = JSON.stringify({
      title: document.getElementById('sheetTitle').value,
      sheets, sheetIdx,
    });
    localStorage.setItem(STORAGE_KEY, payload);
    setDirty(true);
  } catch {}
}

/** Send full state to server → data/docsStudio.json */
async function saveToServer() {
  const btn = document.getElementById('btnSave');
  const st  = document.getElementById('saveStatus');
  btn.disabled = true;
  st.textContent = 'Saving…'; st.style.color = 'var(--muted)';
  try {
    const payload = JSON.stringify({
      title: document.getElementById('sheetTitle').value,
      sheets, sheetIdx,
    });
    localStorage.setItem(STORAGE_KEY, payload);
    const res = await fetch('/api/docs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    if (!res.ok) throw new Error(await res.text());
    const { savedAt } = await res.json();
    const t = new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setDirty(false);
    st.textContent = '✓ Saved at ' + t; st.style.color = '#4ade80';
  } catch (err) {
    st.textContent = '✗ ' + err.message; st.style.color = '#f87171';
  } finally {
    btn.disabled = false;
  }
}

/** Try to load from server; fall back to localStorage. Returns true if data was found. */
async function loadFromServer() {
  try {
    const res = await fetch('/api/docs/load');
    if (res.status === 204) return false;   // file doesn't exist yet
    if (!res.ok) return false;
    const d = await res.json();
    if (!d || !d.sheets || !d.sheets.length) return false;
    document.getElementById('sheetTitle').value = d.title || 'Untitled Sheet';
    sheets   = d.sheets   || [];
    sheetIdx = d.sheetIdx || 0;
    _migrateSheets();
    return true;
  } catch { return false; }
}

/** Migrate any old string-cell format to full cell objects in-place. */
function _migrateSheets() {
  sheets.forEach(s => {
    if (!s.data) s.data = [];
    for (let r = 0; r < s.rows; r++) {
      if (!s.data[r]) s.data[r] = [];
      for (let c = 0; c < s.cols; c++) {
        const cell = s.data[r][c];
        if (cell === undefined || cell === null) {
          s.data[r][c] = makeCell();
        } else if (typeof cell === 'string') {
          s.data[r][c] = makeCell(cell);
        }
      }
    }
  });
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    document.getElementById('sheetTitle').value = d.title || 'Untitled Sheet';
    sheets = d.sheets || [];
    sheetIdx = d.sheetIdx || 0;
    _migrateSheets();
    return sheets.length > 0;
  } catch { return false; }
}

// ── Sheet management ──────────────────────────────────────────────────────────
function makeSheet(name, rows = DEF_ROWS, cols = DEF_COLS) {
  const data = [];
  for (let r = 0; r < rows; r++) {
    data[r] = [];
    for (let c = 0; c < cols; c++) data[r][c] = makeCell();
  }
  return { name, rows, cols, data };
}

function addSheet() {
  sheets.push(makeSheet('Sheet' + (sheets.length + 1)));
  sheetIdx = sheets.length - 1;
  selR = 0; selC = 0; selR2 = 0; selC2 = 0;
  renderTabs(); renderGrid(); save();
}

function renameSheet(idx) {
  const n = prompt('Sheet name:', sheets[idx].name);
  if (n && n.trim()) { sheets[idx].name = n.trim(); renderTabs(); save(); }
}

function switchSheet(idx) {
  commitEdit();
  sheetIdx = idx; selR = 0; selC = 0; selR2 = 0; selC2 = 0;
  renderTabs(); renderGrid(); updateFormulaBar(); updateFmtBar();
}

function renderTabs() {
  const bar = document.getElementById('tabBar');
  const addBtn = bar.querySelector('.tab-add');
  bar.querySelectorAll('.tab').forEach(t => t.remove());
  sheets.forEach((s, i) => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (i === sheetIdx ? ' active' : '');
    tab.textContent = s.name;
    tab.onclick = () => switchSheet(i);
    tab.ondblclick = () => renameSheet(i);
    bar.insertBefore(tab, addBtn);
  });
}

// ── Grid rendering ────────────────────────────────────────────────────────────
function cellStyle(cell) {
  let s = '';
  if (cell.fs) s += 'font-size:' + cell.fs + 'px;';
  if (cell.ff) s += 'font-family:' + cell.ff + ';';
  if (cell.b)  s += 'font-weight:bold;';
  if (cell.i)  s += 'font-style:italic;';
  return s;
}

function renderGrid() {
  const s = sheet();
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  // Header row
  const thead = grid.createTHead();
  const hr = thead.insertRow();
  const corner = document.createElement('th');
  corner.className = 'th-corner'; hr.appendChild(corner);
  for (let c = 0; c < s.cols; c++) {
    const th = document.createElement('th');
    th.className = 'th-col' + (c >= Math.min(selC,selC2) && c <= Math.max(selC,selC2) ? ' sel' : '');
    th.textContent = colLabel(c); th.dataset.col = c;
    hr.appendChild(th);
  }

  // Body
  const tbody = grid.createTBody();
  for (let r = 0; r < s.rows; r++) {
    const tr = tbody.insertRow();
    const rh = document.createElement('th');
    rh.className = 'th-row' + (r >= Math.min(selR,selR2) && r <= Math.max(selR,selR2) ? ' sel' : '');
    rh.textContent = r + 1; tr.appendChild(rh);

    for (let c = 0; c < s.cols; c++) {
      const cell = getCell(r, c);
      if (cell.hd) continue; // covered by merge — skip

      const td = tr.insertCell();
      td.className = 'cell';
      td.dataset.r = r; td.dataset.c = c;

      if (cell.cs > 1) td.colSpan = cell.cs;
      if (cell.rs > 1) td.rowSpan = cell.rs;

      if (r === selR && c === selC) td.classList.add('selected');
      else if (inRange(r, c)) td.classList.add('in-range');

      const sp = document.createElement('span');
      sp.textContent = cell.v;
      sp.style.cssText = cellStyle(cell);
      td.appendChild(sp);

      td.addEventListener('mousedown', e => {
        if (editMode) commitEdit();
        mouseDown = true;
        if (e.shiftKey) {
          selR2 = r; selC2 = c;
          refreshHighlights();
        } else {
          selR = r; selC = c; selR2 = r; selC2 = c;
          refreshHighlights();
        }
        updateFormulaBar(); updateFmtBar(); updateStatus();
        e.preventDefault();
      });
      td.addEventListener('mouseenter', e => {
        if (mouseDown) {
          selR2 = r; selC2 = c;
          refreshHighlights(); updateFormulaBar(); updateStatus();
        }
      });
      td.addEventListener('dblclick', () => startEdit(r, c));
    }
  }

  document.addEventListener('mouseup', () => { mouseDown = false; }, { once: false });
  updateStatus();
}

function refreshHighlights() {
  const grid = document.getElementById('grid');
  // cells
  grid.querySelectorAll('td.cell').forEach(td => {
    const r = parseInt(td.dataset.r), c = parseInt(td.dataset.c);
    td.classList.toggle('selected', r === selR && c === selC);
    td.classList.toggle('in-range', inRange(r, c) && !(r === selR && c === selC));
  });
  // col/row headers
  grid.querySelectorAll('.th-col').forEach(th => {
    const c = parseInt(th.dataset.col);
    th.classList.toggle('sel', c >= Math.min(selC,selC2) && c <= Math.max(selC,selC2));
  });
  grid.querySelectorAll('tbody .th-row').forEach((th, r) => {
    th.classList.toggle('sel', r >= Math.min(selR,selR2) && r <= Math.max(selR,selR2));
  });
}

function rerenderCell(r, c) {
  const grid = document.getElementById('grid');
  const td = grid.querySelector('td[data-r="' + r + '"][data-c="' + c + '"]');
  if (!td || editMode && r === selR && c === selC) return;
  const cell = getCell(r, c);
  td.innerHTML = '';
  const sp = document.createElement('span');
  sp.textContent = cell.v;
  sp.style.cssText = cellStyle(cell);
  td.appendChild(sp);
  td.classList.toggle('selected', r === selR && c === selC);
  td.classList.toggle('in-range', inRange(r, c) && !(r === selR && c === selC));
}

// ── Formula bar & format bar ──────────────────────────────────────────────────
function updateFormulaBar() {
  document.getElementById('cellRef').textContent = rangeLabel();
  if (!editMode) document.getElementById('formulaInput').value = getCell(selR, selC).v ?? '';
}

function updateFmtBar() {
  const cell = getCell(selR, selC);
  const sel = document.getElementById('fmtFontFamily');
  sel.value = cell.ff ?? '';
  document.getElementById('fmtFontSize').value = cell.fs ?? 13;
  document.getElementById('btnBold').classList.toggle('on', !!cell.b);
  document.getElementById('btnItalic').classList.toggle('on', !!cell.i);
  // hint for merged cells
  const hint = document.getElementById('fmtHint');
  if (cell.cs > 1 || cell.rs > 1) {
    hint.textContent = 'Merged ' + cell.cs + '×' + cell.rs;
  } else if (cell.hd) {
    hint.textContent = 'Covered by merge at ' + cellId(cell.pr, cell.pc);
  } else {
    hint.textContent = '';
  }
}

function updateStatus() {
  document.getElementById('statusSel').textContent = rangeLabel();
  // Show sum/count if range is multi-cell and all values are numbers
  const { r1, c1, r2, c2 } = rangeBox();
  if (r1 === r2 && c1 === c2) { document.getElementById('statusSum').textContent = ''; return; }
  let sum = 0, count = 0, numCount = 0;
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    const v = cellVal(r, c);
    if (v !== '') { count++; const n = parseFloat(v); if (!isNaN(n)) { sum += n; numCount++; } }
  }
  if (numCount > 0) document.getElementById('statusSum').textContent =
    'Sum: ' + sum.toLocaleString() + '  Count: ' + count;
  else document.getElementById('statusSum').textContent = 'Count: ' + count;
}

// ── Formatting ────────────────────────────────────────────────────────────────
function applyFmt(key, value) {
  const { r1, c1, r2, c2 } = rangeBox();
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    const cell = getCell(r, c);
    if (!cell.hd) cell[key] = value;
  }
  renderGrid(); save();
}

function toggleFmt(key) {
  const cell = getCell(selR, selC);
  const newVal = !cell[key];
  applyFmt(key, newVal);
  updateFmtBar();
}

// ── Merge / Unmerge ───────────────────────────────────────────────────────────
function mergeCells() {
  const { r1, c1, r2, c2 } = rangeBox();
  if (r1 === r2 && c1 === c2) return;

  // Unmerge any existing merges inside the range first
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    const cell = getCell(r, c);
    if ((cell.cs > 1 || cell.rs > 1) && !cell.hd) _doUnmerge(r, c);
  }

  // Set parent
  const parent = getCell(r1, c1);
  parent.cs = c2 - c1 + 1;
  parent.rs = r2 - r1 + 1;
  parent.hd = false; parent.pr = null; parent.pc = null;

  // Hide all covered cells
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    if (r === r1 && c === c1) continue;
    const cell = getCell(r, c);
    cell.hd = true; cell.cs = 1; cell.rs = 1;
    cell.pr = r1; cell.pc = c1;
  }

  selR = r1; selC = c1; selR2 = r1; selC2 = c1;
  renderGrid(); save(); updateFmtBar();
}

function _doUnmerge(r, c) {
  const cell = getCell(r, c);
  if (cell.cs <= 1 && cell.rs <= 1) return;
  const rowEnd = r + cell.rs - 1;
  const colEnd = c + cell.cs - 1;
  const s = sheet();
  for (let rr = r; rr <= Math.min(rowEnd, s.rows - 1); rr++) {
    for (let cc = c; cc <= Math.min(colEnd, s.cols - 1); cc++) {
      if (rr === r && cc === c) continue;
      const covered = getCell(rr, cc);
      covered.hd = false; covered.cs = 1; covered.rs = 1;
      covered.pr = null; covered.pc = null;
    }
  }
  cell.cs = 1; cell.rs = 1;
}

function unmergeCells() {
  const cell = getCell(selR, selC);
  // If clicking a hidden cell, navigate to its parent
  if (cell.hd && cell.pr !== null) {
    selR = cell.pr; selC = cell.pc; selR2 = selR; selC2 = selC;
  }
  _doUnmerge(selR, selC);
  selR2 = selR; selC2 = selC;
  renderGrid(); save(); updateFmtBar();
}

// ── Selection & navigation ────────────────────────────────────────────────────
function selectCell(r, c, extendRange = false) {
  if (editMode) commitEdit();
  const s = sheet();
  r = Math.max(0, Math.min(r, s.rows - 1));
  c = Math.max(0, Math.min(c, s.cols - 1));
  if (extendRange) { selR2 = r; selC2 = c; }
  else { selR = r; selC = c; selR2 = r; selC2 = c; }
  refreshHighlights();
  updateFormulaBar(); updateFmtBar(); updateStatus();
  // scroll into view
  const td = document.querySelector('td[data-r="' + selR + '"][data-c="' + selC + '"]');
  if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function move(dr, dc, extend = false) {
  const s = sheet();
  const baseR = extend ? selR2 : selR;
  const baseC = extend ? selC2 : selC;
  let nr = baseR + dr, nc = baseC + dc;
  if (nr < 0) nr = 0; if (nc < 0) nc = 0;
  if (nr >= s.rows) { addRow(); nr = s.rows - 1; }
  if (nc >= s.cols) nc = s.cols - 1;
  selectCell(extend ? selR : nr, extend ? selC : nc, extend);
  if (extend) { selR2 = nr; selC2 = nc; refreshHighlights(); updateStatus(); }
}

// ── Editing ───────────────────────────────────────────────────────────────────
function startEdit(r, c) {
  if (editMode) commitEdit();
  // If cell is hidden, jump to its parent
  const cell = getCell(r, c);
  if (cell.hd) { selectCell(cell.pr, cell.pc); return; }
  selR = r; selC = c; selR2 = r; selC2 = c;
  editMode = true;
  const td = document.querySelector('td[data-r="' + r + '"][data-c="' + c + '"]');
  if (!td) return;
  td.innerHTML = '';
  const inp = document.createElement('input');
  inp.value = cell.v ?? '';
  inp.style.fontSize = (cell.fs ?? 13) + 'px';
  if (cell.ff) inp.style.fontFamily = cell.ff;
  if (cell.b) inp.style.fontWeight = 'bold';
  if (cell.i) inp.style.fontStyle = 'italic';
  inp.addEventListener('keydown', onCellInputKey);
  inp.addEventListener('input', () => { document.getElementById('formulaInput').value = inp.value; });
  td.appendChild(inp);
  inp.focus(); inp.select();
  updateFormulaBar();
}

function commitEdit() {
  if (!editMode) return;
  editMode = false;
  const td = document.querySelector('td[data-r="' + selR + '"][data-c="' + selC + '"]');
  if (td) {
    const inp = td.querySelector('input');
    if (inp) { getCell(selR, selC).v = inp.value; save(); }
  }
  rerenderCell(selR, selC);
  updateFormulaBar();
}

function cancelEdit() {
  if (!editMode) return;
  editMode = false;
  rerenderCell(selR, selC);
  updateFormulaBar();
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function onCellInputKey(e) {
  if (e.key === 'Enter')     { e.preventDefault(); commitEdit(); move(1, 0); }
  else if (e.key === 'Tab')  { e.preventDefault(); commitEdit(); move(0, e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape') { cancelEdit(); }
  else if (e.key === 'ArrowDown')  { e.preventDefault(); commitEdit(); move(1, 0); }
  else if (e.key === 'ArrowUp')    { e.preventDefault(); commitEdit(); move(-1, 0); }
  else if (e.key === 'ArrowRight') {
    if (e.target.selectionStart === e.target.value.length) { e.preventDefault(); commitEdit(); move(0, 1); }
  }
  else if (e.key === 'ArrowLeft') {
    if (e.target.selectionStart === 0) { e.preventDefault(); commitEdit(); move(0, -1); }
  }
}

document.addEventListener('keydown', e => {
  const tgt = e.target;
  if (tgt.id === 'formulaInput' || tgt.id === 'sheetTitle' ||
      tgt.id === 'fmtFontSize' || tgt.tagName === 'SELECT') return;
  if (editMode) return;

  const shift = e.shiftKey;
  if (e.key === 'ArrowDown')       { e.preventDefault(); move(1, 0, shift); }
  else if (e.key === 'ArrowUp')    { e.preventDefault(); move(-1, 0, shift); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); move(0, 1, shift); }
  else if (e.key === 'ArrowLeft')  { e.preventDefault(); move(0, -1, shift); }
  else if (e.key === 'Tab')        { e.preventDefault(); move(0, shift ? -1 : 1); }
  else if (e.key === 'Enter')      { e.preventDefault(); startEdit(selR, selC); }
  else if (e.key === 'F2')         { startEdit(selR, selC); }
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    const { r1, c1, r2, c2 } = rangeBox();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const cell = getCell(r, c);
      if (!cell.hd) cell.v = '';
    }
    renderGrid(); save();
  }
  else if (e.key === 'Escape') { selR2 = selR; selC2 = selC; refreshHighlights(); updateStatus(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { startEdit(selR, selC); }
});

// ── Formula bar events ────────────────────────────────────────────────────────
function onFormulaInput() {
  if (!editMode) {
    getCell(selR, selC).v = document.getElementById('formulaInput').value;
    rerenderCell(selR, selC); save();
  }
}
function onFormulaKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (editMode) commitEdit(); else { save(); }
    move(1, 0);
    document.getElementById('formulaInput').blur();
  } else if (e.key === 'Escape') { cancelEdit(); document.getElementById('formulaInput').blur(); }
}

// ── Row / Col management ──────────────────────────────────────────────────────
function addRow() {
  const s = sheet();
  s.rows++;
  s.data.push(Array.from({ length: s.cols }, () => makeCell()));
  renderGrid(); save();
}
function addCol() {
  const s = sheet();
  s.cols++;
  for (let r = 0; r < s.rows; r++) s.data[r].push(makeCell());
  renderGrid(); save();
}
function deleteRow() {
  const s = sheet();
  if (s.rows <= 1) return;
  // unmerge any parents in this row first
  for (let c = 0; c < s.cols; c++) {
    const cell = s.data[selR]?.[c];
    if (cell && (cell.cs > 1 || cell.rs > 1)) _doUnmerge(selR, c);
  }
  s.data.splice(selR, 1);
  s.rows--;
  if (selR >= s.rows) selR = s.rows - 1;
  selR2 = selR;
  renderGrid(); save();
}
function deleteCol() {
  const s = sheet();
  if (s.cols <= 1) return;
  for (let r = 0; r < s.rows; r++) {
    const cell = s.data[r]?.[selC];
    if (cell && (cell.cs > 1 || cell.rs > 1)) _doUnmerge(r, selC);
    s.data[r].splice(selC, 1);
  }
  s.cols--;
  if (selC >= s.cols) selC = s.cols - 1;
  selC2 = selC;
  renderGrid(); save();
}
function clearSheet() {
  if (!confirm('Clear all data in this sheet?')) return;
  const s = sheet();
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < s.cols; c++) s.data[r][c] = makeCell();
  renderGrid(); save();
}

// ── Import / Export ───────────────────────────────────────────────────────────
function exportCsv() {
  const s = sheet();
  const lines = [];
  for (let r = 0; r < s.rows; r++) {
    const row = [];
    for (let c = 0; c < s.cols; c++) {
      const v = (getCell(r, c).v ?? '').toString();
      row.push(v.includes(',') || v.includes('"') || v.includes('\\n')
        ? '"' + v.replace(/"/g, '""') + '"' : v);
    }
    lines.push(row.join(','));
  }
  dl(lines.join('\\n'), 'text/csv', (document.getElementById('sheetTitle').value || 'sheet') + '.csv');
}

function exportJson() {
  const s = sheet();
  if (s.rows === 0) return;
  const headers = Array.from({ length: s.cols }, (_, c) => getCell(0, c).v || colLabel(c));
  const rows = [];
  for (let r = 1; r < s.rows; r++) {
    const obj = {};
    headers.forEach((h, c) => { obj[h] = getCell(r, c).v ?? ''; });
    rows.push(obj);
  }
  dl(JSON.stringify(rows, null, 2), 'application/json',
    (document.getElementById('sheetTitle').value || 'sheet') + '.json');
}

function dl(content, type, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename; a.click();
}

function importCsv() { document.getElementById('csvInput').click(); }

function handleImport(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const text = ev.target.result;
    const rows = text.split('\\n').map(line => {
      const result = []; let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
        else cur += ch;
      }
      result.push(cur); return result;
    });
    const cols = Math.max(DEF_COLS, ...rows.map(r => r.length));
    const s = sheet();
    s.rows = rows.length; s.cols = cols;
    s.data = rows.map(row => {
      const out = row.map(v => makeCell(v));
      while (out.length < cols) out.push(makeCell());
      return out;
    });
    renderGrid(); save();
  };
  reader.readAsText(file); e.target.value = '';
}

// ── Fan Deficit Report Loader ─────────────────────────────────────────────────
async function loadFanDeficit() {
  const btn = document.getElementById('btnFanDeficit');
  btn.textContent = 'Loading…'; btn.disabled = true;

  try {
    const res = await fetch('/api/fan-deficit');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    // Month label e.g. "June 2026"
    const [yr, mo] = data.monthStart.split('-');
    const monthLabel = new Date(Date.UTC(+yr, +mo - 1, 1))
      .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    const sheetName = 'Fan Deficit ' + data.today.slice(0, 7);

    // Find or create sheet
    let tIdx = sheets.findIndex(s => s.name === sheetName);
    if (tIdx === -1) { sheets.push(makeSheet(sheetName, 1, 1)); tIdx = sheets.length - 1; }
    sheetIdx = tIdx;

    const COLS = ['#', 'Trainer', 'Circle', 'Monthly Gain', 'Quota',
                  'Deficit', '% to Quota', 'Daily Needed', 'Days Left', 'Status'];
    const nCols = COLS.length;
    const nRows = data.rows.length + 3; // title + headers + data rows

    // Rebuild data array
    const s = sheet();
    s.name = sheetName; s.cols = nCols; s.rows = nRows;
    s.data = Array.from({ length: nRows }, () =>
      Array.from({ length: nCols }, () => makeCell())
    );

    // Row 0 — merged title
    {
      const title = 'Fan Deficit Report — ' + monthLabel +
        '  |  Days left: ' + data.daysLeft +
        '  |  Quota: ' + data.quotaFmt +
        '  |  Generated: ' + data.today;
      const c = getCell(0, 0);
      c.v = title; c.b = true; c.fs = 13;
      c.cs = nCols; c.rs = 1;
      // hide covered cells in title row
      for (let cc = 1; cc < nCols; cc++) {
        const hc = getCell(0, cc);
        hc.hd = true; hc.pr = 0; hc.pc = 0; hc.cs = 1; hc.rs = 1;
      }
    }

    // Row 1 — column headers
    COLS.forEach((h, c) => {
      const cell = getCell(1, c);
      cell.v = h; cell.b = true; cell.fs = 12;
    });

    // Row 2+ — data
    data.rows.forEach((row, i) => {
      const r = i + 2;
      const vals = [
        String(row.rank),
        row.trainerName,
        row.circleName,
        row.monthlyGainFmt,
        row.quotaFmt,
        row.deficit <= 0 ? '+' + row.surplusFmt : row.deficitFmt,
        row.pctToQuota.toFixed(1) + '%',
        row.dailyNeededFmt,
        String(row.daysLeft),
        row.status,
      ];
      vals.forEach((v, c) => { getCell(r, c).v = v; });
    });

    selR = 0; selC = 0; selR2 = 0; selC2 = 0;
    renderTabs(); renderGrid(); updateFormulaBar(); updateFmtBar(); save();

  } catch (err) {
    alert('Fan Deficit load failed: ' + err.message);
  } finally {
    btn.textContent = '📊 Fan Deficit'; btn.disabled = false;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // 1. Try server file first (survives browser clears, shared across devices)
  let loaded = await loadFromServer();

  // 2. Fall back to localStorage
  if (!loaded) loaded = load();

  // 3. Start fresh if nothing found
  if (!loaded || sheets.length === 0) {
    sheets = [makeSheet('Sheet1')]; sheetIdx = 0;
  }

  renderTabs(); renderGrid();
  selectCell(0, 0);
  updateFormulaBar(); updateFmtBar();

  // Show source in status
  const st = document.getElementById('saveStatus');
  if (loaded) {
    st.textContent = loaded ? '✓ Loaded from server' : '';
    st.style.color = '#4ade80';
    setTimeout(() => { if (st.textContent.includes('Loaded')) st.textContent = ''; }, 3000);
  }

  document.getElementById('sheetTitle').addEventListener('input', () => save());

  // Auto-save to server every 5 minutes if there are unsaved changes
  setInterval(() => { if (_dirty) saveToServer(); }, 5 * 60 * 1000);
}

// Ctrl/Cmd+S → save to server
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveToServer();
  }
}, { capture: true });

init();
</script>
</body>
</html>`;
}
