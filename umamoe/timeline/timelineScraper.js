/**
 * Timeline scraper.
 *
 * For uma.moe/timeline (JavaScript-rendered Angular SPA):
 *   → Launches headless Chromium via Playwright (system binary found via `which`),
 *     navigates to the page, and extracts event cards from the rendered DOM.
 *
 * For any other URL:
 *   → Uses axios + cheerio (lightweight HTML scraping).
 */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import { log } from '../../core/log.js';
import { UMA_KEY_HEADERS } from '../umaClient.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAYWRIGHT_TIMEOUT = 35_000;
const AXIOS_TIMEOUT = 15_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

// Flags required for containerised/sandbox-less environments (Replit, Railway, Docker).
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--disable-extensions',
];

// Material Design icon names that appear as text nodes inside Angular icon elements.
// We skip these when extracting event titles from the DOM.
const MATERIAL_ICONS = new Set([
  'style',
  'person',
  'auto_stories',
  'emoji_events',
  'sports_motorsports',
  'payments',
  'campaign',
  'schedule',
  'search',
  'login',
  'leaderboard',
  'timeline',
  'dataset',
  'groups',
  'trending_up',
  'build',
  'expand_more',
]);

// ─── System Chromium path (resolved once at module load) ─────────────────────

let _chromiumPath;
try {
  const raw = execSync(
    'which chromium chromium-browser google-chrome google-chrome-stable 2>/dev/null | head -1',
    { encoding: 'utf8', timeout: 3000 }
  ).trim();
  _chromiumPath = raw || undefined;
} catch {
  _chromiumPath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || undefined;
}
if (_chromiumPath) log.debug(`[Timeline] System Chromium: ${_chromiumPath}`);

// ─── Browser singleton with idle-close ───────────────────────────────────────

let _browser = null;
let _idleTimer = null;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // close after 10 min of inactivity

function scheduleIdleClose() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(async () => {
    _idleTimer = null;
    if (_browser) {
      log.debug('[Timeline] Closing idle Chromium browser to free memory');
      try { await _browser.close(); } catch {}
      _browser = null;
    }
  }, IDLE_TIMEOUT_MS);
}

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  log.debug('[Timeline] Launching headless Chromium…');
  const execPath =
    process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || _chromiumPath;
  _browser = await chromium.launch({
    headless: true,
    args: CHROMIUM_ARGS,
    ...(execPath ? { executablePath: execPath } : {}),
  });
  _browser.on('disconnected', () => {
    _browser = null;
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
  });
  return _browser;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeId(title, startDate) {
  return crypto
    .createHash('sha1')
    .update(`${title}|${startDate ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Parse "Apr 5 – Apr 18, 2026" or "~Apr 23 – Apr 29, 2026" into ISO start/end.
 * Returns { startDate, endDate } strings or nulls.
 */
function parseUmaDateRange(dateText) {
  if (!dateText) return { startDate: null, endDate: null };

  // Strip leading tilde (approximate marker)
  const clean = dateText.replace(/^~/, '').trim();

  // Match: "Apr 5 – Apr 18, 2026" or "Apr 5 - Apr 18, 2026"
  const rangeMatch = clean.match(/([A-Za-z]+ \d{1,2})\s*[–-]\s*([A-Za-z]+ \d{1,2},?\s*\d{4})/);
  if (rangeMatch) {
    // Extract year from the end part
    const yearMatch = rangeMatch[2].match(/\d{4}/);
    const year = yearMatch ? yearMatch[0] : new Date().getFullYear();
    const startRaw = `${rangeMatch[1]}, ${year}`;
    const endRaw = rangeMatch[2].includes(',') ? rangeMatch[2] : `${rangeMatch[2]}, ${year}`;
    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);
    return {
      startDate: isNaN(startDate.getTime()) ? null : startDate.toISOString(),
      endDate: isNaN(endDate.getTime()) ? null : endDate.toISOString(),
      approximate: dateText.startsWith('~'),
    };
  }

  // Single date: "Apr 5, 2026"
  const singleMatch = clean.match(/[A-Za-z]+ \d{1,2},?\s*\d{4}/);
  if (singleMatch) {
    const d = new Date(singleMatch[0]);
    return { startDate: isNaN(d.getTime()) ? null : d.toISOString(), endDate: null };
  }

  return { startDate: null, endDate: null };
}

// ─── uma.moe DOM extractor ────────────────────────────────────────────────────

async function extractUmaMoeEvents(page) {
  return page.evaluate(
    materialIcons => {
      const results = [];
      const cards = [...document.querySelectorAll('.event-card')];

      for (const card of cards) {
        // Event type from class e.g. "event-type-story_event"
        const typeMatch = card.className.match(/event-type-([\w]+)/);
        const rawType = typeMatch ? typeMatch[1] : '';
        const type = rawType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        // Date range from .event-date element
        const dateEl = card.querySelector('.event-date');
        const dateText = dateEl?.innerText?.trim() ?? '';

        // Full text lines for title extraction
        const contentEl = card.querySelector('.event-content') ?? card;
        const lines = (contentEl?.innerText ?? '')
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);

        // Title: first line that isn't a Material icon name, ALL-CAPS type label,
        // a single lowercase word, or a date fragment
        let title = '';
        for (const line of lines) {
          if (!line || line === dateText) continue;
          if (/^[A-Z_ ]+$/.test(line) && line.length < 60) continue; // ALL-CAPS label
          if (/^[a-z_]+$/.test(line) && line.length < 40) continue; // icon name / lowercase word
          if (materialIcons.includes(line)) continue;
          if (/^\w{3} \d+/.test(line) && line.length < 30) continue; // date fragment
          title = line;
          break;
        }

        // Fallback: use type if no title found
        if (!title) title = type || 'Uma Musume Event';

        // Link
        const linkEl = card.querySelector('a[href]');
        const url = linkEl?.href ?? 'https://uma.moe/timeline';

        // Image
        const imgEl = card.querySelector('img[src]');
        const imageUrl = imgEl?.src ?? null;

        // Approximate flag
        const approximate = dateText.startsWith('~');

        results.push({ type, title, dateText, url, imageUrl, approximate });
      }

      return results;
    },
    [...MATERIAL_ICONS]
  );
}

// ─── Generic DOM extractor (fallback for non-uma.moe pages) ──────────────────

async function extractGenericEvents(page, sourceUrl) {
  return page.evaluate(srcUrl => {
    const results = [];
    const SELECTORS = [
      'article',
      '[class*="event-card"]',
      '[class*="event-item"]',
      '[class*="timeline-item"]',
      '.mat-card',
      '.mat-mdc-card',
    ];
    for (const sel of SELECTORS) {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) continue;
      for (const el of els) {
        const titleEl = el.querySelector('h1,h2,h3,h4,[class*="title"],[class*="name"]');
        const title = titleEl?.textContent?.trim() ?? '';
        const linkEl = el.querySelector('a[href]');
        const url = linkEl?.href ?? srcUrl;
        const dateEl = el.querySelector('time,[class*="date"]');
        const date = dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim() ?? '';
        const imgEl = el.querySelector('img[src]');
        if (!title) continue;
        results.push({
          title,
          url,
          dateText: date,
          imageUrl: imgEl?.src ?? null,
          type: '',
          approximate: false,
        });
      }
      if (results.length) break;
    }
    return results;
  }, sourceUrl);
}

// ─── Playwright scraper ───────────────────────────────────────────────────────

async function scrapeWithPlaywright(url) {
  const isUmaMoe = url.includes('uma.moe');
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'en-US' });
  const page = await context.newPage();
  if (Object.keys(UMA_KEY_HEADERS).length) await page.setExtraHTTPHeaders(UMA_KEY_HEADERS);

  try {
    log.debug(`[Timeline] Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: PLAYWRIGHT_TIMEOUT });
    await page.waitForTimeout(2000);

    const rawItems = isUmaMoe
      ? await extractUmaMoeEvents(page)
      : await extractGenericEvents(page, url);

    log.info(`[Timeline] Extracted ${rawItems.length} event(s) from DOM`);

    return rawItems.map(item => {
      const { startDate, endDate, approximate } = parseUmaDateRange(item.dateText);
      return {
        id: makeId(item.title, startDate ?? item.dateText),
        title: item.title,
        url: item.url,
        startDate,
        endDate,
        approximate: item.approximate ?? approximate,
        description: item.dateText ? `${item.dateText}` : '',
        imageUrl: item.imageUrl,
        type: item.type,
      };
    });
  } finally {
    await context.close().catch(() => {});
    scheduleIdleClose();
  }
}

