# TDCP examples

Runnable both-sides demo of the draft protocol:

- [`orders-server.ts`](orders-server.ts) — a complete TDCP server in one file: two CRM tables, JSON-RPC control plane, bearer-checked JSONL data plane. Tier 0 (`read`), tier 1 (`scan` with equality/IN pushdown), and the smallest possible tier 2 dialect (`table:name`). Every protocol guarantee comes from `createTdcpRequestHandler`, not from this file.
- [`query-client.ts`](query-client.ts) — the consumer: capabilities, catalog, an exact-mode scan with predicate pushdown, streamed rows.

```bash
npx tsx packages/tdcp/examples/orders-server.ts &
npx tsx packages/tdcp/examples/query-client.ts
```

To point a Lightdash dev instance at the server, set `TDCP_ALLOW_PRIVATE_ADDRESSES=true` (dev-only SSRF relaxation) and submit a `tdcp` source query with `serverUrl: "http://127.0.0.1:4832/rpc"`, `dialect: "table:name"`.

Planned reference servers (land with the sources entity, per the proposal): `tdcp-server-google-sheets` (tier 0, the per-user OAuth exemplar), `tdcp-server-postgres` (tier 2, `sql:postgres`), `tdcp-server-github` (tier 1, the API-adapter exemplar). Each doubles as a conformance fixture.
