# Snowflake agent OAuth stub

This dependency-free Node server auto-approves OAuth sign-in and implements the
Snowflake SDK session and literal-query protocol. It starts on `PORT` (default
3900). Tests can import `startStub()` to listen on a random local port and close
it afterwards. Use Node 22 or later for gzip request decoding.

Start it from the repository root:

```sh
pnpm -F api-tests stub:snowflake-ai
```

Configure a local backend with these values, plus a valid enterprise license:

```sh
SNOWFLAKE_AI_OAUTH_ACCOUNT=stub
SNOWFLAKE_AI_OAUTH_CLIENT_ID=stub-client
SNOWFLAKE_AI_OAUTH_CLIENT_SECRET=stub-secret
SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT=http://localhost:3900/oauth/authorize
SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT=http://localhost:3900/oauth/token-request
```

With that backend running, run the whole sign-in and MCP SQL loop:

```sh
SITE_URL=http://localhost:<port> SNOWFLAKE_AI_STUB_URL=http://localhost:3900 pnpm -F api-tests test:api tests/agentConnectSnowflakeStub.test.ts
```

`SNOWFLAKE_AI_STUB_URL` is the URL the backend uses, including for the project's
warehouse `accessUrl`. A containerised local backend needs a URL it can reach,
such as `http://host.docker.internal:3900`, in both OAuth endpoints and
`SNOWFLAKE_AI_STUB_URL`.

The test file is skipped when `SNOWFLAKE_AI_STUB_URL` is unset. When it is set,
a server that reports Snowflake AI OAuth disabled or whose start route does not
point at this stub fails the test, so a misconfigured loop never passes
silently. The test creates a project without a compile or refresh, so the
preview's Postgres dbt profile is not used. It restores the org rule and flag
override and deletes the AI credential, PATs, and project.

The preview runs the same stub as an internal sidecar. CI runs
`pnpm -F api-tests test:api` against the preview and supplies
`SNOWFLAKE_AI_STUB_URL=http://snowflake-ai-stub:3900`. The API test uses the
issued state to call the callback directly; it does not need network access to
the internal authorize endpoint.

Codes beginning with `expiring` issue a refresh token that expires after one
second. Codes beginning with `revoking` issue a refresh token beginning with
`revoked`, so sign-in succeeds but its next refresh returns `invalid_grant`.
Other successful codes report a refresh-token lifetime of 90 days.

Codes and refresh tokens beginning with `revoked` return `invalid_grant`.
OAuth access tokens beginning with `revoked` fail SDK login. Tokens beginning
with `plain` create a session with agent activation false; other OAuth tokens
activate the agent. Refresh exchanges return a new refresh token.

Literal selects return Snowflake names (`SELECT 'hello' AS greeting` returns
`GREETING`). `ALTER SESSION` and `USE` return empty results; other queries
return a single `STUB: 'ok'` row. This is a protocol fixture, not a SQL engine
or an OAuth security implementation. Use it only in test environments.
