/*
  Miner implementation following Miner.md
  - Centralized API config via env
  - Approved endpoints only
  - Exponential backoff with jitter for transient errors
  - Simple rate limiter (per-instance)
  - Returns standardized success/failure envelopes

  Note: Uses global `fetch` when available. For older Node versions install a fetch polyfill e.g. `node-fetch`.
*/

const { URL } = require('url');

const API_CONFIG = {
  baseUrl: process.env.UMA_MOE_API_BASE_URL || process.env.UMAMOE_API_URL || 'https://uma.moe/api',
  timeout: parseInt(process.env.API_TIMEOUT_MS || '30000', 10),
  maxRetries: parseInt(process.env.API_MAX_RETRIES || '3', 10),
  initialBackoffMs: parseInt(process.env.API_RETRY_BACKOFF_MS || '1000', 10),
  maxBackoffMs: parseInt(process.env.API_RETRY_BACKOFF_MS || '60000', 10),
  backoffMultiplier: parseFloat(process.env.API_BACKOFF_MULTIPLIER || '2'),
  jitterRange: parseFloat(process.env.API_RETRY_BACKOFF || '0.1'),
  rateLimitMs: parseInt(process.env.MINER_RATE_LIMIT_MS || '250', 10) // default 4 reqs/sec
};

// Optional API key and verbose debug controls
const API_KEY = process.env.UMA_MOE_API_KEY || process.env.API_KEY || null;
const VERBOSE = (process.env.UMA_MOE_VERBOSE === '1') || (process.env.DEBUG_MINER === '1');

const APPROVED_ENDPOINTS = new Set([
  '/health',
  '/trainers/{id}',
  '/v3/search',
  '/v3/count',
  '/rankings',
  '/stats',
  '/v4/circles',
  '/v4/circles/list',
  '/v4/circles/rank-thresholds',
  '/v4/rankings/monthly',
  '/v4/rankings/alltime',
  '/v4/rankings/gains',
  '/v4/user/profile/{account_id}',
  '/v4/user/profile/veterans/{veteran_id}',
  '/v4/shame/hall',
  '/v4/shame/viewer/{viewer_id}',
  '/ver',
  '/ver/history'
]);

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

// simple per-instance rate limiter (serializes requests)
class RateLimiter{
  constructor(intervalMs){ this.intervalMs = intervalMs; this._last = 0; }
  async wait(){
    const now = Date.now();
    const elapsed = now - this._last;
    if(elapsed < this.intervalMs){
      await sleep(this.intervalMs - elapsed);
    }
    this._last = Date.now();
  }
}

const limiter = new RateLimiter(API_CONFIG.rateLimitMs);

function buildUrl(endpoint, pathParams = {}, queryParams = {}){
  // endpoint must start with '/'
  let path = endpoint;
  Object.keys(pathParams||{}).forEach(k=>{
    path = path.replace(`{${k}}`, encodeURIComponent(pathParams[k]));
  });
  const base = API_CONFIG.baseUrl.replace(/\/$/, '');
  const url = new URL(path, base);
  if(queryParams){
    Object.keys(queryParams).forEach(k=>{
      if(queryParams[k] !== undefined && queryParams[k] !== null){
        url.searchParams.append(k, String(queryParams[k]));
      }
    });
  }
  return url.toString();
}

function isTransientStatus(status){
  return [429, 500, 502, 503, 504].includes(status);
}

function classifyNetworkError(err){
  const msg = (err && err.message) || String(err);
  if(msg && msg.includes('timeout')) return { code: 'NETWORK_TIMEOUT', retriable: true, severity: 'warning' };
  if(msg && (msg.includes('ECONNREFUSED')||msg.includes('ENOTFOUND')||msg.includes('EAI_AGAIN'))) return { code: 'NETWORK_CONNECTION_REFUSED', retriable: true, severity: 'warning' };
  return { code: 'NETWORK_ERROR', retriable: true, severity: 'warning' };
}

async function doFetch(url, options = {}){
  // Support global fetch or require node-fetch lazily
  let fetchFn = global.fetch;
  if(!fetchFn){
    try{ fetchFn = require('node-fetch'); }catch(_){}
  }
  if(!fetchFn) throw new Error('Fetch is not available. Install node-fetch or use Node >=18');

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = API_CONFIG.timeout;
  if(controller){
    setTimeout(()=>controller.abort(), timeout);
    options.signal = controller.signal;
  }

  return fetchFn(url, options);
}

function withJitter(ms){
  const range = API_CONFIG.jitterRange || 0;
  const jitter = (Math.random()*2 -1) * range * ms;
  return Math.max(0, Math.floor(ms + jitter));
}

