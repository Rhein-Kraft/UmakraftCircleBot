# UmaMoe Pipeline — Implementation Plan

## What This Is

This document is the step-by-step plan for introducing the **UmaMoe data pipeline** into the
UmaKraft Circle Bot codebase.

The UmaMoe pipeline is a structured, single-responsibility data layer that replaces the
current ad-hoc fetch logic with four clearly defined departments:

```text
uma.moe API
   │
   ▼
Miner      → fetches raw data
   │
   ▼
Courier    → transports data unchanged
   │
   ▼
Inspector  → validates structure, types, completeness
   │
   ▼
Vault      → stores trusted data, serves downstream consumers
```

Full architecture documentation lives in `umamoe/`. Start with `umamoe/readme.md`.

---

## Guiding Principles

These match the existing modernization roadmap philosophy:

- **Do not rewrite the entire project at once.** Each task is isolated.
- **Do not change runtime behavior** unless explicitly required.
- **Do not remove existing protections** (rate-limiting, retry logic, busy locks).
- **Preserve backward compatibility at every step.**
- Each task produces a working bot — no half-finished states.

---

## Current State

The bot already fetches uma.moe data through several files with overlapping responsibilities:

| File | Current Role | Problem |
|---|---|---|
| `core/umaClient.js` | HTTP requests to uma.moe API | Acquisition, caching, and some transformation mixed together |
| `core/umaQueue.js` | Rate-limits outgoing requests (500 ms gap) | Good — but tightly coupled to `umaClient.js` |
| `core/umaCache.js` | In-memory cache of API responses | No validation, no persistence, lost on restart |
| `core/uma.js` | Orchestrates fetching + processing | Acquisition + transformation + business logic in one file |
| `core/umaStats.js` | Computes daily/weekly/monthly fan deltas | Downstream consumer — stays unchanged |

---

## Target State

| New File | Department | Replaces |
|---|---|---|
| `umamoe/Miner/miner.js` | Miner | `core/umaClient.js` + rate-limit logic from `core/umaQueue.js` |
| `umamoe/Courier/courier.js` | Courier | New (thin transport layer) |
| `umamoe/Inspector/inspector.js` | Inspector | Validation logic embedded in `core/uma.js` |
| `umamoe/Vault/vault.js` | Vault | `core/umaCache.js` |
| `umamoe/Vault/adapters/sqlite.js` | Vault adapter (prod) | Cache that was lost on restart |
| `umamoe/Vault/adapters/inmemory.js` | Vault adapter (test) | Already drafted in roleplan |

**Files that do NOT change:**
- `core/umaStats.js` — downstream consumer, unchanged
- `tasks/dataSync.js` — will call Vault instead of `umaCache.js`, same data shape
- All `commands/` files — unchanged
- All `handlers/` files — unchanged
- `db/` layer — unchanged

---

## Phased Implementation Tasks

Tasks are ordered to preserve a working bot at every step.
Each task maps to one entry in the modernization roadmap in `README.md`.

---

### Task 13 — Create `umamoe/` directory and spec docs

**Category:** Documentation  
**Scope:** No code changes. Documentation only.  
**Status:** ✅ Done (this task)

What was done:
- Created `umamoe/` directory with all spec documents from the roleplan.
- Created `umamoe/readme.md` adapted to the actual repository context.
- Created this implementation plan.
- Updated `README.md` modernization roadmap with tasks 13–18.

Files created:
```
umamoe/readme.md
umamoe/Overview.md
umamoe/DATA_FORMAT.md
umamoe/ERROR_HANDLING.md
umamoe/MINER_ENDPOINTS.md
umamoe/INTEGRATION_EXAMPLE.md
umamoe/Miner/Miner.md
umamoe/Courier/Courier.md
umamoe/Inspector/Inspector.md
umamoe/Inspector/VALIDATION_RULES.md
umamoe/Vault/Vault.md
docs/UMAMOE_IMPLEMENTATION_PLAN.md   ← this file
```

---

### Task 14 — Implement `umamoe/Miner/miner.js`

**Category:** New file  
**Scope:** `umamoe/Miner/miner.js`  
**Spec:** `umamoe/Miner/Miner.md` + `umamoe/MINER_ENDPOINTS.md`

What to build:
- A module that connects to the uma.moe API using only the approved endpoints listed in
  `umamoe/MINER_ENDPOINTS.md`.
- Migrates the HTTP request logic currently in `core/umaClient.js`.
- Migrates the 500 ms rate-limiting from `core/umaQueue.js` into the Miner internals.
- Implements exponential backoff for transient errors (max 3 retries).
- Returns a standard result object (`{ success, data, metadata }` or `{ success: false, error, ... }`).
- Does NOT validate, transform, cache, or store data.

Key files to read before implementing:
- `core/umaClient.js` — existing HTTP logic to migrate
- `core/umaQueue.js` — existing rate-limit logic to migrate
- `umamoe/Miner/Miner.md` — full implementation contract
- `umamoe/MINER_ENDPOINTS.md` — approved endpoints only
- `umamoe/ERROR_HANDLING.md` — error format

Acceptance: `miner.js` returns raw API responses for `/api/v4/circles?circle_id=974470619`
in the standard result format, with retry and rate-limiting, without any other side effects.

---

### Task 15 — Implement `umamoe/Courier/courier.js`

**Category:** New file  
**Scope:** `umamoe/Courier/courier.js`  
**Spec:** `umamoe/Courier/Courier.md`

