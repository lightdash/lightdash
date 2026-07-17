# packages/e2e/cypress/cli/api/contentAsCode.cy.ts

## Classification

- Recommended runner: CLI/Node integration test (Vitest against the live backend), not Playwright
- Execution lane: `cli-node`
- Active tests: 7
- Skipped tests: 0
- Persistent mutation: Yes — creates an undeleted PAT, updates a seeded chart, creates one dashboard and three SQL charts, reconciles spaces during uploads, writes global CLI config, and leaves the final local download directory
- Shared-preview dual-run safe: No — the current Cypress spec shares server seed state, `./lightdash`, and `~/.config/lightdash/config.yaml`
- Difficulty total: 12/18 (persistent/shared state 3, browser interaction 0, environment/external dependencies 2, synchronization/flakiness 2, authentication/authorization 2, cross-file infrastructure 3)
- Coordination keys: `cli-node-runner`
- Analysis status: coordination-required

The file has no rendered-UI behavior: every assertion is on a process result or filesystem output (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:24-260`). The E2E package explicitly sends browserless coverage elsewhere (`packages/e2e/CLAUDE.md:7-15`), while the migration control plane defines `cli-node` for browserless CLI process coverage (`packages/e2e/migration/playwright/README.md:28-34`). A runner/build/CI contract is not established in the inspected CLI or API-test configuration, and the manifest has five separately queued CLI specs (`packages/e2e/migration/playwright/manifest.json:10-36`), so this should be coordinated once rather than invented independently in each port.

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `should download charts as code using CLI` | Active | Runs an unfiltered download, requires exit 0, and verifies both chart and dashboard directories contain files (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:24-38`). | Recreates `./lightdash`; the download also writes `.lightdash-metadata.json` (`packages/cli/src/handlers/download.ts:1859-1879`). No intended server write. | Shell pipeline `ls … \| wc -l`; exercises charts, SQL charts, dashboards, and spaces through one CLI command. | CLI/Node integration |
| `should download charts and dashboards using slugs` | Active | Downloads chart slug `what-s-the-average-spend-per-customer` and dashboard slug `jaffle-dashboard`; expects five chart files and one dashboard (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:41-56`). | Recreates local download files only. | The dashboard's linked charts are implicitly added. The known dashboard has five saved-chart tiles (`packages/api-tests/fixtures/dashboardAsCode.yml:57-76`, `packages/api-tests/fixtures/dashboardAsCode.yml:93-125`), and CLI dependency expansion is implemented at `packages/cli/src/handlers/download.ts:1584-1632`. | CLI/Node integration |
| `should upload modified charts as code using CLI` | Active | Downloads all content, edits the seeded chart description, backdates chart metadata by one minute, uploads, and requires `charts updated: 1` plus exit 0 (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:59-89`). | Permanently updates seeded chart `what-s-the-average-spend-per-customer`; rewrites local YAML/JSON; unfiltered upload also reconciles downloaded spaces (`packages/cli/src/handlers/download.ts:2348-2356`, `packages/cli/src/handlers/download.ts:2410-2426`). No restore. | GNU-style `sed -i`; inline `node -e` JSON edit; relies on the CLI's 30-second mtime threshold (`packages/cli/src/handlers/download.ts:414-433`). | CLI/Node integration using a uniquely created chart, followed by cleanup; do not update the seed chart |
| `should create new dashboard if we change the slug using CLI` | Active | Downloads all content, changes the seed dashboard slug to a timestamped slug, uploads, and requires `dashboards created: 1` (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:92-111`). | Creates an undeleted dashboard; uploads/reconciles local space definitions. | Uses `Date.now()` in a `sed` replacement. The new dashboard keeps the seed dashboard's name, so repeated runs create duplicate names despite different slugs. | CLI/Node integration with UUID-based unique slug/name and tracked cleanup |
| `should create a new SQL chart using CLI upload` | Active | Downloads to create directories, writes a `.sql.yml` file, uploads, and requires `charts created: 1` (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:114-150`). | Creates an undeleted SQL chart and local file; reconciles spaces. | Multiline YAML is passed through shell `echo`; SQL references local seeded Postgres objects but is not executed (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:122-139`). Fixed chart name causes duplicate names across runs. | CLI/Node integration with temp cwd and tracked cleanup |
| `should download SQL chart by slug using CLI` | Active | Creates a timestamped SQL chart through upload, deletes the local tree, downloads only that slug, and verifies the `.sql.yml` filename exists (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:153-203`). | Creates an undeleted SQL chart; deletes/recreates local files. | Tests SQL-chart routing and `.sql.yml` extension; uses shell `echo`, `rm -rf`, and `ls`. | CLI/Node integration with temp cwd and tracked cleanup |
| `should update an existing SQL chart using CLI upload` | Active | Creates a SQL chart, edits description and `downloadedAt`, uploads again, and requires one create then one update (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:206-260`). | Creates and updates an undeleted SQL chart; edits local YAML; reconciles spaces on both uploads. | Chained `sed -i` commands; writes an unquoted ISO timestamp into YAML; relies on mtime detection. | CLI/Node integration with temp cwd and tracked cleanup |

There are no `it.skip`, `describe.skip`, or inherited skipped suites; the outer suite is a normal `describe` (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:1`). There are no skip comments to resolve. The comments saying “Requires download to be run first” are not cross-test prerequisites: the relevant tests invoke their own download (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:59-63`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:92-96`), and the slug-filtered test itself performs the download (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:41-47`).

## Cypress command expansion

### `cy.login()`

Called once in the suite `before` hook (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:5-7`). Its implementation:

