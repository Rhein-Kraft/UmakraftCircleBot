/**
 * 24-hour task: refresh character data from gametora.com.
 *
 * For each character in the current local JSON, fetches their gametora page
 * and updates the en_name / jp_name. New characters discovered from gametora
 * are added to the map automatically.
 *
 * Runs on bot startup (after a short delay) and every 24 hours.
 */

import { log } from '../core/log.js';
import { getAllCharacters, saveCharacterData } from '../utils/characterData.js';

const GAMETORA_BASE = 'https://gametora.com';
const UA = 'Mozilla/5.0 (compatible; UmaCircleBot/1.0)';

let _buildId = null;

async function getGametoraId() {
  if (_buildId) return _buildId;
  try {
    const html = await fetch(`${GAMETORA_BASE}/umamusume/characters/tokai-teio`, {
      headers: { 'User-Agent': UA },
    }).then(r => r.text());
    const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
    _buildId = m?.[1] ?? null;
  } catch {
    _buildId = null;
  }
  return _buildId;
}

async function fetchCharacterPage(buildId, slug) {
  const url = `${GAMETORA_BASE}/_next/data/${buildId}/umamusume/characters/${slug}.json`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.pageProps ?? null;
}

export async function updateGameData() {
  log.info('updateGameData: starting character refresh');

  const buildId = await getGametoraId();
  if (!buildId) {
    log.warn('updateGameData: could not get gametora buildId — skipping');
    return;
  }

  const current = getAllCharacters();
  const updated = { ...current };
  let changed = 0;

  const slugs = [
    ...new Set(
      Object.values(current)
        .map(c => c.slug)
        .filter(Boolean)
    ),
  ];

  for (const slug of slugs) {
    try {
      // Small delay to avoid hammering gametora
      await new Promise(r => setTimeout(r, 300));
      const page = await fetchCharacterPage(buildId, slug);
      if (!page) continue;

      const cd = page.charData;
      if (!cd?.char_id) continue;

      const id = String(cd.char_id);
      const rec = updated[id] ?? { slug };

      const enName = cd.en_name?.trim() || rec.en_name;
      const jpName = cd.jp_name?.trim() || rec.jp_name;

      if (rec.en_name !== enName || rec.jp_name !== jpName) {
        updated[id] = { ...rec, en_name: enName, jp_name: jpName, slug };
        changed++;
      }
    } catch (err) {
      log.debug(`updateGameData: skip ${slug}: ${err.message}`);
    }
  }

  if (changed > 0) {
    await saveCharacterData(updated);
    log.info(`updateGameData: updated ${changed} character(s)`);
  } else {
    log.info('updateGameData: character data already up to date');
  }
}
