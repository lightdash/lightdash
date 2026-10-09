# Warehouse client factory

`WarehouseClientFactory.withWarehouseClient` acquires a warehouse client, runs a callback, and releases its SSH tunnel when the callback exits. Release runs after success and after failure. Clients that use SSH tunnels do not enter the client cache. Failed acquisition also releases the tunnel.

## Credential resolution

Use a `binding` ref for normal scoped work. The factory resolves credentials and the AI plan, then builds the client in one call.

Use `resolveWarehouseCredentials` followed by a `resolved` ref only when a path needs credentials before deciding whether to build a client, or needs to build from a derived copy, such as credentials for a listed database. Resolution builds no client. The `resolved` ref carries the credentials, AI plan and connection route from resolution. It does not resolve credentials or the AI plan again. Client overrides and scoped tunnel release apply to both refs.

A `resolved` ref can have a null `projectUuid` for credentials that belong to no saved project, such as credentials typed in the create form. Set `cachePolicy: 'disabled'` to keep the client out of the query client cache.

Resolution with purpose `compile` selects the credentials that compile uses, which are not always the credentials that a query uses. Compile uses the stored connection, or the organisation credential that the project points to, and does not apply personal credential rules. For a project's own Databricks U2M connection with no stored refresh token, compile uses the acting person's matching credential, and refuses a credential from a different workspace. Organisation credentials and extra connections get no such fallback. The resolution refreshes the token once and saves a rotated refresh token against its owner: the project, the organisation credential, the user credential or the extra connection. Queries use the same refresh and rotation code.

## Compile adapters

A `compile` ref builds from credentials that the caller has already resolved, usually through `resolveWarehouseCredentials` with purpose `compile`. A compile ref can have a null `projectUuid` and its own `tunnelOptions`; project creation uses both to test typed credentials with the connection probe options. It can carry `compileGroup: { listedDatabases, onSkippedDatabase }`. For Postgres this selects the listed-databases client. Other warehouses use the normal client. Compile clients skip the cache. Compile-group clients carry listed databases and a warning callback that belong to one compile. The Postgres wrapper keeps its connection limit. Other compile clients keep the warehouse client's default connection limit.

`ScopedWarehouseConnection.deriveClient(credentials, { compileGroup }?)` builds an uncached sibling client in the current scope. Compile adapters use it to share one SSH tunnel while selecting a source's database and schema. Derive credentials from `connection.connectionCredentials`, which contains the tunnel's local host and port. Use the same field for dbt profiles. Do not use `warehouseClient.credentials` for either: a client can normalise its credentials, and DuckDB rewrites DuckLake credentials to the MotherDuck form. The factory rejects a different warehouse type or tunnel host or port. Siblings retain the scope's identity options and agent session. They open no tunnel and need no separate release.

`acquireWarehouseConnection(ref, context)` returns a `WarehouseConnectionLease`: a scoped connection with an idempotent `release(): Promise<void>`. It accepts only compile refs and the `test_and_compile` bypass mode. The lease exists for jobs whose steps must report acquisition and release separately: testing acquires the connection, and compiling releases it after adapter cleanup. A single callback cannot span those steps without changing when testing finishes or which step reports a failure. Every other caller uses `withWarehouseClient`. Both paths use the same acquisition and cleanup internals. Lease release honours the scoped-release kill switch; failed acquisition always releases its tunnel.

## Named bypass modes

Bypass refs use the supplied credentials without legacy credential refresh or AI planning. Registered mode and transport resolvers still materialise them before client creation. They never read or write the client cache.

`connection_test` tests submitted credentials that the caller has already resolved with `_resolveWarehouseClientCredentials`. It keeps the connection probe tunnel options and reports construction errors as test results.

Three modes exist only to roll back a credential resolution fix. The default paths do not use them, and the factory throws if a caller uses one while its switch is on:

- `dbt_cloud_preview_webhook`: the dbt Cloud preview webhook with the stored connection row. Switch: `DBT_CLOUD_PREVIEW_CREDENTIAL_RESOLUTION_ENABLED`.
- `timezone_preview`: the data timezone preview with stored or typed credentials. Switch: `TIMEZONE_PREVIEW_CREDENTIAL_RESOLUTION_ENABLED`.
- `test_and_compile`: the test-and-compile job with the reloaded connection row. Switch: `TEST_AND_COMPILE_CREDENTIAL_RESOLUTION_ENABLED`.

