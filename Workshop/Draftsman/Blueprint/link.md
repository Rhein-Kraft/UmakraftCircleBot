# Link Blueprint

## Purpose

This blueprint defines the structure for the `/link` interaction response.

It describes how a trainer account linking confirmation should be presented.

## Product overview

The `/link` response is a simple confirmation card that acknowledges a successful link between a Discord user and a trainer profile.

## Layout

1. Header
   - Confirmation title
   - Discord user identity
2. Link summary
   - trainer identifier
   - linked status
3. Notes
   - next steps or privileges

## Data contract

The blueprint expects:

- `meta`
  - `discordId`
  - `discordUsername`
  - `trainerId`
  - `trainerName`
  - `generatedAt`
- `link`
  - `status`
  - `message`
- `notes`
  - `summary`

## Workflow

```text
Discord User
      │
      ▼
   /link
      │
      ▼
Command validates request
      │
      ▼
Distribution/Retriever fetches approved link response
      │
      ▼
Delivery renders the confirmation using the Link blueprint
      │
      ▼
Discord Response
```
