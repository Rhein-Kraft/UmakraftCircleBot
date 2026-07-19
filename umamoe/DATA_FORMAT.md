# Data Format Specification

## Purpose

This document defines the exact data structure and format that flows through the UmaMoe pipeline. All departments (Miner, Courier, Inspector, Vault) must understand and respect this format.

Data must maintain consistent structure as it moves through each stage:
- **Miner** acquires it from uma.moe API
- **Courier** transports it unchanged
- **Inspector** validates its structure and completeness
- **Vault** stores it persistently

---

## Data Source

All data originates from the **uma.moe API** (`https://uma.moe/api/docs`).

The Miner is responsible for fetching data from approved uma.moe endpoints and passing it through the pipeline without modification or interpretation.

---

## Core Data Structure: Trainer Object

### Overview

The primary data structure flowing through UmaMoe is a **Trainer object** retrieved from the uma.moe API.

### Schema Definition

```json
{
  "id": "string",
  "name": "string",
  "fans": "number",
  "rank": "number",
  "characters": "array (optional)",
  "achievements": "array (optional)"
}
```

### Field Definitions

| Field | Type | Required | Description | Example | Constraints |
|-------|------|----------|-------------|---------|-------------|
| `id` | string | ✅ Yes | Unique trainer identifier | `"trainer-alice-001"` | Non-empty, alphanumeric + hyphens |
| `name` | string | ✅ Yes | Display name of trainer | `"Alice"` | Non-empty, 1-100 characters |
| `fans` | number | ✅ Yes | Total fan count | `50000000` | Non-negative integer, numeric type only |
| `rank` | number | ✅ Yes | Trainer rank tier | `45` | Integer, range 1-100 |
| `characters` | array | ❌ No | Array of character IDs owned | `["char-1", "char-2"]` | Can be empty array or omitted |
| `achievements` | array | ❌ No | Array of achievement objects | `[{id: "ach-1", ...}]` | Can be empty array or omitted |

---

## Valid Data Examples

### Minimal Valid Trainer (All Required Fields)

```json
{
  "id": "trainer-bob-002",
  "name": "Bob",
  "fans": 25000000,
  "rank": 32
}
```

✅ **Status:** VALID
- All required fields present
- All types correct
- Passes Inspector validation

---

### Full Trainer (With Optional Fields)

```json
{
  "id": "trainer-alice-001",
  "name": "Alice",
  "fans": 150000000,
  "rank": 87,
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
    },
    {
      "id": "achievement-rank-80",
      "name": "Rank 80",
      "unlockedAt": "2026-02-20T14:45:00Z"
    }
  ]
}
```

✅ **Status:** VALID
- All required fields present
- Optional fields included with valid structure
- All types correct

---

## Invalid Data Examples

### ❌ Missing Required Field: `fans`

```json
{
  "id": "trainer-charlie-003",
  "name": "Charlie",
  "rank": 50
}
```

**Status:** INVALID  
**Reason:** INCOMPLETE_DATA  
**Missing Field:** `fans`  
**Inspector Action:** REJECT

---

### ❌ Invalid Type: `fans` is String

```json
{
  "id": "trainer-diana-004",
  "name": "Diana",
  "fans": "150M",
  "rank": 60
}
```

**Status:** INVALID  
**Reason:** INVALID_TYPE  
**Problem:** `fans` is string `"150M"`, expected numeric type  
**Inspector Action:** REJECT  
**Note:** Even though "150M" is readable to humans, the Miner must not transform it. If the uma.moe API returns this format, the Inspector rejects it and Miner must report the failure.

---

### ❌ Invalid Type: `rank` is String

```json
{
  "id": "trainer-eve-005",
  "name": "Eve",
  "fans": 75000000,
  "rank": "sixty"
}
```

**Status:** INVALID  
**Reason:** INVALID_TYPE  
**Problem:** `rank` is string `"sixty"`, expected number  
**Inspector Action:** REJECT

---

### ❌ Empty Required String: `name`

```json
{
  "id": "trainer-frank-006",
  "name": "",
  "fans": 40000000,
  "rank": 45
}
```

**Status:** INVALID  
**Reason:** INCOMPLETE_DATA  
**Problem:** `name` is empty string  
**Inspector Action:** REJECT

---

### ❌ Out of Range: `rank` > 100

```json
{
  "id": "trainer-grace-007",
  "name": "Grace",
  "fans": 200000000,
  "rank": 105
}
```

**Status:** INVALID  
**Reason:** INVALID_VALUE  
**Problem:** `rank` is 105, exceeds maximum of 100  
**Inspector Action:** REJECT

