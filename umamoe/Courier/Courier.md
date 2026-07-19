# Courier

## Purpose

The **Courier** is responsible for transporting acquired data from the Miner to the next stage of the UmaMoe data acquisition pipeline.

The Courier receives data acquired by the Miner and delivers it to the Inspector.

The Courier is a transport component only.

It must not acquire data from external APIs, analyze data, validate data quality, or permanently store data.

---

## Related Documentation

This specification must be read in conjunction with:

- **MINER_ENDPOINTS.md** — API endpoints that produce the data being transported
- **DATA_FORMAT.md** — Data structure format and pipeline flow
- **ERROR_HANDLING.md** — Error classification, failure modes, and transport errors
- **INTEGRATION_EXAMPLE.md** — Real-world usage examples and transport scenarios

---

# Implementation Authority

This document is the authoritative specification for the implementation of `courier.js`.

The implementation must follow the responsibilities, boundaries, inputs, outputs, and restrictions defined in this document.

If a behavior is not defined in this specification, the implementation must not invent additional responsibilities for the Courier.

---

# Responsibilities

The Courier is responsible for:

1. Receiving acquired data from the Miner
2. Validating that received data is transportable (basic checks only)
3. Transporting the data to the Inspector
4. Preserving the data structure and meaning during transport
5. Reporting transport failures clearly in the error format
6. Passing both success and failure results unchanged
7. Logging transport events for debugging

The Courier is NOT responsible for:
- Acquiring data from external APIs
- Validating data quality or accuracy
- Determining if data is correct
- Storing data persistently
- Calculating or transforming values
- Business logic
- Authorization or access control

The Courier exists to create a clear separation between:

```text
Acquisition (Miner)
        │
        ▼
   Raw Data
        │
        ▼
Transport (Courier) ← You are here
        │
        ▼
   Validation (Inspector)
        │
        ▼
   Storage (Vault)
```

---

# Input

The Courier receives data from the Miner in a standardized result format.

**Input Structure (from Miner):**

The Courier receives either:

### Success Input

```javascript
{
  success: true,
  data: {
    // Raw API response (unmodified)
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    characters: [...],
    achievements: [...]
  },
  metadata: {
    endpoint: string,
    statusCode: number,
    timestamp: string,
    source: string,
    attempts: number
  }
}
```

### Failure Input

```javascript
{
  success: false,
  error: string,
  message: string,
  severity: string,
  retriable: boolean,
  timestamp: string,
  context: {
    endpoint: string,
    statusCode: number,
    attempts: number,
    // ... error-specific context
  }
}
```

**Input Examples:**

### Success Example
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

