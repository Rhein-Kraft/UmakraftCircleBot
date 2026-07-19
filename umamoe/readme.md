# UmaMoe

## Overview

The `umamoe/` directory is the structured data pipeline for the **UmaKraft Circle Bot**.

It is responsible for fetching, validating, storing, and serving data from the `uma.moe` API.
It replaces the ad-hoc fetch logic scattered across `core/umaClient.js`, `core/umaCache.js`,
`core/umaQueue.js`, and `core/uma.js` with a clearly defined, single-responsibility pipeline.

The pipeline is organized as a set of specialized departments:

- `Miner` — fetches raw data from approved `uma.moe` endpoints
- `Courier` — transports data without modifying it
- `Inspector` — validates data structure, completeness, and integrity
- `Vault` — stores trusted data and provides retrieval/update/delete access

## Architecture

The UmaMoe pipeline is strictly linear:

```text
uma.moe API  (circle ID 974470619)
   │
   ▼
Miner          umamoe/Miner/miner.js
   │
   ▼
Courier        umamoe/Courier/courier.js
   │
   ▼
Inspector      umamoe/Inspector/inspector.js
   │
   ▼
Vault          umamoe/Vault/vault.js
   │
   ▼
Downstream     core/umaStats.js, tasks/*, commands/*
```

Each department has **one responsibility only**, and responsibilities do not overlap.

---

## How This Fits the Existing Codebase

| New Department | Replaces / Wraps |
|---|---|
| `Miner` | `core/umaClient.js` + `core/umaQueue.js` (rate limiting stays inside Miner) |
| `Courier` | New — thin transport layer that did not exist before |
| `Inspector` | Validation logic previously embedded in `core/uma.js` and task files |
| `Vault` | `core/umaCache.js` + in-memory cache; SQLite adapter replaces JSON flat files |

> **Existing behavior is preserved.** The Vault exposes the same data shape that
> `core/umaStats.js`, `tasks/dataSync.js`, and commands currently consume.
> No command or task output changes during the migration.

---

## Key Documents

Use these documents as the authoritative specification for each part of the pipeline:

| Document | Purpose |
|---|---|
| `umamoe/Overview.md` | Architecture overview and department responsibilities |
| `umamoe/DATA_FORMAT.md` | Trusted data structure and payload examples |
| `umamoe/MINER_ENDPOINTS.md` | Approved uma.moe API endpoints |
| `umamoe/ERROR_HANDLING.md` | Error classification and retry strategy |
| `umamoe/INTEGRATION_EXAMPLE.md` | End-to-end happy path and failure scenarios |
| `umamoe/Inspector/VALIDATION_RULES.md` | Validation rules for Inspector |
| `umamoe/Miner/Miner.md` | Miner implementation contract |
| `umamoe/Courier/Courier.md` | Courier implementation contract |
| `umamoe/Inspector/Inspector.md` | Inspector implementation contract |
| `umamoe/Vault/Vault.md` | Vault implementation contract |

---

## How to Use

1. Read `umamoe/Overview.md` first.
2. Review `umamoe/DATA_FORMAT.md` to understand the exact payload contract.
3. Use `umamoe/MINER_ENDPOINTS.md` to determine which uma.moe endpoints are allowed.
4. Follow `umamoe/ERROR_HANDLING.md` for consistent error reporting and retry behavior.
5. Use `umamoe/INTEGRATION_EXAMPLE.md` to verify your implementation against real scenarios.
6. Implement each module using the corresponding department spec.

### Recommended Workflow

1. Build or validate `miner.js` against `umamoe/Miner/Miner.md`
2. Build or validate `courier.js` against `umamoe/Courier/Courier.md`
3. Build or validate `inspector.js` against `umamoe/Inspector/Inspector.md`
4. Build or validate `vault.js` against `umamoe/Vault/Vault.md`
5. Run the full pipeline using the scenarios in `umamoe/INTEGRATION_EXAMPLE.md`

---

## Implementation Plan

See `docs/UMAMOE_IMPLEMENTATION_PLAN.md` for the full phased rollout plan — which files get
created, which existing files get migrated, and in what order.

---

## Notes

- The pipeline must never allow untrusted data into the Vault.
- The Courier must not mutate payloads.
- The Inspector must reject invalid payloads with clear rejection reasons.
- The Vault must preserve raw data and metadata and keep storage implementation replaceable
  (SQLite adapter for production; in-memory adapter for tests).
- Downstream consumers (`core/umaStats.js`, `tasks/dataSync.js`, commands) must not change
  their interface — the Vault exposes a compatible API.
- The existing `core/umaQueue.js` rate-limiting logic (500 ms enforced gap) moves inside
  the Miner; the queue is not exposed as a separate layer.
