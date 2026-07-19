# Inspector — Validation Rules Specification

## Purpose

This document defines the exact validation rules that the Inspector must apply to all data received from the Courier before it is accepted into the Vault.

The Inspector is the gatekeeper between external (untrusted) data and internal (trusted) data. Every piece of data must pass all validation checks defined in this specification before it can be stored.

---

## Validation Framework

The Inspector validates data using 5 sequential validation categories:

1. **Existence** — Does the data exist?
2. **Structure** — Is it the right type/shape?
3. **Completeness** — Are all required fields present?
4. **Type Integrity** — Do fields have correct types?
5. **Range Integrity** — Are values within acceptable ranges?

Data must pass **ALL 5 categories** to be accepted.

---

## Validation Category 1: Existence

**Purpose:** Determine whether data exists and is not empty.

**Rules:**

| Rule | Check | Valid | Invalid | Reason |
|------|-------|-------|---------|--------|
| Data not null | `data !== null` | `{...}` | `null` | Null is not usable |
| Data not undefined | `data !== undefined` | `{...}` | `undefined` | Undefined is not usable |
| Data not empty object | `Object.keys(data).length > 0` | `{id: "1"}` | `{}` | Empty object has no data |
| Data is object | `typeof data === 'object'` | `{...}` | `[]` or `"string"` | Must be object, not array/primitive |

**Implementation:**

```javascript
function validateExistence(data) {
  if (data === null || data === undefined) {
    return {
      passed: false,
      reason: 'EXISTENCE_FAILURE: Data is null or undefined'
    };
  }
  
  if (typeof data !== 'object' || Array.isArray(data)) {
    return {
      passed: false,
      reason: `EXISTENCE_FAILURE: Data is ${typeof data}, expected object`
    };
  }
  
  if (Object.keys(data).length === 0) {
    return {
      passed: false,
      reason: 'EXISTENCE_FAILURE: Data is empty object'
    };
  }
  
  return { passed: true };
}
```

**Examples:**

✅ **Passes:**
```json
{ "id": "trainer-001", "name": "Alice", "fans": 50000000, "rank": 45 }
```

❌ **Fails — Null:**
```
null
```
**Reason:** EXISTENCE_FAILURE

❌ **Fails — Empty Object:**
```json
{}
```
**Reason:** EXISTENCE_FAILURE

❌ **Fails — Array Instead of Object:**
```json
[
  { "id": "trainer-001", "name": "Alice" }
]
```
**Reason:** EXISTENCE_FAILURE

---

## Validation Category 2: Structure

**Purpose:** Determine whether data has the expected object structure.

**Rules:**

| Rule | Check | Valid | Invalid | Reason |
|------|-------|-------|---------|--------|
| Is object | `typeof data === 'object'` | `{...}` | `[]` or `"string"` | Must be object |
| Has properties | `Object.keys(data).length > 0` | `{id: "1"}` | `{}` | Must have at least one property |
| Properties are key-value | `for key in data` | All primitives | Nested objects with no structure | Properties must be accessible |

**Trainer Object Expected Structure:**

```javascript
{
  id: string,           // Required
  name: string,         // Required
  fans: number,         // Required
  rank: number,         // Required
  characters: array,    // Optional
  achievements: array   // Optional
}
```

**Implementation:**

```javascript
function validateStructure(data) {
  // Already checked by validateExistence, but defensive
  if (typeof data !== 'object' || Array.isArray(data)) {
    return {
      passed: false,
      reason: `STRUCTURE_FAILURE: Expected object, got ${typeof data}`
    };
  }
  
  // Verify properties can be accessed
  try {
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        // OK - properties are accessible
      }
    }
  } catch (error) {
    return {
      passed: false,
      reason: `STRUCTURE_FAILURE: Cannot access object properties - ${error.message}`
    };
  }
  
  return { passed: true };
}
```

**Examples:**