### Failure Example
```javascript
{
  success: false,
  error: "NETWORK_TIMEOUT",
  message: "Request timed out after 30 seconds",
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

The Courier must only accept input produced by the Miner or an approved upstream acquisition component.

Refer to **ERROR_HANDLING.md** for complete input format specifications.

---

# Input Validation (Transport Checks)

The Courier is NOT responsible for data quality validation (that's Inspector's job).

However, the Courier IS responsible for detecting whether data is **transportable** (can be passed to the next stage).

**4 Basic Transportability Checks:**

| Check | Requirement | Valid | Invalid |
|-------|-------------|-------|---------|
| **Exists** | Input is not null/undefined | `{...}` | `null`, `undefined` |
| **Is Object** | Input is an object (not array/primitive) | `{...}` | `[]`, `"string"` |
| **Has Result Field** | Input has `success` field | `{ success: true }` | `{ data: {...} }` |
| **Has Correct Structure** | Success has `data`, Failure has `error` | ✓ Both valid | Missing required field |

**Invalid Input Detection:**

```javascript
function validateTransportability(input) {
  // Check 1: Exists
  if (input === null || input === undefined) {
    return {
      transportable: false,
      reason: 'TRANSPORT_INVALID_INPUT: Input is null or undefined'
    };
  }
  
  // Check 2: Is Object
  if (typeof input !== 'object' || Array.isArray(input)) {
    return {
      transportable: false,
      reason: `TRANSPORT_INVALID_INPUT: Input is ${typeof input}, expected object`
    };
  }
  
  // Check 3: Has result field
  if (!('success' in input)) {
    return {
      transportable: false,
      reason: 'TRANSPORT_INVALID_INPUT: Missing required field "success"'
    };
  }
  
  // Check 4: Has correct structure
  if (input.success === true && !('data' in input)) {
    return {
      transportable: false,
      reason: 'TRANSPORT_INVALID_INPUT: Success result missing "data" field'
    };
  }
  
  if (input.success === false && !('error' in input)) {
    return {
      transportable: false,
      reason: 'TRANSPORT_INVALID_INPUT: Failure result missing "error" field'
    };
  }
  
  return { transportable: true };
}
```

**Do NOT:**
- ❌ Validate data quality (is fans a valid number?)
- ❌ Check business rules (is rank 1-100?)
- ❌ Verify field types (that's Inspector's job)
- ❌ Filter or remove fields
- ❌ Transform data

**Do:**
- ✅ Check if input exists
- ✅ Check if input is an object
- ✅ Check if result structure is correct
- ✅ Fail if any basic check fails

Refer to **ERROR_HANDLING.md** for complete input validation specification.

---

# Output

The Courier delivers the received data to the Inspector unchanged.

**Output Format (Passthrough):**

The Courier's output is identical to its input. It preserves both structure and content.

```javascript
// If input was success:
{
  success: true,
  data: { ... },           // Unchanged
  metadata: { ... }        // Unchanged
}

// If input was failure:
{
  success: false,
  error: string,           // Unchanged
  message: string,         // Unchanged
  severity: string,        // Unchanged
  retriable: boolean,      // Unchanged
  timestamp: string,       // Unchanged
  context: { ... }         // Unchanged
}
```

**Output Examples:**

### Success Passthrough
```javascript
// Input from Miner:
{
  success: true,
  data: { id: "trainer-alice-001", name: "Alice", fans: 50000000 },
  metadata: { endpoint: "/api/trainers/trainer-alice-001", ... }
}

// Output to Inspector (IDENTICAL):
{
  success: true,
  data: { id: "trainer-alice-001", name: "Alice", fans: 50000000 },
  metadata: { endpoint: "/api/trainers/trainer-alice-001", ... }
}
```

### Failure Passthrough
```javascript
// Input from Miner:
{
  success: false,
  error: "NETWORK_TIMEOUT",
  message: "Request timed out",
  severity: "warning",
  retriable: true,
  timestamp: "2026-07-18T12:34:56Z",
  context: { ... }
}

// Output to Inspector (IDENTICAL):
{
  success: false,
  error: "NETWORK_TIMEOUT",
  message: "Request timed out",
  severity: "warning",
  retriable: true,
  timestamp: "2026-07-18T12:34:56Z",
  context: { ... }
}
```

The Courier must not:

- ❌ Calculate values
- ❌ Analyze data
- ❌ Validate business rules
- ❌ Determine whether data is correct
- ❌ Store permanent records
- ❌ Generate reports
- ❌ Create images
- ❌ Send Discord messages
- ❌ Transform or modify data
- ❌ Rename fields
- ❌ Remove fields
- ❌ Add calculated fields

Its output is the transported data delivered to the Inspector.

Refer to **DATA_FORMAT.md** for complete output format specifications.

---

# Data Pipeline

```text
Miner
   │
   │ Result Object (success or failure)
   ▼
Acquired Data
   │
   ▼ Transport (Courier) ← You are here
   │
   ▼
Transported Data (identical to input)
   │
   ▼
Inspector
   │
   ├── ✅ Accepted → Vault
   │
   └── ❌ Rejected → Log & Discard
