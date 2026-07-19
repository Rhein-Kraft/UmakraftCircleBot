import os from 'node:os';
import path from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

export function makeTempDir() {
  const dir = path.join(
    os.tmpdir(),
    `uma-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup errors */
  }
}