1. Creates/reuses a Cypress session keyed by the seeded org-1 admin email (`packages/e2e/cypress/support/commands.ts:152-155`).
2. On cache miss, `POST api/v1/login` with `SEED_ORG_1_ADMIN_EMAIL` and `SEED_ORG_1_ADMIN_PASSWORD`, asserting HTTP 200 (`packages/e2e/cypress/support/commands.ts:156-165`). The seed is `demo@lightdash.com` / `demo_password!` (`packages/common/src/index.ts:474-480`).
3. Validates reused sessions with `GET api/v1/user`, also requiring 200 (`packages/e2e/cypress/support/commands.ts:167-170`).

No browser navigation is involved. The session cookie is only needed by the next custom command.

### `cy.getApiToken()`

Called after login (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:7-17`). It:

1. Builds `{ description: 'e2e', autoGenerated: true, expiresAt: null }` (`packages/e2e/cypress/support/commands.ts:375-380`).
2. `POST`s `api/v1/user/me/personal-access-tokens`, expects 200, and yields `resp.body.results.token` with Cypress value logging disabled (`packages/e2e/cypress/support/commands.ts:381-389`).
3. Does not expose or delete the returned PAT UUID. The backend has a deletion route, but this spec never calls it (`packages/backend/src/controllers/userController.ts:679-698`).

The token is interpolated into a shell command (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:8`), so `{ log: false }` on the wrapped value does not guarantee the full `cy.exec` command is hidden from Cypress output/process listings.

### Built-in commands relevant to behavior

