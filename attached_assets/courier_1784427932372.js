// Courier implementation following Courier.md

function validateTransportability(input){
  if(input === null || input === undefined){
    return { transportable: false, reason: 'TRANSPORT_INVALID_INPUT: Input is null or undefined' };
  }
  if(typeof input !== 'object' || Array.isArray(input)){
    return { transportable: false, reason: `TRANSPORT_INVALID_INPUT: Input is ${typeof input}, expected object` };
  }
  if(!('success' in input)){
    return { transportable: false, reason: 'TRANSPORT_INVALID_INPUT: Missing required field "success"' };
  }
  if(input.success === true && !('data' in input)){
    return { transportable: false, reason: 'TRANSPORT_INVALID_INPUT: Success result missing "data" field' };
  }
  if(input.success === false && !('error' in input)){
    return { transportable: false, reason: 'TRANSPORT_INVALID_INPUT: Failure result missing "error" field' };
  }
  return { transportable: true };
}

function isoNow(){ return new Date().toISOString(); }

function log(level, message, details){
  const ts = isoNow();
  console.log(`[${ts}] ${level} courier: ${message}`);
  if(details) console.log(JSON.stringify(details, null, 2));
}

function logInfo(message, details){ log('INFO', message, details); }
function logWarn(message, details){ log('WARN', message, details); }
function logError(message, details){ log('ERROR', message, details); }

async function transport(minerResult, inspector){
  const validation = validateTransportability(minerResult);
  if(!validation.transportable){
    logError('Invalid input received', { reason: validation.reason });
    return {
      success: false,
      error: 'TRANSPORT_INVALID_INPUT',
      message: validation.reason,
      severity: 'critical',
      retriable: false,
      timestamp: isoNow(),
      context: { originalInput: minerResult }
    };
  }

  const endpoint = minerResult && minerResult.metadata && minerResult.metadata.endpoint;
  const source = minerResult && minerResult.metadata && minerResult.metadata.source;

  // Miner failure passthrough
  if(minerResult.success === false){
    logWarn('Transporting Miner error', { error: minerResult.error, endpoint: minerResult.context && minerResult.context.endpoint, source });
    return minerResult; // passthrough unchanged
  }

  // require inspector
  if(!inspector || typeof inspector.receive !== 'function'){
    logError('Inspector uninitialized or missing', { minerResult });
    return {
      success: false,
      error: 'TRANSPORT_UNINITIALIZED',
      message: 'Inspector module not initialized',
      severity: 'critical',
      retriable: false,
      timestamp: isoNow(),
      context: {}
    };
  }

  // Attempt delivery
  try{
    const start = Date.now();
    const inspectorResult = await inspector.receive(minerResult);
    const durationMs = Date.now() - start;
    logInfo('Transport successful', { endpoint, source, durationMs });
    return inspectorResult;
  }catch(err){
    logWarn('Transport delivery failed', { message: err && err.message });
    return {
      success: false,
      error: 'TRANSPORT_DELIVERY_FAILED',
      message: `Failed to deliver to Inspector: ${err && err.message}`,
      severity: 'warning',
      retriable: true,
      timestamp: isoNow(),
      context: { originalError: err && err.message }
    };
  }
}

module.exports = { transport, validateTransportability, logInfo, logWarn, logError };
