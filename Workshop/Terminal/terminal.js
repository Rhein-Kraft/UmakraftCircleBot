// Terminal adapter for Workshop deliverables.
// The Terminal stores approved deliverables and provides a stable handoff point for Distribution.

const store = new Map();

function validateDeliverable(deliverable) {
  if (!deliverable || typeof deliverable !== 'object') {
    throw new Error('Terminal requires a valid approved deliverable object.');
  }
  if (!deliverable.id) {
    throw new Error('Terminal deliverable must include an id.');
  }
}

async function receive(deliverable) {
  validateDeliverable(deliverable);

  if (store.has(deliverable.id)) {
    throw new Error(`Terminal already contains deliverable with id ${deliverable.id}`);
  }

  const record = {
    deliverable,
    storedAt: new Date().toISOString(),
    status: 'ready',
    metadata: {
      id: deliverable.id,
      source: deliverable.metadata?.source || null,
    },
  };

  store.set(deliverable.id, record);
  return { success: true, id: deliverable.id, storedAt: record.storedAt };
}

async function storeApproved(deliverable) {
  return receive(deliverable);
}

async function listReady() {
  return Array.from(store.values())
    .filter((entry) => entry.status === 'ready')
    .map((entry) => ({ id: entry.metadata.id, storedAt: entry.storedAt, metadata: entry.metadata }));
}

async function getReleaseMetadata(id) {
  const entry = store.get(id);
  if (!entry) return null;
  return {
    id: entry.metadata.id,
    storedAt: entry.storedAt,
    status: entry.status,
    metadata: entry.metadata,
  };
}

async function retrieve(id) {
  const entry = store.get(id);
  return entry ? entry.deliverable : null;
}

async function remove(id) {
  return store.delete(id);
}

module.exports = function createTerminal() {
  return {
    receive,
    storeApproved,
    listReady,
    getReleaseMetadata,
    retrieve,
    remove,
  };
};
