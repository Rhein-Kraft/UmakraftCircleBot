/**
 * slidesStudio.js
 * ───────────────
 * Full in-browser presentation editor served at GET /slides.
 * Saves to / loads from data/slides.json via /api/slides/save and /api/slides/load.
 */

export function buildSlidesStudioPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Slides Studio — UmaKraft</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f1117;--surface:#1a1d2e;--border:#2d3148;
  --text:#e2e8f0;--muted:#64748b;--accent:#5865f2;
}
body{
  background:var(--bg);color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  height:100vh;display:flex;flex-direction:column;overflow:hidden;
  font-size:13px;
}

/* ── Toolbar ── */
#toolbar{
  display:flex;align-items:center;gap:4px;padding:5px 10px;
  background:var(--surface);border-bottom:1px solid var(--border);
  flex-shrink:0;flex-wrap:wrap;min-height:46px;
}
.sep{width:1px;height:22px;background:var(--border);margin:0 3px;flex-shrink:0}
.tb{
  background:none;border:1px solid transparent;border-radius:6px;
  color:var(--text);padding:4px 9px;font-size:12px;cursor:pointer;
  display:flex;align-items:center;gap:4px;white-space:nowrap;
  font-family:inherit;
}
.tb:hover{background:#252840;border-color:var(--border)}
.tb.on{background:var(--accent);border-color:var(--accent);color:#fff}
.tb.red:hover{background:#7f1d1d;border-color:#991b1b}
.tbinput{
  background:var(--bg);border:1px solid var(--border);border-radius:6px;
  color:var(--text);padding:3px 7px;font-size:12px;font-family:inherit;
}
#fsize{width:50px;text-align:center}
.clabel{font-size:10px;color:var(--muted);margin-right:2px}
.cpick{
  width:26px;height:26px;border-radius:5px;border:1px solid var(--border);
  cursor:pointer;padding:0;background:none;
}
.back{color:var(--muted);text-decoration:none;padding:4px 8px;border-radius:6px}
.back:hover{background:var(--border);color:var(--text)}
#sstatus{font-size:11px;color:var(--muted);margin-left:4px;min-width:60px}

/* ── Layout ── */
#main{display:flex;flex:1;overflow:hidden}

/* ── Slide panel ── */
#spanel{
  width:176px;flex-shrink:0;background:var(--surface);
  border-right:1px solid var(--border);display:flex;flex-direction:column;
}
#sbtns{display:flex;gap:4px;padding:7px;border-bottom:1px solid var(--border)}
#slist{
  flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:7px;
}
#slist::-webkit-scrollbar{width:4px}
#slist::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}

.sthumb{
  width:160px;height:90px;border:2px solid var(--border);border-radius:6px;
  cursor:pointer;position:relative;overflow:hidden;flex-shrink:0;
  transition:border-color .15s;
}
.sthumb:hover{border-color:#4b5563}
.sthumb.active{border-color:var(--accent)}
.snum{
  position:absolute;bottom:3px;right:5px;font-size:9px;color:#475569;
  background:rgba(255,255,255,.65);padding:1px 4px;border-radius:3px;
}

/* ── Canvas area ── */
#cwrap{
  flex:1;display:flex;align-items:center;justify-content:center;
  background:#12151e;overflow:hidden;position:relative;
}
#canvas{
  width:960px;height:540px;background:#fff;
  position:relative;box-shadow:0 8px 48px rgba(0,0,0,.65);
  overflow:hidden;transform-origin:top left;flex-shrink:0;
}

