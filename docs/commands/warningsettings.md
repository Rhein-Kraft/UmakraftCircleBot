# /warningsettings

View or update the warning engine configuration for this server.

## Permissions
> 🔒 Requires **Administrator**

## Subcommands

### `view`
Show the current warning system settings.

```
/warningsettings view
```

### `set`
Update a warning system setting.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `key` | Choices | ✅ | Which setting to update |
| `value` | String | ✅ | New value — `true`/`false` for toggles, a number for thresholds |

```
/warningsettings set key:reminder_threshold value:80
```

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- Validates that threshold ordering is correct — Reminder < Warning < Critical — and rejects configurations that violate this rule.
- Changes take effect on the next warning engine run (every 30 minutes after the hourly data sync).

## Example
```
/warningsettings view
/warningsettings set key:warning_threshold value:50
```
