# Tabular Data Context Protocol — draft specification

Revision `2026-08-draft.2`. Status: draft. Every shape here is implemented and exercised by this package's SDK and round-trip suite; the Lightdash multi-source query pipeline consumes tiers 0 and 2 against remote servers and runs its built-in sources on the server module in-process. Tier 1 (scan) is **provisional**: implemented and invocable end to end, expected to stabilize with the first API-backed production source. The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as in RFC 2119.

## 1. Purpose and scope

TDCP standardizes *tabular data by reference* between agent hosts and data sources. It defines: a catalog a source exposes, three tiers of data request, a dataset descriptor addressing results by opaque handle, an async resolution lifecycle, and an out-of-band data plane for row transfer. It deliberately does not define: writes (read-only in this revision), credential storage, or query semantics inside a dialect.

TDCP is designed to bind to MCP as an extension (namespaced `tabular/*` methods), inheriting MCP's transport, OAuth 2.1 authorization, and long-running task lifecycle. **That binding is designed for but not yet demonstrated** — no `tabular/*` method has run over an MCP session yet, and how a server declares the extension at initialize is unresolved until the first MCP-transport implementation lands. What this draft specifies and implements is a bare JSON-RPC 2.0 binding; the two bindings are intended to carry identical payloads.

## 2. Methods

| Method | Tier | Request | Result |
| --- | --- | --- | --- |
| `tabular/capabilities` | — | `{}` | `Capabilities` |
| `tabular/catalog` | — | `CatalogRequest` | `Catalog` |
| `tabular/describe` | — | `DescribeRequest` | `DescribedTable` |
| `tabular/read` | 0 | `ReadRequest` | `DataResult` |
| `tabular/scan` | 1 | `ScanRequest` | `DataResult` |
| `tabular/query` | 2 | `QueryRequest` | `DataResult` |
| `tabular/poll` | — | `PollRequest` | `DataResult` |

JSON Schemas for every shape: [`schemas/tdcp-2026-08-draft.schema.json`](../schemas/tdcp-2026-08-draft.schema.json). TypeScript types: [`src/types.ts`](../src/types.ts).

A server MUST implement `tabular/capabilities` and `tabular/catalog`. All other methods are declared through capabilities; calling an undeclared method returns error `-32010`.

### Async resolution

A data request resolves to a `DataResult`: either a ready `DatasetDescriptor`, or a `PendingDataset` (`{ status: "pending", datasetId, pollAfterMs }`). A server that returns pending results MUST implement `tabular/poll`, which returns the current `DataResult` for the id — still pending, ready, or a JSON-RPC error if the request failed (using the error the request would have produced; `-32012` once the id expires). Clients SHOULD wait at least `pollAfterMs` between polls when the server provides it. Fast sources MAY always resolve inline; thin servers never need to implement poll. A by-reference protocol must be able to say "not yet" — this lifecycle is the floor, and on the MCP binding the tasks extension is expected to carry it instead.

## 3. Capability tiers

A source declares the tiers it can honestly support. Whatever a source cannot do, the consumer's compose engine finishes — a tier 0 server is a complete, useful TDCP citizen.

- **Tier 0, read**: list tables (`tabular/catalog`), read one (`tabular/read`) with an optional limit. For files, spreadsheets, and simple APIs.
- **Tier 1, scan** *(provisional — expected to stabilize with the first API-backed production source)*: adds declarative projection (`columns`), predicates, and limit pushdown. The predicate AST is deliberately closed: conjunctive comparisons and `in`, nothing else. Requests carry a `predicateMode`:
  - `exact` — the server MUST either fully satisfy every predicate or refuse with error `-32011` **before executing anything**. This is the mode for clients with no local engine: they never receive rows that still need filtering.
  - `bestEffort` — the server applies what it can and MUST report what it applied in the descriptor's `pushedPredicates`; the consumer re-applies the remainder.

  The exact-mode guarantee is **contractual, not client-verifiable**: `pushedPredicates` is the server reporting its own behavior. SDK-built servers enforce it structurally (plan-then-execute, refusal pre-flight); a non-SDK server simply claims it, and the conformance suite is what tests the claim.
- **Tier 2, query**: native queries in the source's own language. Each dialect is declared in capabilities as `{ dialect, form, payloadSchema, docsUrl }`:
  - `dialect` — an open registry tag shaped like media types (`family:variant`, e.g. `sql:postgres`, `metricquery:lightdash`).
  - `form` — `text` dialects carry the request's `query` string; `structured` dialects carry `params`, an object. A request using the wrong field for its dialect's form is refused with `-32602`.
  - `payloadSchema` — a JSON Schema for `params`, so an agent can learn to write a query from capabilities alone; null for text dialects or when undocumented.
  - `docsUrl` — where the dialect is documented, if anywhere.

  A server MUST reject dialects it did not declare. The request's `limit` is a result-row cap; where a dialect's payload carries its own limit, the smaller wins.