.el{
  position:absolute;box-sizing:border-box;
}
.el.sel{outline:2px solid #5865f2;outline-offset:1px;z-index:10}

.textel{
  word-break:break-word;overflow:hidden;padding:4px;line-height:1.35;
  white-space:pre-wrap;cursor:default;
}
.textel[contenteditable="true"]{
  outline:2px dashed #5865f2 !important;cursor:text;overflow:visible;
  caret-color:#5865f2;
}

/* handles */
.hdl{
  position:absolute;width:9px;height:9px;background:#fff;
  border:2px solid #5865f2;border-radius:2px;z-index:20;
}
.hdl-nw{top:-5px;left:-5px;cursor:nw-resize}
.hdl-n {top:-5px;left:calc(50% - 4px);cursor:n-resize}
.hdl-ne{top:-5px;right:-5px;cursor:ne-resize}
.hdl-e {top:calc(50% - 4px);right:-5px;cursor:e-resize}
.hdl-se{bottom:-5px;right:-5px;cursor:se-resize}
.hdl-s {bottom:-5px;left:calc(50% - 4px);cursor:s-resize}
.hdl-sw{bottom:-5px;left:-5px;cursor:sw-resize}
.hdl-w {top:calc(50% - 4px);left:-5px;cursor:w-resize}

#drawprev{
  position:absolute;display:none;pointer-events:none;
  border:2px dashed #5865f2;z-index:50;
}

/* ── Props panel ── */
#ppanel{
  width:194px;flex-shrink:0;background:var(--surface);
  border-left:1px solid var(--border);overflow-y:auto;padding:10px;
}
#ppanel h3{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:10px}
.prow{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;gap:6px}
.plbl{font-size:11px;color:var(--muted);flex-shrink:0}
.pinput{
  background:var(--bg);border:1px solid var(--border);border-radius:4px;
  color:var(--text);padding:3px 5px;font-size:11px;width:78px;font-family:inherit;
}
.pcolor{width:30px;height:22px;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:0}
.nosel{color:var(--muted);font-size:11px;text-align:center;margin-top:16px}
.pdivider{height:1px;background:var(--border);margin:8px 0}
</style>
</head>
<body>

<!-- TOOLBAR -->
<div id="toolbar">
  <a href="/" class="back">← Back</a>
  <div class="sep"></div>
  <!-- Tools -->
  <button class="tb on" data-tool="select" onclick="setTool('select')" title="Select · V">↖ Select</button>
  <button class="tb" data-tool="text"   onclick="setTool('text')"   title="Text · T">T Text</button>
  <button class="tb" data-tool="rect"   onclick="setTool('rect')"   title="Rectangle · R">▭ Rect</button>
  <button class="tb" data-tool="circle" onclick="setTool('circle')" title="Circle · O">○ Circle</button>
  <div class="sep"></div>
  <!-- Font -->
  <select class="tbinput" id="ffam" onchange="applyFmt('fontFamily',this.value)">
    <option value="Arial">Arial</option>
    <option value="Georgia">Georgia</option>
    <option value="'Times New Roman'">Times New Roman</option>
    <option value="'Courier New'">Courier New</option>
    <option value="Verdana">Verdana</option>
    <option value="Impact">Impact</option>
    <option value="Trebuchet MS">Trebuchet MS</option>
  </select>
  <input class="tbinput" id="fsize" type="number" value="24" min="4" max="300"
         onchange="applyFmt('fontSize',+this.value)" title="Font size"/>
  <button class="tb" id="bbold"   onclick="togFmt('bold')"      title="Bold · Ctrl+B"><b>B</b></button>
  <button class="tb" id="bital"   onclick="togFmt('italic')"    title="Italic · Ctrl+I"><i>I</i></button>
  <button class="tb" id="bundl"   onclick="togFmt('underline')" title="Underline"><u>U</u></button>
  <button class="tb" id="balL"    onclick="applyFmt('textAlign','left')"   title="Align left">&#8676;L</button>
  <button class="tb" id="balC"    onclick="applyFmt('textAlign','center')" title="Align center">&#8596;C</button>
  <button class="tb" id="balR"    onclick="applyFmt('textAlign','right')"  title="Align right">R&#8677;</button>
  <div class="sep"></div>
  <!-- Colors -->
  <span class="clabel">Text</span>
  <input class="cpick" type="color" id="ctxt"  value="#000000" oninput="applyFmt('textColor',this.value)" title="Text color"/>
  <span class="clabel">Fill</span>
  <input class="cpick" type="color" id="cfill" value="#5865f2" oninput="applyFmt('fill',this.value)" title="Shape fill"/>
  <div class="sep"></div>
  <!-- Delete + BG -->
  <button class="tb red" onclick="delSel()" title="Delete · Del">🗑 Del</button>
  <div class="sep"></div>
  <span class="clabel">BG</span>
  <input class="cpick" type="color" id="cbg" value="#ffffff" oninput="setSlideBg(this.value)" title="Slide background"/>
  <div class="sep"></div>
  <!-- File ops -->
  <button class="tb on" onclick="save()" title="Save · Ctrl+S">💾 Save</button>
  <button class="tb" onclick="confirmNew()" title="New presentation">📄 New</button>
  <span id="sstatus"></span>
