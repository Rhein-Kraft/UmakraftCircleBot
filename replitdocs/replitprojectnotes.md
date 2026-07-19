# Uma Circle Bot — Project Notes (Multi-Circle Slash Command Behavior)

> 📌 **File renamed from `Projectnotes.md` → `replitprojectnotes.md`** — This is now the canonical project notes file for this repository.

## Overview

This document defines how the bot handles **multiple Uma.moe circles using the same slash commands**.

---

# Inter-Circle Leaderboard — Why It Exists

## Context

UmaKraft and UmaKraft 2 are **two separate uma.moe circles** but share the **same Discord server**. The regular `/leaderboard` command only ranks members *within a single circle*. Members in UmaKraft 2 had no way to see how they compared against members in UmaKraft — and vice versa.

## What It Does

The inter-circle leaderboard **merges both circles into one unified ranking**, with each row labelled by which circle the member belongs to.

### `/intercircleleaderboard` command
- On-demand: any member can pull a combined top-10 to top-30 ranking across both circles
- Scope options: `Daily` / `Weekly` / `Monthly` gain
- Filters out join-day members (no data yet)
- Renders as an image card via `renderInterCircleLeaderboard()`

### `tasks/interCircleAnnouncements.js` (automated)
- Posts the merged leaderboard to the announcement channel automatically
- **Daily** — once per day, members need ≥ 1,000,000 gain to qualify
- **Weekly** — once per week, same 1M minimum
- **Monthly** — once per month, no minimum (all active members included)
- Each new post **replaces the previous one** (tracked by `icLbMsg_<scope>` in guildConfig) to keep the channel clean
- Skipped if no qualifying members or the lock is held

## Key Design Points

| Point | Detail |
|---|---|
| Circle labels | Every row shows `circleName` so viewers know which circle a member is from |
| Deduplication | `stateKey` (`lastICLbDaily` / `lastICLbWeekly` / `lastICLbMonthly`) prevents double-posting on the same day |
| Message replacement | Previous announcement message is deleted before the new one is sent |
| Hardcoded 2-circle | Currently reads `config.circleId` + `config.circle2Id` — will need to be updated as part of the Circle Expansion Roadmap (Phase 3) |

The goal is:

> One set of slash commands → different results depending on selected circle context.

---

## Core Concept

The bot supports multiple circles:

- Main Circle
- Secondary Circle (expansion / alt group)

Each circle has its own:
- fan gains
- leaderboards
- milestones
- member activity
- rankings

However, **users interact through the same commands**.

---

## Command Behavior Model

### Before (Single Circle System)

All commands used a single global circle:
- `/leaderboard` → always Main Circle
- `/fan_gain` → always Main Circle
- `/total_fan` → always Main Circle

---

### After (Multi-Circle System)

All commands behave like this:

> Command → resolve circle context → return circle-specific result

So:

- `/leaderboard` → shows Main or Secondary depending on context
- `/fan_gain` → returns fan gain for selected circle
- `/circle_master` → shows ranking inside chosen circle

---

## Circle Selection Logic (Conceptual)

The bot determines which circle to use based on:

### 1. User preference (if set)
- Each user may be assigned a preferred circle

### 2. Server / channel context
- Different channels may represent different circles

### 3. Default fallback
- If no selection exists, Main Circle is used

---

## Circle Independence Rule

Each circle is fully isolated:

- No shared leaderboard data
- No shared milestone tracking
- No merged fan totals
- No cross-circle ranking

Each command only reflects one circle at a time.

---

## Slash Command Behavior Rules

### `/leaderboard`
- Shows rankings for the active circle
- Displays circle name in the output
- Must NOT mix multiple circles in one result

---

### `/fan_gain`
- Shows daily/weekly/monthly gains for selected circle only
- Rankings are calculated per-circle

---

### `/total_fan`
- Returns lifetime totals per circle
- Circle rank is specific to that circle only

---

### `/circle_master`
- Displays Top 3 contributors for the selected circle month
- Each circle has independent monthly history

---

## User Experience Design

### Key principle:

> Users should not need to think about circles for every command.

The system automatically selects the correct circle based on context.

---

## Expansion Design (Secondary Circle)

The secondary circle is treated as:

- A fully independent dataset
- A parallel leaderboard system
- A separate engagement space

Use cases:
- overflow members
- testing new features
- experimental leaderboard formats
- alternate community group

---

## Data Integrity Rules

To prevent data corruption:

- Circle data must never be merged
- Leaderboards must be computed per circle only
- Milestones must be tracked separately
- Member tracking must be circle-specific

