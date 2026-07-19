# Blueprint Department

## Purpose

The **Blueprint** directory stores the official design specifications for every product manufactured within the Workshop.

A blueprint describes **how a product should be constructed**, including its layout, components, visual structure, and presentation requirements.

Blueprints are design specifications only.

They never contain rendering logic or business logic.

---

## Responsibilities

Blueprints define:

- Product layout
- Visual hierarchy
- Component arrangement
- Required information
- Canvas dimensions
- Styling guidelines
- Rendering order
- Component relationships

---

## Does Not Do

Blueprints must never:

- Retrieve data
- Process statistics
- Render images
- Validate finished products
- Distribute products

---

## Input

Blueprints receive:

- Product requirements
- Design requirements
- Workshop standards

---

## Output

Blueprints provide:

- Product specifications
- Layout definitions
- Component requirements
- Manufacturing instructions for the Fabricator

---

## Relationship

```text
Assembler
    │
    ▼
Product
    │
    ▼
Draftsman
    │
    ▼
Blueprint
    │
    ▼
Fabricator
    │
    ▼
Rendered Product
```

---

## Available blueprints

- `fan_gain.md` — fan gain report design
- `profile.md` — trainer profile card design
- `circle.md` — circle report design
- `set_fans.md` — fan count update request design
- `link.md` — trainer account link request design

## Design Principle

A Blueprint defines **what should be built**.

The Fabricator determines **how it is built**.
