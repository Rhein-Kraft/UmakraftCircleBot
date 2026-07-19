const createDepot = require('../Depot/depot');

const depot = createDepot();

function nowTs(){ return new Date().toISOString(); }

function mergeEnvelopes(envelopes){
  // Simple merge: later refinedAt wins for scalar fields; objects are shallow-merged
  const compiled = { profile: {}, stats: {} };
  const provenance = [];
  const fieldSources = {}; // track source refinedAt for conflict resolution

  for(const env of envelopes){
    const refined = env && env.refinedResult ? env.refinedResult : {};
    const meta = env && env.metadata ? env.metadata : {};
    provenance.push({ refinerVersion: meta.refinerVersion || null, refinedAt: meta.refinedAt || null });

    // merge known buckets
    if(refined.profile && typeof refined.profile === 'object'){
      Object.keys(refined.profile).forEach(k=>{
        const key = `profile.${k}`;
        const existingAt = fieldSources[key];
        const candidateAt = meta.refinedAt || nowTs();
        if(!existingAt || candidateAt > existingAt){ compiled.profile[k] = refined.profile[k]; fieldSources[key] = candidateAt; }
      });
    }

    if(refined.stats && typeof refined.stats === 'object'){
      Object.keys(refined.stats).forEach(k=>{
        const key = `stats.${k}`;
        const existingAt = fieldSources[key];
        const candidateAt = meta.refinedAt || nowTs();
        if(!existingAt || candidateAt > existingAt){ compiled.stats[k] = refined.stats[k]; fieldSources[key] = candidateAt; }
      });
    }

    // flat numeric/scalar fields go into stats by default
    Object.keys(refined).forEach(k=>{
      if(['profile','stats'].includes(k)) return;
      const key = `stats.${k}`;
      const existingAt = fieldSources[key];
      const candidateAt = meta.refinedAt || nowTs();
      if(!existingAt || candidateAt > existingAt){ compiled.stats[k] = refined[k]; fieldSources[key] = candidateAt; }
    });
  }

  const id = compiled.stats.id || (envelopes[0] && envelopes[0].refinedResult && envelopes[0].refinedResult.id) || null;
  return { compiled, provenance, id };
}

async function compile(envelopes, template){
  if(!envelopes || (Array.isArray(envelopes) && envelopes.length===0)){
    return { success: false, error: 'COMPILER_INVALID_INPUT', message: 'No envelopes provided', retriable: false };
  }

  const arr = Array.isArray(envelopes) ? envelopes : [envelopes];
  const { compiled, provenance, id } = mergeEnvelopes(arr);

  const compiledAt = nowTs();
  const product = {
    compiledProduct: Object.assign({ id, version: compiledAt }, compiled),
    provenance: Object.assign({ sources: provenance, compiledAt, compilerVersion: 'v1.0' })
  };

  return { success: true, compiledProduct: product.compiledProduct, provenance: product.provenance };
}

async function compileAndStore(envelopes, template){
  const res = await compile(envelopes, template);
  if(!res.success) return res;
  const toStore = { id: res.compiledProduct.id, version: res.compiledProduct.version, compiledProduct: res.compiledProduct, provenance: res.provenance };
  try{
    const put = await depot.put(toStore);
    if(!put || !put.success) return { success: false, error: 'COMPILER_PERSISTENCE_FAILURE', message: 'Depot put failed', retriable: true };
    return { success: true, compiledProduct: res.compiledProduct, storedAt: put.storedAt };
  }catch(err){
    return { success: false, error: 'COMPILER_PERSISTENCE_FAILURE', message: err.message, retriable: true };
  }
}

async function compileBatch(jobs){
  const results = [];
  for(const job of jobs){
    results.push(await compileAndStore(job.envelopes, job.template));
  }
  return { success: true, results };
}

module.exports = { compile, compileAndStore, compileBatch };
