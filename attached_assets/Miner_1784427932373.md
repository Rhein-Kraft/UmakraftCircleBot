# Miner

## Purpose

The **Miner** is responsible for acquiring raw data from the external **uma.moe API**.

It is the entry point of the UmaMoe data acquisition pipeline. The Miner retrieves information from the external source and passes the original acquired data to the Courier for transport through the pipeline.

The Miner is an acquisition component only.

It must not process, analyze, validate, transform, or permanently store the data it retrieves.

---

## Related Documentation

This specification must be read in conjunction with:

- **MINER_ENDPOINTS.md** — Approved endpoints, parameters, rate limits, and error codes
- **DATA_FORMAT.md** — Data structure format and pipeline flow
- **ERROR_HANDLING.md** — Error classification, failure modes, and retry strategy
- **INTEGRATION_EXAMPLE.md** — Real-world usage examples and scenarios

---

# Implementation Authority

This document is the authoritative specification for the implementation of `miner.js`.

The implementation must follow the responsibilities, boundaries, inputs, outputs, and restrictions defined in this document.

If a behavior is not defined in this specification, the implementation must not invent additional responsibilities for the Miner.

---

# Responsibilities

The Miner is responsible for:

1. Connecting to the uma.moe API using approved endpoints only
2. Requesting data from the API with correct parameters
3. Receiving the raw API response
4. Detecting and classifying failures (transient vs permanent)
5. Implementing exponential backoff retry for transient errors
6. Preserving the acquired data without business-logic transformation
7. Returning the acquired data or a clearly defined failure result
8. Passing the result to the Courier for transport

The Miner is NOT responsible for:
- Validating data quality
- Storing data persistently
- Calculating or transforming values
- Business logic
- Authorization or access control (except including API keys if required)

---

# Data Source

The Miner may acquire data only from the approved uma.moe API endpoints.

**Approved Endpoints:**
- `GET /api/health` — Health check
- `GET /api/trainers/{id}` — Get single trainer
- `GET /api/v3/search` — Search trainers
- `GET /api/rankings` — Get ranked trainers
- `GET /api/stats` — Service statistics

All endpoints must be defined and documented in **MINER_ENDPOINTS.md**.

Requesting from any other endpoint is prohibited.

The API endpoint configuration must not be scattered throughout the implementation.

API configuration should be centralized so that endpoints can be changed without rewriting the acquisition logic.

---

# Configuration

The Miner must use environment variables for all configuration. Configuration must never be hardcoded.

**Required Environment Variables:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `UMA_MOE_API_BASE_URL` | string | `https://uma.moe/api` | Base URL for uma.moe API |
| `API_TIMEOUT_MS` | number | `30000` | Request timeout in milliseconds |
| `API_MAX_RETRIES` | number | `3` | Maximum retry attempts for transient errors |
| `API_RETRY_BACKOFF_MS` | number | `1000` | Initial backoff delay in milliseconds |

**Configuration Example:**

```javascript
// config.js — Centralized configuration
export const API_CONFIG = {
  baseUrl: process.env.UMA_MOE_API_BASE_URL || 'https://uma.moe/api',
  timeout: parseInt(process.env.API_TIMEOUT_MS || '30000'),
  maxRetries: parseInt(process.env.API_MAX_RETRIES || '3'),
  initialBackoffMs: parseInt(process.env.API_RETRY_BACKOFF_MS || '1000'),
  maxBackoffMs: 60000,
  backoffMultiplier: 2,
  jitterRange: 0.1  // ±10% random variance
};
```

Refer to **MINER_ENDPOINTS.md** for complete configuration details.

---

# Input

The Miner receives parameters required to perform an acquisition request.

Depending on the endpoint, this may include:

- API endpoint path
- Path parameters (e.g., `{id}`)
- Query parameters (e.g., `query`, `limit`)
- Request body (for POST requests, if any)
- Authentication information (if required)

The Miner must only accept the input required to perform the acquisition request.

**Input Schema:**

```javascript
{
  endpoint: string,           // e.g., "/trainers/{id}", "/v3/search"
  pathParams: object,         // Optional: e.g., { id: "trainer-001" }
  queryParams: object,        // Optional: e.g., { query: "Alice", limit: 50 }
  requestBody: object         // Optional: for future POST requests
}
```

**Example Inputs:**

### Get Single Trainer
```javascript
{
  endpoint: "/trainers/{id}",
  pathParams: { id: "trainer-alice-001" }
}
```

