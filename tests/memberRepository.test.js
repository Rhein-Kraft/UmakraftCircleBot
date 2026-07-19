/**
 * Integration tests for repositories/memberRepository.js
 *
 * Tests the full chain: memberRepository → store → storeDb → SQLite.
 * Uses a real temp SQLite database — no mocking.
 */
import { describe, test, expect, afterAll } from 'vitest';
import { makeTempDir, cleanupDir } from './helpers/tempDb.js';

const tmpDir = makeTempDir();
process.env.DATA_DIR = tmpDir;
process.env.DISCORD_TOKEN = 'test-token';
process.env.CIRCLE_ID = 'circle-main';
process.env.LOG_LEVEL = 'error';

const { store } = await import('../core/store.js');
await store.init();

const { memberRepository } = await import('../repositories/memberRepository.js');

const C1 = 'circle-main';
const C2 = 'circle-other';

afterAll(() => {
  cleanupDir(tmpDir);
});

// ─── getMembersForCircle ───────────────────────────────────────────────────────

describe('getMembersForCircle()', () => {
  test('returns an empty object for a circle with no members', async () => {
    const members = await memberRepository.getMembersForCircle('circle-empty');
    expect(typeof members).toBe('object');
    expect(Object.keys(members)).toHaveLength(0);
  });

  test('returns members after they have been upserted', async () => {
    await memberRepository.upsertMemberForCircle(C1, 'viewer-100', {
      trainerName: 'TrainerAlpha',
    });
    const members = await memberRepository.getMembersForCircle(C1);
    expect(members['viewer-100']).toBeDefined();
    expect(members['viewer-100'].trainerName).toBe('TrainerAlpha');
  });
});

// ─── upsertMemberForCircle ────────────────────────────────────────────────────

describe('upsertMemberForCircle()', () => {
  test('inserts a new member', async () => {
    await memberRepository.upsertMemberForCircle(C1, 'viewer-200', {
      trainerName: 'TrainerBeta',
      joinedAt: '2026-01-15T00:00:00.000Z',
    });
    const members = await memberRepository.getMembersForCircle(C1);
    expect(members['viewer-200']).toBeDefined();
    expect(members['viewer-200'].trainerName).toBe('TrainerBeta');
    expect(members['viewer-200'].joinedAt).toBe('2026-01-15T00:00:00.000Z');
  });

  test('updates an existing member (patch merges)', async () => {
    await memberRepository.upsertMemberForCircle(C1, 'viewer-300', {
      trainerName: 'OldName',
    });
    await memberRepository.upsertMemberForCircle(C1, 'viewer-300', {
      trainerName: 'NewName',
      lastSeen: '2026-05-01T00:00:00.000Z',
    });
    const members = await memberRepository.getMembersForCircle(C1);
    expect(members['viewer-300'].trainerName).toBe('NewName');
    expect(members['viewer-300'].lastSeen).toBe('2026-05-01T00:00:00.000Z');
  });

  test('viewer IDs are stored as strings', async () => {
    await memberRepository.upsertMemberForCircle(C1, 12345, { trainerName: 'NumericId' });
    const members = await memberRepository.getMembersForCircle(C1);
    expect(members['12345']).toBeDefined();
  });
});

// ─── setMembersForCircle ──────────────────────────────────────────────────────

describe('setMembersForCircle()', () => {
  test('replaces the entire member map for a circle', async () => {
    await memberRepository.upsertMemberForCircle(C2, 'old-viewer', { trainerName: 'Old' });
    await memberRepository.setMembersForCircle(C2, {
      'new-viewer-1': { trainerName: 'Alpha' },
      'new-viewer-2': { trainerName: 'Beta' },
    });
    const members = await memberRepository.getMembersForCircle(C2);
    expect(members['old-viewer']).toBeUndefined();
    expect(members['new-viewer-1']).toBeDefined();
    expect(members['new-viewer-2']).toBeDefined();
  });

  test('setting an empty map removes all members', async () => {
    await memberRepository.setMembersForCircle(C2, {});
    const members = await memberRepository.getMembersForCircle(C2);
    expect(Object.keys(members)).toHaveLength(0);
  });
});

// ─── Circle isolation ─────────────────────────────────────────────────────────

describe('circle isolation', () => {
  test('members in C1 do not appear in a different circle query', async () => {
    await memberRepository.upsertMemberForCircle(C1, 'exclusive-v1', {
      trainerName: 'CircleOneMember',
    });
    const c2members = await memberRepository.getMembersForCircle('circle-isolated');
    expect(c2members['exclusive-v1']).toBeUndefined();
  });

  test('same viewer_id in two circles are independent records', async () => {
    await memberRepository.upsertMemberForCircle('circ-a', 'shared-viewer', {
      trainerName: 'NameInA',
    });
    await memberRepository.upsertMemberForCircle('circ-b', 'shared-viewer', {
      trainerName: 'NameInB',
    });
    const a = await memberRepository.getMembersForCircle('circ-a');
    const b = await memberRepository.getMembersForCircle('circ-b');
    expect(a['shared-viewer'].trainerName).toBe('NameInA');
    expect(b['shared-viewer'].trainerName).toBe('NameInB');
  });
});
