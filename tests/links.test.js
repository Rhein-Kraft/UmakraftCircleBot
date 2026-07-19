/**
 * Integration tests for db/linksDb.js
 *
 * Creates a throw-away SQLite database in a temp directory so the real
 * data is never touched.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { makeTempDir, cleanupDir } from './helpers/tempDb.js';

const tmpDir = makeTempDir();
process.env.DATA_DIR = tmpDir;
process.env.DISCORD_TOKEN = 'test-token-placeholder';
process.env.CIRCLE_ID = '000000001';
process.env.LOG_LEVEL = 'error';

const { initLinksDb, setLink, removeLink, getLinkedViewerId, getAllLinks } =
  await import('../db/linksDb.js');

afterAll(() => {
  cleanupDir(tmpDir);
});

describe('linksDb', () => {
  beforeAll(() => {
    initLinksDb();
  });

  test('setLink stores a link retrievable by getLinkedViewerId', () => {
    setLink('discord_111', 'viewer_aaa');
    expect(getLinkedViewerId('discord_111')).toBe('viewer_aaa');
  });

  test('setLink overwrites an existing link', () => {
    setLink('discord_222', 'viewer_bbb');
    setLink('discord_222', 'viewer_ccc');
    expect(getLinkedViewerId('discord_222')).toBe('viewer_ccc');
  });

  test('getLinkedViewerId returns null for unknown discord ID', () => {
    expect(getLinkedViewerId('discord_unknown_xyz')).toBeNull();
  });

  test('removeLink deletes a link', () => {
    setLink('discord_333', 'viewer_ddd');
    removeLink('discord_333');
    expect(getLinkedViewerId('discord_333')).toBeNull();
  });

  test('removeLink on non-existent link does not throw', () => {
    expect(() => removeLink('discord_nobody')).not.toThrow();
  });

  test('getAllLinks returns all stored links as a plain object', () => {
    setLink('discord_444', 'viewer_eee');
    const all = getAllLinks();
    expect(typeof all).toBe('object');
    expect(Array.isArray(all)).toBe(false);
    expect(all['discord_444']).toBe('viewer_eee');
    expect(all['discord_111']).toBe('viewer_aaa');
  });

  test('getAllLinks does not include removed links', () => {
    setLink('discord_555', 'viewer_fff');
    removeLink('discord_555');
    const all = getAllLinks();
    expect(all['discord_555']).toBeUndefined();
  });
});
