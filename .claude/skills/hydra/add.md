# hydra add: a new live integration

A live integration turns a metric query on a live data source explore into calls to one external API and its rows into a result. Nothing is synced or stored. One integration is one folder plus a few registry entries; the shared engine does the rest.

If there is no assess page for the tool yet, run `assess` first; its spec and explores are your starting point. Read one existing integration end to end before writing yours. Pick the closest:

| Shape of the API | Copy |
|---|---|
| Report API with a JSON body (dimensions, metrics, date range) | `searchConsole`, `ga4` |
| Same, but signed in with Google | `ga4`, `googleAds`, `youtubeAnalytics` (share `integrations/google/`) |
| Its own query language | `googleAds` (GAQL), `postHog` (HogQL over the SQL builder) |
| Token-authenticated, sorts we apply ourselves | `metaAds`, `linkedInAds` |

All paths below are under `packages/backend/src/services/QuerySourceService/live/` unless they say otherwise.

## The contract

`types.ts` holds `LiveIntegration<C, Request>`; read its doc comments, they are the spec. Write it with `defineLiveIntegration({...})` from `integration.ts`, which also has the helpers: `jsonRequest(name, schema)` for `parseRequest`, `assertMaxRows`, `ALL_PUSHDOWN_REFUSED`.

What you write, per folder `integrations/<name>/`:

- `explores.ts`: `LiveExploreDefinition`s (dimensions, metrics, filters each field allows, date range). The first explore is the wide model; scans and field edits apply to it.
- `compile.ts`: `(explore, metricQuery, today) => { query, localSorts?, fieldIdsByColumn? }`. Return only the request. `compileLiveMetricQuery` adds `requestLimit`, `limit`, the default column map (API name → field id) and `periodColumns` (from `periodFormats`). Set `localSorts` when the API can't apply a sort; rows are then read up to `limits.maxRows`, and `getLiveRequestLimit` gives the row count to put in the request.
- `run.ts`: `run({ settings, request, limit, calls })`. Use `calls.fetch(request, zodSchema)` or `calls.send(request)`; never hold credentials, the service attaches them. Return `{ columns, rows, hasMoreRows, bytesRead? }`. Cap or refuse `limit` the way the API needs (`assertMaxRows` when it can't cap).
- `errors.ts` (when needed): `toError(response, settings)` turns a non-2xx response into an error that says what to change.
- `useCases.ts`: `<name>UseCases: LiveUseCases`, the questions people ask and dashboards they build, each `possible: true/false` for today. Follow the use case rules in [SKILL.md](SKILL.md#use-cases); start from the assess page's cases when there is one.
- `index.ts`: the `defineLiveIntegration` call: `label` (used in error text), `settings` (zod, matching the common type), `origins`, `access` (path prefixes, methods, headers), `limits`, `capabilities`, `explores`, `plannedModelNames`, `validate`, `checkAuth`, `describeTarget` (for the AI agent), `parseRequest`, `compile`, `run`, `toError`, optional `scan` and `periodFormats`. It also carries the spec from `spec/types.ts`: `level`, `auth` (token and OAuth kept apart) and `paging`, each with a short `description` of the vendor's facts; `rateLimits` as numbers (`concurrentCalls`, `callsPerSecond`, and `buckets` of `{ id, label, windowMs, capacity }`, with a `note` only for what the numbers can't say); plus `useCases`. Write vendor facts only, checked against the vendor's docs.

Don't refuse queries in `compile`: callers run the shared check (`getApiSourceQueryIssues` / `assertLiveQuery`) first, driven by `capabilities` and each field's filter rules.

## Wire it up

1. `packages/common/src/types/querySources.ts`: add the `ApiConnectorType` value.
2. `packages/common/src/ee/externalConnections/types.ts`: add the settings type and put it in `ExternalConnectionApiSource`.
3. `packages/common/src/utils/liveSourceIntegrations.ts`: add the `LIVE_INTEGRATION_CATALOG` entry (id, labels, description, setup kind, `settings` zod schema, `getTarget`, `agentQueryGuide`). The backend integration reads its settings schema from here. Typecheck fails until you do.
4. `registry.ts`: add it to `LIVE_INTEGRATIONS` (typecheck fails until you do).
5. `registry.test.ts`: add `SAMPLE_SETTINGS` for it. `spec/spec.test.ts` picks it up too; update its auth score snapshot. The conformance test then checks settings round-trip, early refusals, and that what it compiles runs and a failed call is explained.
6. To ship it behind a flag (a gated or beta release), add `LiveSource<Name> = 'live-source-<connector>'` to `FeatureFlags` and set `featureFlag` on the catalog entry; create the flag with default off in the Console before the deploy. See `docs/feature-flags.md#live-data-source-integrations`.
7. Frontend `packages/frontend/src/features/externalConnections/liveSources/liveSourceCatalog.ts`: add the icon (`icons/<name>.svg`, square, brand color). A new setup kind also needs its connect dialog.
8. Sign-in: Google sources reuse `integrations/google/signIn.ts`; OAuth scopes and token exchange live in `ee/services/ExternalConnectionService` (see `googleOAuth.ts`, `postHogOAuth.ts`, `linkedInAdsOAuth.ts`).

## Tests

- `integrations/<name>/compile.test.ts`: request bodies for representative queries; derived fields through `compileLiveMetricQuery`.
- `integrations/<name>/run.test.ts`: use `connectLiveSource(integration, settings, send)` from `liveSource.mock.ts` with a mocked `send`; cover paging, row caps, error mapping and an unexpected response shape.
- `capabilities.test.ts` and `explores/names.test.ts` snapshots: update them for the new connector and review the diff.

Run `pnpm -F backend exec vitest run src/services/QuerySourceService/live`, `pnpm -F backend typecheck`, and `pnpm run linter --fix` in `packages/backend`.

Then run `test` (in `SKILL.md`) on it and fix what it finds.

## Naming

- `Live*` / `live*` for engine internals.
- `ApiSource*` for contracts that already shipped: common types, `Explore.apiSource`, `ApiConnectorType`, the `api_source_calls` table, analytics and Prometheus names.
- `LiveSource*` for what belongs to one user's source (field edits, its scan).
- Say "live data source" and "integration", never "connection", in user-facing text.
