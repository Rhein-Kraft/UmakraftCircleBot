const Vault = require('../Vault/vault');
const vault = new Vault();

function isoNow(){ return new Date().toISOString(); }
function log(level, message, details){
  console.log(`[${isoNow()}] ${level} inspector: ${message}`);
  if(details) console.log(JSON.stringify(details, null, 2));
}

function validateExistence(data){
  if(data === null || data === undefined) return { passed: false, reason: 'EXISTENCE_FAILURE: Data is null or undefined' };
  if(typeof data !== 'object' || Array.isArray(data)) return { passed: false, reason: 'EXISTENCE_FAILURE: Data is not an object or is an array' };
  if(Object.keys(data).length === 0) return { passed: false, reason: 'EXISTENCE_FAILURE: Data is empty object' };
  return { passed: true };
}

function validateStructure(data){
  if(typeof data !== 'object' || Array.isArray(data)) return { passed: false, reason: 'STRUCTURE_FAILURE: Expected object, got array or primitive' };
  if(Object.keys(data).length === 0) return { passed: false, reason: 'STRUCTURE_FAILURE: Object has no properties' };
  return { passed: true };
}

function isIntegerNumber(v){ return typeof v === 'number' && Number.isInteger(v); }

function validateMetadata(metadata){
  if(!metadata || typeof metadata !== 'object'){
    return { passed: false, reason: 'METADATA_FAILURE: Missing metadata object' };
  }
  if(typeof metadata.endpoint !== 'string' || metadata.endpoint.trim() === ''){
    return { passed: false, reason: 'METADATA_FAILURE: Missing endpoint metadata' };
  }
  if(typeof metadata.statusCode !== 'number'){
    return { passed: false, reason: 'METADATA_FAILURE: Missing statusCode metadata' };
  }
  return { passed: true };
}

async function receive(input){
  // Pass through error results unchanged
  if(input && input.success === false){
    log('WARN', 'Error result received, passing through', { error: input.error, context: input.context });
    return input;
  }

  const data = input && input.data;
  const metadata = input && input.metadata;

  // Category 1
  let res = validateExistence(data);
  if(!res.passed){ log('INFO', 'Validation failed - existence', { reason: res.reason, data }); return { passed: false, originalData: data, reason: res.reason }; }

  // Category 2
  res = validateStructure(data);
  if(!res.passed){ log('WARN', 'Validation failed - structure', { reason: res.reason, data }); return { passed: false, originalData: data, reason: res.reason }; }

  // Metadata validation
  res = validateMetadata(metadata);
  if(!res.passed){ log('WARN', 'Validation failed - metadata', { reason: res.reason, metadata }); return { passed: false, originalData: data, reason: res.reason }; }

  // Passed all validations — store trusted envelope in Vault
  log('INFO', 'Validation successful - accepting data', { endpoint: metadata.endpoint });
  const envelope = { trustedData: data, metadata: Object.assign({}, metadata, { inspectedAt: isoNow(), storedAt: isoNow() }) };
  const storeResult = await vault.store(envelope);
  if(storeResult && storeResult.success){
    log('INFO', 'Stored trusted data in Vault', { id: data.id, storedAt: storeResult.storedAt });
  } else {
    log('ERROR', 'Failed to store in Vault', { id: data.id, storeResult });
  }

  return { passed: true, originalData: data, reason: null, vault: storeResult };
}

module.exports = { receive, validateExistence, validateStructure, validateCompleteness, validateTypeIntegrity, validateRangeIntegrity };
