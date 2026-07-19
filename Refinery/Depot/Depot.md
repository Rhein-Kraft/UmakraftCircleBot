# Depot

## Purpose

The **Depot** department is responsible for storing and retrieving finished products produced by the Refinery.

It serves as the temporary storage facility for compiled products, making them available for the next stage of the UmaKraft architecture.

The Depot does not create, modify, calculate, or distribute information. Its sole responsibility is to safely preserve completed products until they are requested.

## Responsibilities

* Store compiled products.
* Retrieve compiled products upon request.
* Update existing compiled products when necessary.
* Remove obsolete or expired products.
* Maintain the integrity of stored products.

---

## Implementation Authority

This document is the authoritative contract for implementing the `Depot` adapter used by the Compiler. Implementations must follow the input/output contracts, persistence semantics, and error handling defined here.

## Does Not Do

The Depot department must **never**:

* Retrieve data from the uma.moe API.
* Calculate statistics or business logic.
* Compile products.
* Validate information.
* Distribute products.
* Send Discord messages or notifications.

These responsibilities belong to other departments within the project.

## Input

* Compiled products from the Compiler.

## Output

* Stored products ready for retrieval by downstream departments.

---

## Storage Guarantees & Semantics

The Depot provides these guarantees to callers:

- **Durability**: once `put()` returns success, the product is durably stored according to the underlying adapter semantics.
- **Idempotency**: `put()` operations should be idempotent for the same `id`+`version` inputs.
- **Consistency**: `get()` returns the latest version for the requested id unless a version parameter is provided.
- **Versioning**: products must be stored with explicit `version` metadata (timestamp or semantic version).

Implementations must document any weaker guarantees (eventual consistency, best-effort durability) and surface them to callers.

---

## Adapter Contract

The Compiler and other callers interact with the Depot through an adapter that implements the following async methods:

```javascript
// Put a product into the Depot. Returns success boolean and optional meta.
async function put(product: { id, version, compiledProduct, provenance }) -> { success: boolean, storedAt?: string }

// Get the latest product by id, or a specific version.
async function get(id: string, options?: { version?: string }) -> { product|null }

// Delete a product by id (optional version parameter to delete a specific version).
async function del(id: string, options?: { version?: string }) -> { success: boolean }

// Query products by index or filter (optional; must support pagination).
async function query(filter: object, options?: { limit?: number, cursor?: string }) -> { results: [], nextCursor?: string }
```

Adapters should throw structured errors and map them to the UmaMoe error envelope when surfaced to higher layers.

---

## Access Patterns

Common usage patterns the Depot must support:

* Single `put()` per compiled product followed by a `get(id)` to verify persistence.
* `get(id, { version })` to retrieve a historical version.
* `query()` to list latest products matching filters (by type, date range, trainer id).

Adapters must support efficient key-based retrieval. Query support is optional but recommended for UI and maintenance tooling.

---

## Retention, Expiry, and Cleanup

The Depot must provide a configurable retention policy. Implementations should support:

* TTL-based expiry per product type.
* Manual deletion by id/version.
* Batch cleanup jobs for expired or deprecated products.

Retention behavior must be documented and surfaced to upstream components (Compiler, operators).

---

## Error Handling

Depot must return structured errors compatible with UmaMoe's error format. Recommended error codes:

- `DEPOT_PERSISTENCE_FAILURE` — failure writing to underlying store
- `DEPOT_NOT_FOUND` — requested id/version not present
- `DEPOT_CONFLICT` — version conflict on write when id+version already exists and put is expected to be unique
- `DEPOT_QUOTA_EXCEEDED` — storage quota limits reached

On recoverable errors (network, transient DB errors), adapters should expose retryable semantics so callers can implement backoff and retry.

Example error envelope:

```json
{
  "success": false,
  "error": "DEPOT_NOT_FOUND",
  "message": "No compiled product found for id=trainer-alice-001",
  "retriable": false,
  "timestamp": "2026-07-18T14:10:00Z",
  "context": { "id": "trainer-alice-001" }
}
```

---

## Observability & Metrics

Depot adapters must emit metrics and structured logs for:

* Put success/failure counts and latencies
* Get success/failure counts and latencies
* Delete operations and cleanup job results
* Storage usage and quota signals

Expose metrics names and tags for integration with the project's observability stack.

---

## Security & Access Control

Depot must restrict write operations to trusted internal callers (Compiler/service accounts). Implementations must support authentication and authorization patterns appropriate for the deployment environment (API keys, IAM roles, service accounts).

Audit logs for put/delete operations are recommended.

---

## Implementation Example (in-memory adapter)

An example in-memory adapter for local development:

```javascript
const store = new Map();
async function put(product){ const key = `${product.id}:${product.version}`; store.set(key, product); return { success: true, storedAt: new Date().toISOString() } }
async function get(id, options={}){ if(options.version){ return store.get(`${id}:${options.version}`) || null } // return latest by scanning keys
  const entries = Array.from(store.values()).filter(p=>p.id===id);
  if(!entries.length) return null;
  entries.sort((a,b)=> (a.version>b.version? -1:1));
  return entries[0];
}
```

This adapter is not durable and intended for tests and local development only.

---

## Quick Reference Checklist

* [ ] Implement adapter methods `put`, `get`, `del`, and optionally `query`.
* [ ] Ensure idempotent `put` semantics for id+version.
* [ ] Support `get(id, {version})` to retrieve historical versions.
* [ ] Expose metrics and structured logs.
* [ ] Document retention and consistency guarantees.

---

## Version History

* `v1.0` — Initial Depot draft
* `v2.0` — Added adapter contract, persistence semantics, error handling, metrics, retention, and security notes

## Workflow

```text id="7gfz3v"
Compiler
    │
    ▼
  Depot
    │
    ▼
Next Architecture
```

## Design Principle

The Depot is the project's finished product repository.

Every product stored within the Depot has already been refined and compiled. The Depot preserves these products exactly as received, ensuring they remain consistent and ready for the next stage of the architecture.
