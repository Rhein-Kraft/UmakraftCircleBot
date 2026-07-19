// Simple in-memory Depot adapter implementation for local development
const store = new Map(); // key -> { id, version, product, provenance }

function latestEntryForId(id){
  const entries = Array.from(store.values()).filter(e => e.id === id);
  if(!entries.length) return null;
  entries.sort((a,b) => (a.version < b.version ? 1 : -1));
  return entries[0];
}

async function put(product){
  if(!product || !product.id || !product.version) throw new Error('INVALID_PRODUCT');
  const key = `${product.id}:${product.version}`;
  store.set(key, { id: product.id, version: product.version, product, provenance: product.provenance || null });
  return { success: true, storedAt: new Date().toISOString() };
}

async function get(id, options = {}){
  if(options.version){
    const key = `${id}:${options.version}`;
    const entry = store.get(key);
    return entry ? entry.product : null;
  }
  const entry = latestEntryForId(id);
  return entry ? entry.product : null;
}

async function del(id, options = {}){
  if(options.version){
    const key = `${id}:${options.version}`;
    const removed = store.delete(key);
    return { success: removed };
  }
  const keys = Array.from(store.keys()).filter(k => k.startsWith(id+':'));
  let deleted = 0;
  for(const k of keys){ if(store.delete(k)) deleted++; }
  return { success: true, deleted };
}

async function query(filter = {}, options = {}){
  const results = Array.from(store.values()).map(e => e.product).filter(p => {
    if(filter.id && p.id !== filter.id) return false;
    return true;
  });
  return { results };
}

module.exports = function createDepotAdapter(){
  return { put, get, del, query };
};
