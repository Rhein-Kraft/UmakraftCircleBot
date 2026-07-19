# Integration Example — End-to-End Walkthrough

## Purpose

This document provides concrete, real-world examples of how data flows through the complete UmaMoe pipeline from start to finish. These examples demonstrate both successful acquisition and failure scenarios.

Each scenario shows:
- **User Request** — What someone wants
- **Step-by-Step Pipeline** — How each department handles the data
- **Final Result** — What the system returns
- **Logs & Events** — What gets logged along the way

---

## Scenario 1: Happy Path — Successful Trainer Acquisition

### User Request
```
Fetch trainer data for trainer ID: "trainer-alice-001"
```

### Step 1: Miner Acquires

**Request:**
```
GET https://uma.moe/api/trainers/trainer-alice-001
```

**Miner Logic:**
1. Validates endpoint is approved ✓
2. Constructs full URL ✓
3. Sends HTTP GET request ✓
4. Sets timeout to 30 seconds ✓

**API Response (200 OK):**
```json
{
  "id": "trainer-alice-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45,
  "characters": [
    "uma-musume-special-week",
    "uma-musume-silence-suzuka",
    "uma-musume-tokai-teio"
  ],
  "achievements": [
    {
      "id": "achievement-50m-fans",
      "name": "50 Million Fans",
      "unlockedAt": "2026-01-15T10:30:00Z"
    }
  ]
}
```

**Miner Output:**
```javascript
{
  success: true,
  data: {
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    characters: [
      "uma-musume-special-week",
      "uma-musume-silence-suzuka",
      "uma-musume-tokai-teio"
    ],
    achievements: [
      {
        id: "achievement-50m-fans",
        name: "50 Million Fans",
        unlockedAt: "2026-01-15T10:30:00Z"
      }
    ]
  },
  metadata: {
    endpoint: "/api/trainers/trainer-alice-001",
    statusCode: 200,
    timestamp: "2026-07-18T12:34:56Z",
    source: "https://uma.moe/api/trainers/trainer-alice-001"
  }
}
```

**Miner Log:**
```
[2026-07-18T12:34:56Z] INFO miner: Acquisition successful
  Endpoint: /api/trainers/trainer-alice-001
  StatusCode: 200
  ResponseSize: 512 bytes
  Duration: 145ms
```

---

### Step 2: Courier Transports

**Courier Input:**
```
Receives the exact data from Miner (unmodified)
```

**Courier Logic:**
1. Validates input is not null/undefined ✓
2. Prepares for transport to Inspector ✓
3. Passes data unchanged ✓

**Courier Output:**
```javascript
{
  success: true,
  deliveredData: {
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    characters: [...],
    achievements: [...]
  },
  timestamp: "2026-07-18T12:34:56Z"
}
```

**Courier Log:**
```
[2026-07-18T12:34:56Z] INFO courier: Transport successful
  DataSize: 512 bytes
  Destination: Inspector
  Duration: 1ms
```

---

### Step 3: Inspector Validates

**Inspector Input:**
```javascript
{
  id: "trainer-alice-001",
  name: "Alice",
  fans: 50000000,
  rank: 45,
  characters: [...],
  achievements: [...]
}
```

**Inspector Validation:**

| Category | Check | Result |
|----------|-------|--------|
| **Existence** | Data is not null/undefined/empty | ✅ PASS |
| **Structure** | Data is an object (not array) | ✅ PASS |
| **Completeness** | All required fields present (`id`, `name`, `fans`, `rank`) | ✅ PASS |
| **Type Integrity** | `id` string ✓, `name` string ✓, `fans` number ✓, `rank` number ✓ | ✅ PASS |
| **Range Integrity** | `fans` ≥ 0 ✓, `rank` 1-100 ✓ | ✅ PASS |

**Inspector Output:**
```javascript
{
  passed: true,
  originalData: {
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    characters: [...],
    achievements: [...]
  },
  reason: null
}
```

**Inspector Log:**
```
[2026-07-18T12:34:56Z] INFO inspector: Validation successful
  TrainerId: trainer-alice-001
  Status: ACCEPTED
  ValidationTime: 2ms
```

---

### Step 4: Vault Stores

**Vault Input:**
```
Receives accepted data from Inspector
```

