/**
 * One-off DOM probe — discovers Team Stadium page structure for a given trainer.
 * Usage: node scripts/probeStadium.js
 */
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

const TRAINER_ID = '612856830731';

const BROWSER_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--single-process',
];

function resolveChromiumPath() {
  try { return execSync('which chromium', { stdio: ['ignore','pipe','ignore'] }).toString().trim(); }
  catch { return undefined; }
}

const URLS_TO_PROBE = [
  `https://uma.moe/trainer/${TRAINER_ID}`,
  `https://uma.moe/teams?trainer_id=${TRAINER_ID}`,
  `https://uma.moe/team-stadium?trainer_id=${TRAINER_ID}`,
];

async function probePage(browser, url) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  // Block heavy media
  await page.route('**/*.{mp4,webm,ogg,mp3,wav,woff,woff2,ttf,otf}', r => r.abort());

  console.log(`\n${'='.repeat(60)}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    console.log('HTTP status:', res?.status());

    // Dismiss any popup
    try { await page.keyboard.press('Escape'); await page.waitForTimeout(500); } catch {}

    // Wait a bit for JS-rendered content
    await page.waitForTimeout(2000);

    const info = await page.evaluate(() => {
      const results = {};

      // Page title
      results.title = document.title;

      // Current URL (after redirects)
      results.url = location.href;

      // Find all headings
      results.headings = Array.from(document.querySelectorAll('h1,h2,h3,h4'))
        .map(el => ({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 100) }))
        .filter(h => h.text.length > 0)
        .slice(0, 20);

      // Find any element with "stadium" or "team" in class or id
      results.stadiumElements = Array.from(document.querySelectorAll('[class*="stadium"],[id*="stadium"],[class*="team"],[id*="team"]'))
        .map(el => ({
          tag: el.tagName,
          cls: el.className?.toString().slice(0, 120),
          id: el.id,
          text: (el.textContent || '').trim().slice(0, 200),
        }))
        .slice(0, 30);

      // Find horse/character card elements
      results.horseCards = Array.from(document.querySelectorAll('[class*="horse"],[class*="uma"],[class*="chara"],[class*="character"],[class*="card"]'))
        .map(el => ({
          tag: el.tagName,
          cls: el.className?.toString().slice(0, 100),
          text: (el.textContent || '').trim().slice(0, 150),
        }))
        .filter(e => e.text.length > 5)
        .slice(0, 20);

      // All unique class names on the page that contain interesting keywords
      const allClasses = new Set();
      for (const el of document.querySelectorAll('*')) {
        if (el.className && typeof el.className === 'string') {
          el.className.split(/\s+/).forEach(c => {
            if (/stadium|team|horse|uma|chara|distance|sprint|mile|long|dirt|strat/i.test(c)) {
              allClasses.add(c);
            }
          });
        }
      }
      results.interestingClasses = Array.from(allClasses).slice(0, 50);

      // Network API calls intercepted in page (window.__requests if any)
      // Also check any JSON data exposed on window
      results.windowKeys = Object.keys(window)
        .filter(k => /stadium|team|horse|trainer|uma/i.test(k))
        .slice(0, 20);

      return results;
    });

    console.log('Title:', info.title);
    console.log('Final URL:', info.url);
    console.log('\nHeadings:', JSON.stringify(info.headings, null, 2));
    console.log('\nInteresting CSS classes:', info.interestingClasses.join(', '));
    console.log('\nWindow keys:', info.windowKeys.join(', '));
    console.log('\nStadium/team elements:', JSON.stringify(info.stadiumElements, null, 2).slice(0, 2000));
    console.log('\nHorse cards:', JSON.stringify(info.horseCards, null, 2).slice(0, 2000));

  } catch (err) {
    console.log('ERROR:', err.message);
  } finally {
    await page.close().catch(() => {});
  }
}

// Also intercept API calls made by the page
async function probeWithNetworkCapture(browser, url) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  const apiCalls = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/api/') && !u.includes('google') && !u.includes('analytics')) {
      apiCalls.push({ method: req.method(), url: u });
    }
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`NETWORK PROBE: ${url}`);
  console.log('='.repeat(60));

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);

    console.log('\nAPI calls captured:');
    for (const c of apiCalls) {
      console.log(` ${c.method} ${c.url}`);
    }
  } catch (err) {
    console.log('ERROR:', err.message);
    console.log('API calls so far:');
    for (const c of apiCalls) {
      console.log(` ${c.method} ${c.url}`);
    }
  } finally {
    await page.close().catch(() => {});
  }
}

const chromiumPath = resolveChromiumPath();
const browser = await chromium.launch({
  headless: true,
  args: BROWSER_ARGS,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
});

try {
  // First: capture all API calls on the trainer page
  await probeWithNetworkCapture(browser, `https://uma.moe/trainer/${TRAINER_ID}`);

  // Then: DOM inspection on each candidate URL
  for (const url of URLS_TO_PROBE) {
    await probePage(browser, url);
  }
} finally {
  await browser.close().catch(() => {});
}

console.log('\n✅ Probe complete.');
