/**
 * Integration tests for db/milestoneDb.js
 *
 * Tests the anti-spam / restart-safety DB layer directly.
 * Uses a real SQLite file in a temp directory — no mocking.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { makeTempDir, cleanupDir } from './helpers/tempDb.js';

const tmpDir = makeTempDir();
process.env.DATA_DIR = tmpDir;
process.env.DISCORD_TOKEN = 'test-token';
process.env.CIRCLE_ID = 'circle-1';
process.env.LOG_LEVEL = 'error';

const {
  initMilestoneDb,
  claimMilestone,
  getMilestoneRecord,
  getPositionCount,
  markChannelSent,
  markDmMemberSent,
  markDmLeaderSent,
  saveMilestoneMessageId,
  getMilestoneMessagesToDelete,
  clearMilestoneMessageId,
  pruneOldMilestoneMonths,
} = await import('../db/milestoneDb.js');

const MONTH = '2026-05';
const C1 = 'circle-1';
const C2 = 'circle-2';

beforeAll(() => {
  initMilestoneDb();
});

afterAll(() => {
  cleanupDir(tmpDir);
});

// ─── claimMilestone ────────────────────────────────────────────────────────────

describe('claimMilestone()', () => {
  test('returns true on first claim', () => {
    expect(claimMilestone('v001', '10m', MONTH, 1, C1)).toBe(true);
  });

  test('returns false on duplicate claim (same viewer/tier/month/circle)', () => {
    claimMilestone('v002', '20m', MONTH, 1, C1);
    expect(claimMilestone('v002', '20m', MONTH, 1, C1)).toBe(false);
  });

  test('all 7 tier keys are independently claimable', () => {
    const tiers = ['10m', '20m', '30m', '40m', '60m', '80m', '100m'];
    for (const tier of tiers) {
      expect(
        claimMilestone(`v-tier-${tier}`, tier, MONTH, 1, C1),
        `tier ${tier} should be claimable`
      ).toBe(true);
    }
  });

  test('same viewer+tier+month in different circles are independent rows', () => {
    expect(claimMilestone('v003', '30m', MONTH, 1, C1)).toBe(true);
    expect(claimMilestone('v003', '30m', MONTH, 1, C2)).toBe(true);
  });

  test('same viewer+tier in different months are independent rows', () => {
    claimMilestone('v004', '40m', '2026-04', 1, C1);
    expect(claimMilestone('v004', '40m', '2026-05', 1, C1)).toBe(true);
  });
});

// ─── getMilestoneRecord ────────────────────────────────────────────────────────

describe('getMilestoneRecord()', () => {
  test('returns null for a viewer that has never been claimed', () => {
    expect(getMilestoneRecord('never-existed', '10m', MONTH, C1)).toBeNull();
  });

  test('returns the full row after a claim', () => {
    claimMilestone('v005', '60m', MONTH, 1, C1);
    const r = getMilestoneRecord('v005', '60m', MONTH, C1);
    expect(r).not.toBeNull();
    expect(r.viewer_id).toBe('v005');
    expect(r.tier_key).toBe('60m');
    expect(r.month).toBe(MONTH);
    expect(r.circle_id).toBe(C1);
  });

  test('all three send flags default to 0 after a fresh claim', () => {
    claimMilestone('v006', '80m', MONTH, 1, C1);
    const r = getMilestoneRecord('v006', '80m', MONTH, C1);
    expect(r.channel_sent).toBe(0);
    expect(r.dm_member_sent).toBe(0);
    expect(r.dm_leader_sent).toBe(0);
  });

  test('position is stored correctly', () => {
    claimMilestone('v007', '100m', MONTH, 2, C1);
    const r = getMilestoneRecord('v007', '100m', MONTH, C1);
    expect(r.position).toBe(2);
  });
});

// ─── Send-state flags + restart safety ────────────────────────────────────────

describe('send-state flags — restart safety', () => {
  beforeAll(() => {
    claimMilestone('v-restart', '10m', '2026-06', 1, C1);
  });

  test('markChannelSent sets channel_sent = 1, leaves DM flags at 0', () => {
    markChannelSent('v-restart', '10m', '2026-06', C1);
    const r = getMilestoneRecord('v-restart', '10m', '2026-06', C1);
    expect(r.channel_sent).toBe(1);
    expect(r.dm_member_sent).toBe(0);
    expect(r.dm_leader_sent).toBe(0);
  });

  test('markDmMemberSent sets dm_member_sent = 1, leaves leader flag at 0', () => {
    markDmMemberSent('v-restart', '10m', '2026-06', C1);
    const r = getMilestoneRecord('v-restart', '10m', '2026-06', C1);
    expect(r.channel_sent).toBe(1);
    expect(r.dm_member_sent).toBe(1);
    expect(r.dm_leader_sent).toBe(0);
  });

  test('markDmLeaderSent sets dm_leader_sent = 1', () => {
    markDmLeaderSent('v-restart', '10m', '2026-06', C1);
    const r = getMilestoneRecord('v-restart', '10m', '2026-06', C1);
    expect(r.channel_sent).toBe(1);
    expect(r.dm_member_sent).toBe(1);
    expect(r.dm_leader_sent).toBe(1);
  });

  test('simulates crash between channel post and DMs: pending flags preserved', () => {
    claimMilestone('v-crash', '20m', '2026-06', 1, C1);
    markChannelSent('v-crash', '20m', '2026-06', C1);
    const r = getMilestoneRecord('v-crash', '20m', '2026-06', C1);
    expect(r.channel_sent).toBe(1);
    expect(r.dm_member_sent).toBe(0);
    expect(r.dm_leader_sent).toBe(0);
  });

  test('each flag update is independent — marking leader before member works', () => {
    claimMilestone('v-outoforder', '30m', '2026-06', 1, C1);
    markDmLeaderSent('v-outoforder', '30m', '2026-06', C1);
    const r = getMilestoneRecord('v-outoforder', '30m', '2026-06', C1);
    expect(r.channel_sent).toBe(0);
    expect(r.dm_member_sent).toBe(0);
    expect(r.dm_leader_sent).toBe(1);
  });
});

// ─── getPositionCount ──────────────────────────────────────────────────────────

describe('getPositionCount()', () => {
  const TIER = '100m';
  const PMONTH = '2025-01';

  test('returns 0 before any claims', () => {
    expect(getPositionCount(TIER, PMONTH, C1)).toBe(0);
  });

  test('increments correctly with each new claim', () => {
    claimMilestone('pos-v1', TIER, PMONTH, 1, C1);
    expect(getPositionCount(TIER, PMONTH, C1)).toBe(1);
    claimMilestone('pos-v2', TIER, PMONTH, 2, C1);
    expect(getPositionCount(TIER, PMONTH, C1)).toBe(2);
    claimMilestone('pos-v3', TIER, PMONTH, 3, C1);
    expect(getPositionCount(TIER, PMONTH, C1)).toBe(3);
  });

  test('counts are isolated by circle_id', () => {
    claimMilestone('iso-v1', TIER, PMONTH, 1, 'circle-iso');
    expect(getPositionCount(TIER, PMONTH, 'circle-iso')).toBe(1);
    expect(getPositionCount(TIER, PMONTH, 'circle-iso-2')).toBe(0);
  });
});

// ─── Message ID tracking ───────────────────────────────────────────────────────

describe('message ID tracking', () => {
  beforeAll(() => {
    claimMilestone('v-msg', '40m', MONTH, 1, C1);
  });

  test('saveMilestoneMessageId stores guild/channel/message IDs', () => {
    saveMilestoneMessageId('v-msg', '40m', MONTH, 'guild-99', 'chan-88', 'msg-456', C1);
    const r = getMilestoneRecord('v-msg', '40m', MONTH, C1);
    expect(r.guild_id).toBe('guild-99');
    expect(r.channel_id).toBe('chan-88');
    expect(r.channel_msg_id).toBe('msg-456');
  });

  test('clearMilestoneMessageId nulls all three message tracking fields', () => {
    clearMilestoneMessageId('v-msg', '40m', MONTH, C1);
    const r = getMilestoneRecord('v-msg', '40m', MONTH, C1);
    expect(r.guild_id).toBeNull();
    expect(r.channel_id).toBeNull();
    expect(r.channel_msg_id).toBeNull();
  });

  test('getMilestoneMessagesToDelete does not return freshly-fired rows (<24h)', () => {
    saveMilestoneMessageId('v-msg', '40m', MONTH, 'guild-99', 'chan-88', 'msg-fresh', C1);
    const list = getMilestoneMessagesToDelete();
    const found = list.find(r => r.viewer_id === 'v-msg' && r.tier_key === '40m');
    expect(found).toBeUndefined();
  });
});

// ─── pruneOldMilestoneMonths ───────────────────────────────────────────────────

describe('pruneOldMilestoneMonths()', () => {
  test('deletes rows older than keepMonths, keeps current month', () => {
    claimMilestone('v-old', '10m', '2025-10', 1, C1);
    claimMilestone('v-fresh', '10m', MONTH, 1, C1);

    pruneOldMilestoneMonths(2);

    expect(getMilestoneRecord('v-old', '10m', '2025-10', C1)).toBeNull();
    expect(getMilestoneRecord('v-fresh', '10m', MONTH, C1)).not.toBeNull();
  });

  test('is safe to call with no rows to prune', () => {
    expect(() => pruneOldMilestoneMonths(2)).not.toThrow();
  });
});
