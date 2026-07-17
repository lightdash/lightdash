# packages/e2e/cypress/cli/integration/cli.cy.ts

## Classification

- Recommended runner: Playwright test runner as a Node-only CLI integration suite; do not request a browser/page fixture.
- Execution lane: `cli-node`
- Active tests: 4
- Skipped tests: 0
- Persistent mutation: Yes — projects, personal access tokens, validation jobs, CLI config, and dbt target artifacts.
- Shared-preview dual-run safe: No as written; safe only after isolating `HOME`, dbt `--target-path`, and resource names, with API fallback cleanup.
- Difficulty total: 12/18 (`persistent/shared state` 3, `browser interaction complexity` 0, `environment/external dependencies` 3, `synchronization/flakiness` 3, `authentication/authorization` 2, `cross-file infrastructure` 1).
- Coordination keys: `playwright-cli-node-project`
- Analysis status: coordination-required

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `deploy > Should create new project` | Active | Logs in as the seeded organization admin, creates a PAT, runs `lightdash deploy --create` against the full Jaffle Shop dbt project, requires `Successfully deployed` on stderr, extracts `projectUuid`, then deletes that project in the suite `after` hook (`packages/e2e/cypress/cli/integration/cli.cy.ts:18-61`). | Creates an unlimited PAT; creates and deploys a default project; writes dbt target files and `~/.config/lightdash/config.yaml`; deletes only the last parsed project UUID (`packages/e2e/cypress/cli/integration/cli.cy.ts:19-29,48-58`; `packages/cli/src/config.ts:8-9,36-39,87-97`). | Real child process; exit failures are suppressed; success is asserted on stderr; UUID is parsed from CLI/GitHub-style output (`packages/e2e/cypress/cli/integration/cli.cy.ts:34-58`). | Node-only Playwright CLI test with a unique project name, isolated home/target directory, exit-code assertion, and `finally` API cleanup. |
| `preview > Should start-preview` | Active | Creates a PAT and runs `lightdash start-preview` with a timestamp name and `LIGHTDASH_PROJECT` set to the seed project; expects `New project created` on stderr (`packages/e2e/cypress/cli/integration/cli.cy.ts:63-85`). | Creates an unlimited PAT and preview project, copies from the seed project, deploys explores, writes dbt artifacts, and records preview state in CLI config (`packages/e2e/cypress/cli/integration/cli.cy.ts:68-84`; `packages/cli/src/handlers/preview.ts:151-159,477-627`; `packages/cli/src/config.ts:111-121`). | Depends on the next test for cleanup; timestamp is evaluated once when the spec loads; `CI=true` changes CLI output; nonzero exit is suppressed. | Merge with stop-preview into one Node-only lifecycle test using a UUID name and `try/finally`. |
| `preview > Should stop-preview` | Active, order-dependent | Creates another PAT, runs `lightdash stop-preview` with the exact name created by the preceding test, and expects a deletion message (`packages/e2e/cypress/cli/integration/cli.cy.ts:88-105`). | Creates an unlimited PAT; unsets local preview config and deletes the matching preview project (`packages/cli/src/handlers/preview.ts:637-675`; `packages/cli/src/config.ts:123-130`). | Cannot pass independently; retry after successful deletion is non-idempotent; the CLI finds the first exact-name preview via `Array.find` (`packages/cli/src/handlers/preview.ts:151-159`). | Same combined preview lifecycle test, plus direct API fallback deletion if CLI stop fails. |
| `validate > Should test validate` | Active | Creates a PAT and runs `lightdash validate` for `SEED_PROJECT.project_uuid`; accepts validation findings but rejects the internal backend text `Validation failed`, and requires `Validation finished` (`packages/e2e/cypress/cli/integration/cli.cy.ts:108-128`). | Creates an unlimited PAT, writes dbt target files, schedules/persists a validation job, and emits analytics; it does not intentionally alter seed project content (`packages/cli/src/handlers/validate.ts:35-55,170-230`). | A nonzero process exit is intentionally allowed when ordinary validation errors exist; scheduler status is polled every 3 seconds (`packages/e2e/cypress/cli/integration/cli.cy.ts:115-126`; `packages/cli/src/handlers/validate.ts:78-103,281-288,410-412`). | Node-only Playwright CLI test preserving the distinction between business validation findings and backend/job failure. |

There are no `.skip`, `describe.skip`, pending tests, or inherited skip states in the assigned file.

## Cypress command expansion

### `cy.login()`

Used once by every test (`packages/e2e/cypress/cli/integration/cli.cy.ts:32,67,89,110`). The command:

1. Opens/reuses a Cypress session keyed by the seeded admin email.
2. On setup, sends `POST api/v1/login` with `demo@lightdash.com` / `demo_password!` and requires status 200.
3. On reuse, sends `GET api/v1/user` and requires status 200.

