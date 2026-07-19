# Error Handling Specification

## Purpose

This document defines how errors are detected, classified, reported, and handled throughout the UmaMoe pipeline. Each department (Miner, Courier, Inspector, Vault) must implement error handling according to this specification.

Errors must be:
- **Detected** — Clearly identified when they occur
- **Classified** — Categorized by type and severity
- **Reported** — Communicated with clear, actionable information
- **Handled** — Addressed according to error type (retry, fail, log)

---

## Error Classification

All errors in the UmaMoe pipeline fall into three categories:

### 1. Transient Errors (Retriable)

**Definition:** Temporary failures that may succeed if retried.

**Characteristics:**
- Network-related
- Time-dependent
- May resolve without code changes
- Safe to retry

**Examples:**
- Network timeout
- Connection refused (API temporarily down)
- Rate limit exceeded (429)
- Server error (5xx)

**Miner Action:** Retry with exponential backoff  
**Courier Action:** Retry transport  
**Inspector Action:** Fail and report  
**Vault Action:** Retry with backoff

---

### 2. Permanent Errors (Non-Retriable)

**Definition:** Failures that will not succeed if retried without external intervention.

**Characteristics:**
- Configuration or code issue
- Invalid input or parameters
- Authorization failure
- Resource not found (in context of specific data)

**Examples:**
- Invalid API parameters (400 Bad Request)
- Invalid/missing authentication (401 Unauthorized)
- Access denied (403 Forbidden)
- Trainer ID does not exist (404 Not Found in specific context)

**Miner Action:** Log error, do NOT retry, continue with next request  
**Courier Action:** Fail and report  
**Inspector Action:** Reject data  
**Vault Action:** Do NOT retry, report failure

---

### 3. Data Errors (Inspector/Vault)

**Definition:** Issues with data content or structure.

**Characteristics:**
- Data validation failures
- Incomplete information
- Type mismatches
- Business logic violations

**Examples:**
- Missing required field
- Invalid data type
- Malformed JSON
- Out-of-range values

