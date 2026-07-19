# Changelog

> 📌 **File renamed from `CHANGELOG.md` → `replitchangeslog.md`** — This is now the canonical changelog for this repository.

Each section is matched to a git commit by its 7-character short hash.
The bot reads this file on startup and posts the matching entry to #logs-update.
Update this file with each commit to get detailed, human-readable changelogs in Discord.

---

## HEAD — 2026-05-31 (Documentation & Notes Overhaul)

📝 **Renamed — `CHANGELOG.md` → `replitchangeslog.md`**
- File renamed to match the Replit-first naming convention established for project notes
- Content and format unchanged — all historical entries preserved

📝 **Renamed — `Projectnotes.md` → `replitprojectnotes.md`** *(commit 5e34e0e)*
- File renamed to match naming convention; now the canonical project notes file
- Added header notice at top of file noting the rename

🗺️ **Added — Circle Expansion Roadmap (3–10 circles)** *(commit 5e34e0e)*
- New major section added to `replitprojectnotes.md` documenting the long-term plan to scale from 2 circles to up to 10
- Documents why scaling past 2 circles is non-trivial (hardcoded env vars, fixed dropdown choices, quota key pattern, etc.)
- Three architecture options compared — leaning toward SQLite circle registry (Option A) for consistency with project's all-SQLite rule
- 5 sequential phases defined: Registry → Commands → Tasks → Storage → Observability
- Hard constraints documented: max 10 circles, soft-delete only, fully isolated circles, backward compatible at every phase, one phase at a time
- Each phase requires explicit user permission before any code is written
- Summary section added to `replit.md` referencing the full roadmap

📖 **Added — Inter-Circle Leaderboard documentation** *(commit c541e55)*
- New section added to `replitprojectnotes.md` explaining why `/intercircleleaderboard` and `tasks/interCircleAnnouncements.js` exist
- Documents context (two circles, one server — no cross-circle ranking without it), command behavior, automated task behavior, and key design points (dedup, message replacement, circle labels)
- Notes that both files are hardcoded to 2 circles and will need updating in Phase 3 of the circle expansion roadmap

🆕 **Added — `/status` command** *(commit 656c3f3)*
- New slash command showing live bot health at a glance
- Displays: uptime, memory usage (heap + RSS), data sync status (last sync time, consecutive failures), per-task health from the task registry, and configured circle count
- Registered as command #23

---

## 74b5186 — 2026-05-30

Update database to reflect latest timeline data

*No detailed notes — add them above this line.*

---

## 35713a4 — 2026-05-30

Update commands and database with new circle and timeline data

*No detailed notes — add them above this line.*

---

## 00cc66c — 2026-05-30

Update commands to dynamically display circle names and set fan quotas

*No detailed notes — add them above this line.*

---

## 1d9ebc9 — 2026-05-30

Update timeline database with current member data

*No detailed notes — add them above this line.*

---

## 070c17c — 2026-05-30

Update link command to include circle selection and trainer autocomplete

*No detailed notes — add them above this line.*

---

## d1f28d2 — 2026-05-30

Update fan quota and linking settings for the second circle

*No detailed notes — add them above this line.*

---

## d602eb3 — 2026-05-30

Add new circle data to the timeline database

*No detailed notes — add them above this line.*

---

## 4c7c374 — 2026-05-30

Update systems to use a more robust database and remove outdated features

*No detailed notes — add them above this line.*

---

## 489c043 — 2026-05-30

Suppress notifications for chat history messages

*No detailed notes — add them above this line.*

---

## aced293 — 2026-05-30

Prevent notifications when archiving chat messages to history channel

*No detailed notes — add them above this line.*

---

## 140e680 — 2026-05-30

Add data for Uma Musume game timeline events

*No detailed notes — add them above this line.*

---

## 09853c4 — 2026-05-30

Add a plan to support a second circle for fan club data

*No detailed notes — add them above this line.*

---

## db5df25 — 2026-05-30

Update the database with new timeline information

*No detailed notes — add them above this line.*

---

## f8602fe — 2026-05-30

Update project documentation with latest changes

*No detailed notes — add them above this line.*

---

## af2f68e — 2026-05-30

Update database with new timeline information

*No detailed notes — add them above this line.*

---

## 04c9d25 — 2026-05-29

Update project to use SQLite for data storage and add task tracking

*No detailed notes — add them above this line.*

---

## fa13f1d — 2026-05-29

