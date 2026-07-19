/**
 * scripts/scrapeCards.js
 * ──────────────────────
 * Syncs all support card data from gametora into data/cards/{type}.json.
 *
 * Key guarantees:
 *  • BUILD_ID is detected dynamically — never goes stale.
 *  • Existing cards are UPDATED by ID; new cards are ADDED.
 *    Running it twice is safe; nothing is wiped.
 *  • Files are written atomically (tmp → rename) so a crash mid-run
 *    cannot corrupt the existing data.
 *  • All bonus values are taken from the max-level (last non-(-1))
 *    column in gametora's effects array → 100% accuracy.
 *
 * Run standalone:  node scripts/scrapeCards.js
 * Or trigger via:  /admin-sync-cards  (Discord admin command)
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

const DATA_DIR = path.resolve('./data/cards');
const CONCURRENCY = 6;
const DELAY_MS = 200;
const MAX_RETRIES = 3;
const UA = 'Mozilla/5.0 (compatible; UmaCircleBot/2.0)';

// ── Effect ID → bonus field name ──────────────────────────────────────────────
const EFFECT_MAP = {
  1: 'friendship_bonus',
  2: 'mood_effect',
  3: 'speed_bonus',
  4: 'stamina_bonus',
  5: 'power_bonus',
  6: 'guts_bonus',
  7: 'wisdom_bonus',
  8: 'training_effectiveness',
  9: 'initial_speed',
  10: 'initial_stamina',
  11: 'initial_power',
  12: 'initial_guts',
  13: 'initial_wisdom',
  14: 'initial_friendship',
  15: 'race_bonus',
  16: 'fan_bonus',
  17: 'hint_level_bonus',
  18: 'hint_frequency',
  19: 'specialty_priority',
  20: 'event_recovery',
  21: 'event_effectiveness',
  22: 'failure_protection',
  23: 'energy_cost_reduction',
  24: 'skill_point_bonus',
  25: 'wisdom_friendship_recovery',
  26: 'initial_skill_points_up',
  27: 'hint_quantity_bonus',
  28: 'all_stats_bonus',
};

const TYPES = ['speed', 'stamina', 'power', 'guts', 'wisdom', 'friend'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Max level value = last non-(-1) entry after the effect ID. */
function extractMax(effectArr) {
  const values = effectArr.slice(1).filter(v => v !== -1);
  return values.length ? values[values.length - 1] : 0;
}

/** Build a clean bonuses object from the raw effects array. */
function parseBonuses(effects = []) {
  const bonuses = {};
  for (const eff of effects) {
    const key = EFFECT_MAP[eff[0]];
    if (key) bonuses[key] = extractMax(eff);
  }
  return bonuses;
}

/** Normalise gametora card type strings to our bucket keys. */
function normaliseType(raw = '') {
  const t = raw.toLowerCase().trim();
  if (t === 'wit' || t === 'wits' || t === 'intelligence') return 'wisdom';
  if (t === 'group') return 'friend';
  return t;
}