</div>

<!-- MAIN -->
<div id="main">
  <!-- Left: slides -->
  <div id="spanel">
    <div id="sbtns">
      <button class="tb" style="flex:1;justify-content:center" onclick="addSlide()">＋ Add</button>
      <button class="tb" onclick="dupSlide()" title="Duplicate">⊡</button>
      <button class="tb red" onclick="delSlide()" title="Delete slide">🗑</button>
    </div>
    <div id="slist"></div>
  </div>

  <!-- Center: canvas -->
  <div id="cwrap">
    <div id="canvas">
      <div id="drawprev"></div>
    </div>
  </div>

  <!-- Right: properties -->
  <div id="ppanel">
    <h3>Properties</h3>
    <div id="pcontent"><div class="nosel">No element selected</div></div>
  </div>
</div>

<script>
// ─── STATE ────────────────────────────────────────────────────────
const S = { slides:[], cur:0, sel:null, tool:'select', scale:1 };
let _n = 1;
const uid  = () => 'e' + (_n++);
const slid = () => 's' + (_n++);

// ─── BOOT ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await load();
  if (!S.slides.length) { S.slides.push(mkSlide()); }
  renderAll();
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('keydown', onKey);
  document.getElementById('cwrap').addEventListener('mousedown', onWrapDown);
});

// ─── FACTORY ──────────────────────────────────────────────────────
function mkSlide() { return { id:slid(), bg:'#ffffff', els:[] }; }

function mkEl(type, x, y, w, h) {
  const b = { id:uid(), type, x:Math.round(x), y:Math.round(y),
               w:Math.round(w||200), h:Math.round(h||80) };
  if (type === 'text') return Object.assign(b, {
    w:Math.round(w||300), h:Math.round(h||60),
    content:'Double-click to edit', fontSize:24, fontFamily:'Arial',
    bold:false, italic:false, underline:false,
    textColor:'#000000', textAlign:'left', fill:'transparent',
  });
  const fill = document.getElementById('cfill').value || '#5865f2';
  if (type === 'rect')   return Object.assign(b, { fill, stroke:'#3d4160', strokeWidth:2 });
  if (type === 'circle') return Object.assign(b, { w:Math.round(w||150), h:Math.round(h||150), fill, stroke:'#3d4160', strokeWidth:2 });
  return b;
}

// ─── SCALE / FIT ──────────────────────────────────────────────────
function fitCanvas() {
  const wrap   = document.getElementById('cwrap');
  const canvas = document.getElementById('canvas');
  const mw = wrap.clientWidth  - 48;
  const mh = wrap.clientHeight - 48;
  const sc = Math.min(mw/960, mh/540, 1.8);
  S.scale = sc;
  canvas.style.transform  = 'scale(' + sc + ')';
  canvas.style.marginLeft = ((mw - 960*sc)/2) + 'px';
  canvas.style.marginTop  = ((mh - 540*sc)/2) + 'px';
}

function cpos(e) {
  const r = document.getElementById('canvas').getBoundingClientRect();
  return { x:(e.clientX-r.left)/S.scale, y:(e.clientY-r.top)/S.scale };
}

// ─── RENDER ALL ───────────────────────────────────────────────────
function renderAll() { renderList(); renderCanvas(); renderProps(); }

