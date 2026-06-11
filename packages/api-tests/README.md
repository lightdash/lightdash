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

## Layout

- `tests/**/*.test.ts` — the test files (Vitest auto-discovers them).
- `helpers/api-client.ts` — `ApiClient` (cookie-aware `get`/`post`/…), the
  `Body<T>` response wrapper, and `SITE_URL`.
- `helpers/auth.ts` — `login()` and friends, returning a logged-in `ApiClient`.
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
