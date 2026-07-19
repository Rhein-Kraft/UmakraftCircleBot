# Validator

## Purpose

The **Validator** department is responsible for inspecting completed deliverables produced by the Fabricator and confirming they satisfy Draftsman specifications.

It compares the final output against the required product specification and verifies structure, completeness, content, presentation, and compliance with acceptance criteria.

The Validator is the Workshop quality-control stage.

## Responsibilities

* Inspect completed deliverables from the Fabricator.
* Compare deliverables against their Draftsman specifications.
* Verify required components, fields, and presentation elements.
* Detect incomplete, malformed, or inconsistent outputs.
* Confirm deliverables meet defined acceptance criteria.
* Approve valid deliverables for the Terminal.
* Reject invalid deliverables for correction by the Fabricator.
* Record validation findings and required fixes.

## Must Not

The Validator must **never**:

* Retrieve external data or call external APIs.
* Perform business calculations or create derived content.
* Compile raw information into data products.
* Design or modify product specifications.
* Manufacture or render deliverables.
* Distribute approved deliverables.
* Approve deliverables based on Fabricator intent rather than specification compliance.

Those responsibilities belong to other departments.

## Input

* Completed deliverables from the Fabricator.
* Product specifications from the Draftsman.
* Acceptance criteria and validation rules.

## Output

### Approved

A deliverable that satisfies all required standards and is ready to enter the Terminal.

### Rejected

A deliverable that does not satisfy the required standards and must be returned to the Fabricator for correction.

### Validation report

A record of validation results, including pass/fail status, issues found, and required changes.

## Interface

* `validate(deliverable, specification)` — Evaluates a completed deliverable against its product specification.
* `approve(deliverable)` — Marks the deliverable as approved for the Terminal.
* `reject(deliverable, issues)` — Returns the deliverable to the Fabricator with a list of issues.
* `report(deliverable)` — Produces a validation summary and issue list.

## Workflow

```text
Fabricator
    │
    ▼
Completed Deliverable
    │
    ▼
Validator
    │
    ├── Approved ──► Terminal
    │
    └── Rejected ─► Fabricator
```

## Design Principle

The Validator must remain independent from the Fabricator.

The Fabricator creates the deliverable. The Validator decides whether the deliverable meets specification requirements.

A deliverable is only complete after it has passed validation. Delivery readiness begins after approval and transfer to the Terminal.