// ─── SLIDE LIST ───────────────────────────────────────────────────
function renderList() {
  const list = document.getElementById('slist');
  list.innerHTML = '';
  S.slides.forEach(function(sl, i) {
    const thumb = document.createElement('div');
    thumb.className = 'sthumb' + (i===S.cur?' active':'');
    thumb.style.background = sl.bg;
    // mini elements
    sl.els.forEach(function(el) {
      const m = document.createElement('div');
      const sc = 160/960;
      m.style.cssText = 'position:absolute;left:'+el.x*sc+'px;top:'+el.y*sc+'px;width:'+el.w*sc+'px;height:'+el.h*sc+'px;overflow:hidden';
      if (el.type==='text') {
        m.style.fontSize   = Math.max(3,el.fontSize*sc)+'px';
        m.style.color      = el.textColor||'#000';
        m.style.fontWeight = el.bold?'bold':'normal';
        m.textContent      = el.content||'';
      } else if (el.type==='rect') {
        m.style.background = el.fill;
        if (el.stroke!=='none') m.style.border = (el.strokeWidth*sc)+'px solid '+el.stroke;
      } else if (el.type==='circle') {
        m.style.background   = el.fill;
        m.style.borderRadius = '50%';
      }
      thumb.appendChild(m);
    });
    const num = document.createElement('span');
    num.className = 'snum'; num.textContent = i+1;
    thumb.appendChild(num);
    thumb.addEventListener('click', function(){ S.cur=i; S.sel=null; renderAll(); });
    list.appendChild(thumb);
  });
}

// ─── CANVAS RENDER ────────────────────────────────────────────────
function renderCanvas() {
  const canvas = document.getElementById('canvas');
  const sl = S.slides[S.cur];
  if (!sl) return;
  canvas.style.background = sl.bg;
  document.getElementById('cbg').value = sl.bg;
  // clear old els
  Array.from(canvas.children).forEach(function(c){ if(c.id!=='drawprev') c.remove(); });
  sl.els.forEach(function(el){ canvas.appendChild(buildDom(el)); });
  if (S.sel) addHandles(S.sel);
}

function buildDom(el) {
  const d = document.createElement('div');
  d.id = 'el_'+el.id;
  d.className = 'el' + (el.id===S.sel?' sel':'');
  d.style.left   = el.x+'px';
  d.style.top    = el.y+'px';
  d.style.width  = el.w+'px';
  d.style.height = el.h+'px';

  if (el.type==='text') {
    d.classList.add('textel');
    d.style.fontSize        = el.fontSize+'px';
    d.style.fontFamily      = el.fontFamily;
    d.style.fontWeight      = el.bold?'bold':'normal';
    d.style.fontStyle       = el.italic?'italic':'normal';
    d.style.textDecoration  = el.underline?'underline':'none';
    d.style.color           = el.textColor;
    d.style.textAlign       = el.textAlign;
    d.style.background      = (el.fill==='transparent'||!el.fill)?'transparent':el.fill;
    d.textContent           = el.content||'';
    d.addEventListener('dblclick', function(e){ e.stopPropagation(); editText(el,d); });
  } else if (el.type==='rect') {
    d.style.background = el.fill;
    if (el.stroke && el.stroke!=='none') d.style.border = el.strokeWidth+'px solid '+el.stroke;
  } else if (el.type==='circle') {
    d.style.background   = el.fill;
    d.style.borderRadius = '50%';
    if (el.stroke && el.stroke!=='none') d.style.border = el.strokeWidth+'px solid '+el.stroke;
  }

  d.addEventListener('mousedown', function(e){
    if (S.tool==='select') { e.stopPropagation(); startMove(el.id,e); }
  });
  return d;
}

// ─── HANDLES ──────────────────────────────────────────────────────
function addHandles(elId) {
  const dom = document.getElementById('el_'+elId);
  if (!dom) return;
  ['nw','n','ne','e','se','s','sw','w'].forEach(function(h){
    const hd = document.createElement('div');
    hd.className = 'hdl hdl-'+h;
    hd.addEventListener('mousedown', function(e){ e.stopPropagation(); startResize(elId,h,e); });
    dom.appendChild(hd);
  });
}

// ─── DRAG / RESIZE ────────────────────────────────────────────────
var drag = null;
function startMove(id, e) {
  e.preventDefault();
  selEl(id);
  const el = getEl(id); if(!el) return;
  const p = cpos(e);
  drag = { mode:'move', id, sx:p.x, sy:p.y, ox:el.x, oy:el.y };
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', endDrag, {once:true});
}

