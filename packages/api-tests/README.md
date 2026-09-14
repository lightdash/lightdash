# api-tests

Headless integration tests that exercise the Lightdash HTTP API directly — no
browser. Each test logs in, issues real requests against a running backend, and
asserts on the responses. Use this package for any test that only needs the API
and does not depend on the rendered UI.

## Running

These tests run against a **running** Lightdash instance (the `vitest.setup.ts`
hook fails fast if the server is unreachable).

```bash
# Point at your running instance (defaults to http://localhost:3000)
SITE_URL=http://localhost:3000 pnpm -F api-tests test:api

# Watch mode
SITE_URL=http://localhost:3000 pnpm -F api-tests test:api:watch

# Single file
pnpm -F api-tests test:api -- pivotQuery

# Lint / typecheck
pnpm -F api-tests lint
pnpm -F api-tests typecheck
```

## How the suite runs

Files run in parallel (`parallel` project in `vitest.config.ts`). Files that
mutate state every other file reads through (seed project timezone and embed
config, admin user timezone and attributes, org-wide flags, seeded dashboards) are listed
in `serialFiles` and run one at a time after the parallel group. Add a file
there when it changes shared state; keep it out when it only creates its own
resources.

`vitest.global-setup.ts` creates one project per credentialed remote warehouse
and kicks off its refresh before any test runs. Parity suites get it with
`useSharedWarehouseProject(client, 'snowflake')` (`helpers/shared-projects.ts`),
which waits for the refresh. Never change a shared project's settings from a
test; create a dedicated project instead.

## Layout

- `tests/**/*.test.ts` — the test files (Vitest auto-discovers them).
- `vitest.global-setup.ts` — creates the shared warehouse projects once per run.
- `helpers/api-client.ts` — `ApiClient` (cookie-aware `get`/`post`/…), the
  `Body<T>` response wrapper, and `SITE_URL`.
- `helpers/auth.ts` — `login()` and friends, returning a logged-in `ApiClient`.
- `helpers/shared-projects.ts` — `useSharedWarehouseProject()` for parity suites.
- `fixtures/` — static request payloads used by some suites.

## Writing a test

Log in once, then drive the API through the returned client. Seed data is
available via `SEED_PROJECT` and the other `SEED_*` constants from
`@lightdash/common`.

```ts
import { SEED_PROJECT } from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

describe('My feature', () => {
    let admin: ApiClient;
    beforeAll(async () => {
        admin = await login();
    });

    it('does the thing', async () => {
        const resp = await admin.get<Body<{ name: string }>>(
            `/api/v1/projects/${SEED_PROJECT.project_uuid}`,
        );
        expect(resp.status).toBe(200);
    });
});
```

Async query endpoints return a `queryUuid`; poll `GET .../query/{queryUuid}`
until `status === 'ready'`. See `tests/async-query.test.ts` and
`tests/pivotQuery.test.ts` for the pattern.
