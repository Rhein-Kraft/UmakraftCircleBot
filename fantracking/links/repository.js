// @ts-check
/**
 * linkRepository.js
 * ─────────────────
 * Repository for Discord ↔ Uma.moe trainer ID links.
 *
 * Backed by SQLite via db/linksDb.js (with automatic one-time import
 * from the legacy links.json on first start).
 *
 * This is the canonical API for all link operations — use this instead
 * of calling store.setLink() / store.getLinkedViewerId() directly.
 */
import { setLink, removeLink, getLinkedViewerId, getAllLinks } from './db.js';

export const linkRepository = {
  /**
   * Store or update a Discord ↔ viewer link.
   * @param {string} discordId
   * @param {string} trainerId
   */
  setLink(discordId, trainerId) {
    setLink(discordId, trainerId);
  },

  /**
   * Remove the link for a Discord user (no-op if not linked).
   * @param {string} discordId
   */
  removeLink(discordId) {
    removeLink(discordId);
  },

  /**
   * Return the uma.moe viewer ID for a Discord user, or null if not linked.
   * @param {string} discordId
   * @returns {string | null}
   */
  getLinkedViewerId(discordId) {
    return getLinkedViewerId(discordId);
  },

  /**
   * Return all links as { discordId: trainerId }.
   * @returns {Record<string, string>}
   */
  getAllLinks() {
    return getAllLinks();
  },
};