function startResize(id, handle, e) {
  e.preventDefault();
  const el = getEl(id); if(!el) return;
  const p = cpos(e);
  drag = { mode:'resize', id, handle, sx:p.x, sy:p.y, ox:el.x, oy:el.y, ow:el.w, oh:el.h };
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', endDrag, {once:true});
}

function onDrag(e) {
  if (!drag) return;
  const p = cpos(e);
  const dx = p.x-drag.sx, dy = p.y-drag.sy;
  const el = getEl(drag.id); if(!el) return;
  if (drag.mode==='move') {
    el.x = Math.round(drag.ox+dx);
    el.y = Math.round(drag.oy+dy);
  } else {
    var x=drag.ox, y=drag.oy, w=drag.ow, h=drag.oh, h_=drag.handle;
    if (h_.includes('e')) { w=Math.max(10,drag.ow+dx); }
    if (h_.includes('s')) { h=Math.max(10,drag.oh+dy); }
    if (h_.includes('w')) { x=drag.ox+dx; w=Math.max(10,drag.ow-dx); }
    if (h_.includes('n')) { y=drag.oy+dy; h=Math.max(10,drag.oh-dy); }
    el.x=Math.round(x); el.y=Math.round(y); el.w=Math.round(w); el.h=Math.round(h);
  }
  const dom = document.getElementById('el_'+el.id);
  if (dom) {
    dom.style.left=el.x+'px'; dom.style.top=el.y+'px';
    dom.style.width=el.w+'px'; dom.style.height=el.h+'px';
  }
  renderProps();
}

function endDrag() {
  drag=null;
  document.removeEventListener('mousemove',onDrag);
  renderList(); renderProps();
}

// ─── CANVAS WRAP MOUSEDOWN (draw / deselect) ──────────────────────
var draw = null;
function onWrapDown(e) {
  // Only fire for clicks on the canvas itself (not child elements)
  const canvas = document.getElementById('canvas');
  if (!e.target.closest('#canvas')) return;
  if (S.tool==='select' && e.target===canvas) { S.sel=null; renderCanvas(); renderProps(); return; }
  if (S.tool==='text' && e.target===canvas) {
    const p = cpos(e);
    const el = mkEl('text', p.x-150, p.y-30);
    addEl(el); S.sel=el.id; renderAll();
    setTimeout(function(){ const d=document.getElementById('el_'+el.id); if(d) editText(el,d); }, 30);
    return;
  }
  if ((S.tool==='rect'||S.tool==='circle') && e.target===canvas) {
    e.preventDefault();
    const p = cpos(e);
    draw = { type:S.tool, sx:p.x, sy:p.y };
    const prev = document.getElementById('drawprev');
    prev.style.display='block'; prev.style.left=p.x+'px'; prev.style.top=p.y+'px';
    prev.style.width='0'; prev.style.height='0';
    prev.style.borderRadius = S.tool==='circle'?'50%':'0';
    document.addEventListener('mousemove', onDrawMove);
    document.addEventListener('mouseup', onDrawEnd, {once:true});
  }
}

function onDrawMove(e) {
  if (!draw) return;
  const p = cpos(e);
  const x=Math.min(draw.sx,p.x), y=Math.min(draw.sy,p.y);
  const w=Math.abs(p.x-draw.sx), h=Math.abs(p.y-draw.sy);
  const prev = document.getElementById('drawprev');
  prev.style.left=x+'px'; prev.style.top=y+'px';
  prev.style.width=w+'px'; prev.style.height=h+'px';
  draw.ex=p.x; draw.ey=p.y;
}

function onDrawEnd() {
  if (!draw) return;
  document.removeEventListener('mousemove',onDrawMove);
  document.getElementById('drawprev').style.display='none';
  if (draw.ex !== undefined) {
    const x=Math.min(draw.sx,draw.ex), y=Math.min(draw.sy,draw.ey);
    const w=Math.max(10,Math.abs(draw.ex-draw.sx)), h=Math.max(10,Math.abs(draw.ey-draw.sy));
    const el = mkEl(draw.type,x,y,w,h);
    addEl(el); S.sel=el.id; renderAll();
  }
  draw=null;
}

