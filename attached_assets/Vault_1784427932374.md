# Vault

## Purpose

The **Vault** is responsible for storing and retrieving data that has successfully passed inspection.

It serves as the trusted data storage layer of the UmaMoe architecture.

Only data approved by the Inspector may enter the Vault.

The Vault preserves trusted information so that downstream departments, such as the Refinery, can retrieve and process it.

---

# Implementation Authority

This document is the authoritative specification for the implementation of `vault.js`.

The implementation must follow the responsibilities, boundaries, inputs, outputs, and restrictions defined in this document.

If a behavior is not defined in this specification, the implementation must not invent additional responsibilities for the Vault.

---

# Related Documentation

This specification must be read alongside:

* `Umamoe/DATA_FORMAT.md` — defines the trusted data structure
* `Umamoe/ERROR_HANDLING.md` — defines error classification and reporting
* `Umamoe/INTEGRATION_EXAMPLE.md` — shows Vault behavior in end-to-end scenarios
* `Umamoe/Inspector/VALIDATION_RULES.md` — defines what data the Vault may accept

---

# Responsibilities

The Vault is responsible for:

1. Receiving accepted data from the Inspector.
2. Storing trusted data persistently.
3. Retrieving stored data when requested by authorized internal components.
4. Updating stored data only when requested explicitly.
5. Deleting stored data only when authorized.
6. Preserving the integrity of stored data.
7. Reporting storage and retrieval failures clearly.

---

# Input

The Vault receives data that has successfully passed inspection.

This data must be delivered through an Inspector-approved interface and should include both the trusted payload and metadata about its origin.

The Vault input envelope must not be treated as an untrusted payload.

Example trusted input:

```json
{
  "trustedData": {
    "id": "trainer-alice-001",
    "name": "Alice",
    "fans": 150000000,
    "rank": 87,
    "characters": ["uma-musume-special-week"],
    "achievements": []
  },
  "metadata": {
    "source": "uma.moe /api/trainers/alice-001",
    "inspectedAt": "2026-07-18T12:34:56Z"
  }
}
```

Example trusted error rejection input (Vault must NOT store this):

```json
{
  "success": false,
  "error": "INVALID_TYPE",
  "message": "fans must be a number",
  "retriable": false
}
```

The Vault must not accept untrusted or rejected data directly from external APIs or unrelated components.

```text id="w5f3z9"
Miner
    │
    ▼
Courier
    │
    ▼
Inspector
    │
    │ Accepted Data
    ▼
Vault
```

---

# Trusted Data Boundary

Data entering the Vault is considered trusted according to the inspection rules defined by the Inspector.

The Vault must not perform the Inspector's validation again.

If the incoming payload does not include Inspector-approved trust metadata, the Vault must reject it and report an error.

The Vault must not silently alter stored information.

---

# Storage Responsibilities

The Vault must provide a reliable and configurable mechanism for storing trusted data.

Approved storage methods include:

* Database storage.
* Local persistent storage.
* Structured files.
* Another approved persistence system.

The Vault implementation must be designed so the underlying storage method can be replaced without rewriting the entire UmaMoe pipeline.

The Vault should use a storage adapter pattern and keep storage configuration centralized.

Example adapter interface:

```javascript
export interface VaultStorageAdapter {
  store(trustedEnvelope): Promise<StorageResult>;
  retrieve(query): Promise<RetrieveResult>;
  update(id, patch): Promise<UpdateResult>;
  remove(id): Promise<DeleteResult>;
}
```

---

# Retrieval

The Vault must provide a clear interface for authorized downstream components to retrieve trusted data.

The Vault must not interpret, calculate, or transform data for downstream consumers.

Supported retrieval operations must include at least:

* `getById(id)` — retrieve a single trusted record
* `getAll()` — retrieve all trusted records
* `query(criteria)` — retrieve matching records without applying business logic

Example retrieval output:

```json
{
  "success": true,
  "data": {
    "id": "trainer-alice-001",
    "name": "Alice",
    "fans": 150000000,
    "rank": 87
  },
  "metadata": {
    "storedAt": "2026-07-18T12:35:20Z",
    "source": "uma.moe /api/trainers/alice-001"
  }
}
```

The Vault must not calculate or interpret the meaning of requested data.

```text id="0v0xk3"
Refinery
    │
    │ Request Trusted Data
    ▼
Vault
    │
    │ Return Stored Data
    ▼
Refinery
```

---

# Data Integrity

The Vault must preserve stored information accurately.

The Vault must not:

* Change stored values without an authorized update.
* Add business calculations.
* Interpret data.
* Recalculate statistics.
* Transform data for presentation.
* Modify data simply because another department requires a different format.

If another department requires a different format, that transformation belongs to the requesting department.

The Vault must also preserve trusted metadata that documents the data source and inspection timestamp.

---

# Updates

The Vault may update stored data only when an authorized update operation is requested.

Updates must:

* Be intentional.
* Be clearly defined.
* Preserve data integrity.
* Avoid accidental overwriting of unrelated information.

The Vault must not independently invent new data or calculate replacement values.

Example update interface:

```javascript
await vault.update('trainer-alice-001', {
  trustedData: { fans: 151000000 },
  metadata: { updatedAt: '2026-07-18T13:00:00Z' }
});
```

---

# Deletion

The Vault may remove stored data only when an authorized deletion operation is performed.

Deletion must:

* Be intentional.
* Follow the project's data-retention rules.
* Avoid accidental deletion of unrelated data.

The Vault must not remove trusted data simply because it is unused.

Example delete interface:

```javascript
await vault.remove('trainer-alice-001');
```

---

