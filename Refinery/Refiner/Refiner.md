# Refiner

## Purpose

The **Refiner** department transforms trusted information from the Vault into meaningful, business-ready results.

It retrieves verified records from the Vault, performs calculations, analysis, comparisons, and enrichment, then produces refined output for the Compiler.

The Refiner is the analytical engine of the UmaKraft pipeline.

---

# Implementation Authority

This document is the authoritative specification for the implementation of `refiner.js`.

The implementation must follow the responsibilities, boundaries, inputs, outputs, and restrictions defined in this document.

If a behavior is not defined in this specification, the implementation must not invent additional responsibilities for the Refiner.

---

# Related Documentation

This specification must be read alongside:

* `Umamoe/DATA_FORMAT.md` — defines the trusted source data structure
* `Umamoe/ERROR_HANDLING.md` — defines error classification and reporting
* `Umamoe/INTEGRATION_EXAMPLE.md` — shows end-to-end pipeline behavior
* `Umamoe/Vault/Vault.md` — defines the trusted data storage contract
* `Refinery/Overview.md` — defines the Refinery architecture
* `Refinery/Compiler/Compiler.md` — defines the product assembly contract

---

# Responsibilities

The Refiner is responsible for:

1. Retrieving trusted information from the Vault.
2. Performing business logic and calculations on trusted data.
3. Enriching trusted data with derived values and comparison results.
4. Producing refined output for the Compiler.
5. Reporting refinement failures clearly.
6. Preserving the integrity of refined output.

---

# Input

The Refiner receives trusted data that has already been validated and stored by the Vault.

The input must be delivered through an approved internal interface and should include the trusted payload, metadata about its origin, and any required context for refinement.

Example trusted input:

```json
{
  "trustedData": {
    "id": "trainer-alice-001",
    "name": "Alice",
    "fans": 150000000,
    "rank": 87,
    "characters": ["uma-musume-special-week"],
    "achievements": []
  },
  "metadata": {
    "source": "uma.moe /api/trainers/alice-001",
    "inspectedAt": "2026-07-18T12:34:56Z",
    "storedAt": "2026-07-18T12:35:20Z"
  }
}
```

The Refiner must not accept untrusted data, rejected payloads, or raw API responses.

---

# Output

The Refiner outputs a refined result for the Compiler.

This output must preserve the original trusted values and include derived or calculated fields only when they are explicitly part of the refinement result.

Example refined output:

```json
{
  "success": true,
  "refinedData": {
    "id": "trainer-alice-001",
    "name": "Alice",
    "fans": 150000000,
    "rank": 87,
    "dailyFanGain": 250000,
    "weeklyFanGain": 1750000,
    "monthlyFanGain": 7200000,
    "trend": "upward"
  },
  "metadata": {
    "source": "Vault",
    "refinedAt": "2026-07-18T14:00:00Z"
  }
}
```

The Refiner must not compile finished products, deliver output externally, or modify data for presentation.

---

# Trusted Data Source

The Refiner operates only on data that originated from the Vault.

It does not retrieve data directly from external APIs or the uma.moe service.

