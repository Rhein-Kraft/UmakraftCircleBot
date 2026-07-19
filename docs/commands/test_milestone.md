# /test_milestone

Preview a milestone announcement without actually posting it to the announcement channel.

## Permissions
> 🔒 Requires **Manage Guild**

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `trainer_name` | String | ✅ | Trainer name to use in the preview |
| `tier` | Choices | ✅ | Milestone tier to preview (e.g. 1M, 5M, 10M, 80M, 100M special) |

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- Posts the milestone announcement image to all configured announcement channels so you can verify the layout and content before it fires automatically.
- Supports all milestone tiers including the special 80M and 100M variants.

## Example
```
/test_milestone trainer_name:SmartFalcon tier:10M
/test_milestone trainer_name:SmartFalcon tier:100M
```
