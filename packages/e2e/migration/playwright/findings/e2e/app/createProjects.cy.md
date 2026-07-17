# packages/e2e/cypress/e2e/app/createProjects.cy.ts

## Classification

Recommended runner: Playwright for project-creation UI; API tests for independently extracted query/custom-dimension checks
Execution lane: mutating-isolated
Active tests: 3
Skipped tests: 6
Persistent mutation: Yes — creates and compiles organization projects, patches table configuration, and can create a saved chart
Shared-preview dual-run safe: No — fixed project names plus delete-by-name setup can delete or duplicate another run's projects
Difficulty total: 16/18 (persistent/shared state 3, browser interaction complexity 2, environment/external dependencies 3, synchronization/flakiness 3, authentication/authorization 2, cross-file infrastructure 3)
Coordination keys: mutating-project-isolation, playwright-warehouse-secrets
Analysis status: coordination-required

The enclosing `describe` is active (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:467`), so only the six explicit `it.skip` declarations are skipped.

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `I can create a custom dimension chart from api` | Skipped (`it.skip`, lines 481-484) | POSTs a saved cartesian chart with a bin custom dimension into `SEED_PROJECT` and checks only HTTP 200 (lines 380-455). | Adds a fixed-name saved chart to seed project `3675b69e-8324-4110-bdca-059031aa8da3` (`packages/common/src/index.ts:550-557`); no cleanup. | API-only; comment says it is a manually enableable utility rather than explaining a product skip (lines 481-483). | `packages/api-tests/tests/customDimensions.test.ts`, with self-contained creation and UUID cleanup, or remove if duplicate utility coverage. Do not port as a browser test. |
| `I can view an existing custom dimension chart` | Skipped (`it.skip`, lines 485-488) | Opens the seed project's saved-content page, clicks a fixed chart title prefix, and expects bin labels `0 - 6` and `6 - 12` (lines 458-464). | None itself, but requires a persistent chart that the preceding skipped test can create. | Hidden ordering/seed dependency; chart rendering may involve ECharts, but this assertion only searches rendered text. | Playwright only if the rendering behavior is required; create the chart through API in test setup and delete by UUID. Otherwise clarify/remove this manual check. |
| `Should be able to create new project from settings` | Skipped (`it.skip`, lines 489-502) | Navigates from the settings menu to Projects/Create new, selects PostgreSQL, checks `/createProject/cli`, then clicks `Manually`. | No completed project creation. | The final click has no assertion; source selectors at lines 497 and 501 are malformed CSS (`[role="button"` lacks `]`). | Playwright after clarifying the expected final state; use role locators. Remove if route navigation is already sufficiently covered. |
| `Should create a Postgres project` | Active (lines 504-524) | Completes PostgreSQL/manual/local-dbt form, compiles and saves the project, then verifies quote escaping and 22 timestamp interval values through query APIs (lines 62-80, 189-250, 252-275, 319-376, 504-523). | Creates a compiled project named `Jaffle PostgreSQL test`; PATCHes table configuration on Save; query execution can create jobs/results/cache. No teardown. | Local/external PostgreSQL credentials, Mantine selects, compile-job polling up to about three minutes, fixed 1-second wait, API postconditions. | `packages/e2e/playwright/app/createProjects.spec.ts` for UI creation. Keep API postconditions initially because they validate the just-created UUID; extract to `packages/api-tests/tests/warehouseQuerySemantics.test.ts` once API project setup is coordinated. |
| `Should create a Redshift project` | Skipped (`it.skip`, lines 525-547) | Uses the PostgreSQL instance through the Redshift form, then runs quote/time/percentile checks and creates/views a custom-dimension chart. | Would create `Jaffle Redshift test` and a saved chart; no teardown. | Comment explains Redshift's PostgreSQL compatibility but not why the test is skipped (lines 526-528). | Clarification required. If connection UI is supported, Playwright with isolated project cleanup; move query and chart API assertions to API tests. |
| `Should create a Bigquery project` | Active (lines 548-597) | Completes BigQuery/manual/local-dbt form, force-uploads a service-account JSON file, compiles/saves, then checks quote escaping and BigQuery-specific timestamp values (lines 83-106, 548-586). | Creates a compiled project named `Jaffle Bigquery test`; PATCHes table configuration; executes queries. No teardown. | Secret file upload; fixed GCP project/location/dataset; authentication-mode selection is commented out, so the test assumes file upload is the default (lines 92-101). | `packages/e2e/playwright/app/createProjects.spec.ts`; secret provisioning must land first. API-only result checks can later move to `warehouseQuerySemantics.test.ts`. |
| `Should create a Trino project` | Skipped (`it.skip`, lines 598-640) | Would configure HTTPS Trino, compile/save, run quote/time/percentile checks, and create/view a custom-dimension chart. | Would create `Jaffle Trino test` and a saved chart; no teardown. | Explicitly skipped because there is no Trino staging environment (line 598); expected interval array has only 19 entries for a 22-dimension query, so trailing values are not asserted (lines 612-635). | Keep out until a staging service exists; then Playwright for UI plus API tests for query semantics. |
| `Should create a Databricks project` | Skipped (`it.skip`, lines 641-682) | Would configure Databricks PAT credentials, compile/save, run quote/time/percentile checks, and create/view a custom-dimension chart. | Would create `Jaffle Databricks test` and a saved chart; no teardown. | Requires three secret env values; no skip rationale. Its 19 expected values also leave three queried fields unchecked (lines 654-677). | Clarification required; Playwright only after credentials/environment and intended status are confirmed, with API assertions split when practical. |
| `Should create a Snowflake project` | Active (lines 684-735) | Completes Snowflake password/manual/local-dbt form, compiles/saves, then checks quote escaping and Snowflake-specific timestamp values (lines 146-166, 684-722). | Creates a compiled project named `Jaffle Snowflake test`; PATCHes table configuration; executes queries. No teardown. | External Snowflake secrets, Mantine authentication select, exact timezone/week formatting, and a literal database name `SNOWFLAKE_DATABASE_STAGING` (lines 41-49). | `packages/e2e/playwright/app/createProjects.spec.ts`; CI secret/TZ provisioning and isolated cleanup are prerequisites. |

## Cypress command expansion

- `cy.login()` is called once in `before` and before every test (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:468-479`). It uses `cy.session` keyed by the seed admin email, POSTs `api/v1/login` with `SEED_ORG_1_ADMIN_EMAIL/PASSWORD`, requires 200, and validates restored sessions with GET `api/v1/user` requiring 200 (`packages/e2e/cypress/support/commands.ts:152-172`). The account is organization admin David Attenborough, `demo@lightdash.com` (`packages/common/src/index.ts:465-481`). Playwright already creates equivalent admin storage state through the same two endpoints (`packages/e2e/playwright/auth.setup.ts:10-23`) and applies it to Firefox (`packages/e2e/playwright.config.ts:33-40`); no new auth helper is needed.
- `cy.deleteProjectsByName(projectNames)` receives all six fixed warehouse names from `warehouseConfig` (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:470-474`). It GETs `api/v1/org/projects`, requires 200, then DELETEs every matching `projectUuid` through `api/v1/org/projects/:uuid`, requiring 200 for each (`packages/e2e/cypress/support/commands.ts:391-410`). This is destructive organization-wide name matching, not ownership-aware cleanup.
- `cy.selectMantine(inputName, optionLabel)` finds the hidden named input, traverses to its previous sibling and descendant input, clicks it, then clicks the accessible option by exact name (`packages/e2e/cypress/support/commands.ts:143-150`). It is used for PostgreSQL SSL mode/local dbt (lines 75, 78), BigQuery local dbt (line 104), Trino local dbt (line 122), Databricks local dbt (line 141), and Snowflake authentication/local dbt (lines 154, 164). A local Playwright helper is justified inside the target file because all three active warehouse flows reuse it; no cross-file helper is justified by this spec alone.
- Testing Library commands (`findByText`, `findByRole`, `findAllByTestId`) are plugin queries rather than project custom commands. Their semantics should map to Playwright `getByText`, `getByRole`, and `getByTestId`, with exact/scoped matching where needed.

## State, seed, and environment assumptions

- The suite assumes a seeded, setup-complete organization admin with project-create/delete permission. The UI later asserts `Welcome, David` (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:200-203`), matching the seed first name (`packages/common/src/index.ts:465-472`). Cypress restores the cookie session before each test; Playwright's existing `.auth/admin.json` is the equivalent required browser storage state (`packages/e2e/playwright/auth.setup.ts:10-23`).
- Cleanup is suite-level and runs only before tests, never after them (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:468-479`). The three active projects remain persistent. A test retry after project creation can leave duplicate fixed names, and a concurrent Cypress/Playwright suite can delete the other's matching project.
- Active names are fixed: `Jaffle PostgreSQL test`, `Jaffle Bigquery test`, and `Jaffle Snowflake test` (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:8-49`). Names are not used to recover the newly created UUID; the source extracts it from the resulting URL (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:205-209`). The port should use unique run-scoped names and exact UUID teardown rather than retain destructive delete-by-name behavior.
- PostgreSQL uses `PGHOST`, `PGUSER`, and `PGPASSWORD`, falling back to `db-dev`, `postgres`, and `password`; it assumes database `postgres`, port `5432`, schema `jaffle`, dbt local server, and target `test` (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:9-16,62-80`). `db-dev` is environment-specific and is not a safe default for the Playwright preview container.
- BigQuery assumes GCP project `lightdash-database-staging`, location `europe-west1`, dataset `e2e_jaffle_shop`, and `cypress/fixtures/credentials.json` (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:27-32,83-106`). The credential is not a checked-in fixture; Cypress CI creates it from `GCP_CREDENTIALS` (`.github/workflows/pr.yml:556-562`). A Playwright-owned generated path must be coordinated; the secret itself must never be committed.
- Snowflake requires `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, and `SNOWFLAKE_PASSWORD`, role `SYSADMIN`, warehouse `TESTING`, schema `jaffle`, and a database literally named `SNOWFLAKE_DATABASE_STAGING` (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:41-49,146-166`). Confirm whether the database was intended to be an environment lookup.
- Skipped Databricks needs `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, and `DATABRICKS_PATH` (lines 34-39); skipped Trino needs `TRINO_HOST/PORT/USER/PASSWORD` (lines 51-58). Trino has no staging environment according to line 598.
- Cypress app CI supplies warehouse secrets and forces both `TZ` and `CYPRESS_TZ` to UTC (`.github/workflows/pr.yml:570-586`). Current Playwright CI supplies only `PLAYWRIGHT_BASE_URL` (`.github/workflows/pr.yml:519-524`), so active warehouse tests cannot simply be added to that job.
- Query fixtures assume compiled explores `customers`, `events`, and, for skipped custom-dimension coverage, `payments`; fields and exact rows are hardcoded in lines 212-376 and 380-452. Filter group IDs at lines 223 and 226 are request-node IDs, not seed entity UUIDs.
- Skipped custom-dimension tests reference `SEED_PROJECT.project_uuid` (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:481-488`), whose stable UUID/name are defined at `packages/common/src/index.ts:550-557`. The viewer test must not rely on the skipped creator running first.

### HTTP and response assumptions

- UI submission POSTs `/api/v1/org/projects/precompiled` and receives a `jobUuid` (`packages/frontend/src/hooks/useProject.ts:27-32`; the `/api/v1` prefix is assembled at `packages/frontend/src/api.ts:155-167`). The app GET-polls `/api/v1/jobs/:jobUuid` every 500 ms until DONE or ERROR (`packages/frontend/src/hooks/useRefreshServer.ts:92-118`). On DONE with `jobResults.projectUuid`, it navigates to `/createProjectSettings/:projectUuid` (`packages/frontend/src/components/ProjectConnection/CreateProjectconnection.tsx:101-114`).
- Saving the model selection PATCHes `/api/v1/projects/:uuid/tablesConfiguration` (`packages/frontend/src/hooks/useProjectTablesConfiguration.ts:14-22`) and then navigates to `/projects/:uuid/home` (`packages/frontend/src/components/Settings/CreateProjectSettings.tsx:19-23`).
- Quote escaping POSTs `api/v1/projects/:uuid/explores/customers/runQuery`, requires 200, requires `results.rows[0]`, and expects raw first name exactly `Quo'te` (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:212-249`).
- Time intervals POST the `events` query with 22 dimensions, require 200 and a first row, then compare `Object.values(row)` in property insertion order against warehouse-specific formatted strings (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:319-375`). This assumes response key ordering matches requested dimension ordering.
- The skipped percentile helper similarly assumes a first row and `Object.values` ordering (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:279-317`). The skipped saved-chart creator requires only HTTP 200 (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:380-455`).

## Synchronization and timeout requirements

- `testCompile` installs a GET `**/api/v1/jobs/*` intercept before clicking submit (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:189-193`). `waitForCompileJob` recursively consumes intercepted browser polls, handles DONE and ERROR, and permits attempts through `attempt >= 360` (`lines 169-187`). At a 500 ms app interval this is about three minutes, while each missing intercepted request individually has a 30-second wait timeout.
- After terminal status, the source separately waits up to 30 seconds for `/createProjectSettings`, clicks Save, and waits up to 30 seconds for `/home` (`lines 195-203`). The port should capture the create response/job UUID, poll that exact job with a bounded 180-second `expect.poll`, include `job.steps` on ERROR, and then assert the two exact URL transitions. Do not wait on any wildcard job response because unrelated page jobs can race.
- Replace the unconditional `cy.wait(1000)` before URL parsing (`line 204`) with waiting for the table-configuration PATCH and exact `/projects/<uuid>/home` URL. Extract UUID with a pathname regex/URL parser, not `url.split('/')[4]` (`lines 205-209`).
- Query API calls are awaited serially after each project's UI save. Preserve serial execution: source tests are ordered PostgreSQL, BigQuery, Snowflake and the current Playwright config already uses one worker and `fullyParallel: false` (`packages/e2e/playwright.config.ts:9-13`). There is no data dependency among the three active tests, but external warehouse load and shared organization mutations make parallelization unsafe until isolation is proven.
- Default Playwright action/expect/navigation timeouts are 10/10/30 seconds (`packages/e2e/playwright.config.ts:11,20-23`); only compile polling needs the explicit longer bound. Do not globally raise timeouts.

## Locator and strictness risks

- Every warehouse selection/manual click uses malformed CSS, for example `cy.get('[role="button"').contains('PostgreSQL')` (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:507-509`; repeated at lines 551-553 and 687-689). This must not be transliterated. Use `page.getByRole('button', { name: 'PostgreSQL', exact: true })` and exact equivalents.
- `cy.findByText('Test & deploy project')` targets a button by text (`line 192`); use `getByRole('button', { name: 'Test & deploy project', exact: true })` to avoid strict-mode text collisions.
- `cy.contains('button', 'Save changes')` (`line 199`) can collide with other page buttons if UI grows. Scope to `form[name="project_table_configuration"]`, whose application form name is stable (`packages/frontend/src/components/ProjectTablesConfiguration/ProjectTablesConfiguration.tsx:185-191`).
- Mantine select implementation depends on hidden-input sibling DOM (`packages/e2e/cypress/support/commands.ts:143-150`). Prefer an accessible label/combobox when available; if the form lacks one, keep the named-input traversal in a target-file-local helper and select the exact role option. Playwright strictness should expose duplicate options rather than choosing the first.
- `cy.contains(/selected \d+ models/)`, `cy.contains('Welcome, David')`, and generic `findByText` calls (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:196-203`) are global. Use scoped heading/text assertions and exact URL state. The success heading text includes an emoji in application code (`packages/frontend/src/components/Settings/CreateProjectSettings.tsx:29-31`), so a stable substring/regex is appropriate.
- Inputs already have intentional `name` attributes (`lines 65-80,86-106,149-166`) and can remain CSS locators if accessible labels are unavailable. Password/token/key values must not be logged or embedded in failure messages.
- The skipped chart viewer clicks a title prefix (`lines 461-464`), which can be ambiguous after duplicate chart creation. If retained, use the saved chart UUID returned by setup and navigate directly; names/slugs must not be treated as unique.

## Nonstandard or surprising behavior

- BigQuery uses a forced file upload and assumes the correct authentication mode because its explicit select is commented out (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:92-101`). This is the only upload in the spec.
- No downloads, popups, iframes, clipboard, Monaco, drag-and-drop, virtualization, browser API, or SVG-specific assertions are used. The skipped saved-chart viewer may render an ECharts canvas, but its checks are only text labels (`lines 458-464`).
- Exact timestamp strings include `(+00:00)` and warehouse-specific week/day values (`lines 252-275,561-584,697-720`). CI's UTC setting is therefore behavioral, not cosmetic (`.github/workflows/pr.yml:585-586`). Snowflake week behavior additionally depends on `WEEK_START` (source line 704).
- Active percentile checks are commented with “move to unit test” (lines 517-518, 588-595, 723-730). Active custom-dimension coverage is also commented; Snowflake cites a pending rounding fix (lines 732-733). These comments describe unexecuted code, not skipped tests, and should not be silently activated during migration.
- Trino and Databricks expected interval arrays contain 19 values while the helper requests 22 fields, so `forEach` silently leaves the final three response fields unchecked (`lines 612-635,654-677`).
- The skipped settings test stops immediately after clicking `Manually` and therefore has no assertion for that transition (`lines 489-502`).
- Project creation retries three times at the frontend mutation layer (`packages/frontend/src/hooks/useProject.ts:126-143`), while Cypress/Playwright can also retry the whole test. This compounds duplicate-project risk if a response is lost after persistence.

## Coordination requirements

1. `mutating-project-isolation`: provide a separate preview/database lane or an approved run-namespace contract before porting. The source's organization-wide delete-by-name setup (`packages/e2e/cypress/support/commands.ts:391-410`) is not safe while Cypress remains authoritative and both runners share a preview. The target should generate unique names and track/delete exact created UUIDs in teardown even after an assertion failure.
2. `playwright-warehouse-secrets`: provision PostgreSQL, BigQuery, and Snowflake secrets plus `TZ=UTC` to the Playwright lane. Generate BigQuery JSON at `packages/e2e/playwright/fixtures/credentials.json` (or provide a coordinator-defined equivalent) and never commit it. Current Playwright CI has none of the warehouse env or file setup (`.github/workflows/pr.yml:491-524`), unlike Cypress (`.github/workflows/pr.yml:556-586`).
3. Existing Playwright admin authentication is sufficient (`packages/e2e/playwright/auth.setup.ts:10-23`). Do not add a second auth helper.
4. No new shared UI helper is justified by this one file. Keep warehouse form fillers, Mantine selection, job polling, row assertion, and exact-UUID cleanup local to `packages/e2e/playwright/app/createProjects.spec.ts`. Only extract shared infrastructure later if another independently analyzed port demonstrates the same need.
5. API-only custom-dimension and warehouse-result assertions should use `packages/api-tests`, but a reusable compiled warehouse-project fixture would itself be shared infrastructure. Do not invent it in this port; coordinate or preserve the just-created-project postconditions locally until that fixture exists.

## Exact port plan

1. After both coordination keys are ready, create exactly `packages/e2e/playwright/app/createProjects.spec.ts` for the three active UI flows. Use the existing Firefox/admin-storage project; do not modify auth files.
2. Define target-file-local warehouse configurations sourced from `process.env`, requiring active secrets explicitly instead of typing `undefined`. Use run-unique project names derived from each base name. Track every returned project UUID and DELETE only those UUIDs in resilient teardown; never list/delete all projects by shared name.
3. Add target-file-local form functions for PostgreSQL, BigQuery, and Snowflake. Use exact role locators for warehouse, `Manually`, `I’ve defined them!`, submit, and options; use named input locators for credential fields. Upload only the coordinator-provisioned Playwright credential path.
4. For each active test, capture and assert the POST `/api/v1/org/projects/precompiled` response, extract `jobUuid`, poll GET `/api/v1/jobs/:jobUuid` until DONE/ERROR with a 180-second bound, and wait for `/createProjectSettings/<uuid>`. Assert the connection heading and selected-model count.
5. Click Save while waiting for the exact PATCH `/api/v1/projects/<uuid>/tablesConfiguration`, then assert `/projects/<uuid>/home` and the empty-project home copy. Remove the fixed sleep and parse the UUID from the exact URL pattern.
6. Preserve the current quote-escaping and warehouse-specific time-interval postconditions against the created UUID via Playwright's authenticated request context. Assert keys by requested field ID rather than `Object.values` ordering where the response contract permits. Keep them in the browser test only as postconditions of its unique UI-created project; record a follow-up extraction to `packages/api-tests/tests/warehouseQuerySemantics.test.ts` if coordinated API project setup becomes available.
7. Do not copy the six skipped tests as inert Playwright code. Move the API-only custom-dimension creator to `packages/api-tests/tests/customDimensions.test.ts` only with self-contained cleanup; retain the custom-dimension viewer and settings route only after their expected behavior is clarified. Redshift/Databricks require skip decisions; Trino remains blocked on staging.
8. Preserve PostgreSQL, BigQuery, and Snowflake as separate named tests so failures identify the external warehouse. Keep execution serial and do not add a shared cross-file helper/config timeout.

## Verification plan

No commands were run during discovery beyond read-only repository inspection. After implementation and secret/isolation setup, run from repository root:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e linter ./playwright/app/createProjects.spec.ts
pnpm -F e2e formatter ./playwright/app/createProjects.spec.ts --check
TZ=UTC PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" PGHOST="$PGHOST" PGUSER="$PGUSER" PGPASSWORD="$PGPASSWORD" SNOWFLAKE_ACCOUNT="$SNOWFLAKE_ACCOUNT" SNOWFLAKE_USER="$SNOWFLAKE_USER" SNOWFLAKE_PASSWORD="$SNOWFLAKE_PASSWORD" pnpm -F e2e exec playwright test playwright/app/createProjects.spec.ts --project=firefox --workers=1
pnpm -F e2e exec playwright test --project=firefox --workers=1
```

The focused command also requires the coordinator-generated BigQuery credential file at the agreed path. If API extraction is implemented, additionally run:

```bash
pnpm -F api-tests lint
pnpm -F api-tests typecheck
TZ=UTC pnpm -F api-tests test:api -- tests/warehouseQuerySemantics.test.ts tests/customDimensions.test.ts
```

Verify teardown through authenticated GET `/api/v1/org/projects`: none of the run-unique Playwright projects should remain, and concurrently running Cypress fixed-name projects must remain untouched. In CI, verify each compile failure reports terminal job steps and that no secret appears in traces, screenshots, or logs.

## Open questions

1. What isolation contract should mutating Playwright ports use: a separate preview/database, or unique names plus exact-UUID teardown on the shared preview?
2. Should `GCP_CREDENTIALS` be generated at `packages/e2e/playwright/fixtures/credentials.json`, and how should local developers provision the same untracked file? The repository currently documents only Cypress-path generation (`.github/workflows/pr.yml:556-562`).
3. Should PostgreSQL/Snowflake/BigQuery query-format assertions move to API tests in this migration, or remain postconditions of UI-created projects until a compiled-project API fixture exists?
4. Why are Redshift and Databricks skipped? Their source blocks have no actionable skip reason (`packages/e2e/cypress/e2e/app/createProjects.cy.ts:525-547,641-682`).
5. Is the skipped custom-dimension chart already guaranteed in seed data, or was `I can view...` intended to depend on the preceding skipped creator? Either way, what permanent assertion is desired?
6. What behavior should the skipped settings-navigation test assert after `Manually`? It currently ends without a post-click assertion (`lines 489-502`).
7. Is Snowflake database `SNOWFLAKE_DATABASE_STAGING` intentionally literal, or should it come from an environment variable (`lines 41-49`)?
8. Are the percentile “move to unit test” and Snowflake custom-dimension rounding TODOs resolved elsewhere, or should they be tracked for separate API/unit coverage (`lines 517-522,588-595,723-733`)?
9. If Trino staging is added, should its and Databricks' partial 19-of-22 interval expectations be completed before enabling them?

## Port history

Not started.
