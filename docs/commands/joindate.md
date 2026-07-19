# /joindate

Show when a member joined the circle, or list all members including former ones.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `list` | Boolean | ❌ | Show the full roster (active + former members) instead of a single lookup |
| `member` | User | ❌ | Discord member to look up (defaults to yourself) |
| `trainer` | String | ❌ | Uma.moe trainer name to look up |

## Behavior
- **Single lookup:** Posts an embed showing the member's join date.
- **List mode (`list:true`):** Renders two image reports — current members and alumni — in parallel.
- Leave all options blank to check your own join date.

## Example
```
/joindate
/joindate member:@Trainer
/joindate list:true
```