---

### ❌ Negative Fan Count

```json
{
  "id": "trainer-henry-008",
  "name": "Henry",
  "fans": -5000000,
  "rank": 25
}
```

**Status:** INVALID  
**Reason:** INVALID_VALUE  
**Problem:** `fans` is negative, expected non-negative  
**Inspector Action:** REJECT

---

### ❌ Wrong Structure: `characters` is Object Instead of Array

```json
{
  "id": "trainer-iris-009",
  "name": "Iris",
  "fans": 80000000,
  "rank": 55,
  "characters": {
    "0": "uma-musume-special-week"
  }
}
```

**Status:** INVALID  
**Reason:** INVALID_STRUCTURE  
**Problem:** `characters` is an object `{}`, expected array `[]`  
**Inspector Action:** REJECT

---

### ⚠️ Valid But With Optional Fields Omitted

```json
{
  "id": "trainer-jack-010",
  "name": "Jack",
  "fans": 60000000,
  "rank": 42
}
```

**Status:** VALID  
**Reason:** All required fields present with correct types. Optional fields (`characters`, `achievements`) can be omitted.  
**Inspector Action:** ACCEPT

---

## Data Flow Through Pipeline

### 1. Miner Acquires (Raw uma.moe Response)

**Input:** Request to uma.moe API  
**Output:** Raw JSON response

```json
{
  "id": "trainer-alice-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45,
  "characters": ["char-1", "char-2"]
}
```

**Miner Responsibility:**
- Preserve data exactly as received
- Do not modify, rename, or add fields
- Do not interpret or calculate values
- Return the raw structure

---

### 2. Courier Transports (No Modification)

**Input:** Data from Miner  
**Output:** Same data to Inspector

```json
{
  "id": "trainer-alice-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45,
  "characters": ["char-1", "char-2"]
}
```

**Courier Responsibility:**
- Move data between Miner and Inspector
- Preserve structure and content
- Do not modify, rename, or add fields
- Report transport failures

---

### 3. Inspector Validates (Checks Compliance)

**Input:** Data from Courier  
**Output:** Acceptance/Rejection decision

**Validation Process:**

1. **Existence Check** — Response is not empty
2. **Structure Check** — Expected fields are objects/arrays/primitives as needed
3. **Completeness Check** — All required fields exist
4. **Type Integrity Check** — Each field has correct type
5. **Range Check** — Numeric values within valid ranges

**Result Format:**

```json
{
  "passed": true,
  "originalData": {
    "id": "trainer-alice-001",
    "name": "Alice",
    "fans": 50000000,
    "rank": 45,
    "characters": ["char-1", "char-2"]
  },
  "reason": null
}
```

OR (if rejected):

```json
{
  "passed": false,
  "originalData": {
    "id": "trainer-bob-002",
    "name": "Bob",
    "fans": "50M",
    "rank": 45
  },
  "reason": "INVALID_TYPE: Field 'fans' must be number, received string"
}
```

**Inspector Responsibility:**
- Validate structure and completeness
- Do NOT modify original data
- Return clear pass/fail decision
- Provide rejection reason if applicable

---

### 4. Vault Stores (Preserves Accepted Data)

**Input:** Accepted data from Inspector  
**Output:** Stored in persistent storage

```json
{
  "trainerId": "trainer-alice-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45,
  "characters": ["char-1", "char-2"],
  "storedAt": "2026-07-18T12:34:56Z",
  "retrievedFrom": "https://uma.moe/api/trainers/trainer-alice-001"
}
```

**Vault Responsibility:**
- Store accepted data persistently
- Add minimal metadata (storageId, timestamp, source URL)
- Preserve original data fields unchanged
- Do not transform or reinterpret data

---

## Type Specifications

### String Type

**Rules:**
- Must be enclosed in quotes: `"value"`
- Must be non-empty (except where explicitly optional)
- No null values
- No undefined values

**Valid Examples:**
- `"Alice"`
- `"trainer-001"`
- `"150M-fan-club"`

**Invalid Examples:**
- `` (empty string)
- `null`
- `undefined`
- `Alice` (unquoted)

---

### Number Type

**Rules:**
- Must be numeric (not string representation)
- No quotes around value
- Must be valid JSON number format
- No `NaN` or `Infinity`

**Valid Examples:**
- `50000000`
- `45`
- `0`

**Invalid Examples:**
- `"50000000"` (quoted, is string)
- `"50M"` (string representation)
- `NaN`
- `Infinity`

---

### Array Type

