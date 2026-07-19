const assert = require('assert');
const createInMemoryAdapter = require('../../Umamoe/Vault/adapters/inmemory');

describe('Vault In-memory Adapter', () => {
  it('stores and retrieves by id', async () => {
    const adapter = createInMemoryAdapter();
    const envelope = { trustedData: { id: 't1', fans: 100 }, metadata: { source: 'uma', storedAt: '2026-07-18T00:00:00Z' } };
    const res = await adapter.store(envelope);
    assert.ok(res.success);
    const got = await adapter.getById('t1');
    assert.ok(got);
    assert.strictEqual(got.trustedData.fans, 100);
  });

  it('query filters by id and source', async () => {
    const adapter = createInMemoryAdapter();
    const a = { trustedData: { id: 'a1', fans: 1 }, metadata: { source: 's1' } };
    const b = { trustedData: { id: 'b1', fans: 2 }, metadata: { source: 's2' } };
    await adapter.store(a); await adapter.store(b);
    const q1 = await adapter.query({ id: 'a1' });
    assert.strictEqual(q1.length, 1);
    const q2 = await adapter.query({ source: 's2' });
    assert.strictEqual(q2.length, 1);
  });
});
