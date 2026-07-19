# Set Fans Blueprint

## Purpose

This blueprint defines the structure for the `/set_fans` interaction response.

It describes how a fan count update confirmation should be presented.

## Product overview

The `/set_fans` response is a lightweight confirmation card that acknowledges the update and displays the new fan count.

## Layout

1. Header
   - Confirmation title
   - Trainer / Discord identity
2. Update summary
   - previous fan count
   - new fan count
   - update timestamp
3. Notes
   - any warnings or validation results

## Data contract

The blueprint expects:

- `meta`
  - `trainerId`
  - `discordId`
  - `trainerName`
  - `generatedAt`
- `update`
  - `previousFanCount`
  - `newFanCount`
- `notes`
  - `message`

## Workflow

```text
Discord User
      │
      ▼
   /set_fans
      │
      ▼
Command validates request
      │
      ▼
Distribution/Retriever fetches approved update response
      │
      ▼
Delivery renders the confirmation using the Set Fans blueprint
      │
      ▼
Discord Response
```
