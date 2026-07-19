/**
 * utils/imageReport-browser.js
 * ─────────────────────────────
 * PIPELINE 1 — IMAGE GENERATION (browser lifecycle)
 * Manages the headless Chromium instance used by imageReport.js.
 * This is a deterministic rendering engine, not an AI pipeline.
 * OpenAI: NOT used and NOT required here.
 * See:    utils/imageClassifier.js for Pipeline 2 (image analysis)
 * ─────────────────────────────────────────────────────────────────
 * Headless Chromium lifecycle management for HTML→PNG rendering.
 *
 * Improvements over the original embedded version:
 *   • Concurrent-launch guard — only one browser.launch() runs at a time
 *   • Disconnect listener resets state immediately so next render relaunches
 *   • renderHtml retries once on any error (covers transient page crashes)
 */

import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { log } from '../core/log.js';

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

const CHROMIUM_PATH = resolveChromiumPath();

let _browser = null;
let _launchPromise = null;

/**
 * Returns a live browser instance, launching one if needed.
 * A disconnected browser is detected and replaced transparently.
 */
export async function getBrowser() {
  if (_browser) {
    try {
      const ctx = await _browser.newContext();
      await ctx.close();
      return _browser;
    } catch {
      log.warn('[imageReport] browser ping failed — relaunching');
      _browser = null;
      _launchPromise = null;
    }
  }

  if (_launchPromise) return _launchPromise;

  _launchPromise = chromium
    .launch({
      headless: true,
      args: BROWSER_ARGS,
      ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
    })
    .then(b => {
      _browser = b;
      _launchPromise = null;
      b.on('disconnected', () => {
        log.warn('[imageReport] browser disconnected — will relaunch on next render');
        _browser = null;
        _launchPromise = null;
      });
      return b;
    })
    .catch(err => {
      _launchPromise = null;
      throw err;
    });

  return _launchPromise;
}

/**
 * Renders an HTML string to a PNG buffer.
 * Retries once automatically on failure (covers single-page crashes).
 *
 * @param {string} html
 * @param {number} [width=640]
 * @returns {Promise<Buffer>}
 */
export async function renderHtml(html, width = 640) {
  const MAX_ATTEMPTS = 2;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewportSize({ width, height: 1800 });
      await page.setContent(html, { waitUntil: 'networkidle' });
      await page.waitForTimeout(200);
      const el = (await page.$('body > *:first-child')) ?? (await page.$('body'));
      if (!el) throw new Error('render target missing');
      // Resize viewport to the card's actual rendered height so long profiles
      // (e.g. many months of Monthly History) are never cut off at 1800px.
      const box = await el.boundingBox();
      if (box && box.height > 1800) {
        await page.setViewportSize({ width, height: Math.ceil(box.height) + 50 });
        await page.waitForTimeout(100);
      }
      return await el.screenshot({ type: 'png' });
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        log.warn(`[imageReport] renderHtml attempt ${attempt} failed — retrying: ${err.message}`);
        const deadBrowser = _browser;
        _browser = null;
        _launchPromise = null;
        if (deadBrowser) deadBrowser.close().catch(() => {});
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  throw lastErr;
}
