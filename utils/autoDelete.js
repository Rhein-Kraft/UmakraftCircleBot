/**
 * Schedule a Discord message to be deleted after `ms` milliseconds (default 60s).
 * Silently ignores errors (already deleted, missing permissions, etc.).
 */
export function deleteAfter(msg, ms = 60_000) {
  setTimeout(() => msg.delete().catch(() => {}), ms);
}
