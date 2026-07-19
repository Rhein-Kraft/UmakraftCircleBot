/**
 * scripts/postUpdate.js
 *
 * One-shot script: connects to Discord, finds the #update channel (or the
 * closest match), renders a styled bot-update image card, and posts it with
 * an EmbedBuilder.
 *
 * Usage:
 *   node scripts/postUpdate.js
 */

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  ChannelType,
} from 'discord.js';
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

// ── Chromium ─────────────────────────────────────────────────────────────────

function resolveChromium() {
  try {
    return execSync('which chromium', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

async function renderHtml(html, width = 660) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    ...(resolveChromium() ? { executablePath: resolveChromium() } : {}),
  });
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width, height: 1800 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(150);
    const el = (await page.$('body > *:first-child')) ?? (await page.$('body'));
    return await el.screenshot({ type: 'png' });
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// ── Card renderer ─────────────────────────────────────────────────────────────

const FIXES = [
  {
    icon: '🔍',
    title: 'Trainer Lookup — Two-Pass Search',
    detail:
      'fetchTrainerProfile now tries search_type=inheritance first, then falls back to a ' +
      'plain search. Trainers who exist on uma.moe but have not set up an inheritance build ' +
      'are now found correctly instead of returning "not found".',
  },
  {
    icon: '🛡️',
    title: 'Strict ID Equality Check',
    detail:
      'The API sometimes returned an unrelated top-ranked trainer when the requested ID ' +
      'had no matches. A strict account_id === searched_id guard now prevents wrong-trainer ' +
      'data from ever being stored.',
  },
  {
    icon: '🔇',
    title: '#uma-store Reply Now Ephemeral',
    detail:
      'The /store slash command response is now private (only visible to the user who ran it). ' +
      'Previous behaviour posted the reply publicly in the channel.',
  },
  {
    icon: '🧹',
    title: 'Startup Purge of #uma-store',
    detail:
      'Accumulated bot messages in #uma-store are bulk-deleted on every bot restart, keeping ' +
      'the channel clean.',
  },
  {
    icon: '🔧',
    title: 'Field Name Fix (white_sparks)',
    detail:
      'The message-paste handler referenced white_spark_ids (wrong) instead of white_sparks. ' +
      'Corrected — spark data is now stored and displayed correctly.',
  },
];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderUpdateCard() {
  const accent = '#7c83f7';
  const accent2 = '#b39ddb';
  const now = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Tokyo',
  });

  const rows = FIXES.map(
    (f, i) => `
    <div class="fix-row" style="${i % 2 === 0 ? 'background:rgba(255,255,255,0.022)' : ''}">
      <div class="fix-icon">${f.icon}</div>
      <div class="fix-body">
        <div class="fix-title">${esc(f.title)}</div>
        <div class="fix-detail">${esc(f.detail)}</div>
      </div>
    </div>`
  ).join('');

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
  position: relative;
  overflow: hidden;
  width: 660px;
}
.card::after {
  content: 'UmaKraft';
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%) rotate(-20deg);
  font-size: 220px; font-weight: 900;
  color: rgba(255,255,255,0.06);
  white-space: nowrap; pointer-events: none; z-index: 50;
  letter-spacing: -4px; user-select: none;
}
.accent-bar { height: 3px; background: linear-gradient(90deg,${accent},${accent2}); }
.header { padding: 16px 22px 12px; border-bottom: 1px solid rgba(255,255,255,0.07); }
.header-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.htitle { font-size: 17px; font-weight: 700; letter-spacing: -0.2px; }
.htitle .hl { color: ${accent}; }
.hsub { font-size: 11px; color: rgba(255,255,255,0.38); margin-top: 4px; }
.hdate { font-size: 11px; color: rgba(255,255,255,0.35); white-space: nowrap; margin-top: 3px; }
.fix-row {
  display: flex; gap: 14px; padding: 13px 22px;
  align-items: flex-start;
}
.fix-icon { font-size: 20px; flex-shrink: 0; margin-top: 1px; width: 26px; text-align: center; }
.fix-body  { flex: 1; min-width: 0; }
.fix-title { font-size: 13.5px; font-weight: 700; color: ${accent}; margin-bottom: 3px; }
.fix-detail { font-size: 11.5px; line-height: 1.6; color: rgba(255,255,255,0.55); }
.divider { height: 1px; background: rgba(255,255,255,0.06); margin: 2px 0; }
.footer {
  padding: 9px 22px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 10px; color: rgba(255,255,255,0.28);
  display: flex; justify-content: space-between; align-items: center;
}
</style></head>
<body><div class="card">
  <div class="accent-bar"></div>
  <div class="header">
    <div class="header-row">
      <div>
        <div class="htitle">🛠️ UmadolProject — <span class="hl">Bot Update</span></div>
        <div class="hsub">Trainer store fixes · ${FIXES.length} changes</div>
      </div>
      <div class="hdate">${esc(now)}</div>
    </div>
  </div>
  <div class="divider"></div>
  ${rows}
  <div class="footer">
    <span>UmaKraft Bot</span>
    <span>Deployed automatically · Replit</span>
  </div>
</div></body></html>`;

  return renderHtml(html, 660);
}

// ── Discord ───────────────────────────────────────────────────────────────────

function findUpdateChannel(guild) {
  const patterns = ['update', 'updates', 'bot-update', 'bot-updates', 'changelog', 'patch-notes'];
  for (const name of patterns) {
    const ch = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.toLowerCase().includes(name)
    );
    if (ch) return ch;
  }
  return null;
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error('Missing DISCORD_BOT_TOKEN');
    process.exit(1);
  }

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
      const ch = findUpdateChannel(guild);

      if (!ch) {
        const msg = `No #update channel found in ${guild.name} — tried: update, updates, bot-update, changelog, patch-notes`;
        console.warn(msg);
        errors.push(msg);
        continue;
      }

      console.log(`Found channel #${ch.name} in ${guild.name}`);

      // Render image card
      let buffer;
      try {
        buffer = await renderUpdateCard();
        console.log(`Rendered update card (${Math.round(buffer.length / 1024)} KB)`);
      } catch (err) {
        const msg = `Failed to render image card: ${err.message}`;
        console.error(msg);
        errors.push(msg);
      }

      const attachment = buffer ? new AttachmentBuilder(buffer, { name: 'bot-update.png' }) : null;

      const embed = new EmbedBuilder()
        .setColor(0x7c83f7)
        .setTitle('🛠️ Bot Update — Trainer Store Fixes')
        .setDescription(FIXES.map(f => `**${f.icon} ${f.title}**\n${f.detail}`).join('\n\n'))
        .setTimestamp()
        .setFooter({ text: 'UmaKraft Bot · UmadolProject' });

      if (attachment) embed.setImage('attachment://bot-update.png');

      if (errors.length > 0) {
        embed.addFields({
          name: '⚠️ Errors during post',
          value: errors.map(e => `• ${e}`).join('\n'),
        });
      }

      await ch.send({
        embeds: [embed],
        ...(attachment ? { files: [attachment] } : {}),
      });

      console.log(`Posted update to #${ch.name} in ${guild.name}`);
    } catch (err) {
      console.error(`Error in guild ${guild.name}: ${err.message}`);
      errors.push(`${guild.name}: ${err.message}`);
    }
  }

  await client.destroy();

  if (errors.length > 0) {
    console.error('\nErrors encountered:');
    errors.forEach(e => console.error(' •', e));
    process.exit(1);
  } else {
    console.log('\nDone.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