**Miner Action:** Pass to Courier (Miner doesn't validate)  
**Courier Action:** Transport unchanged  
**Inspector Action:** Reject with reason  
**Vault Action:** Do NOT store rejected data

---

## Error Result Format

All departments must return errors in a consistent format:

### Standard Error Result Object

```javascript
{
  success: false,
  error: "ERROR_CODE",
  message: "Human-readable description",
  severity: "critical|warning|info",
  retriable: true|false,
  originalError: Error,
  timestamp: "2026-07-18T12:34:56Z",
  context: {
    // Department-specific context
  }
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | boolean | ✅ Yes | Always `false` for errors |
| `error` | string | ✅ Yes | Machine-readable error code (SCREAMING_SNAKE_CASE) |
| `message` | string | ✅ Yes | Human-readable error description |
| `severity` | string | ✅ Yes | `critical` (stop), `warning` (log), `info` (log) |
| `retriable` | boolean | ✅ Yes | `true` if safe to retry, `false` if permanent |
| `originalError` | Error | ❌ No | Original error object (if available) |
| `timestamp` | string | ✅ Yes | ISO 8601 timestamp when error occurred |
| `context` | object | ❌ No | Department-specific context |

### Example Error Result

```javascript
{
  success: false,
  error: "API_RATE_LIMIT_EXCEEDED",
  message: "uma.moe API rate limit exceeded. Retry after 60 seconds.",
  severity: "warning",
  retriable: true,
  timestamp: "2026-07-18T12:34:56Z",
  context: {
    endpoint: "/api/trainers/alice-001",
    retryAfterSeconds: 60,
    remainingRequests: 0,
    resetTime: "2026-07-18T12:35:56Z"
  }
}
```

---

## Miner Error Handling

The Miner is responsible for acquiring data from uma.moe API. It must detect and classify failures during acquisition.

### Miner Error Types

#### 1. Network Errors

**Cause:** Network connectivity issues

| Error | Code | Retriable | Action | Message |
|-------|------|-----------|--------|---------|
| Connection refused | `NETWORK_CONNECTION_REFUSED` | ✅ Yes | Retry with backoff | "Connection to uma.moe API refused. API may be temporarily down." |
| Timeout | `NETWORK_TIMEOUT` | ✅ Yes | Retry with backoff | "Request to uma.moe API timed out after 30 seconds." |
| DNS resolution failed | `NETWORK_DNS_FAILED` | ✅ Yes | Retry with backoff | "DNS resolution for uma.moe failed." |
| No internet | `NETWORK_OFFLINE` | ✅ Yes | Retry with backoff | "No internet connectivity available." |

**Miner Implementation:**

```javascript
try {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    timeout: 30000  // 30 second timeout
  });
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    return {
      success: false,
      error: 'NETWORK_CONNECTION_REFUSED',
      message: 'Connection to uma.moe API refused. API may be temporarily down.',
      severity: 'warning',
      retriable: true,
      timestamp: new Date().toISOString(),
      context: { endpoint }
    };
  }
  // ... handle other network errors
}
```

---

#### 2. API Response Errors (HTTP Status Codes)

**Cause:** uma.moe API returns error status code

| Status | Error Code | Retriable | Action | Description |
|--------|-----------|-----------|--------|-------------|
| 400 | `API_BAD_REQUEST` | ❌ No | Log, don't retry | Invalid request parameters |
| 401 | `API_UNAUTHORIZED` | ❌ No | Log, don't retry | Invalid/missing API key |
| 403 | `API_FORBIDDEN` | ❌ No | Log, don't retry | Access denied |
| 404 | `API_NOT_FOUND` | ❌ No | Log, continue | Trainer/resource doesn't exist |
| 429 | `API_RATE_LIMIT_EXCEEDED` | ✅ Yes | Backoff and retry | Rate limit exceeded |
| 500 | `API_INTERNAL_ERROR` | ✅ Yes | Retry with backoff | Server error |
| 502 | `API_BAD_GATEWAY` | ✅ Yes | Retry with backoff | Bad gateway |
| 503 | `API_SERVICE_UNAVAILABLE` | ✅ Yes | Retry with backoff | Service unavailable (maintenance) |
| 504 | `API_GATEWAY_TIMEOUT` | ✅ Yes | Retry with backoff | Gateway timeout |

**Miner Implementation:**

```javascript
const response = await fetch(`${baseUrl}${endpoint}`);

if (!response.ok) {
  const errorData = await response.json();
  
  const errorMap = {
    400: { code: 'API_BAD_REQUEST', retriable: false },
    401: { code: 'API_UNAUTHORIZED', retriable: false },
    403: { code: 'API_FORBIDDEN', retriable: false },
    404: { code: 'API_NOT_FOUND', retriable: false },
    429: { code: 'API_RATE_LIMIT_EXCEEDED', retriable: true },
    500: { code: 'API_INTERNAL_ERROR', retriable: true },
    502: { code: 'API_BAD_GATEWAY', retriable: true },
    503: { code: 'API_SERVICE_UNAVAILABLE', retriable: true },
    504: { code: 'API_GATEWAY_TIMEOUT', retriable: true }
  };
  
  const errorInfo = errorMap[response.status] || { code: 'API_UNKNOWN_ERROR', retriable: true };
  
  return {
    success: false,
    error: errorInfo.code,
    message: `API returned ${response.status}: ${errorData.message}`,
    severity: errorInfo.retriable ? 'warning' : 'critical',
    retriable: errorInfo.retriable,
    timestamp: new Date().toISOString(),
    context: {
      statusCode: response.status,
      endpoint,
      retryAfterSeconds: response.headers.get('Retry-After')
    }
  };
}
```

---

#### 3. Data Format Errors

**Cause:** API response is not valid JSON or doesn't contain expected structure

| Error | Code | Retriable | Action | Message |
|-------|------|-----------|--------|---------|
| Invalid JSON | `API_INVALID_JSON` | ❌ No | Log, don't retry | Response is not valid JSON |
| Empty response | `API_EMPTY_RESPONSE` | ❌ No | Log as info | API returned empty/null response |
| Unexpected structure | `API_UNEXPECTED_STRUCTURE` | ❌ No | Log, don't retry | Response doesn't match expected format |

**Miner Implementation:**

```javascript
let data;
try {
  data = await response.json();
} catch (error) {
  return {
    success: false,
    error: 'API_INVALID_JSON',
    message: 'API response is not valid JSON',
    severity: 'critical',
    retriable: false,
    timestamp: new Date().toISOString(),
    context: { endpoint, parseError: error.message }
  };
}