async function requestWithRetries(url, opts, maxRetries, verbose = false){
  let attempt = 0;
  let backoff = API_CONFIG.initialBackoffMs;
  while(true){
    attempt++;
    try{
      await limiter.wait();
      const resp = await doFetch(url, opts);
      const status = resp.status || 0;
      let text = null;
      try{ text = await resp.text(); }catch(e){ /* ignore */ }
      if(status >=200 && status < 300){
        // parse JSON if possible
        try{
          const json = text ? JSON.parse(text) : null;
          if(verbose) console.debug(`[miner] successful JSON response from ${url} (status ${status})`);
          return { success: true, statusCode: status, body: json };
        }catch(e){
          // include a truncated raw body when verbose to aid debugging
          const rawBody = text ? String(text).substring(0, 8000) : null;
          const hdrs = {};
          try{
            if(resp && resp.headers){
              if(typeof resp.headers.raw === 'function') Object.assign(hdrs, resp.headers.raw());
              else if(typeof resp.headers.forEach === 'function') resp.headers.forEach((v,k)=> hdrs[k]=v);
            }
          }catch(_){ }
          if(verbose || VERBOSE) console.warn('[miner] Invalid JSON response — raw body (truncated):', rawBody);
          return { success: false, error: 'API_INVALID_JSON', message: 'Invalid JSON response', retriable: false, statusCode: status, rawBody, headers: hdrs };
        }
      }

      // non-2xx
      if(isTransientStatus(status)){
        if(attempt <= maxRetries){
          const waitMs = withJitter(Math.min(backoff, API_CONFIG.maxBackoffMs));
          await sleep(waitMs);
          backoff *= API_CONFIG.backoffMultiplier;
          continue;
        }
        return { success: false, error: 'API_INTERNAL_ERROR', message: `HTTP ${status}`, retriable: true, statusCode: status };
      }

      // permanent
      const errCode = status === 400 ? 'API_BAD_REQUEST' : status === 401 ? 'API_UNAUTHORIZED' : status === 403 ? 'API_FORBIDDEN' : status === 404 ? 'API_NOT_FOUND' : 'API_ERROR';
      return { success: false, error: errCode, message: `HTTP ${status}`, retriable: false, statusCode: status };

    }catch(err){
      const classification = classifyNetworkError(err);
      if(attempt <= maxRetries && classification.retriable){
        const waitMs = withJitter(Math.min(backoff, API_CONFIG.maxBackoffMs));
        await sleep(waitMs);
        backoff *= API_CONFIG.backoffMultiplier;
        continue;
      }
      return { success: false, error: classification.code, message: err.message || String(err), retriable: classification.retriable, severity: classification.severity };
    }
  }
}

function endpointIsApproved(endpoint){
  // Normalize e.g. '/api/v3/search' -> '/v3/search'
  // Accept variants that include '/api' prefix
  let transformed = endpoint;
  if(transformed.startsWith('/api')) transformed = transformed.replace(/^\/api/, '');
  // ensure leading '/'
  if(!transformed.startsWith('/')) transformed = '/' + transformed;
  // check dynamic path patterns
  if(transformed.startsWith('/trainers/')) return true;
  if(transformed.startsWith('/v4/user/profile/veterans/')) return true;
  if(transformed.startsWith('/v4/shame/viewer/')) return true;
  if(transformed.startsWith('/v4/user/profile/')) return true;
  return APPROVED_ENDPOINTS.has(transformed);
}

async function callMiner(input){
  // Validate input
  const endpoint = input && input.endpoint;
  if(!endpoint) return { success: false, error: 'MINER_INVALID_INPUT', message: 'Missing endpoint', severity: 'critical', retriable: false, timestamp: new Date().toISOString(), context: {} };

  if(!endpointIsApproved(endpoint)){
    return { success: false, error: 'MINER_ENDPOINT_NOT_APPROVED', message: endpoint, severity: 'critical', retriable: false, timestamp: new Date().toISOString(), context: { endpoint } };
  }

  const pathParams = input.pathParams || {};
  const queryParams = input.queryParams || {};
  const requestBody = input.requestBody;

  // Build final endpoint path: ensure '/api' prefix is used in metadata but baseUrl already contains /api
  const fullPath = endpoint.startsWith('/api') ? endpoint.replace(/^\/api/, '/'): endpoint;
  const url = buildUrl(fullPath, pathParams, queryParams);

  const opts = { method: requestBody ? 'POST' : 'GET', headers: { 'Accept': 'application/json' } };
  if(requestBody){ opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(requestBody); }

  // Attach API key headers when available
  if(API_KEY){
    try{
      opts.headers['Authorization'] = `Bearer ${API_KEY}`;
      opts.headers['X-API-Key'] = API_KEY;
    }catch(_){ }
  }

  const start = new Date();
  const res = await requestWithRetries(url, opts, API_CONFIG.maxRetries, !!(input && input.verbose) || VERBOSE);
  const attempts = res.attempts || undefined;

  if(res.success){
    return {
      success: true,
      data: res.body,
      metadata: {
        endpoint: fullPath,
        statusCode: res.statusCode || res.status || 200,
        timestamp: start.toISOString(),
        source: url,
        attempts: attempts || 1
      }
    };
  }

  // failure envelope
  const timestamp = new Date().toISOString();
  return {
    success: false,
    error: res.error || 'MINER_ERROR',
    message: res.message || `Request failed for ${url}`,
    severity: res.severity || (res.retriable ? 'warning' : 'critical'),
    retriable: !!res.retriable,
    timestamp,
    context: {
      endpoint: fullPath,
      statusCode: res.statusCode || null,
      attempts: attempts || API_CONFIG.maxRetries
    }
  };
}

module.exports = { callMiner, API_CONFIG, endpointIsApproved };
