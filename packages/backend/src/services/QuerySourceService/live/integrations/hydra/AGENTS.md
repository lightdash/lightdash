# Hydra, the test integration

Hydra is a live integration you test with. Only its vendor API is fake: it is answered in-process (`server.ts`, reached through `hydraFetch.ts`), so everything from the chart to the HTTP call is the real engine: refusals, the results cache, the call limiter and errors. It needs no credentials and no network.

Use it to test anything live data sources do (adding a source, charts, dashboards, the cache, rate limits, failures) on a local instance or a Rainbow Machine env.

## Turn it on

- **Env var:** `LIVE_SOURCES_HYDRA_ENABLED=true`. `.env.development` and `rainbow.toml` set it, so local instances and PR previews have it; everywhere else Hydra is absent. Check `GET /api/v1/health`: `hasHydraLiveSource` must be `true`. If it is false locally, look for an override in `.env.development.local`, then restart the API.
- **Feature flag:** `api-query-sources`. On by default in previews. Locally, `POST /api/v2/feature-flag/api-query-sources` with `{"enabled": true}`.
- **Results cache:** cache hits need the project's results cache on: `PATCH /api/v1/projects/<projectUuid>/results-cache-config` with `{"cacheEnabled": true}`.

## Add a source

- **UI:** Semantic Layer → Live data sources → Add live data source → Hydra. Any sign-in token works. Leave Behaviour blank for the defaults. Test shows `Connected to Hydra account hydra-<id>`.
- **API:** `POST /api/v1/ee/projects/<projectUuid>/external-connections`:

  ```json
  {
      "name": "Hydra",
      "type": "bearer_token",
      "origin": "https://hydra.invalid",
      "secret": "alice",
      "apiSource": { "connector": "hydra", "latencyMs": 0, "errorRate": 0, "retryAfterEvery": 0, "retryAfterSeconds": 1, "failAuth": false, "rowCount": 1000, "callsPerMinute": 30, "callsPerHour": 300 },
      "allowedMethods": ["GET", "POST"],
      "allowedPathPrefixes": ["/v1/report", "/v1/account"],
      "allowedContentTypes": ["application/json"],
      "explorePrefix": "hydra"
  }
  ```

  `createHydraSource` in `packages/api-tests/tests/hydraLiveSource.test.ts` builds the same body. `PATCH` the same URL plus `/<uuid>` with a new `apiSource` to change behaviour.

## Data

- Two explores, `<prefix>_events` and `<prefix>_users` (see `explores.ts`).
  - **Events:** dimensions `date` (with week and month), `event_type`, `user_id`, `country` and `plan`; metrics `event_count`, `revenue` and `unique_users`. Rows cover the last 90 UTC days. A query reads the last 30 days unless its date filter says otherwise.
  - **Users:** dimensions `user_id`, `plan`, `country` and `signup_date`; metrics `user_count` and `seats`. There is no date range.
- `rowCount` events and `max(10, rowCount / 10)` users, seeded from the token. The same token always returns the same totals, and another token returns other totals, which shows per-viewer sign-in at work.
- One query returns at most 500 rows. Asking for more is refused before any call.

## Behaviour

Settings are `key=value` pairs, in the UI's Behaviour field or `apiSource`. Each call applies them in this order:

| Key | Default | Effect | What a query shows |
| --- | --- | --- | --- |
| `latencyMs` | 0 | Waits before answering. At 30000 or more the call times out | A slow tile, or a timeout error |
| `failAuth` | false | Answers 401 | `Hydra rejected the sign-in token…` |
| `retryAfterEvery`, `retryAfterSeconds` | 0, 1 | Every Nth call answers 429 with `Retry-After` | `Hydra rate limit reached… Retry in N seconds…` |
| `errorRate` | 0 | Share of calls (0 to 1) that answer 500 | `Hydra returned 500…` |
| `rowCount` | 1000 | Seeded events | Bigger or smaller totals |
| `callsPerMinute`, `callsPerHour` | 30, 300 | The source's own call limits, enforced by the shared limiter | `…reached its limit of N calls per minute. Retry after N seconds.` |

The call counter for `retryAfterEvery` is per source and resets when the server restarts.

## What to check

- The source page (Semantic Layer → the source) counts **API calls** and **cache hits**. A dashboard reload that the cache serves adds hits, not calls.
- A chart's Query execution details shows whether the cache answered.
- With the env var off, Hydra is absent from health and the add dialog, existing Hydra sources are hidden, and their queries are refused. Their stored explores stay listed until the source is deleted.

## Automated tests

- Unit: `hydra.test.ts` (compile, the fake server, the engine path), `ExternalConnectionService/hydraFetch.test.ts` (fetch seam, limiter).
- API: `packages/api-tests/tests/hydraLiveSource.test.ts`, run against a preview env.
