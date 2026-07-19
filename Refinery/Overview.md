# Refinery Architecture Overview (v2.0)

## Purpose

The **Refinery** transforms trusted information from the `Vault` into finished, canonical products. It does not acquire or validate raw data — those responsibilities belong to the UmaMoe departments (Miner, Inspector, Vault).

This document is the high-level guide for implementers and maintainers of the Refinery pipeline.

---

## Core Philosophy

Clear separation of responsibilities keeps the Refinery modular and auditable. Each department has a single focus:

- `Refiner`: compute and enrich
- `Compiler`: assemble and package
- `Depot`: persist and serve

All derived values must be stored separately from trusted payloads and product provenance must be recorded with each compiled object.

---

## Data Pipeline

```text
Vault -> Refiner -> Compiler -> Depot
```

Each arrow represents an explicit adapter boundary with documented contracts (see individual department specs in this directory).

---

## Departments (quick reference)

- `Refiner` — Runs deterministic business logic (gains, trends, flags) on Vault-provided envelopes.
- `Compiler` — Merges one or more `refinedResult` envelopes into a `compiledProduct` following conflict-resolution rules.
- `Depot` — Persists compiled products with explicit `id` and `version`, supports retrieval and retention policies.

---

## Documentation & Source of Truth

Authoritative specs in this folder:

- [Refiner](Refiner/Refiner.md)
- [Compiler](Compiler/Compiler.md)
- [Depot](Depot/Depot.md)

Implementation guidance and examples live alongside these specs (adapters, tests, and example configs).

---

## Developer Quickstart

1. Read the three department specs above.
2. Use the provided in-memory adapters for local development (`Refinery/*/adapters/dev`).
3. Run unit tests for each department (examples in `Refinery/*/tests`).

Example (Node.js) test command:

```powershell
npm test --workspace=Refinery
```

If your environment has no workspaces, run tests per-package with `npm test` in the target folder.

---

## Observability & CI

Each department must emit structured logs and metrics. CI should run linters, unit tests, and basic integration tests that exercise adapter boundaries.

---

## Versioning

This overview follows the Refinery v2.0 documentation style. When changing contracts, bump the spec version and add a migration note in the department file.

---

## Contacts

For questions about the Refinery design or implementation guidelines, open an issue in the repository or contact the module owners listed in `CODEOWNERS`.

---

This overview gives implementers a single place to orient themselves. See each department's spec for exact API and adapter contracts.