---

## UI Consistency Rule

All command outputs must clearly show:

- Circle name (Main / Secondary)
- Relevant ranking within that circle
- No mixed references between circles

---

## Future Expansion Possibilities

This system is designed to support:

- 2+ circles
- cross-circle comparisons (future feature)
- global aggregated stats (optional feature)
- circle switching commands (optional UX upgrade)

---

## Summary

The bot now operates as a:

> Multi-circle analytics system with a single unified command interface.

Users interact the same way, but results are dynamically scoped to the correct circle context.


                           ┌────────────────────────────┐
                           │        Discord API         │
                           │  Slash Commands / Events   │
                           └─────────────┬──────────────┘
                                         │
                                         ▼
                        ┌────────────────────────────────┐
                        │        Bot Entry Layer         │
                        │          index.js              │
                        │  - Discord client init        │
                        │  - Event routing             │
                        └─────────────┬──────────────────┘
                                      │
                                      ▼
        ┌────────────────────────────────────────────────────────┐
        │                Slash Command Layer                     │
        │   /leaderboard /fan_gain /circle_master /etc          │
        │  (same commands for all circles)                      │
        └───────────────────────┬────────────────────────────────┘
                                │
                                ▼
        ┌────────────────────────────────────────────────────────┐
        │              Circle Context Resolver                   │
        │                                                        │
        │  Decides WHICH circle to use per command:             │
        │  - Main Circle                                         │
        │  - Secondary Circle                                    │
        │                                                        │
        │  Rules:                                                │
        │  - User preference                                    │
        │  - Channel mapping                                    │
        │  - Default fallback (Main)                            │
        └───────────────────────┬────────────────────────────────┘
                                │
                                ▼
        ┌────────────────────────────────────────────────────────┐
        │              Circle Data Selection Layer               │
        │                                                        │
        │  Resolves correct circle ID:                          │
        │   → Main Circle ID                                   │
        │   → Secondary Circle ID                              │
        │                                                        │
        │  Output: unified "active circle context"             │
        └───────────────────────┬────────────────────────────────┘
                                │
                                ▼
        ┌────────────────────────────────────────────────────────┐
        │                Data Fetch Layer                        │
        │                                                        │
        │   uma.moe API calls per circle:                       │
        │   - fan snapshots                                     │
        │   - member list                                      │
        │   - daily_fans arrays                                 │
        └───────────────────────┬────────────────────────────────┘
                                │
                                ▼
        ┌────────────────────────────────────────────────────────┐
        │              Core Processing Engine                    │
        │                                                        │
        │  - Fan gain calculation                              │
        │  - Leaderboard computation                           │
        │  - Milestone detection                               │
        │  - Attendance + activity tracking                    │
        └───────────────────────┬────────────────────────────────┘
                                │
                                ▼
        ┌────────────────────────────────────────────────────────┐
        │                 Data Layer                            │
        │                                                        │
        │  SQLite + JSON storage:                               │
        │  - trainerDb                                         │
        │  - milestoneDb  ✅ circle_id scoped                  │
        │  - attendanceDb ✅ circle_id scoped                  │
        │  - timelineCache                                     │
        │  - onboardingDb ⬜ circle scope pending              │
        │                                                        │
        │  ⚠ All data is NAMESPACED BY CIRCLE                  │
        └───────────────────────┬────────────────────────────────┘
                                │
                                ▼
        ┌────────────────────────────────────────────────────────┐
        │              Task Scheduler System                     │
        │                                                        │
        │  Cron Jobs (multi-circle aware):                     │
        │  - dataSync (30 min)         ✅                       │
        │  - milestones (5/35 min)     ✅                       │
        │  - leaderboard posts         ✅                       │
        │  - warnings / DMs            ✅                       │
        │  - attendance (6am)          ✅                       │
        │  - timeline scraping (5 min) — shared (not per-circle)│
        │  - archive systems           — guild-level only       │
        └───────────────────────┬────────────────────────────────┘
                                │
                                ▼
        ┌────────────────────────────────────────────────────────┐
        │                 Discord Output Layer                   │
        │                                                        │
        │  - leaderboards (circle-labelled)                    │
        │  - milestone messages (circle-labelled)              │
        │  - DM notifications (circle-aware)                   │
        │  - logs-update channel                               │
        │  - timeline updates                                  │
        │  - hype reactions (all circles checked)             │
        └────────────────────────────────────────────────────────┘

---

---

# Implementation Plan — Multi-Circle Support

## Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| Circle selection in commands | Discord **choice dropdown** (fixed values), defaults to UmaKraft | Prevents typos; Discord renders it as a clean selector — no free-text input |
| Channel strategy | Option A — same channels, both circles post there | Simpler now; circles share one server; top performers can move up |
| Server structure | Single Discord server | Both circles share the same server |
| Secondary circle status | Not detected on uma.moe yet | Reserved — activates automatically when `CIRCLE_2_ID` is set |
| Timeline | Shared (not per-circle) | Game events are global, not circle-specific |
| Promotion mechanic | No bot command needed | Moving a trainer on uma.moe is enough; bot picks them up on next sync |

---

## Circle Naming

| Circle | Display Name | Config Key |
|---|---|---|
| Main | UmaKraft | `CIRCLE_ID` (already exists) |
| Secondary | UmaKraft 2 | `CIRCLE_2_ID` (empty until detected) |

---

## Command Changes

All lookup commands get an optional `circle:` **choice dropdown** (not a text field):

```
circle: UmaKraft   (value: "main")       → uses CIRCLE_ID
circle: UmaKraft 2 (value: "secondary")  → uses CIRCLE_2_ID (if not set: "not available yet" reply)
(omitted)                                → defaults to UmaKraft
```

The dropdown always shows both options. If UmaKraft 2 is selected before `CIRCLE_2_ID` is set, the bot replies with a graceful message and does nothing else.

Commands affected:
- `/leaderboard`
- `/fan_gain`
- `/total_fan`
- `/total_circlefan_gain`
- `/circle_master`

Commands NOT affected (circle-agnostic):
- `/link`, `/unlink`, `/store`, `/search_trainer`, `/keep`, `/joindate`
- `/set_timezone`, `/set_quota`
- `/timeline_setup`, `/timeline_post`
- `/admin_*`, `/test_milestone`, `/help`

---

## Automatic Task Behavior (Option A)

Same channels receive posts from both circles, each clearly labelled with circle name.

| Task | Multi-circle behavior |
|---|---|
| `dataSync` | Fetches data for all configured circles each run |
| `milestones` | Checks each circle independently; posts to `#announcement` with circle label |
| `dailyWarnings` | DMs members of all circles; DM shows which circle the warning is for |
| `leaderboardAnnouncements` | Posts Top 3 per circle to same `#leaderboard`; each post labelled |
| `weeklyAnnouncement` | Full leaderboard per circle posted Monday; each labelled |
| `monthlyWarning` | 30M goal check per circle |
| `tallyResults` | Tally posted per circle on boundary days |
| `logsUpdateReport` | Fan-deficit report shows all circles |
| `attendanceCheck` | Records attendance per circle separately; only linked members tracked |
| `offlineCheck` | Checks members of all circles |

---

## "Not Detected Yet" Handling

When `CIRCLE_2_ID` is not set in env vars:

- **Commands**: if `circle: UmaKraft 2` is selected → reply with:
  > *"UmaKraft 2 hasn't been detected on uma.moe yet — check back soon!"*
- **Automatic tasks**: silently skip circle 2 processing
- **No crash, no broken data, no placeholder noise**

The moment `CIRCLE_2_ID` is set, all features activate on the next bot restart with zero code changes.

---

## Data Namespacing

All stored state must be keyed by circle ID to prevent cross-circle contamination.

| Storage | Approach | Status |
|---|---|---|
| `members.json` / `dailyGains.json` | Separate file per circle — main circle keeps legacy filename (backward compat); circle 2 uses `members_CIRCLEID.json` / `dailyGains_CIRCLEID.json` | ✅ Done |
| In-memory snapshot cache | `Map<circleId, snapshot>` — each circle gets its own cache slot, never overwritten by another | ✅ Done |
| `state.json` keys | Per-circle keys where relevant (e.g. `lastDataSync_CIRCLEID`, `lastGainPrune_CIRCLEID`) | ✅ Done |
| `milestoneDb` | `circle_id` in PRIMARY KEY `(viewer_id, tier_key, month, circle_id)` — full migration from old schema included | ✅ Done |
| `attendanceDb` | `circle_id` in PRIMARY KEY `(user_id, guild_id, circle_id, date)` — migration stamps old rows with `''`; only linked circle members are recorded | ✅ Done |
| `onboardingDb` | `circle_id` column added (nullable, populated on first match). Reminder task cross-references links + circle member maps — skips non-circle members, includes circle name in DM | ✅ Done |

---

## Files to Change

~15–18 files touched total. Nothing is replaced — everything is extended.

