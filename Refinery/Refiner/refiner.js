const Vault = require('../../Umamoe/Vault/vault');

const vault = new Vault();

const DEFAULTS = {
  dailyWindowDays: parseInt(process.env.REFINER_DAILY_WINDOW_DAYS || '1', 10),
  weeklyWindowDays: parseInt(process.env.REFINER_WEEKLY_WINDOW_DAYS || '7', 10),
  monthlyWindowDays: parseInt(process.env.REFINER_MONTHLY_WINDOW_DAYS || '30', 10),
  largeDailyGainThreshold: parseInt(process.env.REFINER_LARGE_DAILY_GAIN || '100000', 10),
  refinerVersion: process.env.REFINER_VERSION || 'v1.0'
};

function nowTs(){ return new Date().toISOString(); }

function parseStoredAt(env){
  if(!env || !env.metadata) return null;
  return env.metadata.storedAt || env.metadata.refinedAt || null;
}

function daysAgoDate(days){ const d = new Date(); d.setUTCDate(d.getUTCDate() - days); return d; }

// Test helper: seed snapshots directly into the underlying adapter (bypasses safety)
async function _seedSnapshotForTest(envelope){
  if(!vault || !vault.adapter || !vault.adapter.store) throw new Error('No underlying adapter to seed');
  return await vault.adapter.store(envelope);
}

// Safety: prevent Refiner from writing to the Vault. Override public write methods to fail fast.
['store','update','remove'].forEach(fn=>{
  if(typeof vault[fn] === 'function'){
    vault[fn] = async function(){ throw new Error('Refiner attempted to call Vault.'+fn + ' — Refiner must not write to Vault'); };
  }
});

async function refine(trustedEnvelope){
  if(!trustedEnvelope || !trustedEnvelope.trustedData || !trustedEnvelope.trustedData.id){
    return { success: false, error: 'REFINER_INVALID_INPUT', message: 'Missing trusted envelope or id', severity: 'critical', retriable: false };
  }

  const id = trustedEnvelope.trustedData.id;
  if(!trustedEnvelope.metadata || !trustedEnvelope.metadata.storedAt){
    return { success: false, error: 'REFINER_INVALID_INPUT', message: 'Envelope missing Vault metadata.storedAt', severity: 'critical', retriable: false, context: { id } };
  }

  const q = await vault.query({ id });
  if(!q || !q.success){
    return { success: false, error: 'REFINER_DEPENDENCY_FAILURE', message: 'Failed to read from Vault', retriable: true, timestamp: nowTs(), context: { id } };
  }

  const snapshots = q.data || [];
  const parsed = snapshots.map(s => ({ env: s, ts: new Date(parseStoredAt(s) || s.metadata && s.metadata.refinedAt || s.metadata && s.metadata.storedAt || 0) }));
  parsed.sort((a,b)=> a.ts - b.ts);

  const currentFans = trustedEnvelope.trustedData.fans;
  const currentRank = trustedEnvelope.trustedData.rank;

  function findBefore(date){
    for(let i = parsed.length -1; i>=0; i--){ if(parsed[i].ts < date) return parsed[i].env; }
    return null;
  }

  const now = new Date(parseStoredAt(trustedEnvelope) || Date.now());
  const dailyCut = daysAgoDate(DEFAULTS.dailyWindowDays);
  const weeklyCut = daysAgoDate(DEFAULTS.weeklyWindowDays);
  const monthlyCut = daysAgoDate(DEFAULTS.monthlyWindowDays);

  const prevLatest = findBefore(now);
  const dailySnapshot = findBefore(dailyCut);
  const weeklySnapshot = findBefore(weeklyCut);
  const monthlySnapshot = findBefore(monthlyCut);
  const earliestSnapshot = parsed.length ? parsed[0].env : null;

  function safeFans(env){ try{ return env && env.trustedData && typeof env.trustedData.fans === 'number' ? env.trustedData.fans : null }catch(e){ return null } }
  function safeRank(env){ try{ return env && env.trustedData && typeof env.trustedData.rank === 'number' ? env.trustedData.rank : null }catch(e){ return null } }

  let dailyGain = null, weeklyGain = null, monthlyGain = null, lifetimeGain = null, rankChange = null;
  const flags = [];

  try{
    if(prevLatest){
      const prevFans = safeFans(prevLatest);
      if(prevFans !== null && currentFans !== undefined) dailyGain = currentFans - prevFans;
    }

    if(dailySnapshot){ const f = safeFans(dailySnapshot); if(f!==null) dailyGain = currentFans - f; }
    if(weeklySnapshot){ const f = safeFans(weeklySnapshot); if(f!==null) weeklyGain = currentFans - f; }
    if(monthlySnapshot){ const f = safeFans(monthlySnapshot); if(f!==null) monthlyGain = currentFans - f; }
    if(earliestSnapshot){ const f = safeFans(earliestSnapshot); if(f!==null) lifetimeGain = currentFans - f; }

    const prevRank = safeRank(prevLatest);
    if(prevRank !== null && typeof currentRank === 'number') rankChange = currentRank - prevRank;

    if(typeof dailyGain === 'number' && Math.abs(dailyGain) >= DEFAULTS.largeDailyGainThreshold){ flags.push('large_daily_gain'); }
    if(typeof rankChange === 'number' && Math.abs(rankChange) >= 5){ flags.push('rank_large_change'); }
  }catch(e){
    return { success: false, error: 'REFINER_CALCULATION_ERROR', message: e.message, severity: 'critical', retriable: false, context: { id } };
  }

  const refined = {
    id,
    fans: currentFans,
    dailyGain: typeof dailyGain === 'number' ? dailyGain : null,
    weeklyGain: typeof weeklyGain === 'number' ? weeklyGain : null,
    monthlyGain: typeof monthlyGain === 'number' ? monthlyGain : null,
    lifetimeGain: typeof lifetimeGain === 'number' ? lifetimeGain : null,
    rankChange: typeof rankChange === 'number' ? rankChange : null,
    flags
  };

  const result = {
    success: true,
    refinedResult: refined,
    metadata: {
      sourceStoredAt: trustedEnvelope.metadata && trustedEnvelope.metadata.storedAt,
      refinedAt: nowTs(),
      refinerVersion: DEFAULTS.refinerVersion
    }
  };

  if(process.env.REFINER_VERBOSE === '1') console.log('[refiner] refined', JSON.stringify(result, null, 2));

  return result;
}

async function refineBatch(envelopes){
  const results = [];
  for(const env of envelopes){ results.push(await refine(env)); }
  return { success: true, results };
}

module.exports = { refine, refineBatch, _internal: { vault, seedSnapshot: _seedSnapshotForTest } };