**Compose** is a tier 2 sub-capability: `tabular/query` requests MAY carry `references`, a map of table name to dataset id, exposing other datasets as named tables. Compose is how a client without a local engine joins data — the engine lives server-side. A server without `compose: true` MUST reject requests carrying references.

## 4. Catalog and schema

`tabular/catalog` lists tables and is cursor-paginated: the request MAY carry `cursor`, the result carries `nextCursor` (null when complete). A catalog entry either inlines its `columns` or sets them to null, in which case the server MUST implement `tabular/describe` to resolve one table's columns on demand — large warehouse catalogs cannot resolve every column eagerly. The catalog is evaluated for the authenticated principal: two principals MAY see different tables and columns.

Column schemas are named and logically typed. This revision's logical types are `string | number | timestamp | date | boolean` — a floor, not a ceiling. Each column also carries `sourceType`: the source's native type name, informational and uninterpreted (`"jsonb"`, `"array<string>"`). Non-primitive values (arrays, objects) travel JSON-encoded as logical type `string` with `sourceType` naming what they really are. A later revision moves to Arrow logical types plus a semantic annotations map, additively.

## 5. The dataset descriptor

Every data request ultimately resolves to a descriptor:

- `datasetId` — opaque handle minted by the server. Never a storage URL, never guessable, meaningless outside this server.
- `schema` — the columns of this dataset (section 4).
- `rowCount` — exact count, or null when unknown.
- `producedAt` / `expiresAt` — descriptors are cache artifacts with explicit lifetimes. After `expiresAt`, data-plane links stop working and references to the dataset fail with `-32012`; the remedy is to re-submit the original request (servers are not required to persist request state for a refresh-by-handle).
- `freshness` — when the underlying source was actually queried, and whether this was a cache hit.
- `links` — the data plane (section 6). A wire descriptor MUST carry at least one `jsonl` link.
- `pushedPredicates` — tier 1 only, see above.

## 6. Data plane

Rows never transit the control plane. Each link carries:

- `encoding` — `jsonl` (mandatory floor: one JSON object per line, keys are schema column names) or `arrow` (Arrow IPC stream, recommended for volume). An Arrow Flight location tier is reserved for a later revision.
- `href` — HTTPS endpoint served or fronted by the TDCP server.
- `token` — short-lived bearer presented as `Authorization: Bearer`. Possession of the URL alone MUST NOT grant access beyond the descriptor's lifetime; servers MUST NOT emit raw storage (e.g. presigned object-store) URLs.
- `expiresAt` — link expiry, at most the descriptor's.

## 7. Authorization profile

- **Control plane**: on an MCP binding, MCP's OAuth 2.1 resource-server pattern, unchanged — TDCP adds no auth machinery. On the bare JSON-RPC binding, a static bearer token MAY be used for service contexts.
- **Principal binding**: a dataset is bound to the principal whose credentials produced it. A server MUST NOT serve one principal's dataset — descriptor or data plane — to another. Hosts that cache imported datasets MUST key those caches to the principal for any server connected with per-user credentials.
- **Delegation**: passing a dataset's link (with token) to a third party — for example a compose-capable server — is a deliberate delegation of read access for the token's lifetime. Clients MUST NOT forward links except to effect an operation the user requested.
- **Upstream credentials** (a server's own auth against the system it fronts) are out of scope; SDKs SHOULD ship token-refresh and encrypted-storage helpers because that is where every integrator loses time.

## 8. Errors

TDCP reserves JSON-RPC error codes: `-32010` capability not supported, `-32011` predicates not satisfiable in exact mode, `-32012` dataset not found or expired. Servers SHOULD put machine-readable detail in `error.data` and human-readable remediation in `error.message` — agents read these, and SDK clients MUST surface the code, not only the message.

## 9. Conformance

A conforming tier 0 server: implements capabilities/catalog/read; every result validates against the schema file; links honor their expiry; `exact`-mode guarantees hold vacuously. The conformance CLI (planned deliverable) scores exactly what this section requires. Until it exists, the schema file plus the `createTdcpServer` guardrails in this package are the reference behavior, and [`tests/roundtrip.test.ts`](../tests/roundtrip.test.ts) is the executable form of this section.

## 10. Revision policy

Date-stamped revisions like MCP (`2026-08-draft.2`). Servers state their revision in capabilities. Within the draft series anything may change; from the first non-draft revision, changes are additive and removals go through deprecation.
