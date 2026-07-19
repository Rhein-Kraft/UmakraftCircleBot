/**
 * Extracts inherited skill names from the uma.moe database page for a given trainer.
 *
 * Reuses the same Playwright session as screenshotter.js but focuses on
 * extracting text content from the rendered skill tags rather than taking
 * a screenshot. Results are keyed by spark colour so resumeCard.js can
 * display each skill individually.
 *
 * Returns null on any failure — callers should gracefully fall back to IDs.
 */

import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { log } from '../../core/log.js';
import { UMA_KEY_HEADERS } from '../umaClient.js';

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--single-process',
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
      _browser.contexts();
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

/** Attempt to close any modal/announcement popup on uma.moe */
async function dismissPopup(page) {
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch {}
  const closeSelectors = [
    'button[aria-label="Close"]',
    'button[aria-label="close"]',
    'mat-dialog-container button',
    '[class*="modal"] button',
    '[class*="dialog"] button',
    '[class*="Modal"] button',
    '[class*="Dialog"] button',
    'button[class*="close"]',
    '[class*="closeButton"]',
    '[class*="close-button"]',
  ];
  for (const sel of closeSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 800 })) {
        await el.click();
        await page.waitForTimeout(400);
        return;
      }
    } catch {}
  }
}

/**
 * Try to extract skill names from the rendered inheritance card DOM.
 *
 * Returns an object:
 *   { blue: string[], pink: string[], green: string[], white: string[] }
 * or null if extraction fails.
 */
async function extractSkillsFromPage(page) {
  try {
    return await page.evaluate(() => {
      function textOf(el) {
        return (el.textContent || el.innerText || '').trim();
      }

      // Strategy 1: look for color-keyed containers / class patterns
      const colorMap = {
        blue: ['blue', 'speed', 'Speed'],
        pink: ['pink', 'power', 'Power'],
        green: ['green', 'skill', 'Skill', 'technique'],
        white: ['white', 'inherit', 'Inherit', '白'],
      };

      const result = { blue: [], pink: [], green: [], white: [] };
      let found = false;

      for (const [color, keywords] of Object.entries(colorMap)) {
        // Try to find containers whose class name includes the color keyword
        for (const kw of keywords) {
          const containers = Array.from(document.querySelectorAll(`[class*="${kw}"]`)).filter(
            el => {
              const cls = el.className || '';
              return /skill|spark|factor|tag|inherit|chip|badge|pill/i.test(cls);
            }
          );
          for (const c of containers) {
            const t = textOf(c);
            if (t && t.length > 1 && t.length < 80 && !result[color].includes(t)) {
              result[color].push(t);
              found = true;
            }
          }
          if (result[color].length) break;
        }
      }

      // Strategy 2: fall back to any element whose class suggests a skill tag
      if (!found) {
        const tagEls = Array.from(
          document.querySelectorAll(
            '[class*="skillTag"],[class*="skill-tag"],[class*="SkillTag"],[class*="spark"],[class*="Spark"]'
          )
        );
        for (const el of tagEls) {
          const t = textOf(el);
          if (t && t.length > 1 && t.length < 80) {
            result.white.push(t);
          }
        }
      }

      return result;
    });
  } catch (err) {
    log.debug(`skillScraper.extractSkillsFromPage: ${err.message}`);
    return null;
  }
}

/**
 * Scrape skill names for a trainer from uma.moe's database page.
 *
 * @param {string} trainerId
 * @returns {Promise<{blue:string[],pink:string[],green:string[],white:string[]}|null>}
 */
export async function scrapeSkillNames(trainerId, { timeout = 25_000 } = {}) {
  const id = String(trainerId);
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    if (Object.keys(UMA_KEY_HEADERS).length) await page.setExtraHTTPHeaders(UMA_KEY_HEADERS);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route('**/*.{mp4,webm,ogg,mp3,wav,woff,woff2,ttf,otf}', r => r.abort());

    const url = `https://uma.moe/database?trainer_id=${id}&page=0&limit=1&search_type=inheritance&sort_by=affinity_score&sort_order=desc`;
    await page.goto(url, { waitUntil: 'networkidle', timeout });

    await dismissPopup(page);

    // Wait for the results card to appear
    await page.waitForTimeout(1500);

    const skills = await extractSkillsFromPage(page);
    log.debug(`skillScraper(${id}): white=${skills?.white?.length ?? 0}`);
    return skills;
  } catch (err) {
    log.warn(`skillScraper(${id}): ${err.message}`);
    return null;
  } finally {
    await page?.close().catch(() => {});
  }
}
