# /circle_master

Show the day-by-day Top 3 fan-gain contributors for the current month.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `day` | Integer (1–31) | ❌ | Specific day to view (defaults to today) |
| `circle` | Choices | ❌ | Which circle to check (defaults to the primary circle) |
| `trigger_milestones` | Boolean | ❌ | Re-trigger milestone checks for the day — admin only |

## Behavior
- Renders and posts an image report showing the Top 3 contributors for each day up to the selected day.
- `trigger_milestones` is restricted to admins and re-runs milestone detection for the selected day.

## Example
```
/circle_master
/circle_master day:15
/circle_master circle:UmaKraft day:1
```
