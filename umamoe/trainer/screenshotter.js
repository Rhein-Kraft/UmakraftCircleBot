/**
 * Playwright-based screenshot utility for uma.moe trainer profiles.
 *
 * Captures the full trainer result card including the inheritance tree and
 * complete skills list — not just a fixed-height viewport crop.
 *
 * Screenshots are cached to data/screenshots/{trainerId}.png so leaderboard
 * rebuilds don't re-scrape every trainer. Cache lifetime: 6 hours.
 *
 * Overlay strategy: after page load, ALL known overlay/dialog elements are
 * force-removed from the DOM via JS before the screenshot is taken. Up to
 * MAX_RETRIES attempts are made if the result is too small.
 */

import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../core/config.js';
import { log } from '../../core/log.js';
import { UMA_KEY_HEADERS } from '../umaClient.js';

const CACHE_DIR = path.join(config.dataDir, 'screenshots');
const CACHE_MAX_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_RETRIES = 3;

// ── Concurrency limiter (max 3 Playwright pages at once) ──────────────────────
let _activeConcurrent = 0;
const MAX_CONCURRENT = 3;
const _concurrentQueue = [];

function acquireConcurrentSlot() {
  return new Promise(resolve => {
    if (_activeConcurrent < MAX_CONCURRENT) {
      _activeConcurrent++;
      resolve();
    } else {
      _concurrentQueue.push(resolve);
    }
  });
}

function releaseConcurrentSlot() {
  if (_concurrentQueue.length > 0) {
    _concurrentQueue.shift()();
  } else {
    _activeConcurrent--;
  }
}

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

function resolveChromiumPath() {
  try {
    return execSync('which chromium', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

const SYSTEM_CHROMIUM = resolveChromiumPath();

let _browser = null;

async function getBrowser() {
  if (_browser) {
    try {
      const ctx = await _browser.newContext();
      await ctx.close();
      return _browser;
    } catch {
      _browser = null;
    }
  }
  _browser = await chromium.launch({
    headless: true,
    args: BROWSER_ARGS,
    ...(SYSTEM_CHROMIUM ? { executablePath: SYSTEM_CHROMIUM } : {}),
  });
  return _browser;
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function cachePath(trainerId) {
  return path.join(CACHE_DIR, `${trainerId}.png`);
}

async function readCached(trainerId) {
  const p = cachePath(trainerId);
  try {
    const stat = await fs.stat(p);
    if (Date.now() - stat.mtimeMs < CACHE_MAX_MS) {
      return await fs.readFile(p);
    }
  } catch {
    /* not cached */
  }
  return null;
}

async function writeCache(trainerId, buffer) {
  await ensureCacheDir();
  await fs.writeFile(cachePath(trainerId), buffer);
}

/**
 * Pre-accept cookies via localStorage injection so the consent banner
 * hopefully never mounts. Called via addInitScript so it runs before any
 * page JS executes.
 */
async function preAcceptCookies(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cookie_consent', 'true');
      localStorage.setItem('cookieConsent', 'true');
      localStorage.setItem('cookies_accepted', 'true');
      localStorage.setItem('uma-cookie-consent', 'true');
      localStorage.setItem('consent', 'true');
      localStorage.setItem(
        'CookieConsent',
        JSON.stringify({
          stamp: '',
          necessary: true,
          preferences: true,
          statistics: true,
          marketing: true,
          ver: 1,
        })
      );
    } catch {}
  });
}

/**
 * Aggressively remove every overlay, dialog, and cookie banner from the DOM.
 */
async function nukeOverlays(page) {
  const labels = [
    'Accept All', 'Accept all', 'Accept', 'Reject All', 'Reject all',
    'OK', 'Agree', 'Close', 'Got it', 'Customize',
  ];
  for (const label of labels) {
    try {
      const btn = page.getByRole('button', { name: label, exact: true });
      if (await btn.isVisible({ timeout: 300 })) {
        await btn.click();
        await page.waitForTimeout(400);
        break;
      }
    } catch {}
  }

  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  } catch {}

  const selectorBtns = [
    'button[aria-label="Close"]',
    'button[aria-label="close"]',
    'mat-dialog-actions button',
    '[class*="cookie"] button',
    '[class*="consent"] button',
    '[class*="banner"] button',
    'mat-dialog-container button',
    '.cdk-overlay-container button',
  ];
  for (const sel of selectorBtns) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 200 })) {
        await el.click();
        await page.waitForTimeout(250);
      }
    } catch {}
  }

  await page
    .evaluate(() => {
      const targets = [
        'mat-dialog-container', '.cdk-overlay-pane', '.cdk-overlay-backdrop',
        '.cdk-overlay-container', '[class*="cookie"]', '[class*="consent"]',
        '[class*="CookieConsent"]', '[class*="cookie-banner"]', '[class*="cookie-law"]',
        '[class*="modal"]', '[class*="dialog"]', '[class*="overlay"]',
        '[class*="popup"]', '[class*="banner"]', '[id*="cookie"]',
        '[id*="consent"]', '[id*="modal"]',
      ];
      for (const sel of targets) {
        document.querySelectorAll(sel).forEach(el => { try { el.remove(); } catch {} });
      }
      try {
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
      } catch {}
    })
    .catch(() => {});
}