// ─── TEXT EDITING ─────────────────────────────────────────────────
function editText(el, dom) {
  if (dom.contentEditable==='true') return;
  dom.contentEditable='true'; dom.focus();
  const range=document.createRange(); range.selectNodeContents(dom);
  const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  function finish() {
    el.content=dom.textContent||'';
    dom.contentEditable='false';
    renderList(); renderProps();
    dom.removeEventListener('blur',finish);
  }
  dom.addEventListener('blur',finish);
  dom.addEventListener('keydown',function(e){ if(e.key==='Escape') dom.blur(); });
}

// ─── SELECT ───────────────────────────────────────────────────────
function selEl(id) { S.sel=id; renderCanvas(); updateToolbarFromEl(); renderProps(); }

function updateToolbarFromEl() {
  const el=getEl(S.sel); if(!el||el.type!=='text') return;
  document.getElementById('ffam').value   = el.fontFamily;
  document.getElementById('fsize').value  = el.fontSize;
  document.getElementById('ctxt').value   = el.textColor||'#000000';
  document.getElementById('bbold').classList.toggle('on', el.bold);
  document.getElementById('bital').classList.toggle('on', el.italic);
  document.getElementById('bundl').classList.toggle('on', el.underline);
}

// ─── FORMAT ───────────────────────────────────────────────────────
function applyFmt(prop, val) {
  const el=getEl(S.sel); if(!el) return;
  if (prop in el) { el[prop]=val; renderCanvas(); renderList(); renderProps(); }
}
function togFmt(prop) {
  const el=getEl(S.sel); if(!el) return;
  el[prop]=!el[prop];
  document.getElementById('b'+prop.slice(0,4)).classList.toggle('on',el[prop]);
  renderCanvas(); renderList();
}

// ─── TOOL ─────────────────────────────────────────────────────────
function setTool(t) {
  S.tool=t;
  document.querySelectorAll('[data-tool]').forEach(function(b){ b.classList.toggle('on',b.dataset.tool===t); });
  document.getElementById('canvas').style.cursor = t==='select'?'default':t==='text'?'text':'crosshair';
}

// ─── SLIDE OPS ────────────────────────────────────────────────────
function addSlide() { S.slides.splice(S.cur+1,0,mkSlide()); S.cur++; S.sel=null; renderAll(); }

function dupSlide() {
  const sl = JSON.parse(JSON.stringify(S.slides[S.cur]));
  sl.id=slid(); sl.els=sl.els.map(function(e){ return Object.assign({},e,{id:uid()}); });
  S.slides.splice(S.cur+1,0,sl); S.cur++; S.sel=null; renderAll();
}

function delSlide() {
  if (S.slides.length<=1) { alert('Cannot delete the only slide.'); return; }
  S.slides.splice(S.cur,1); S.cur=Math.max(0,S.cur-1); S.sel=null; renderAll();
}

function setSlideBg(c) {
  const sl=S.slides[S.cur]; if(!sl) return;
  sl.bg=c; document.getElementById('canvas').style.background=c; renderList();
}

// ─── ELEMENT OPS ─────────────────────────────────────────────────
function addEl(el) { S.slides[S.cur].els.push(el); }
function getEl(id) { if(!id)return null; return (S.slides[S.cur]?.els||[]).find(function(e){return e.id===id;})||null; }
function delSel() {
  if (!S.sel) return;
  const sl=S.slides[S.cur];
  sl.els=sl.els.filter(function(e){return e.id!==S.sel;});
  S.sel=null; renderAll();
}

function confirmNew() {
  if (!confirm('Start a new presentation? Unsaved changes will be lost.')) return;
  S.slides=[mkSlide()]; S.cur=0; S.sel=null; renderAll();
}

