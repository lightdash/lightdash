# TDCP examples

Runnable both-sides demo of the draft protocol:

- [`csv-server.ts`](csv-server.ts) — a directory of CSV files as a TDCP server, nothing hardcoded: catalog from headers, column types inferred from the data ([`data/signups.csv`](data/signups.csv) infers `seats: number`, `signed_up_at: date`), rows served typed. Tier 0 (`read`) and tier 1 (`scan`, plan-then-execute with equality/IN pushdown). Honestly no tier 2 — a CSV is not a query engine; the consumer's compose engine does the joining. Every protocol guarantee comes from `createTdcpServer`, not from this file.
- [`query-client.ts`](query-client.ts) — the consumer: capabilities, catalog, an exact-mode scan with predicate pushdown, streamed rows.

```bash
npx tsx packages/tdcp/examples/csv-server.ts &           # :4833
npx tsx packages/tdcp/examples/query-client.ts
```

To point a Lightdash dev instance at it, set `TDCP_ALLOW_PRIVATE_ADDRESSES=true` (dev-only SSRF relaxation) and submit `tdcp` source queries — the tier 0 form `{ "serverUrl": "http://127.0.0.1:4833/rpc", "table": "signups" }` or the tier 1 form `{ "serverUrl": "http://127.0.0.1:4833/rpc", "table": "signups", "predicates": [{ "column": "plan", "operator": "eq", "values": ["growth"] }], "predicateMode": "exact" }`. Both forms can sit in one submission next to `sql` and `duckdb` nodes.

Planned reference servers (land with the sources entity, per the proposal): `tdcp-server-google-sheets` (tier 0, the per-user OAuth exemplar), `tdcp-server-postgres` (tier 2, `sql:postgres` — the first example where a dialect declaration means something), `tdcp-server-github` (tier 1, the API-adapter exemplar and scan's stabilizing implementation). Each doubles as a conformance fixture.

Planned alongside them, as its own package: `@tdcp/runtime` — the host runtime agents talk to. It connects to N servers, aggregates their catalogs, holds the session's dataset handles, and carries a compose engine so agents can join across servers even when no server declares `compose`. To the agent it presents as one compose-capable TDCP server (the runtime is itself TDCP, recursively), so there is no second agent-facing API. Same interface, three engines: duckdb-wasm in browsers, native DuckDB for CLI agents, and Lightdash's hardened DuckDB server-side — the multi-source query pipeline is this runtime's reference deployment. Separate package because the engine is a real dependency (wasm or native, as peers), which must not touch the SDK's zero-dependency core.
