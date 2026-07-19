// @ts-check
/**
 * repositories/stateRepository.js
 *
 * Thin repository layer for generic key-value bot state.
 * Delegates to core/store, which owns the persistence contract.
 * Values are JSON-serialised internally so any JS type (string, number,
 * boolean, object, array) round-trips faithfully — including `false` and `0`.
 */
import { store } from '../core/store.js';

export const stateRepository = {
  /**
   * Retrieve a stored value by key.
   * Returns `defaultValue` (default: `null`) when the key does not exist.
   *
   * @template T
   * @param {string} key
   * @param {T} [defaultValue]
   * @returns {Promise<T|null>}
   */
  async get(key, defaultValue = null) {
    return store.getState(String(key), defaultValue);
  },

  /**
   * Store any serialisable JS value under `key`.
   * Overwrites any previously stored value for that key.
   *
   * @param {string} key
   * @param {*} value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    store.setState(String(key), value);
  },
};
