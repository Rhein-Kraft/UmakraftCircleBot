# Refinery

Refinery contains the production pipeline that converts trusted, validated data (from the `Vault`) into finished products for downstream consumption.

Structure:

- `Refiner/` — Business logic and enrichment (calculations, flags, trends)
- `Compiler/` — Deterministic assembly and packaging of refined results
- `Depot/` — Persistence, retrieval, and retention of compiled products

Getting started:

1. Read the dept specs: `Refiner/Refiner.md`, `Compiler/Compiler.md`, `Depot/Depot.md`
2. Use in-memory adapters for local development (check `Refinery/*/adapters/dev`)
3. Run unit tests for the target module:

```powershell
npm test --workspace=Refinery
```

Contributing:

- Follow the v2.0 spec style in department docs when changing contracts.
- Update `Version History` in the modified spec files.

Contact:

Open an issue or PR in the repository for design questions or implementation proposals.