### Search Trainers
```javascript
{
  endpoint: "/v3/search",
  queryParams: { query: "Alice", limit: 50 }
}
```

### Get Rankings
```javascript
{
  endpoint: "/rankings",
  queryParams: { limit: 100, sort: "fans", order: "desc" }
}
```

Refer to **MINER_ENDPOINTS.md** for complete endpoint parameter specifications.

---

# Output

The Miner outputs the data received from the uma.moe API in a standardized result format.

The output must represent the acquired source data as closely as possible.

The Miner must not:

- Calculate values
- Add business conclusions
- Determine achievements
- Determine milestones
- Calculate fan gain
- Reorganize data for presentation
- Store data permanently
- Transform data for downstream consumption

**Success Output Format:**

```javascript
{
  success: true,
  data: {
    // Raw API response (unmodified)
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    // ... other fields
  },
  metadata: {
    endpoint: string,           // e.g., "/api/trainers/trainer-alice-001"
    statusCode: number,         // HTTP status code (200)
    timestamp: string,          // ISO 8601 timestamp
    source: string,             // Full URL that was requested
    attempts: number            // Number of attempts (1 if no retry)
  }
}
```

**Failure Output Format:**

```javascript
{
  success: false,
  error: string,              // Error code (SCREAMING_SNAKE_CASE)
  message: string,            // Human-readable error description
  severity: string,           // "critical" | "warning" | "info"
  retriable: boolean,         // Can this error be retried?
  timestamp: string,          // ISO 8601 timestamp
  context: {
    endpoint: string,         // Endpoint that failed
    statusCode: number,       // HTTP status code (if applicable)
    attempts: number,         // Number of retry attempts made
    retryAfterSeconds: number // For 429 rate limit errors
    // ... other error-specific context
  }
}
```

**Success Example:**

```javascript
{
  success: true,
  data: {
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    characters: ["char-1", "char-2"]
  },
  metadata: {
    endpoint: "/api/trainers/trainer-alice-001",
    statusCode: 200,
    timestamp: "2026-07-18T12:34:56Z",
    source: "https://uma.moe/api/trainers/trainer-alice-001",
    attempts: 1
  }
}
```

**Failure Example:**

```javascript
{
  success: false,
  error: "NETWORK_TIMEOUT",
  message: "Request to /api/trainers/alice-001 timed out after 30 seconds",
  severity: "warning",
  retriable: true,
  timestamp: "2026-07-18T12:34:56Z",
  context: {
    endpoint: "/api/trainers/alice-001",
    timeoutMs: 30000,
    attempts: 3
  }
}
```

Refer to **DATA_FORMAT.md** and **ERROR_HANDLING.md** for complete output format specifications.

---

# Data Pipeline

```text
External uma.moe API
        │
        ▼
      Miner (You are here)
        │
        ▼
   Success/Failure Result
        │
        ▼
     Courier
        │
        ▼
    Inspector
        │
        ▼
      Vault
```

The Miner is the first internal component in the acquisition pipeline.

---

# Data Integrity

The Miner must preserve the meaning of the source data.

It must not modify values for convenience or apply project-specific interpretations.

**Examples of prohibited transformations:**

- Converting fan counts (`50000000`) into fan gains (`+5000000`)
- Calculating rankings (Rank is provided by API)
- Determining achievement tiers (data as-is)
- Determining milestone status
- Renaming data fields for presentation (`fans` → `totalFans`)
- Combining multiple records into analytical summaries
- Filtering out fields deemed "unnecessary"
- Rounding or formatting numeric values

Any transformation required by the project belongs to a later department (Refinery, etc.).

---

# Error Handling

The Miner must handle acquisition failures safely and clearly.

All errors must be classified and handled according to **ERROR_HANDLING.md**.

## Error Classification

### Transient Errors (Retriable)

**Definition:** Temporary failures that may succeed if retried.

**Examples:**
- `NETWORK_TIMEOUT` — Request exceeded 30 second timeout
- `NETWORK_CONNECTION_REFUSED` — API temporarily unreachable
- `API_RATE_LIMIT_EXCEEDED` (429) — Rate limit hit, retry after wait
- `API_INTERNAL_ERROR` (500) — Server error
- `API_BAD_GATEWAY` (502) — Bad gateway
- `API_SERVICE_UNAVAILABLE` (503) — Service maintenance/down
- `API_GATEWAY_TIMEOUT` (504) — Gateway timeout