| File | Change | Status |
|---|---|---|
| `core/config.js` | Add `CIRCLE_2_ID`, circle display names, `getConfiguredCircles()` helper | ✅ Done |
| `core/uma.js` | Per-circle snapshot cache (Map); `findEarliestJoinDate` accepts circleId; `setCachedSnapshot` keyed by circleId | ✅ Done |
| `core/store.js` | Circle-scoped member + daily gain methods; separate file per circle | ✅ Done |
| `commands/leaderboard.js` | Add `circle:` choice dropdown | ✅ Done |
| `commands/fan_gain.js` | Add `circle:` choice dropdown | ✅ Done |
| `commands/total_fan.js` | Add `circle:` choice dropdown | ✅ Done |
| `commands/total_circlefan_gain.js` | Add `circle:` choice dropdown | ✅ Done |
| `commands/circle_master.js` | Add `circle:` choice dropdown | ✅ Done |
| `tasks/dataSync.js` | Accepts `circleId` param; uses circle-scoped store; left-member detection scoped per circle | ✅ Done |
| `tasks/index.js` | All scheduled tasks loop over `getConfiguredCircles()` | ✅ Done |
| `tasks/milestones.js` | Check + post per circle; per-circle silent boot-claim guard; circle-scoped DB calls | ✅ Done |
| `tasks/dailyWarnings.js` | Circle-scoped state key; fetches snapshot per circleId; DM shows circle name | ✅ Done |
| `tasks/leaderboardAnnouncements.js` | Per-circle state keys; circle name in leaderboard image; posts daily/weekly/monthly per circle | ✅ Done |
| `tasks/weeklyAnnouncement.js` | Accepts circleId; circle name in weekly report image | ✅ Done |
| `tasks/monthlyWarning.js` | Accepts circleId; circle-scoped snapshot; DM references correct circle | ✅ Done |
| `tasks/tallyResults.js` | Accepts circleId; circle name in tally image | ✅ Done |
| `tasks/logsUpdateReport.js` | Accepts circleId; deficit report labelled per circle | ✅ Done |
| `tasks/attendanceCheck.js` | Circle-scoped — only records Discord users linked to the given circle; circle_id stored in DB | ✅ Done |
| `db/milestoneDb.js` | `circle_id` added to PRIMARY KEY with in-place migration | ✅ Done |
| `db/attendanceDb.js` | `circle_id` added to PRIMARY KEY with in-place migration for both `attendance` and `user_streaks` tables | ✅ Done |
| `handlers/messageCreate.js` | `maybeHypeReaction()` checks all configured circles; reacts 🏇 once/day for 5M+ yesterday gain; rate-limited in-memory | ✅ Done |
| `db/onboardingDb.js` | `circle_id` column added with `ALTER TABLE` migration; `updateCircleId()` helper added | ✅ Done |
| `tasks/onboardingReminder.js` | Cross-references links + circle member maps; skips non-circle members; reminder DM includes circle name; persists `circle_id` on first match | ✅ Done |
| `handlers/guildMemberAdd.js` | Welcome DM uses `config.circleName` dynamically instead of hardcoded string | ✅ Done |

---

## Bug Fixes Applied During Build

Three critical bugs were discovered during implementation and fixed before they could cause data corruption:

| Bug | Root Cause | Fix |
|---|---|---|
| Snapshot cache overwrite | Single global cache slot — circle 2 sync overwrote circle 1 data | Changed to `Map<circleId, snapshot>` |
| Cache ignores circleId | `getCircleSnapshot(circleId)` ignored the argument when cache was warm, always returning the last cached circle | Now looks up the correct slot by circleId |
| Wrong historical join data | `findEarliestJoinDate` hardcoded `config.circleId` when walking back months, so circle 2 join dates were searched against circle 1 history | Now passes `circleId` through the full call |
| Left-member contamination | When syncing circle 2, members only in circle 1 would be marked `leftAt` because the check compared against all known members globally | `known` is now loaded per-circle so only that circle's members are evaluated |

---

## Build Order

