# Warehouse client factory

`WarehouseClientFactory.withWarehouseClient` acquires a warehouse client, runs a callback, and releases its SSH tunnel when the callback exits. Release runs after success and after failure. Clients that use SSH tunnels do not enter the client cache. Failed acquisition also releases the tunnel.

## Credential resolution

Use a `binding` ref for normal scoped work. The factory resolves credentials and the AI plan, then builds the client in one call.

Use `resolveWarehouseCredentials` followed by a `resolved` ref only when a path needs credentials before deciding whether to build a client, or needs to build from a derived copy, such as credentials for a listed database. Resolution builds no client. The `resolved` ref carries the credentials, AI plan and connection route from resolution. It does not resolve credentials or the AI plan again. Client overrides and scoped tunnel release apply to both refs.

## Configuration

| Environment variable | Default | Behaviour |
| --- | --- | --- |
| `SSH_TUNNEL_SCOPED_RELEASE_ENABLED` | `true` | Set to `false` to keep SSH tunnels open after scoped callbacks exit. This kill switch does not disable cleanup after failed acquisition or enable caching of tunneled clients. |

The backend logs one warning per factory when scoped release is disabled. Restart the backend after changing the variable. The setting applies to scoped callbacks. Existing calls through the transitional `ProjectService._getWarehouseClient` shim still release their own tunnels until they migrate to the factory.