**Miner Action:** Implement exponential backoff retry (max 3 attempts)

### Permanent Errors (Non-Retriable)

**Definition:** Failures that will not succeed if retried without external intervention.

**Examples:**
- `API_BAD_REQUEST` (400) — Invalid parameters
- `API_UNAUTHORIZED` (401) — Invalid/missing API key
- `API_FORBIDDEN` (403) — Access denied
- `API_NOT_FOUND` (404) — Trainer/resource doesn't exist
- `API_INVALID_JSON` — Response is not valid JSON
- `API_EMPTY_RESPONSE` — API returned null/empty

**Miner Action:** Log error and fail immediately (do NOT retry)

### Detection Requirements

The Miner implementation must:

1. Detect failed API requests (non-200 status codes)
2. Detect network or communication failures (timeouts, connection refused)
3. Detect invalid or unusable API responses (malformed JSON, empty responses)
4. Return or report the failure clearly in the standard error format
5. Avoid passing unusable data to the Courier

The Miner must NOT:
- Silently treat a failed request as successful
- Invent replacement data when the API request fails
- Pass partial or corrupted data to downstream stages
- Retry permanent errors
- Ignore timeout/network errors

Refer to **ERROR_HANDLING.md** for complete error classification and handling specifications.

---

# Timeout Handling

All requests to the uma.moe API must have a maximum timeout of 30 seconds.

**Timeout Behavior:**

| Timeout | Duration | Action |
|---------|----------|--------|
| Successful Response | < 30s | Return success result |
| Request Hangs | = 30s | Cancel request, treat as transient error |
| No Response | > 30s | Never reached (30s timeout enforces limit) |

**Implementation:**

```javascript
const response = await fetch(url, {
  timeout: API_CONFIG.timeout  // 30000ms (30 seconds)
});
```

**Retry Behavior:**
- Treat timeout as transient error (retriable)
- Implement exponential backoff retry
- Do NOT increase timeout on retry

Refer to **MINER_ENDPOINTS.md** for timeout specifications.

---

# Rate Limiting

The uma.moe API enforces rate limits. The Miner must respect them.

**Rate Limits:**

| Limit | Value |
|-------|-------|
| Per-Second | 10 requests/second |
| Per-Minute | 500 requests/minute |
| Per-Hour | 7,200 requests/hour |
| Per-Day | 172,800 requests/day |

**Rate Limit Response (429 Too Many Requests):**

```json
{
  "error": "Too Many Requests",
  "status": 429,
  "message": "Rate limit exceeded. Please wait before retrying.",
  "retry_after_seconds": 60
}
```

