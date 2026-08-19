# @lightdash/tdcp

Tabular Data Context Protocol, draft home. Three deliverables in one package, deliberately dependency-free so it can move to a standalone repo (and split into `@tdcp/server` / `@tdcp/client`) unchanged:

- **Spec** — [`spec/SPEC.md`](spec/SPEC.md)
- **Schemas** — [`schemas/tdcp-2026-08-draft.schema.json`](schemas/tdcp-2026-08-draft.schema.json) (JSON Schema 2020-12, `$defs` per wire shape)
- **SDK** — `src/`: protocol types, `createTdcpServer` (the transport-independent server module enforcing tier guarantees), JSON-RPC and Node adapters, and `TdcpClient` (control plane + JSONL data plane).

A tier 0 server, end to end:

```ts
import { createTdcpRequestHandler, createTdcpServer } from '@lightdash/tdcp';

const server = createTdcpServer({
    catalog: async () => ({
        tables: [
            {
                reference: 'orders',
                label: 'Orders',
                description: null,
                columns: [
                    { name: 'order_id', type: 'number', sourceType: null, label: null, description: null },
                    { name: 'status', type: 'string', sourceType: null, label: null, description: null },
                ],
            },
        ],
        nextCursor: null,
    }),
    read: async (_ctx, request) => mintDescriptorFor(request.table),
});
const handler = createTdcpRequestHandler(server);
// Wire `handler` to any transport: node:http, express, or (future) an MCP session.
```

The consuming side inside Lightdash is `RemoteTdcpQuerySource` (`packages/backend/src/services/QuerySourceService/`); the design rationale is in `docs/tdcp-tabular-data-context-protocol.md`. The executable form of the spec is [`tests/roundtrip.test.ts`](tests/roundtrip.test.ts) — the SDK client consuming the SDK server through an in-memory fetch shim, control plane and streamed data plane, no network.

Guarantees the SDK owns so integrators cannot get them wrong: exact-mode scans refuse **before execution** (scan handlers are plan-then-execute, and `pushedPredicates` is stamped from the plan, never hand-written), undeclared dialects and compose references are rejected, requests must match their dialect's declared form (`query` for text, `params` for structured), wire descriptors must carry data-plane links, every client response is structurally validated before it is typed, protocol error codes survive into `TdcpClientError`, and JSONL rows stream with one line in memory at a time. Handlers answer with protocol error codes by throwing `TdcpError`. Data requests may resolve `pending`; `TdcpClient.waitForReady` polls `tabular/poll` until the descriptor is ready.

Example batteries: `TdcpDatasetStore` owns the dataset lifecycle for in-memory servers (opaque random ids, per-dataset bearer tokens, principal binding, expiry, data-plane links) and `src/nodeHttp.ts` binds a handler + store to node:http — deliberately not exported from the index so it stays free of node builtins for non-node consumers. The store buffers rows in memory and caps their count: it is example-shaped, not production-shaped — production servers stream from real storage.

Draft caveats: the JSON-RPC binding stands in for the intended MCP transport (designed for, not yet demonstrated — see SPEC §1), and hosts should inject their hardened egress fetch into `TdcpClient` (Lightdash injects an SSRF-guarded one). Follow-up worth doing before the spec repo goes public: compile the JSON Schema to standalone validators at build time (ajv as a devDependency only), so the schema is the single source of truth and `validate.ts` cannot drift from it while the runtime stays dependency-free. Planned servers that will earn their dialect tags with real implementations: postgres (`sql:postgres`), GitHub, Attio. See the `@oliver:` comments and SPEC §10.
