/**
 * scripts/generateMemberArchive.js
 * One-shot runner — seeds daily gains from CSVs then generates Member-Archive files.
 * Usage: node scripts/generateMemberArchive.js
 */
import { initStoreDb } from '../db/storeDb.js';
import { autoImportCsvGains } from '../tasks/autoImportCsv.js';
import { runMemberArchiveSync } from '../tasks/memberArchive.js';

initStoreDb();

console.log('Step 1 — importing CSV gains into daily_gains…');
await autoImportCsvGains();

console.log('Step 2 — generating Member-Archive files…');
await runMemberArchiveSync();

console.log('Done.');