/**
 * Find the first result card element on the page using multiple strategies.
 */
async function findCardElement(page) {
  try {
    const handle = await page.evaluateHandle(() => {
      const cards = Array.from(document.querySelectorAll('mat-card'));
      const sorted = cards
        .map(c => ({ c, r: c.getBoundingClientRect() }))
        .filter(({ r }) => r.height > 150 && r.top > 50 && r.width > 300)
        .sort((a, b) => a.r.top - b.r.top);
      return sorted.length ? sorted[0].c : null;
    });
    if (handle && (await handle.jsonValue()) !== null) return handle;
  } catch {}

  try {
    const handle = await page.evaluateHandle(() => {
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        const bg = cs.backgroundColor;
        if (
          r.width > 500 && r.height > 150 && r.top > 50 &&
          bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
        ) {
          return el;
        }
      }
      return null;
    });
    if (handle && (await handle.jsonValue()) !== null) return handle;
  } catch {}

  return null;
}

/**
 * Take a screenshot of the uma.moe database card for the given trainer.
 */
export async function screenshotTrainer(
  trainerId,
  { forceRefresh = false, timeout = 35_000 } = {}
) {
  const id = String(trainerId);

  if (!forceRefresh) {
    const cached = await readCached(id);
    if (cached) return cached;
  }

  await acquireConcurrentSlot();
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    if (Object.keys(UMA_KEY_HEADERS).length) await page.setExtraHTTPHeaders(UMA_KEY_HEADERS);

    await page.setViewportSize({ width: 1280, height: 960 });
    await preAcceptCookies(page);
    await page.route('**/*.{mp4,webm,ogg,mp3,wav,woff,woff2,ttf,otf}', r => r.abort());

    const url =
      `https://uma.moe/database?trainer_id=${id}` +
      `&page=0&limit=1&search_type=inheritance&sort_by=affinity_score&sort_order=desc`;

    await page.goto(url, { waitUntil: 'networkidle', timeout });

    await page
      .waitForFunction(() => /\d+\s+records?\s+found/i.test(document.body.innerText), {
        timeout: 15_000,
      })
      .catch(() => {});

    await page.waitForTimeout(800);

    let buffer = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      await nukeOverlays(page);
      await page.waitForTimeout(300);

      const cardEl = await findCardElement(page);
      if (cardEl) {
        try {
          await cardEl.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          const elBuf = await cardEl.screenshot({ type: 'png' });
          if (elBuf && elBuf.length > 10_000) {
            buffer = elBuf;
            log.info(
              `screenshotter: element capture ${id} attempt ${attempt} (${Math.round(elBuf.length / 1024)} KB)`
            );
            break;
          }
        } catch (err) {
          log.warn(
            `screenshotter: element screenshot failed attempt ${attempt} for ${id}: ${err.message}`
          );
        }
      }

      log.info(`screenshotter: full-page fallback for ${id} attempt ${attempt}`);
      const totalHeight = await page.evaluate(() => document.body.scrollHeight);
      const clipHeight = Math.max(600, Math.min(totalHeight, 2400) - 290);
      const fallbackBuf = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 290, width: 1280, height: clipHeight },
      });

      if (fallbackBuf && fallbackBuf.length > 5_000) {
        buffer = fallbackBuf;
        log.info(
          `screenshotter: fallback capture ${id} attempt ${attempt} (${Math.round(fallbackBuf.length / 1024)} KB)`
        );
        break;
      }

      log.warn(`screenshotter: attempt ${attempt} produced empty buffer for ${id}, retrying`);
      await page.waitForTimeout(500);
    }

    if (buffer && buffer.length > 5_000) {
      await writeCache(id, buffer);
      log.info(`screenshotter: saved ${id} (${Math.round(buffer.length / 1024)} KB)`);
    }

    return buffer?.length > 5_000 ? buffer : null;
  } catch (err) {
    log.warn(`screenshotter(${id}): ${err.message}`);
    return null;
  } finally {
    await page?.close().catch(() => {});
    releaseConcurrentSlot();
  }
}

/** Delete a cached screenshot so the next call re-scrapes. */
export async function invalidateCache(trainerId) {
  try {
    await fs.unlink(cachePath(String(trainerId)));
  } catch {
    /* not cached */
  }
}
