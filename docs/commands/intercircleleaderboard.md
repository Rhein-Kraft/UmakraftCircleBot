# /intercircleleaderboard

Show a unified cross-circle fan-gain leaderboard ranking members from all configured circles together.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `scope` | Choices | ❌ | `daily`, `weekly`, or `monthly` (defaults to `daily`) |
| `top` | Integer (10–30) | ❌ | Number of members to display (defaults to 10) |

## Behavior
- Renders and posts an image leaderboard combining members from all circles into one unified ranking.
- Useful for comparing performance across circles side by side.

## Example
```
/intercircleleaderboard
/intercircleleaderboard scope:weekly top:20
```
