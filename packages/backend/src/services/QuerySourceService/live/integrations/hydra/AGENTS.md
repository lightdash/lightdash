# Hydra, the test integration

Hydra is a live integration you test with. Only its vendor API is fake: it is answered in-process (`server.ts`, reached through `hydraFetch.ts`), so everything from the chart to the HTTP call is the real engine: refusals, the results cache, the call limiter and errors. It needs no credentials and no network.

Use it to test anything live data sources do (adding a source, charts, dashboards, the cache, rate limits, failures) on a local instance or a Rainbow Machine env.

## Turn it on

- **Env var:** `LIVE_SOURCES_HYDRA_ENABLED=true`. `.env.development` and `rainbow.toml` set it, so local instances and PR previews have it; everywhere else Hydra is absent. Check `GET /api/v1/health`: `hasHydraLiveSource` must be `true`. If it is false locally, look for an override in `.env.development.local`, then restart the API.
- **Licence:** live data sources need a valid Enterprise licence (`LICENSE_KEY`); `GET /api/v1/health` shows `license.valid`.
- **Results cache:** cache hits need the project's results cache on: `PATCH /api/v1/projects/<projectUuid>/results-cache-config` with `{"cacheEnabled": true}`.

## Add a source

- **UI:** Semantic Layer → Live data sources → Add live data source → Hydra. Any sign-in token works. A source made in the UI takes the default settings, and saving it in the UI resets them; set others through the API. Test shows `Connected to Hydra account hydra-<id>`.
- **API:** `POST /api/v1/ee/projects/<projectUuid>/external-connections`:

  ```json
  {
      "name": "Hydra",
      "type": "bearer_token",
      "origin": "https://hydra.invalid",
      "secret": "alice",
      "apiSource": { "connector": "hydra", "latencyMs": 500 },
      "allowedMethods": ["GET", "POST"],
      "allowedPathPrefixes": ["/v1/report", "/v1/account"],
      "allowedContentTypes": ["application/json"],
      "explorePrefix": "hydra"
  }
  ```

  Every setting in `apiSource` is optional; one left out takes its default (`HYDRA_DEFAULT_SETTINGS` in `@lightdash/common`), so `{ "connector": "hydra" }` is a healthy source. Any token works, and each one seeds its own rows. `PATCH` the same URL plus `/<uuid>` with a new `apiSource` to change behaviour; it replaces the old one. `createHydraSource` in `packages/api-tests/tests/hydraLiveSource.test.ts` builds the same body.

## Data

- Two explores, `<prefix>_events` and `<prefix>_users` (see `explores.ts`).
  - **Events:** dimensions `date` (with week and month), `event_type`, `user_id`, `country` and `plan`; metrics `event_count`, `revenue` and `unique_users`. Rows cover the last 90 UTC days. A query reads the last 30 days unless its date filter says otherwise.
  - **Users:** dimensions `user_id`, `plan`, `country` and `signup_date`; metrics `user_count` and `seats`. There is no date range.
- `rowCount` events and `max(10, rowCount / 10)` users, seeded from the token. The same token always returns the same totals, and another token returns other totals, which shows per-viewer sign-in at work.
- One query returns at most 500 rows. Asking for more is refused before any call.

## Settings

Set these in `apiSource` through the API; keys left out keep their defaults.