```

The Courier is the transport boundary between acquisition and inspection.

Both success and failure results flow through the Courier unchanged.

---

# Data Integrity

The Courier must preserve the data it receives.

The Courier must not change or modify data in any way.

**Preservation Rules:**

| Item | Rule | Valid | Invalid |
|------|------|-------|---------|
| **Values** | Must not change | `fans: 50000000` → `fans: 50000000` | `fans: 50000000` → `fans: 50M` |
| **Fields** | Must not rename | `fans` → `fans` | `fans` → `totalFans` |
| **Structure** | Must not reorganize | `{id, name, fans}` → `{id, name, fans}` | `{id, name, fans}` → `[id, name, fans]` |
| **Types** | Must not convert | `string` → `string` | `string` → `number` |
| **Fields** | Must not remove | All fields present | Remove optional fields |
| **Fields** | Must not add | No new fields | Add `calculated_fans` |

**Serialization/Deserialization:**

If the Courier must serialize data for transport (e.g., JSON stringify), it must deserialize identically:

```javascript
// Input
const input = {
  success: true,
  data: { id: "trainer-001", fans: 50000000 },
  metadata: { timestamp: "2026-07-18T12:34:56Z" }
};

// Serialize for transport
const serialized = JSON.stringify(input);

// Deserialize from transport
const output = JSON.parse(serialized);

