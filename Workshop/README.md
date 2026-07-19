# Workshop

This directory contains exploratory design notes, drafts, and future migration plans for the UmaMoe pipeline.

## Purpose

`Workshop` is a lightweight sandbox for:

- capturing draft proposals
- recording architecture decisions
- tracking experimental work before it is promoted into the main codebase

## Files

- `Draftsman/` — directory containing the Draftsman specification and templates.
- `Draftsman/Draftsman.md` — primary draft tracker and proposal template.
- `README.md` — onboarding guidance for Workshop contributors.

## How to use

1. Add a new section to `Draftsman.md` for each proposal.
2. Follow the template fields: Summary, Motivation, Design, Backwards compatibility, Tests, Rollback.
3. Keep drafts concise and link to related files or tests where useful.
4. When a draft is approved, move implementation details into the main repo and update `Draftsman.md` status.

## Best practices

- Prefer one proposal per top-level heading.
- Keep the document current; remove stale drafts.
- Use Workshop as a staging area, not as a permanent place for production code.