✅ **Passes — Correct Structure:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45
}
```

❌ **Fails — Array Instead of Object:**
```json
[
  "trainer-001",
  "Alice",
  50000000,
  45
]
```
**Reason:** STRUCTURE_FAILURE

❌ **Fails — Primitive Instead of Object:**
```
"trainer-001"
```
**Reason:** STRUCTURE_FAILURE

---

## Validation Category 3: Completeness

**Purpose:** Determine whether all required fields are present and non-empty.

**Required Fields:**
- `id` (string)
- `name` (string)
- `fans` (number)
- `rank` (number)

**Rules for Each Required Field:**

| Field | Must Exist | Must Not Be | Example Valid | Example Invalid |
|-------|-----------|------------|----------------|-----------------|
| `id` | ✅ Yes | null, undefined, empty string | `"trainer-001"` | `null`, `""`, missing |
| `name` | ✅ Yes | null, undefined, empty string | `"Alice"` | `null`, `""`, missing |
| `fans` | ✅ Yes | null, undefined, NaN | `50000000` | `null`, `NaN`, missing |
| `rank` | ✅ Yes | null, undefined, NaN | `45` | `null`, `NaN`, missing |

**Implementation:**

```javascript
function validateCompleteness(data) {
  const requiredFields = ['id', 'name', 'fans', 'rank'];
  
  for (const field of requiredFields) {
    // Check field exists
    if (!(field in data)) {
      return {
        passed: false,
        reason: `COMPLETENESS_FAILURE: Required field '${field}' is missing`
      };
    }
    
    const value = data[field];
    
    // Check for null/undefined
    if (value === null || value === undefined) {
      return {
        passed: false,
        reason: `COMPLETENESS_FAILURE: Required field '${field}' is null or undefined`
      };
    }
    
    // Check for empty strings
    if (typeof value === 'string' && value.trim() === '') {
      return {
        passed: false,
        reason: `COMPLETENESS_FAILURE: Required field '${field}' is empty string`
      };
    }
    
    // Check for NaN in numeric fields
    if ((field === 'fans' || field === 'rank') && isNaN(value)) {
      return {
        passed: false,
        reason: `COMPLETENESS_FAILURE: Required field '${field}' is NaN`
      };
    }
  }
  
  return { passed: true };
}
```

**Examples:**

✅ **Passes — All Required Fields Present:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45
}
```

❌ **Fails — Missing `fans` Field:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "rank": 45
}
```
**Reason:** COMPLETENESS_FAILURE: Required field 'fans' is missing

❌ **Fails — `name` is Empty String:**
```json
{
  "id": "trainer-001",
  "name": "",
  "fans": 50000000,
  "rank": 45
}
```
**Reason:** COMPLETENESS_FAILURE: Required field 'name' is empty string

❌ **Fails — `fans` is Null:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": null,
  "rank": 45
}
```
**Reason:** COMPLETENESS_FAILURE: Required field 'fans' is null or undefined

---

## Validation Category 4: Type Integrity

**Purpose:** Determine whether fields have correct data types.

**Type Requirements:**

| Field | Required Type | Valid Examples | Invalid Examples |
|-------|--------------|-----------------|-----------------|
| `id` | string | `"trainer-001"`, `"alice-1"` | `123`, `true`, `null` |
| `name` | string | `"Alice"`, `"Bob Smith"` | `123`, `true`, `null` |
| `fans` | number (integer) | `50000000`, `0`, `1` | `"50M"`, `50.5`, `true` |
| `rank` | number (integer) | `1`, `45`, `100` | `"45"`, `45.5`, `true` |
| `characters` | array | `[]`, `["char-1"]` | `"char-1"`, `{0: "char-1"}` |
| `achievements` | array | `[]`, `[{...}]` | `"achievement"`, `{0: {...}}` |

**Implementation:**

```javascript
function validateTypeIntegrity(data) {
  // Check string types
  const stringFields = ['id', 'name'];
  for (const field of stringFields) {
    if (field in data && typeof data[field] !== 'string') {
      return {
        passed: false,
        reason: `TYPE_INTEGRITY_FAILURE: Field '${field}' must be string, got ${typeof data[field]}`
      };
    }
  }
  
  // Check number types
  const numberFields = ['fans', 'rank'];
  for (const field of numberFields) {
    if (field in data) {
      if (typeof data[field] !== 'number') {
        return {
          passed: false,
          reason: `TYPE_INTEGRITY_FAILURE: Field '${field}' must be number, got ${typeof data[field]}`
        };
      }
      
      if (isNaN(data[field])) {
        return {
          passed: false,
          reason: `TYPE_INTEGRITY_FAILURE: Field '${field}' is NaN`
        };
      }
      
      // Check for integer (no decimals for counts/ranks)
      if (!Number.isInteger(data[field])) {
        return {
          passed: false,
          reason: `TYPE_INTEGRITY_FAILURE: Field '${field}' must be integer, got ${data[field]}`
        };
      }
    }
  }
  
  // Check optional array types
  const arrayFields = ['characters', 'achievements'];
  for (const field of arrayFields) {
    if (field in data) {
      if (!Array.isArray(data[field])) {
        return {
          passed: false,
          reason: `TYPE_INTEGRITY_FAILURE: Field '${field}' must be array, got ${typeof data[field]}`
        };
      }
    }
  }
  
  return { passed: true };
}
```

