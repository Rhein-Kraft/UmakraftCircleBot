/**
 * scripts/postQolTimeline.js
 *
 * One-shot script: fetches the Uma Musume QoL & Updates Timeline Google Sheet,
 * renders it as styled image cards (8 entries per card), and posts each card
 * to #uma-timeline with an embed.
 *
 * Usage:
 *   node scripts/postQolTimeline.js
 */

import 'dotenv/config';
import https from 'node:https';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  ChannelType,
} from 'discord.js';
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

// ── Google Sheet CSV ──────────────────────────────────────────────────────────

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1ClwQpAPpVJDnHWYAkbAsk7k9DfvkQ8CJJvjQy3jg4Wc/export?format=csv&gid=0';

const SHEET_LINK =
  'https://docs.google.com/spreadsheets/d/1ClwQpAPpVJDnHWYAkbAsk7k9DfvkQ8CJJvjQy3jg4Wc/edit?gid=0';

function fetchCsv(url) {
  return new Promise((resolve, reject) => {
    const get = u =>
      https.get(u, { headers: { 'User-Agent': 'UmaCircleBot/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      });
    get(url);
  });
}

function parseCsv(raw) {
  const lines = [[]];
  let cur = '',
    inQ = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      if (inQ && raw[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      lines[lines.length - 1].push(cur);
      cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && raw[i + 1] === '\n') i++;
      lines[lines.length - 1].push(cur);
      cur = '';
      lines.push([]);
    } else {
      cur += ch;
    }
  }
  if (!lines.length) lines.push([]);
  lines[lines.length - 1].push(cur);
  return lines;
}

function parseEntries(raw) {
  const rows = parseCsv(raw);
  const entries = [];
  let lastRelease = '';
  for (const r of rows.slice(4)) {
    const release = (r[1] ?? '').trim();
    const source = (r[2] ?? '').trim();
    const update = (r[3] ?? '').trim();
    const desc = (r[4] ?? '').trim();
    if (!update && !desc) continue;
    if (release) lastRelease = release;
    entries.push({
      release: release || lastRelease,
      source,
      update: update.replace(/\n/g, ' '),
      desc: desc.replace(/\n/g, ' '),
    });
  }
  return entries;
}

// ── Chromium ──────────────────────────────────────────────────────────────────

function resolveChromium() {
  try {
    return execSync('which chromium', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

let _browser = null;
async function getBrowser() {
  if (_browser) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    ...(resolveChromium() ? { executablePath: resolveChromium() } : {}),
  });
  return _browser;
}

async function renderHtml(html, width = 700) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width, height: 1800 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(150);
    const el = (await page.$('body > *:first-child')) ?? (await page.$('body'));
    return await el.screenshot({ type: 'png' });
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Card renderer ─────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRelease(rel) {
  if (!rel) return '';
  const lines = rel
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  return lines.join(' · ');
}

function getReleaseType(rel) {
  const r = (rel || '').toLowerCase();
  if (r.includes('anniversary')) return { accent: '#ffd700', badge: '🎉 Anniversary' };
  if (r.includes('scenario')) return { accent: '#4fc3f7', badge: '📖 Scenario' };
  if (r.includes('event')) return { accent: '#ce93d8', badge: '🎪 Event' };
  return { accent: '#90caf9', badge: '🔧 Update' };
}

async function renderCard(entries, pageNum, totalPages, postDate) {
  const accent = '#7c83f7';
  const accent2 = '#b39ddb';

  const rows = entries
    .map((e, i) => {
      const { accent: eAccent, badge } = getReleaseType(e.release);
      const relLine = formatRelease(e.release);
      const descTrunc = e.desc.length > 180 ? e.desc.slice(0, 180) + '…' : e.desc;
      const sourceBadge = e.source
        ? `<span class="src">${esc(e.source.split('\n')[0])}</span>`
        : '';
      return `
    <div class="entry" style="${i % 2 === 0 ? 'background:rgba(255,255,255,0.022)' : ''}">
      <div class="entry-top">
        <span class="badge" style="color:${eAccent};border-color:${eAccent}44;background:${eAccent}15">${badge}</span>
        ${sourceBadge}
        <span class="release-line">${esc(relLine)}</span>
      </div>
      <div class="entry-update" style="color:${eAccent}">${esc(e.update)}</div>
      <div class="entry-desc">${esc(descTrunc)}</div>
    </div>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background: #0d0d1f;
  font-family: system-ui, -apple-system, Arial, sans-serif;
  color: #fff;
  display: inline-block;
  width: 100%;
}
.card {
  background: linear-gradient(170deg, #161628 0%, #0d0d1f 100%);
  position: relative; overflow: hidden; width: 700px;
}
.card::after {
  content: 'UmaKraft';
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%,-50%) rotate(-20deg);
  font-size: 210px; font-weight: 900;
  color: rgba(255,255,255,0.05);
  white-space: nowrap; pointer-events: none; z-index: 50;
  letter-spacing: -4px; user-select: none;
}
.accent-bar { height: 3px; background: linear-gradient(90deg,${accent},${accent2}); }
.header { padding: 13px 20px 10px; border-bottom: 1px solid rgba(255,255,255,0.07); }
.header-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.htitle { font-size: 15px; font-weight: 700; }
.htitle .hl { color: ${accent}; }
.hdate { font-size: 10px; color: rgba(255,255,255,0.33); white-space: nowrap; margin-top: 3px; }
.hpage { font-size: 10px; color: rgba(255,255,255,0.3); margin-top: 4px; }
.entry { padding: 10px 20px; border-top: 1px solid rgba(255,255,255,0.04); }
.entry-top {
  display:flex; align-items:center; gap:7px; margin-bottom:4px; flex-wrap:wrap;
}
.badge {
  font-size: 9px; font-weight: 700; padding: 1px 7px;
  border-radius: 10px; border: 1px solid; white-space: nowrap;
}
.src {
  font-size: 9px; color: rgba(255,255,255,0.28);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 3px; padding: 1px 5px;
}
.release-line { font-size: 10px; color: rgba(255,255,255,0.36); flex: 1; }
.entry-update { font-size: 13px; font-weight: 700; margin-bottom: 3px; }
.entry-desc { font-size: 11px; line-height: 1.55; color: rgba(255,255,255,0.52); }
.footer {
  padding: 8px 20px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 9.5px; color: rgba(255,255,255,0.26);
  display: flex; justify-content: space-between; align-items: center;
}
</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="header-row">
      <div>
        <div class="htitle">🐴 Uma Musume — <span class="hl">QoL &amp; Updates Timeline</span></div>
        <div class="hpage">Page ${pageNum} of ${totalPages} · ${entries.length} entries</div>
      </div>
      <div class="hdate">${esc(postDate)}</div>
    </div>
  </div>
  ${rows}
  <div class="footer">
    <span>Source: Community QoL Timeline</span>
    <span>JP → Global schedule · UmaKraft</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 700);
}

// ── Discord ───────────────────────────────────────────────────────────────────

function findTimelineChannel(guild) {
  const patterns = ['uma-timeline', 'timeline', 'uma-updates', 'game-updates'];
  for (const name of patterns) {
    const ch = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.toLowerCase().includes(name)
    );
    if (ch) return ch;
  }
  return null;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error('Missing DISCORD_BOT_TOKEN');
    process.exit(1);
  }

  // Fetch and parse sheet
  console.log('Fetching Google Sheet…');
  const raw = await fetchCsv(SHEET_URL);
  const entries = parseEntries(raw);
  console.log(`Parsed ${entries.length} entries`);

  const pages = chunk(entries, 8);
  const totalPages = pages.length;
  const postDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Tokyo',
  });

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await new Promise((resolve, reject) => {
    client.once('ready', resolve);
    client.once('error', reject);
    client.login(token).catch(reject);
  });
  console.log(`Logged in as ${client.user.tag}`);

  const errors = [];

  for (const [, guild] of client.guilds.cache) {
    try {
      await guild.channels.fetch();
      const ch = findTimelineChannel(guild);

      if (!ch) {
        const msg = `No timeline channel found in ${guild.name}`;
        console.warn(msg);
        errors.push(msg);
        continue;
      }

      console.log(`Posting to #${ch.name} in ${guild.name} — ${totalPages} cards`);

      // Header embed (first message)
      const headerEmbed = new EmbedBuilder()
        .setColor(0x7c83f7)
        .setTitle('🐴 Uma Musume — QoL & Updates Timeline')
        .setDescription(
          `A community-sourced timeline of quality of life updates, scenario releases, and misc. changes — with JP release dates and estimated Global schedule.\n\n` +
            `**${entries.length} entries** across **${totalPages} cards** below.\n\n` +
            `📋 [Full Spreadsheet](${SHEET_LINK})`
        )
        .setColor(0x7c83f7)
        .setTimestamp()
        .setFooter({ text: 'UmaKraft Bot · Sourced from community QoL timeline' });

      await ch.send({ embeds: [headerEmbed] });

      // One image card per page
      for (let i = 0; i < pages.length; i++) {
        const pageNum = i + 1;
        console.log(`  Rendering page ${pageNum}/${totalPages}…`);

        let buf;
        try {
          buf = await renderCard(pages[i], pageNum, totalPages, postDate);
          console.log(`  Page ${pageNum}: ${Math.round(buf.length / 1024)} KB`);
        } catch (err) {
          const msg = `Render failed p${pageNum}: ${err.message}`;
          console.error(msg);
          errors.push(msg);
          continue;
        }

        const attachment = new AttachmentBuilder(buf, { name: `qol-timeline-p${pageNum}.png` });
        const embed = new EmbedBuilder()
          .setColor(0x7c83f7)
          .setImage(`attachment://qol-timeline-p${pageNum}.png`)
          .setFooter({ text: `Page ${pageNum} of ${totalPages}` });

        await ch.send({ embeds: [embed], files: [attachment] });

        // Brief pause between posts to avoid rate limits
        if (i < pages.length - 1) await new Promise(r => setTimeout(r, 1200));
      }

      console.log(`Done — posted ${totalPages} cards to #${ch.name}`);
    } catch (err) {
      console.error(`Guild ${guild.name}: ${err.message}`);
      errors.push(`${guild.name}: ${err.message}`);
    }
  }

  await _browser?.close().catch(() => {});
  await client.destroy();

  if (errors.length > 0) {
    console.error('\nErrors:');
    errors.forEach(e => console.error(' •', e));
    process.exit(1);
  } else {
    console.log('\nAll done.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