Update database to include timeline information

*No detailed notes — add them above this line.*

---

## c58294c — 2026-05-29

Add ESLint and Prettier for code quality and fix a bug

*No detailed notes — add them above this line.*

---

## 67dc366 — 2026-05-29

Add modernization roadmap documentation to multiple project files

*No detailed notes — add them above this line.*

---

## fb298e3 — 2026-05-29

Update project documentation with modernization roadmap details

*No detailed notes — add them above this line.*

---

## e330a6f — 2026-05-29

Update project documentation to reflect new milestone tiers and selection logic

*No detailed notes — add them above this line.*

---

## d1ae1de — 2026-05-29

Confirm milestone system logic and resolve user concerns

*No detailed notes — add them above this line.*

---

## 0262100 — 2026-05-29

Refine milestone award logic for simultaneous qualifiers

*No detailed notes — add them above this line.*

---

## fc91729 — 2026-05-29

Update milestone rewards to randomly select winners when more than three qualify

*No detailed notes — add them above this line.*

---

## eb12919 — 2026-05-29

Implement independent top-3 tracking for special milestones across different circles

*No detailed notes — add them above this line.*

---

## 05a9ecc — 2026-05-29

Add new milestone tiers for 80 million and 100 million achievements

*No detailed notes — add them above this line.*

---

## 20b3827 — 2026-05-29

Add two new special milestone tiers for high fan counts

*No detailed notes — add them above this line.*

---

## 27cc099 — 2026-05-29

Add duplicate image detection to the image archive feature

*No detailed notes — add them above this line.*

---

## HEAD — 2026-05-29 (Tasks 2–12 — Incremental Modernization)

🔷 **Task 2 — JSDoc typing with `// @ts-check`**
- `core/config.js` — `@typedef BotConfig`, `@returns` on `getConfiguredCircles()`
- `core/log.js` — `@param` on `emit()`, level union type
- `core/store.js` — `@typedef` for member records, `@param` / `@returns` on all public methods
- All new files (Tasks 3–10) written with `// @ts-check` and full JSDoc from the start

🗄️ **Task 3 — Repository abstraction layer**
- `repositories/linkRepository.js` — wraps `linksDb` (set, remove, getViewerId, getAllLinks)
- `repositories/memberRepository.js` — wraps `store` circle-scoped member methods
- `repositories/stateRepository.js` — wraps `store.getState` / `setState`
- Each repository is the canonical entry point for its domain — storage backend can be swapped without touching callers

🗄️ **Task 4 — Migrate `links.json` → SQLite**
- `db/linksDb.js` — new SQLite-backed link store (`links.db`, WAL mode)
  - Schema: `links(discord_id PK, viewer_id, linked_at)` + `idx_links_viewer`
  - On first boot: auto-imports all existing `links.json` entries (16 links migrated)
  - Operations: `setLink`, `removeLink`, `getLinkedViewerId`, `getAllLinks` — all synchronous
- `core/store.js` — link methods now delegate to `linksDb` when initialized; JSON fallback retained for tests
- `index.js` — `initLinksDb()` called before `store.init()` so delegation is active from first command

🔧 **Task 5 — SQLite schema + indexing**
- `links.db` — `idx_links_viewer ON links(viewer_id)` for reverse lookups
- `db/migrations.js` runner wired to `linksDb` init — `_migrations` table created automatically

🔧 **Task 6 — Database migration system**
- `db/migrations.js` — reusable migration runner for any `better-sqlite3` DB
- Each DB tracks its own applied migrations in a `_migrations` table (name, applied_at)
- Migrations run in array order, each wrapped in a transaction — idempotent and safe to re-run
- Usage: `runMigrations(db, [{ name: '001_...', up: db => ... }])`

🛡️ **Task 7 — Centralized async error handling**
- `core/errors.js` — two utilities:
  - `safeRun(fn, context)` — runs fn, logs a warning, returns null on failure (for non-critical background work)
  - `withRetry(fn, { maxAttempts, delayMs, context })` — linear backoff retry; throws on exhaustion

📋 **Task 8 — Task/job registry**
- `core/taskRegistry.js` — in-memory registry for all cron tasks
  - Per-task: `cronExpr`, `lastRunAt`, `lastSuccess`, `lastError`, `consecutiveFailures`, `totalRuns`
  - API: `registerTask`, `recordTaskStart`, `recordTaskEnd`, `getTaskStats`, `getRegisteredCount`
