# Uma Circle Bot

A Discord bot for managing the **UmaKraft** Uma Musume circle on uma.moe (circle ID `974470619`).

## Stack
- **Runtime**: Node.js ≥ 20, ES modules, no build step
- **Key libs**: discord.js 14, better-sqlite3, axios, node-cron, cheerio, googleapis
- **Entry point**: `start.js` → `index.js`

## How to run on Replit

1. Set the required secrets (see below).
2. Run the **Discord Bot** workflow (`node start.js`).

## Required secrets

| Secret | Description |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application (client) ID from the Discord Developer Portal |
| `UMA_MOE_API_KEY` | API key from https://uma.moe |

## Optional env vars (defaults shown)

```
CIRCLE_ID=974470619
GUILD_ID=                        # restrict command registration to one guild
ANNOUNCEMENT_CHANNEL=announcement
RESULTS_CHANNEL=result-contribution
DATA_DIR=./data
TIMEZONE=Asia/Tokyo
LOG_LEVEL=info
```

## Useful scripts

```bash
npm run deploy-commands   # register slash commands with Discord
npm test                  # run vitest test suite
npm run lint              # ESLint
npm run format            # Prettier
```

## User preferences
