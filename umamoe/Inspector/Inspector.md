# Inspector

## Purpose

The **Inspector** is responsible for examining data received from the Courier before it enters the Vault.

It checks whether the acquired data is structurally usable, complete enough for the system, and suitable for permanent storage.

The Inspector is a data examination and validation component.

It does not acquire data, transport data, modify data into a new form, or permanently store data.

---

## Related Documentation

This specification must be read in conjunction with:

- **VALIDATION_RULES.md** — Complete validation rules, checks, and implementation (in same directory)
- **ERROR_HANDLING.md** — Error classification, failure modes, and rejection handling
- **DATA_FORMAT.md** — Data structure format and pipeline flow
- **INTEGRATION_EXAMPLE.md** — Real-world validation scenarios and rejection cases

---

# Implementation Authority

This document is the authoritative specification for the implementation of `inspector.js`.

The implementation must follow the responsibilities, boundaries, inputs, outputs, and restrictions defined in this document.

If a behavior is not defined in this specification, the implementation must not invent additional responsibilities for the Inspector.

---

# Responsibilities

The Inspector is responsible for:

1. Receiving transported data from the Courier
2. Detecting whether data represents a success or failure result
3. For success results: Examining the structure of the received data
4. For success results: Checking whether required information is present
5. For success results: Detecting malformed or unusable data
6. For success results: Detecting invalid types and out-of-range values
7. For success results: Determining whether the data is acceptable for storage
8. For failure results: Passing error information through unchanged
9. Rejecting data that fails validation
10. Passing accepted data to the Vault
11. Reporting inspection results clearly
12. Logging validation events for debugging

The Inspector is NOT responsible for:
- Acquiring data from external APIs
- Transporting data
- Modifying data or transforming it
- Business calculations or interpretations
- Calculating fan gains or rankings
- Determining achievements or milestones
- Storing data persistently
- Generating reports or producing output
- Authorization or access control

---

# Input

The Inspector receives transported data from the Courier in one of two forms:

### Success Input (Data to Validate)

```javascript
{
  success: true,
  data: {
    // Raw API response (to be validated)
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    characters: ["char-1", "char-2"],
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

### Failure Input (Error from Miner/Courier)

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

### Success Example (Trainer Data)
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

### Failure Example (Network Error)
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

The Inspector must examine data it receives without assuming that all received data is valid.

Refer to **VALIDATION_RULES.md** for complete input specifications.

---

# Inspection Decision Tree

The Inspector uses a sequential decision tree:

```
Receive Data from Courier
        │
        ▼
Is success: false? (Failure from Miner)
        │
    YES │  NO
        │   │
        │   ▼
        │  Category 1: Existence Check
        │  Data exists and is not empty?
        │       │
        │       ├─ NO → REJECT
        │       │
        │       └─ YES ▼
        │         Category 2: Structure Check
        │         Is object (not array)?
        │              │
        │              ├─ NO → REJECT
        │              │
        │              └─ YES ▼
        │                Category 3: Completeness Check
        │                All required fields present?
        │                     │
        │                     ├─ NO → REJECT
        │                     │
        │                     └─ YES ▼
        │                       Category 4: Type Integrity Check
        │                       All fields have correct types?
        │                            │
        │                            ├─ NO → REJECT
        │                            │
        │                            └─ YES ▼
        │                              Category 5: Range Integrity Check
        │                              All values in valid ranges?
        │                                   │
        │                                   ├─ NO → REJECT
        │                                   │
        │                                   └─ YES ▼
        │                                    ✅ ACCEPT
        │
        └─────────────────────────────────────────→ ✅ PASS THROUGH
                                                   (Error from Miner)