**Vault Logic:**
1. Validates data is not null ✓
2. Adds storage metadata ✓
3. Inserts into database ✓

**Vault Storage:**
```javascript
{
  storageId: "storage-uuid-abc123def456",
  trainerId: "trainer-alice-001",
  name: "Alice",
  fans: 50000000,
  rank: 45,
  characters: [
    "uma-musume-special-week",
    "uma-musume-silence-suzuka",
    "uma-musume-tokai-teio"
  ],
  achievements: [
    {
      id: "achievement-50m-fans",
      name: "50 Million Fans",
      unlockedAt: "2026-01-15T10:30:00Z"
    }
  ],
  storedAt: "2026-07-18T12:34:56Z",
  retrievedFrom: "https://uma.moe/api/trainers/trainer-alice-001"
}
```

**Vault Output:**
```javascript
{
  success: true,
  storageId: "storage-uuid-abc123def456",
  timestamp: "2026-07-18T12:34:56Z"
}
```

**Vault Log:**
```
[2026-07-18T12:34:56Z] INFO vault: Storage successful
  StorageId: storage-uuid-abc123def456
  TrainerId: trainer-alice-001
  Duration: 8ms
```

---

### Final Result: SUCCESS

```
✅ Trainer "Alice" (trainer-alice-001) successfully acquired and stored
   - Fans: 50,000,000
   - Rank: 45
   - Storage ID: storage-uuid-abc123def456
   - Retrieved: 2026-07-18T12:34:56Z
```

---

## Scenario 2: Failure Path — Network Timeout with Retry

### User Request
```
Fetch trainer data for trainer ID: "trainer-bob-002"
Network is intermittently slow
```

### Step 1: Miner Acquires (Attempt 1)

**Request:**
```
GET https://uma.moe/api/trainers/trainer-bob-002
Timeout: 30 seconds
```

**Network Issue:**
```
Request hangs for 30 seconds, then times out
```

**Miner Output (Attempt 1):**
```javascript
{
  success: false,
  error: "NETWORK_TIMEOUT",
  message: "Request to /api/trainers/trainer-bob-002 timed out after 30 seconds",
  severity: "warning",
  retriable: true,
  timestamp: "2026-07-18T12:34:56Z",
  context: {
    endpoint: "/api/trainers/trainer-bob-002",
    timeoutMs: 30000
  }
}
```

**Miner Log:**
```
[2026-07-18T12:34:56Z] WARN miner: Network timeout
  Endpoint: /api/trainers/trainer-bob-002
  Attempt: 1/3
  NextRetryIn: 1000ms
```

---

### Step 1.5: Retry Logic

**Exponential Backoff:**
- Attempt 1: Timeout ❌
- Wait 1 second...
- Attempt 2: Retry

**Miner Log:**
```
[2026-07-18T12:34:57Z] INFO miner: Retrying acquisition
  Endpoint: /api/trainers/trainer-bob-002
  Attempt: 2/3
  BackoffDelay: 1000ms
```

---

### Step 1 (Attempt 2): Miner Acquires (Success on Retry)

**Request:**
```
GET https://uma.moe/api/trainers/trainer-bob-002
```

**API Response (200 OK):**
```json
{
  "id": "trainer-bob-002",
  "name": "Bob",
  "fans": 25000000,
  "rank": 32,
  "characters": ["uma-musume-mejiro-aldan"]
}
```

**Miner Output:**
```javascript
{
  success: true,
  data: {
    id: "trainer-bob-002",
    name: "Bob",
    fans: 25000000,
    rank: 32,
    characters: ["uma-musume-mejiro-aldan"]
  },
  metadata: {
    endpoint: "/api/trainers/trainer-bob-002",
    statusCode: 200,
    timestamp: "2026-07-18T12:34:57Z",
    attempts: 2
  }
}
```

**Miner Log:**
```
[2026-07-18T12:34:57Z] INFO miner: Acquisition successful (after retry)
  Endpoint: /api/trainers/trainer-bob-002
  Attempts: 2
  Duration: 125ms
```

---

### Steps 2-4: Normal Pipeline

**Courier** → **Inspector** → **Vault** (same as Scenario 1)

---

### Final Result: SUCCESS

```
✅ Trainer "Bob" (trainer-bob-002) acquired after 1 retry and stored
   - Failed once: Network timeout
   - Succeeded on retry 2
   - Fans: 25,000,000
   - Rank: 32
```

