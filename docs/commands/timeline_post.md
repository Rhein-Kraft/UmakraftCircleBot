# /timeline_post

Manually trigger an Uma Musume event timeline fetch and post.

## Permissions
> 🔒 Requires **Manage Guild**

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `url` | String | ❌ | Custom URL to fetch the timeline from (uses the configured default if omitted) |

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- Immediately runs `runTimelineUpdate` — the same function used by the automatic scheduler.
- Posts the timeline to the configured timeline channel.
- Useful for testing the timeline channel setup or forcing a refresh after an event update.

## Example
```
/timeline_post
/timeline_post url:https://custom-timeline-source.example.com
```
