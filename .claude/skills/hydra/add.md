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

`types.ts` holds `LiveIntegration<C, Request>`; read its doc comments, they are the spec. Integrations are stateless: the core owns credentials, the explores a Refresh found, field edits and rate limits, and only functions that take `runtime` may call the API. An integration imports engine code only from `../../sdk` (`live/sdk.ts`); if it needs something the sdk doesn't export, add it there. Write it with `defineLiveIntegration({...})`; the sdk also has the helpers: `readRule(method, path, { exact?, entry? })`, `assertMaxRows`, `ALL_PUSHDOWN_REFUSED`.

What you write, per folder `integrations/<name>/`. Every folder has the same files, so an agent that knows one knows all of them. Imports only go down this list: a file imports from files above it, never below (`import/no-cycle` enforces it).

- `api.ts`: facts about the vendor API that several files read: page sizes, row caps, object or column lists, response schemas and `to<Name>Error(response, settings?)`, which turns a non-2xx response into an error that says what to change. When an `aiHint` states a cap, interpolate the constant instead of writing the number.
- `spec.ts`: `<name>UseCases: LiveUseCases`, the questions people ask and dashboards they build, each `possible: true/false` for today (follow the use case rules in [SKILL.md](SKILL.md#use-cases); start from the assess page's cases when there is one), then `<name>Spec: LiveIntegrationSpec`: vendor facts only, checked against the vendor's docs, `auth` (token and OAuth kept apart, with a short `description`) and `useCases`.
- `connection.ts`: `<name>Connection: LiveConnection<C>`: `settings` (the catalog's zod schema), `origins`, `access` (`(settings, explores) => { rules: [readRule('GET', path), ...], headers? }`, where `explores` is the source's list, built from what its last Refresh stored, one rule per path with the exact method it is called with; the conformance test fails when a run sends a request no rule covers), `checkAuth`, optional `validate`, `describeTarget` (for the AI agent), optional `summarizeTest` (written in this file).
- `model.ts`: the filter operator lists fields take (`<PREFIX>_<KIND>_FILTERS`, first, with a comment when the API's rule isn't obvious), then explores and fields, then the scan, then `<name>Model: LiveModel<C>` (`explores`, and `scan`, `metadata` and `extend` together when the vendor has a schema to read).
  - Explores: so a person or agent can read every field, each explore is a plain literal typed `LiveExploreDefinition` that states every rule, including `null` caps and empty lists (`name`, `label`, `description`, `aiHint`, `maxDimensions`, `maxMetrics`, `dateRange`, `incompatible`, `dimensions`, `metrics`). Each field is `dimension({...})` or `metric({...})` from `explores/declare.ts`, with named arguments in this order: `name`, `apiName` (only when it differs from `name`), `label`, `type`, `filterOperators`, `description`, `aiHint`, then `sql`, `timeInterval`, `valueLabels`, `groups`, `format`, `aggregation`. Write every field out, including date grains such as `created_at_week`, so each field name can be found by grep; no local helpers, loops or generated fields. Metrics state their `aggregation` (`ADDITIVE`, `NON_ADDITIVE` or `ratio(...)`) with a comment citing the vendor's docs. `<PREFIX>_EXPLORES` lists them; the first explore's field edits keep bare keys, the others `<model>.<name>`.
  - Scanning (when the vendor has a schema to read): `defineLiveModel({ explores, scan, metadata, extend })`, where `scan` calls the API and returns the vendor's metadata, `metadata` is its zod shape, and `extend` returns what it adds: `{ fields, explores }` (see Scanning).
- `compile.ts`: `(explore, metricQuery, today) => { query, localSorts?, fieldIdsByColumn? }`. Return only the request. `compileLiveMetricQuery` adds `requestLimit`, `limit`, the default column map (API name → field id) and `periodColumns` (from `periodFormats`). Set `localSorts` when the API can't apply a sort; rows are then read up to `limits.maxRows`, and `getLiveRequestLimit` gives the row count to put in the request.
- `run.ts`: the request schema (`<name>RequestSchema`, zod, or a parser for a query language) and `run({ settings, request, limit, runtime })`. Use `runtime.fetch(request, zodSchema)` or `runtime.send(request)`; never hold credentials, the service attaches them. Return `{ columns, rows, hasMoreRows, bytesRead? }`. Cap or refuse `limit` the way the API needs (`assertMaxRows` when it can't cap).
- `query.ts`: `<name>Query: LiveQuery<C, Request>`: `request`, `compile`, `run`, `toError`, `capabilities`, `limits` (one flat object: `timeoutMs`, `maxRows`, `pageSize` when the API pages, `concurrentCalls`, `callsPerSecond`, `buckets` of `{ id, label, windowMs, capacity }`, and a `note` only for what the numbers can't say; `callsPerQuery` defaults to the pages `maxRows` takes), optional `limitsFor(settings)` and `periodFormats`.
- `index.ts`: the manifest, nothing else: `defineLiveIntegration({ connector, label, kind, connection, model, query, spec })`. `label` is the catalog's `messageLabel` (used in error text); `kind` is `reports` when the API computes totals at a grain, `records` when it returns rows, `sql` when it runs a query language.
- Optional, only for a sub-language of its own: one extra file such as `soql.ts`, imported by the files that need it. `<name>.fixtures.ts` holds shared test data.

Don't refuse queries in `compile`: callers run the shared check (`getApiSourceQueryIssues` / `assertLiveQuery`) first, driven by `capabilities` and each field's filter rules.

## Scanning

An integration describes its explores one way, whether its code declares them or a Refresh finds them: a list of `LiveExploreDefinition`, each with its fields. `model.explores` is the list the code declares. When the vendor has a schema to read, the model adds three keys, written with `defineLiveModel`, that keep reading the vendor apart from building explores, the way dbt keeps YAML apart from the warehouse schema:

- `scan({ settings, runtime })` calls the API and returns what the vendor answered, as plain JSON under plain keys (`{ properties: { deals: body } }`, no vendor prefix).
- `metadata` is the zod shape of the parts the model reads, with their types. A Refresh stores only those (`scan.metadata` in `api_source`), and the core checks stored metadata against the shape before `extend` reads it: metadata an older version stored in another shape reads as none until the next Refresh. Give one object's part `.optional().catch(undefined)` so one odd answer doesn't void the rest, and only ever add optional keys, so what sources already stored still fits.
- `extend(metadata)` returns what the stored metadata adds, as `{ fields?, explores? }`. It runs on every build, so a deploy that changes it reaches every source without a Refresh. It can't change or remove anything the code declares.

1. `fields` holds more fields for a declared explore, by its `name`: `{ deals: pickLiveFields(merged) }`, where `withFieldsOffByDefault(declared, merged, isSystemField)` marks the vendor's system fields `onByDefault: false`. A field named like a declared one is left out, and a key that isn't a declared explore fails the Refresh. `explores` holds one explore per object type the workspace made (a CRM's own objects, Hydra's `objects`).
2. Every explore has a `name`, its one identity. An explore the code doesn't declare sets `apiName` (the vendor's stable id, e.g. Salesforce `Invoice__c`) and derives `name` from it with `toLiveModelName(apiName)` (`invoice__c`), never from a label people can rename. The core leaves an explore out, and logs its name, when the name isn't a model name, an earlier explore has it, a declared explore has it for something else, or another explore of the project has the full name.
3. `onByDefault?: boolean` on an explore or a field says how a source starts with it; absent means on. An admin's choice wins over it. A Refresh that sees the vendor change a default keeps the state the source had, and a deploy that turns a default off in code keeps on what a source has already built; a default that turns on in code shows the item.
4. `compile` reads the explore's `apiName` with `getLiveExploreApiName(explore)` and puts it in the request.
5. `connection.access(settings, explores)` adds one exact rule per explore `apiName` it reads by path: `readRule('POST', `/v1/objects/${apiName}/report`, { exact: true, entry: apiName })`. The proxy checks method and path together, so an object the last Refresh didn't find is refused. A Refresh drops an explore whose `apiName` has `/`, `{`, `}`, `?`, `#`, `%` or whitespace, since it can't sit in one path segment as it is.

The core does the rest: a Refresh diffs the explores the old metadata gave against the new ones by `name`, reports the explores and fields added and removed, and an explore gone from the list drops it. Hydra's `model.ts` (`readHydraObjects` and `extend`) and `objects.ts` are the working example; `integrations/hydra/discoveredExplores.test.ts` and the Hydra block in `ExternalConnectionService.apiSource.test.ts` test it end to end.

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

- Tests sit next to the file they test (`compile.test.ts`, `run.test.ts`, `model.test.ts`).
- `integrations/<name>/compile.test.ts`: request bodies for representative queries; derived fields through `compileLiveMetricQuery`.
- `integrations/<name>/run.test.ts`: use `connectLiveSource(integration, settings, send)` from `liveSource.mock.ts` with a mocked `send`; cover paging, row caps, error mapping, an unexpected response shape, and what `scan()` stores and `discover()` builds from it (`getExploresWithDiscoveredFields`).
- `capabilities.test.ts` and `explores/names.test.ts` snapshots: update them for the new connector and review the diff.

Run `pnpm -F backend exec vitest run src/services/QuerySourceService/live`, `pnpm -F backend typecheck`, and `pnpm run linter --fix` in `packages/backend`.

Then run `test` (in `SKILL.md`) on it and fix what it finds.

## Naming

- `Live*` / `live*` for engine internals.
- `ApiSource*` for contracts that already shipped: common types, `Explore.apiSource`, `ApiConnectorType`, the `api_source_calls` table, analytics and Prometheus names.
- `LiveSource*` for what belongs to one user's source (field edits, the explores its last Refresh found).
- Say "live data source" and "integration", never "connection", in user-facing text.
