# UmaKraft Circle Bot — Role Architecture

This document defines the role of every major directory in the UmaKraft Circle Bot codebase,
the boundaries each directory must respect, the full data pipeline, and a precise inventory
of every file that is affected when the split is carried out.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Directory Roles](#2-directory-roles)
   - [Umamoe](#21-umamoe--raw-data-pipeline)
   - [Refinery](#22-refinery--computed-data-pipeline)
   - [Workshop](#23-workshop--deliverable-manufacturing)
   - [Distribution](#24-distribution--delivery-routing)
   - [Core / DB / Utils / Tasks](#25-core--db--utils--tasks--shim-and-support-layer)
3. [Boundary Rules](#3-boundary-rules)
4. [Affected Code — Full Inventory](#4-affected-code--full-inventory)
   - [Files that move to Refinery](#41-files-that-move-to-refinery)
   - [Files that move to Workshop](#42-files-that-move-to-workshop)
   - [Shims to create or update](#43-shims-to-create-or-update)
   - [New files to create](#44-new-files-to-create)
   - [Files that do not change](#45-files-that-do-not-change)
5. [Implementation Order](#5-implementation-order)

---

## 1. Architecture Overview

```text
uma.moe API
     │
     ▼
┌─────────────────────────────────────────────┐
│  Umamoe/                                    │  RAW DATA
│  Miner → Courier → Inspector → Vault        │
└─────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────┐
│  Refinery/                                  │  COMPUTED DATA
│  Refiner → Compiler → Depot                 │
└─────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────┐
│  Workshop/                                  │  DELIVERABLES
│  Draftsman → Fabricator → Validator →       │
│  Terminal                                   │
└─────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────┐
│  Distribution/                              │  ROUTING
│  Retriever → Dispatcher                     │
└─────────────────────────────────────────────┘
     │
     ▼
Discord (slash commands, scheduled posts, DMs)
```

Each directory communicates only with the one directly above or below it.
No directory may skip a layer.

---

## 2. Directory Roles

### 2.1 `Umamoe/` — Raw Data Pipeline

**One sentence:** Fetches raw data from uma.moe, validates it, and stores it as trusted.

**Departments:**

| Department | File | Responsibility |
|---|---|---|
| Miner | `Miner/miner.js` | HTTP requests to approved uma.moe endpoints only; rate-limiting; exponential backoff retry |
| Courier | `Courier/courier.js` | Transports Miner output to Inspector unchanged; basic transportability checks only |
| Inspector | `Inspector/inspector.js` | Validates structure, completeness, types, and ranges; accepts or rejects; does not modify |
| Vault | `Vault/vault.js` | Stores accepted trusted envelopes; provides retrieval to Refinery only |

**May:**
- Fetch from approved endpoints (`MINER_ENDPOINTS.md`)
- Validate raw API response shape
- Store `{ trustedData, metadata }` envelopes

**Must not:**
- Compute fan gains, trends, rankings, or any derived value
- Render Discord embeds or image cards
- Write to databases outside `Vault/`
- Send anything to Discord

**Current source files:**

```
umamoe/umaClient.js       → Miner (HTTP + rate queue)
umamoe/umaQueue.js        → Miner (rate-limit logic, absorbed into Miner)
umamoe/umaCache.js        → Vault (in-memory adapter, will be replaced by SQLite adapter)
umamoe/uma.js             → Vault barrel (buildSnapshot, getCircleSnapshot, etc.)
umamoe/Vault/vault.js     → Vault interface (drafted)
umamoe/Vault/adapters/    → Vault adapters (in-memory drafted; SQLite to add)
umamoe/Inspector/         → Inspector (drafted)
umamoe/Courier/           → Courier (drafted)
umamoe/Miner/             → Miner (drafted)
umamoe/history/           → Vault-adjacent: historical join-date data store
umamoe/timeline/          → External data pipeline for event timeline (self-contained)
umamoe/trainer/           → Trainer card scrapers + renderers (stays in Umamoe)
umamoe/profileBackfill.js → Historical backfill utility (stays in Umamoe)
umamoe/index.js           → Barrel export (stays in Umamoe)
```

> **Note on `umamoe/umaStats.js`:** This file computes fan gain deltas — that is Refinery
> work. It is currently misplaced inside `umamoe/`. It moves to `Refinery/Refiner/` as
> part of the split. See §4.1.

---

### 2.2 `Refinery/` — Computed Data Pipeline

**One sentence:** Reads trusted data from the Vault, applies business logic and calculations,
assembles finished products, and stores them in the Depot.

**Departments:**

| Department | File | Responsibility |
|---|---|---|
| Refiner | `Refiner/refiner.js` | Domain calculations: fan gain deltas, trends, pace flags, milestone eligibility, achievement checks |
| Compiler | `Compiler/compiler.js` | Assembles multiple `refinedResult` envelopes from the Refiner into a single `compiledProduct` |
| Depot | `Depot/depot.js` | Persists compiled products with `id` and `version`; serves Workshop on request |

**May:**
- Read from `Vault` (read-only; must not write to Vault)
- Compute derived values: daily/weekly/monthly fan gains, velocity, pace, quotas, trends, flags
- Assemble and store compiled products in `Depot`

**Must not:**
- Fetch data from uma.moe directly
- Store raw API payloads
- Render Discord embeds or image cards
- Send anything to Discord

**Current equivalent code in `fantracking/` (to be moved):**

```
fantracking/sync/dataSync.js         → Refinery/Compiler  (orchestrates full sync cycle)
fantracking/sync/circleQueue.js      → Refinery/Compiler  (per-circle queue management)
fantracking/aggregation/index.js     → Refinery/Compiler  (weekly/monthly aggregate assembly)
fantracking/velocity/index.js        → Refinery/Refiner   (rolling 7-day avg + projection)
fantracking/achievements/daily.js    → Refinery/Refiner   (per-trainer achievement flags)
fantracking/milestone/eval.js        → Refinery/Refiner   (milestone tier eligibility)
fantracking/milestone/milestones.js  → Refinery/Refiner   (milestone orchestration)
fantracking/milestone/tiers.js       → Refinery/Refiner   (tier configuration)
fantracking/milestone/winners.js     → Refinery/Refiner   (top-3 winner selection)
fantracking/milestone/cleanup.js     → Refinery/Refiner   (expired milestone cleanup)
fantracking/warnings/engine.js       → Refinery/Refiner   (pace/quota escalation logic)
fantracking/warnings/daily.js        → Refinery/Refiner   (daily warning checks)
fantracking/warnings/weekly.js       → Refinery/Refiner   (weekly warning checks)
fantracking/warnings/monthly.js      → Refinery/Refiner   (monthly warning checks)
fantracking/leaderboard/interCircle.js → Refinery/Refiner (inter-circle ranking logic)
fantracking/leaderboard/snapshotDb.js  → Refinery/Depot   (leaderboard snapshot persistence)
fantracking/achievements/db.js       → Refinery/Depot     (achievement record persistence)
fantracking/milestone/db.js          → Refinery/Depot     (milestone record persistence)
fantracking/warnings/db.js           → Refinery/Depot     (warning state persistence)
fantracking/links/db.js              → Refinery/Depot     (trainer ↔ Discord identity store)
fantracking/links/repository.js      → Refinery/Depot     (links data access layer)
umamoe/umaStats.js                   → Refinery/Refiner   (fan delta computation — MISPLACED)
```

---

### 2.3 `Workshop/` — Deliverable Manufacturing

**One sentence:** Retrieves compiled products from the Depot, manufactures user-facing Discord
deliverables following per-command blueprints, validates them, and hands them to Distribution.

**Departments:**

| Department | File | Responsibility |
|---|---|---|
| Draftsman | `Draftsman/draftsman.js` + `Blueprint/*.md` | Defines and manages the specification (layout, fields, visual rules) for each deliverable type |
| Fabricator | `Fabricator/fabricator.js` | Constructs the deliverable (Discord embed + image card) from a blueprint and compiled product |
| Validator | `Validator/validator.js` | Checks the deliverable against its blueprint spec; approves or rejects before release |
| Terminal | `Terminal/terminal.js` | Immutable staging area for approved deliverables awaiting Distribution pickup |

**May:**
- Read compiled products from `Depot`
- Render Discord embeds and image report cards
- Validate deliverable shape against blueprint specs
- Hold approved deliverables in Terminal

**Must not:**
- Compute fan gains or any business logic
- Write to Vault or Depot
- Send deliverables directly to Discord (that is Distribution's job)
- Modify a deliverable after it has been approved and placed in Terminal

**Current equivalent code in `fantracking/` and `utils/` (to be moved):**

```
fantracking/reports/fanGain.js          → Workshop/Fabricator  (fan gain card renderer)
fantracking/reports/leaderboard.js      → Workshop/Fabricator  (leaderboard card renderer)
fantracking/reports/circleMaster.js     → Workshop/Fabricator  (circle master card renderer)
fantracking/reports/dailyFanWarning.js  → Workshop/Fabricator  (daily warning card renderer)
fantracking/reports/dailyAchievement.js → Workshop/Fabricator  (achievement card renderer)
fantracking/reports/milestone.js        → Workshop/Fabricator  (milestone card renderer)
fantracking/reports/fanDeficit.js       → Workshop/Fabricator  (fan deficit card renderer)
fantracking/reports/warnings.js         → Workshop/Fabricator  (warning summary renderer)
fantracking/reports/warningCard.js      → Workshop/Fabricator  (warning card renderer)
fantracking/reports/greeting.js         → Workshop/Fabricator  (greeting card renderer)
fantracking/reports/help.js             → Workshop/Fabricator  (help card renderer)
fantracking/reports/joindate.js         → Workshop/Fabricator  (join date card renderer)
fantracking/reports/profile.js          → Workshop/Fabricator  (profile card renderer)
fantracking/reports/store.js            → Workshop/Fabricator  (store card renderer)
fantracking/reports/timeline.js         → Workshop/Fabricator  (timeline card renderer)
fantracking/reports/linkList.js         → Workshop/Fabricator  (link list card renderer)
fantracking/reports/ImageReportStandard.js → Workshop/Fabricator (shared base renderer + styling)
fantracking/leaderboard/announcements.js   → Workshop/Fabricator (leaderboard assembly + DM)
fantracking/milestone/notifier.js          → Workshop/Fabricator (milestone card build + DM compose)
fantracking/warnings/imageReport.js        → Workshop/Fabricator (warning image report build)
fantracking/warnings/fanDeficitApi.js      → Workshop/Terminal   (fan deficit product endpoint)
```

**New files this directory requires (do not exist yet):**

```
Workshop/Draftsman/Blueprint/fan_gain.md       ← already in reference ✅
Workshop/Draftsman/Blueprint/profile.md        ← already in reference ✅
Workshop/Draftsman/Blueprint/circle.md         ← already in reference ✅
Workshop/Draftsman/Blueprint/set_fans.md       ← already in reference ✅
Workshop/Draftsman/Blueprint/link.md           ← already in reference ✅
Workshop/Draftsman/Blueprint/leaderboard.md    ← to create
Workshop/Draftsman/Blueprint/milestone.md      ← to create
Workshop/Draftsman/Blueprint/warning.md        ← to create
Workshop/Draftsman/Blueprint/greeting.md       ← to create
Workshop/Draftsman/Blueprint/help.md           ← to create
Workshop/Validator/validator.js                ← to implement (currently no validation step)
Workshop/Terminal/terminal.js                  ← to implement (currently no staging layer)
```

---

### 2.4 `Distribution/` — Delivery Routing

**One sentence:** Retrieves approved deliverables from the Terminal and routes them to the
correct Discord destination (channel post, DM, or slash command reply).

**Departments (to be defined):**

| Department | Responsibility |
|---|---|
| Retriever | Pulls approved deliverables from Workshop/Terminal |
| Dispatcher | Routes the deliverable to the correct Discord channel, user DM, or command reply |

**Currently handled by** (spread across multiple layers, to be consolidated):

```
commands/*.js       → receive slash commands, request deliverable, send reply
handlers/*.js       → handle Discord events, trigger and send deliverables
tasks/index.js      → schedule automated deliveries (cron)
tasks/dailyFanWarning.js, leaderboardAnnouncements.js, etc. → send to Discord
utils/dm.js         → DM delivery wrapper (stays; used by Dispatcher)
utils/updateLog.js  → log channel posting (stays; used by Dispatcher)
utils/autoDelete.js → auto-delete ephemeral messages (stays; used by Dispatcher)
```

> **Distribution is not yet a formal directory.** In the current codebase its role is
> carried out by `commands/`, `handlers/`, and `tasks/`. Formalizing it into a
> `Distribution/` directory is a later-stage task after Refinery and Workshop are stable.

---

### 2.5 `core/` / `db/` / `utils/` / `tasks/` — Shim and Support Layer

These directories currently hold two kinds of files:

**1. Shims** — thin re-export files that point to the real implementation in `umamoe/` or
`fantracking/`. They exist so existing `import` paths keep working across the codebase
without a mass-rewrite. Every shim contains only one line of substance:
`export * from '../<real-location>';`

**2. Genuine support utilities** — files that don't belong to any pipeline stage and are
used across multiple stages. These stay in place permanently.

| File | Type | Stays or moves? |
|---|---|---|
| `core/config.js` | Support | Stays permanently |
| `core/log.js` | Support | Stays permanently |
| `core/store.js` | Support | Stays permanently |
| `core/format.js` | Support | Stays permanently |
| `core/errors.js` | Support | Stays permanently |
| `core/channels.js` | Support | Stays permanently (used by Distribution) |
| `core/busyLock.js` | Support | Stays permanently |
| `core/quotaKeys.js` | Support | Stays permanently |
| `core/taskRegistry.js` | Support | Stays permanently |
| `core/health.js` | Support | Stays permanently |
| `core/uma.js` | Shim → `umamoe/uma.js` | Stays as shim |
| `core/umaClient.js` | Shim → `umamoe/umaClient.js` | Stays as shim |
| `core/umaCache.js` | Shim → `umamoe/umaCache.js` | Stays as shim |
| `core/umaQueue.js` | Shim → `umamoe/umaQueue.js` | Stays as shim |
| `core/umaStats.js` | Shim → `umamoe/umaStats.js` | Becomes shim → `Refinery/Refiner/` after move |
| `core/milestoneEval.js` | Shim → `fantracking/milestone/eval.js` | Becomes shim → `Refinery/Refiner/` after move |
| `core/milestoneImages.js` | Shim → `fantracking/milestone/images.js` | Stays (images stays in fantracking for now) |
| `core/fanDeficitApi.js` | Shim → `fantracking/warnings/fanDeficitApi.js` | Becomes shim → `Workshop/Terminal/` after move |
| `db/linksDb.js` | Shim → `fantracking/links/db.js` | Becomes shim → `Refinery/Depot/` after move |
| `db/achievementDb.js` | Shim → `fantracking/achievements/db.js` | Becomes shim → `Refinery/Depot/` after move |
| `db/milestoneDb.js` | Shim → `fantracking/milestone/db.js` | Becomes shim → `Refinery/Depot/` after move |
| `db/warningDb.js` | Shim → `fantracking/warnings/db.js` | Becomes shim → `Refinery/Depot/` after move |
| `db/attendanceDb.js` | Shim → `fantracking/attendance/db.js` | Stays (attendance is independent) |
| `db/leaderboardSnapshotDb.js` | Shim → `fantracking/leaderboard/snapshotDb.js` | Becomes shim → `Refinery/Depot/` after move |
| `utils/milestoneNotifier.js` | Shim → `fantracking/milestone/notifier.js` | Becomes shim → `Workshop/Fabricator/` after move |
| `utils/reports/*.js` | Shims → `fantracking/reports/*.js` | Become shims → `Workshop/Fabricator/` after move |
| `utils/pastHistoryReader.js` | Shim → `umamoe/history/` | Stays as shim |
| `utils/generatePastHistoryMd.js` | Shim → `umamoe/history/` | Stays as shim |
| `utils/profileBackfill.js` | Shim → `umamoe/profileBackfill.js` | Stays as shim |
| `utils/resumeCard.js` | Shim → `umamoe/trainer/resumeCard.js` | Stays as shim |
| `utils/skillScraper.js` | Shim → `umamoe/trainer/skillScraper.js` | Stays as shim |
| `utils/dm.js` | Support | Stays permanently (Distribution uses it) |
| `utils/updateLog.js` | Support | Stays permanently |
| `utils/autoDelete.js` | Support | Stays permanently |
| `utils/imageReport.js` | Support | Stays permanently (Playwright render engine) |
| `tasks/*.js` shims | Shims → `fantracking/` | Update shim target after move |
| `tasks/index.js` | Distribution scheduler | Stays (future: becomes Distribution entry) |

---

## 3. Boundary Rules

These rules are absolute. If any code violates a boundary, the split has not been done correctly.

```
┌─────────────────────────────────────────────────────────────────┐
│  Umamoe    │ MAY NOT compute gains, render cards, or post to Discord │
│  Refinery  │ MAY NOT fetch from uma.moe, render cards, or post to Discord │
│  Workshop  │ MAY NOT fetch from uma.moe, compute derived values, or post to Discord │
│  Distribution │ MAY NOT compute, render, or manufacture anything │
└─────────────────────────────────────────────────────────────────┘
```

**Data flows in one direction only:**

```
Umamoe → Refinery → Workshop → Distribution → Discord
```

No directory may import from a directory downstream of itself.

---

## 4. Affected Code — Full Inventory

### 4.1 Files that move to `Refinery/`

These files physically relocate. Their `import` paths inside them change.
Existing shims in `core/`, `db/`, and `tasks/` update their target path.

| Current path | Target path in Refinery | Department |
|---|---|---|
| `umamoe/umaStats.js` | `Refinery/Refiner/umaStats.js` | Refiner |
| `fantracking/velocity/index.js` | `Refinery/Refiner/velocity.js` | Refiner |
| `fantracking/achievements/daily.js` | `Refinery/Refiner/achievements.js` | Refiner |
| `fantracking/milestone/eval.js` | `Refinery/Refiner/milestoneEval.js` | Refiner |
| `fantracking/milestone/milestones.js` | `Refinery/Refiner/milestones.js` | Refiner |
| `fantracking/milestone/tiers.js` | `Refinery/Refiner/milestoneTiers.js` | Refiner |
| `fantracking/milestone/winners.js` | `Refinery/Refiner/milestoneWinners.js` | Refiner |
| `fantracking/milestone/cleanup.js` | `Refinery/Refiner/milestoneCleanup.js` | Refiner |
| `fantracking/warnings/engine.js` | `Refinery/Refiner/warningEngine.js` | Refiner |
| `fantracking/warnings/daily.js` | `Refinery/Refiner/warningDaily.js` | Refiner |
| `fantracking/warnings/weekly.js` | `Refinery/Refiner/warningWeekly.js` | Refiner |
| `fantracking/warnings/monthly.js` | `Refinery/Refiner/warningMonthly.js` | Refiner |
| `fantracking/leaderboard/interCircle.js` | `Refinery/Refiner/interCircle.js` | Refiner |
| `fantracking/sync/dataSync.js` | `Refinery/Compiler/dataSync.js` | Compiler |
| `fantracking/sync/circleQueue.js` | `Refinery/Compiler/circleQueue.js` | Compiler |
| `fantracking/aggregation/index.js` | `Refinery/Compiler/aggregation.js` | Compiler |
| `fantracking/leaderboard/snapshotDb.js` | `Refinery/Depot/leaderboardSnapshotDb.js` | Depot |
| `fantracking/achievements/db.js` | `Refinery/Depot/achievementDb.js` | Depot |
| `fantracking/milestone/db.js` | `Refinery/Depot/milestoneDb.js` | Depot |
| `fantracking/warnings/db.js` | `Refinery/Depot/warningDb.js` | Depot |
| `fantracking/links/db.js` | `Refinery/Depot/linksDb.js` | Depot |
| `fantracking/links/repository.js` | `Refinery/Depot/linksRepository.js` | Depot |

---

### 4.2 Files that move to `Workshop/`

| Current path | Target path in Workshop | Department |
|---|---|---|
| `fantracking/reports/ImageReportStandard.js` | `Workshop/Fabricator/ImageReportStandard.js` | Fabricator |
| `fantracking/reports/fanGain.js` | `Workshop/Fabricator/reports/fanGain.js` | Fabricator |
| `fantracking/reports/leaderboard.js` | `Workshop/Fabricator/reports/leaderboard.js` | Fabricator |
| `fantracking/reports/circleMaster.js` | `Workshop/Fabricator/reports/circleMaster.js` | Fabricator |
| `fantracking/reports/dailyFanWarning.js` | `Workshop/Fabricator/reports/dailyFanWarning.js` | Fabricator |
| `fantracking/reports/dailyAchievement.js` | `Workshop/Fabricator/reports/dailyAchievement.js` | Fabricator |
| `fantracking/reports/milestone.js` | `Workshop/Fabricator/reports/milestone.js` | Fabricator |
| `fantracking/reports/fanDeficit.js` | `Workshop/Fabricator/reports/fanDeficit.js` | Fabricator |
| `fantracking/reports/warnings.js` | `Workshop/Fabricator/reports/warnings.js` | Fabricator |
| `fantracking/reports/warningCard.js` | `Workshop/Fabricator/reports/warningCard.js` | Fabricator |
| `fantracking/reports/greeting.js` | `Workshop/Fabricator/reports/greeting.js` | Fabricator |
| `fantracking/reports/help.js` | `Workshop/Fabricator/reports/help.js` | Fabricator |
| `fantracking/reports/joindate.js` | `Workshop/Fabricator/reports/joindate.js` | Fabricator |
| `fantracking/reports/profile.js` | `Workshop/Fabricator/reports/profile.js` | Fabricator |
| `fantracking/reports/store.js` | `Workshop/Fabricator/reports/store.js` | Fabricator |
| `fantracking/reports/timeline.js` | `Workshop/Fabricator/reports/timeline.js` | Fabricator |
| `fantracking/reports/linkList.js` | `Workshop/Fabricator/reports/linkList.js` | Fabricator |
| `fantracking/leaderboard/announcements.js` | `Workshop/Fabricator/leaderboardAnnouncements.js` | Fabricator |
| `fantracking/milestone/notifier.js` | `Workshop/Fabricator/milestoneNotifier.js` | Fabricator |
| `fantracking/warnings/imageReport.js` | `Workshop/Fabricator/warningImageReport.js` | Fabricator |
| `fantracking/warnings/fanDeficitApi.js` | `Workshop/Terminal/fanDeficitApi.js` | Terminal |

---

### 4.3 Shims to create or update

After the physical moves above, every shim that currently points to `fantracking/`
must be updated to point to the new location. No command, handler, or task import path changes.

**Shims in `core/` — update target:**

| File | Current target | New target |
|---|---|---|
| `core/umaStats.js` | `umamoe/umaStats.js` | `Refinery/Refiner/umaStats.js` |
| `core/milestoneEval.js` | `fantracking/milestone/eval.js` | `Refinery/Refiner/milestoneEval.js` |
| `core/fanDeficitApi.js` | `fantracking/warnings/fanDeficitApi.js` | `Workshop/Terminal/fanDeficitApi.js` |

**Shims in `db/` — update target:**

| File | Current target | New target |
|---|---|---|
| `db/linksDb.js` | `fantracking/links/db.js` | `Refinery/Depot/linksDb.js` |
| `db/achievementDb.js` | `fantracking/achievements/db.js` | `Refinery/Depot/achievementDb.js` |
| `db/milestoneDb.js` | `fantracking/milestone/db.js` | `Refinery/Depot/milestoneDb.js` |
| `db/warningDb.js` | `fantracking/warnings/db.js` | `Refinery/Depot/warningDb.js` |
| `db/leaderboardSnapshotDb.js` | `fantracking/leaderboard/snapshotDb.js` | `Refinery/Depot/leaderboardSnapshotDb.js` |

**Shims in `tasks/` — update target:**

| File | Current target | New target |
|---|---|---|
| `tasks/dataSync.js` | `fantracking/sync/dataSync.js` | `Refinery/Compiler/dataSync.js` |
| `tasks/warningEngine.js` | `fantracking/warnings/engine.js` | `Refinery/Refiner/warningEngine.js` |
| `tasks/dailyFanWarning.js` | `fantracking/warnings/daily.js` | `Refinery/Refiner/warningDaily.js` |
| `tasks/monthlyWarning.js` | `fantracking/warnings/monthly.js` | `Refinery/Refiner/warningMonthly.js` |
| `tasks/weeklyWarning.js` | `fantracking/warnings/weekly.js` | `Refinery/Refiner/warningWeekly.js` |
| `tasks/milestones.js` | `fantracking/milestone/milestones.js` | `Refinery/Refiner/milestones.js` |
| `tasks/milestone-tiers.js` | `fantracking/milestone/tiers.js` | `Refinery/Refiner/milestoneTiers.js` |
| `tasks/milestoneCleanup.js` | `fantracking/milestone/cleanup.js` | `Refinery/Refiner/milestoneCleanup.js` |
| `tasks/milestoneWinners.js` | `fantracking/milestone/winners.js` | `Refinery/Refiner/milestoneWinners.js` |
| `tasks/dailyAchievement.js` | `fantracking/achievements/daily.js` | `Refinery/Refiner/achievements.js` |
| `tasks/leaderboardAnnouncements.js` | `fantracking/leaderboard/announcements.js` | `Workshop/Fabricator/leaderboardAnnouncements.js` |
| `tasks/interCircleAnnouncements.js` | `fantracking/leaderboard/interCircle.js` | `Refinery/Refiner/interCircle.js` |
| `tasks/fanDeficitImageReport.js` | `fantracking/warnings/imageReport.js` | `Workshop/Fabricator/warningImageReport.js` |

**Shims in `utils/reports/` — update target:**

All 16 files in `utils/reports/` update their re-export target from
`fantracking/reports/<file>` to `Workshop/Fabricator/reports/<file>`.

**New shim to create in `utils/`:**

| New shim | Points to |
|---|---|
| `utils/milestoneNotifier.js` | `Workshop/Fabricator/milestoneNotifier.js` |

---

### 4.4 New files to create

**Refinery spec docs (documentation only, no code):**

```
Refinery/README.md                        ← already in reference ✅
Refinery/Overview.md                      ← already in reference ✅
Refinery/Refiner/Refiner.md               ← already in reference ✅
Refinery/Compiler/Compiler.md             ← already in reference ✅
Refinery/Depot/Depot.md                   ← already in reference ✅
```

**Refinery implementation files (to implement):**

```
Refinery/Refiner/refiner.js               ← orchestrates Refiner department (drafted in reference)
Refinery/Compiler/compiler.js             ← assembles compiled products (drafted in reference)
Refinery/Depot/depot.js                   ← Depot interface (drafted in reference)
Refinery/Depot/adapters/sqlite.js         ← SQLite persistence for compiled products
Refinery/Depot/adapters/inmemory.js       ← in-memory adapter for tests
Refinery/tests/refiner.test.js            ← already in reference ✅
Refinery/tests/vault.test.js              ← already in reference ✅
```

**Workshop spec docs (from reference, already defined):**

```
Workshop/Workshop.md                      ← already in reference ✅
Workshop/README.md                        ← already in reference ✅
Workshop/Draftsman/Draftsman.md           ← already in reference ✅
Workshop/Draftsman/Blueprint/blueprint.md ← already in reference ✅
Workshop/Draftsman/Blueprint/fan_gain.md  ← already in reference ✅
Workshop/Draftsman/Blueprint/profile.md   ← already in reference ✅
Workshop/Draftsman/Blueprint/circle.md    ← already in reference ✅
Workshop/Draftsman/Blueprint/set_fans.md  ← already in reference ✅
Workshop/Draftsman/Blueprint/link.md      ← already in reference ✅
Workshop/Fabricator/Fabricator.md         ← already in reference ✅
Workshop/Terminal/Terminal.md             ← already in reference ✅
Workshop/Validator/Validator.md           ← already in reference ✅
```

**Workshop blueprint docs (to create — one per command deliverable):**

```
Workshop/Draftsman/Blueprint/leaderboard.md
Workshop/Draftsman/Blueprint/milestone.md
Workshop/Draftsman/Blueprint/warning.md
Workshop/Draftsman/Blueprint/greeting.md
Workshop/Draftsman/Blueprint/help.md
Workshop/Draftsman/Blueprint/total_fan.md
Workshop/Draftsman/Blueprint/circle_master.md
Workshop/Draftsman/Blueprint/joindate.md
Workshop/Draftsman/Blueprint/store.md
Workshop/Draftsman/Blueprint/timeline.md
```

**Workshop implementation files (to implement):**

```
Workshop/Draftsman/draftsman.js           ← already in reference ✅
Workshop/Draftsman/Blueprint/blueprints.js ← already in reference ✅
Workshop/Fabricator/fabricator.js         ← already in reference ✅
Workshop/Validator/validator.js           ← to implement
Workshop/Terminal/terminal.js             ← already in reference ✅
```

---

### 4.5 Files that do not change

These files are unaffected by the split. No path changes, no content changes.

**Umamoe (all stay):**
```
umamoe/uma.js, umaClient.js, umaCache.js, umaQueue.js, index.js
umamoe/history/*, umamoe/timeline/*, umamoe/trainer/*
umamoe/profileBackfill.js
umamoe/Miner/*, umamoe/Courier/*, umamoe/Inspector/*, umamoe/Vault/*
```

**Core support utilities (permanent):**
```
core/config.js, core/log.js, core/store.js, core/format.js
core/errors.js, core/channels.js, core/busyLock.js
core/quotaKeys.js, core/taskRegistry.js, core/health.js
core/tally.js, core/tokenLoader.js
```

**Core shims for Umamoe (no change to target):**
```
core/uma.js, core/umaClient.js, core/umaCache.js, core/umaQueue.js
```

**DB layer (stays or updates target only, no logic change):**
```
db/migrations.js, db/storeDb.js, db/trainerColorDb.js
db/trainerDb.js, db/onboardingDb.js, db/attendanceDb.js
db/imageArchiveDb.js, db/circleDb.js, db/profileSyncDb.js
db/stadiumDb.js
```

**Utils support (permanent):**
```
utils/dm.js, utils/updateLog.js, utils/autoDelete.js
utils/imageReport.js, utils/imageClassifier.js, utils/imageReport-browser.js
utils/activityLog.js, utils/changelog.js, utils/characterData.js
utils/cardCache.js
```

**Utils shims for Umamoe (no change to target):**
```
utils/pastHistoryReader.js, utils/generatePastHistoryMd.js
utils/profileBackfill.js, utils/resumeCard.js, utils/skillScraper.js
```

**Commands, handlers, onboarding — none change:**
```
commands/*.js   (all 27 commands)
handlers/*.js   (all event handlers)
onboarding/*.js
```

**Tasks that stay as-is (not shims, not moved):**
```
tasks/attendanceCheck.js, tasks/chatArchiver.js, tasks/dailyGreetingReport.js
tasks/historicalSync.js, tasks/imageArchive.js, tasks/memberArchive.js
tasks/messageCleanup.js, tasks/monthlyHistoryExport.js, tasks/nameLinker.js
tasks/offlineCheck.js, tasks/onboardingReminder.js, tasks/purgeAnnouncement.js
tasks/sqliteBackup.js, tasks/stadiumSync.js, tasks/startupMigrations.js
tasks/tallyResults.js, tasks/timezoneNotice.js, tasks/updateGameData.js
tasks/weeklyAnnouncement.js, tasks/index.js
```

**fantracking/ files that stay in fantracking for now (independent subsystems):**
```
fantracking/attendance/check.js   (attendance tracking — not fan-gain domain)
fantracking/attendance/db.js
```

---

## 5. Implementation Order

Each task is isolated. The bot must remain fully operational after every step.

| Task | Action | Risk |
|---|---|---|
| **19** | Copy Refinery and Workshop spec docs from reference into repo | None — docs only |
| **20** | Move Refinery/Refiner files; update shims in `core/`, `tasks/` | Low — shim pattern proven |
| **21** | Move Refinery/Compiler files; update shims in `tasks/` | Low |
| **22** | Move Refinery/Depot files; update shims in `db/` | Low |
| **23** | Move Workshop/Fabricator files; update shims in `utils/reports/`, `tasks/` | Low |
| **24** | Move Workshop/Terminal file; update shim in `core/` | Low |
| **25** | Implement `Refinery/Refiner/refiner.js` orchestrator | Medium |
| **26** | Implement `Refinery/Compiler/compiler.js` orchestrator | Medium |
| **27** | Implement `Refinery/Depot/depot.js` + SQLite adapter | Medium |
| **28** | Implement `Workshop/Validator/validator.js` | Medium |
| **29** | Wire `fantracking/sync/dataSync.js` to use Refinery pipeline | High — core sync path |
| **30** | Define remaining Workshop blueprints (one per command) | None — docs only |
| **31** | Formalize `Distribution/` directory | Medium |

After task 24, `fantracking/` becomes empty or contains only `fantracking/attendance/`.
It can be retired at that point.
