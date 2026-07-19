# Miner — API Endpoints Specification

## Purpose

This document defines the approved **uma.moe API endpoints** that the Miner is authorized to access. The Miner must only communicate with endpoints listed in this specification.

All requests made by the Miner must:
- Use only approved endpoints
- Respect rate limits
- Include proper error handling
- Preserve raw API responses without modification

---

## Overview: Approved Endpoints

The Miner has access to the following uma.moe API endpoints:

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/health` | GET | Service health check | ✅ Approved |
| `/api/trainers/{id}` | GET | Get single trainer by ID | ✅ Approved |
| `/api/v3/search` | GET | Search trainers by name/query | ✅ Approved |
| `/api/v3/count` | GET | Count search results | ✅ Approved |
| `/api/rankings` | GET | Get ranked trainer list | ✅ Approved |
| `/api/stats` | GET | Get service usage statistics | ⚠️ Optional |
| `/api/v4/circles` | GET | Get circle details and member fan data | ✅ Approved |
| `/api/v4/circles/list` | GET | Search and list circles | ✅ Approved |
| `/api/v4/circles/rank-thresholds` | GET | Get circle tier rank thresholds | ✅ Approved |
| `/api/v4/rankings/monthly` | GET | Monthly fan gain rankings | ✅ Approved |
| `/api/v4/rankings/alltime` | GET | All-time fan rankings | ✅ Approved |
| `/api/v4/rankings/gains` | GET | Rolling gain rankings | ✅ Approved |
| `/api/v4/user/profile/{account_id}` | GET | Get full trainer profile | ✅ Approved |
| `/api/v4/user/profile/veterans/{veteran_id}` | GET | Get veteran character details | ✅ Approved |
| `/api/v4/shame/hall` | GET | List suspicious activity entries | ✅ Approved |
| `/api/v4/shame/viewer/{viewer_id}` | GET | Suspicious activity report for a viewer | ✅ Approved |
| `/api/ver` | GET | Get current server version | ✅ Approved |
| `/api/ver/history` | GET | Get version history | ✅ Approved |

---

## Endpoint Details

### 1. Health Check

**Purpose:** Verify the uma.moe API service is online and responding.

**Endpoint:** `GET /api/health`

**Base URL:** `https://uma.moe/api`

**Full URL:** `https://uma.moe/api/health`

**Query Parameters:** None

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-07-18T12:34:56Z",
  "version": "1.0.0"
}
```

**Failure Response (5xx):**
```json
{
  "status": "error",
  "message": "Service unavailable"
}
```

**Miner Usage:**
- Use this endpoint to verify API connectivity before making acquisition requests
- If health check fails, Miner should report API unavailability
- Do NOT retry this endpoint indefinitely; fail fast if health check fails

---

### 2. Get Single Trainer

**Purpose:** Retrieve detailed information for a specific trainer by ID.

**Endpoint:** `GET /api/trainers/{id}`

**Base URL:** `https://uma.moe/api`

**Full URL Example:** `https://uma.moe/api/trainers/trainer-alice-001`

**Path Parameters:**
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `id` | string | ✅ Yes | Unique trainer identifier | `"trainer-alice-001"` |

**Query Parameters:** None

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:** None

**Success Response (200 OK):**
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

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Not Found",
  "status": 404,
  "message": "Trainer with ID 'invalid-id' not found"
}
```

**400 Bad Request:**
```json
{
  "error": "Bad Request",
  "status": 400,
  "message": "Invalid trainer ID format"
}
```

**Miner Usage:**
- Request a specific trainer by ID
- Store the raw response (do not modify)
- Pass the complete JSON response to Courier
- For 404 errors, report that trainer does not exist (not an acquisition failure)
- For 400 errors, report that ID format is invalid

**Expected Response Time:** < 500ms

---

### 3. Search Trainers

**Purpose:** Search for trainers by name or query string.

**Endpoint:** `GET /api/v3/search`

**Base URL:** `https://uma.moe/api`

**Full URL Example:** `https://uma.moe/api/v3/search?query=Alice&limit=50`

**Query Parameters:**

