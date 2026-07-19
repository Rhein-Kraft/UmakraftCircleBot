/**
 * Local milestone image library.
 *
 * Place any image files (.jpg, .jpeg, .png, .gif, .webp) inside
 * /milestone_images/ and they will automatically be picked up at startup.
 *
 * No scraping, no downloads — only files the developer manually adds.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { log } from '../../core/log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, '../..', 'milestone_images');

const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

let loadedImages = [];

/**
 * Scan /milestone_images/ and cache all supported image paths.
 * Call once on startup (idempotent — safe to call again to refresh).
 */
export async function loadMilestoneImages() {
  try {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
    const entries = await fs.readdir(IMAGES_DIR);
    loadedImages = entries
      .filter(f => SUPPORTED_EXT.has(path.extname(f).toLowerCase()) && !f.startsWith('.'))
      .map(f => path.join(IMAGES_DIR, f));

    if (loadedImages.length > 0) {
      log.info(`milestoneImages: loaded ${loadedImages.length} image(s) from /milestone_images/`);
    } else {
      log.info('milestoneImages: /milestone_images/ is empty — falling back to built-in pool');
    }
  } catch (err) {
    log.warn('milestoneImages: failed to scan folder:', err.message);
    loadedImages = [];
  }
}

/**
 * Returns true if at least one local image is loaded.
 */
export function hasMilestoneImages() {
  return loadedImages.length > 0;
}

/**
 * Returns all loaded image paths.
 */
export function getMilestoneImages() {
  return [...loadedImages];
}