1. ✅ **Config layer** — `CIRCLE_2_ID`, display names, `getConfiguredCircles()` added to `core/config.js`
2. ✅ **Data layer** — `core/uma.js` per-circle cache + circleId-aware API calls
3. ✅ **Store layer** — circle-scoped member and daily gain methods in `core/store.js`
4. ✅ **Commands** — `circle:` choice dropdown added to 5 lookup commands
5. ✅ **dataSync** — accepts circleId, uses circle-scoped storage, left-member detection scoped per circle
6. ✅ **Remaining auto tasks** — milestones, warnings, leaderboard posts, attendance, tally, logsUpdate — all circle-aware
7. ✅ **Message handler** — hype reactions check all circles (5M+ yesterday gain → 🏇 reaction, once per day per user)
8. ✅ **DB schemas** — `circle_id` in PRIMARY KEY for `milestoneDb` and `attendanceDb`; migrations handle existing data
9. ✅ **onboardingDb** — `circle_id` column added; reminder task cross-references circle member maps, skips non-circle members, includes circle name in DM; welcome DM in `guildMemberAdd` uses dynamic circle name

---

## Status

> 🟢 **Complete** — All 24 items done. The multi-circle migration is fully implemented across every layer: config, data, store, commands, scheduled tasks, DB schemas, message handler, and onboarding. Activating a second circle requires only setting `CIRCLE_2_ID` — no code changes needed.

---

# Milestone Expansion — 80M / 100M Special Tiers (2026-05-29)

## New Tiers Added

| Tier | Style | Gate | Image Pool |
|---|---|---|---|
| 60M | Loving & excited (Smart Falcon) | Top 3 per circle per month | Dedicated: `Lovely_SmartFalcon_1778567548259.png` |
| 80M | Mature & cool | Top 3 per circle per month | FalcoA1–FalcoA4 (random) |
| 100M | Elegant, proud, humble, cute | Top 3 per circle per month | FalcoA1–FalcoA4 (random) |

All three fire `@everyone` in the announcement channel. Member DMs and leader DMs sent for all three.

## Winner Selection Logic (Special Tiers)

Runs each cron tick (every 30 min) per circle:

1. Count already-claimed slots in DB for this tier + month + circle → `slotsLeft = 3 - claimed`
2. If `slotsLeft = 0` → all 3 slots filled, no further action
3. Build `eligible` list: members who qualify (`monthlyGain >= threshold`) and have no DB record yet
4. If `eligible.length <= slotsLeft` → all get it (no random needed)
5. If `eligible.length > slotsLeft` → shuffle eligible, pick exactly `slotsLeft`
6. Winners locked in DB via `claimMilestone()` → never re-rolled

## Circle Independence

Each circle has its own independent 3-slot pool:
- Main circle: up to 3 recipients for 60M, 3 for 80M, 3 for 100M
- Branch circle: same, fully independent
- Total possible: up to 6 recipients per tier per month across both circles

## Why `@everyone` for All Three

Average player earns 500K–2M fans/day. Monthly minimum to stay in circle is 30M. Reaching 60M/80M/100M in a single month is genuinely exceptional — `@everyone` is warranted for all three tiers.

## Tier Stacking

Since fan gain is progressive (daily increments), members cross 60M → 80M → 100M on separate cron ticks over the course of a month. There is no realistic path to skipping a threshold. Each tier fires independently as the member crosses it.

---

# Modernization Roadmap

## Goal

Incrementally modernize specific subsystems while preserving all runtime behavior and Discord bot functionality. The goal is to evolve the bot into a more maintainable, SQLite-backed, production-ready service — not to rewrite it.

## Guiding Constraints

| Rule | Reason |
|---|---|
| DO NOT rewrite the entire project at once | Risk of introducing regressions across all subsystems simultaneously |
| DO NOT change runtime behavior unless explicitly requested | Bot is in production; behavior changes need separate sign-off |
| DO NOT remove existing protections | Dedup systems, retry logic, and busy locks exist for correctness reasons |
| Keep changes small and isolated | Each task should be independently reviewable and revertible |
| Explain proposed changes before applying | Prevents surprise breakage in a live bot |
| Preserve backward compatibility | Existing data (SQLite schemas, JSON files, state keys) must remain readable |

## Priority Tasks