```

---

# Validation Categories

The Inspector validates data using 5 sequential validation categories:

Refer to **VALIDATION_RULES.md** for complete specifications, implementation code, and test cases.

## Category 1: Existence

**Purpose:** Determine whether data exists and is not empty.

| Check | Valid | Invalid |
|-------|-------|---------|
| Data not null | `{...}` | `null` |
| Data not undefined | `{...}` | `undefined` |
| Data not empty object | `{id: "1"}` | `{}` |
| Is object (not array) | `{...}` | `[]` |

**Example Rejection:**
```javascript
{
  passed: false,
  originalData: null,
  reason: "EXISTENCE_FAILURE: Data is null or undefined"
}
```

---

## Category 2: Structure

**Purpose:** Determine whether data has the expected object structure.

| Check | Valid | Invalid |
|-------|-------|---------|
| Is object | `{...}` | `[]` or `"string"` |
| Has properties | `{id: "1"}` | `{}` |
| Properties accessible | `for (key in data)` | Inaccessible properties |

**Example Rejection:**
```javascript
{
  passed: false,
  originalData: ["trainer-001", "Alice"],
  reason: "STRUCTURE_FAILURE: Expected object, got array"
}
```

---

## Category 3: Completeness

**Purpose:** Determine whether all required fields are present and non-empty.

**Required Fields:**
- `id` (string, non-empty)
- `name` (string, non-empty)
- `fans` (number, non-null)
- `rank` (number, non-null)

| Field | Must Exist | Cannot Be |
|-------|-----------|-----------|
| `id` | ✅ Yes | null, undefined, empty string |
| `name` | ✅ Yes | null, undefined, empty string |
| `fans` | ✅ Yes | null, undefined, NaN |
| `rank` | ✅ Yes | null, undefined, NaN |

**Example Rejection:**
```javascript
{
  passed: false,
  originalData: {
    id: "trainer-alice-001",
    name: "Alice",
    rank: 45
    // Missing: fans
  },
  reason: "COMPLETENESS_FAILURE: Required field 'fans' is missing"
}
```

---

## Category 4: Type Integrity

**Purpose:** Determine whether fields have correct data types.

**Type Requirements:**

| Field | Type | Valid | Invalid |
|-------|------|-------|---------|
| `id` | string | `"trainer-001"` | `123`, `true`, `null` |
| `name` | string | `"Alice"` | `123`, `true`, `null` |
| `fans` | number (integer) | `50000000`, `0` | `"50M"`, `50.5`, `true` |
| `rank` | number (integer) | `45`, `1` | `"45"`, `45.5`, `true` |
| `characters` | array | `[]`, `["c1"]` | `"char-1"`, `{0: "c1"}` |
| `achievements` | array | `[]`, `[{...}]` | `"achievement"`, `{0: {...}}` |

**Example Rejection:**
```javascript
{
  passed: false,
  originalData: {
    id: "trainer-alice-001",
    name: "Alice",
    fans: "50000000",  // String instead of number
    rank: 45
  },
  reason: "TYPE_INTEGRITY_FAILURE: Field 'fans' must be number, got string"
}
```

---

## Category 5: Range Integrity

**Purpose:** Determine whether numeric values are within acceptable ranges.

**Range Requirements:**

| Field | Min | Max | Valid | Invalid |
|-------|-----|-----|-------|---------|
| `fans` | 0 | ∞ | `0`, `50000000` | `-1`, `-100` |
| `rank` | 1 | 100 | `1`, `50`, `100` | `0`, `101`, `-1` |

**Example Rejection:**
```javascript
{
  passed: false,
  originalData: {
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 105  // Out of range (max 100)
  },
  reason: "RANGE_INTEGRITY_FAILURE: Field 'rank' must be 1-100, got 105"
}
```

---

# Validation Implementation

Complete validation implementation with all 5 categories:

```javascript
function inspect(input) {
  // Handle failure results from Miner/Courier
  if (input.success === false) {
    // Pass through error unchanged
    console.log(`Inspecting error result: ${input.error}`);
    return input;  // Return unchanged
  }
  
  const data = input.data;
  
  // Category 1: Existence
  let result = validateExistence(data);
  if (!result.passed) {
    return {
      passed: false,
      originalData: data,
      reason: result.reason
    };
  }
  
  // Category 2: Structure
  result = validateStructure(data);
  if (!result.passed) {
    return {
      passed: false,
      originalData: data,
      reason: result.reason
    };
  }
  
  // Category 3: Completeness
  result = validateCompleteness(data);
  if (!result.passed) {
    return {
      passed: false,
      originalData: data,
      reason: result.reason
    };
  }
  
  // Category 4: Type Integrity
  result = validateTypeIntegrity(data);
  if (!result.passed) {
    return {
      passed: false,
      originalData: data,
      reason: result.reason
    };
  }
  
  // Category 5: Range Integrity
  result = validateRangeIntegrity(data);
  if (!result.passed) {
    return {
      passed: false,
      originalData: data,
      reason: result.reason
    };
  }
  
  // All validations passed
  return {
    passed: true,
    originalData: data,
    reason: null
  };
}
```

Refer to **VALIDATION_RULES.md** for complete implementation details, code examples, and test cases.

---

# Output

The Inspector produces a validation result.

### Accepted Output

When data passes all 5 validation categories:

```javascript
{
  passed: true,
  originalData: {
    // Original data, unmodified
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    characters: ["char-1", "char-2"]
  },
  reason: null
}
```

The accepted data (stored in `originalData`) is passed to the Vault for storage.

### Rejected Output

When data fails any validation category:

```javascript
{
  passed: false,
  originalData: {
    // Original data, unmodified (for debugging/logging)
    id: "trainer-alice-001",
    name: "Alice",
    fans: "50000000",  // Invalid type
    rank: 45
  },
  reason: "TYPE_INTEGRITY_FAILURE: Field 'fans' must be number, got string"
}
```

Rejected data must NOT be stored in the Vault as trusted data.

The rejection result clearly identifies the reason for rejection.

### Error Passthrough Output

When data represents a failure from Miner/Courier:

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
    attempts: 3
  }
}
```

