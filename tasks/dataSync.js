// @ts-check
/**
 * tasks/dataSync.js — re-export shim
 *
 * All logic has moved to fantracking/sync/dataSync.js, which is now the
 * official data-pipeline home for the fan tracking domain.
 * This shim keeps every existing import working without changes.
 */
export * from '../fantracking/sync/dataSync.js';