/** Atomic JSON write: write to .tmp then rename so a crash can't corrupt. */
function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** Load existing cards from data/cards into a Map<id, card>. */
function loadExisting() {
  const map = new Map();
  if (!fs.existsSync(DATA_DIR)) return map;
  for (const type of TYPES) {
    const file = path.join(DATA_DIR, `${type}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const cards = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const c of cards) map.set(c.id, c);
    } catch {
      /* ignore corrupt file; it will be rebuilt */
    }
  }
  return map;
}

// ── BUILD_ID detection ────────────────────────────────────────────────────────

/**
 * Fetch the gametora supports page and extract the Next.js BUILD_ID
 * from the embedded __NEXT_DATA__ JSON.  Falls back to Playwright if
 * the HTTP fetch is blocked.
 */
async function detectBuildId() {
  // Try plain HTTP first (fast)
  try {
    const res = await fetch('https://gametora.com/umamusume/supports', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
      if (m) {
        console.log(`[buildId] detected via HTTP: ${m[1]}`);
        return m[1];
      }
    }
  } catch {
    /* fall through to Playwright */
  }

  // Playwright fallback
  console.log('[buildId] HTTP failed, using Playwright…');
  const cp = execSync('which chromium 2>/dev/null || echo ""', {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
  if (!cp) throw new Error('chromium not found');
  const browser = await chromium.launch({
    headless: true,
    executablePath: cp,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.route('**/*.{mp4,webm,ogg,mp3,wav,woff,woff2,ttf,otf,css}', r => r.abort());
    await page.goto('https://gametora.com/umamusume/supports', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const buildId = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (el) {
        try {
          return JSON.parse(el.textContent).buildId;
        } catch {}
      }
      const m = document.documentElement.innerHTML.match(/"buildId"\s*:\s*"([^"]+)"/);
      return m?.[1] ?? null;
    });
    if (!buildId) throw new Error('buildId not found in page');
    console.log(`[buildId] detected via Playwright: ${buildId}`);
    return buildId;
  } finally {
    await browser.close().catch(() => {});
  }
}

// ── Slug list ─────────────────────────────────────────────────────────────────

async function getAllSlugs() {
  console.log('Fetching support card list from gametora…');
  const cp = execSync('which chromium 2>/dev/null || echo ""', {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
  if (!cp) throw new Error('chromium not found');

  const browser = await chromium.launch({
    headless: true,
    executablePath: cp,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });
  const page = await browser.newPage();
  await page.route('**/*.{mp4,webm,ogg,mp3,wav,woff,woff2,ttf,otf,css}', r => r.abort());
  await page.goto('https://gametora.com/umamusume/supports', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(4_000);

  // Scroll to load all lazy-rendered cards
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.scrollBy(0, 3000));
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1_000);

  const slugs = await page.evaluate(() => {
    const seen = new Set();
    return Array.from(document.querySelectorAll('a[href*="/umamusume/supports/"]')).flatMap(a => {
      const m = (a.getAttribute('href') || '').match(/\/supports\/(\d+-[a-z0-9-]+)$/);
      if (!m || seen.has(m[1])) return [];
      seen.add(m[1]);
      return [{ slug: m[1] }];
    });
  });

  await browser.close().catch(() => {});
  console.log(`Found ${slugs.length} support cards on gametora.`);
  return slugs;
}

// ── Per-card fetch ────────────────────────────────────────────────────────────

async function fetchCardData(slug, buildId, _attempt = 1) {
  const url = `https://gametora.com/_next/data/${buildId}/umamusume/supports/${slug}.json?id=${slug}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(12_000),
  });

  // If 404, the BUILD_ID might have rotated mid-run — signal the caller
  if (res.status === 404) throw Object.assign(new Error(`404 for ${slug}`), { is404: true });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${slug}`);

  const json = await res.json();
  return json?.pageProps?.itemData ?? null;
}

async function fetchWithRetry(slug, buildId) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchCardData(slug, buildId, attempt);
    } catch (err) {
      if (err.is404) throw err; // let caller handle stale buildId
      if (attempt === MAX_RETRIES) throw err;
      await sleep(500 * attempt);
    }
  }
}

// ── Build card object from raw gametora data ─────────────────────────────────

function buildCard(raw, slug) {
  const type = normaliseType(raw.type || '');
  return {
    id: raw.support_id,
    slug: raw.url_name || slug,
    name: raw.char_name || raw.support_name || slug,
    title_en: raw.title_en || raw.title_ja || '',
    char_name: raw.char_name || '',
    rarity: raw.rarity ?? 1,
    type: TYPES.includes(type) ? type : 'friend',
    obtained: raw.obtained || 'gacha',
    release: raw.release || '',
    imageUrl: `https://gametora.com/images/umamusume/supports/support_card_s_${raw.support_id}.png`,
    gametora_url: `https://gametora.com/umamusume/supports/${raw.url_name || slug}`,
    bonuses: parseBonuses(raw.effects || []),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function syncCards({ onProgress } = {}) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // Load what we already have (incremental update)
  const existing = loadExisting();
  console.log(`Loaded ${existing.size} existing cards from disk.`);

  // Detect current BUILD_ID dynamically
  let buildId = await detectBuildId();

  // Get the full slug list
  const slugEntries = await getAllSlugs();

  let added = 0;
  let updated = 0;
  let errors = 0;
  let done = 0;
  const total = slugEntries.length;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < slugEntries.length; i += CONCURRENCY) {
    const batch = slugEntries.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(({ slug }) => fetchWithRetry(slug, buildId))
    );

    for (let j = 0; j < batch.length; j++) {
      const { slug } = batch[j];
      const r = results[j];
      done++;

      if (r.status === 'rejected') {
        // Stale BUILD_ID? Re-detect and retry this one slug
        if (r.reason?.is404) {
          console.warn(`[!] 404 on ${slug} — re-detecting buildId…`);
          try {
            buildId = await detectBuildId();
            const raw = await fetchWithRetry(slug, buildId);
            if (raw) {
              const card = buildCard(raw, slug);
              const isNew = !existing.has(card.id);
              existing.set(card.id, card);
              isNew ? added++ : updated++;
            }
          } catch (e2) {
            console.warn(`  ✗ ${slug}: ${e2.message}`);
            errors++;
          }
        } else {
          console.warn(`  ✗ ${slug}: ${r.reason?.message}`);
          errors++;
        }
        continue;
      }

      const raw = r.value;
      if (!raw) {
        errors++;
        continue;
      }

      const card = buildCard(raw, slug);
      const isNew = !existing.has(card.id);
      existing.set(card.id, card);
      isNew ? added++ : updated++;
    }

    if (onProgress) onProgress({ done, total, added, updated, errors });
    if (i % 60 === 0 && i > 0) {
      console.log(
        `  Progress: ${done}/${total}  +${added} new  ~${updated} updated  ${errors} errors`
      );
    }
    await sleep(DELAY_MS);
  }

  // Organise by type, sort SSR→R then name asc
  const byType = Object.fromEntries(TYPES.map(t => [t, []]));
  for (const card of existing.values()) {
    const bucket = byType[card.type] ?? byType['friend'];
    bucket.push(card);
  }
  for (const t of TYPES) {
    byType[t].sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
  }

  // Atomic save — per-type files
  for (const t of TYPES) {
    atomicWrite(path.join(DATA_DIR, `${t}.json`), byType[t]);
  }

  // Atomic save — combined index (id, slug, name, type, rarity, imageUrl)
  const index = Object.values(byType)
    .flat()
    .map(c => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      type: c.type,
      rarity: c.rarity,
      imageUrl: c.imageUrl,
    }));
  index.sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
  atomicWrite(path.join(DATA_DIR, 'index.json'), index);

  // Meta
  const meta = {
    lastUpdated: new Date().toISOString(),
    totalCards: existing.size,
    added,
    updated,
    errors,
    buildId,
    counts: Object.fromEntries(TYPES.map(t => [t, byType[t].length])),
  };
  atomicWrite(path.join(DATA_DIR, 'meta.json'), meta);

  const summary = [
    `Done! ${existing.size} cards total.`,
    `+${added} new  ~${updated} updated  ${errors} errors`,
    `Counts: ${TYPES.map(t => `${t}:${byType[t].length}`).join('  ')}`,
  ].join('\n');

  console.log('\n' + summary);
  return { ...meta, summary };
}

// Run directly
if (process.argv[1].endsWith('scrapeCards.js')) {
  syncCards().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