---

## Scenario 3: Permanent Failure — Invalid Trainer ID

### User Request
```
Fetch trainer data for trainer ID: "invalid-trainer-id"
This ID does not exist in the uma.moe database
```

### Step 1: Miner Acquires

**Request:**
```
GET https://uma.moe/api/trainers/invalid-trainer-id
```

**API Response (404 Not Found):**
```json
{
  "error": "Not Found",
  "status": 404,
  "message": "Trainer with ID 'invalid-trainer-id' not found"
}
```

**Miner Output:**
```javascript
{
  success: false,
  error: "API_NOT_FOUND",
  message: "Trainer with ID 'invalid-trainer-id' not found",
  severity: "info",
  retriable: false,
  timestamp: "2026-07-18T12:34:56Z",
  context: {
    endpoint: "/api/trainers/invalid-trainer-id",
    statusCode: 404
  }
}
```

**Miner Log:**
```
[2026-07-18T12:34:56Z] INFO miner: Resource not found
  Endpoint: /api/trainers/invalid-trainer-id
  StatusCode: 404
  Retriable: false
```

---

### Pipeline Stops Here

**Upstream Logic:**
1. Checks `retriable: false`
2. Does NOT attempt retry
3. Logs error as info (expected result)
4. Continues with next request

**Courier** ❌ Never receives data  
**Inspector** ❌ Never validates  
**Vault** ❌ Never stores

---

### Final Result: FAILED (Expected)

```
❌ Trainer "invalid-trainer-id" not found in uma.moe database
   - This is not a system error, data simply doesn't exist
   - No retry attempted
   - No data stored
```

---

## Scenario 4: Data Validation Failure — Invalid Type

### User Request
```
Fetch trainer data (but API has a bug and returns wrong data type)
```

### Step 1: Miner Acquires

**Hypothetical API Bug:**
```
uma.moe API returns fans as a string instead of number
```

**API Response (200 OK - But Malformed):**
```json
{
  "id": "trainer-charlie-003",
  "name": "Charlie",
  "fans": "75000000",
  "rank": 50,
  "characters": []
}
```

**Miner Output:**
```javascript
{
  success: true,
  data: {
    id: "trainer-charlie-003",
    name: "Charlie",
    fans: "75000000",
    rank: 50,
    characters: []
  },
  metadata: {
    endpoint: "/api/trainers/trainer-charlie-003",
    statusCode: 200,
    timestamp: "2026-07-18T12:34:56Z"
  }
}
```

**Miner Log:**
```
[2026-07-18T12:34:56Z] INFO miner: Acquisition successful
  Endpoint: /api/trainers/trainer-charlie-003
  StatusCode: 200
  (Note: Miner does NOT validate, so it passes malformed data)
```

---

### Step 2: Courier Transports

**Courier passes data unchanged (correct behavior)**

---

### Step 3: Inspector Validates

**Inspector Input:**
```javascript
{
  id: "trainer-charlie-003",
  name: "Charlie",
  fans: "75000000",  // ← STRING, not number
  rank: 50,
  characters: []
}
```

**Inspector Validation:**

| Category | Check | Result |
|----------|-------|--------|
| **Existence** | Data exists | ✅ PASS |
| **Structure** | Is object | ✅ PASS |
| **Completeness** | All required fields present | ✅ PASS |
| **Type Integrity** | `fans` should be number but is string | ❌ FAIL |

**Inspector Output:**
```javascript
{
  passed: false,
  originalData: {
    id: "trainer-charlie-003",
    name: "Charlie",
    fans: "75000000",
    rank: 50,
    characters: []
  },
  reason: "TYPE_INTEGRITY_FAILURE: Field 'fans' must be number, got string"
}
```

**Inspector Log:**
```
[2026-07-18T12:34:56Z] WARN inspector: Validation failed
  TrainerId: trainer-charlie-003
  Reason: TYPE_INTEGRITY_FAILURE: Field 'fans' must be number, got string
  Status: REJECTED
  ValidationTime: 1ms
```

---

### Step 4: Vault Does NOT Store

**Vault Logic:**
1. Receives rejection notification
2. Does NOT store invalid data
3. Logs rejection

