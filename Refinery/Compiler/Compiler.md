# Compiler

## Purpose

The **Compiler** transforms one or more `refinedResult` envelopes produced by the Refiner into complete, standardized products suitable for storage in the `Depot`. It assembles data components, resolves composition rules, and writes canonical product documents.

The Compiler must not perform domain calculations, validation, or external delivery — its responsibility is deterministic assembly and packaging.

---

## Related Documentation

Read in conjunction with:

* `Refinery/Refiner/Refiner.md` — refined result contract
* `Umamoe/DATA_FORMAT.md` — data schemas
* `Umamoe/Vault/Vault.md` — trusted storage
* `Refinery/Depot/Depot.md` — storage contract and indexing
* `Umamoe/ERROR_HANDLING.md` — error result envelope

---

## Responsibilities

1. Accept `refinedResult` envelopes from one or multiple Refiners.
2. Validate component presence required for a product template.
3. Merge and normalize fields into the canonical product schema.
4. Resolve conflicts or precedence when multiple refiners contribute overlapping fields.
5. Enrich product metadata (product id, version, compiledAt, provenance).
6. Persist completed products to the `Depot` via its adapter interface.
7. Emit structured logs and metrics for observability.

The Compiler must be deterministic: identical inputs and configuration produce identical outputs.

---

## Input

The Compiler accepts one or more `refinedResult` envelopes. Each envelope is expected to include `refinedResult` and `metadata.refinedAt` and `refinerVersion` as defined by `Refiner.md`.

Example input (single):

```json
{
    "refinedResult": { "id": "trainer-alice-001", "fans": 150000000, "dailyGain": 12000 },
    "metadata": { "refinedAt": "2026-07-18T13:00:00Z", "refinerVersion": "v1.0" }
}
```

Example input (multi-source composition):

```json
[
    { "refinedResult": { "id": "trainer-alice-001", "profile": { /* base */ } }, "metadata": { "refinedAt": "..." } },
    { "refinedResult": { "id": "trainer-alice-001", "stats": { /* gains */ } }, "metadata": { "refinedAt": "..." } }
]
```

The Compiler must verify that required components for the chosen product template are present; missing optional components should be logged and allowed per configuration.

---

## Output

The Compiler writes a `compiledProduct` object to the `Depot`. The product includes canonical fields, a `provenance` section with source refs and versions, and `compiledAt` timestamp.

Example compiled product:

```json
{
    "compiledProduct": {
        "id": "trainer-alice-001",
        "version": "2026-07-18T13:00:00Z",
        "profile": { /* merged profile */ },
        "stats": { "fans": 150000000, "dailyGain": 12000 },
        "presentationHints": { "highlight": "dailyGain" }
    },
    "provenance": {
        "sources": [ { "refiner": "refiner-profile", "refinedAt": "..." }, { "refiner": "refiner-stats", "refinedAt": "..." } ],
        "compiledAt": "2026-07-18T13:02:00Z",
        "compilerVersion": "v2.0"
    }
}
```

The Compiler should never mutate the original `refinedResult` objects — it must copy and merge into a new `compiledProduct`.

---

## Conflict Resolution Rules

When multiple sources provide the same field, the Compiler applies resolution rules in this order (configurable):

1. Source priority list (explicit mapping from refiner name to precedence).
2. Latest `metadata.refinedAt` timestamp wins if priority is equal.
3. Schema-level merge rules (e.g., merge arrays, overwrite scalars).

Conflicts and their resolution decisions must be recorded in product `provenance`.

---

## Error Handling

Follow the UmaMoe error envelope conventions. Compiler-specific errors:

- `COMPILER_MISSING_COMPONENT` — required component for product template missing
- `COMPILER_PERSISTENCE_FAILURE` — failed to persist to Depot
- `COMPILER_CONFLICT_UNRESOLVED` — conflict couldn't be resolved deterministically

Guidelines:

* Treat Depot write failures as retriable (exponential backoff). If persistence ultimately fails, emit a failure result and do not mark the product as stored.
* If optional components are missing, produce the product with `missingComponents` metadata and severity `warning`.
* Log full provenance on errors for troubleshooting.

Example error result:

```json
{
    "success": false,
    "error": "COMPILER_PERSISTENCE_FAILURE",
    "message": "Failed to write compiledProduct id=trainer-alice-001 to Depot",
    "retriable": true,
    "timestamp": "2026-07-18T13:03:00Z",
    "context": { "id": "trainer-alice-001" }
}
```

---

## Implementation Interface

Expose a minimal async interface in `compiler.js`:

```javascript
// compiler.js
async function compile(envelopes, template) -> { success, compiledProduct|error }
async function compileAndStore(envelopes, template) -> { success, compiledProduct|error }
async function compileBatch(jobs[]) -> { results[] }
```

`compile` merges envelopes into a product; `compileAndStore` calls `compile` then writes to the Depot adapter. Both must be idempotent for identical inputs.

---

## Observability & Logging

Emit structured events for:

* Job start/finish with `template`, `id`, `compilerVersion`.
* Conflict resolutions and provenance entries.
* Depot write attempts and retries.

Logs must include enough context to reconstruct the assembly decision path.

---

## Depot Contract

The Compiler must use the `Depot` adapter interface to persist products. The adapter is expected to provide:

```javascript
async function put(product) -> { success }
async function get(id) -> { product|null }
```

Follow Depot id/versioning rules as described in `Refinery/Depot/Depot.md`.

---

## Quick Reference Checklist

* [ ] Accept only `refinedResult` envelopes with provenance.
* [ ] Apply configured conflict resolution rules and record decisions.
* [ ] Produce `compiledProduct` without mutating inputs.
* [ ] Persist only after successful compilation and verification.
* [ ] Emit structured logs and metrics.
* [ ] Provide unit tests for merge and conflict rules.

---

## Version History

* `v1.0` — Initial Compiler draft
* `v2.0` — Added input/output contracts, conflict resolution, persistence contract, and implementation interface

---

## Design Principle

The Compiler is a deterministic assembler: it packages refined facts into canonical products while preserving provenance and enabling reproducible builds.

