# Fabricator

## Purpose

The **Fabricator** department is responsible for manufacturing final deliverables from compiled products and Draftsman specifications.

This folder contains the official Fabricator guidance for assembling output-ready deliverables from data products and layout definitions.

The Fabricator transforms structured data into usable, validated-ready outputs.

## Responsibilities

* Consume compiled products from the Depot.
* Interpret product specifications provided by the Draftsman.
* Apply Blueprint layout and presentation instructions.
* Assemble output components into a complete deliverable.
* Populate render templates with compiled data.
* Produce image reports, embeds, and supported output formats.
* Keep rendering and assembly logic separate from business logic.
* Emit deliverables that are ready for the Validator.

## Must Not

The Fabricator must **never**:

* Retrieve external data or call APIs for business information.
* Perform business or domain calculations.
* Determine product content, achievements, or ranking.
* Compile raw information into data products.
* Create or modify Draftsman specifications.
* Approve its own completed work.
* Distribute finalized deliverables to external systems.
* Embed business logic into rendering templates or Blueprints.

Those responsibilities belong to other departments.

## Input

* Compiled products from the Depot.
* Product specifications and Blueprint references from the Draftsman.
* Presentation guidance from Blueprint definitions.

## Output

* Fully assembled deliverables ready for validation.
* Rendered assets in supported formats such as SVG, PNG, message embeds, or structured payloads.
* Output metadata describing the rendering context and source specification.

## Workflow

```text
Depot
   │
   ├──────────────► Compiled Product
   │
Draftsman
   │
   ├──────────────► Product Specification
   │
Blueprint
   │
   └──────────────► Layout and presentation guidance
          │
          ▼
      Fabricator
          │
          ▼
  Unvalidated Deliverable
          │
          ▼
      Validator
```

## Design Principle

The Fabricator builds according to specification.

It does not decide what a product should contain, calculate the information inside it, or determine whether the completed product meets the required standard.

Its responsibility is to transform compiled products and Draftsman/Blueprint specifications into complete deliverables that can be validated.