Error results pass through unchanged to logging/monitoring systems.

---

# Output Examples

### Success Example: Data Accepted
```javascript
// Input (from Courier)
{
  success: true,
  data: {
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    characters: ["char-1"]
  },
  metadata: { ... }
}

// Output (to Vault)
{
  passed: true,
  originalData: {
    id: "trainer-alice-001",
    name: "Alice",
    fans: 50000000,
    rank: 45,
    characters: ["char-1"]
  },
  reason: null
}

✅ Data stored in Vault
```

### Failure Example: Data Rejected
```javascript
// Input (from Courier)
{
  success: true,
  data: {
    id: "trainer-charlie-003",
    name: "Charlie",
    fans: "75000000",  // Wrong type!
    rank: 50
  },
  metadata: { ... }
}

// Output (rejection)
{
  passed: false,
  originalData: {
    id: "trainer-charlie-003",
    name: "Charlie",
    fans: "75000000",
    rank: 50
  },
  reason: "TYPE_INTEGRITY_FAILURE: Field 'fans' must be number, got string"
}

❌ Data NOT stored. Error logged.
```

### Error Example: Network Failure
```javascript
// Input (from Courier - Miner error)
{
  success: false,
  error: "NETWORK_TIMEOUT",
  message: "Request timed out after 30 seconds",
  severity: "warning",
  retriable: true,
  timestamp: "2026-07-18T12:34:56Z",
  context: { ... }
}

// Output (pass through unchanged)
{
  success: false,
  error: "NETWORK_TIMEOUT",
  message: "Request timed out after 30 seconds",
  severity: "warning",
  retriable: true,
  timestamp: "2026-07-18T12:34:56Z",
  context: { ... }
}

⚠️ Error passed to monitoring/logging
```

---

# Data Pipeline

```text
Courier
   │
   ▼
Inspector (You are here)
   │
   ├─ Success Input?
   │  │
   │  └─→ Run 5 Validation Categories
   │     │
   │     ├─ ALL PASS → ✅ ACCEPT
   │     │     │
   │     │     ▼
   │     │    Vault
   │     │
   │     └─ ANY FAIL → ❌ REJECT
   │           │
   │           ▼
   │          Log Rejection
   │
   └─ Failure Input?
      │
      └─→ Pass through unchanged
           │
           ▼
          Monitoring/Logging
```

