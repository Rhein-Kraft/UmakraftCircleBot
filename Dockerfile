FROM node:20-slim

# ── System dependencies ────────────────────────────────────────────────────────
# chromium          → headless browser for Playwright (scraping + screenshots)
# python3 make g++  → compile better-sqlite3 native C++ addon
# ca-certificates   → HTTPS support for axios requests
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium — skip downloading its own bundle
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# ── Dependencies (cached layer) ────────────────────────────────────────────────
# Copied before source so this layer only rebuilds when package files change.
# better-sqlite3 compiles here — takes ~60s on first build, cached after that.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Source code ────────────────────────────────────────────────────────────────
# This layer rebuilds on every code change — kept separate for fast deploys.
COPY . .

# Pre-create both possible data directories so the bot never crashes on first boot:
#   /data      → used when DATA_DIR=/data (Railway Volume path)
#   /app/data  → used when DATA_DIR is unset (default fallback)
RUN mkdir -p /data /app/data

# Health check server port
EXPOSE 8080

CMD ["node", "index.js"]