**Rules:**
- Enclosed in square brackets: `[...]`
- Can be empty: `[]`
- Elements maintain their types

**Valid Examples:**
- `[]` (empty)
- `["char-1", "char-2"]` (array of strings)
- `[1, 2, 3]` (array of numbers)

**Invalid Examples:**
- `"char-1, char-2"` (string, not array)
- `{0: "char-1"}` (object, not array)

---

### Object Type

**Rules:**
- Enclosed in curly braces: `{...}`
- Contains key-value pairs
- Keys must be strings (in quotes)
- Values maintain their types

**Valid Example:**
```json
{
  "id": "trainer-001",
  "fans": 50000000
}
```

**Invalid Example:**
```json
{
  id: "trainer-001",
  fans: 50000000
}
```
(Keys are unquoted — not valid JSON)

---

## Constraints and Rules

### For Required Fields

1. **Must be present** — Cannot be omitted from the data structure
2. **Must have correct type** — String fields are strings, numbers are numbers
3. **Must not be null** — Null values are treated as missing
4. **Must not be empty strings** — Empty strings fail completeness check

### For Optional Fields

1. **Can be omitted** — Entire field can be absent without rejection
2. **If present, must be correct type** — Cannot be wrong type even if optional
3. **If present, cannot be null** — If included, must have valid value

### For Numeric Fields

1. **Must be numeric type** — `50000000` not `"50000000"`
2. **No string representation** — `"50M"` is invalid
3. **Must be non-negative** — Fan counts cannot be negative
4. **Must be within range** — Rank must be 1-100
5. **Must be integer** — No decimal places for counts/ranks

### For String Fields

1. **Must be non-empty** — Empty strings are invalid
2. **Must be less than 100 characters** — Name constraint
3. **Must contain valid characters** — IDs use alphanumeric + hyphens

---

## Edge Cases

### Case 1: Multiple Trainers in Response

If the uma.moe API returns **multiple trainers in an array**:

```json
[
  {
    "id": "trainer-alice-001",
    "name": "Alice",
    "fans": 50000000,
    "rank": 45
  },
  {
    "id": "trainer-bob-002",
    "name": "Bob",
    "fans": 25000000,
    "rank": 32
  }
]
```

**Pipeline Handling:**

- **Miner:** Passes entire array to Courier (no splitting)
- **Courier:** Transports entire array
- **Inspector:** Validates each trainer object in the array individually
- **Vault:** Stores each trainer with unique ID

---

### Case 2: Empty Response

If uma.moe API returns an **empty array**:

```json
[]
```

**Pipeline Handling:**

- **Miner:** Reports successful acquisition (no data found is not an error)
- **Courier:** Transports empty array
- **Inspector:** Checks if empty is acceptable for this request
  - If expecting data: REJECT (existence check fails)
  - If empty is acceptable: ACCEPT
- **Vault:** Stores nothing (no entries to save)

---

### Case 3: API Error Response

If uma.moe API returns an **error status code** (e.g., 401, 404, 500):

```json
{
  "error": "Not Found",
  "status": 404,
  "message": "Trainer with ID 'invalid-id' not found"
}
```

**Pipeline Handling:**

- **Miner:** Detects HTTP error, reports acquisition failure
  - Does NOT pass error response to Courier
  - Returns explicit error result
- **Courier:** Never receives this data
- **Inspector:** Never validates this
- **Vault:** Never stores this

---

### Case 4: Malformed JSON

If uma.moe API returns **invalid JSON**:

```
{ "id": "trainer-001", "name": "Alice" [TRUNCATED OR INVALID]
```

**Pipeline Handling:**

- **Miner:** Detects JSON parse error, reports acquisition failure
- **Courier:** Never receives data
- **Inspector:** Never validates
- **Vault:** Never stores

---

## Summary: Data Integrity Rules

| Stage | Action | Allowed | Not Allowed |
|-------|--------|---------|------------|
| **Miner** | Acquire | Fetch, preserve exact format, report errors | Modify, validate, calculate, store |
| **Courier** | Transport | Move, preserve structure, report transport failures | Modify, validate, split, combine |
| **Inspector** | Validate | Check types, structure, completeness, range | Store, calculate, interpret meaning |
| **Vault** | Store | Persist, retrieve, add metadata (timestamp), intentional updates | Transform, interpret, auto-calculate |

---

## Versioning

This specification is version **1.0** and applies to current uma.moe API responses.

If the uma.moe API changes its response format, this document must be updated and versioned accordingly.

**Change Log:**
- **v1.0** (2026-07-18) — Initial specification based on uma.moe API structure
