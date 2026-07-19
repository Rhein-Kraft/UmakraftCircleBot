# Terminal

## Purpose

The **Terminal** is the final Workshop boundary that receives approved deliverables from the Validator and holds them for Distribution.

It exists as a stabilization and handoff layer where deliverables are stored in an immutable state, accompanied by release metadata.

The Terminal does not manufacture, validate, modify, or deliver the products itself. Its responsibility is to preserve approved outputs and provide a clean handoff to Distribution.

## Responsibilities

* Accept approved deliverables from the Validator.
* Store deliverables in a stable, immutable state.
* Maintain handoff metadata for Distribution.
* Expose deliverables for retrieval or export.
* Preserve the integrity of deliverables until Distribution takes ownership.
* Record the approval and release lifecycle of each deliverable.

## Must Not

The Terminal must **never**:

* Retrieve external data or call APIs.
* Perform calculations or business processing.
* Compile or transform data products.
* Create or revise product specifications.
* Manufacture deliverables.
* Validate or approve deliverables.
* Ship final outputs to external destinations.
* Alter approved deliverables during storage or handoff.

Those responsibilities belong to other departments.

## Input

* Approved deliverables from the Validator.
* Release and shipment metadata from Distribution.

## Output

* Approved deliverables ready for Distribution retrieval.
* Handoff metadata for Distribution processing.
* Delivery-ready references and state information.

## Interface

* `receive(deliverable)` — Accepts an approved deliverable from the Validator.
* `store(deliverable)` — Persists the deliverable in immutable storage.
* `listReady()` — Returns deliverables that are available to Distribution.
* `getReleaseMetadata(id)` — Retrieves handoff metadata for the requested deliverable.

## Workflow

```text
Validator
    │
    ▼
Terminal
    │
    ▼
Distribution
```

## Design Principle

The Terminal is a storage-and-handshake layer rather than a processing stage.

A deliverable only enters Distribution after it has passed validation and been accepted into the Terminal.

This preserves a clean separation:

> The Workshop creates and approves the deliverable.
> The Terminal holds it for departure.
> Distribution delivers it to the destination.

## Notes

- Terminal content must remain immutable once approved.
- The Terminal preserves deliverable integrity and delivery context.
- Distribution may attach shipping metadata, but the Terminal does not change the deliverable itself.