- `cy.exec`: all CLI and Unix filesystem operations run as child processes. The login invocation alone opts out of automatic failure on nonzero exit and injects `NODE_ENV=development` plus `CI=true` (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:8-16`). The other invocations use normal fail-on-nonzero behavior, making most later explicit exit-code assertions redundant.
- `cy.wrap`: only adapts process values to Cypress assertions; it adds no application behavior.
- No aliases, intercepts, fixtures, viewport operations, or DOM commands are used.

The token login itself performs `GET /api/v1/user` (`packages/cli/src/handlers/login.ts:76-97`), stores server URL/API key in CLI config, prints success, and because `CI=true` makes the CLI noninteractive, selects the first organization project (`packages/cli/src/handlers/login.ts:287-318`). `setFirstProject` calls `GET /api/v1/org/projects` and blindly stores index 0 (`packages/cli/src/handlers/setProject.ts:101-119`).

## State, seed, and environment assumptions

- **Role and permissions:** all operations use the seeded org-1 admin. Upload checks derive content-as-code permissions from `GET /api/v1/user` plus `GET /api/v1/projects/{projectUuid}` (`packages/cli/src/handlers/dbt/apiClient.ts:112-140`). The tests do not exercise editor/viewer denial behavior.
- **Project selection:** no project UUID is supplied. The login hook assumes the first result from `/api/v1/org/projects` is the seeded Jaffle Shop project. Its canonical UUID/name are `3675b69e-8324-4110-bdca-059031aa8da3` / `Jaffle shop` (`packages/common/src/index.ts:550-558`). Ordering changes or an extra project can redirect every test to the wrong project.
- **Seed content:** the suite requires chart slug `what-s-the-average-spend-per-customer`, dashboard slug `jaffle-dashboard`, and space slug `jaffle-shop` (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:44`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:64-66`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:97`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:135`). The dashboard fixture confirms the dashboard and space slugs (`packages/api-tests/fixtures/dashboardAsCode.yml:149-150`).
- **Count assumption:** filtered dashboard download must continue to resolve exactly five distinct linked charts. The explicitly selected chart is already one of those five, so deduplication yields five, not six (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:43-55`; dependency extraction at `packages/cli/src/handlers/download.ts:700-712`).
- **CLI installation/build:** `lightdash` must be on `PATH`. The source never builds it. Repository development docs instead prescribe `pnpm cli-build` and direct execution of `packages/cli/dist/index.js` (`packages/cli/CLAUDE.md:24-30`, `packages/cli/CLAUDE.md:54-59`).
- **Working directory:** default content path is `path.join(process.cwd(), 'lightdash')` (`packages/cli/src/handlers/contentAsCodePaths.ts:3-10`). All tests share the literal relative path `./lightdash`, deleted before each test (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:2`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:19-22`). The last test's directory is not removed afterward.
- **Global CLI state:** login writes API key, URL, project, user, and preferences to `~/.config/lightdash/config.yaml` (`packages/cli/src/config.ts:8-38`, `packages/cli/src/config.ts:87-96`). It is not restored. Concurrent CLI specs can overwrite the same file.
- **Operating system/tools:** requires a POSIX shell plus `rm`, `ls`, `wc`, GNU-compatible `sed -i`, `node`, and a resolvable `lightdash` binary. The bare `sed -i` form is not portable to default BSD/macOS `sed`.
- **Backend/storage:** requires a live Lightdash backend, Postgres state seeded with Jaffle content, and normal content-as-code APIs. SQL strings name `"postgres"."jaffle"` tables (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:126`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:160`), but this suite only stores/downloads SQL and does not execute warehouse queries.
- **CLI API traffic:** each download/upload checks `/api/v1/health?skipMigrationCheck=true` (`packages/cli/src/handlers/dbt/apiClient.ts:331-336`). Downloads fetch project details and content from `/code/charts`, `/code/dashboards`, and `/code/sqlCharts` (`packages/cli/src/handlers/download.ts:672-696`, `packages/cli/src/handlers/download.ts:1442-1448`); unfiltered downloads also fetch `/code/spaces` (`packages/cli/src/handlers/spacesAsCode.ts:746-765`). Uploads `POST` changed items to the corresponding slug endpoint (`packages/cli/src/handlers/download.ts:1976-1995`) and unfiltered uploads may `POST /code/spaces` for every downloaded space (`packages/cli/src/handlers/spacesAsCode.ts:868-895`).
- **Response assumptions:** list responses must contain pagination fields and `missingIds` (`packages/cli/src/handlers/download.ts:731-769`); upload responses must contain actions that aggregate into exact stdout summaries. The source asserts summary text rather than fetching the created/updated record (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:86-89`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:108-111`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:147-150`).
- **External service:** CLI login/download/upload analytics await requests to `https://analytics.lightdash.com/v1/track` and login also identifies (`packages/cli/src/analytics/analytics.ts:578-635`). Failures are swallowed, so analytics availability is not semantically required, but an outbound attempt and possible network delay remain. Cypress browser `blockHosts` does not apply to Node child processes.

Persistent collision risks are high:

- Every run creates a PAT named `e2e` with no expiry and no cleanup.
- Test 3 updates a shared seed chart.
- Test 4 creates a dashboard with a timestamped slug but duplicate `Jaffle dashboard` name.
- Tests 5-7 create SQL charts with timestamped slugs but fixed names. `Date.now()` lowers collision probability but is not globally unique across processes.
- Run-mode retries default to two (`packages/e2e/cypress.config.ts:12-21`), so a failed assertion can repeat create/update side effects.
- Unfiltered upload reconciles shared spaces even when the assertion concerns only a chart/dashboard.
- Concurrent Cypress/Playwright execution in the same worktree can delete or rewrite the same `lightdash` directory, and concurrent CLI suites can replace the same global config.

## Synchronization and timeout requirements

- Cypress command chaining serializes every process within a test; there are no floating commands or explicit sleeps.
- The update signal is filesystem mtime, not API polling. CLI marks a file changed only when file mtime differs from metadata `downloadedAt` by more than 30 seconds (`packages/cli/src/handlers/download.ts:414-433`). The source backdates by 60 seconds (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:68-81`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:247-251`), leaving only a 30-second margin against clock/mtime behavior.
- No `execTimeout` is configured; the repository only sets `defaultCommandTimeout: 10000` (`packages/e2e/cypress.config.ts:15-21`). Thus `cy.exec` relies on Cypress's default process timeout. The port should use an explicit per-process timeout at least as large as the API-test runner's existing 120-second test timeout (`packages/api-tests/vitest.config.ts:4-8`) and report stdout/stderr on failure.
- Exact count assertions happen only after the CLI process exits, so no filesystem polling is needed. Node `readdir`/`access` after process completion is sufficient.
- Keep tests sequential within the file. They are logically self-contained, but current shared global config, local path, and server mutations make concurrency unsafe.
- Do not add arbitrary waits. For update tests, set metadata far enough in the past and then verify the server result, rather than sleeping for mtime to cross the threshold.
- Analytics is awaited by CLI commands (`packages/cli/src/handlers/download.ts:1885-1897`, `packages/cli/src/handlers/download.ts:2964-2978`); the coordinated runner should decide whether tests need a supported analytics-disable mechanism or a bounded process timeout.

## Locator and strictness risks

There are no browser locators. Equivalent strictness risks are filesystem and resource identification:

- Exact filenames depend on slug sanitization and extension: regular chart `.yml`, dashboard `.yml`, SQL chart `.sql.yml` (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:64`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:97`, `packages/e2e/cypress/cli/api/contentAsCode.cy.ts:198-203`). Assert exact paths with Node APIs.
- `ls | wc -l` counts every directory entry, not only valid YAML resources. Replace it with filtered `readdir` assertions so metadata, hidden files, or future companion files cannot create false positives.
- Slugs are not unique identifiers by repository contract. Use generated UUID-backed slugs for created content and capture the returned resource UUID for cleanup; do not find cleanup targets solely by a potentially duplicated fixed name.
- `sed 's/description: .*/…/'` and `sed 's/slug: .*/…/'` replace every matching line and assume flat YAML formatting. Parse and write YAML in Node instead of text substitution.
- The metadata JSON edit assumes `m.charts[chartSlug]` exists (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:80-84`). The port must parse in `try/catch`, assert the expected object shape, then update it.

## Nonstandard or surprising behavior

- Despite living under Cypress, the suite never opens a browser page. Authentication is HTTP-only and all subject behavior is child-process/filesystem work.
- `lightdash download -c X -d Y` downloads dashboard chart dependencies, explaining the otherwise surprising five-chart assertion (`packages/cli/src/handlers/download.ts:1584-1632`).
- Download timestamps are intentionally stripped from normal downloaded YAML and written to `.lightdash-metadata.json` (`packages/cli/src/handlers/download.ts:1859-1872`). New hand-written SQL files instead carry their own `downloadedAt` fallback, which `processYamlItem` accepts (`packages/cli/src/handlers/download.ts:414-432`).
- The login assertion checks stderr, not stdout (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:14-16`), matching the CLI's `console.error('Login successful')` (`packages/cli/src/handlers/login.ts:306-310`).
- The login command alone uses `failOnNonZeroExit: false`; its success-text assertion is therefore the actual completion check. Other commands would already fail before their exit-code assertions.
- Download/upload handlers catch several operational errors to print analytics/error output (`packages/cli/src/handlers/download.ts:1898-1910`, `packages/cli/src/handlers/download.ts:2978-2997`). Therefore exit 0 alone is not a sufficient oracle; retain positive file/server-state and summary assertions.
- `beforeEach` uses destructive `rm -rf` on a fixed relative directory (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:19-22`). The port should use OS-created temp directories and scoped recursive cleanup.
- There are no downloads through a browser, uploads through an `<input>`, popups, iframes, clipboard, canvas/SVG, Monaco, virtualization, drag-and-drop, timezone-sensitive formatting, or browser APIs.

## Coordination requirements

Coordinate `cli-node-runner` before porting:

1. Choose the canonical location and CI command for live-server CLI integration tests. `packages/api-tests` already supplies sequential live-server Vitest, a 120-second timeout, and a health preflight (`packages/api-tests/vitest.config.ts:3-10`, `packages/api-tests/vitest.setup.ts:1-10`), but its package instructions currently describe direct HTTP tests (`packages/api-tests/CLAUDE.md:6-16`). `packages/cli` supplies the binary/build but its discovered tests are unit-style. This ownership decision must be explicit.
2. Define how the built CLI is invoked. Prefer `process.execPath` plus an absolute `packages/cli/dist/index.js` path over relying on a globally linked `lightdash` executable.
3. Define isolated `HOME` and cwd creation/cleanup, explicit `SITE_URL`, `CI`, and project selection, and a bounded child-process timeout. The CLI reads API key/URL/project from global config or `LIGHTDASH_*` environment variables (`packages/cli/src/config.ts:66-83`).
4. Define a cleanup contract for PATs and created content. Existing API-test infrastructure already provides globally unique names and UUID-based chart/dashboard/space cleanup (`packages/api-tests/helpers/test-isolation.ts:7-61`).
5. Decide whether the shared harness suppresses CLI analytics through a supported mechanism. Do not add a test-only product workaround without confirming the intended contract.

A shared process helper should only be added if the coordinator confirms at least two CLI ports need the same API. This file alone can keep `runCli`, temp-directory, and YAML-edit helpers local to its target file.

## Exact port plan

Pending the `cli-node-runner` contract, target `packages/api-tests/tests/contentAsCodeCli.test.ts` (or the coordinator's exact canonical CLI-node path) and preserve all seven active behaviors:

1. Import Vitest, `SEED_PAT`/`SEED_PROJECT`, `SITE_URL`, `ApiClient`/`login`, and existing test-isolation utilities. Resolve `packages/cli/dist/index.js` absolutely.
2. Add a file-local `runCli(args, cwd)` using promisified `execFile(process.execPath, [cliEntry, ...args])`; never invoke a shell. Give it an explicit timeout and include stdout/stderr in failures.
3. In `beforeAll`, create an isolated temporary `HOME`, authenticate the CLI with `login SITE_URL --token SEED_PAT.token --project SEED_PROJECT.project_uuid`, and assert the stderr success text. This preserves token-login coverage without creating another persistent PAT or selecting “first project.” Keep `CI=true` and `NODE_ENV=development` explicit for every child process.
4. In `beforeEach`, create a unique temporary cwd. In `afterEach`, recursively remove only that cwd. In `afterAll`, remove the isolated home and clean every tracked server resource by UUID. Use `describe.sequential` even if the destination currently runs files serially.
5. Port the unfiltered download assertion with Node `readdir`, filtering regular chart YAML, SQL-chart YAML, and dashboard YAML; assert nonempty sets rather than shell counts.
6. Port filtered download and assert exactly five chart resource files plus one dashboard file, including the selected regular-chart path. Keep this as CLI coverage because direct API coverage already checks chart-by-slug behavior (`packages/api-tests/tests/contentAsCode.test.ts:61-74`) but does not check CLI dependency expansion/filesystem output.
7. For regular-chart update, create a unique chart through the API from the existing chart-as-code fixture, track its returned UUID, CLI-download that slug, edit YAML and metadata with Node parsing, upload, assert `charts updated: 1`, then GET it and assert the description. Do not mutate the seed chart.
8. For dashboard creation, download the seed dashboard, assign a random UUID-backed slug and unique name through YAML parsing, upload, assert `dashboards created: 1`, query/capture its UUID, and track cleanup.
9. For SQL create, download into the temp cwd, write the YAML with `fs.writeFile`, upload, assert `charts created: 1`, query the created chart by unique slug, and track its UUID.
10. For SQL download-by-slug, create through CLI, remove only the temp cwd's `lightdash` subdirectory, download that slug, and assert exact `.sql.yml` access.
11. For SQL update, create through CLI, parse/rewrite description and `downloadedAt`, upload again, assert `charts updated: 1`, and verify the server-side description before cleanup.
12. Use `randomUUID()`-derived slugs and unique names instead of `Date.now()`. Avoid shared fixtures/helpers unless the coordinator lands them first. Do not add Playwright config or browser fixtures.

## Verification plan

Requires the live dev server at `SITE_URL` (default `http://localhost:3000`) and the seeded Jaffle project.

```bash
pnpm cli-build
pnpm -F api-tests lint
pnpm -F api-tests format
pnpm -F api-tests typecheck
pnpm -F api-tests test:api -- tests/contentAsCodeCli.test.ts
for i in 1 2 3; do pnpm -F api-tests test:api -- tests/contentAsCodeCli.test.ts || exit 1; done
pnpm -F api-tests test:api
```

If coordination chooses a dedicated CLI-node package/path, replace the `api-tests` commands with the coordinator-recorded equivalents, but retain: CLI build, destination lint/format/typecheck, focused run, three repeated focused runs because of mtime/process behavior, and full destination-runner suite.

After focused execution, independently confirm cleanup: no resources with the generated test prefixes remain in the seed project, no PAT was created, the seeded chart description is unchanged, and both temporary cwd and temporary `HOME` are gone.

## Open questions

1. **Blocking:** should `cli-node` live under `packages/api-tests`, `packages/cli`, or a dedicated integration package, and what command runs it in CI? Resolve under `cli-node-runner` before assigning `TARGET_FILE`.
2. Is token login part of the intended coverage or merely setup? The hook explicitly asserts `Login successful` (`packages/e2e/cypress/cli/api/contentAsCode.cy.ts:8-16`), so this analysis recommends preserving it in isolated `HOME` unless the coordinator documents it as duplicate coverage.
3. Is the exact five-chart dependency count a stable contract or incidental seed shape? Current source and fixture make it intentional enough to preserve, but a product-owner clarification would allow a less brittle assertion on the five known slugs.
4. Is there a supported CLI analytics opt-out for tests? None was found in the inspected analytics implementation; outbound failures are swallowed (`packages/cli/src/analytics/analytics.ts:578-635`).
5. Should the existing direct API content-as-code tests be updated separately to clean their own created SQL charts? They currently create timestamped SQL charts without shown cleanup (`packages/api-tests/tests/contentAsCode.test.ts:288-318`, `packages/api-tests/tests/contentAsCode.test.ts:335-345`). That is pre-existing debt outside this assignment and must not be folded into this port.

## Port history

Not started.
