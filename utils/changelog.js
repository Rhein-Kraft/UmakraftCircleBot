/**
 * utils/changelog.js
 * ──────────────────
 * Posts a changelog to #logs-update on every startup where something changed.
 *
 * Source priority:
 *   1. replitchangeslog.md — human-written entry whose section header starts with the
 *      current commit's short hash (e.g. "## f838cd7 — 2026-05-27").
 *   2. Git log fallback — commit subject lines between the previous and current
 *      hash, auto-categorised by keyword.
 *
 * Deduplication key: "<commitHash>:<contentChecksum>"
 *   • Same commit + same replitchangeslog.md entry  → silent skip (no re-post).
 *   • Same commit + updated replitchangeslog.md entry → re-posts with new content.
 *   • New commit hash → always posts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { store } from '../core/store.js';
import { getChangelogChannel } from '../core/channels.js';
import { log } from '../core/log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANGELOG_PATH = path.join(__dirname, '..', 'replitchangeslog.md');

// ── Simple non-crypto checksum (djb2) ────────────────────────────────────────

function checksum(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h, 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function getCurrentCommit() {
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function getCommitsSince(fromHash, toHash) {
  try {
    const range = fromHash ? `${fromHash}..${toHash}` : `-1 ${toHash}`;
    const raw = execSync(`git log ${range} --format=%s --no-merges`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return raw ? raw.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

// ── replitchangeslog.md parser ────────────────────────────────────────────────

/**
 * Find the section in replitchangeslog.md whose header starts with `shortHash`.
 * Returns the body text (everything between this header and the next `---`
 * or `## ` section), or null if not found.
 */
async function findChangelogEntry(shortHash) {
  let raw;
  try {
    raw = await fs.readFile(CHANGELOG_PATH, 'utf8');
  } catch {
    return null;
  }

  // Split on horizontal rules or section headers so each block is one entry.
  const sections = raw.split(/\n---+\n/);
  for (const section of sections) {
    const lines = section.trim().split('\n');
    // Header line looks like: "## f838cd7 — …"
    const header = lines[0]?.trim() ?? '';
    if (header.startsWith(`## ${shortHash}`)) {
      // Return everything after the header line, trimmed.
      return lines.slice(1).join('\n').trim();
    }
  }
  return null;
}

// ── Git-log fallback categorisation ──────────────────────────────────────────

const CATEGORIES = [
  { label: 'Added', emoji: '➕', pattern: /\b(add|feat|new|creat|introduc)/i },
  {
    label: 'Improved',
    emoji: '⚡',
    pattern: /\b(improv|enhanc|optim|refactor|updat|perf|speed|fast|reduc|clean)/i,
  },
  { label: 'Fixed', emoji: '🔧', pattern: /\b(fix|bug|patch|resolv|correct|prevent)/i },
  { label: 'Removed', emoji: '🗑️', pattern: /\b(remov|delet|drop|purge|deprecat)/i },
];

const DISPLAY_ORDER = ['Added', 'Improved', 'Fixed', 'Removed', 'Changed'];

function categorise(messages) {
  const buckets = Object.fromEntries(DISPLAY_ORDER.map(l => [l, []]));
  for (const msg of messages) {
    const cat = CATEGORIES.find(c => c.pattern.test(msg));
    (cat ? buckets[cat.label] : buckets['Changed']).push(msg);
  }
  return buckets;
}

function emojiFor(label) {
  return CATEGORIES.find(c => c.label === label)?.emoji ?? '📝';
}

function buildFromGitLog(messages, shortHash, now) {
  const buckets = categorise(messages);
  const lines = [`📋 **Changelog** · \`${shortHash}\``, ''];
  let hasContent = false;

  for (const label of DISPLAY_ORDER) {
    const entries = buckets[label];
    if (!entries.length) continue;
    lines.push(`${emojiFor(label)} **${label}**`);
    for (const e of entries) {
      lines.push('• ' + e.charAt(0).toUpperCase() + e.slice(1).replace(/\.$/, ''));
    }
    lines.push('');
    hasContent = true;
  }

  if (!hasContent) return null;
  lines.push(`<t:${now}:R>`);
  return lines.join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function postChangelogIfUpdated(client) {
  const currentHash = getCurrentCommit();
  if (!currentHash) {
    log.debug('changelog: no git repo detected — skipping');
    return;
  }

  const shortHash = currentHash.slice(0, 7);
  const now = Math.floor(Date.now() / 1000);

  // Try replitchangeslog.md first; fall back to git log subjects.
  const mdEntry = await findChangelogEntry(shortHash);
  const storedHash = await store.getState('lastDeployedCommit').catch(() => null);

  let content;
  if (mdEntry) {
    content = `📋 **Changelog** · \`${shortHash}\`\n\n${mdEntry}\n\n<t:${now}:R>`;
  } else {
    const messages = getCommitsSince(storedHash, currentHash);
    if (!messages.length) {
      // No replitchangeslog.md entry and no new commits — nothing to post.
      await store.setState('lastDeployedCommit', currentHash).catch(() => {});
      log.debug('changelog: no new content to post');
      return;
    }
    content = buildFromGitLog(messages, shortHash, now);
    if (!content) {
      await store.setState('lastDeployedCommit', currentHash).catch(() => {});
      return;
    }
  }

  // Dedup key = commitHash + checksum of content.
  // Changing replitchangeslog.md for the same commit changes the checksum → re-posts.
  const dedupKey = `${currentHash}:${checksum(content)}`;
  const lastKey = await store.getState('lastChangelogKey').catch(() => null);
  if (lastKey === dedupKey) {
    log.debug('changelog: content unchanged — skipping');
    return;
  }

  // Persist before posting so a crash mid-send doesn't cause a duplicate.
  await store.setState('lastDeployedCommit', currentHash).catch(() => {});
  await store.setState('lastChangelogKey', dedupKey).catch(() => {});

  try {
    const guilds = await client.guilds.fetch();
    for (const [, partial] of guilds) {
      let guild;
      try {
        guild = await partial.fetch();
      } catch {
        continue;
      }

      const channel = await getChangelogChannel(guild);
      if (!channel) continue;

      try {
        await channel.send(content);
        log.info(`changelog: posted \`${shortHash}\` to #changelog in ${guild.name}`);
      } catch (err) {
        log.warn(`changelog: failed to post in ${guild.name}: ${err.message}`);
      }
    }
  } catch (err) {
    log.warn('changelog: unexpected error:', err.message);
  }
}