// ─── Axios + cheerio scraper (non-SPA pages) ──────────────────────────────────

async function scrapeWithAxios(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/html, */*', ...UMA_KEY_HEADERS },
    timeout: AXIOS_TIMEOUT,
    maxRedirects: 5,
  });

  const ct = (res.headers['content-type'] ?? '').toLowerCase();
  if (ct.includes('application/json') || typeof res.data === 'object') {
    const rows = Array.isArray(res.data)
      ? res.data
      : (res.data.events ?? res.data.data ?? res.data.items ?? res.data.results ?? []);
    return rows.slice(0, 30).flatMap(item => {
      const title = item.title ?? item.name ?? '';
      if (!title) return [];
      return [
        {
          id: makeId(title, item.start_date ?? item.start_at ?? ''),
          title,
          url: item.url ?? item.link ?? url,
          startDate: item.start_date ?? item.start_at ?? null,
          endDate: item.end_date ?? item.end_at ?? null,
          approximate: false,
          description: item.description ?? '',
          imageUrl: item.image ?? item.banner ?? null,
          type: item.type ?? item.category ?? '',
        },
      ];
    });
  }

  const $ = cheerio.load(String(res.data));
  const items = [];
  $('article, .news-item, li[class*="news"]').each((_, el) => {
    const $el = $(el);
    const title = $el.find('h1,h2,h3,a,.title').first().text().trim();
    const href = $el.find('a').first().attr('href');
    if (!title || !href) return;
    const link = new URL(href, url).href;
    const date = $el.find('time,.date').first().text().trim();
    items.push({
      id: makeId(title, date),
      title,
      url: link,
      startDate: date || null,
      endDate: null,
      approximate: false,
      description: $el.find('p').first().text().trim().slice(0, 300),
      imageUrl: null,
      type: '',
    });
  });
  return items.slice(0, 20);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scrape timeline events from `url`.
 * Automatically chooses Playwright (for SPA / uma.moe) or axios+cheerio.
 */
export async function scrapeTimeline(url) {
  if (!url) throw new Error('No TIMELINE_URL configured');
  const isUmaMoe = url.includes('uma.moe');
  log.debug(`[Timeline] Scraping ${url} via ${isUmaMoe ? 'Playwright' : 'axios'}`);
  return isUmaMoe ? scrapeWithPlaywright(url) : scrapeWithAxios(url);
}

/** Gracefully close the shared Chromium instance (call on bot shutdown). */
export async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}