if (!data || (Array.isArray(data) && data.length === 0)) {
  return {
    success: false,
    error: 'API_EMPTY_RESPONSE',
    message: 'API returned empty response',
    severity: 'info',
    retriable: false,
    timestamp: new Date().toISOString(),
    context: { endpoint }
  };
}
```

---

#### 4. Miner Success Result

When Miner successfully acquires data, it returns:

```javascript
{
  success: true,
  data: {
    // Raw API response
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45
  },
  metadata: {
    endpoint: "/api/trainers/alice-001",
    statusCode: 200,
    timestamp: "2026-07-18T12:34:56Z",
    source: "https://uma.moe/api/trainers/alice-001"
  }
}
```

---

## Retry Strategy

### Exponential Backoff

For transient errors, implement exponential backoff:

```
Attempt 1: Wait 1 second, then retry
Attempt 2: Wait 2 seconds, then retry
Attempt 3: Wait 4 seconds, then retry
Attempt 4: Wait 8 seconds, then retry
Max Wait: 60 seconds (don't exceed)
```

### Retry Configuration

```javascript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterRange: 0.1  // Add ±10% random jitter
};
```

### Retry Implementation

```javascript
async function acquireWithRetry(endpoint, maxRetries = 3) {
  let lastError = null;
  let delayMs = RETRY_CONFIG.initialDelayMs;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await miner.acquire(endpoint);
    
    if (result.success) {
      return result;  // Success, stop retrying
    }
    
    if (!result.retriable) {
      return result;  // Permanent error, don't retry
    }
    
    lastError = result;
    
    if (attempt < maxRetries - 1) {
      // Add jitter to prevent thundering herd
      const jitter = delayMs * (1 + (Math.random() - 0.5) * RETRY_CONFIG.jitterRange);
      console.log(`Retry attempt ${attempt + 1} after ${Math.ceil(jitter)}ms`);
      await sleep(jitter);
      
      // Calculate next delay with exponential backoff
      delayMs = Math.min(
        delayMs * RETRY_CONFIG.backoffMultiplier,
        RETRY_CONFIG.maxDelayMs
      );
    }
  }
  
  return lastError;  // All retries exhausted
}
```

### Rate Limit Handling

For HTTP 429 (Too Many Requests), respect the `Retry-After` header:

```javascript
const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
console.log(`Rate limited. Waiting ${retryAfter} seconds before retry.`);
await sleep(retryAfter * 1000);
```

---

## Courier Error Handling

The Courier is responsible for transporting data between Miner and Inspector.

### Courier Error Types

#### 1. Transport Failures

**Cause:** Cannot deliver data to Inspector

| Error | Code | Retriable | Action |
|-------|------|-----------|--------|
| Invalid input | `TRANSPORT_INVALID_INPUT` | ❌ No | Fail, report, don't retry |
| Delivery failed | `TRANSPORT_DELIVERY_FAILED` | ✅ Yes | Retry with backoff |
| Timeout | `TRANSPORT_TIMEOUT` | ✅ Yes | Retry with backoff |

**Courier Implementation:**

```javascript
function transport(data) {
  // Validate input
  if (!data || typeof data !== 'object') {
    return {
      success: false,
      error: 'TRANSPORT_INVALID_INPUT',
      message: 'Courier received invalid data from Miner',
      severity: 'critical',
      retriable: false,
      timestamp: new Date().toISOString(),
      context: { receivedType: typeof data }
    };
  }
  
  try {
    // Transport to Inspector
    const result = inspector.receive(data);
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: 'TRANSPORT_DELIVERY_FAILED',
      message: 'Courier failed to deliver data to Inspector',
      severity: 'warning',
      retriable: true,
      timestamp: new Date().toISOString(),
      context: { originalError: error.message }
    };
  }
}
```

#### 2. Courier Success Result

```javascript
{
  success: true,
  deliveredData: { /* transported data */ },
  timestamp: "2026-07-18T12:34:56Z"
}
```

---

## Inspector Error Handling

The Inspector is responsible for validating data. It does NOT retry; it rejects or accepts.

### Inspector Error Types

#### 1. Validation Failures

**Cause:** Data fails validation checks

| Error | Code | Severity | Action |
|-------|------|----------|--------|
| Missing required field | `VALIDATION_INCOMPLETE_DATA` | warning | REJECT |
| Invalid type | `VALIDATION_INVALID_TYPE` | warning | REJECT |
| Out of range | `VALIDATION_OUT_OF_RANGE` | warning | REJECT |
| Invalid structure | `VALIDATION_INVALID_STRUCTURE` | warning | REJECT |
| Empty response | `VALIDATION_EMPTY_RESPONSE` | info | REJECT |

**Inspector Implementation:**

```javascript
function inspect(data) {
  // Check existence
  if (!data) {
    return {
      passed: false,
      originalData: null,
      reason: 'VALIDATION_EMPTY_RESPONSE: Data is empty or null'
    };
  }
  
  // Check structure
  if (typeof data !== 'object' || Array.isArray(data)) {
    return {
      passed: false,
      originalData: data,
      reason: 'VALIDATION_INVALID_STRUCTURE: Expected object, got ' + typeof data
    };
  }
  
  // Check required fields
  const required = ['id', 'name', 'fans', 'rank'];
  for (const field of required) {
    if (!(field in data)) {
      return {
        passed: false,
        originalData: data,
        reason: `VALIDATION_INCOMPLETE_DATA: Missing required field '${field}'`
      };
    }
  }
  
  // Check types
  if (typeof data.fans !== 'number') {
    return {
      passed: false,
      originalData: data,
      reason: `VALIDATION_INVALID_TYPE: Field 'fans' must be number, got ${typeof data.fans}`
    };
  }
  
  if (typeof data.rank !== 'number') {
    return {
      passed: false,
      originalData: data,
      reason: `VALIDATION_INVALID_TYPE: Field 'rank' must be number, got ${typeof data.rank}`
    };
  }
  
  // Check ranges
  if (data.fans < 0) {
    return {
      passed: false,
      originalData: data,
      reason: `VALIDATION_OUT_OF_RANGE: Field 'fans' cannot be negative`
    };
  }
  
  if (data.rank < 1 || data.rank > 100) {
    return {
      passed: false,
      originalData: data,
      reason: `VALIDATION_OUT_OF_RANGE: Field 'rank' must be 1-100, got ${data.rank}`
    };
  }
  
  // All checks passed
  return {
    passed: true,
    originalData: data,
    reason: null
  };
}
```

#### 2. Inspector Result Format

**Rejected:**
```javascript
{
  passed: false,
  originalData: { /* unmodified data */ },
  reason: "VALIDATION_INVALID_TYPE: Field 'fans' must be number, got string"
}
```

**Accepted:**
```javascript
{
  passed: true,
  originalData: { /* unmodified data */ },
  reason: null
}
```

---

## Vault Error Handling

The Vault is responsible for persistent storage.

### Vault Error Types

#### 1. Storage Failures

| Error | Code | Retriable | Action |
|-------|------|-----------|--------|
| Storage unavailable | `STORAGE_UNAVAILABLE` | ✅ Yes | Retry with backoff |
| Invalid data | `STORAGE_INVALID_DATA` | ❌ No | Log and report |
| Permission denied | `STORAGE_PERMISSION_DENIED` | ❌ No | Log and report |
| Disk full | `STORAGE_DISK_FULL` | ❌ No | Log and alert |
| Duplicate key | `STORAGE_DUPLICATE_KEY` | ❌ No | Handle per policy |

**Vault Implementation:**

```javascript
async function store(data) {
  if (!data || !data.id) {
    return {
      success: false,
      error: 'STORAGE_INVALID_DATA',
      message: 'Cannot store data without ID',
      severity: 'critical',
      retriable: false,
      timestamp: new Date().toISOString()
    };
  }
  
  try {
    // Attempt storage
    const stored = await database.insert({
      trainerId: data.id,
      name: data.name,
      fans: data.fans,
      rank: data.rank,
      storedAt: new Date().toISOString()
    });
    
    return {
      success: true,
      storageId: stored.id,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    if (error.code === 'DISK_FULL') {
      return {
        success: false,
        error: 'STORAGE_DISK_FULL',
        message: 'Storage device is full',
        severity: 'critical',
        retriable: false,
        timestamp: new Date().toISOString()
      };
    }
    
    if (error.code === 'EACCES') {
      return {
        success: false,
        error: 'STORAGE_PERMISSION_DENIED',
        message: 'Permission denied to storage location',
        severity: 'critical',
        retriable: false,
        timestamp: new Date().toISOString()
      };
    }
    
    // Treat as transient (database connection issue, etc.)
    return {
      success: false,
      error: 'STORAGE_UNAVAILABLE',
      message: 'Storage is temporarily unavailable',
      severity: 'warning',
      retriable: true,
      timestamp: new Date().toISOString(),
      context: { originalError: error.message }
    };
  }
}
```

#### 2. Vault Success Result

```javascript
{
  success: true,
  storageId: "storage-uuid-12345",
  timestamp: "2026-07-18T12:34:56Z"
}
```

---

## End-to-End Error Handling Example

### Scenario: Transient Network Error

```
1. Miner attempts: GET /api/trainers/alice-001
2. Network timeout after 30 seconds
3. Miner returns:
   {
     success: false,
     error: 'NETWORK_TIMEOUT',
     message: 'Request timed out after 30 seconds',
     retriable: true,
     timestamp: '2026-07-18T12:34:56Z'
   }
4. Upstream retry logic kicks in
5. Wait 1 second, retry
6. Miner attempts: GET /api/trainers/alice-001 (Attempt 2)
7. Success! Returns trainer data
8. Courier transports
9. Inspector validates ✓
10. Vault stores
```

### Scenario: Permanent Error (Invalid Trainer ID)

```
1. Miner attempts: GET /api/trainers/invalid-id
2. API returns 404 Not Found
3. Miner returns:
   {
     success: false,
     error: 'API_NOT_FOUND',
     message: 'Trainer not found',
     retriable: false,
     timestamp: '2026-07-18T12:34:56Z'
   }
4. Upstream sees retriable: false
5. Does NOT retry
6. Logs error
7. Continues with next request
```

### Scenario: Data Validation Failure

```
1. Miner acquires: { id: 'bob-001', name: 'Bob', fans: '50M', rank: 45 }
2. Courier transports unchanged
3. Inspector validates
4. Type check fails: fans is string, expected number
5. Inspector returns:
   {
     passed: false,
     originalData: { id: 'bob-001', name: 'Bob', fans: '50M', rank: 45 },
     reason: "VALIDATION_INVALID_TYPE: Field 'fans' must be number, got string"
   }
6. Vault DOES NOT store
7. System logs rejection
8. Acquisition failed at validation stage
```

---

## Logging Requirements

All errors must be logged with:

```javascript
logger.error({
  timestamp: new Date().toISOString(),
  component: 'miner|courier|inspector|vault',
  error: error.error,
  message: error.message,
  severity: error.severity,
  retriable: error.retriable,
  context: error.context
});
```

**Log Example:**
```
[2026-07-18T12:34:56Z] ERROR miner: API_RATE_LIMIT_EXCEEDED
  Message: uma.moe API rate limit exceeded
  Severity: warning
  Retriable: true
  Endpoint: /api/trainers/alice-001
  RetryAfter: 60
```

---

## Summary: Error Handling Rules

| Scenario | Behavior |
|----------|----------|
| Network timeout | Log, retry with exponential backoff (max 3 times) |
| Rate limited (429) | Respect Retry-After header, retry |
| API 5xx error | Log, retry with exponential backoff |
| Invalid parameters (400) | Log once, do NOT retry |
| Unauthorized (401) | Log alert, do NOT retry |
| Not found (404) | Log as info, do NOT retry |
| Data validation failed | Reject, do NOT store, log reason |
| Storage unavailable | Log, retry with exponential backoff |
| Invalid data format | Log error, do NOT retry |

---

## Versioning

This specification is version **1.0**.

**Change Log:**
- **v1.0** (2026-07-18) — Initial error handling specification