- `tasks/index.js` `schedule()` — now calls `registerTask` on definition, `recordTaskStart/End` on each run
- All 25 scheduled tasks are now tracked

📊 **Task 9 — Health endpoint improvements**
- `/health` payload now includes:
  - `active_circles` — number of configured circles (1 or 2)
  - `tasks.registered` — count of registered cron tasks
  - `tasks.stats` — per-task last run, success flag, consecutive failures, total runs
  - `memory.heap_used_mb`, `memory.heap_total_mb`, `memory.rss_mb`

💾 **Task 10 — Automated SQLite backup**
- `tasks/sqliteBackup.js` — daily at 3:30 AM (JST)
  - Copies all `*.db` files from `DATA_DIR` to `DATA_DIR/backup/YYYY-MM-DD/`
  - Retains last 7 daily backups; older directories pruned automatically
  - WAL sidecars (`*.db-shm`, `*.db-wal`) excluded — main file is always crash-consistent

🧹 **Task 11 — Remove unused dependencies**
- Removed 4 voice-related packages: `@discordjs/voice`, `ffmpeg-static`, `libsodium-wrappers`, `opusscript`
- Confirmed 0 import references across all source files before removal

🧪 **Task 12 — Integration tests**
- `tests/links.test.js` — 7 tests for `linksDb`: set, overwrite, get-null, remove, remove-idempotent, getAllLinks, removed-not-in-all
- `tests/milestone.test.js` — 12 tests: tier table structure, `qualifyingTiers()` thresholds, `pickWinners()` draw logic
- `npm test` — uses Node.js built-in `node:test` (no extra deps); **19/19 pass**
- Each test file uses an isolated temp directory so production data is never touched

---

## HEAD — 2026-05-29 (Task 1 — ESLint + Prettier)

🔧 **Added — ESLint v9 + Prettier**
- `eslint.config.js` — flat-config format (ESLint v9), `@eslint/js` recommended rules, Node.js 20+ globals (`AbortSignal`, `AbortController`, `fetch`, etc.), Playwright browser-context override for `screenshotter.js`, `timelineScraper.js`, `skillScraper.js`, `scrapeCards.js`
- `.prettierrc` — single quotes, semicolons, 100-char print width, `es5` trailing commas, 2-space indent
- `.prettierignore` — excludes `node_modules/`, `data/`, `attached_assets/`, `milestone_images/`, `*.md`
- **New npm scripts:** `lint`, `lint:fix`, `format`, `format:check`
- One-time format pass applied to all 72 pre-existing files — pure style, no behavior change
- Lint result: **0 errors, 29 warnings** (all warnings are dead-code hints for future cleanup)

🐛 **Fixed — `goal` undefined in `tasks/monthlyWarning.js` (ESLint caught)**
- Lines 124 / 130 / 137: used undeclared `goal` instead of `globalGoal` (defined at line 62)
- DM text and update post were silently calling `formatNumber(undefined)` — now uses the correct variable
- No other runtime behavior changed

---

## HEAD — 2026-05-29 (Modernization Roadmap — Planning)

📋 **Planning — Incremental modernization roadmap defined**
- No runtime behavior changed in this commit — planning and documentation only
- Formal modernization specification established for evolving the bot into a more maintainable, SQLite-backed, production-ready service
- **12 priority tasks defined (in order):**
  1. ✅ Add ESLint + Prettier configuration
  2. Add JSDoc typing with `// @ts-check`
  3. Create repository abstraction layer for database access
  4. Gradually migrate remaining JSON flat-file persistence into SQLite
  5. Improve SQLite schema structure and indexing
  6. Add database migration system for SQLite schema updates
  7. Centralize async error handling and structured logging
  8. Add task/job registry with runtime tracking
  9. Improve health endpoint observability and metrics
  10. Add automated SQLite backup system
  11. Remove unused dependencies if confirmed unused
  12. Add integration tests for scheduled jobs and milestone logic
- **Guiding constraints:** incremental only — no full rewrites, no behavior changes, no removal of existing protections (dedup, retry, busy locks), backward compatibility preserved throughout
- **SQLite migration strategy:** start with most write-heavy JSON stores; migrate subsystem-by-subsystem; verify before removing old data; rollback-safe logic where possible

---

## HEAD — 2026-05-29 (Milestone Expansion — 80M / 100M Special Tiers)