---

# Data Integrity

The Inspector must NOT modify the original data during validation.

**Preservation Rules:**

| Item | Rule | Valid | Invalid |
|------|------|-------|---------|
| **Values** | Must not change | `fans: 50000000` → `fans: 50000000` | `fans: 50000000` → `fans: 50M` |
| **Fields** | Must not rename | `fans` → `fans` | `fans` → `totalFans` |
| **Structure** | Must not reorganize | `{id, name, fans}` | `[id, name, fans]` |
| **Original Data** | Must be preserved | In rejection reason | Lost or modified |

**Correct Validation Pattern:**

```javascript
// ✅ CORRECT: Inspect without modifying
function inspect(input) {
  // Examine input.data
  if (input.data.fans !== typeof 'number') {
    return {
      passed: false,
      originalData: input.data,  // Original, unmodified
      reason: "TYPE_INTEGRITY_FAILURE: ..."
    };
  }
}

// ❌ WRONG: Modifying data
function inspect(input) {
  input.data.fans = String(input.data.fans);  // DON'T DO THIS
  // ...
}

// ❌ WRONG: Transforming data
function inspect(input) {
  return {
    passed: true,
    data: {
      ...input.data,
      fans_formatted: `${input.data.fans}M`  // DON'T ADD NEW FIELDS
    }
  };
}
```

---

# Validation Boundary

The Inspector is responsible for determining whether data is structurally and technically acceptable.

The Inspector must NOT perform business calculations or interpret the meaning of the data.

**Acceptable Inspector Determinations:**

- ✅ `id` field is missing
- ✅ `fans` is not a number
- ✅ `rank` is outside 1-100 range
- ✅ `name` is an empty string
- ✅ Data is malformed JSON

**NOT Acceptable Inspector Determinations:**

- ❌ This trainer qualifies for the 50 million fan achievement (that's Refinery's job)
- ❌ This trainer should be ranked higher (that's Refinery's job)
- ❌ Calculate the fan gain since last update (that's Refinery's job)
- ❌ Determine milestones or rewards (that's Refinery's job)
- ❌ Generate performance reports (that's Refinery's job)

---

# Error Handling

The Inspector detects and reports validation failures.

## Validation Rejection Format

When data fails validation:

```javascript
{
  passed: false,
  originalData: { /* unmodified data */ },
  reason: "{CATEGORY}_FAILURE: {specific reason}"
}
```

**Rejection Reason Format:** `{CATEGORY}_FAILURE: {specific reason}`

Examples:
- `EXISTENCE_FAILURE: Data is null or undefined`
- `STRUCTURE_FAILURE: Expected object, got array`
- `COMPLETENESS_FAILURE: Required field 'fans' is missing`
- `TYPE_INTEGRITY_FAILURE: Field 'fans' must be number, got string`
- `RANGE_INTEGRITY_FAILURE: Field 'rank' must be 1-100, got 105`

## Error Passthrough

When data represents a Miner/Courier error (success: false):

```javascript
{
  success: false,
  error: "ERROR_CODE",
  message: "...",
  severity: "...",
  retriable: boolean,
  timestamp: "...",
  context: { ... }
}
```

Error results pass through unchanged to monitoring/logging.

Refer to **ERROR_HANDLING.md** for complete error specifications.

---

# Logging Requirements

The Inspector must log validation events for debugging and monitoring.

**Log Format:**

```
[ISO8601 Timestamp] LEVEL inspector: EVENT_DESCRIPTION
  Field1: value
  Field2: value
```

**Log Examples:**

### Validation Success
```
[2026-07-18T12:34:56Z] INFO inspector: Validation successful
  TrainerId: trainer-alice-001
  Status: ACCEPTED
  ValidationTime: 2ms
```