// Output must be identical to input
// ✅ PASS: JSON.stringify(input) === JSON.stringify(output)
```

Transport must not change the meaning of the data.

---

# Transport Mechanism

The Courier provides a predictable method for moving data between the Miner and Inspector.

**Recommended Transport Mechanism: Direct Function Call**

For the current UmaMoe architecture (single process, modular components), use direct function calls:

```javascript
// courier.js
export async function transport(minerResult) {
  // Validate transportability
  const validation = validateTransportability(minerResult);
  if (!validation.transportable) {
    return {
      success: false,
      error: 'TRANSPORT_INVALID_INPUT',
      message: validation.reason,
      severity: 'critical',
      retriable: false,
      timestamp: new Date().toISOString(),
      context: { originalInput: minerResult }
    };
  }
  
  // Transport to Inspector
  try {
    const inspectorResult = await inspector.receive(minerResult);
    return inspectorResult;
  } catch (error) {
    return {
      success: false,
      error: 'TRANSPORT_DELIVERY_FAILED',
      message: `Failed to deliver to Inspector: ${error.message}`,
      severity: 'warning',
      retriable: true,
      timestamp: new Date().toISOString(),
      context: { originalError: error.message }
    };
  }
}
```

**Alternative Mechanisms (if needed in future):**

- **Events** — Publish-subscribe model for loose coupling
- **Queues** — Message queue for async processing and reliability
- **Callbacks** — Function parameter for custom delivery
- **Web API** — HTTP endpoints for distributed systems

The selected mechanism must follow the project's architecture.

---

# Error Handling

The Courier must handle transport failures safely.

All transport errors must be classified and formatted according to **ERROR_HANDLING.md**.

## Transport Error Types

### Transient Errors (Retriable)

**Definition:** Temporary failures that may succeed if retried.

**Examples:**
- `TRANSPORT_DELIVERY_FAILED` — Inspector unavailable (network issue)
- `TRANSPORT_TIMEOUT` — Delivery exceeded timeout
- `TRANSPORT_QUEUE_FULL` — Transport queue full (if using queues)

**Courier Action:** Log error and return with `retriable: true`

### Permanent Errors (Non-Retriable)

**Definition:** Failures that will not succeed if retried without external intervention.

**Examples:**
- `TRANSPORT_INVALID_INPUT` — Input doesn't have required structure
- `TRANSPORT_UNINITIALIZED` — Inspector module not initialized
- `TRANSPORT_INCOMPATIBLE_FORMAT` — Data format incompatible with transport

**Courier Action:** Log error and return with `retriable: false`

### Passthrough Errors (From Miner)

**Definition:** Errors from the Miner that are passed through unchanged.

**Examples:**
- `NETWORK_TIMEOUT` (from Miner) → Pass through unchanged
- `API_RATE_LIMIT_EXCEEDED` (from Miner) → Pass through unchanged
- Any failure from Miner → Pass through unchanged

**Courier Action:** Transport the error result as-is

## Error Handling Implementation

```javascript
async function transport(minerResult) {
  // 1. Check if input is null/invalid
  const transportCheck = validateTransportability(minerResult);
  if (!transportCheck.transportable) {
    return {
      success: false,
      error: 'TRANSPORT_INVALID_INPUT',
      message: transportCheck.reason,
      severity: 'critical',
      retriable: false,
      timestamp: new Date().toISOString(),
      context: { reason: transportCheck.reason }
    };
  }
  
  // 2. If input is from Miner (success or failure), check if we need to deliver
  if (minerResult.success === false) {
    // Failure from Miner - pass through to Inspector unchanged
    console.log(`Transporting Miner failure: ${minerResult.error}`);
    return minerResult;  // Already has proper error format
  }
  
  // 3. Attempt delivery to Inspector
  try {
    const inspectorResult = await inspector.receive(minerResult);
    return inspectorResult;
  } catch (error) {
    // Transport error (not Miner error, not Inspector error, but transport error)
    return {
      success: false,
      error: 'TRANSPORT_DELIVERY_FAILED',
      message: `Courier failed to deliver data to Inspector: ${error.message}`,
      severity: 'warning',
      retriable: true,
      timestamp: new Date().toISOString(),
      context: {
        originalError: error.message,
        attemptedToDeliver: minerResult
      }
    };
  }
}
```

The Courier must:
- ✅ Detect invalid input (not transportable)
- ✅ Detect delivery failures (cannot reach Inspector)
- ✅ Report failures clearly in error format
- ✅ Preserve Miner errors unchanged
- ✅ Log transport events

The Courier must NOT:
- ❌ Silently lose data
- ❌ Pretend successful delivery when it failed
- ❌ Modify or transform error results
- ❌ Validate data quality (that's Inspector's job)

Refer to **ERROR_HANDLING.md** for complete transport error specifications.

---

# Logging Requirements

The Courier must log transport events for debugging and monitoring.

**Log Format:**

```
[ISO8601 Timestamp] LEVEL courier: EVENT_DESCRIPTION
  Field1: value
  Field2: value
```

**Log Examples:**

### Success Transport
```
[2026-07-18T12:34:56Z] INFO courier: Transport successful
  Endpoint: /api/trainers/trainer-alice-001
  DataSize: 512 bytes
  Destination: Inspector
  Duration: 2ms
```

### Input Validation Failure
```
[2026-07-18T12:34:56Z] ERROR courier: Invalid input received
  Reason: Missing required field "success"
  Severity: critical
  Action: Transport aborted
```

### Delivery Failure (Transient)
```
[2026-07-18T12:34:56Z] WARN courier: Transport delivery failed
  Error: TRANSPORT_DELIVERY_FAILED
  Destination: Inspector
  Retriable: true
  Reason: Inspector module unavailable
```

### Miner Error Passthrough
```
[2026-07-18T12:34:56Z] WARN courier: Transporting Miner error
  MinnerError: NETWORK_TIMEOUT
  Endpoint: /api/trainers/trainer-alice-001
  Retriable: true
  Message: Request timed out after 30 seconds