**Response Headers:**

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1689691200
Retry-After: 60
```

**Miner Handling:**

1. Detect HTTP 429 status code
2. Extract `Retry-After` header value (in seconds)
3. Wait for the specified duration
4. Retry the request
5. Treat as transient error (retriable: true)

**Implementation:**

```javascript
if (response.status === 429) {
  const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
  
  return {
    success: false,
    error: 'API_RATE_LIMIT_EXCEEDED',
    message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
    severity: 'warning',
    retriable: true,
    timestamp: new Date().toISOString(),
    context: {
      endpoint,
      statusCode: 429,
      retryAfterSeconds: retryAfter,
      resetTime: new Date(Date.now() + retryAfter * 1000).toISOString()
    }
  };
}
```

**Do NOT:**
- Ignore rate limits
- Make requests in rapid succession
- Bypass rate limit headers
- Exceed the specified rate limits

Refer to **MINER_ENDPOINTS.md** for complete rate limit specifications.

---

# Retry Strategy

For transient errors, implement exponential backoff with jitter.

**Retry Configuration:**

```javascript
const RETRY_CONFIG = {
  maxRetries: 3,                    // Maximum 3 attempts
  initialDelayMs: 1000,             // Start at 1 second
  maxDelayMs: 60000,                // Cap at 60 seconds
  backoffMultiplier: 2,             // Double each attempt
  jitterRange: 0.1                  // ±10% random variance
};
```

**Backoff Schedule:**

```
Attempt 1: Immediate (fail immediately and report)
Attempt 2: Wait 1 second + jitter, then retry
Attempt 3: Wait 2 seconds + jitter, then retry
Attempt 4: Wait 4 seconds + jitter, then retry
Max Wait: 60 seconds (never exceed this)
```

**Implementation Example:**

```javascript
async function acquireWithRetry(endpoint, params = {}) {
  let lastError = null;
  let delayMs = RETRY_CONFIG.initialDelayMs;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    const result = await attemptAcquisition(endpoint, params);
    
    if (result.success) {
      result.metadata.attempts = attempt + 1;
      return result;  // Success on this attempt
    }
    
    if (!result.retriable) {
      result.context.attempts = attempt + 1;
      return result;  // Permanent error, don't retry
    }
    
    lastError = result;
    
    // If not the last attempt, wait and retry
    if (attempt < RETRY_CONFIG.maxRetries) {
      // Add jitter to prevent thundering herd
      const jitter = delayMs * (1 + (Math.random() - 0.5) * RETRY_CONFIG.jitterRange);
      const actualWaitMs = Math.ceil(jitter);
      
      console.log(`Retry attempt ${attempt + 2} after ${actualWaitMs}ms`);
      await sleep(actualWaitMs);
      
      // Calculate next delay with exponential backoff
      delayMs = Math.min(
        delayMs * RETRY_CONFIG.backoffMultiplier,
        RETRY_CONFIG.maxDelayMs
      );
    }
  }
  
  // All retries exhausted
  lastError.context.attempts = RETRY_CONFIG.maxRetries + 1;
  return lastError;
}
```

**Retry Rules:**

The Miner MUST:
- ✅ Retry transient errors (retriable: true)
- ✅ Respect exponential backoff schedule
- ✅ Add jitter to prevent thundering herd
- ✅ Cap wait time at 60 seconds
- ✅ Stop after 3 attempts
- ✅ Preserve original error information

The Miner MUST NOT:
- ❌ Retry permanent errors (retriable: false)
- ❌ Perform unlimited retries
- ❌ Exceed 60-second wait time
- ❌ Make requests without delay between retries
- ❌ Modify request parameters between retries (retry exact same request)
- ❌ Ignore Retry-After headers (for rate limits)

Refer to **ERROR_HANDLING.md** for complete retry strategy specification.

---

# Separation of Responsibilities

The Miner must not perform responsibilities belonging to other departments.

## The Miner must not:

- ❌ Transport data through internal systems (that's Courier's job)
- ❌ Validate data quality (that's Inspector's job)
- ❌ Store permanent data (that's Vault's job)
- ❌ Transform or calculate values (that's Refinery's job)
- ❌ Apply business logic
- ❌ Generate reports
- ❌ Create images
- ❌ Create Discord embeds or messages
- ❌ Send notifications
- ❌ Distribute products
- ❌ Filter or decide which data is "important"
- ❌ Perform authentication/authorization

These responsibilities belong to other departments.

---

# Relationship with Courier

The Miner acquires data. The Courier transports it.

```text
Miner (Acquire)
   │
   │  Raw API Response
   ▼
Result Object
   │
   │  Passes to next stage
   ▼
Courier (Transport)
```

The Miner must not assume the responsibilities of the Courier.

The Miner should provide the acquired result in a form that the Courier can receive and transport through the next stage of the architecture.

**Handoff Contract:**

The Miner passes:
```javascript
{
  success: true|false,
  data: {...},           // If success
  error: "...",          // If failure
  message: "...",        // If failure
  metadata: {...},       // Always
  context: {...}         // If failure
}
```

The Courier receives this exact structure without modification and forwards it to the Inspector.

---

# Relationship with Inspector & Vault

The Inspector validates data. The Vault stores it.

The Miner does NOT communicate directly with Inspector or Vault.

Data flows through Courier:

```text
Miner → Courier → Inspector → Vault
```

The Miner's output becomes the Courier's input.
The Miner does NOT need to know what happens after Courier receives the data.

---

# Implementation Requirements for miner.js

The implementation of `miner.js` must:

1. ✅ Use the approved HTTP client (fetch API, axios, etc.)
2. ✅ Keep API configuration organized and centralized (use environment variables)
3. ✅ Expose a clear acquisition interface (e.g., `acquire(endpoint, params)`)
4. ✅ Return acquired data or a clearly defined failure result (use standard formats)
5. ✅ Implement exponential backoff retry for transient errors
6. ✅ Respect rate limits and Retry-After headers
7. ✅ Apply 30-second timeout to all requests
8. ✅ Classify errors correctly (transient vs permanent)
9. ✅ Avoid hidden side effects
10. ✅ Avoid permanent storage
11. ✅ Avoid business logic
12. ✅ Avoid presentation logic
13. ✅ Avoid Discord-specific logic
14. ✅ Avoid direct communication with downstream systems (only pass to Courier)

**Structural Requirements:**

- Use modular code structure (separate concerns)
- Create a config module for centralized configuration
- Create an error module for error classification and formatting
- Create a retry module for exponential backoff logic
- Create a main miner module that orchestrates acquisition
- Add comprehensive logging at each stage

**Example Structure:**

```javascript
// config.js
export const API_CONFIG = { ... };