| # | Task | Status |
|---|---|---|
| 1 | Add ESLint + Prettier configuration | ✅ Done|
| 2 | Add JSDoc typing with `// @ts-check` | ✅ Done — `core/config.js`, `core/log.js`, `core/store.js`, all new files|
| 3 | Create repository abstraction layer for database access | ✅ Done — `repositories/link/member/stateRepository.js`|
| 4 | Gradually migrate remaining JSON flat-file persistence into SQLite | ✅ Done — `links.json` → `db/linksDb.js` (SQLite); 16 links auto-imported|
| 5 | Improve SQLite schema structure and indexing | ✅ Done — `links.db` `idx_links_viewer`; `migrations.js` runner wired to all DB inits|
| 6 | Add database migration system for SQLite schema updates | ✅ Done — `db/migrations.js` reusable runner with `_migrations` tracking table|
| 7 | Centralize async error handling and structured logging | ✅ Done — `core/errors.js`: `safeRun()` + `withRetry()` with exponential back-off|
| 8 | Add task/job registry with runtime tracking | ✅ Done — `core/taskRegistry.js` tracks last run, success, consecutive failures for all 25 tasks|
| 9 | Improve health endpoint observability and metrics | ✅ Done — `/health` exposes task registry stats, heap/RSS memory, active circle count|
| 10 | Add automated SQLite backup system | ✅ Done — `tasks/sqliteBackup.js` at 3:30 AM daily; copies all `*.db`, retains 7 days|
| 11 | Remove unused dependencies if confirmed unused | ✅ Done — `@discordjs/voice`, `ffmpeg-static`, `libsodium-wrappers`, `opusscript` removed|
| 12 | Add integration tests for scheduled jobs and milestone logic | ✅ Done — `tests/links.test.js` (7 tests) + `tests/milestone.test.js` (12 tests); 19/19 pass|

## SQLite Migration Requirements

- Use SQLite as the primary persistent storage layer going forward
- Preserve existing `better-sqlite3` usage where already in place
- Add proper `PRIMARY KEY`, `UNIQUE` constraints, and indexes
- Use `db.transaction()` for all multi-step writes
- Add a migration runner for future schema changes (no manual ALTER TABLE patching)
- Avoid duplicate writes and race conditions — maintain existing dedup logic
- Optimize read-heavy queries (leaderboard, attendance) with appropriate indexes
- Preserve full multi-circle support across all migrated tables

## Persistence Migration Strategy

| Step | Approach |
|---|---|
| Order | Start with most write-heavy JSON stores first (`dailyGains`, `members`) |
| Compatibility | Preserve current data structure so existing readers still work during transition |
| Pace | Migrate one subsystem at a time — never multiple stores in a single commit |
| Safety | Do not delete old JSON files until SQLite migration is verified correct |
| Rollback | Migration logic must be safe to re-run; use `IF NOT EXISTS` and `INSERT OR IGNORE` |

---

# Stability & Observability Fixes — 2026-05-29 (Pass 2)

Six issues identified via full codebase audit and fixed in one pass. Focus: silent failures, memory growth, DM robustness, and health visibility.

| # | File(s) | Severity | Root Cause | Fix |
|---|---|---|---|---|
| 1 | `handlers/interactionCreate.js` | ✅ Done| `autoTimezone` and `logActivity` used bare `.catch(() => {})` — errors silently discarded | Replaced with `log.warn()` named catches — failures visible in logs, never block command execution |
| 2 | `tasks/index.js` | ✅ Done — `core/config.js`, `core/log.js`, `core/store.js`, all new files| Legacy channel cleanup (15 racetrack channels + `#results-contribution`) ran every boot, hammering Discord API unnecessarily | Guarded by per-guild store flag `legacyChannelsPurged_<guildId>` — runs once, never again |
| 3 | `core/health.js` | ✅ Done — `repositories/link/member/stateRepository.js`| Health server hard-bound to port 8080 — `EADDRINUSE` silently killed the server leaving `/health` unavailable | Port fallback chain: 8080 → 8081 → 3000 — binds to first available port |
| 4 | `handlers/presenceUpdate.js` | ✅ Done — `links.json` → `db/linksDb.js` (SQLite); 16 links auto-imported| `morningGreetedToday` Set grew unboundedly — previous-day keys never pruned | Daily prune on every PresenceUpdate event — removes keys not matching today's date |
| 5 | `index.js` | ✅ Done — `links.db` `idx_links_viewer`; `migrations.js` runner wired to all DB inits| Only `Partials.Channel` configured — DM events on uncached messages/users silently dropped | Added `Partials.Message` and `Partials.User` |
| 6 | `core/health.js` + `tasks/dataSync.js` | ✅ Done — `db/migrations.js` reusable runner with `_migrations` tracking table| `/health` only reported Discord client status — a broken sync still showed `status: ok` | Exported `syncStatus` from `dataSync.js`; health payload now includes `last_sync_at`, `last_sync_error`, `consecutive_failures` |

---

# Bug Fixes — 2026-05-29

Nine bugs identified via full codebase audit and fixed in one pass.