| Parameter | Type | Required | Default | Description | Example |
|-----------|------|----------|---------|-------------|---------|
| `query` | string | ❌ No | (empty) | Search string (trainer name, ID prefix) | `"Alice"` |
| `limit` | number | ❌ No | `50` | Maximum results to return | `100` |
| `offset` | number | ❌ No | `0` | Results offset for pagination | `50` |
| `sort` | string | ❌ No | `"fans"` | Sort field: `fans`, `rank`, `name` | `"rank"` |
| `order` | string | ❌ No | `"desc"` | Sort order: `asc`, `desc` | `"desc"` |

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "query": "Alice",
  "limit": 50,
  "offset": 0,
  "total": 15,
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
    }
  ]
}
```

**Empty Result (200 OK):**
```json
{
  "query": "NonexistentTrainer",
  "limit": 50,
  "offset": 0,
  "total": 0,
  "results": []
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Bad Request",
  "status": 400,
  "message": "Invalid limit: must be between 1 and 1000"
}
```

**Miner Usage:**
- Perform search queries across the trainer database
- Store the raw response including metadata (total count, offset)
- Pass the complete JSON response to Courier
- Empty results are valid (not an error)
- For error responses, report and handle according to error handling rules
- Pagination: Use `offset` to retrieve results beyond the initial limit

**Expected Response Time:** < 1000ms

**Common Queries:**
- `?query=Alice` — Find trainers named "Alice"
- `?query=alice-001` — Find trainer by ID prefix
- `?limit=100&sort=fans&order=desc` — Top 100 trainers by fan count
- `?offset=50&limit=50` — Trainers 50-99

---

### 4. Get Rankings

**Purpose:** Retrieve a ranked list of trainers, sorted by specified criteria.

**Endpoint:** `GET /api/rankings`

**Base URL:** `https://uma.moe/api`

**Full URL Example:** `https://uma.moe/api/rankings?season=current&limit=100`

**Query Parameters:**

| Parameter | Type | Required | Default | Description | Example |
|-----------|------|----------|---------|-------------|---------|
| `season` | string | ❌ No | `"current"` | Season: `current`, `all-time` | `"current"` |
| `limit` | number | ❌ No | `100` | Max trainers to return | `100` |
| `offset` | number | ❌ No | `0` | Pagination offset | `50` |

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "season": "current",
  "timestamp": "2026-07-18T00:00:00Z",
  "limit": 100,
  "offset": 0,
  "total": 5000,
  "rankings": [
    {
      "rank": 1,
      "id": "trainer-super-001",
      "name": "Super Trainer",
      "fans": 500000000,
      "fans_gain": 50000000,
      "previous_rank": 1
    },
    {
      "rank": 2,
      "id": "trainer-mega-002",
      "name": "Mega Trainer",
      "fans": 450000000,
      "fans_gain": 45000000,
      "previous_rank": 3
    }
  ]
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Bad Request",
  "status": 400,
  "message": "Invalid season: must be 'current' or 'all-time'"
}
```

**Miner Usage:**
- Retrieve top-ranked trainers for analysis
- Store raw response without modification
- Pass complete JSON response to Courier
- Note: Response includes `fans_gain` and `previous_rank` which the Miner does NOT calculate (it's from the API)

**Expected Response Time:** < 2000ms

**Pagination Example:**
- First 100 ranks: `?limit=100&offset=0`
- Next 100 ranks: `?limit=100&offset=100`
- Trainers ranked 1000-1100: `?limit=100&offset=1000`

---

### 5. Service Statistics (Optional)

**Purpose:** Retrieve general API and service usage statistics.

**Endpoint:** `GET /api/stats`

**Base URL:** `https://uma.moe/api`

**Full URL:** `https://uma.moe/api/stats`

**Query Parameters:** None

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "timestamp": "2026-07-18T12:34:56Z",
  "total_trainers": 5432,
  "total_requests_today": 1000000,
  "average_response_time_ms": 150,
  "health": "ok"
}
```

**Miner Usage:**
- Optional endpoint for monitoring
- Not part of the core data acquisition pipeline
- Use for logging/debugging purposes only
- Do NOT use this data for business logic

---

## Rate Limits

All endpoints are subject to the following rate limits:

| Limit | Value | Notes |
|-------|-------|-------|
| **Per-Second** | 10 requests/second | Hard limit per IP |
| **Per-Minute** | 500 requests/minute | Rolling window |
| **Per-Hour** | 7,200 requests/hour | Rolling window |
| **Per-Day** | 172,800 requests/day | Resets at 00:00 UTC |

**Rate Limit Headers:**

When making requests, the API responds with rate limit information in headers:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1689691200
```

**Rate Limit Response (429 Too Many Requests):**

```json
{
  "error": "Too Many Requests",
  "status": 429,
  "message": "Rate limit exceeded. Please wait before retrying.",
  "retry_after_seconds": 60
}
```

**Miner Responsibility:**
- Check `X-RateLimit-Remaining` before making requests
- Respect `Retry-After` header
- Implement exponential backoff for 429 responses
- Log rate limit warnings
- Do NOT hammer the API with rapid requests