```text
Vault
   │
   ▼
Refiner
   │
   ▼
# Refiner

## Purpose

The **Refiner** department transforms trusted information from the `Vault` into meaningful, actionable, and normalized results. It runs domain-specific business logic and calculations (fan gains, trends, flags, enrichment) and produces refined outputs for the `Compiler` to assemble into final products.

The Refiner is the analytical engine of UmaKraft and must operate only on data that has been validated and stored in the `Vault`.

---

## Related Documentation

This specification must be read alongside:

* `Umamoe/DATA_FORMAT.md` — trusted data structure
* `Umamoe/Vault/Vault.md` — trusted storage and metadata
* `Umamoe/ERROR_HANDLING.md` — error classification and reporting
* `Umamoe/INTEGRATION_EXAMPLE.md` — end-to-end scenarios

---

## Responsibilities

The Refiner is responsible for:

1. Retrieving trusted data from the `Vault`.
2. Performing domain-specific calculations and enrichment (daily, weekly, monthly fan gains, lifetime metrics, trends).
3. Comparing current snapshots with historical records to derive deltas and trends.
4. Flagging notable events (big gains, rank changes, anomalies).
5. Producing normalized, versioned refined results for the `Compiler`.
6. Emitting structured logs and metrics for observability.

The Refiner must preserve the original trusted payload and store any derived values in the refined output envelope only.

---

## Does Not Do

The Refiner must NOT:

* Fetch data directly from external APIs (Miner's responsibility).
* Validate raw data structure (Inspector's responsibility).
* Store raw trusted source data (Vault's responsibility).
* Deliver final products to external systems (Compiler/Depot responsibility).

---

## Input

The Refiner receives a trusted envelope from the `Vault`. The envelope includes the validated payload plus metadata about source and inspection.

Example input envelope:

```json
{
  "trustedData": { /* as defined in DATA_FORMAT.md */ },
  "metadata": {
    "source": "uma.moe /api/trainers/alice-001",
    "inspectedAt": "2026-07-18T12:34:56Z",
    "storedAt": "2026-07-18T12:35:20Z"
  }
}
```

The Refiner must treat this envelope as trusted and must not re-run structural validation. Any unexpected or missing fields that are required for a particular refinement task should be handled as described in the Error Handling section.

---

## Trusted Boundary

All input must originate from the `Vault`. If an input lacks Vault metadata or is explicitly marked as rejected, the Refiner must refuse processing and return a standard error result.

---

## Output

The Refiner produces a `refinedResult` envelope suitable for the `Compiler`. The refined envelope contains derived fields, provenance metadata, and a version identifier.

Example refined output:

```json
{
  "refinedResult": {
    "id": "trainer-alice-001",
    "fans": 150000000,
    "dailyGain": 12000,
    "weeklyGain": 78000,
    "monthlyGain": 310000,
    "lifetimeGain": 15000000,
    "rankChange": -1,
    "flags": ["large_daily_gain"]
  },
  "metadata": {
    "sourceStoredAt": "2026-07-18T12:35:20Z",
    "refinedAt": "2026-07-18T13:00:00Z",
    "refinerVersion": "v1.0"
  }
}
```

The Refiner must never overwrite `trustedData` inside the Vault; all derived values belong in `refinedResult`.

---

## Common Refinement Tasks

Examples of tasks the Refiner may perform:

- Daily/weekly/monthly fan gain calculations using available historical snapshots.
- Rolling averages and trend detection.
- Detecting rank increases/decreases.
- Enriching trainer objects with computed percentiles or normalized metrics.
- Producing alert flags when thresholds are exceeded.

For each task, include deterministic algorithms and configuration options (window sizes, thresholds) in a config module rather than hardcoding.

---

## Error Handling

The Refiner must follow UmaMoe's error result format defined in `Umamoe/ERROR_HANDLING.md`.

Refiner-specific error codes:

- `REFINER_INVALID_INPUT` — input missing required trusted metadata
- `REFINER_MISSING_HISTORICAL_DATA` — required historical snapshot missing
- `REFINER_CALCULATION_ERROR` — arithmetic or overflow error during computation
- `REFINER_DEPENDENCY_FAILURE` — unable to read from Vault or other internal service

The Refiner should:

1. Treat transient read failures from the Vault as retriable (with backoff).
2. Treat permanently missing historical data as a handled rejection (emit result with `null` for derived fields and a warning flag).
3. Preserve original input envelope in logs when reporting errors.

Example error result:

```json
{
  "success": false,
  "error": "REFINER_MISSING_HISTORICAL_DATA",
  "message": "No snapshot found for 2026-07-17 required to compute dailyGain",
  "severity": "warning",
  "retriable": false,
  "timestamp": "2026-07-18T13:01:00Z",
  "context": { "id": "trainer-alice-001" }
}
```

---

## Implementation Interface

Refiner implementation should expose a small set of asynchronous methods:

```javascript
// refiner.js
async function refine(trustedEnvelope) -> { success: true, refinedResult|error }
async function refineBatch(envelopes[]) -> { success: true, results[] }
```

The implementation must read configuration (thresholds, windows) from a central config module and must be pure (idempotent) for the same input envelope and config.

---

## Observability & Logging

The Refiner must emit structured logs for:

* Start/finish of each refinement job
* Key computed values (gains, rank changes)
* Any warnings or errors with full context

Logs must include `id`, `refinedAt`, and `refinerVersion` fields for traceability.

---

## Implementation Requirements for refiner.js

The implementation of `refiner.js` must:

* Accept only trusted envelopes from the Vault.
* Produce deterministic refined results.
* Keep derived values separate from `trustedData`.
* Be configurable and testable (unit tests for each computation).
* Handle missing historical data gracefully.
* Respect error handling and reporting rules in `ERROR_HANDLING.md`.
* Avoid network calls to external APIs.

---

## Quick Reference Checklist

* [ ] Only process envelopes with Vault metadata.
* [ ] Do not modify `trustedData`.
* [ ] Output `refinedResult` with `metadata.refinedAt` and `refinerVersion`.
* [ ] Handle missing snapshots with a warning, not a crash.
* [ ] Emit structured logs for each job.
* [ ] Include unit tests for each calculation.

---

## Version History

* `v1.0` — Initial Refiner draft
* `v2.0` — Expanded responsibilities, input/output envelopes, error handling, and implementation interface

---

## Design Principle

> The Refiner converts trusted facts into business-ready insights. It is deterministic, auditable, and does not perform validation or storage.

---

## Implementation Rule

When creating or modifying `refiner.js`, the implementation agent must:

1. Read this document completely.
2. Follow the responsibilities defined here.
3. Preserve the boundary between Vault, Refiner, Compiler.
4. Keep derived values separate from trusted payloads.
5. Ask for clarification when a required refinement behavior is missing.

The resulting `refiner.js` must implement this specification, not redesign the Refinery architecture.

   ▼
Depot
```