Evidence: `packages/e2e/cypress/support/commands.ts:152-171`; seeded identity and admin role: `packages/common/src/index.ts:465-481`.

### `cy.getApiToken()`

Used after every login (`packages/e2e/cypress/cli/integration/cli.cy.ts:33,68,90,111`). It sends `POST api/v1/user/me/personal-access-tokens` with `{ description: 'e2e', autoGenerated: true, expiresAt: null }`, requires status 200, and yields `resp.body.results.token` (`packages/e2e/cypress/support/commands.ts:375-390`). The backend inserts a persistent token row (`packages/backend/src/models/DashboardModel/PersonalAccessTokenModel.ts:111-148`). The spec never calls the available PAT delete endpoint (`packages/backend/src/controllers/userController.ts:680-703`), so four PATs are leaked on a clean pass and more on retries.

Built-in Cypress operations also matter:

- `cy.exec` launches the installed `lightdash` binary with inherited PATH and explicit environment, while `failOnNonZeroExit: false` suppresses exit-code failure (`packages/e2e/cypress/cli/integration/cli.cy.ts:34-46,69-84,91-103,112-126`).
- `cy.request(DELETE api/v1/org/projects/:uuid)` performs deploy cleanup using the session cookie; no response-body assertion is made (`packages/e2e/cypress/cli/integration/cli.cy.ts:21-28`).

## State, seed, and environment assumptions

- The Lightdash API is reachable at Cypress `baseUrl`, defaulting to `http://localhost:3000` (`packages/e2e/cypress/cli/integration/cli.cy.ts:7`; `packages/e2e/cypress.config.ts:23-26`). `LIGHTDASH_URL` is passed to every CLI process.
- The development seed must contain organization admin `demo@lightdash.com`, its password, and seed project UUID `3675b69e-8324-4110-bdca-059031aa8da3` (`packages/common/src/index.ts:460-481,550-558`). Admin permissions are required to create/delete default and preview projects, view/copy the upstream project, deploy, and validate; CLI creation explicitly checks user abilities (`packages/cli/src/handlers/dbt/apiClient.ts:210-329`).
- A built `lightdash` executable and a supported dbt executable/adapter must be on PATH. The commands resolve the dbt project and profiles relative to the E2E package: `../../examples/full-jaffle-shop-demo/dbt` and `../../examples/full-jaffle-shop-demo/profiles` (`packages/e2e/cypress/cli/integration/cli.cy.ts:3-5`).
- PostgreSQL defaults are `localhost:5432`, `postgres/password`, database `postgres`, schema `jaffle`; each may be overridden through Cypress env (`packages/e2e/cypress/cli/integration/cli.cy.ts:9-16`). The profile consumes those exact variables, disables SSL, and uses four threads (`examples/full-jaffle-shop-demo/profiles/profiles.yml:4-16`).
- dbt's configured target directory is the shared project-local `target` directory (`examples/full-jaffle-shop-demo/dbt/dbt_project.yml:15-19`). The CLI honors `--target-path`, then `DBT_TARGET_PATH`, then that project setting (`packages/cli/src/dbt/context.ts:66-99`). The source passes neither, so concurrent runs can overwrite the same manifest/run artifacts.
- `deploy --create` derives a default project name from dbt project name `jaffle_shop` (`examples/full-jaffle-shop-demo/dbt/dbt_project.yml:1-4`; `packages/cli/src/handlers/deploy.ts:484-520`). Duplicate names are therefore expected across runs. Cleanup is UUID-based, but a retry can create several projects while retaining only the latest UUID.
- Preview uses the seed project as upstream via `LIGHTDASH_PROJECT` (`packages/e2e/cypress/cli/integration/cli.cy.ts:73-80`). Preview lookup is organization-wide and returns the first preview with the exact name (`packages/cli/src/handlers/preview.ts:151-159`), making duplicate names dangerous.
- The CLI reads and writes `~/.config/lightdash/config.yaml`. Environment variables override API key, project, and URL only when reading; deploy still persists its new default project, and preview persists/unsets preview state (`packages/cli/src/config.ts:8-9,36-39,66-97,111-130`). The deploy cleanup leaves config pointing at a deleted project.
- Key API flows are: health/version check (`packages/cli/src/handlers/dbt/apiClient.ts:331-349`); user/ability and project creation (`packages/cli/src/handlers/dbt/apiClient.ts:110-116,210-329`; `packages/cli/src/handlers/createProject.ts:419-423`); project settings and deploy PUTs (`packages/cli/src/handlers/timestampConversion.ts:20-48`; `packages/cli/src/handlers/deploy.ts:117-155,340-455`); preview list/create/delete (`packages/cli/src/handlers/preview.ts:57-80,151-159,477-675`); validation schedule/status/result (`packages/cli/src/handlers/validate.ts:35-55,78-103`).
- `NODE_ENV=development` is always set. `CI=true` is set for deploy/start-preview but not stop-preview/validate (`packages/e2e/cypress/cli/integration/cli.cy.ts:38-43,73-80,93-97,116-121`). CLI analytics performs real best-effort requests to `https://analytics.lightdash.com/v1/track`; failures are swallowed, but network latency remains external (`packages/cli/src/analytics/analytics.ts:571-613`). Cypress `blockHosts` only applies to browser traffic, not the `cy.exec` child process (`packages/e2e/cypress.config.ts:27-34`).

