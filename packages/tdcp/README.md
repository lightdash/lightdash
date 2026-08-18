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

The consuming side inside Lightdash is `RemoteTdcpQuerySource` (`packages/backend/src/services/QuerySourceService/`); the design rationale is in `docs/tdcp-tabular-data-context-protocol.md`.

Draft caveats: the JSON-RPC binding stands in for the MCP transport, hosts must inject hardened fetch into `TdcpClient`, and the JSONL client buffers bodies. See the `@oliver:` comments and SPEC section 9.