The Refiner accepts trusted data, transforms it, and passes refined results to the Compiler.

---

# Data Integrity

The Refiner must preserve the integrity of trusted input data.

The Refiner may add derived fields, but it must not:

* Alter original trusted values without explicit purpose.
* Add unverified external information.
* Perform storage responsibilities.
* Deliver refined output directly to external clients.

Derived values must be clearly separated from raw trusted fields in the output.

---

# Error Handling

The Refiner must handle refinement failures safely.

The implementation must:

1. Detect failed refinement operations.
2. Detect missing or malformed trusted input.
3. Report failures clearly.
4. Avoid silently returning partially refined data as success.

The Refiner should use the standard UmaMoe error result format from `Umamoe/ERROR_HANDLING.md`.

Example Refiner error result:

```javascript
{
  success: false,
  error: 'REFINER_TRANSFORMATION_FAILED',
  message: 'Failed to calculate weekly fan gain for trainer-alice-001.',
  severity: 'critical',
  retriable: false,
  timestamp: '2026-07-18T14:01:00Z',
  context: {
    id: 'trainer-alice-001',
    stage: 'weeklyFanGain',
    originalDataSource: 'Vault'
  }
}
```

---

# Separation of Responsibilities

The Refiner must not perform responsibilities belonging to other departments.

## The Refiner must not:

* Retrieve data from the uma.moe API.
* Acquire raw external data.
* Validate data structure or content.
* Store trusted data permanently.
* Compile finished products.
* Deliver data to external systems.
* Generate reports, dashboards, or embeds for distribution.
* Apply presentation formatting.

These responsibilities belong to other departments.

---

# Relationship with Vault

The Vault provides trusted data to the Refiner.

The Refiner may request or receive data from the Vault, then perform business logic before passing the result onward.

```text
Vault
   │
   ▼
Refiner
```

The Vault is the trusted source.

The Refiner is the business logic engine.

---

# Relationship with Compiler

The Compiler receives refined output from the Refiner and assembles completed products.

The Refiner must provide consistent, standardized refined results that the Compiler can combine without further calculation.

```text
Refiner
   │
   ▼
Compiler
```

The Refiner is not responsible for final product assembly.

---

# Implementation Requirements for refiner.js

The implementation of `refiner.js` must:

* Provide a clear refinement interface.
* Accept trusted input from the Vault only.
* Preserve trusted source values.
* Produce standardized refined output for the Compiler.
* Expose derived results clearly and predictably.
* Report refinement failures using standard error format.
* Avoid business logic that belongs to the Compiler or Depot.
* Avoid direct external API calls.
* Keep refinement configuration centralized and replaceable.

---

# Implementation Boundary

The Refiner is the business logic layer inside the Refinery.

It receives trusted data from the Vault and outputs refined results to the Compiler.

It must not perform upstream or downstream responsibilities such as acquisition, validation, storage, or product compilation.

```text
Vault -> Refiner -> Compiler -> Depot
```

---

# Quick Reference Checklist

* [ ] Refiner accepts only trusted data from the Vault.
* [ ] Refiner preserves raw trusted values.
* [ ] Refiner outputs standardized refined results.
* [ ] Refiner does not validate or store source data.
* [ ] Refiner does not fetch external data.
* [ ] Refiner reports failures clearly.
* [ ] Refiner keeps derived fields separate from raw fields.
* [ ] Refiner does not perform presentation formatting.

---

# Version History

* `v1.0` — Initial Refiner specification
* `v2.0` — Updated to full Refinery v2.0 documentation style with input/output contracts, error handling, and boundaries.

---

# Design Principle

> **The Refiner turns trusted information into business-ready results without changing the meaning of the source data.**

The Refiner is the analytical engine of the Refinery.

It enriches trusted data with derived values so the Compiler can assemble complete products consistently.

---

# Implementation Rule

When creating or modifying `refiner.js`, the implementation agent must:

1. Read this document completely.
2. Follow the responsibilities defined here.
3. Respect all prohibited responsibilities.
4. Preserve the boundaries between Vault, Refiner, and Compiler.
5. Avoid inventing undefined business logic.
6. Ask for clarification when a required refinement behavior is missing instead of silently creating unrelated functionality.

The resulting `refiner.js` must be an implementation of this specification, not an independent redesign of the Refinery architecture. 
