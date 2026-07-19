// @ts-check
/**
 * repositories/memberRepository.js
 *
 * Thin repository layer for circle member data.
 * Delegates to core/store, which owns the persistence contract.
 */
import { store } from '../core/store.js';

export const memberRepository = {
  /**
   * Return the full member map for a circle.
   * Returns an empty object if the circle has no members.
   *
   * @param {string} circleId
   * @returns {Promise<Record<string, object>>}
   */
  async getMembersForCircle(circleId) {
    return store.getMembersForCircle(String(circleId));
  },

  /**
   * Insert or patch a single member.
   * Viewer ID is always coerced to a string so numeric IDs are stored
   * consistently (e.g. `12345` → `'12345'`).
   *
   * @param {string} circleId
   * @param {string|number} viewerId
   * @param {object} data  — partial member fields to merge
   * @returns {Promise<void>}
   */
  async upsertMemberForCircle(circleId, viewerId, data) {
    await store.upsertMemberForCircle(String(circleId), String(viewerId), data);
  },

  /**
   * Replace the entire member map for a circle.
   * Existing members not present in `membersMap` are removed.
   *
   * @param {string} circleId
   * @param {Record<string, object>} membersMap
   * @returns {Promise<void>}
   */
  async setMembersForCircle(circleId, membersMap) {
    await store.setMembersForCircle(String(circleId), membersMap);
  },
};