// ─── PROPS PANEL ─────────────────────────────────────────────────
function renderProps() {
  const el=getEl(S.sel);
  const p=document.getElementById('pcontent');
  if (!el) { p.innerHTML='<div class="nosel">No element selected</div>'; return; }
  var h = '<div class="prow"><span class="plbl">Type</span><span style="font-size:11px">'+el.type+'</span></div>'
    + '<div class="pdivider"></div>'
    + pnum('X','x',el.x) + pnum('Y','y',el.y) + pnum('W','w',el.w) + pnum('H','h',el.h)
    + '<div class="pdivider"></div>';
  if (el.type==='text') {
    h += pnum('Font size','fontSize',el.fontSize)
      + '<div class="prow"><span class="plbl">Color</span><input class="pcolor" type="color" value="'+(el.textColor||'#000000')+'" oninput="setProp(\'textColor\',this.value)"/></div>'
      + '<div class="prow"><span class="plbl">BG fill</span><input class="pcolor" type="color" value="'+(el.fill&&el.fill!=='transparent'?el.fill:'#ffffff')+'" oninput="setProp(\'fill\',this.value)"/></div>';
  } else {
    h += '<div class="prow"><span class="plbl">Fill</span><input class="pcolor" type="color" value="'+(el.fill||'#000000')+'" oninput="setProp(\'fill\',this.value)"/></div>'
      + '<div class="prow"><span class="plbl">Stroke</span><input class="pcolor" type="color" value="'+(el.stroke&&el.stroke!=='none'?el.stroke:'#000000')+'" oninput="setProp(\'stroke\',this.value)"/></div>'
      + pnum('Stroke W','strokeWidth',el.strokeWidth);
  }
  p.innerHTML=h;
}

function pnum(lbl,prop,val) {
  return '<div class="prow"><span class="plbl">'+lbl+'</span>'
    +'<input class="pinput" type="number" value="'+Math.round(val)+'" onchange="setProp(\''+prop+'\',+this.value)"/></div>';
}

function setProp(prop,val) {
  const el=getEl(S.sel); if(!el) return;
  el[prop]=val; renderCanvas(); renderList();
}

// ─── KEYBOARD ────────────────────────────────────────────────────
function onKey(e) {
  const tag=e.target.tagName; const ce=e.target.contentEditable;
  if (tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||ce==='true') return;
  if ((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save();return;}
  if ((e.ctrlKey||e.metaKey)&&e.key==='b'){e.preventDefault();togFmt('bold');return;}
  if ((e.ctrlKey||e.metaKey)&&e.key==='i'){e.preventDefault();togFmt('italic');return;}
  if ((e.ctrlKey||e.metaKey)&&e.key==='d'){e.preventDefault();dupSlide();return;}
  if (e.key==='Delete'||e.key==='Backspace'){delSel();return;}
  if (e.key==='Escape'){S.sel=null;renderCanvas();renderProps();return;}
  if (e.key==='v'||e.key==='V'){setTool('select');return;}
  if (e.key==='t'||e.key==='T'){setTool('text');return;}
  if (e.key==='r'||e.key==='R'){setTool('rect');return;}
  if (e.key==='o'||e.key==='O'){setTool('circle');return;}
  // Arrow nudge
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    const el=getEl(S.sel); if(!el) return;
    const d=e.shiftKey?10:1;
    if(e.key==='ArrowUp')   el.y-=d;
    if(e.key==='ArrowDown') el.y+=d;
    if(e.key==='ArrowLeft') el.x-=d;
    if(e.key==='ArrowRight')el.x+=d;
    renderCanvas(); renderProps(); e.preventDefault();
  }
}

// ─── SAVE / LOAD ──────────────────────────────────────────────────
async function save() {
  const st=document.getElementById('sstatus');
  st.textContent='Saving…';
  try {
    const res=await fetch('/api/slides/save',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({slides:S.slides}),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    st.textContent='✓ Saved';
    setTimeout(function(){st.textContent='';},3000);
  } catch(err) { st.textContent='✗ '+err.message; }
}

async function load() {
  try {
    const res=await fetch('/api/slides/load');
    if(res.status===204) return;
    if(!res.ok) return;
    const d=await res.json();
    if(d.slides&&d.slides.length) {
      S.slides=d.slides;
      S.cur=0;
      // Sync id counter
      S.slides.forEach(function(sl){
        (sl.els||[]).forEach(function(e){
          var n=parseInt(e.id.replace('e','').replace('s',''));
          if(!isNaN(n)&&n>=_n) _n=n+1;
        });
      });
    }
  } catch(err) { console.warn('slides load failed:',err); }
}
</script>
</body>
</html>`;
}
