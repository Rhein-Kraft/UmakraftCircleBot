# Draftsman

## Purpose

The **Draftsman** department is responsible for defining and maintaining the specifications used to manufacture deliverables within the Workshop.

It establishes how a product should be structured, presented, and assembled before the Fabricator begins production.

The Draftsman does not manufacture the product. It creates the blueprint that the Fabricator follows.

## Responsibilities

* Define product specifications.
* Create and maintain templates.
* Define required components.
* Define layout and structure.
* Define visual and presentation rules.
* Define required data fields.
* Define component positioning and relationships.
* Maintain consistent specifications across product types.

## Does Not Do

The Draftsman department must **never**:

* Retrieve data from external APIs.
* Calculate statistics or business logic.
* Compile data products.
* Manufacture final deliverables.
* Validate completed products.
* Distribute deliverables.

These responsibilities belong to other departments.

## Input

* Product requirements.
* Design requirements.
* Output requirements.

## Output

* Product specifications.
* Templates.
* Layout definitions.
* Component requirements.
* Manufacturing instructions for the Fabricator.

## Workflow

```text id="1ud0m9"
Product Requirements
        │
        ▼
    Draftsman
        │
        ▼
Product Specification
        │
        ▼
  Fabricator
```

## Design Principle

The Draftsman defines **what must be built**, but never builds it.

Every deliverable manufactured by the Workshop must have a clear specification before production begins. This ensures that the Fabricator has a consistent design to follow and that the Validator has a defined standard against which the completed product can be evaluated.