Remove a mode and its rollback branch together when its switch is retired.

## Behaviour changes from credential resolution

With the switches on, these paths behave differently from before. Each switch restores the old behaviour for its path.

- The dbt Cloud preview webhook and the data timezone preview call the identity provider to refresh Snowflake SSO and Databricks OAuth tokens on every run, also when the stored token still works. Webhook conversion never queries the warehouse, but a provider error now stops it.
- Compile, the webhook and test-and-compile reject a Snowflake SSO or Databricks OAuth row that has an access token but no refresh token or client secret. Queries already rejected such rows; the old compile code used the access token until it expired.
- The data timezone preview in edit mode selects credentials as a query does. A person who can edit the project can need personal warehouse credentials to preview its timezone.
- The webhook checks that the project creator can create the preview before it resolves credentials for a new preview.

Known limitation: when a Snowflake integration requires single-use refresh tokens, a webhook that creates a new preview refreshes the upstream token first. If the project creator's own Snowflake sign-in holds the same token, preview creation then fails. Set `DBT_CLOUD_PREVIEW_CREDENTIAL_RESOLUTION_ENABLED=false` to restore the old order. Previews already store a refresh token that single-use mode has consumed, because of the resolver behaviour below.

Not changed: `_resolveWarehouseClientCredentials`, which resolves typed credentials, keeps the previous refresh token after a Snowflake or Databricks U2M refresh, and does not save rotations for typed organisation credentials.

## SQL builders without a connection

`GitIntegrationService.getWarehouseSqlBuilder` reads the warehouse type and start of week from the stored connection and builds a dialect SQL builder with `warehouseSqlBuilderFromType`. It never connects to the warehouse, so it does not go through the factory and does not resolve credentials. Tests in `GitIntegrationService.sqlBuilder.test.ts` pin this.

## Client cache

The factory caches query clients by project, Snowflake warehouse override, Databricks compute override, agent session and AI identity. It reuses a cached client only when the credentials match. AI identity uses the connected person's identity UUID or the plan's audit person UUID.

Clients that use SSH tunnels never enter the cache. Bypass refs, compile refs, resolved refs with `cachePolicy: 'disabled'` and clients from `deriveClient` never read or write the cache.

## Configuration

| Environment variable | Default | Behaviour |
| --- | --- | --- |
| `SSH_TUNNEL_SCOPED_RELEASE_ENABLED` | `true` | Set to `false` to keep SSH tunnels open after scoped callbacks exit. This kill switch does not disable cleanup after failed acquisition or enable caching of tunneled clients. |
| `COMPILE_CREDENTIAL_RESOLUTION_ENABLED` | `true` | Set to `false` to make project compile use its old refresh code. That code does not save Databricks rotations and saves an organisation credential's Snowflake rotation against the project. Compile of extra connections is not affected. |
| `DBT_CLOUD_PREVIEW_CREDENTIAL_RESOLUTION_ENABLED` | `true` | Set to `false` to make the dbt Cloud preview webhook use the stored connection row without refresh. |
| `TIMEZONE_PREVIEW_CREDENTIAL_RESOLUTION_ENABLED` | `true` | Set to `false` to make the data timezone preview use stored or typed credentials without refresh. |
| `TEST_AND_COMPILE_CREDENTIAL_RESOLUTION_ENABLED` | `true` | Set to `false` to make the test-and-compile job test the reloaded connection row without refresh. |

Only the value `false` turns a switch off. The credential resolution switches are independent rollback settings for defect fixes, not feature flags.

The backend logs a warning at startup for each switch that is off. Restart the backend and the scheduler worker after changing a variable. The scoped release setting applies to scoped callbacks and leases.

## Construction rule

`lightdash/no-direct-warehouse-client` is an error for backend source files. It rejects direct warehouse constructors, SSH tunnel constructors, `warehouseClientFromCredentials` calls and `getWarehouseClientFromCredentials` calls outside these exemptions:

