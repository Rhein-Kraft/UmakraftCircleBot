# /leaderboard

Show the fan-gain leaderboard for a circle — daily, weekly, or monthly — with rank movement indicators.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `scope` | Choices | ❌ | `daily`, `weekly`, or `monthly` (defaults to `daily`) |
| `top` | Integer (10–30) | ❌ | Number of members to display (defaults to 10) |
| `circle` | Choices | ❌ | Which circle to check (defaults to the primary circle) |
| `date` | String | ❌ | Historical date in `YYYY-MM-DD` format to view a past leaderboard |

## Behavior
- Renders and posts an image leaderboard.
- Shows rank movement (↑ / ↓ / —) compared to the previous period.
- Monthly leaderboard resets at the start of each month.
- New members are marked on the leaderboard.

## Example
```
/leaderboard
/leaderboard scope:weekly top:20
/leaderboard scope:monthly date:2025-06-01
```