# Error Handling

The Vault must handle storage and retrieval failures safely.

The implementation must:

1. Detect failed storage operations.
2. Detect failed retrieval operations.
3. Detect failed update operations.
4. Detect failed deletion operations.
5. Report failures clearly.
6. Avoid silently claiming success when operations fail.

The Vault must preserve the original error information whenever possible.

Vault-specific errors include:

* `VAULT_STORAGE_FAILURE` — storage backend failure
* `VAULT_RETRIEVAL_FAILURE` — unable to retrieve requested data
* `VAULT_UPDATE_FAILURE` — update failed
* `VAULT_DELETION_FAILURE` — deletion failed
* `VAULT_INVALID_INPUT` — data was not trusted or did not match expected envelope

The Vault should return errors using the standard UmaMoe error result format defined in `Umamoe/ERROR_HANDLING.md`.

Example Vault error result:

```javascript
{
  success: false,
  error: 'VAULT_STORAGE_FAILURE',
  message: 'Failed to persist trusted data to the storage backend.',
  severity: 'critical',
  retriable: true,
  timestamp: '2026-07-18T13:05:00Z',
  context: {
    id: 'trainer-alice-001',
    storageBackend: 'file',
    originalError: 'Disk write failed'
  }
}
```

---

# Separation of Responsibilities

The Vault must not perform responsibilities belonging to other departments.

## The Vault must not:

* Request data from the uma.moe API.
* Acquire external data.
* Transport data from the Miner to the Inspector.
* Perform data inspection.
* Calculate fan gains.
* Calculate rankings.
* Determine achievements.
* Determine milestones.
* Apply business logic.
* Generate reports.
* Create images.
* Create Discord embeds.
* Distribute products.

These responsibilities belong to other departments.

---

# Relationship with Inspector

The Inspector determines whether acquired data is acceptable for trusted storage.

The Vault stores the accepted data.

```text id="cr3cjm"
Inspector
    │
    │ Accepted Data
    ▼
Vault
    │
    │ Trusted Data
    ▼
Refinery
```

The Inspector is the gatekeeper.

The Vault is the trusted storage facility.

---

# Relationship with Refinery

The Refinery is a downstream consumer of trusted data stored in the Vault.

The Refinery may request data from the Vault through an approved interface.

The Vault provides the requested data without performing the Refinery's calculations or business logic.

```text id="5i2p9e"
Vault
    │
    │ Trusted Data
    ▼
Refinery
```

---

# Implementation Requirements for vault.js

The implementation of `vault.js` must:

* Provide a clear storage interface.
* Accept trusted data from the Inspector only.
* Store trusted data persistently according to project configuration.
* Preserve trusted data and metadata accurately.
* Provide retrieval methods for authorized downstream components.
* Support intentional updates when requested.
* Support intentional deletion when requested.
* Reject untrusted or invalid inputs.
* Preserve stored data integrity.
* Clearly report storage, retrieval, update, and deletion failures.
* Preserve the original error information when reporting failures.
* Avoid business logic and data analysis.
* Avoid transforming data for presentation.
* Keep storage configuration centralized and replaceable.

---

# Implementation Boundary

The Vault is the final storage layer in the UmaMoe pipeline.

It receives trusted data from the Inspector and provides it to downstream consumers.

It must not perform upstream or downstream responsibilities, such as acquisition, transport, validation, analysis, or business logic.

```text
Miner -> Courier -> Inspector -> Vault -> Refinery
```

---

# Quick Reference Checklist

* [ ] Vault accepts only trusted data from the Inspector.
* [ ] Vault rejects untrusted or rejected payloads.
* [ ] Vault stores data using a configurable adapter.
* [ ] Vault preserves raw data and metadata.
* [ ] Vault supports retrieval, update, and deletion operations.
* [ ] Vault logs all storage events and failures.
* [ ] Vault reports failures clearly and preserves original error context.
* [ ] Vault does not validate incoming data.
* [ ] Vault does not transform data for presentation.
* [ ] Vault does not perform business logic.

---

# Version History

* `v1.0` — Original Vault specification
* `v2.0` — Updated to match Umamoe v2.0 documentation style, added related documentation, trusted data envelope, retrieval interface, update/delete rules, error handling, and implementation checklist.

* Avoid external API acquisition.
* Avoid presentation logic.
* Avoid Discord-specific logic.
* Avoid distribution logic.

The implementation should separate storage operations from the rest of the application so that the storage system can evolve independently.

---

# Expected Implementation Boundary

The expected responsibility of `vault.js` is:

```text id="mtf4o4"
Receive Accepted Data
        │
        ▼
Store Trusted Data
        │
        ▼
Provide Trusted Data
        │
        ▼
Downstream Department
```

The implementation must stop at the trusted-storage boundary.

The Vault provides data.

The Refinery decides what to do with that data.

---

# Design Principle

> **The Vault preserves what has been trusted. It does not decide what the data means.**

The Vault is the trusted memory of the UmaMoe architecture.

Data enters only after passing through the Miner, Courier, and Inspector.

Once stored, the data becomes available to downstream departments without requiring those departments to communicate directly with the external uma.moe API.

---

# Implementation Rule

When creating or modifying `vault.js`, the implementation agent must:

1. Read this document completely.
2. Follow the responsibilities defined here.
3. Respect all prohibited responsibilities.
4. Preserve the boundaries between Inspector, Vault, and Refinery.
5. Avoid inventing undefined business logic.
6. Ask for clarification when a required storage behavior is missing instead of silently creating unrelated functionality.

The resulting `vault.js` must be an implementation of this specification, not an independent redesign of the Vault architecture.