| # | File | Severity | Root Cause | Fix |
|---|---|---|---|---|
| 1 | `timeline/timeline.js` | ✅ Done| `clearAllMessageRows()` called inside guild loop — guild 1 rows wiped before guild 2 posted | Moved call to before the loop |
| 2 | `db/milestoneDb.js` | ✅ Done — `core/config.js`, `core/log.js`, `core/store.js`, all new files| 1-hour cutoff on legacy migration silently buries real pending milestones after bot outage | Raised threshold to 30 days |
| 3 | `db/attendanceDb.js` | ✅ Done — `repositories/link/member/stateRepository.js`| Attendance INSERT and streak UPDATE were two separate statements — crash between them leaves tables inconsistent | Wrapped both in `db.transaction()` |
| 4 | `core/uma.js` | ✅ Done — `links.json` → `db/linksDb.js` (SQLite); 16 links auto-imported| Parallel cold-start calls all triggered separate `buildSnapshot()` API fetches | Added in-flight promise guard (`buildInFlight` Map) |
| 5 | `tasks/dailyWarnings.js` | ✅ Done — `links.db` `idx_links_viewer`; `migrations.js` runner wired to all DB inits| Daily quota resolved from guild #1 only and applied to all guilds | Quota now resolved per-guild inside the posting loop |
| 6 | `tasks/monthlyWarning.js` | ✅ Done — `db/migrations.js` reusable runner with `_migrations` tracking table| Monthly goal resolved from guild #1 only | Same fix — per-guild quota in posting loop |
| 7 | `handlers/presenceUpdate.js` | ✅ Done — `core/errors.js`: `safeRun()` + `withRetry()` with exponential back-off| DM failure consumed the morning-greeting guard key preventing retry; logged as generic handler error | Local try/catch on `user.send()`; guard key removed on failure; debug-level log |
| 8 | `tasks/chatArchiver.js` | ✅ Done — `core/taskRegistry.js` tracks last run, success, consecutive failures for all 25 tasks| `Promise.all()` for downloads aborts all attachments if one fails | Changed to `Promise.allSettled()` with fulfilled-only filter |
| 9 | `commands/search_trainer.js` | ✅ Done — `/health` exposes task registry stats, heap/RSS memory, active circle count| `expires_at` date parsing had no NaN guard — could render `<t:NaN:R>` to users | Added `isNaN` check with plain-text fallback |

---

# `/set_fans` Command — 2026-05-29

New admin-only command for setting per-circle fan requirements.

## Flow

```
/set_fans
  → circle:  UmaKraft | UmaKraft 2
  → scope:   daily | weekly | monthly
  → amount:  10M | 15M | 20M | ... | 100M | Specified
  → (if Specified) custom_amount: <integer>
```

## Storage Keys (guildConfig)

| Circle | Scope | Key |
|---|---|---|
| UmaKraft (main) | daily | `quotaDaily` |
| UmaKraft (main) | weekly | `quotaWeekly` |
| UmaKraft (main) | monthly | `quotaMonthly` |
| UmaKraft 2 | daily | `quota_c2_Daily` |
| UmaKraft 2 | weekly | `quota_c2_Weekly` |
| UmaKraft 2 | monthly | `quota_c2_Monthly` |

Main-circle keys are identical to `set_quota` keys for full backward compatibility.
Circle 2 keys are checked first by `dailyWarnings` and `monthlyWarning` tasks when processing circle 2 data.

## Behavior

- Selecting UmaKraft 2 before `CIRCLE_2_ID` is set → graceful error card, no changes saved
- Selecting **Specified** without filling in `custom_amount` → error reply, no changes saved
- On success → confirmation image card showing all three scopes for the selected circle

---

# Circle Expansion Roadmap — 3 to 10 Circles (Long-Term)

> **Status:** 🗓️ Planning — Multi-month implementation. No code changes yet.
> **Goal:** Scale the bot from the current 2-circle model to support 3 or more circles, up to a maximum of 10.

---

## Why This Is Non-Trivial

The current 2-circle system works because it was designed with hardcoded assumptions:

| Current Assumption | Problem at 3-10 Circles |
|---|---|
| `CIRCLE_ID` and `CIRCLE_2_ID` as fixed env vars | Can't have `CIRCLE_3_ID` through `CIRCLE_10_ID` as a sane config pattern |
| Commands show fixed dropdown: `UmaKraft` / `UmaKraft 2` | Discord slash command choices must be hardcoded at registration time — can't be dynamic without re-registering |
| Fan quota keys: `quotaDaily`, `quota_c2_Daily` | Pattern breaks at 3+ circles — needs a proper per-circle keying scheme |
| `getConfiguredCircles()` reads 2 env vars | Must be replaced with a dynamic circle registry |
| Health/status shows 2 circles | Needs to scale to show N circles |