**Examples:**

✅ **Passes — Correct Types:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45,
  "characters": ["char-1", "char-2"]
}
```

❌ **Fails — `fans` is String:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": "50000000",
  "rank": 45
}
```
**Reason:** TYPE_INTEGRITY_FAILURE: Field 'fans' must be number, got string

❌ **Fails — `fans` is Decimal:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000.5,
  "rank": 45
}
```
**Reason:** TYPE_INTEGRITY_FAILURE: Field 'fans' must be integer, got 50000000.5

❌ **Fails — `rank` is String:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": "45"
}
```
**Reason:** TYPE_INTEGRITY_FAILURE: Field 'rank' must be number, got string

❌ **Fails — `characters` is Object Instead of Array:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45,
  "characters": {
    "0": "char-1",
    "1": "char-2"
  }
}
```
**Reason:** TYPE_INTEGRITY_FAILURE: Field 'characters' must be array, got object

---

## Validation Category 5: Range Integrity

**Purpose:** Determine whether numeric values are within acceptable ranges.

**Range Requirements:**

| Field | Min | Max | Rule | Valid Examples | Invalid Examples |
|-------|-----|-----|------|----------------|------------------|
| `fans` | 0 | ∞ | Non-negative | `0`, `1`, `50000000` | `-1`, `-100` |
| `rank` | 1 | 100 | Integer 1-100 | `1`, `50`, `100` | `0`, `101`, `-1` |

**Implementation:**

```javascript
function validateRangeIntegrity(data) {
  // Check fans range
  if ('fans' in data) {
    if (data.fans < 0) {
      return {
        passed: false,
        reason: `RANGE_INTEGRITY_FAILURE: Field 'fans' cannot be negative, got ${data.fans}`
      };
    }
  }
  
  // Check rank range
  if ('rank' in data) {
    if (data.rank < 1 || data.rank > 100) {
      return {
        passed: false,
        reason: `RANGE_INTEGRITY_FAILURE: Field 'rank' must be 1-100, got ${data.rank}`
      };
    }
  }
  
  return { passed: true };
}
```

**Examples:**

✅ **Passes — Valid Ranges:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45
}
```

❌ **Fails — `fans` is Negative:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": -1000000,
  "rank": 45
}
```
**Reason:** RANGE_INTEGRITY_FAILURE: Field 'fans' cannot be negative, got -1000000

❌ **Fails — `rank` is 0:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 0
}
```
**Reason:** RANGE_INTEGRITY_FAILURE: Field 'rank' must be 1-100, got 0

❌ **Fails — `rank` is 105:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 105
}
```
**Reason:** RANGE_INTEGRITY_FAILURE: Field 'rank' must be 1-100, got 105

---

## Complete Validation Implementation

**Full Inspector Implementation:**

```javascript
function inspect(data) {
  // Category 1: Existence
  let result = validateExistence(data);
  if (!result.passed) return { passed: false, originalData: data, reason: result.reason };
  
  // Category 2: Structure
  result = validateStructure(data);
  if (!result.passed) return { passed: false, originalData: data, reason: result.reason };
  
  // Category 3: Completeness
  result = validateCompleteness(data);
  if (!result.passed) return { passed: false, originalData: data, reason: result.reason };
  
  // Category 4: Type Integrity
  result = validateTypeIntegrity(data);
  if (!result.passed) return { passed: false, originalData: data, reason: result.reason };
  
  // Category 5: Range Integrity
  result = validateRangeIntegrity(data);
  if (!result.passed) return { passed: false, originalData: data, reason: result.reason };
  
  // All validations passed
  return {
    passed: true,
    originalData: data,
    reason: null
  };
}
```

---

## Optional Fields Handling

Optional fields (`characters`, `achievements`) are handled specially:

**Rules:**
- Can be omitted entirely ✅
- Can be empty array `[]` ✅
- If present, must be correct type ✅
- Cannot be null or undefined (if field is omitted, that's different from null) ❌

**Implementation:**

```javascript
// Optional field validation (if present in data)
if ('characters' in data) {
  if (!Array.isArray(data.characters)) {
    return {
      passed: false,
      reason: `TYPE_INTEGRITY_FAILURE: Field 'characters' must be array, got ${typeof data.characters}`
    };
  }
  
  if (data.characters === null || data.characters === undefined) {
    return {
      passed: false,
      reason: `TYPE_INTEGRITY_FAILURE: Field 'characters' cannot be null/undefined`
    };
  }
}
```

**Examples:**

✅ **Passes — `characters` Omitted:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45
}
```

