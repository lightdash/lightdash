# SPK-2168 prototype: SQL runner with two connections

Throwaway prototype. Frontend only, mocked data, no API changes. Do not merge.

## Turn it on

Add `?protoConnections=1` to the SQL runner URL:

```
http://localhost:<fe-port>/projects/<project-uuid>/sql-runner?protoConnections=1
```

The switch is remembered for the browser tab (sessionStorage), so in-app navigation keeps
it on. `?protoConnections=0` turns it off. `VITE_PROTO_MULTI_CONNECTION=true` turns it on
for the whole dev server.

With the switch off, every real code path runs unchanged.

## Mocked connections

| Connection | Databases |
|---|---|
| AwsDataCatalog ap-southeast-1 | sg_core, sg_marketing, sg_finance |
| AwsDataCatalog ap-east-1 | hk_core, hk_marketing |

Both regions carry `raw.customers`, `raw.orders` and `analytics.dim_customers`, so the same
table name and the same unqualified SQL exist on both connections.

## Interaction rules

1. Sidebar tree is connection > database > schema > table. Every row carries the full
   identity: connection id, database, schema, table.
2. The connection level is hidden when a project has exactly one connection.
3. The active connection has a picker in the header and an `Active` badge in the tree.
4. A new document starts on the last-used connection (localStorage).
5. Clicking a table on the active connection inserts its fully qualified name, using that
   row's own database and schema.
6. Clicking a table on another connection while the editor is empty, or holds only a
   generated `SELECT * FROM <table>`, switches the active connection and inserts.
7. Clicking a table on another connection while the editor holds SQL the user wrote shows
   an explicit `Switch to <connection>?` prompt. Nothing changes until the user confirms.
8. Switching connection, by picker or by prompt, clears the result state.
9. The results panel labels which connection the last run used.
10. Running SQL is mocked: it records the connection and the time, and runs nothing.

## Screenshots

| File | Shows |
|---|---|
| `01-sidebar-two-connections.png` | Both connections expanded, tables under each |
| `02-active-connection-picker.png` | The header picker open |
| `03-switch-prompt.png` | The explicit switch prompt over unrelated SQL |
| `04-results-connection-label.png` | Results labelled with the connection that ran |

## Code

Everything new is in `packages/frontend/src/features/sqlRunner/prototype/`. Four real files
carry a gated call into it: `components/TablesPanel.tsx`, `components/Header/HeaderCreate.tsx`,
`components/ContentPanel.tsx` and `pages/SqlRunner.tsx`.
