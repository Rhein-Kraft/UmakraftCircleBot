// Simple in-memory Vault storage adapter for development and tests
module.exports = function createInMemoryAdapter(){
  const store = new Map(); // key -> { id, version, envelope }

  function latestEntryForId(id){
    const entries = Array.from(store.values()).filter(e => e.id === id);
    if(!entries.length) return null;
    entries.sort((a,b) => (a.version < b.version ? 1 : -1));
    return entries[0];
  }

  return {
    async store(envelope){
      if(!envelope || !envelope.trustedData || !envelope.trustedData.id) throw new Error('INVALID_ENVELOPE');
      const id = envelope.trustedData.id;
      const version = (envelope.metadata && envelope.metadata.storedAt) || new Date().toISOString();
      const key = `${id}:${version}`;
      store.set(key, { id, version, envelope });
      return { success: true, storedAt: version };
    },

    async getById(id){
      const entry = latestEntryForId(id);
      return entry ? entry.envelope : null;
    },

    async getAll(){
      return Array.from(store.values()).map(e => e.envelope);
    },

    async query(criteria = {}){
      // naive query: support id and metadata.source
      const values = Array.from(store.values()).map(e => e.envelope);
      return values.filter(envelope => {
        if(criteria.id && envelope.trustedData && envelope.trustedData.id !== criteria.id) return false;
        if(criteria.source && envelope.metadata && envelope.metadata.source !== criteria.source) return false;
        return true;
      });
    },

    async update(id, patch){
      const entry = latestEntryForId(id);
      if(!entry) return { success: false, error: 'NOT_FOUND' };
      const existing = entry.envelope;
      const merged = {
        trustedData: Object.assign({}, existing.trustedData, patch.trustedData || {}),
        metadata: Object.assign({}, existing.metadata, patch.metadata || {})
      };
      const version = (merged.metadata && merged.metadata.storedAt) || new Date().toISOString();
      const key = `${id}:${version}`;
      store.set(key, { id, version, envelope: merged });
      return { success: true, storedAt: version };
    },

    async remove(id, options = {}){
      const keys = Array.from(store.keys()).filter(k => k.startsWith(id + ':'));
      if(options.version){
        const key = `${id}:${options.version}`;
        const removed = store.delete(key);
        return { success: removed };
      }
      let deleted = 0;
      for(const k of keys){ if(store.delete(k)) deleted++; }
      return { success: true, deleted };
    }
  };
};