---

## Architecture Decision — Circle Registry

The core change needed is replacing hardcoded env var pairs with a **circle registry** — a single source of truth for all configured circles.

**Options under consideration:**

| Option | Description | Tradeoff |
|---|---|---|
| A — SQLite registry table | `circles` table in SQLite: `id`, `name`, `display_name`, `active` | Best for runtime add/remove; requires admin command to register circles |
| B — JSON config file | `data/circles.json`: array of `{ id, name }` objects | Simple, human-editable, gitignored (persists per deployment) |
| C — Extended env vars | `CIRCLES=id1:Name1,id2:Name2,...` single comma-delimited env var | Easy config, no DB needed, less flexible |

**Current leaning:** Option A (SQLite registry) — consistent with the project's all-SQLite persistence rule, and enables future admin commands like `/circle_add` and `/circle_remove` without restarting the bot.

---

## Confirmed Blockers Before Adding Circle 3

> Code-verified on 2026-05-31. These are the exact things that will break or need changing before a third circle can be added.

| # | Issue | File(s) | Confirmed |
|---|---|---|---|
| 1 | Command dropdowns hardcoded to 2 choices | `commands/leaderboard.js`, `fan_gain.js`, `circle_master.js`, `total_fan.js`, `total_circlefan_gain.js` | ✅ Yes — `CIRCLE_CHOICES` is a literal 2-item array in each file |
| 2 | `getConfiguredCircles()` only reads `CIRCLE_ID` + `CIRCLE_2_ID` env vars | `core/config.js` | ✅ Yes — circle 3 has no env var to go in |
| 3 | Inter-circle leaderboard directly references `config.circleId` and `config.circle2Id` | `tasks/interCircleAnnouncements.js` | ✅ Yes — does NOT use `getConfiguredCircles()` like every other task |

---

## What Is Already Safe to Scale

> These parts of the architecture require zero changes to support 3–10 circles.

| Area | Why It Scales |
|---|---|
| All scheduled tasks (milestones, warnings, dataSync, etc.) | Use `Promise.all(getConfiguredCircles().map(...))` — just return more circles |
| DB schemas (`milestoneDb`, `attendanceDb`, `onboardingDb`, etc.) | `circle_id` is already in every primary key |
| State keys | All namespaced per `circleId` — no cross-contamination possible |
| Snapshot cache | Uses `Map<circleId, snapshot>` — scales to N circles |
| dataSync | Already parallel via `Promise.all()` — not sequential |

---

## Secondary Concerns (Not Blockers, But Worth Planning)

| Concern | Detail |
|---|---|
| uma.moe API pressure | At 10 circles, all 10 dataSync calls fire in parallel every 30 min. uma.moe does not publish rate limit docs — monitor for throttling once past 4–5 circles |
| Channel noise | 10 circles posting to one `#announcement` will be noisy. Decide on channel strategy (shared vs. per-circle) before building circle 3 |
| Milestone render volume | Up to 30 milestone image renders per tier per month at 10 circles. Canvas renderer is sequential — will be slow in bursts but won't crash |
| `/set_fans` quota key pattern | Current keys (`quotaDaily`, `quota_c2_Daily`) break at circle 3 — needs a per-circle keying scheme tied to the registry |

---

## Recommended Build Order (When Ready)

> Do these two things first — everything else unlocks automatically.

**Step 1 — Circle Registry**
Replace `getConfiguredCircles()` env var reads with a SQLite `circles` table.
All scheduled tasks already use `getConfiguredCircles()` — they pick up new circles immediately with no further changes.

**Step 2 — Dynamic Command Choices**
Switch the 5 affected command dropdowns from hardcoded `CIRCLE_CHOICES` to autocomplete backed by the registry.
One pattern change propagated to 5 commands — after this, registering a new circle in the DB instantly makes it available in every command.

**Step 3 — Fix Inter-Circle Leaderboard**
Rewrite `tasks/interCircleAnnouncements.js` to loop over `getConfiguredCircles()` instead of hardcoding 2 circles.

After Steps 1–3, adding circle 3 through 10 requires only inserting a row into the `circles` table. No code changes per circle.

---

## Timeline Note

> This is a long-term roadmap. There is no urgency. The 2-circle system is fully stable and production-ready.
> The architecture was intentionally built to make this expansion possible without a rewrite — the foundation is already there.
> Implement at your own pace. Each step above is independently deployable.

---

