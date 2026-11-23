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
      "apiSource": { ...HYDRA_DEFAULT_SETTINGS, "latencyMs": 500 },
      "allowedMethods": ["GET", "POST"],
      "allowedPathPrefixes": ["/v1/report", "/v1/account"],
      "allowedContentTypes": ["application/json"],
      "explorePrefix": "hydra"
  }
  ```

  `apiSource` must hold every setting: start from `HYDRA_DEFAULT_SETTINGS` (`@lightdash/common`). `createHydraSource` in `packages/api-tests/tests/hydraLiveSource.test.ts` builds the same body. `PATCH` the same URL plus `/<uuid>` with a new `apiSource` to change behaviour.

## Data

- Two explores, `<prefix>_events` and `<prefix>_users` (see `explores.ts`).
  - **Events:** dimensions `date` (with week and month), `event_type`, `user_id`, `country` and `plan`; metrics `event_count`, `revenue` and `unique_users`. Rows cover the last 90 UTC days. A query reads the last 30 days unless its date filter says otherwise.
  - **Users:** dimensions `user_id`, `plan`, `country` and `signup_date`; metrics `user_count` and `seats`. There is no date range.
- `rowCount` events and `max(10, rowCount / 10)` users, seeded from the token. The same token always returns the same totals, and another token returns other totals, which shows per-viewer sign-in at work.
- One query returns at most 500 rows. Asking for more is refused before any call.

## Behaviour

The UI's Behaviour field takes `key=value` pairs for the simple keys, or a JSON object of any settings; keys left out keep their defaults. Through the API, set them in `apiSource`.

| Key | Default | Effect | What a query shows |
| --- | --- | --- | --- |
| `latencyMs`, `jitterMs` | 0, 0 | Waits `latencyMs` plus up to `jitterMs` at random. At 30000 or more the call times out | A slow tile, or a timeout error |
| `failAuth` | false | Answers 401 | `Hydra rejected the sign-in token…` |
| `errorRate` | 0 | Share of calls (0 to 1) that answer 500 | `Hydra returned 500…` |
| `rowCount` | 1000 | Seeded events | Bigger or smaller totals |
| `pageSize` | 0 | Rows per call; a bigger report takes several calls (at most 11 per query). 0 never pages | The same rows, over more calls |
| `vendorLimits` | 2 at once, 30 a minute, 300 an hour | What Hydra's API enforces: `concurrentCalls`, `callsPerSecond` and fixed-window `buckets` (`{id, windowMs, capacity}`). It refuses calls past them until the window resets; null enforces none | Nothing while the gate keeps under them |
| `onLimit` | 429, Retry-After in seconds | How Hydra refuses: `status`, `retryAfter` (`seconds`, `date` or `none`) and `body`. A body with `"code": "rate_limited"` marks a throttle under any status | `Hydra rate limit reached…` once retries run out |
| `declaredLimits` | `"vendor"` | The limits Lightdash's rate-limit gate keeps calls under, in the `vendorLimits` shape: `"vendor"` copies them, an object sets tighter or looser ones, null declares none | Calls wait their turn; past the deadline, `…reached its limit…` |
| `script` | none | Fixed answers by call number, from 1 per source: `[{"calls": "1-2", "respond": "ok"}, {"calls": "3", "respond": {"status": 429, "retryAfterSeconds": 5}}]`. `"4-"` matches every call from 4. `"ok"` answers as usual, skipping `errorRate` | Whatever the step answers |

Each call is refused at once past `vendorLimits`, then waits, then answers its script step, `failAuth`, `errorRate` or the data, in that order.

To test the gate against the vendor:
- **Declared tighter or equal:** Hydra never refuses (check `refused` in the stats).
- **Declared looser:** Hydra refuses, and the gate holds the declared buckets until Retry-After, then retries the call up to twice.
- **Declared none:** the gate charges no bucket, so a refusal is not retried and the query fails.

## Stats

`hydraServer.getStats(connectionUuid)` (in `server.ts`) returns `{ calls, refused, maxInFlight, minGapMs, peakPerBucket }` for a source, and `hydraServer.reset(connectionUuid)` forgets its counts, windows and script position. The same stats are at `GET /v1/stats`, and `POST /v1/stats/reset` resets them. Stats calls are not counted. Counts are per backend process and start over when it restarts, so API tests against an env check what queries return, not the counts.

## What to check

- The source page (Semantic Layer → the source) counts **API calls** and **cache hits**. A dashboard reload that the cache serves adds hits, not calls.
- A chart's Query execution details shows whether the cache answered.
- With the env var off, Hydra is absent from health and the add dialog, existing Hydra sources are hidden, and their queries are refused. Their stored explores stay listed until the source is deleted.

## Automated tests

- Unit: `hydra.test.ts` (compile, the engine path, scripts, paging, declared limits), `server.test.ts` (vendor limits, refusals, stats), `ExternalConnectionService/hydraFetch.test.ts` (fetch seam).
- API: `packages/api-tests/tests/hydraLiveSource.test.ts`, run against a preview env.