### Validation Failure
```
[2026-07-18T12:34:56Z] WARN inspector: Validation failed
  TrainerId: trainer-charlie-003
  Reason: TYPE_INTEGRITY_FAILURE: Field 'fans' must be number, got string
  Status: REJECTED
  ValidationTime: 1ms
```

### Error Passthrough
```
[2026-07-18T12:34:56Z] WARN inspector: Error result received
  Error: NETWORK_TIMEOUT
  Endpoint: /api/trainers/trainer-alice-001
  Retriable: true
  PassthroughStatus: OK
```

### Empty Response
```
[2026-07-18T12:34:56Z] INFO inspector: Empty response received
  Reason: EXISTENCE_FAILURE: Data is null or undefined
  Status: REJECTED
```

---

# Separation of Responsibilities

The Inspector must not perform responsibilities belonging to other departments.

## The Inspector must NOT:

- ❌ Request data from the uma.moe API (that's Miner's job)
- ❌ Acquire external data
- ❌ Transport data (that's Courier's job)
- ❌ Calculate fan gains
- ❌ Calculate rankings
- ❌ Determine achievements (that's Refinery's job)
- ❌ Determine milestones (that's Refinery's job)
- ❌ Apply business logic
- ❌ Generate reports or output
- ❌ Create images or Discord embeds
- ❌ Distribute products
- ❌ Permanently store accepted data (that's Vault's job)
- ❌ Modify or transform data

These responsibilities belong to other departments.

---

# Relationship with Courier

The Courier transports data. The Inspector examines the transported data.

```text
Miner
   │
   ▼
Courier
   │
   ├─ Success: data object
   │
   └─ Failure: error object
        │
        ▼
    Inspector (You are here)
```

The Inspector must not assume that transported data is automatically valid.

The Courier guarantees transportation. The Inspector determines whether the transported data is acceptable.

---

# Relationship with Vault

The Inspector is the final gate before data enters the Vault.

```text
Inspector
    │
    ├─ Accepted ✅
    │     │
    │     ▼
    │    Vault (Stored as trusted data)
    │
    └─ Rejected ❌
          │
          ▼
         Log rejection (Not stored)
```

Only data that successfully passes all 5 validation categories may be sent to the Vault.

Rejected data must NOT be stored as trusted data.

---

# Implementation Requirements for inspector.js

The implementation of `inspector.js` must:

1. ✅ Provide a clear inspection interface (e.g., `inspect(data)`)
2. ✅ Receive data from the Courier in standard format
3. ✅ Detect failure results from Miner (success: false)
4. ✅ Pass through error results unchanged
5. ✅ Implement all 5 validation categories for success results
6. ✅ Check existence, structure, completeness, type integrity, range integrity
7. ✅ Produce clear acceptance or rejection results
8. ✅ Provide specific rejection reasons (CATEGORY_FAILURE format)
9. ✅ Preserve original data (do not modify)
10. ✅ Implement comprehensive logging
11. ✅ Avoid modifying the original acquired data
12. ✅ Avoid permanent storage
13. ✅ Avoid business calculations or logic
14. ✅ Avoid achievement or milestone logic

**Structural Requirements:**

- Use modular code structure (separate validation functions for each category)
- Create a validation module for each category
- Create an error module for rejection reason formatting
- Create a logging module for consistent log output
- Create a main inspector module that orchestrates validation

**Example Structure:**

```javascript
// validation/existence.js
export function validateExistence(data) { ... }

// validation/structure.js
export function validateStructure(data) { ... }

// validation/completeness.js
export function validateCompleteness(data) { ... }

// validation/typeIntegrity.js
export function validateTypeIntegrity(data) { ... }

// validation/rangeIntegrity.js
export function validateRangeIntegrity(data) { ... }

// errors.js
export function formatRejection(category, reason, data) { ... }

// logging.js
export function logValidation(status, details) { ... }

// inspector.js (main entry point)
export function inspect(input) { ... }
```

The implementation should allow inspection rules to be expanded as the project's data requirements evolve.

