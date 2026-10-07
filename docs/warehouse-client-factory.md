# Warehouse client factory

`WarehouseClientFactory.withWarehouseClient` acquires a warehouse client, runs a callback, and releases its SSH tunnel when the callback exits. Release runs after success and after failure. Clients that use SSH tunnels do not enter the client cache. Failed acquisition also releases the tunnel.

## Credential resolution

Use a `binding` ref for normal scoped work. The factory resolves credentials and the AI plan, then builds the client in one call.

Use `resolveWarehouseCredentials` followed by a `resolved` ref only when a path needs credentials before deciding whether to build a client, or needs to build from a derived copy, such as credentials for a listed database. Resolution builds no client. The `resolved` ref carries the credentials, AI plan and connection route from resolution. It does not resolve credentials or the AI plan again. Client overrides and scoped tunnel release apply to both refs.

## Named bypass modes

Bypass refs use the supplied credentials without credential resolution or AI planning. They never read or write the client cache. SPK-2613 fixes the resolution gaps tracked by these four modes:

- `dbt_cloud_preview_webhook`: validates and converts a webhook manifest with the stored connection row, without resolving credentials.
- `timezone_preview`: queries with submitted or stored credentials and the unsaved data timezone, without resolving credentials.
- `connection_test`: tests submitted credentials already resolved by the caller, without repeating resolution in the factory.
- `test_and_compile`: tests and compiles with caller-supplied credentials, without factory credential resolution.

## Configuration

| Environment variable | Default | Behaviour |
| --- | --- | --- |
| `SSH_TUNNEL_SCOPED_RELEASE_ENABLED` | `true` | Set to `false` to keep SSH tunnels open after scoped callbacks exit. This kill switch does not disable cleanup after failed acquisition or enable caching of tunneled clients. |

The backend logs one warning per factory when scoped release is disabled. Restart the backend after changing the variable. The setting applies to scoped callbacks. Existing calls through the transitional `ProjectService._getWarehouseClient` shim still release their own tunnels until they migrate to the factory.
