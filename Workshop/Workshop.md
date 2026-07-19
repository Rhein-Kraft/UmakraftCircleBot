# Workshop Architecture Overview

## Purpose

The **Workshop** directory is responsible for transforming finished data products into user-facing deliverables.

Unlike the **Refinery**, which focuses on refining and compiling trusted information into standardized products, the Workshop manufactures the final deliverables that users can see and interact with.

Every product created within the Workshop follows a predefined specification, undergoes validation, and is prepared for delivery through the next stage of the UmaKraft architecture.

## Core Philosophy

Every department within the Workshop has **one responsibility and one responsibility only**.

Each department performs a specialized task without overlapping another department's responsibilities. This separation ensures a consistent production pipeline that is modular, maintainable, and easy to expand.

## Production Pipeline

```text
Depot
   │
   ▼
Draftsman
   │
   ▼
Fabricator
   │
   ▼
Validator
   │
   ▼
Terminal
```

## Department Overview

### Draftsman

Defines and maintains the product specifications used throughout the Workshop.

Each specification describes the required structure, layout, components, styling, and presentation rules for a deliverable. The Draftsman provides the blueprint that guides the manufacturing process.

### Fabricator

Constructs the final deliverable by following the product specification and using the compiled products retrieved from the Depot.

The Fabricator is responsible for manufacturing the deliverable exactly as defined by the Draftsman.

### Validator

Inspects completed deliverables to ensure they comply with their specifications.

The Validator verifies structure, completeness, consistency, and quality before approving a deliverable for release.

### Terminal

Serves as the Workshop's departure point.

Approved deliverables are placed in the Terminal where they await retrieval by the next architectural stage. The Terminal represents the official handoff between the Workshop and the Distribution directory.

---

## Relationship with Refinery

The Workshop never performs calculations or business logic.

All information entering the Workshop must originate from the **Depot**, ensuring that every deliverable is built from trusted, standardized products created by the Refinery.

## Relationship with Distribution

The Workshop does not deliver products to external systems.

Its responsibility ends once approved deliverables have been successfully placed into the **Terminal**. From that point onward, the Distribution directory becomes responsible for routing and delivering those products to their intended destinations.

---

## Design Principle

The Workshop is responsible for **manufacturing deliverables, not interpreting data or distributing it**.

Every deliverable produced by the Workshop follows a standardized specification, ensuring consistent quality, appearance, and behavior across the entire UmaKraft ecosystem.

---

The Workshop serves as UmaKraft's manufacturing facility, transforming standardized products into polished, validated deliverables that are ready for distribution.