## Synchronization and timeout requirements

- Cypress guarantees declaration order here. Preview stop therefore relies on preview start completing first (`packages/e2e/cypress/cli/integration/cli.cy.ts:66-105`). This should be replaced by one lifecycle test rather than a serial cross-test dependency.
- Cypress config has 10-second command timeout and two run-mode retries by default, but no explicit `execTimeout` (`packages/e2e/cypress.config.ts:12-22`). Full dbt compilation/catalog lookup and backend deployment can exceed ordinary command timeouts; the port should set an explicit per-test/process timeout (initial recommendation: 5 minutes, pending CI timing evidence).
- Validation polling has no overall deadline and recursively polls scheduler status every 3 seconds (`packages/cli/src/handlers/validate.ts:78-103`). The outer process runner must enforce a deadline and include captured stdout/stderr in timeout errors.
- Run-mode retries are unsafe in the source: deploy can leak an earlier created project; start-preview retries update an existing preview and print `Project updated` instead of `New project created`; stop-preview retries after deletion cannot find the project; every attempt leaks another PAT.
- `failOnNonZeroExit: false` means synchronization and failure are inferred only from stderr substrings. The port should capture `{ exitCode, stdout, stderr }`: require zero for deploy/start/stop, while validate may accept 0 or 1 only when `Validation finished` is present and `Validation failed` is absent.
- Cypress config computes `MODEL_COUNT` and `DBT_THREADS` for dynamic CLI timeout scaling, but this spec never reads either (`packages/e2e/cypress.config.ts:37-67`; no references in `packages/e2e/cypress/cli/integration/cli.cy.ts:1-129`). Clarify whether an intended timeout formula was lost.

## Locator and strictness risks

- There is no rendered UI and no DOM locator. A browser migration would add cost without coverage.
- Output matching is deliberately loose and ANSI-tolerant, but `contain` can mask unrelated failures. Deploy's `/projectUuid=([\w-]*)/` accepts an empty capture before the explicit guard and couples the test to stderr formatting (`packages/e2e/cypress/cli/integration/cli.cy.ts:47-55`).
- Preview cleanup is name-based, not UUID-based. Exact unique names are mandatory because CLI lookup takes the first matching preview (`packages/cli/src/handlers/preview.ts:151-159`).
- Validate's negative string assertion is semantically important: `Validation failed` means scheduler/backend failure, while `Validation finished ... with N errors` is an accepted business result (`packages/e2e/cypress/cli/integration/cli.cy.ts:124-126`; `packages/cli/src/handlers/validate.ts:275-290`). Preserve these as separate assertions.

## Nonstandard or surprising behavior

- All four tests are API/CLI-only despite living in Cypress; the E2E package instruction says browserless coverage should not drive a UI (`packages/e2e/CLAUDE.md:7-16`). This is CLI integration rather than an API-only assertion, so the `cli-node` lane is more accurate than `api-tests`.
- A clean run creates four never-expiring PATs with the same `e2e` description. Retries create more (`packages/e2e/cypress/support/commands.ts:375-390`).
- Deploy's suite-level cleanup is conditional on parsing output. If the CLI creates a project and then fails before emitting/parsing the UUID, no cleanup occurs (`packages/e2e/cypress/cli/integration/cli.cy.ts:19-29,46-59`).
- Preview start and stop are separate tests but form one transaction. Any interruption between them leaves a preview project; stop unsets local preview state before checking/deleting the server project (`packages/cli/src/handlers/preview.ts:637-675`).
- `previewName` uses millisecond time at module evaluation, not per test/attempt (`packages/e2e/cypress/cli/integration/cli.cy.ts:64`). It is not guaranteed unique across parallel processes.
- Deploy/start/validate all compile the same dbt project into the same target directory. Even separate server project names do not prevent filesystem collisions.
- The source checks messages only on stderr because CLI status/progress output is written there. stdout is ignored entirely.
- Validate intentionally permits ordinary validation errors and potentially exit code 1; the comment says “without or without validation errors,” evidently meaning “with or without” (`packages/e2e/cypress/cli/integration/cli.cy.ts:125-126`).

