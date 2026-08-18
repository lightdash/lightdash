# Tabular Data Context Protocol — draft specification

Revision `2026-08-draft.1`. Status: draft, extracted from running code; every shape here is implemented in this package and consumed by the Lightdash multi-source query pipeline. The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as in RFC 2119.

## 1. Purpose and scope

TDCP standardizes *tabular data by reference* between agent hosts and data sources. It defines: a catalog a source exposes, three tiers of data request, a dataset descriptor addressing results by opaque handle, and an out-of-band data plane for row transfer. It deliberately does not define: writes (read-only in this revision), credential storage, or query semantics inside a dialect.

TDCP is designed as an MCP extension. MCP provides transport, OAuth 2.1 authorization, capability negotiation, and long-running task lifecycle; TDCP adds the `tabular/*` methods and the descriptor. This draft additionally specifies a bare JSON-RPC 2.0 binding so a server is runnable without an MCP stack; the two bindings carry identical payloads.

## 2. Methods

| Method | Tier | Request | Result |
| --- | --- | --- | --- |
| `tabular/capabilities` | — | `{}` | `Capabilities` |
| `tabular/catalog` | — | `{}` | `Catalog` |
| `tabular/read` | 0 | `ReadRequest` | `DatasetDescriptor` |
| `tabular/scan` | 1 | `ScanRequest` | `DatasetDescriptor` |
| `tabular/query` | 2 | `QueryRequest` | `DatasetDescriptor` |
| `tabular/refresh` | — | `RefreshRequest` | `DatasetDescriptor` |

JSON Schemas for every shape: [`schemas/tdcp-2026-08-draft.schema.json`](../schemas/tdcp-2026-08-draft.schema.json). TypeScript types: [`src/types.ts`](../src/types.ts).

A server MUST implement `tabular/capabilities` and `tabular/catalog`. All other methods are declared through capabilities; calling an undeclared method returns error `-32010`.

On the MCP binding, data-request methods SHOULD return a task (MCP tasks extension) that resolves to the descriptor; fast sources MAY resolve inline. On the bare JSON-RPC binding of this draft, requests resolve inline.

## 3. Capability tiers

A source declares the tiers it can honestly support. Whatever a source cannot do, the consumer's compose engine finishes — a tier 0 server is a complete, useful TDCP citizen.

- **Tier 0, read**: list tables (`tabular/catalog`), read one (`tabular/read`) with an optional limit. For files, spreadsheets, and simple APIs.
- **Tier 1, scan**: adds declarative projection (`columns`), predicates, and limit pushdown. The predicate AST is deliberately closed: conjunctive comparisons and `in`, nothing else. Requests carry a `predicateMode`:
  - `exact` — the server MUST either fully satisfy every predicate or refuse with error `-32011`. This is the mode for clients with no local engine: they never receive rows that still need filtering.
  - `bestEffort` — the server applies what it can and MUST report what it applied in the descriptor's `pushedPredicates`; the consumer re-applies the remainder.
- **Tier 2, query**: native queries in the source's own language, tagged by dialect (`sql:duckdb`, `metricquery:lightdash`, ...). Dialect tags are an open registry shaped like media types (`family:variant`). A server MUST reject dialects it did not declare.

**Compose** is a tier 2 sub-capability: `tabular/query` requests MAY carry `references`, a map of table name to dataset id, exposing other datasets as named tables. Compose is how a client without a local engine joins data — the engine lives server-side. A server without `compose: true` MUST reject requests carrying references.

## 4. The dataset descriptor

Every data request resolves to a descriptor:

- `datasetId` — opaque handle minted by the server. Never a storage URL, never guessable, meaningless outside this server.
- `schema` — named, logically-typed columns. This revision's logical types are `string | number | timestamp | date | boolean`; a later revision moves to Arrow logical types plus a semantic annotations map, additively.
- `rowCount` — exact count, or null when unknown.
- `producedAt` / `expiresAt` — descriptors are cache artifacts with explicit lifetimes. After `expiresAt`, data-plane links stop working and references to the dataset fail with `-32012`; `tabular/refresh` re-executes and mints a new descriptor.
- `freshness` — when the underlying source was actually queried, and whether this was a cache hit.
- `links` — the data plane (section 5). A wire-serving server MUST return at least one `jsonl` link. (Hosts embedding an in-process TDCP server MAY use linkless descriptors internally; they are not valid on the wire.)
- `pushedPredicates` — tier 1 only, see above.

## 5. Data plane

Rows never transit the control plane. Each link carries:

- `encoding` — `jsonl` (mandatory floor: one JSON object per line, keys are schema column names) or `arrow` (Arrow IPC stream, recommended for volume). An Arrow Flight location tier is reserved for a later revision.
- `href` — HTTPS endpoint served or fronted by the TDCP server.
- `token` — short-lived bearer presented as `Authorization: Bearer`. Possession of the URL alone MUST NOT grant access beyond the descriptor's lifetime; servers MUST NOT emit raw storage (e.g. presigned object-store) URLs.
- `expiresAt` — link expiry, at most the descriptor's.

## 6. Authorization profile

- **Control plane**: on the MCP binding, MCP's OAuth 2.1 resource-server pattern, unchanged — TDCP adds no auth machinery. On the bare JSON-RPC binding, a static bearer token MAY be used for service contexts.
- **Principal binding**: a dataset is bound to the principal whose credentials produced it. A server MUST NOT serve one principal's dataset — descriptor or data plane — to another. Hosts that cache imported datasets MUST key those caches to the principal for any server connected with per-user credentials.
- **Delegation**: passing a dataset's link (with token) to a third party — for example a compose-capable server — is a deliberate delegation of read access for the token's lifetime. Clients MUST NOT forward links except to effect an operation the user requested.
- **Upstream credentials** (a server's own auth against the system it fronts) are out of scope; SDKs SHOULD ship token-refresh and encrypted-storage helpers because that is where every integrator loses time.

## 7. Errors

TDCP reserves JSON-RPC error codes: `-32010` capability not supported, `-32011` predicates not satisfiable in exact mode, `-32012` dataset not found or expired. Servers SHOULD put machine-readable detail in `error.data` and human-readable remediation in `error.message` — agents read these.

## 8. Conformance

A conforming tier 0 server: implements capabilities/catalog/read; every descriptor validates against the schema file; links honor their expiry; `exact`-mode guarantees hold vacuously. The conformance CLI (planned deliverable) scores exactly what this section requires. Until it exists, the schema file plus the `createTdcpRequestHandler` guardrails in this package are the reference behavior.

## 9. Revision policy

Date-stamped revisions like MCP (`2026-08-draft.1`). Servers state their revision in capabilities. Within the draft series anything may change; from the first non-draft revision, changes are additive and removals go through deprecation.
