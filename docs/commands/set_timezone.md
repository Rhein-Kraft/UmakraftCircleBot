# /set_timezone

Set your personal timezone so greeting messages arrive at the right local time.

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `timezone` | String | ✅ | Your timezone — supports autocomplete; accepts abbreviations (e.g. `JST`) or IANA names (e.g. `Asia/Tokyo`) |

## Behavior
- Reply is ephemeral (only visible to the user who ran it).
- Typing an abbreviation like `JST` or `PHT` is accepted directly and resolved to the correct IANA zone.
- The autocomplete list searches by abbreviation, IANA name, region label, and UTC offset.
- After setting, shows your current local time as a confirmation.
- If not set, the bot auto-detects your timezone from your Discord locale.

## Supported input formats
```
/set_timezone timezone:JST              → resolves to Asia/Tokyo
/set_timezone timezone:Asia/Tokyo       → IANA name directly
/set_timezone timezone:PHT              → resolves to Asia/Manila
```

## Autocomplete label format
```
[JST] Asia/Tokyo  — now 21:30 (UTC+09:00)
```

> See `SupportStandardTimeSetup.md` for the full list of supported abbreviations and their IANA mappings.
