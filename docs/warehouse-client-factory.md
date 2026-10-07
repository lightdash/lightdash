# Warehouse client factory

`WarehouseClientFactory.withWarehouseClient` acquires a warehouse client, runs a callback, and releases its SSH tunnel when the callback exits. Release runs after success and after failure. Clients that use SSH tunnels do not enter the client cache. Failed acquisition also releases the tunnel.

## Credential resolution

Use a `binding` ref for normal scoped work. The factory resolves credentials and the AI plan, then builds the client in one call.

Use `resolveWarehouseCredentials` followed by a `resolved` ref only when a path needs credentials before deciding whether to build a client, or needs to build from a derived copy, such as credentials for a listed database. Resolution builds no client. The `resolved` ref carries the credentials, AI plan and connection route from resolution. It does not resolve credentials or the AI plan again. Client overrides and scoped tunnel release apply to both refs.

## Compile adapters

A `compile` ref builds from credentials that the caller has already resolved. It can carry `compileGroup: { listedDatabases, onSkippedDatabase }`. For Postgres this selects the listed-databases client. Other warehouses use the normal client. Compile clients skip the cache. Compile-group clients carry listed databases and a warning callback that belong to one compile. The Postgres wrapper keeps its connection limit. Other compile clients keep the warehouse client's default connection limit.

`ScopedWarehouseConnection.deriveClient(credentials, { compileGroup }?)` builds an uncached sibling client in the current scope. Compile adapters use it to share one SSH tunnel while selecting a source's database and schema. Derive credentials from `connection.warehouseClient.credentials`, which contains the tunnel's local host and port. The factory rejects a different warehouse type or tunnel host or port. Siblings retain the scope's identity options and agent session. They open no tunnel and need no separate release.

`acquireWarehouseConnection(ref, context)` returns a `WarehouseConnectionLease`: a scoped connection with an idempotent `release(): Promise<void>`. It accepts only compile refs and the `test_and_compile` bypass mode. The lease exists for jobs whose steps must report acquisition and release separately: testing acquires the connection, and compiling releases it after adapter cleanup. A single callback cannot span those steps without changing when testing finishes or which step reports a failure. Every other caller uses `withWarehouseClient`. Both paths use the same acquisition and cleanup internals. Lease release honours the scoped-release kill switch; failed acquisition always releases its tunnel.

## Named bypass modes

Bypass refs use the supplied credentials without credential resolution or AI planning. They never read or write the client cache. SPK-2613 fixes the resolution gaps tracked by these four modes:

- `dbt_cloud_preview_webhook`: validates and converts a webhook manifest with the stored connection row, without resolving credentials.
- `timezone_preview`: queries with submitted or stored credentials and the unsaved data timezone, without resolving credentials.
- `connection_test`: tests submitted credentials already resolved by the caller, without repeating resolution in the factory.
- `test_and_compile`: tests and compiles with caller-supplied credentials, without factory credential resolution.

## Client cache

The factory caches query clients by project, Snowflake warehouse override, Databricks compute override, agent session and AI identity. It reuses a cached client only when the credentials match. AI identity uses the connected person's identity UUID or the plan's audit person UUID.

Clients that use SSH tunnels never enter the cache. Bypass refs, compile refs and clients from `deriveClient` never read or write the cache.

## Configuration

| Environment variable | Default | Behaviour |
| --- | --- | --- |
| `SSH_TUNNEL_SCOPED_RELEASE_ENABLED` | `true` | Set to `false` to keep SSH tunnels open after scoped callbacks exit. This kill switch does not disable cleanup after failed acquisition or enable caching of tunneled clients. |

The backend logs one warning per factory when scoped release is disabled. Restart the backend after changing the variable. The setting applies to scoped callbacks and leases.

## Construction rule

`lightdash/no-direct-warehouse-client` is an error for backend source files. It rejects direct warehouse constructors, SSH tunnel constructors, `warehouseClientFromCredentials` calls and `getWarehouseClientFromCredentials` calls outside these exemptions:

- `src/services/WarehouseClientFactory/**`: the factory owns client construction and tunnel lifetime. `acquireUnscoped` stays public as the construction point that unit and integration tests spy on.
- `src/models/ProjectModel/ProjectModel.ts`: the factory calls this model's `getWarehouseClientFromCredentials` helper. The helper calls `warehouseClientFromCredentials` with the configured worker connection limit.
- `src/database/seeds/**`: development seeds build clients without the production service graph.
- `**/*.test.ts`: unit tests construct clients and test doubles.
- `**/*.mock.ts`: mock fixtures can provide clients without the production factory.
- `src/database/migrations/__tests__/**`: migration integration fixtures build real clients to prepare and check warehouse state.

## Out of scope

The DuckDB engines for results files, local analytics and pre-aggregates are not warehouse connections and are built directly.