✅ **Passes — `characters` is Empty Array:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45,
  "characters": []
}
```

✅ **Passes — `characters` Has Values:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45,
  "characters": ["char-1", "char-2"]
}
```

❌ **Fails — `characters` is Null:**
```json
{
  "id": "trainer-001",
  "name": "Alice",
  "fans": 50000000,
  "rank": 45,
  "characters": null
}
```
**Reason:** TYPE_INTEGRITY_FAILURE: Field 'characters' cannot be null/undefined

---

## Validation Decision Tree

```
┌─ Existence Check ─────────────────┐
│ Is data null/undefined/empty?     │
│ ✓ Pass → Continue   ✗ Reject     │
└──────────────────────────────────┘
           ↓
┌─ Structure Check ──────────────────┐
│ Is data an object (not array)?     │
│ ✓ Pass → Continue   ✗ Reject      │
└──────────────────────────────────┘
           ↓
┌─ Completeness Check ──────────────┐
│ Do all required fields exist?      │
│ ✓ Pass → Continue   ✗ Reject     │
└──────────────────────────────────┘
           ↓
┌─ Type Integrity Check ────────────┐
│ Are all fields correct types?      │
│ ✓ Pass → Continue   ✗ Reject     │
└──────────────────────────────────┘
           ↓
┌─ Range Integrity Check ──────────┐
│ Are numeric values in range?       │
│ ✓ Pass → Continue   ✗ Reject     │
└──────────────────────────────────┘
           ↓
      ✅ ACCEPT → VAULT
```

---

## Test Cases

### Test 1: Minimal Valid Data
```javascript
const data = {
  id: "trainer-001",
  name: "Alice",
  fans: 50000000,
  rank: 45
};
// Expected: PASS
```

### Test 2: Full Valid Data
```javascript
const data = {
  id: "trainer-001",
  name: "Alice",
  fans: 50000000,
  rank: 45,
  characters: ["char-1", "char-2"],
  achievements: [{ id: "ach-1", name: "50M Fans" }]
};
// Expected: PASS
```

### Test 3: Missing Required Field
```javascript
const data = {
  id: "trainer-001",
  name: "Alice",
  rank: 45
  // Missing: fans
};
// Expected: FAIL - COMPLETENESS_FAILURE
```

### Test 4: Invalid Type
```javascript
const data = {
  id: "trainer-001",
  name: "Alice",
  fans: "50000000",  // String instead of number
  rank: 45
};
// Expected: FAIL - TYPE_INTEGRITY_FAILURE
```

### Test 5: Out of Range
```javascript
const data = {
  id: "trainer-001",
  name: "Alice",
  fans: 50000000,
  rank: 105  // Out of range (max 100)
};
// Expected: FAIL - RANGE_INTEGRITY_FAILURE
```

### Test 6: Empty String
```javascript
const data = {
  id: "trainer-001",
  name: "",  // Empty string
  fans: 50000000,
  rank: 45
};
// Expected: FAIL - COMPLETENESS_FAILURE
```

### Test 7: Null Value
```javascript
const data = {
  id: "trainer-001",
  name: "Alice",
  fans: null,  // Null value
  rank: 45
};
// Expected: FAIL - COMPLETENESS_FAILURE
```

### Test 8: Negative Fans
```javascript
const data = {
  id: "trainer-001",
  name: "Alice",
  fans: -100,  // Negative
  rank: 45
};
// Expected: FAIL - RANGE_INTEGRITY_FAILURE
```

---

## Validation Rejection Messages

All rejection messages follow this format:

```
{CATEGORY}_FAILURE: {specific reason}
```

**Examples:**
- `EXISTENCE_FAILURE: Data is null or undefined`
- `STRUCTURE_FAILURE: Expected object, got array`
- `COMPLETENESS_FAILURE: Required field 'fans' is missing`
- `TYPE_INTEGRITY_FAILURE: Field 'fans' must be number, got string`
- `RANGE_INTEGRITY_FAILURE: Field 'rank' must be 1-100, got 105`

---

## Versioning

This specification is version **1.0**.

**Change Log:**
- **v1.0** (2026-07-18) — Initial validation rules specification

**Future Updates:**
If uma.moe API response structure changes, this document must be updated with new validation rules.