---

## Authentication

**Current Status:** No authentication required

**Future Requirements:** To be documented when uma.moe implements authentication

If authentication becomes required:
- API key will be provided via environment variable
- Include key in request header: `Authorization: Bearer {API_KEY}`
- Update this document when authentication is added

---

## Request Timeout

All requests to uma.moe API must have a **maximum timeout of 30 seconds**.

If a request does not complete within 30 seconds:
- Cancel the request
- Report timeout error to error handler
- Do NOT retry immediately (implement exponential backoff)

---

## Response Headers

All successful responses include:

```
Content-Type: application/json
Date: [HTTP Date]
Server: uma.moe-api/1.0
X-RateLimit-Limit: [number]
X-RateLimit-Remaining: [number]
X-RateLimit-Reset: [unix timestamp]
```

---

## Error Status Codes

The uma.moe API returns standard HTTP status codes. Miner must handle:

| Status | Meaning | Miner Action |
|--------|---------|--------------|
| **200** | OK | Data valid, pass to Courier |
| **400** | Bad Request | Invalid parameters, log error, do NOT retry |
| **401** | Unauthorized | Invalid/missing API key, do NOT retry |
| **403** | Forbidden | Access denied, do NOT retry |
| **404** | Not Found | Resource doesn't exist, log and continue |
| **429** | Too Many Requests | Rate limited, implement backoff and retry |
| **500** | Internal Server Error | API error, retry with exponential backoff |
| **502** | Bad Gateway | API unavailable, retry with exponential backoff |
| **503** | Service Unavailable | API maintenance, retry with exponential backoff |
| **504** | Gateway Timeout | API timeout, retry with exponential backoff |

---

## Endpoint Usage Rules

### Do's (Allowed)

✅ Request data from approved endpoints only  
✅ Preserve raw API responses  
✅ Report errors clearly  
✅ Implement retries for transient failures  
✅ Respect rate limits  
✅ Log all requests for debugging  
✅ Include request/response timestamps  

### Don'ts (Prohibited)

❌ Request from unapproved endpoints  
❌ Modify API response data  
❌ Calculate values based on API response  
❌ Store permanent data  
❌ Perform business logic  
❌ Ignore rate limits  
❌ Make requests without timeout  
❌ Retry indefinitely  

---

## Configuration

The Miner must externalize API configuration:

```javascript
// DO NOT hardcode endpoints like this:
const TRAINER_URL = "https://uma.moe/api/trainers/";

// DO use configuration:
const API_CONFIG = {
  baseUrl: process.env.UMA_MOE_API_BASE_URL || "https://uma.moe/api",
  healthEndpoint: "/health",
  trainerEndpoint: "/trainers/{id}",
  searchEndpoint: "/v3/search",
  rankingsEndpoint: "/rankings",
  timeout: process.env.API_TIMEOUT_MS || 30000,
  maxRetries: process.env.API_MAX_RETRIES || 3
};
```

**Environment Variables:**
- `UMA_MOE_API_BASE_URL` — Base URL for uma.moe API (default: `https://uma.moe/api`)
- `API_TIMEOUT_MS` — Request timeout in milliseconds (default: `30000`)
- `API_MAX_RETRIES` — Maximum retry attempts (default: `3`)

---

## Testing Endpoints

During development, test each endpoint:

**Health Check:**
```bash
curl -X GET https://uma.moe/api/health
```

**Get Trainer:**
```bash
curl -X GET https://uma.moe/api/trainers/trainer-alice-001
```

**Search:**
```bash
curl -X GET "https://uma.moe/api/v3/search?query=Alice&limit=10"
```

**Rankings:**
```bash
curl -X GET "https://uma.moe/api/rankings?limit=100"
```

---

## Endpoint Constraints

### Miner Must Not

- Request from endpoints not listed in this document
- Modify endpoint URLs or parameters
- Add custom parameters not defined here
- Attempt to bypass rate limits
- Cache API responses (that's Vault's job)
- Perform calculations on API data
- Store data permanently

### Miner May Only

- Request data from approved endpoints
- Preserve raw API responses
- Report errors clearly
- Implement retries for transient failures
- Add request/response metadata (timestamps, IDs)

---

## Versioning

This specification is version **1.0** and applies to current uma.moe API.

**Change Log:**
- **v1.0** (2026-07-18) — Initial specification for approved endpoints

**Future Updates:**
- If uma.moe API changes, update this document
- New endpoints require approval in this specification
- Deprecated endpoints must be removed from this list