```

**Logging Requirements:**

- ✅ Log all successful transports (INFO level)
- ✅ Log all input validation failures (ERROR level)
- ✅ Log all delivery failures (WARN or ERROR level depending on severity)
- ✅ Log Miner errors being passed through (WARN level)
- ✅ Include relevant context (endpoint, error code, etc.)
- ✅ Use ISO 8601 timestamps
- ✅ Use standardized log format

---

# Data Pipeline

```text
Miner                          Courier                 Inspector
   │                              │                          │
   │ Result Object                │                          │
   ├─ success: true/false         │                          │
   ├─ data or error               │                          │
   ├─ metadata                    │                          │
   └─ context                     │                          │
                                  │                          │
                    [Transport checks]                       │
                    [Validate transportable]                 │
                    [Pass through]                           │
                                  │                          │
                                  ├─ Success: Deliver data ──→ Inspect
                                  │                          │ Data
                                  ├─ Error: Pass through ───→ Log Error
                                  │
                                  └─ Invalid: Generate error
                                     and report
```

The Courier is the transport boundary between acquisition and inspection.

---

# Separation of Responsibilities

The Courier must not perform responsibilities belonging to other departments.

## The Courier must NOT:

- ❌ Request data from the uma.moe API (that's Miner's job)
- ❌ Perform external data acquisition
- ❌ Calculate statistics or values
- ❌ Apply business logic
- ❌ Determine achievements or milestones
- ❌ Validate data accuracy (that's Inspector's job)
- ❌ Validate business rules
- ❌ Permanently store data (that's Vault's job)
- ❌ Generate reports
- ❌ Create images
- ❌ Create Discord embeds or messages
- ❌ Distribute final products
- ❌ Filter or select which data to transport

These responsibilities belong to other departments.

---

# Relationship with Miner

The Miner acquires data. The Courier transports it.

```text
Miner
  │
  │ Acquires from API
  ▼
Result Object
  │
  │ success: true/false
  │ data: {...}
  │ error: "..."
  │ metadata: {...}
  ▼
Courier
  │
  │ Validates transportability
  │ Delivers unchanged
  ▼
Inspector
```

The Miner must not be responsible for internal transportation.

The Courier must not be responsible for external acquisition.

**Handoff Contract:**

- **Miner provides:** Result object with `success`, `data`/`error`, `metadata`, `context`
- **Courier receives:** Exact result object from Miner
- **Courier delivers:** Exact same object to Inspector
- **Inspector receives:** Identical object

---

# Relationship with Inspector

The Courier delivers data to the Inspector but does not determine whether the data is trustworthy.

The Inspector is responsible for examining the received data.

```text
Courier
   │
   │ Delivers: success or failure result
   ▼
Inspector
   │
   ├─ ✅ Data Valid? → Accept → Vault
   │
   ├─ ❌ Data Invalid? → Reject → Log
   │
   └─ ❌ Transport Error? → Log Error
```

The Courier's responsibility ends when the data has been successfully delivered to the Inspector.

What happens next (validation, storage, rejection) is not the Courier's concern.

---

# Implementation Requirements for courier.js

The implementation of `courier.js` must:

1. ✅ Provide a clear transport interface (e.g., `transport(minerResult)`)
2. ✅ Receive data from the Miner in standard result format
3. ✅ Validate basic transportability (4 checks)
4. ✅ Deliver data to the Inspector unchanged
5. ✅ Classify and report transport failures clearly
6. ✅ Preserve Miner errors unchanged (passthrough)
7. ✅ Implement comprehensive logging
8. ✅ Avoid permanent storage
9. ✅ Avoid business logic
10. ✅ Avoid data analysis
11. ✅ Avoid validation logic (beyond transportability)
12. ✅ Avoid presentation logic
13. ✅ Avoid Discord-specific logic
14. ✅ Avoid direct communication with unrelated systems

**Structural Requirements:**

- Use modular code structure (separate concerns)
- Create a validation module for transportability checks
- Create an error module for error classification and formatting
- Create a logging module for consistent log output
- Create a main courier module that orchestrates transport

**Example Structure:**

```javascript
// validation.js
export function validateTransportability(input) { ... }
export const TRANSPORTABILITY_CHECKS = { ... };