## Coordination requirements

- `playwright-cli-node-project`: coordinate a dedicated Playwright project matching `playwright/cli/**/*.spec.ts`, with no browser device, storage state, or dependency on `auth.setup.ts`. The current only `.spec.ts` project is Firefox and always depends on browser authentication setup (`packages/e2e/playwright.config.ts:28-41`). The coordinator must also exclude CLI specs from the Firefox project to prevent duplicate execution.
- No shared helper is justified yet. Keep process execution, temporary HOME/target setup, API project lookup, and cleanup helpers local to the target file until another migrated CLI spec demonstrates a second consumer.
- No separate database is required if the target uses unique names, unique dbt targets, isolated HOME, and UUID-based cleanup. Until those controls land, do not dual-run this source and its port against the shared preview.

## Exact port plan

1. Coordinator adds the `cli-node` Playwright project described above in `packages/e2e/playwright.config.ts`; it must run `playwright/cli/integration/cli.spec.ts` without setup/browser fixtures.
2. Create exactly `packages/e2e/playwright/cli/integration/cli.spec.ts`.
3. Use `@playwright/test` only as the Node test runner and API client. Do not request `page`, launch a browser, or use storage state.
4. Add file-local helpers using Node `child_process` to run `lightdash` with an argument array (not shell interpolation), capture stdout/stderr/exit code, enforce a process timeout, and print captured output on failure.
5. For each lifecycle, create a temporary HOME and target directory. Pass `HOME=<temp>`, `--target-path <temp>/target`, absolute dbt/profile paths, the source database env defaults, `LIGHTDASH_URL`, and the API key. Remove only those owned temporary directories in `finally`.
6. Prefer the deterministic seeded admin PAT `SEED_PAT.token`, documented as a development PAT (`packages/common/src/index.ts:542-548`) and seeded for `SEED_ORG_1_ADMIN` (`packages/backend/src/database/seeds/development/13_personal_access_token.ts:1-29`). This removes session setup and PAT leakage. If that PAT is not guaranteed in the target environment, create a PAT via the API and retain its UUID so it is deleted in `finally`.
7. Port deploy as one test. Pass a unique explicit `--create "e2e deploy <uuid>"`; assert exit 0 and `Successfully deployed`. In `finally`, list organization projects and delete every exact-name match by UUID, so cleanup does not depend solely on output parsing.
8. Merge start-preview and stop-preview into one test because they are one stateful lifecycle. Use `e2e preview <uuid>`, assert start exit 0/message, run stop in `finally`, and retain a direct API list/delete fallback for the exact unique name.
9. Port validate as one test against `SEED_PROJECT.project_uuid`. Require `Validation finished`, reject `Validation failed`, and document/handle the allowed business-validation exit code rather than globally ignoring all nonzero exits.
10. Keep all tests serial within the file initially. The resources will be locally isolated, but the full dbt/warehouse/backend load is substantial and current evidence supplies no safe concurrency budget.
11. Do not modify or delete the Cypress source during dual-run.

## Verification plan

Run from repository root after the coordinator prerequisite and port exist:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e lint
pnpm -F e2e format
pnpm -F e2e playwright:run --project=cli-node playwright/cli/integration/cli.spec.ts
pnpm -F e2e cypress:run --spec cypress/cli/integration/cli.cy.ts
```

Then perform one controlled dual-run against the shared preview only after HOME/target/name isolation and fallback cleanup are present. Verify via `GET /api/v1/org/projects` that neither unique test project remains, and via `GET /api/v1/user/me/personal-access-tokens` that the port did not create residual `e2e` PATs. Do not use broad cleanup by non-unique legacy name `Jaffle shop`.

## Open questions

1. Is `SEED_PAT` guaranteed in every CI/shared-preview environment used by the Playwright migration, or only local development seeds? If not, the port needs create-and-delete PAT lifecycle code.
2. What timeout should replace the apparently unused `MODEL_COUNT`/`DBT_THREADS` calculation? CI duration evidence is unavailable; 5 minutes is only an initial bounded value.
3. Should CLI telemetry be disabled for tests? Current code makes best-effort calls to `analytics.lightdash.com`, and no test-specific disable contract was found.
4. Is accepting any `Validation finished ... with N errors` still the intended product contract, or should the seed project now validate cleanly? The source explicitly allows either outcome.
5. Is the built `lightdash` workspace binary guaranteed on PATH for the new `cli-node` Playwright project, or should the coordinator standardize an explicit repository-local binary path?

## Port history

Not started.
