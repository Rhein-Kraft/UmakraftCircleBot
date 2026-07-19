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
   - [Broadcast](#24-broadcast--event-notification-pipeline)
   - [Distribution](#25-distribution--command-response-routing)
   - [Core / DB / Utils / Tasks](#26-core--db--utils--tasks--shim-and-support-layer)
3. [Boundary Rules](#3-boundary-rules)
4. [Affected Code — Full Inventory](#4-affected-code--full-inventory)
   - [Files that move to Refinery](#41-files-that-move-to-refinery)
   - [Files that move to Workshop](#42-files-that-move-to-workshop)
   - [Files that move to Broadcast](#43-files-that-move-to-broadcast)
   - [Shims to create or update](#44-shims-to-create-or-update)
   - [New files to create](#45-new-files-to-create)
   - [Files that do not change](#46-files-that-do-not-change)
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
     ├─────────────────────────────────────────────────────┐
     │                                                     │
     ▼                                                     ▼
┌─────────────────────────────────────────────┐  ┌──────────────────────────────────────────┐
│  Workshop/                                  │  │  Broadcast/                              │
│  Draftsman → Fabricator → Validator →       │  │  Broker → Inspector → Archive →          │
│  Terminal                                   │  │  Announcer                               │
└─────────────────────────────────────────────┘  └──────────────────────────────────────────┘
     │                                                     │
     ▼                                                     │
┌─────────────────────────────────────────────┐           │
│  Distribution/                              │           │
│  Retriever → Dispatcher                     │           │
└─────────────────────────────────────────────┘           │
     │                                                     │
     └─────────────────────┬───────────────────────────────┘
                           ▼
                Discord (slash replies, channel posts, DMs)
```

**Two separate output paths from Refinery/Depot:**

- **Workshop → Distribution** — the **pull** path. A user runs a slash command,
  the system manufactures a deliverable on demand and sends the reply.
- **Broadcast** — the **push** path. A cron schedule fires or a data threshold is
  crossed; the system evaluates who qualifies, claims the notification in the
  database, renders the content, and delivers it automatically without any user request.

These two paths are completely independent. They never call each other.

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
| Depot | `Depot/depot.js` | Persists compiled products with `id` and `version`; serves Workshop and Broadcast on request |

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
fantracking/leaderboard/snapshotDb.js  → Refinery/Depot   (leaderboard snapshot persistence)
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

> **Fabricator vs Broadcast/Announcer:** Fabricator renders the visual product — it builds the
> Discord embed structure and generates the image card buffer. Broadcast/Announcer is what
> delivers that rendered product to Discord with dedup and retry tracking. Files that
> currently do both (e.g. `milestone/notifier.js`, `leaderboard/announcements.js`) will be
> split: the render logic goes to Fabricator, the delivery logic goes to Announcer.

**Current equivalent code (to be moved):**

```
fantracking/reports/ImageReportStandard.js  → Workshop/Fabricator (shared base renderer)
fantracking/reports/fanGain.js              → Workshop/Fabricator/reports/
fantracking/reports/leaderboard.js          → Workshop/Fabricator/reports/
fantracking/reports/circleMaster.js         → Workshop/Fabricator/reports/
fantracking/reports/dailyFanWarning.js      → Workshop/Fabricator/reports/
fantracking/reports/dailyAchievement.js     → Workshop/Fabricator/reports/
fantracking/reports/milestone.js            → Workshop/Fabricator/reports/
fantracking/reports/fanDeficit.js           → Workshop/Fabricator/reports/
fantracking/reports/warnings.js             → Workshop/Fabricator/reports/
fantracking/reports/warningCard.js          → Workshop/Fabricator/reports/
fantracking/reports/greeting.js             → Workshop/Fabricator/reports/
fantracking/reports/help.js                 → Workshop/Fabricator/reports/
fantracking/reports/joindate.js             → Workshop/Fabricator/reports/
fantracking/reports/profile.js              → Workshop/Fabricator/reports/
fantracking/reports/store.js                → Workshop/Fabricator/reports/
fantracking/reports/timeline.js             → Workshop/Fabricator/reports/
fantracking/reports/linkList.js             → Workshop/Fabricator/reports/

  ─ Render-only parts of these files move to Fabricator; send parts move to Announcer ─
fantracking/leaderboard/announcements.js    → render → Fabricator / send → Announcer
fantracking/milestone/notifier.js           → render → Fabricator / send → Announcer
fantracking/warnings/imageReport.js         → render → Fabricator / send → Announcer
fantracking/warnings/fanDeficitApi.js       → Workshop/Terminal (fan deficit endpoint)
```

**New files this directory requires (do not exist yet):**

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
Workshop/Validator/validator.js             ← to implement
```

---

### 2.4 `Broadcast/` — Event Notification Pipeline

**One sentence:** Broker fetches raw data from Refinery and hands it to Inspector;
Inspector validates eligibility and — if approved — writes the full notification record
to Archive; Announcer reads from Archive and delivers to Discord with per-step
dedup and restart-safe retry.

**Why Broadcast is separate from Workshop:** Workshop is a pull model — it manufactures a
deliverable in response to a user command. Broadcast is a push model — it fires automatically
on a cron schedule or data threshold without any user request. The two models have
incompatible triggers, incompatible recipients (one vs many), incompatible dedup requirements,
and incompatible retry patterns. Forcing push notifications through Workshop would break
every department's single-responsibility rule.

**Departments:**

| Department | File | Responsibility |
|---|---|---|
| Broker | `Broker/broker.js` | Triggered by cron or threshold event; **fetches raw compiled data from Refinery/Depot** and hands it to Inspector as raw input; manages per-circle queue; on restart reads Archive for incomplete records and routes them to Announcer |
| Inspector | `Inspector/inspector.js` | Receives raw data from Broker; runs eligibility check, dedup check, recipient resolution, and variant selection; **if approved: writes the full notification record to Archive** (sole writer); signals Announcer with the `notificationKey`; if rejected: drops cleanly, nothing written |
| Archive | `Archive/archive.js` | **Pure storage.** Holds notification records and delivery state. Written by Inspector (new records) and Announcer (flag updates + history). Read by Announcer (delivery plan) and Broker (incomplete records on restart). Contains no pipeline logic. |
| Announcer | `Announcer/announcer.js` | **Reads the full notification record from Archive** by `notificationKey`; renders image card via Workshop/Fabricator; posts to channel; sends member DMs; sends leader DM; updates each delivery flag in Archive on success; on failure leaves flag at 0 for next Broker retry run |

**Data flow:**

```
Refinery/Depot
     │  ← Broker fetches raw compiled data
     ▼
  Broker       triggered by cron / threshold event
     │  raw data envelope
     ▼
  Inspector    eligibility · dedup · recipients · variant
     │  reject → drop (nothing written)
     │  approve ↓
     ▼
  Archive      pure storage — Inspector writes; Announcer reads + updates flags
     │  ← Announcer reads notificationKey
     ▼
  Announcer    render card → post channel → send DMs → update Archive flags
     │
     ▼
Discord (channel posts, member DMs, leader DMs)

  ── restart recovery ──
  Broker reads Archive.getIncomplete() → Announcer (skip Inspector)
```

**Writer / reader contract for Archive:**

| Operation | Caller |
|---|---|
| `INSERT` new record | Inspector only |
| `UPDATE` delivery flags | Announcer only |
| `INSERT` history row | Announcer only |
| `SELECT` incomplete records | Broker only (restart recovery) |
| `SELECT` record by key | Announcer only |

**May:**
- Broker: read from Refinery/Depot (data fetch only)
- Inspector: write to Archive (new records only)
- Announcer: call Workshop/Fabricator for renders; send to Discord; update Archive flags

**Must not:**
- Compute fan gains or business logic (that is Refinery's job)
- Perform raw API fetches from uma.moe (that is Umamoe's job)
- Respond to slash commands (that is Distribution's job)
- Modify a delivered notification after it has been confirmed in Archive

**Notification types handled by Broadcast:**

| Notification | Trigger | Recipients |
|---|---|---|
| Daily greeting | 07:00 JST cron | Channel post + per-member DM in their local timezone |
| Noon / night / midnight messages | Hourly cron, per-member timezone check | Member DM only |
| Offline check | Daily cron, days-since-last-online check | Member DM (escalating 1/2/3+ day variants) |
| Daily fan warning | 23:45 JST (after tally), fan goal missed | Channel post + all linked member DMs |
| Daily achievement tier | Hourly, total fans crosses threshold | Channel post + all linked member DMs |
| Weekly fan warning | End of week, weekly goal missed | Channel post + member DMs |
| Monthly fan warning | End of month, monthly goal missed | Channel post + member DMs |
| Milestone | Monthly, per-trainer fan count tier crossed | Channel post + trainer DM + leader DM |
| Leaderboard announcement | Daily/weekly tally complete | Channel post + top-3 DMs |
| Fan deficit image report | Daily tally check | Channel post |
| Inter-circle leaderboard | Weekly | Channel post |

**Current code that moves to Broadcast:**

```
  ─ Broker ─
fantracking/milestone/milestones.js      → Broker (orchestration entry + boot guard)
fantracking/achievements/daily.js        → Broker (cron trigger + achievement loop)
tasks/dailyGreetingReport.js             → Broker (time check + channel greeting)
tasks/dailyMessages.js                   → Broker (per-timezone hour check + DM loop)
tasks/offlineCheck.js                    → Broker (days-offline trigger + DM)
tasks/weeklyAnnouncement.js              → Broker (weekly tally event)
tasks/interCircleAnnouncements.js        → Broker (inter-circle trigger)

  ─ Inspector ─
fantracking/milestone/eval.js            → Inspector (meetsThreshold eligibility)
fantracking/milestone/tiers.js           → Inspector (tier config + variant pool)
fantracking/milestone/winners.js         → Inspector (top-3 recipient resolution)
fantracking/milestone/cleanup.js         → Inspector / Archive (pruning expired records)
fantracking/warnings/engine.js           → Inspector (pace calc, level escalation, grace period)
fantracking/warnings/daily.js            → Inspector (daily fan goal eligibility)
fantracking/warnings/weekly.js           → Inspector (weekly goal eligibility)
fantracking/warnings/monthly.js          → Inspector (monthly goal eligibility)

  ─ Archive ─
fantracking/milestone/db.js              → Archive (claim, channel_sent, dm_sent flags)
fantracking/warnings/db.js               → Archive (warning_state, warning_history tables)
fantracking/achievements/db.js           → Archive (achievement record persistence)

  ─ Announcer ─
  (send/delivery portions of the files below; render portions move to Workshop/Fabricator)
fantracking/milestone/notifier.js        → Announcer (sendChannelAnnouncement, DM sends)
fantracking/leaderboard/announcements.js → Announcer (channel post + top-3 DMs)
fantracking/warnings/imageReport.js      → Announcer (deliver warning image report)
tasks/fanDeficitImageReport.js           → Announcer (deliver fan deficit report)
tasks/leaderboardAnnouncements.js        → Announcer (shim, updates target to Announcer)
```

---

### 2.5 `Distribution/` — Command Response Routing

**One sentence:** Retrieves approved deliverables from Workshop/Terminal and routes them
to the correct Discord destination in response to a user slash command.

**Departments (to be defined):**

| Department | Responsibility |
|---|---|
| Retriever | Pulls approved deliverables from Workshop/Terminal |
| Dispatcher | Routes the deliverable to the correct Discord channel, user DM, or command reply |

**Currently handled by** (to be consolidated into `Distribution/`):

```
commands/*.js       → receive slash commands, request deliverable, send reply
handlers/*.js       → handle Discord events, trigger and send deliverables
utils/dm.js         → DM delivery wrapper (stays; used by Dispatcher and Announcer)
utils/updateLog.js  → log channel posting (stays; used by Dispatcher)
utils/autoDelete.js → auto-delete ephemeral messages (stays; used by Dispatcher)
```

> **Distribution is not yet a formal directory.** In the current codebase its role is
> carried out by `commands/` and `handlers/`. Formalizing it is a later-stage task after
> Refinery, Workshop, and Broadcast are stable.

---

### 2.6 `core/` / `db/` / `utils/` / `tasks/` — Shim and Support Layer

These directories hold two kinds of files:

**1. Shims** — thin re-export files that point to the real implementation. They exist so
existing `import` paths in commands and handlers keep working without a mass-rewrite.
Every shim contains only one line of substance: `export * from '../<real-location>';`

**2. Genuine support utilities** — files that don't belong to any pipeline stage and are
used across multiple stages. These stay permanently.

| File | Type | Stays or moves? |
|---|---|---|
| `core/config.js` | Support | Stays permanently |
| `core/log.js` | Support | Stays permanently |
| `core/store.js` | Support | Stays permanently |
| `core/format.js` | Support | Stays permanently |
| `core/errors.js` | Support | Stays permanently |
| `core/channels.js` | Support | Stays permanently (used by Announcer + Dispatcher) |
| `core/busyLock.js` | Support | Stays permanently |
| `core/quotaKeys.js` | Support | Stays permanently |
| `core/taskRegistry.js` | Support | Stays permanently |
| `core/health.js` | Support | Stays permanently |
| `core/tally.js` | Support | Stays permanently |
| `core/uma.js` | Shim → `umamoe/uma.js` | Stays as shim |
| `core/umaClient.js` | Shim → `umamoe/umaClient.js` | Stays as shim |
| `core/umaCache.js` | Shim → `umamoe/umaCache.js` | Stays as shim |
| `core/umaQueue.js` | Shim → `umamoe/umaQueue.js` | Stays as shim |
| `core/umaStats.js` | Shim → `umamoe/umaStats.js` | Updates target → `Refinery/Refiner/` after move |
| `core/milestoneEval.js` | Shim → `fantracking/milestone/eval.js` | Updates target → `Broadcast/Inspector/` after move |
| `core/milestoneImages.js` | Shim → `fantracking/milestone/images.js` | Stays (images stays in fantracking) |
| `core/fanDeficitApi.js` | Shim → `fantracking/warnings/fanDeficitApi.js` | Updates target → `Workshop/Terminal/` after move |
| `db/linksDb.js` | Shim → `fantracking/links/db.js` | Updates target → `Refinery/Depot/` after move |
| `db/achievementDb.js` | Shim → `fantracking/achievements/db.js` | Updates target → `Broadcast/Archive/` after move |
| `db/milestoneDb.js` | Shim → `fantracking/milestone/db.js` | Updates target → `Broadcast/Archive/` after move |
| `db/warningDb.js` | Shim → `fantracking/warnings/db.js` | Updates target → `Broadcast/Archive/` after move |
| `db/attendanceDb.js` | Shim → `fantracking/attendance/db.js` | Stays (attendance is independent) |
| `db/leaderboardSnapshotDb.js` | Shim → `fantracking/leaderboard/snapshotDb.js` | Updates target → `Refinery/Depot/` after move |
| `utils/milestoneNotifier.js` | Shim → `fantracking/milestone/notifier.js` | Updates target → `Broadcast/Announcer/` after move |
| `utils/reports/*.js` | Shims → `fantracking/reports/*.js` | Update target → `Workshop/Fabricator/reports/` after move |
| `utils/pastHistoryReader.js` | Shim → `umamoe/history/` | Stays as shim |
| `utils/generatePastHistoryMd.js` | Shim → `umamoe/history/` | Stays as shim |
| `utils/profileBackfill.js` | Shim → `umamoe/profileBackfill.js` | Stays as shim |
| `utils/resumeCard.js` | Shim → `umamoe/trainer/resumeCard.js` | Stays as shim |
| `utils/skillScraper.js` | Shim → `umamoe/trainer/skillScraper.js` | Stays as shim |
| `utils/dm.js` | Support | Stays permanently (Announcer + Dispatcher use it) |
| `utils/updateLog.js` | Support | Stays permanently |
| `utils/autoDelete.js` | Support | Stays permanently |
| `utils/imageReport.js` | Support | Stays permanently (Playwright render engine) |
| `tasks/*.js` shims | Shims → `fantracking/` or `Broadcast/` | Update shim target after move |
| `tasks/index.js` | Distribution scheduler | Stays (entry point for all cron; calls into Broker) |

---

## 3. Boundary Rules

These rules are absolute. If any code violates a boundary, the split has not been done correctly.

| Directory | May read from | May write to | May send to Discord |
|---|---|---|---|
| `Umamoe` | uma.moe API | Vault only | No |
| `Refinery` | Vault (read-only) | Depot only | No |
| `Workshop` | Depot (read-only) | Terminal only | No |
| `Broadcast` | Depot (read-only), Archive | Archive | Yes — channel posts + DMs |
| `Distribution` | Terminal (read-only) | None | Yes — command replies |

**Data flows in one direction only:**

```
Umamoe → Refinery → Depot → Workshop → Terminal → Distribution → Discord
                          ↘
                           Broadcast → Discord
```

No directory may import from a directory downstream of itself.
Workshop and Broadcast are parallel consumers of Depot — they never import each other.

---

## 4. Affected Code — Full Inventory

### 4.1 Files that move to `Refinery/`

| Current path | Target path in Refinery | Department |
|---|---|---|
| `umamoe/umaStats.js` | `Refinery/Refiner/umaStats.js` | Refiner |
| `fantracking/velocity/index.js` | `Refinery/Refiner/velocity.js` | Refiner |
| `fantracking/achievements/daily.js` | `Refinery/Refiner/achievements.js` | Refiner |
| `fantracking/milestone/eval.js` | `Refinery/Refiner/milestoneEval.js` | Refiner |
| `fantracking/sync/dataSync.js` | `Refinery/Compiler/dataSync.js` | Compiler |
| `fantracking/sync/circleQueue.js` | `Refinery/Compiler/circleQueue.js` | Compiler |
| `fantracking/aggregation/index.js` | `Refinery/Compiler/aggregation.js` | Compiler |
| `fantracking/leaderboard/snapshotDb.js` | `Refinery/Depot/leaderboardSnapshotDb.js` | Depot |
| `fantracking/links/db.js` | `Refinery/Depot/linksDb.js` | Depot |
| `fantracking/links/repository.js` | `Refinery/Depot/linksRepository.js` | Depot |

---

### 4.2 Files that move to `Workshop/`

**Full move — render-only files with no delivery logic:**

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
| `fantracking/warnings/fanDeficitApi.js` | `Workshop/Terminal/fanDeficitApi.js` | Terminal |

**Split move — render portion to Fabricator, delivery portion to Broadcast/Announcer:**

| Current path | Render portion → Fabricator | Delivery portion → Broadcast/Announcer |
|---|---|---|
| `fantracking/leaderboard/announcements.js` | `Workshop/Fabricator/renders/leaderboard.js` | `Broadcast/Announcer/leaderboardAnnouncements.js` |
| `fantracking/milestone/notifier.js` | `Workshop/Fabricator/renders/milestone.js` | `Broadcast/Announcer/milestoneAnnouncer.js` |
| `fantracking/warnings/imageReport.js` | `Workshop/Fabricator/renders/warningReport.js` | `Broadcast/Announcer/warningAnnouncer.js` |

---

### 4.3 Files that move to `Broadcast/`

**Broker:**

| Current path | Target path |
|---|---|
| `fantracking/milestone/milestones.js` | `Broadcast/Broker/milestoneBroker.js` |
| `tasks/dailyGreetingReport.js` | `Broadcast/Broker/greetingBroker.js` |
| `tasks/dailyMessages.js` | `Broadcast/Broker/dailyMessageBroker.js` |
| `tasks/offlineCheck.js` | `Broadcast/Broker/offlineCheckBroker.js` |
| `tasks/weeklyAnnouncement.js` | `Broadcast/Broker/weeklyAnnouncementBroker.js` |
| `tasks/interCircleAnnouncements.js` | `Broadcast/Broker/interCircleBroker.js` |

**Inspector:**

| Current path | Target path |
|---|---|
| `fantracking/milestone/tiers.js` | `Broadcast/Inspector/milestoneTiers.js` |
| `fantracking/milestone/winners.js` | `Broadcast/Inspector/milestoneWinners.js` |
| `fantracking/milestone/cleanup.js` | `Broadcast/Inspector/milestoneCleanup.js` |
| `fantracking/warnings/engine.js` | `Broadcast/Inspector/warningInspector.js` |
| `fantracking/warnings/daily.js` | `Broadcast/Inspector/dailyWarningInspector.js` |
| `fantracking/warnings/weekly.js` | `Broadcast/Inspector/weeklyWarningInspector.js` |
| `fantracking/warnings/monthly.js` | `Broadcast/Inspector/monthlyWarningInspector.js` |

> `fantracking/milestone/eval.js` moves to `Refinery/Refiner/milestoneEval.js` — the
> eligibility *calculation* is Refinery work. Broadcast/Inspector calls the Refiner result;
> it does not re-implement the calculation.

**Archive:**

| Current path | Target path |
|---|---|
| `fantracking/milestone/db.js` | `Broadcast/Archive/milestoneArchive.js` |
| `fantracking/warnings/db.js` | `Broadcast/Archive/warningArchive.js` |
| `fantracking/achievements/db.js` | `Broadcast/Archive/achievementArchive.js` |

**Announcer (delivery portions only — see §4.2 for the render split):**

| Source | Target path |
|---|---|
| Delivery portion of `fantracking/milestone/notifier.js` | `Broadcast/Announcer/milestoneAnnouncer.js` |
| Delivery portion of `fantracking/leaderboard/announcements.js` | `Broadcast/Announcer/leaderboardAnnouncer.js` |
| Delivery portion of `fantracking/warnings/imageReport.js` | `Broadcast/Announcer/warningAnnouncer.js` |
| `tasks/fanDeficitImageReport.js` (delivery part) | `Broadcast/Announcer/fanDeficitAnnouncer.js` |

---

### 4.4 Shims to create or update

After physical moves, every shim that currently points into `fantracking/` or `tasks/`
updates its target. No command, handler, or task import path changes from the outside.

**Shims in `core/` — update target:**

| File | New target |
|---|---|
| `core/umaStats.js` | `Refinery/Refiner/umaStats.js` |
| `core/milestoneEval.js` | `Refinery/Refiner/milestoneEval.js` |
| `core/fanDeficitApi.js` | `Workshop/Terminal/fanDeficitApi.js` |

**Shims in `db/` — update target:**

| File | New target |
|---|---|
| `db/linksDb.js` | `Refinery/Depot/linksDb.js` |
| `db/leaderboardSnapshotDb.js` | `Refinery/Depot/leaderboardSnapshotDb.js` |
| `db/achievementDb.js` | `Broadcast/Archive/achievementArchive.js` |
| `db/milestoneDb.js` | `Broadcast/Archive/milestoneArchive.js` |
| `db/warningDb.js` | `Broadcast/Archive/warningArchive.js` |

**Shims in `tasks/` — update target:**

| File | New target |
|---|---|
| `tasks/dataSync.js` | `Refinery/Compiler/dataSync.js` |
| `tasks/warningEngine.js` | `Broadcast/Inspector/warningInspector.js` |
| `tasks/dailyFanWarning.js` | `Broadcast/Inspector/dailyWarningInspector.js` |
| `tasks/monthlyWarning.js` | `Broadcast/Inspector/monthlyWarningInspector.js` |
| `tasks/weeklyWarning.js` | `Broadcast/Inspector/weeklyWarningInspector.js` |
| `tasks/milestones.js` | `Broadcast/Broker/milestoneBroker.js` |
| `tasks/milestone-tiers.js` | `Broadcast/Inspector/milestoneTiers.js` |
| `tasks/milestoneCleanup.js` | `Broadcast/Inspector/milestoneCleanup.js` |
| `tasks/milestoneWinners.js` | `Broadcast/Inspector/milestoneWinners.js` |
| `tasks/dailyAchievement.js` | `Broadcast/Broker/achievementBroker.js` |
| `tasks/leaderboardAnnouncements.js` | `Broadcast/Announcer/leaderboardAnnouncer.js` |
| `tasks/interCircleAnnouncements.js` | `Broadcast/Broker/interCircleBroker.js` |
| `tasks/fanDeficitImageReport.js` | `Broadcast/Announcer/fanDeficitAnnouncer.js` |
| `tasks/weeklyAnnouncement.js` | `Broadcast/Broker/weeklyAnnouncementBroker.js` |

**Shims in `utils/reports/` — update target:**
All 16 files update re-export target from `fantracking/reports/<file>` → `Workshop/Fabricator/reports/<file>`.

**Shim to create in `utils/`:**

| New shim | Points to |
|---|---|
| `utils/milestoneNotifier.js` | `Broadcast/Announcer/milestoneAnnouncer.js` |

---

### 4.5 New files to create

**Broadcast spec docs:**

```
Broadcast/README.md
Broadcast/Overview.md
Broadcast/Broker/Broker.md
Broadcast/Inspector/Inspector.md
Broadcast/Archive/Archive.md
Broadcast/Announcer/Announcer.md
```

**Broadcast implementation files:**

```
Broadcast/Broker/broker.js           ← orchestrator entry point
Broadcast/Inspector/inspector.js     ← eligibility + dedup + recipient resolution
Broadcast/Archive/archive.js         ← claim + flags + history interface
Broadcast/Announcer/announcer.js     ← delivery orchestrator
```

**Refinery spec docs (already in repo):** ✅

**Workshop spec docs (already in repo):** ✅

**Workshop blueprint docs to create (one per command):**

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

---

### 4.6 Files that do not change

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
core/quotaKeys.js, core/taskRegistry.js, core/health.js, core/tally.js
```

**Core shims for Umamoe (target unchanged):**
```
core/uma.js, core/umaClient.js, core/umaCache.js, core/umaQueue.js
```

**DB layer (logic unchanged; some shim targets update):**
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

**Utils shims for Umamoe (target unchanged):**
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

**Tasks that are scheduler entry points only — stay as shims pointing to Broadcast:**
```
tasks/index.js              (cron scheduler — calls into Broker; stays as entry point)
tasks/dataSync.js           (shim → Refinery/Compiler)
tasks/historicalSync.js     (self-contained; stays)
tasks/attendanceCheck.js    (self-contained subsystem; stays)
tasks/chatArchiver.js       (stays)
tasks/imageArchive.js       (stays)
tasks/memberArchive.js      (stays)
tasks/messageCleanup.js     (stays)
tasks/monthlyHistoryExport.js (stays)
tasks/nameLinker.js         (stays)
tasks/onboardingReminder.js (stays)
tasks/purgeAnnouncement.js  (stays)
tasks/sqliteBackup.js       (stays)
tasks/stadiumSync.js        (stays)
tasks/startupMigrations.js  (stays)
tasks/tallyResults.js       (stays)
tasks/timezoneNotice.js     (stays)
tasks/updateGameData.js     (stays)
tasks/autoBackfill.js       (stays)
tasks/autoImportCsv.js      (stays)
tasks/purgeUmaStore.js      (stays)
```

**fantracking/ files that stay (independent subsystems):**
```
fantracking/attendance/check.js   (attendance tracking — not fan-gain domain)
fantracking/attendance/db.js
fantracking/milestone/images.js   (image pool loader — stays; referenced by Announcer)
```

---

## 5. Implementation Order

Each task is isolated. The bot must remain fully operational after every step.
Steps 19–24 are pure file moves + shim updates — zero logic changes, zero risk.

| Task | Action | Risk |
|---|---|---|
| **19** | Copy Broadcast spec docs into repo | None — docs only |
| **20** | Move Refinery/Refiner files; update shims in `core/`, `tasks/` | Low — shim pattern proven |
| **21** | Move Refinery/Compiler files; update shims in `tasks/` | Low |
| **22** | Move Refinery/Depot files; update shims in `db/` | Low |
| **23** | Move Workshop/Fabricator report files; update shims in `utils/reports/` | Low |
| **24** | Move Workshop/Terminal file; update shim in `core/` | Low |
| **25** | Move Broadcast/Inspector files; update shims in `tasks/` | Low |
| **26** | Move Broadcast/Archive files; update shims in `db/` | Low |
| **27** | Split render/delivery in `milestone/notifier.js`, `leaderboard/announcements.js`, `warnings/imageReport.js`; move render → Fabricator, delivery → Announcer | Medium — careful split required |
| **28** | Move Broadcast/Broker files (orchestrators); update shims in `tasks/` | Low |
| **29** | Implement `Refinery/Refiner/refiner.js` orchestrator | Medium |
| **30** | Implement `Refinery/Compiler/compiler.js` orchestrator | Medium |
| **31** | Implement `Refinery/Depot/depot.js` + SQLite adapter | Medium |
| **32** | Implement `Broadcast/Archive/archive.js` unified interface | Medium |
| **33** | Implement `Broadcast/Inspector/inspector.js` unified eligibility interface | Medium |
| **34** | Implement `Broadcast/Broker/broker.js` unified entry point | Medium |
| **35** | Implement `Broadcast/Announcer/announcer.js` unified delivery interface | Medium |
| **36** | Implement `Workshop/Validator/validator.js` | Medium |
| **37** | Wire `fantracking/sync/dataSync.js` to use Refinery pipeline end-to-end | High — core sync path |
| **38** | Define remaining Workshop blueprints (one per command) | None — docs only |
| **39** | Formalize `Distribution/` directory | Medium |

After task 28, `fantracking/` retains only `attendance/` and `milestone/images.js`.
It can be formally retired after those two are relocated or confirmed as standalone.
