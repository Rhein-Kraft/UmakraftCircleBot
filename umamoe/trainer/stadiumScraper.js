/**
 * umamoe/trainer/stadiumScraper.js
 * ──────────────────────────────────
 * Fetches Team Stadium data from the uma.moe v4 profile API.
 *
 * Replaces the previous Playwright/DOM-scraping implementation.
 * Returns the same data shape so callers (tasks/stadiumSync.js,
 * commands/store.js, etc.) need no changes.
 *
 * Returns:
 *   {
 *     stadiumClass: string | null,
 *     horses: Array<{ name, slot, distance, surface, skills, wins }>,
 *     topHorses: Array<{ name, slot, distance, surface, skills, wins }>,
 *     scrapedAt: string,
 *     source: "api",
 *   }
 * or null on failure.
 */

import { log } from '../../core/log.js';
import { fetchProfile } from '../umaClient.js';
import { charNameById } from '../../utils/characterData.js';

// ─── Lookup tables ────────────────────────────────────────────────────────────

// distance_type integer from the game data → display string
const DISTANCE_LABEL = {
  1: 'Sprint',
  2: 'Mile',
  3: 'Medium',
  4: 'Long',
};

// running_style integer → display string
const RUNNING_STYLE_LABEL = {
  1: 'Nige',
  2: 'Senko',
  3: 'Sashi',
  4: 'Oikomi',
};

// team_class / best_team_class integer → display string
// Based on Uma Musume Team Stadium ladder (higher index = higher tier).
const TEAM_CLASS_LABEL = {
  1: 'Class 1',
  2: 'Class 2',
  3: 'Class 3',
  4: 'Class 4',
  5: 'Class 5',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a trained_chara_id to a display name.
 *
 * The game uses both 4-digit char IDs and 6-digit dress IDs.
 * Values > 9999 are treated as dress IDs and divided by 100 to get the char ID.
 */
function resolveHorseName(trainedCharaId) {
  if (!trainedCharaId) return null;
  const id     = Number(trainedCharaId);
  const charId = id > 9999 ? Math.floor(id / 100) : id;
  const name   = charNameById(charId);
  // charNameById returns '—' for unknowns; treat that as null
  return name && name !== '—' ? name : null;
}

/**
 * Determine the dominant ground type from proper_ground_* grade values.
 * Higher grade integer = better aptitude; ties favour Turf.
 */
function resolveGround(turf, dirt) {
  if (!turf && !dirt) return null;
  return (dirt ?? 0) > (turf ?? 0) ? 'Dirt' : 'Turf';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch Team Stadium data for a trainer via the official uma.moe profile API.
 *
 * @param {string} trainerId
 * @returns {Promise<object|null>}
 */
export async function scrapeStadiumData(trainerId) {
  const id = String(trainerId);

  try {
    const profile = await fetchProfile(id);
    if (!profile) {
      log.warn(`stadiumScraper(${id}): profile not found`);
      return null;
    }

    const stadiumMembers = Array.isArray(profile.team_stadium) ? profile.team_stadium : [];
    const trainerInfo    = profile.trainer ?? {};

    // Stadium class — prefer best_team_class (highest ever achieved)
    const classInt   = trainerInfo.best_team_class ?? trainerInfo.team_class ?? null;
    const stadiumClass = classInt != null
      ? (TEAM_CLASS_LABEL[classInt] ?? `Class ${classInt}`)
      : null;

    const horses = stadiumMembers.map(m => {
      const distance = DISTANCE_LABEL[m.distance_type] ?? null;
      const style    = RUNNING_STYLE_LABEL[m.running_style] ?? null;
      const surface  = resolveGround(m.proper_ground_turf, m.proper_ground_dirt);
      const name     = resolveHorseName(m.trained_chara_id) ?? `Horse ${m.trained_chara_id ?? '?'}`;

      // slot: "Mile / Sashi" style label, same as the old scraper
      const slotParts = [distance, style].filter(Boolean);
      const slot = slotParts.length ? slotParts.join(' / ') : null;

      // skills are integer IDs from the API — kept as strings for compatibility
      const skills = Array.isArray(m.skills) ? m.skills.map(String) : [];

      return { name, slot, distance, surface, skills, wins: null };
    }).filter(h => h.name);

    const topHorses = horses.slice(0, 5);

    log.debug(`stadiumScraper(${id}): source=api horses=${horses.length} class=${stadiumClass}`);

    return {
      stadiumClass,
      horses,
      topHorses,
      scrapedAt: new Date().toISOString(),
      source:    'api',
    };
  } catch (err) {
    log.warn(`stadiumScraper(${id}): ${err.message}`);
    return null;
  }
}