- `src/services/WarehouseClientFactory/**`: the factory owns client construction and tunnel lifetime. `acquireUnscoped` stays public as the construction point that unit and integration tests spy on.
- `src/models/ProjectModel/ProjectModel.ts`: the factory calls this model's `getWarehouseClientFromCredentials` helper. The helper calls `warehouseClientFromCredentials` with the configured worker connection limit.
- `src/database/seeds/**`: development seeds build clients without the production service graph.
- `**/*.test.ts`: unit tests construct clients and test doubles.
- `**/*.mock.ts`: mock fixtures can provide clients without the production factory.
- `src/database/migrations/__tests__/**`: migration integration fixtures build real clients to prepare and check warehouse state.

The rule also tracks aliased named imports, namespace and default imports, CommonJS `require` bindings and awaited dynamic imports from `@lightdash/warehouses` and its deep paths. Member access with a string literal key is covered. `pnpm -F backend test eslint-rules/no-direct-warehouse-client.test.ts` runs the rule under oxlint.

## Out of scope

The DuckDB engines for results files, local analytics and pre-aggregates are not warehouse connections and are built directly.

## Credential resolvers

The factory selects a resolver by warehouse type and authentication mode. Only
explicit BigQuery SSO uses an authentication-mode resolver. Other authentication
modes keep their existing refresh and rotation path. SSH uses a transport resolver
independent of the authentication mode. A CLI `authorized_user` keyfile does not select SSO on its own.

Selection runs first. The resolver receives the selected owner and credentials.
It validates credentials on save and materialises credentials for client use.
BigQuery SSO stores the client ID and refresh token. It can also store a quota
project ID. It uses a non-blank configured secret when the client IDs match.
If the configured secret is absent or blank, it keeps and uses the stored secret.
For other client IDs, it uses the stored secret or falls back to the configured secret.
It does not fetch grants, refresh tokens, or write to the database on resolution.

The selected credentials carry resolution metadata under a symbol. Object copies
retain this metadata. JSON writes exclude it. Resolved references and compile
leases reuse it without another resolution. The lease gives dbt the runtime
credentials. The rollback paths also hydrate SSO locally before client creation.

Registered resolvers add an identity tuple to the client cache key. BigQuery SSO
uses the owner, client ID, and a SHA-256 digest of the refresh token. The cache also
compares runtime credentials, so a changed server secret replaces the client.
Unregistered modes keep the same cache key. Scope cleanup calls the resolver's
idempotent disposal hook, including when client construction fails.

A materialisation created by `resolveWarehouseCredentials` and reused by several
`resolved` refs shares one `dispose`; resolvers that own resources must handle
this shared ownership before they land if they allocate resources during
resolution. SSH key resolution allocates no resources.

### SSH transport resolver

Postgres and Redshift connections with SSH enabled use a transport resolver after
the authentication resolver or legacy refresh. Save validation omits the private
key from stored credentials when the context has an organisation and that
organisation owns the public key's pair. Immediate connection credentials can
still carry the key. Project updates, organisation credentials, extra connections
and preview copies use the same ownership rule. Legacy rows keep their copy when
the pair is missing, has no owner or belongs to another organisation. No migration
rewrites rows; old rows lose the copy on their next credential write when the rule
holds. At use time, the resolver reads the public key's pair and prefers its
private key when it belongs to the context's organisation. If
that pair is absent or not owned by the organisation, it uses the copied private
key. Without either key, resolution fails.

The identity tuple contains `ssh-tunnel-v1`, the organisation UUID, the key source
(`organizationKeyPair` or `copiedKey`), the SHA-256 public key digest, the SSH host,
effective SSH port, SSH user, database host and database port. Absent fields use
null; ports use strings and the SSH port defaults to 22. It contains no private
key. Transport identity follows authentication identity, and SSH clients are not
cached.

The factory still opens and closes each tunnel. The SSH resolver's disposal hook
is a no-op. When a mode and transport compose, their options merge with transport
options taking precedence, cacheability requires both, and disposal runs the
transport before the mode. Disposal is idempotent and still runs the mode hook
if the transport hook fails.
