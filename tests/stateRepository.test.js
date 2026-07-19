/**
 * Integration tests for repositories/stateRepository.js
 *
 * Tests the full chain: stateRepository → store → storeDb → SQLite.
 * Uses a real temp SQLite database — no mocking.
 */
import { describe, test, expect, afterAll } from 'vitest';
import { makeTempDir, cleanupDir } from './helpers/tempDb.js';

const tmpDir = makeTempDir();
process.env.DATA_DIR = tmpDir;
process.env.DISCORD_TOKEN = 'test-token';
process.env.CIRCLE_ID = '000000001';
process.env.LOG_LEVEL = 'error';

const { store } = await import('../core/store.js');
await store.init();

const { stateRepository } = await import('../repositories/stateRepository.js');

afterAll(() => {
  cleanupDir(tmpDir);
});

describe('stateRepository.get()', () => {
  test('returns null for an unknown key when no default is provided', async () => {
    const val = await stateRepository.get('key-that-does-not-exist');
    expect(val).toBeNull();
  });

  test('returns the supplied default for an unknown key', async () => {
    const val = await stateRepository.get('missing-key', 'fallback');
    expect(val).toBe('fallback');
  });

  test('returns a numeric default', async () => {
    const val = await stateRepository.get('missing-numeric', 0);
    expect(val).toBe(0);
  });
});

describe('stateRepository.set() + get()', () => {
  test('stores and retrieves a string value', async () => {
    await stateRepository.set('str-key', 'hello-world');
    expect(await stateRepository.get('str-key')).toBe('hello-world');
  });

  test('stores and retrieves a number', async () => {
    await stateRepository.set('num-key', 42);
    expect(await stateRepository.get('num-key')).toBe(42);
  });

  test('stores and retrieves a boolean true', async () => {
    await stateRepository.set('bool-true', true);
    expect(await stateRepository.get('bool-true')).toBe(true);
  });

  test('stores and retrieves boolean false (not confused with null)', async () => {
    await stateRepository.set('bool-false', false);
    expect(await stateRepository.get('bool-false')).toBe(false);
  });

  test('stores and retrieves a plain object', async () => {
    const obj = { count: 3, active: true, label: 'test' };
    await stateRepository.set('obj-key', obj);
    const retrieved = await stateRepository.get('obj-key');
    expect(retrieved).toEqual(obj);
  });

  test('stores and retrieves an array', async () => {
    const arr = [1, 'two', { three: 3 }];
    await stateRepository.set('arr-key', arr);
    const retrieved = await stateRepository.get('arr-key');
    expect(retrieved).toEqual(arr);
  });

  test('overwriting a key replaces the value', async () => {
    await stateRepository.set('overwrite-key', 'original');
    await stateRepository.set('overwrite-key', 'updated');
    expect(await stateRepository.get('overwrite-key')).toBe('updated');
  });

  test('different keys are independent', async () => {
    await stateRepository.set('key-x', 'value-x');
    await stateRepository.set('key-y', 'value-y');
    expect(await stateRepository.get('key-x')).toBe('value-x');
    expect(await stateRepository.get('key-y')).toBe('value-y');
  });

  test('stored value overrides default when key exists', async () => {
    await stateRepository.set('exists-key', 'real-value');
    const val = await stateRepository.get('exists-key', 'fallback');
    expect(val).toBe('real-value');
  });
});
