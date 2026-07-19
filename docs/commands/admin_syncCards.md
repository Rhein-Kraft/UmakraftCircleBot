# /admin_syncCards

Trigger a full sync of support card data from GameTora.

## Permissions
> 🔒 Requires **Administrator**

## Options
None.

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- Runs the card scraper in-process and reloads the in-memory `cardCache`.
- Posts live progress updates during the sync so you can track status.
- Use when new support cards have been released and need to be imported into the database.

## Example
```
/admin_syncCards
```