---

# Expected Implementation Boundary

The expected responsibility of `inspector.js` is:

```text
Receive Data from Courier
        │
        ▼
Is Failure Result? (success: false)
    │
    ├─ YES → Pass through unchanged
    │        │
    │        ▼
    │     Monitoring/Logging
    │
    └─ NO → Run Validation
            │
            ▼
         Category 1: Existence
         Category 2: Structure
         Category 3: Completeness
         Category 4: Type Integrity
         Category 5: Range Integrity
            │
        ┌───┴───┐
        │       │
        YES     NO
        │       │
        ▼       ▼
      ACCEPT  REJECT
        │       │
        ▼       ▼
       Vault   Logging

(STOP HERE - don't store, don't transform)
```

The implementation must stop at the inspection boundary.

The Vault is responsible for storing accepted data. The Inspector does not make that decision.

**Do NOT:**
- ❌ Store data (that's Vault's job)
- ❌ Transform data for downstream use (that's Refinery's job)
- ❌ Apply business logic
- ❌ Continue validation beyond the 5 categories

---

# Design Principle

> **The Inspector determines whether data is fit to be trusted.**

The Inspector is the gatekeeper between external information and the trusted internal data stored by UmaKraft.

It does not decide what the data means.

It decides whether the data is structurally reliable enough to be preserved and processed by the next stage of the architecture.

---

# Implementation Rule

When creating or modifying `inspector.js`, the implementation agent must:

1. ✅ Read this document completely
2. ✅ Read VALIDATION_RULES.md (complete validation rules and implementation)
3. ✅ Read ERROR_HANDLING.md (error classification and format)
4. ✅ Read DATA_FORMAT.md (data structures)
5. ✅ Read INTEGRATION_EXAMPLE.md (real-world validation scenarios)
6. ✅ Follow the responsibilities defined in this document
7. ✅ Respect all prohibited responsibilities
8. ✅ Implement all 5 validation categories
9. ✅ Preserve the boundary between Courier, Inspector, and Vault
10. ✅ Avoid inventing undefined validation behavior
11. ✅ Ask for clarification when a required inspection rule is missing instead of silently creating unrelated validation logic

The resulting `inspector.js` must be an implementation of this specification, not an independent redesign of the Inspector architecture.

---

# Quick Reference Checklist

When implementing or reviewing `inspector.js`, verify:

- [ ] Receives data in standard format from Courier
- [ ] Detects failure results (success: false)
- [ ] Passes failure results through unchanged
- [ ] For success results: Validates all 5 categories sequentially
- [ ] Category 1: Existence (data exists, not empty)
- [ ] Category 2: Structure (is object, has properties)
- [ ] Category 3: Completeness (all required fields present)
- [ ] Category 4: Type Integrity (correct field types)
- [ ] Category 5: Range Integrity (values in valid ranges)
- [ ] Rejection reason format: `{CATEGORY}_FAILURE: {reason}`
- [ ] Original data preserved (never modified)
- [ ] Accepted results sent to Vault
- [ ] Rejected results logged (not stored)
- [ ] Comprehensive logging at each stage
- [ ] No business logic or calculations
- [ ] No data transformation or modification
- [ ] Modular code structure (separate validation modules)
- [ ] Error module for rejection formatting
- [ ] Logging module for consistent output

---

# Version History

**v1.0** (2026-07-18) — Initial specification  
**v2.0** (2026-07-18) — Comprehensive update aligned with all supporting documentation
- Added related documentation section with cross-references
- Added detailed inspection decision tree with visual flow
- Added 5 validation categories with concrete examples
- Added complete validation implementation code
- Added input/output specifications with examples
- Added error passthrough behavior for Miner failures
- Added logging requirements with format examples
- Added implementation structure examples
- Added comprehensive implementation requirements checklist
- Added quick reference checklist for verification
- Expanded expected implementation boundary with flow diagram
- Enhanced data integrity section with preservation rules
- Clarified validation boundary (what Inspector can/cannot do)