| Key | Default | Effect | What a query shows |
| --- | --- | --- | --- |
| `latencyMs`, `jitterMs` | 0, 0 | Waits `latencyMs` plus up to `jitterMs` at random. A wait of 30000 or more times out | A slow tile, or a timeout error |
| `failAuth` | false | Answers 401 | `Hydra rejected the sign-in token…` |
| `errorRate` | 0 | Share of calls (0 to 1) that answer 500 | `Hydra returned 500…` |
| `rowCount` | 1000 | Seeded events | Bigger or smaller totals |
| `pageSize` | 0 | Rows per call, 0 or 10 to 10000; a bigger report takes several calls (at most 51 per query). 0 never pages | The same rows, over more calls |
| `vendorLimits` | 2 at once, 30 a minute, 300 an hour | What Hydra's API enforces: `concurrentCalls`, `callsPerSecond` and `buckets` (`{id, windowMs, capacity}`: at most 5, unique ids of up to 40 characters, `second` reserved). A window opens at the first call that reaches Hydra after the last one closed. Hydra refuses calls past a limit until its window closes; null enforces none | Nothing while the gate keeps under them |
| `onLimit` | 429, Retry-After in seconds | How Hydra refuses: `status` (400 to 599), `retryAfterFormat` (`seconds`, `date` or `none`) and an optional `body`. A body with `"code": "rate_limited"` marks a throttle under any status | `Hydra rate limit reached…` once retries run out |
| `declaredLimits` | `"vendor"` | The limits Lightdash's rate-limit gate keeps calls under, in the `vendorLimits` shape: `"vendor"` copies them, an object sets tighter or looser ones, null declares none. The gate's window opens when it charges a call, a moment before Hydra's, so a test that runs right at the limit declares a slightly longer window | Calls wait their turn; past the deadline, `…reached its limit…` |
| `mockResponses` | none | Fake answers a test sets by call number, counted per source from 1; at most 50, the first match wins. Each names `call`, or `fromCall` with an optional `toCall`, and a `status`: 200 answers as usual, skipping `errorRate`; 400 to 599 is answered as given, with optional `retryAfterSeconds` and `body`. `[{"call": 2, "status": 429, "retryAfterSeconds": 5}, {"fromCall": 3, "status": 503}]` | Whatever the mock answers |
| `tokenTtlSeconds` | 3600 | How long a viewer's access token lasts before it must be refreshed | `Sign in to … again` once refresh fails |
| `revokedViewers` | none | People (by sign-in email, at most 50) whose sign-ins Hydra revokes: their tokens answer 401, refresh fails and consent is declined. Others keep working | That person is asked to sign in again |
| `viewerScopes` | everyone reads everything | What each listed person (at most 50) may read: `events:read`, `users:read`, `revenue:read` (the `revenue` metric). A call needing more answers 403 `insufficient_scope` to that person only | A permission error for that person |
| `denyConsent` | false | The consent screen declines, as a person clicking Deny would | The sign-in returns cancelled |

Each call is refused at once past `vendorLimits`, then waits, then answers its mock response, `failAuth`, the token check, the scope check, `errorRate` or the data, in that order.

## Each viewer's own sign-in

Hydra is a strict OAuth 2.0 vendor (`oauth.ts`), so per-viewer sign-in is tested against the rules a careful vendor enforces:

- **Consent:** `hydraServer.authorize` stands in for the vendor's consent screen; the app serves it at `GET /api/v1/ee/live-sources/hydra/oauth/authorize`, which takes the source as `resource` and signs in the logged-in person by email. Set a source to `"signInMode": "per_user"` and open its connect link to walk through it. It needs client `HYDRA_OAUTH_CLIENT_ID`, `response_type=code` and PKCE with S256, and redirects back with a code and the state, or `error=access_denied`.
- **Codes:** single use, valid for 60 seconds, bound to the client, the redirect URI and the source that asked. A failed exchange does not use the code up.
- **Token endpoint** (`hydraServer.token`, reached through `fetchHydraToken`): needs `HYDRA_OAUTH_CLIENT_SECRET`; answers `invalid_client` or `invalid_grant` as the spec says.
- **Tokens:** an access token works only on the source it was issued for. Each viewer reads rows seeded from their own email, so two viewers see different totals, and the same viewer sees the same totals after signing in again. Any other token is a shared sign-in and seeds its own rows, as before.
- **Refresh rotation:** every refresh returns a new refresh token. Presenting one already rotated revokes that sign-in, including the newest tokens, as Okta and Auth0 do.
- **Request log:** `hydraServer.getRequestLog(connectionUuid)` lists the latest 200 calls and whose sign-in made each (`subject`, or null for a shared token), so tests prove a call ran as the right person.
- **Per process:** used codes, rotated refresh tokens and the log live in the backend process that saw them. Another process can miss a replayed code or refresh token, but never refuses a valid one. Tokens carry what they grant, unsigned, since Hydra is test data.

