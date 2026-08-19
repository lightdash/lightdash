# @lightdash/tdcp

Tabular Data Context Protocol, draft home. Three deliverables in one package, deliberately dependency-free so it can move to a standalone repo (and split into `@tdcp/server` / `@tdcp/client`) unchanged:

- **Spec** — [`spec/SPEC.md`](spec/SPEC.md)
- **Schemas** — [`schemas/tdcp-2026-08-draft.schema.json`](schemas/tdcp-2026-08-draft.schema.json) (JSON Schema 2020-12, `$defs` per wire shape)
- **SDK** — `src/`: protocol types, `createTdcpRequestHandler` (the server side: implement `catalog` and you have a tier 0 server; tier guarantees like exact-mode refusal are enforced by the handler, not by integrators), and `TdcpClient` (control plane + JSONL data plane).

A tier 0 server, end to end:

```ts
import { createTdcpRequestHandler } from '@lightdash/tdcp';

const handler = createTdcpRequestHandler({
    catalog: async () => ({
        tables: [
            {
                reference: 'orders',
                label: 'Orders',
                description: null,
                columns: [
                    { name: 'order_id', type: 'number', label: null, description: null },
                    { name: 'status', type: 'string', label: null, description: null },
                ],
            },
        ],
    }),
    read: async (_ctx, request) => ({
        datasetId: mintHandle(request.table),
        schema: schemaOf(request.table),
        rowCount: null,
        producedAt: new Date().toISOString(),
        expiresAt: expiry().toISOString(),
        freshness: { sourceQueriedAt: new Date().toISOString(), cacheHit: false },
        links: [jsonlLinkFor(request.table)],
    }),
});
// Wire `handler` to any transport: node:http, express, or an MCP session.
```

The consuming side inside Lightdash is `RemoteTdcpQuerySource` (`packages/backend/src/services/QuerySourceService/`); the design rationale is in `docs/tdcp-tabular-data-context-protocol.md`. The executable form of the spec is [`tests/roundtrip.test.ts`](tests/roundtrip.test.ts) — the SDK client consuming the SDK server through an in-memory fetch shim, control plane and streamed data plane, no network.

Guarantees the SDK owns so integrators cannot get them wrong: exact-mode scans that were not fully pushed are refused, undeclared dialects and compose references are rejected, wire descriptors must carry data-plane links, every response is structurally validated before it is typed (`assertDatasetDescriptor` and friends), and JSONL rows stream with one line in memory at a time. Handlers answer with protocol error codes by throwing `TdcpError`.

Server-side batteries: `TdcpDatasetStore` owns the dataset lifecycle (opaque ids, per-dataset bearer tokens, expiry, data-plane links) and `src/nodeHttp.ts` binds a handler + store to node:http — deliberately not exported from the index so it stays free of node builtins for non-node consumers. The examples are handlers only.

Draft caveats: the JSON-RPC binding stands in for the MCP transport, and hosts should inject their hardened egress fetch into `TdcpClient` (Lightdash injects an SSRF-guarded one). Follow-up worth doing before the spec repo goes public: compile the JSON Schema to standalone validators at build time (ajv as a devDependency only), so the schema is the single source of truth and `validate.ts` cannot drift from it while the runtime stays dependency-free. See the `@oliver:` comments and SPEC section 9.