**Vault Log:**
```
[2026-07-18T12:34:56Z] WARN vault: Data rejected
  TrainerId: trainer-charlie-003
  Reason: Validation failed (TYPE_INTEGRITY_FAILURE)
  Action: Data discarded, no storage attempted
```

---

### Final Result: REJECTED AT VALIDATION

```
❌ Trainer "Charlie" (trainer-charlie-003) rejected at validation
   - Reason: Field 'fans' must be number, got string
   - Original data preserved but not stored
   - System protected against storing corrupted data
```

---

## Scenario 5: Rate Limit Exceeded

### User Request
```
Bulk fetch: Multiple trainer requests in rapid succession
```

### Requests 1-10: Success

```
GET /api/trainers/trainer-1 ✅
GET /api/trainers/trainer-2 ✅
GET /api/trainers/trainer-3 ✅
...
(Rate limit allows 10 requests/second)
```

---

### Request 11: Rate Limited

**Request:**
```
GET /api/trainers/trainer-11
```

**API Response (429 Too Many Requests):**
```
HTTP Status: 429
Retry-After: 60

{
  "error": "Too Many Requests",
  "status": 429,
  "message": "Rate limit exceeded. Please wait before retrying.",
  "retry_after_seconds": 60
}
```

**Miner Output:**
```javascript
{
  success: false,
  error: "API_RATE_LIMIT_EXCEEDED",
  message: "uma.moe API rate limit exceeded. Retry after 60 seconds.",
  severity: "warning",
  retriable: true,
  timestamp: "2026-07-18T12:35:01Z",
  context: {
    endpoint: "/api/trainers/trainer-11",
    statusCode: 429,
    retryAfterSeconds: 60,
    remainingRequests: 0,
    resetTime: "2026-07-18T12:36:01Z"
  }
}
```

**Miner Log:**
```
[2026-07-18T12:35:01Z] WARN miner: Rate limit exceeded
  Endpoint: /api/trainers/trainer-11
  StatusCode: 429
  RetryAfter: 60 seconds
  ResetTime: 2026-07-18T12:36:01Z
```

---

### Retry Logic

**Upstream System:**
1. Sees `retriable: true`
2. Sees `retryAfterSeconds: 60`
3. Waits 60 seconds
4. Retries request

**System Log:**
```
[2026-07-18T12:35:01Z] INFO system: Rate limited, waiting before retry
  Endpoint: /api/trainers/trainer-11
  WaitTime: 60 seconds
  ResumeAt: 2026-07-18T12:36:01Z

[2026-07-18T12:36:01Z] INFO miner: Retrying after rate limit reset
  Endpoint: /api/trainers/trainer-11
  Attempt: 2/3
```

**Request Resumes:**
```
GET /api/trainers/trainer-11 (after 60 second wait) ✅
```

---

### Final Result: SUCCESS AFTER RATE LIMIT

```
✅ Trainer "trainer-11" acquired after respecting rate limit
   - Hit rate limit at request 11
   - Waited 60 seconds
   - Successfully retried
   - Data stored
```

---

## Scenario 6: Search Multiple Trainers

### User Request
```
Search for all trainers named "Alice"
```

### Step 1: Miner Acquires (Search Query)

**Request:**
```
GET https://uma.moe/api/v3/search?query=Alice&limit=10
```

**API Response (200 OK):**
```json
{
  "query": "Alice",
  "limit": 10,
  "offset": 0,
  "total": 3,
  "results": [
    {
      "id": "trainer-alice-001",
      "name": "Alice",
      "fans": 50000000,
      "rank": 45,
      "characters": ["char-1", "char-2"]
    },
    {
      "id": "trainer-alice-002",
      "name": "Alice Smith",
      "fans": 30000000,
      "rank": 38,
      "characters": ["char-3"]
    },
    {
      "id": "trainer-alice-003",
      "name": "Alice Johnson",
      "fans": 15000000,
      "rank": 28,
      "characters": []
    }
  ]
}
```

**Miner Output:**
```javascript
{
  success: true,
  data: {
    query: "Alice",
    limit: 10,
    offset: 0,
    total: 3,
    results: [
      { id: "trainer-alice-001", name: "Alice", fans: 50000000, ... },
      { id: "trainer-alice-002", name: "Alice Smith", fans: 30000000, ... },
      { id: "trainer-alice-003", name: "Alice Johnson", fans: 15000000, ... }
    ]
  },
  metadata: {
    endpoint: "/api/v3/search",
    statusCode: 200,
    timestamp: "2026-07-18T12:34:56Z"
  }
}
```

