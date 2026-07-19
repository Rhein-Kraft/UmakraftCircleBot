# Circle Blueprint

## Purpose

This blueprint defines the visual and data structure for the `/circle` deliverable.

It describes how a circle report should appear when requested via Discord, including circle identity, membership, and key metrics.

## Product overview

The `/circle` report is a summary card for a trainer's circle, focusing on circle performance, membership, and recent activity.

## Layout

1. Header
   - Circle title
   - Circle ID
   - Trainer name
2. Summary metrics
   - member count
   - total fan gain
   - active members
3. Circle history
   - recent circle events
4. Membership details
   - trainer role
   - join date
5. Notes
   - important flags or callouts

## Data contract

The blueprint expects:

- `meta`
  - `circleId`
  - `trainerId`
  - `trainerName`
  - `generatedAt`
- `metrics`
  - `memberCount`
  - `totalFanGain`
  - `activeMembers`
- `history`
  - `events`: array of { `label`, `value` }
- `membership`
  - `role`
  - `joinDate`
- `notes`
  - `summary`

## Workflow

```text
Discord User
      │
      ▼
   /circle
      │
      ▼
Command validates request
      │
      ▼
Distribution/Retriever fetches approved circle product
      │
      ▼
Delivery renders the report using the Circle blueprint
      │
      ▼
Discord Response
```
