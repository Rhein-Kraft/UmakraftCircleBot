# /timeline_setup

Configure which channel receives automatic Uma Musume event timeline updates.

## Permissions
> 🔒 Requires **Manage Guild**

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `channel_name` | String | ❌ | Name of the channel to use (creates it if it does not exist) |

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- Creates the channel if it does not already exist, then saves the channel ID as `timelineChannelId` in the guild config.
- The automatic timeline scheduler will post to this channel going forward.

## Example
```
/timeline_setup
/timeline_setup channel_name:uma-events
```