---

### Step 2-3: Courier & Inspector

**Courier:** Transports search response unchanged

**Inspector:** Validates each trainer object in results array
- trainer-alice-001: ✅ PASS
- trainer-alice-002: ✅ PASS
- trainer-alice-003: ✅ PASS

---

### Step 4: Vault Stores

**Vault Logic:**
1. Receives array of 3 trainers
2. Stores each individually
3. Links them to search query

**Vault Storage:**
```javascript
[
  {
    storageId: "storage-uuid-1",
    trainerId: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    storedAt: "2026-07-18T12:34:56Z",
    searchContext: { query: "Alice" }
  },
  {
    storageId: "storage-uuid-2",
    trainerId: "trainer-alice-002",
    name: "Alice Smith",
    fans: 30000000,
    rank: 38,
    storedAt: "2026-07-18T12:34:56Z",
    searchContext: { query: "Alice" }
  },
  {
    storageId: "storage-uuid-3",
    trainerId: "trainer-alice-003",
    name: "Alice Johnson",
    fans: 15000000,
    rank: 28,
    storedAt: "2026-07-18T12:34:56Z",
    searchContext: { query: "Alice" }
  }
]
```

---

### Final Result: MULTIPLE TRAINERS STORED

```
✅ Search for "Alice" completed and stored 3 trainers
   1. Alice (50M fans, rank 45)
   2. Alice Smith (30M fans, rank 38)
   3. Alice Johnson (15M fans, rank 28)
```

---

## Complete Pipeline Summary

### Data Flow Diagram

```
                    UMA.MOE API
                        │
                        ▼
    ┌─────────────────────────────────────┐
    │ MINER: Acquire Raw Data             │
    │ ✓ Fetch from uma.moe                │
    │ ✓ No modification                   │
    │ ✓ Error handling & retry            │
    └─────────────────────────────────────┘
                        │
                        ▼
    ┌─────────────────────────────────────┐
    │ COURIER: Transport                  │
    │ ✓ Pass data unchanged               │
    │ ✓ Detect transport failures         │
    └─────────────────────────────────────┘
                        │
                        ▼
    ┌─────────────────────────────────────┐
    │ INSPECTOR: Validate                 │
    │ ✓ Check existence                   │
    │ ✓ Check structure                   │
    │ ✓ Check completeness                │
    │ ✓ Check type integrity              │
    │ ✓ Check range integrity             │
    └─────────────────────────────────────┘
                   ❌ Rejected          ✅ Accepted
                        │                     │
                        ▼                     ▼
                    (Discard)         ┌───────────────┐
                                      │ VAULT: Store  │
                                      │ ✓ Persist     │
                                      │ ✓ Retrieve    │
                                      └───────────────┘
                                              │
                                              ▼
                                    (Trusted Data)
```

---

## Error Handling Summary

| Scenario | Error Type | Retriable | Action |
|----------|-----------|-----------|--------|
| Network timeout | Transient | ✅ Yes | Retry with backoff |
| Rate limited (429) | Transient | ✅ Yes | Wait & retry |
| API 5xx error | Transient | ✅ Yes | Retry with backoff |
| Not found (404) | Permanent | ❌ No | Log & continue |
| Invalid params (400) | Permanent | ❌ No | Log & continue |
| Validation failed | Data error | ❌ No | Reject, don't store |
| Storage failed | Transient | ✅ Yes | Retry with backoff |

---

## Performance Notes

Based on these examples:

- **Single trainer fetch:** 150ms (Miner) + 1ms (Courier) + 2ms (Inspector) + 8ms (Vault) = **~160ms total**
- **Search query (3 trainers):** 180ms (Miner) + 1ms (Courier) + 3ms (Inspector) + 24ms (Vault) = **~210ms total**
- **With retry (2 attempts):** 30s timeout + 1s backoff + 150ms success = **~31.2s total**
- **Rate limit wait:** 60s + normal pipeline = **~60.2s total**

---

## Versioning

This specification is version **1.0**.

**Change Log:**
- **v1.0** (2026-07-18) — Initial integration examples