🏇 **Added — 80M and 100M special milestone tiers**
- Two new special tiers added above 60M: **80M** (mature & cool) and **100M** (elegant, proud, humble)
- Both are top-3-per-circle-per-month only — same gate as 60M
- Each tier uses a dedicated image pool (4 new FalcoA images: FalcoA1–FalcoA4) picked at random per announcement
- Messages are single fixed-narrative (not multi-variant) to match the elevated tone of the achievement
- Both fire `@everyone` in the announcement channel, same as 60M

🔀 **Changed — Special tier winner selection (60M / 80M / 100M)**
- **Old:** top-3 gate was based on live monthly-gain rank at cron time (rank 1–3 by fans)
- **New:** random draw among all qualifying members, capped at 3 slots per circle per month
  - If ≤3 qualify → all get it (no random needed)
  - If >3 qualify → random shuffle, exactly `slotsLeft` picked from eligible pool
  - Winners locked in DB immediately — no re-rolls on subsequent ticks or restarts
  - Each circle (main + branch) has fully independent 3-slot pools — up to 6 recipients total

✅ **Both circles fully independent** — main circle top-3 and branch circle top-3 are separate draws, separate DB records, separate announcements

🧪 **Updated — `/test_milestone` command**
- Now includes `80M fans (special)` and `100M fans (special)` as choosable test tiers
- Test images correctly pulled from FalcoA pool for 80M/100M, original pool for 60M

---

## HEAD — 2026-05-29 (Stability & Observability Pass)

🔧 **Fixed — 6 stability issues**
- **handlers/interactionCreate.js** (MEDIUM): `autoTimezone` and `logActivity` used bare `.catch(() => {})` — errors were silently discarded with no trace; replaced with named `log.warn()` calls so failures appear in logs without blocking command execution
- **tasks/index.js** (MEDIUM): legacy channel cleanup (`#results-contribution` + 15 racetrack channels) ran on every single bot startup, making unnecessary Discord API calls indefinitely; guarded by a per-guild store flag (`legacyChannelsPurged_<guildId>`) — runs once per guild, never again
- **core/health.js** (LOW): health server hard-bound to port 8080 — on Replit (and any environment where 8080 is taken) it logged `EADDRINUSE` and silently gave up, leaving the `/health` endpoint unavailable; now tries ports in sequence (8080 → 8081 → 3000) and binds to the first available
- **handlers/presenceUpdate.js** (LOW): `morningGreetedToday` dedup Set accumulated entries indefinitely — keys from previous days were never pruned; added a daily prune on each PresenceUpdate event that removes any key not matching today's date
- **index.js** (LOW): `Partials.Channel` was the only partial configured — DM events on uncached messages and users could be silently dropped; added `Partials.Message` and `Partials.User`
- **core/health.js + tasks/dataSync.js** (LOW): `/health` endpoint only reported Discord client connectivity and timeline status — a stale or failing data sync (e.g. prolonged uma.moe 429) would still report `status: ok`; exported a live `syncStatus` object from `dataSync.js` and wired it into the health payload with `last_sync_at`, `last_sync_error`, and `consecutive_failures` fields

---

## HEAD — 2026-05-29

➕ **Added — `/set_fans` command**
- New admin-only slash command for setting fan requirements per circle and time period
- Step 1: choose circle — **UmaKraft** or **UmaKraft 2**
- Step 2: choose scope — **Daily**, **Weekly**, or **Monthly**
- Step 3: choose amount — preset values from **10M to 100M** (5M steps) or **Specified** for a custom exact value
- Settings are stored per-guild and per-circle in `guildConfig` — main circle uses backward-compatible keys (`quotaDaily`, `quotaWeekly`, `quotaMonthly`); circle 2 uses `quota_c2_Daily` / `quota_c2_Weekly` / `quota_c2_Monthly`
- Graceful reply if UmaKraft 2 is selected before `CIRCLE_2_ID` is configured
- Confirmation card shows all three scopes for the selected circle after saving