// errors.js
export function classifyError(response, error) { ... }
export const ERROR_CODES = { ... };

// retry.js
export function calculateBackoff(attempt, config) { ... }
export async function acquireWithRetry(...) { ... }

// miner.js (main entry point)
export async function acquire(endpoint, params) { ... }
```

The implementation should be modular so that additional API acquisition operations can be added without rewriting the entire Miner.

---

# Expected Implementation Boundary

The expected responsibility of `miner.js` is:

```text
User Request (via Courier)
       │
       ▼
   Validate Input
       │
       ▼
Construct Request
       │
       ▼
Make HTTP Request to uma.moe
       │
       ▼
Receive Response
       │
       ▼
Handle Network/API Failures
       │
       ▼
Classify Error (Transient/Permanent)
       │
       ▼
Implement Retry (if transient)
       │
       ▼
Return Success/Failure Result
(STOP HERE - pass to Courier)
```

The implementation must stop at the acquisition boundary.

**Do NOT:**
- Continue into Courier's responsibility (transport)
- Continue into Inspector's responsibility (validation)
- Continue into Vault's responsibility (storage)
- Add any logic beyond acquisition

---

# Design Principle

> **The Miner retrieves what exists. It does not decide what the data means.**

The Miner is the extraction point of the UmaMoe architecture.

Its job is to acquire source information accurately and pass it into the next stage of the pipeline without adding business logic or taking responsibility for later processing.

The Miner is the **trusted data source** for the pipeline. It retrieves data from uma.moe and makes it available. Everything else (validation, transformation, storage) happens downstream.

---

# Implementation Rule

When creating or modifying `miner.js`, the implementation agent must:

1. ✅ Read this document completely
2. ✅ Read MINER_ENDPOINTS.md (approved endpoints)
3. ✅ Read ERROR_HANDLING.md (error classification and retry)
4. ✅ Read DATA_FORMAT.md (data structures)
5. ✅ Read INTEGRATION_EXAMPLE.md (real-world scenarios)
6. ✅ Follow the responsibilities defined in this document
7. ✅ Respect all prohibited responsibilities
8. ✅ Preserve the boundaries between Miner and Courier
9. ✅ Avoid inventing undefined behavior
10. ✅ Ask for clarification when a required implementation detail is missing instead of silently creating unrelated functionality

The resulting `miner.js` must be an implementation of this specification, not an independent redesign of the Miner architecture.

---

# Quick Reference Checklist

When implementing or reviewing `miner.js`, verify:

- [ ] Uses only endpoints from MINER_ENDPOINTS.md
- [ ] Configuration via environment variables (not hardcoded)
- [ ] 30-second timeout on all requests
- [ ] Transient errors: exponential backoff (max 3 retries)
- [ ] Permanent errors: logged and fail immediately (no retry)
- [ ] Rate limit (429): respects Retry-After header
- [ ] Success output: `{ success: true, data, metadata }`
- [ ] Failure output: `{ success: false, error, message, severity, retriable, context }`
- [ ] No data modification or transformation
- [ ] No validation (that's Inspector's job)
- [ ] No storage (that's Vault's job)
- [ ] No business logic
- [ ] Modular code structure
- [ ] Comprehensive logging
- [ ] Passes output to Courier (not Inspector/Vault)

---

# Version History

**v1.0** (2026-07-18) — Initial specification  
**v2.0** (2026-07-18) — Comprehensive update aligned with all supporting documentation
- Added configuration section with environment variables
- Added detailed input/output specifications with examples
- Added error classification (transient vs permanent)
- Added timeout handling (30 seconds)
- Added rate limiting section with 429 handling
- Added detailed retry strategy with exponential backoff algorithm
- Added implementation structure examples
- Added cross-references to all supporting documentation
- Expanded expected implementation boundary
- Added quick reference checklist