What to build:
- A thin transport module that receives a Miner result and passes it to the Inspector.
- Performs 4 basic transportability checks (see spec).
- Does NOT modify, validate, or store data.
- Passes both success and failure results through unchanged.

Key files to read before implementing:
- `umamoe/Courier/Courier.md` — full implementation contract
- `umamoe/ERROR_HANDLING.md` — error format

Acceptance: `courier.js` passes a Miner result to Inspector with no modification.
A test confirms that a mutated payload causes a transport failure, not silent corruption.

---

### Task 16 — Implement `umamoe/Inspector/inspector.js`

**Category:** New file  
**Scope:** `umamoe/Inspector/inspector.js`  
**Spec:** `umamoe/Inspector/Inspector.md` + `umamoe/Inspector/VALIDATION_RULES.md`

What to build:
- A validation module that applies the 5 validation categories from `VALIDATION_RULES.md`:
  1. Existence — data is not null/undefined
  2. Structure — data is a plain object with required fields present as keys
  3. Completeness — required field values are not empty
  4. Type integrity — `fans` is number, `rank` is number, `id`/`name` are string
  5. Range integrity — `fans ≥ 0`, `rank` 1–100
- For success inputs: runs all 5 checks; returns `{ passed: true, originalData }` or
  `{ passed: false, originalData, reason }`.
- For failure inputs: passes through unchanged to monitoring/logging.
- Does NOT modify the data, even slightly.

Key files to read before implementing:
- `umamoe/Inspector/Inspector.md` — full implementation contract
- `umamoe/Inspector/VALIDATION_RULES.md` — all 5 validation categories with examples

Acceptance: All validation cases in `VALIDATION_RULES.md` pass as unit tests.

---

### Task 17 — Implement `umamoe/Vault/vault.js` with SQLite adapter

**Category:** New file  
**Scope:** `umamoe/Vault/vault.js`, `umamoe/Vault/adapters/sqlite.js`,
           `umamoe/Vault/adapters/inmemory.js`  
**Spec:** `umamoe/Vault/Vault.md`

What to build:
- `vault.js` — storage interface with `store()`, `getById()`, `getAll()`, `query()`,
  `update()`, `remove()` methods, adapter-agnostic.
- `adapters/sqlite.js` — production adapter using `better-sqlite3`, consistent with the
  existing `db/` layer (migrations via `db/migrations.js`).
- `adapters/inmemory.js` — already drafted in roleplan (`Vault/adapters/inmemory.js`);
  use for tests.

Key files to read before implementing:
- `umamoe/Vault/Vault.md` — full contract
- `db/migrations.js` — migration runner to reuse
- `core/umaCache.js` — existing cache to replace (match data shape for compatibility)

Acceptance: `vault.js` with SQLite adapter stores and retrieves trainer/circle data that
survives a bot restart. In-memory adapter used in tests passes the same interface contract.

---

### Task 18 — Wire up pipeline: replace `core/uma.js` fetch path

**Category:** Migration  
**Scope:** `core/uma.js` (modified), `tasks/dataSync.js` (minor update)  

What to do:
- Update `core/uma.js` to call `Miner → Courier → Inspector → Vault` instead of
  calling `umaClient.js` + `umaCache.js` directly.
- The data shape returned to `tasks/dataSync.js` and `core/umaStats.js` must remain
  identical — no downstream changes.
- Keep `core/umaClient.js` and `core/umaCache.js` in place until this task is verified
  and stable; deprecate them in a follow-up.

Key files to read before implementing:
- `core/uma.js` — current orchestration logic
- `tasks/dataSync.js` — primary consumer (must not break)
- `core/umaStats.js` — downstream stat computation (data shape contract)

Acceptance: Bot runs normally after the switch. `npm test` passes.
`/fan_gain`, `/leaderboard`, `/total_fan` return correct results.
A manual `/admin_sync` completes without error.

---

## File Map Summary

```
umamoe/
├── readme.md                    ← Entry point for this directory
├── Overview.md                  ← Architecture and philosophy
├── DATA_FORMAT.md               ← Trainer object schema
├── ERROR_HANDLING.md            ← Error types, format, retry rules
├── MINER_ENDPOINTS.md           ← Approved uma.moe endpoints
├── INTEGRATION_EXAMPLE.md       ← End-to-end scenarios
├── Miner/
│   ├── Miner.md                 ← Miner implementation contract
│   └── miner.js                 ← [Task 14] Fetch layer
├── Courier/
│   ├── Courier.md               ← Courier implementation contract
│   └── courier.js               ← [Task 15] Transport layer
├── Inspector/
│   ├── Inspector.md             ← Inspector implementation contract
│   ├── VALIDATION_RULES.md      ← All 5 validation categories
│   └── inspector.js             ← [Task 16] Validation layer
└── Vault/
    ├── Vault.md                 ← Vault implementation contract
    ├── vault.js                 ← [Task 17] Storage interface
    └── adapters/
        ├── sqlite.js            ← [Task 17] Production adapter
        └── inmemory.js          ← [Task 17] Test adapter (drafted)
```

---

## Testing Strategy

- Each department gets its own unit test file in `tests/`:
  - `tests/umamoe-miner.test.js`
  - `tests/umamoe-courier.test.js`
  - `tests/umamoe-inspector.test.js`
  - `tests/umamoe-vault.test.js`
- Use the in-memory Vault adapter in all tests (no SQLite I/O).
- Use mock HTTP responses for Miner tests (no live uma.moe calls in CI).
- `npm test` must remain green throughout every task.