// errors.js
export function classifyTransportError(error) { ... }
export const TRANSPORT_ERROR_CODES = { ... };

// logging.js
export function logTransport(event, details) { ... }
export function logError(error, context) { ... }

// courier.js (main entry point)
export async function transport(minerResult) { ... }
```

The implementation should be modular so that the internal transport mechanism can evolve without changing the responsibilities of the Miner or Inspector.

---

# Expected Implementation Boundary

The expected responsibility of `courier.js` is:

```text
Receive Result from Miner
        │
        ▼
Validate Transportability
(4 basic checks)
        │
        ▼
   Is Valid?
   /       \
  YES       NO
  │         │
  ▼         ▼
Transport  Generate
Result     Error
  │         │
  ▼         ▼
Deliver to  Return Error
Inspector   Result
  │         │
  └─────┬───┘
        │
        ▼
Report Transport Result
(STOP HERE - don't go beyond transport)
```

The implementation must stop at the transportation boundary.

**Do NOT:**
- ❌ Continue into Inspector's validation logic
- ❌ Continue into Vault's storage logic
- ❌ Add business logic
- ❌ Analyze data content
- ❌ Make decisions about data quality

---

# Design Principle

> **The Courier moves data. It does not acquire, interpret, or judge data.**

The Courier exists to ensure that information acquired by the Miner reaches the Inspector without being lost, silently altered, or mixed with responsibilities belonging to other departments.

The Courier is a **faithful conduit** for data. It transports both successes and failures, preserving their meaning and content exactly as provided by the Miner.

---

# Implementation Rule

When creating or modifying `courier.js`, the implementation agent must:

1. ✅ Read this document completely
2. ✅ Read ERROR_HANDLING.md (error classification and transport errors)
3. ✅ Read DATA_FORMAT.md (data structures)
4. ✅ Read INTEGRATION_EXAMPLE.md (real-world scenarios)
5. ✅ Follow the responsibilities defined in this document
6. ✅ Respect all prohibited responsibilities
7. ✅ Preserve the boundary between Miner, Courier, and Inspector
8. ✅ Avoid inventing undefined behavior
9. ✅ Ask for clarification when a required implementation detail is missing instead of silently creating unrelated functionality
10. ✅ Implement all transportability checks

The resulting `courier.js` must be an implementation of this specification, not an independent redesign of the Courier architecture.

---

# Quick Reference Checklist

When implementing or reviewing `courier.js`, verify:

- [ ] Input is in standard result format (success or failure from Miner)
- [ ] 4 transportability checks implemented (exists, is object, has success field, correct structure)
- [ ] Invalid input generates `TRANSPORT_INVALID_INPUT` error
- [ ] Success results passed through unchanged to Inspector
- [ ] Failure results from Miner passed through unchanged
- [ ] Delivery failures classified as transient (retriable: true)
- [ ] Delivery to Inspector called with exact input (no modification)
- [ ] Output format matches input format (passthrough)
- [ ] All errors include: error code, message, severity, retriable, timestamp, context
- [ ] Comprehensive logging at each stage
- [ ] No data modification or transformation
- [ ] No business logic
- [ ] No validation beyond basic transportability
- [ ] Modular code structure (validation, errors, logging, courier modules)

---

# Version History

**v1.0** (2026-07-18) — Initial specification  
**v2.0** (2026-07-18) — Comprehensive update aligned with all supporting documentation
- Added related documentation section with cross-references
- Added detailed input/output specifications with examples
- Added 4 basic transportability validation checks
- Added transport error handling (transient vs permanent)
- Added recommended transport mechanism (direct function calls)
- Added logging requirements with format examples
- Added implementation structure examples
- Added comprehensive implementation requirements checklist
- Added quick reference checklist for verification
- Expanded expected implementation boundary with flow diagram
- Clarified passthrough behavior for Miner errors
