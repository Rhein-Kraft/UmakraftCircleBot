# Profile Blueprint

## Purpose

This blueprint defines the visual and data structure for the `/profile` deliverable.

It describes how a trainer profile should appear when requested via Discord, including identity, performance, history, and stadium specialization.

## Product overview

The `/profile` report is a polished profile card that combines personal identity, fan gain metrics, all-time statistics, circle membership, milestones, and team stadium performance.

It is intended for a complete trainer overview and should be visually organized into clear sections.

## Layout

1. Header / Identity panel
   - Discord avatar
   - Trainer ID
   - Discord ID
   - Trainer name
   - Discord username
2. Summary panel
   - Rolling gain metrics
   - Daily fan
   - Weekly fan
   - Monthly fan
3. Best performance / Circle panel
   - Best performance callout
   - Current circle label
4. All-time stats panel
   - Total fans
   - Total gain
   - Active days
   - Average daily
   - Average weekly
   - Average monthly
   - Circle membership date
5. History panel
   - Fan history list
   - Milestone trigger list
6. Yearly performance cards
   - 2025 fangain
   - 2026 fangain
   - 2027 fangain
7. Inheritance / Commentary bar
   - Important notes or inherited stats
8. Team stadium panel
   - Sprint
   - Mile
   - Medium
   - Long
   - Dirt

## Component definitions

### Header / Identity panel

- `avatarUrl`: string
- `trainerId`: string
- `discordId`: string
- `trainerName`: string
- `discordUsername`: string

### Summary panel

- `rollingGain`: string or number
- `dailyFan`: number
- `weeklyFan`: number
- `monthlyFan`: number

### Best performance / Circle panel

- `bestPerformance`: string
- `currentCircle`: string

### All-time stats panel

- `totalFans`: number
- `totalGain`: number
- `activeDays`: number
- `averageDaily`: number
- `averageWeekly`: number
- `averageMonthly`: number
- `circleMembershipDate`: string

### History panel

- `fanHistory`: array of { `label`: string, `value`: string }
- `milestones`: array of { `label`: string, `trigger`: string }

### Yearly performance cards

- `yearlyPerformance`: array of {
  - `year`: number
  - `fanGain`: number
  }

### Inheritance / Commentary bar

- `inheritanceNote`: string

### Team stadium panel

- `stadiumPerformance`: object {
  - `sprint`: string
  - `mile`: string
  - `medium`: string
  - `long`: string
  - `dirt`: string
  }

## Data contract

The blueprint expects a payload like:

- `meta`
  - `trainerId`
  - `discordId`
  - `trainerName`
  - `discordUsername`
  - `generatedAt`
- `summary`
  - `rollingGain`
  - `dailyFan`
  - `weeklyFan`
  - `monthlyFan`
- `performance`
  - `bestPerformance`
  - `currentCircle`
- `stats`
  - `totalFans`
  - `totalGain`
  - `activeDays`
  - `averageDaily`
  - `averageWeekly`
  - `averageMonthly`
  - `circleMembershipDate`
- `history`
  - `fanHistory`
  - `milestones`
- `yearlyPerformance`
  - array of year/fanGain objects
- `inheritance`
  - `inheritanceNote`
- `stadium`
  - `sprint`
  - `mile`
  - `medium`
  - `long`
  - `dirt`

## Workflow

```text
Discord User
      │
      ▼
   /profile
      │
      ▼
Command validates request
      │
      ▼
Distribution/Retriever fetches approved profile product
      │
      ▼
Delivery renders the report using the Profile blueprint
      │
      ▼
Discord Response
```

## Notes

- The design is focused on a single-authoritative profile card.
- Sections should be visually separated and labeled clearly.
- The blueprint specifies structure; rendering is handled by Delivery.