## Recipes

Use a new source for each scenario: call numbers and API calls count per source, and nothing resets them over HTTP. Assert on what the query returns and on **API calls**: `apiCalls` for the source in `GET /api/v1/ee/projects/<projectUuid>/external-connections/api-usage`, the same count the source page shows. It counts every call Lightdash sent, retries included. The first six are API tests in `hydraLiveSource.test.ts`.

| Scenario | `apiSource` beyond `connector` | Do | Expect |
| --- | --- | --- | --- |
| The gate waits out a vendor 429 | `"mockResponses": [{"call": 1, "status": 429, "retryAfterSeconds": 2}]` | 1 query | Ready; API calls 2 |
| A throttle under another status | `"mockResponses": [{"call": 1, "status": 403, "retryAfterSeconds": 1, "body": {"code": "rate_limited"}}]` | 1 query | Ready; API calls 2 |
| The gate gives up | `"mockResponses": [{"fromCall": 1, "status": 429, "retryAfterSeconds": 1}]` | 1 query | Error `Hydra rate limit reached…`; API calls 3 (the first and two retries) |
| Nothing declared to hold | `"vendorLimits": {"concurrentCalls": null, "callsPerSecond": null, "buckets": [{"id": "hour", "windowMs": 3600000, "capacity": 1}]}, "declaredLimits": null` | 2 queries | 1st ready, 2nd errors; API calls 2, as nothing is retried |
| Declared limits keep under the vendor's | `vendorLimits` with concurrency 1 and a `burst` bucket of 1 per 2500 ms; `declaredLimits` the same with 3000 ms | 2 queries at once | Both ready, the 2nd about 3 seconds later; API calls 2, as Hydra never refused |
| Paging | `"pageSize": 20` | events by `user_id`, limit 60 | 60 rows; API calls 4 (61 rows asked for, 20 a page) |
| Declared looser than the vendor | `"declaredLimits": {"concurrentCalls": 5, "callsPerSecond": null, "buckets": [{"id": "minute", "windowMs": 60000, "capacity": 100}]}` with a tight `vendorLimits` | queries past the vendor's limit | Ready after holds; API calls above the queries run |
| A slow or failing API | `latencyMs`, `errorRate`, `failAuth` | 1 query | A slow tile, a timeout past 30000 ms, `Hydra returned 500…`, or `Hydra rejected the sign-in token…` |

## Stats

`hydraServer.getStats(connectionUuid)` (in `server.ts`) returns Hydra's own view of a source: `{ calls, refused, maxInFlight, minGapMs, peakPerBucket }`. `hydraServer.reset(connectionUuid)` forgets its counts, windows, call numbers and request log; `reset()` with no source also forgets used codes and rotated refresh tokens. They are in-process only, for backend tests: reading them over HTTP would go through the gate and use up its limits, and each backend process keeps its own. Against an env, use API calls instead (see Recipes).

## What to check

- The source page (Semantic Layer → the source) counts **API calls** and **cache hits**. A dashboard reload that the cache serves adds hits, not calls.
- A chart's Query execution details shows whether the cache answered.
- With the env var off, Hydra is absent from health and the add dialog, existing Hydra sources are hidden, and their queries are refused. Their stored explores stay listed until the source is deleted.

## Automated tests

- Unit: `hydra.test.ts` (compile, the engine path, mock responses, paging, declared limits), `server.test.ts` (vendor limits, refusals, stats), `oauth.test.ts` (consent, codes, PKCE, rotation, source binding, revocation, scopes, the request log), `ExternalConnectionService/hydraFetch.test.ts` (fetch and token seams).
- API: `packages/api-tests/tests/hydraLiveSource.test.ts`, run against a preview env.
