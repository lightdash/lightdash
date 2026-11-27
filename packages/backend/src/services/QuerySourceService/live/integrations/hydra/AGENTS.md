# Hydra, the integration with seeded data

Hydra is a live integration with no vendor behind it. It answers from rows it seeds itself, so it needs no credentials and no network, and it calls nothing. Everything from the chart to the integration's `run` is the real engine: refusals, the results cache and errors.

Use it to try what live data sources do (adding a source, charts, dashboards, the cache, explores a Refresh adds) on a local instance or a Rainbow Machine env.

## Turn it on

- **Feature flag:** `live-source-hydra`, per organization, on until turned off. With it off, Hydra can't be added, queried or synced, and nothing stored changes.
- **Licence:** live data sources need a valid Enterprise licence (`LICENSE_KEY`); `GET /api/v1/health` shows `license.valid`.
- **Results cache:** cache hits need the project's results cache on: `PATCH /api/v1/projects/<projectUuid>/results-cache-config` with `{"cacheEnabled": true}`.

## Add a source

- **UI:** Semantic Layer → Live data sources → Add live data source → Hydra. Any sign-in token works. A source made in the UI takes the default settings, and saving it in the UI resets them; set others through the API.
- **API:** `POST /api/v1/ee/projects/<projectUuid>/external-connections`:

  ```json
  {
      "name": "Hydra",
      "type": "bearer_token",
      "origin": "https://hydra.invalid",
      "secret": "any",
      "apiSource": { "connector": "hydra", "rowCount": 400 },
      "allowedMethods": ["GET"],
      "allowedPathPrefixes": [],
      "allowedContentTypes": ["application/json"],
      "explorePrefix": "hydra"
  }
  ```

## Data

- Two explores, `<prefix>_events` and `<prefix>_users` (see `model.ts`).
  - **Events:** dimensions `date` (with week and month), `event_type`, `user_id`, `country` and `plan`; metrics `event_count`, `revenue` and `unique_users`. Rows cover the last 90 UTC days. A query reads the last 30 days unless its date filter says otherwise.
  - **Users:** dimensions `user_id`, `plan`, `country` and `signup_date`; metrics `user_count` and `seats`. There is no date range.
- `rowCount` events and `max(10, rowCount / 10)` users. Every source seeds the same rows, so the same query returns the same totals everywhere.
- One query returns at most 500 rows. Asking for more is refused.
- **Objects:** each entry of `objects` is an object the workspace made, with an `id` field added. A Refresh adds one explore per object, named `<prefix>_<id as a model name>`. It starts off (`onByDefault: false`), with a `record_count` metric and one dimension per field; a field marked `system` starts off. An object whose name another explore has is left out.

## Settings

Set on `apiSource`; any left out takes its default.

- `rowCount`: events seeded, 0 to 100000. Default 1000.
- `objects`: up to 10 objects, each `{ id, label, recordCount?, fields: [{ id, label, type, system? }] }` with up to 20 fields. Default none.

Any other setting is refused with a 400 that names it.

## Automated tests

- `integrations/hydra/hydra.test.ts`: compiling and running reports.
- `integrations/hydra/discoveredExplores.test.ts` and the Hydra block in `ExternalConnectionService.apiSource.test.ts`: the explores a Refresh adds, end to end.
- `packages/api-tests/tests/hydraLiveSource.test.ts`: a chart query, the results cache, the row cap and settings, over the API.