🔧 **Fixed — 9 bugs**
- **timeline.js** (HIGH): `clearAllMessageRows()` was called inside the guild loop, wiping guild 1's message tracking before guild 2 was processed — moved to before the loop
- **milestoneDb.js** (HIGH): 1-hour threshold for the legacy-row migration would silently mark real pending milestones as sent after any outage longer than 1 hour — raised to 30 days
- **attendanceDb.js** (HIGH): attendance `INSERT` and streak `UPDATE` were two separate statements with no transaction — wrapped both in a `db.transaction()` so a crash between them can never leave the two tables out of sync
- **uma.js** (MEDIUM): parallel cold-start calls to `getCircleSnapshot()` all triggered separate `buildSnapshot()` API fetches — added an in-flight promise guard (`buildInFlight` Map) so only the first caller fires the request and others join it
- **dailyWarnings.js** (MEDIUM): daily quota was resolved from the first guild only and used for all guilds — now resolved per-guild inside the channel post loop; DMs use the global config default
- **monthlyWarning.js** (MEDIUM): monthly goal was resolved from the first guild only — same fix; per-guild card now uses that guild's own `quotaMonthly` / `quota_c2_Monthly`
- **presenceUpdate.js** (MEDIUM): `user.send()` DM failure logged as a generic handler error and consumed the morning-greeting guard key, preventing any retry — now caught separately, logged at debug level, and the guard key is removed so the next online event retries
- **chatArchiver.js** (MEDIUM): one failed attachment download cancelled all downloads for that message via `Promise.all()` — changed to `Promise.allSettled()` so successful downloads are still archived
- **search_trainer.js** (LOW): `expires_at` date parsing could produce `NaN` for unexpected formats, rendering `<t:NaN:R>` literally in the embed — added `isNaN` guard with plain-text fallback

---

## f9804bc — 2026-05-27

🎵 **Added — Playlist UI list**
- `#playlist` now opens with a **sorted header embed** showing every song: number, title, artist, and duration — styled like the Spotify playlist screen
- Smart sort: Latin-titled songs (A-Z) appear first; Japanese/non-Latin titles go to the bottom, sorted by artist name
- Artist name is now extracted automatically from YouTube/SoundCloud metadata (artist tag → uploader fallback) and stored in the library
- Each song is still posted as a native Discord audio message directly below the list — tap the play button on the right to listen (just like a voice recording)
- On first boot the channel rebuilds cleanly: old messages are removed and songs are re-posted in sorted order so the layout always matches the header list
- New songs added via `/import` or `#import-mp3` automatically update the header count and list

---

## 08739db — 2026-05-27

⚡ **Improved — uma.moe API**
- Now respects the Retry-After header on 429 rate-limit responses — waits exactly as long as uma.moe requests instead of a fixed guess
- Historical join-date lookups are 3× faster (500ms between month fetches instead of 1500ms) — new members resolve much quicker on sync
- Eliminated the redundant second uma.moe API call at the end of every data sync — cache rebuilt in-process, saving one full API round-trip every 30 minutes

⚡ **Improved — Auto-posts**
- Daily warnings, daily top-3, weekly top-3, and monthly top-3 now have same-day deduplication — restarts never re-post or re-DM trainers the same day
- Daily warnings (07:05) and daily top-3 (07:10) now fire after the 07:00 data sync completes, preventing stale data in posts
- Fixed silent logic bug in daily warnings safe/failing check

➕ **Added**
- Changelog auto-posts to #logs-update on every bot update — reads from CHANGELOG.md for detailed entries, falls back to git log

---

## f838cd7 — 2026-05-27

⚡ **Improved**
- Changelog now reads from CHANGELOG.md for detailed, human-written entries per commit
- Falls back to git commit subjects automatically when no CHANGELOG.md entry exists
- Deduplication key now includes content hash — updating this file always triggers a fresh post

➕ **Added**
- CHANGELOG.md — write detailed change notes here alongside each commit

---

## 9e5f1cb — 2026-05-27

⚡ **Improved — uma.moe API**
- Now respects the Retry-After header on 429 rate-limit responses — waits exactly as long as uma.moe requests instead of a fixed guess
- Historical join-date lookups are 3× faster (500ms between month fetches instead of 1500ms) — new members' join dates resolve much quicker on sync
- Eliminated the redundant second uma.moe API call at the end of every data sync — cache is now rebuilt in-process from already-fetched data, saving one full API round-trip every 30 minutes

⚡ **Improved — Auto-posts**
- Daily warnings, daily top-3, weekly top-3, and monthly top-3 now have same-day deduplication — bot restarts never re-post or re-DM trainers on the same day
- Daily warnings (07:05) and daily top-3 (07:10) now fire after the 07:00 data sync completes, preventing stale data from appearing in posts
- Fixed silent logic bug in the daily warnings safe/failing check — condition was redundant and now reads clearly

---
