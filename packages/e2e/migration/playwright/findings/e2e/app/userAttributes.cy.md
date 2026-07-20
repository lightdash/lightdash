# packages/e2e/cypress/e2e/app/userAttributes.cy.ts

## Classification

Recommended runner: Playwright for browser behavior, with Playwright `request` only for preconditions/cleanup; do not port setup-only cases as tests.
Execution lane: serial, shared-state-exclusive
Active tests: 13
Skipped tests: 0
Persistent mutation: Yes — organization-scoped `customer_id` and `is_admin` attributes are deleted/created/updated and left behind.
Shared-preview dual-run safe: No
Difficulty total: 13/18 (persistent/shared state 3, browser interaction complexity 2, environment/external dependencies 2, synchronization/flakiness 3, authentication/authorization 2, cross-file infrastructure 1)
Coordination keys: `org:172a2270-000f-42be-9c68-c4752c23ae51:user-attribute:customer_id`, `org:172a2270-000f-42be-9c68-c4752c23ae51:user-attribute:is_admin`, `project:3675b69e-8324-4110-bdca-059031aa8da3`, `user:b264d83a-9000-426a-85ec-3f9c20f368ce`
Analysis status: clarification-required

The file has two ordinary `describe` blocks and no `.skip`/`.only`, so all 13 tests are active. Clarification is required because the current `users` metadata does not put `required_attributes` on `last_name`: `examples/full-jaffle-shop-demo/dbt/models/users.yml:14-17` declares the field without access metadata. The current example instead guards `customers.age` with `is_admin: "true"` at `examples/full-jaffle-shop-demo/dbt/models/customers.yml:166-175`. Thus the assertions at `packages/e2e/cypress/e2e/app/userAttributes.cy.ts:136-141`, `:159-168`, and `:184-189` do not match the checked-in fixture.

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `User attributes sql_filter > Delete customer_id attribute` | Active | Lists attributes, finds the first named `customer_id`, and conditionally deletes it (`packages/e2e/cypress/e2e/app/userAttributes.cy.ts:10-24`). | Deletes any existing org-wide `customer_id`, regardless of who created it. | Conditional branch means absence passes. | Remove as a standalone test; local Playwright API precondition with asserted responses. |
| `... > Error on runquery if user attribute does not exist` | Active; ordered after delete | Opens seeded project tables, searches/selects `Users`, adds `First name`, runs a query, and expects the missing-attribute error (`:25-41`). | None. | Virtualized/debounced table search; asynchronous query error UI. | Playwright if SQL-filter UI coverage is still wanted; otherwise backend/API coverage and remove per the TODO at `:5`. |
| `... > Create user attribute` | Active; ordered after missing-error case | Creates `customer_id=20` for `demo@lightdash.com` through the settings modal (`:43-56`). | Creates org-wide `customer_id` and admin-user mapping. | Mantine searchable portal select, TagsInput committed by Enter, async success toast. | Playwright, folded into one self-contained SQL-filter flow. |
| `... > Should return results with user attribute` | Active; depends on prior create | Runs `Users.first_name` and expects `Anna` (`:58-68`). | Query history/cache only; no domain mutation. | Warehouse query and polling. | Playwright in the SQL-filter flow; API test only if rendered result coverage is intentionally dropped. |
| `... > Edit user attribute` | Active; depends on prior create | Finds the `customer_id` table row, opens its action menu, removes the first value pill, and updates value to `30` (`:70-82`). | Rewrites the attribute’s user/group mappings and leaves `customer_id=30`. | Unnamed first row button; CSS class tied to Mantine; portal menu; TagsInput. | Playwright in the SQL-filter flow. |
| `... > Should return results with new user attribute` | Active; depends on prior edit | Runs `Users.first_name` and expects `Christina` (`:83-93`). | Query history/cache only. | 30-second text assertion around warehouse query. | Playwright in the SQL-filter flow. |
| `User attributes dimension required_attribute > Create customer_id attribute` | Active; nominal setup, but response ignored | Attempts API creation of `customer_id=30` for the seeded admin (`:102-120`). | May create `customer_id`; normally collides with the prior block’s leftover attribute. | `failOnStatusCode: false`; no response assertion; current body omits required `groups`. | Remove as a test; corrected, asserted API precondition (`groups: []`) local to the required-attribute flow. |
| `... > Delete is_admin attribute` | Active; ordered setup | Lists and conditionally deletes the first `is_admin` (`:121-135`). | Deletes any existing org-wide `is_admin`. | Absence passes. | Remove as a standalone test; local Playwright API precondition. |
| `... > Should not see last_name dimension` | Active; depends on no `is_admin` | Selects `Users` and expects `Last name` absent (`:136-142`). | None. | Negative assertion after virtualized navigation; conflicts with current fixture. | Clarify fixture/field, then Playwright. |
| `... > Create user attribute` | Active; depends on prior delete | Creates `is_admin=true` for the seeded admin through UI (`:144-157`). | Creates org-wide `is_admin` and admin-user mapping. | Same Mantine select/TagsInput/toast mechanics. | Playwright in one required-attribute flow. |
| `... > Should see last_name attribute` | Active; depends on prior create and `customer_id=30` | Expects `Last name` visible, runs it, and expects `W.` (`:159-169`). | Query history/cache only. | Warehouse query; 30-second text assertion; current metadata mismatch. | Clarify, then Playwright. |
| `... > Edit user attribute` | Active; depends on prior create | Changes `is_admin` from `true` to `false` through row menu and modal (`:171-183`). | Rewrites mappings and leaves `is_admin=false`. | Unnamed first action button and Mantine CSS pill selector. | Playwright in the required-attribute flow. |
| `... > Should not see last_name dimension` | Active; depends on prior edit | Reopens `Users` and expects `Last name` absent (`:184-190`). | None. | Negative assertion after navigation; current metadata mismatch. | Clarify, then Playwright. |

There are no skipped tests or inherited skipped suites to trace. The two comments are migration guidance rather than skips: consolidate SQL-filter CRUD and possibly stop running query assertions (`packages/e2e/cypress/e2e/app/userAttributes.cy.ts:5`), and consolidate the required-attribute cases (`:96`).

## Cypress command expansion

- `cy.login()` is the only repository-defined custom command invoked. Each `beforeEach` calls it (`packages/e2e/cypress/e2e/app/userAttributes.cy.ts:7-9`, `:98-100`). Its implementation uses `cy.session` keyed by the seeded admin email, POSTs `api/v1/login` with seeded admin credentials, asserts 200, and validates a restored session through GET `api/v1/user` (`packages/e2e/cypress/support/commands.ts:152-173`). The constants resolve to `demo@lightdash.com`, `demo_password!`, admin role, and user UUID `b264d83a-9000-426a-85ec-3f9c20f368ce` (`packages/common/src/index.ts:465-481`).
- `findByPlaceholderText` and `findByText` come from `@testing-library/cypress/add-commands`, imported at `packages/e2e/cypress/support/commands.ts:26-46`; they are library commands, not local wrappers.
- `cy.request`, `cy.visit`, `cy.get`, `cy.contains`, `.parents`, `.find`, `.first`, `.type`, and `.click` are built-in Cypress commands. No other custom command is used.
- Global Cypress support suppresses a class of uncaught `ResizeObserver` errors (`packages/e2e/cypress/support/commands.ts:128-141`). A Playwright port should not reproduce that broad exception suppression without an observed failure.

## State, seed, and environment assumptions

### Ordering and shared state

- Tests are a single ordered state machine, despite being split into 13 tests. The first suite deletes `customer_id`, observes failure, creates value `20`, observes `Anna`, edits to `30`, and observes `Christina` (`packages/e2e/cypress/e2e/app/userAttributes.cy.ts:10-93`). There is no `afterEach`/`after` cleanup.
- The second suite starts after the first suite and silently attempts to create `customer_id=30` (`:102-120`). Because `(name, organization_id)` is unique (`packages/backend/src/database/migrations/20230714124708_user_attributes.ts:20-27`), the existing `customer_id` from the first suite is a duplicate. `failOnStatusCode: false` and the absence of an assertion hide that failure.
- The second setup body also omits `groups`, although the current public request type requires both `users` and `groups` (`packages/common/src/types/userAttributes.ts:45-53`) and the model immediately maps `orgAttribute.groups` (`packages/backend/src/models/UserAttributesModel.ts:401-417`). The port must send `groups: []` and assert the exact status/body.
- The `W.` query also needs the leftover `customer_id=30`, because the `users` explore always applies `customer_id = ${ld.attr.customer_id}` (`examples/full-jaffle-shop-demo/dbt/models/users.yml:3-7`). Therefore the second suite is not independently runnable.
- Create/update are persistent database transactions; update removes and reinserts all user/group mappings (`packages/backend/src/models/UserAttributesModel.ts:449-480`). Current tests leave `customer_id=30` and `is_admin=false`, so retries and subsequent specs inherit dirty state.
- Names are organization-unique (`packages/backend/src/database/migrations/20230714124708_user_attributes.ts:26`), making exact-name collisions deterministic. Parallel Cypress/Playwright, another branch, or a human using those attributes can be deleted or can cause creation failure.

### Authentication and authorization

- The settings route only exists for a user able to `manage` the organization (`packages/frontend/src/pages/Settings.tsx:414-425`), and the panel independently renders forbidden content otherwise (`packages/frontend/src/components/UserSettings/UserAttributesPanel/index.tsx:305-318`).
- Backend list/create/update/delete likewise require organization `manage`; create/update/delete also pass through `unauthorisedInDemo` (`packages/backend/src/controllers/userAttributesController.ts:41-82`, `:93-126`; `packages/backend/src/services/UserAttributesService/UserAttributesService.ts:50-69`, `:84-107`, `:121-180`). The runtime must not have demo-mode mutation blocking enabled.
- Existing Playwright infrastructure already authenticates the same seeded admin through API and writes storage state (`packages/e2e/playwright/auth.setup.ts:10-24`); the Firefox project consumes it (`packages/e2e/playwright.config.ts:28-41`). No new auth helper is needed.

### Seeds and data

- The organization UUID is `172a2270-000f-42be-9c68-c4752c23ae51`, admin UUID is `b264d83a-9000-426a-85ec-3f9c20f368ce`, and project UUID is `3675b69e-8324-4110-bdca-059031aa8da3` (`packages/common/src/index.ts:460-481`, `:550-558`).
- The development seed creates `is_admin_saas_demo`, not `customer_id` or `is_admin` (`packages/backend/src/database/seeds/development/01_initial_user.ts:122-143`). A clean run therefore expects both tested names absent.
- Warehouse seed row `customer_id=20` is `Anna A.` and `customer_id=30` is `Christina W.` (`examples/full-jaffle-shop-demo/dbt/data/raw_customers.csv:21-31`), explaining the result assertions.
- The current required-attribute fixture discrepancy is material: `Users.last_name` has no `required_attributes` (`examples/full-jaffle-shop-demo/dbt/models/users.yml:14-17`), while the filtering implementation removes inaccessible dimensions based on their attribute predicates (`packages/backend/src/services/UserAttributesService/UserAttributeUtils.ts:278-303`).

### Relevant requests and services

- Explicit setup/mutation requests: GET/POST `/api/v1/org/attributes` and DELETE `/api/v1/org/attributes/{uuid}` (`packages/e2e/cypress/e2e/app/userAttributes.cy.ts:10-23`, `:102-134`). The controller returns list 200, create 201, update 201, and delete 200 (`packages/backend/src/controllers/userAttributesController.ts:41-83`, `:93-132`).
- Settings UI fetches GET `/api/v1/org/attributes`, creates with POST, and updates with PUT `/api/v1/org/attributes/{uuid}`; mutation success invalidates the attributes query before showing the success toast (`packages/frontend/src/hooks/useUserAttributes.ts:11-55`, `:58-90`). The modal also fetches GET `/api/v1/org/users` to populate the email select (`packages/frontend/src/hooks/useOrganizationUsers.ts:24-50`, `:62-92`) and GET `/api/v2/feature-flag/user-groups-enabled` (`packages/frontend/src/hooks/useServerOrClientFeatureFlag.ts:10-31`). Group data is fetched only when that flag is enabled (`packages/frontend/src/components/UserSettings/UserAttributesPanel/UserAttributeModal.tsx:155-162`).
- Explorer navigation fetches filtered explores and the selected explore through GET `/api/v1/projects/{projectUuid}/explores?...` and GET `/api/v1/projects/{projectUuid}/explores/{exploreId}` (`packages/frontend/src/hooks/useExplores.tsx:6-17`, `packages/frontend/src/hooks/useExplore.tsx:7-16`).
- Run Query POSTs `/api/v2/projects/{projectUuid}/query/metric-query` (`packages/frontend/src/hooks/useQueryResults.ts:81-92`, `:164-197`) and polls GET `/api/v2/projects/{projectUuid}/query/{queryUuid}` with 250/500/1000 ms backoff (`packages/frontend/src/features/queryRunner/executeQuery.ts:15-38`). It requires the local backend, PostgreSQL state, compiled seed project, query worker/path, and configured seed warehouse; no cloud service, upload/download, or spec-level environment variable is used.
- Missing `customer_id` is expected to throw the exact `Missing user attribute "customer_id": ...` error from replacement logic (`packages/backend/src/utils/QueryBuilder/utils.ts:196-207`), rendered under `Error loading results` (`packages/frontend/src/components/Explorer/ResultsCard/ExplorerResultsNonIdealStates.tsx:176-189`).

## Synchronization and timeout requirements

- Cypress defaults every command to 10 seconds and retries run-mode failures twice (`packages/e2e/cypress.config.ts:12-21`). Playwright defaults actions/expectations to 10 seconds, navigation to 30 seconds, CI retries, one worker, and non-parallel execution (`packages/e2e/playwright.config.ts:4-26`).
- Table search is intentionally debounced by 300 ms and rendered through `VirtualizedExploreList` (`packages/frontend/src/components/Explorer/ExploreSideBar/BasePanel.tsx:35-77`, `:192-204`). Do not add a fixed sleep: type into the search box and wait for a unique `Users` locator to become visible/clickable.
- Mutations are asynchronous React Query operations. Wait for the POST/PUT response (201) and then the specific success toast before navigating; the hooks invalidate/refetch attributes before emitting success (`packages/frontend/src/hooks/useUserAttributes.ts:38-47`, `:72-81`).
- Query completion is asynchronous polling (`packages/frontend/src/features/queryRunner/executeQuery.ts:15-38`). Use web-first assertions with a 30-second timeout for result/error state, matching source timeouts at `packages/e2e/cypress/e2e/app/userAttributes.cy.ts:92` and `:168`; do not use `waitForTimeout`.
- Negative field assertions must first establish that the selected explore finished loading (for example, a stable sidebar heading/known accessible field). Otherwise immediate `not.toBeVisible()` can pass while the field tree is still loading. The source does not establish that readiness at `:136-141` or `:184-189`.
- Retries are unsafe unless each test recreates its own preconditions. Use `try/finally` cleanup and idempotent delete-by-name setup so a failed attempt does not poison its retry.

## Locator and strictness risks

- `findByText('Users')` (`packages/e2e/cypress/e2e/app/userAttributes.cy.ts:29`, `:62`, `:87`, `:140`, `:163`, `:188`) can match more than one rendered occurrence and is inside a virtualized tree. Scope to the explore sidebar/list and use an exact accessible name.
- `findByText('First name')`/`findByText('Last name')` are unscoped (`:30`, `:63`, `:88`, `:141`, `:164`, `:189`). Scope to the selected `Users` field tree; Playwright strict mode will reject duplicate visible labels.
- `cy.get('button').contains('Run query')` (`:33`, `:66`, `:91`, `:167`) should become `getByRole('button', { name: /Run query/ })`, scoped to the explorer if necessary.
- Global `contains('Anna')`, `contains('Christina')`, and especially `contains('W.')` (`:67`, `:92`, `:168`) can match unrelated chrome/toasts. Scope assertions to the results table. `W.` is not unique in the source dataset, although the `customer_id=30` filter should reduce the query to Christina.
- `contains('Success')` (`:55`, `:81`, `:156`, `:182`) is broad. Assert the specific create/update toast text emitted by `packages/frontend/src/hooks/useUserAttributes.ts:42-46` or `:77-81`, and pair it with the response assertion.
- Row editing uses `contains(name).parents('tr').find('button').first()` (`packages/e2e/cypress/e2e/app/userAttributes.cy.ts:73`, `:174`). The row action `ActionIcon` has no accessible label (`packages/frontend/src/components/UserSettings/UserAttributesPanel/index.tsx:123-153`). Scope to the exact row; until the application adds a label, a local `row.getByRole('button').first()` is the least-bad port and should be documented.
- `.mantine-8-Pill-remove` (`packages/e2e/cypress/e2e/app/userAttributes.cy.ts:76`, `:177`) is library/version CSS. Prefer the pill’s accessible remove button scoped to the modal; confirm its actual accessible name during implementation rather than guessing.
- `findByText('demo@lightdash.com')` targets an option rendered in a Mantine portal (`:49-50`, `:150-151`). Use `getByRole('option', { name: 'demo@lightdash.com', exact: true })` after filling the combobox.
- `input[name="name"]` is stable but less semantic (`:47`, `:148`); prefer `getByRole('textbox', { name: 'Attribute name' })`. TagsInput values require Enter to commit (`:51-53`, `:77-79`, `:152-154`, `:178-180`).

## Nonstandard or surprising behavior

- The spec is deliberately stateful across test boundaries and leaves both attributes behind; there is no cleanup.
- The second `customer_id` creation suppresses all HTTP failures and asserts nothing (`packages/e2e/cypress/e2e/app/userAttributes.cy.ts:102-120`). With the current contract it is both a likely duplicate and malformed because `groups` is missing.
- The source names `customerIdAttr` while searching for `is_admin` (`:124-130`), which is harmless but misleading.
- The first TODO asks to consolidate list/create/edit/delete and “don't run queries” (`:5`), yet four tests specifically assert query behavior. Product/test ownership must decide whether those checks remain UI E2E, move to API/backend tests, or are removed.
- The required-attribute suite title and assertions refer to `Users.last_name`, but checked-in metadata does not guard that dimension. This is not a locator issue; the tested behavior and fixture disagree.
- `cy.session` may reuse authentication across all tests, but every `beforeEach` validates it with GET `/api/v1/user` (`packages/e2e/cypress/support/commands.ts:152-172`). Playwright’s project-level storage state provides equivalent session reuse.
- No downloads/uploads, popups, iframes, clipboard, canvas/SVG assertions, Monaco, drag-and-drop, browser API, timezone dependency, or spec-level environment variable appears. The only nonstandard UI mechanics are Mantine portals/TagsInput, virtualization, search debounce, and async query polling.

## Coordination requirements

- Do not run the Cypress source and Playwright port concurrently against the same preview/database. Both mutate the same organization-unique names and can delete each other’s attributes.
- Do not run this port concurrently with any test or manual activity using `customer_id` or `is_admin` in seed organization `172a2270-000f-42be-9c68-c4752c23ae51`.
- The existing Playwright configuration already serializes to one worker (`packages/e2e/playwright.config.ts:9-13`), which protects Playwright specs from each other only within that invocation; it does not protect against Cypress or another CI job.
- No new shared helper is justified. Keep delete-by-name/create/cleanup API functions local to the target spec. Reuse only existing admin storage state from `packages/e2e/playwright/auth.setup.ts`.
- Before implementation, resolve which checked-in field should demonstrate `required_attributes`. That fixture decision may require coordination with the example-project owner, but this migration should not alter application/dbt files merely to preserve a stale assertion.

## Exact port plan

1. Create only `packages/e2e/playwright/app/userAttributes.spec.ts`; use existing admin storage state and import `SEED_PROJECT` plus the seeded admin UUID/constants from `@lightdash/common`.
2. Add file-local typed API utilities using Playwright `APIRequestContext` to list attributes, delete an exact name if present, create an attribute with explicit `users`, `groups: []`, and `attributeDefaults: null`, and assert every response. Do not add shared infrastructure.
3. Port the SQL-filter state machine as one Playwright test: delete `customer_id`; verify the missing-attribute result error; create `customer_id=20` through UI; query and scope `Anna` to results; edit through UI to `30`; query and scope `Christina` to results. Wrap the flow in `try/finally` and delete `customer_id` in cleanup.
4. Do not port `Delete customer_id attribute` as an independent test; it is precondition/cleanup. Likewise do not port the second suite’s `Create customer_id attribute` or `Delete is_admin attribute` as tests.
5. After fixture clarification, port required-attribute behavior as one independent Playwright test. Its setup must create/assert `customer_id=30`, delete `is_admin`, and verify the agreed guarded dimension absent; create `is_admin=true` through UI and verify it visible/queryable; edit to `false` and verify it absent. Clean up both exact attribute names in `finally`.
6. Scope explorer, row, modal, option, toast, and results locators. Use role/label locators where available; isolate the current unnamed row action button and pill-remove fallback to the smallest local locator.
7. Use response assertions and web-first state assertions, not fixed sleeps. Give warehouse result/error assertions 30 seconds; establish field-tree readiness before negative assertions.
8. Keep the target file serial/self-contained. It still requires an exclusive coordination lane because exact DBT attribute names cannot be randomized.
9. If the line-5 TODO is authoritative and query checks should be removed, reduce the first flow to one UI CRUD test and place SQL substitution/filtering assertions in backend/API tests rather than driving browser UI. This decision must be made before implementation.

## Verification plan

Run from repository root after the port and after resolving the fixture question:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e lint
pnpm -F e2e format
pnpm -F e2e playwright:run --project=firefox playwright/app/userAttributes.spec.ts
```

Run the targeted Playwright command once from a clean attribute state and once again without resetting the database to prove idempotent setup/cleanup. Do not dual-run the Cypress source during verification. No commands were run during discovery that installed dependencies, seeded/migrated the database, or launched a browser.

## Open questions

1. What is the intended current guarded dimension? `Users.last_name` has no `required_attributes` (`examples/full-jaffle-shop-demo/dbt/models/users.yml:14-17`), while `Customers.age` is guarded by `is_admin=true` (`examples/full-jaffle-shop-demo/dbt/models/customers.yml:166-175`). The second flow cannot be ported faithfully until this is resolved.
2. Is the TODO at `packages/e2e/cypress/e2e/app/userAttributes.cy.ts:5` an instruction to remove all SQL-filter query checks, or only to consolidate them? If removed, which backend/API coverage is authoritative for missing/value substitution?
3. Was the second suite intended to be independently runnable? Its setup omits required `groups`, ignores every creation outcome, and currently relies on the first suite’s leftover `customer_id=30` (`:102-120`).
4. Is demo-mode mutation blocking guaranteed off in every Playwright preview lane? Create/update/delete all use `unauthorisedInDemo` (`packages/backend/src/controllers/userAttributesController.ts:65-70`, `:93-98`, `:121-126`).
5. What accessible name, if any, does Mantine expose for the TagsInput pill remove control in the supported browser? Confirm during implementation before choosing a fallback locator.

## Port history

Not started.

### 2026-07-18 — Playwright port

- Target: `packages/e2e/playwright/app/userAttributes.spec.ts`.
- Ported two independent `@mutating` browser contracts: `customer_id` missing/20/30 SQL-filter results and `is_admin` false/true/false visibility for `Customers.age`.
- Cypress setup-only cases were folded into file-local exact-name API setup/UUID cleanup, not preserved as tests. There were no skipped tests to port.
- UI create/update mutations assert 201 responses and canonical payloads (`groups: []`, `attributeDefaults: null`); query clicks assert the intentional 403 or successful 200 metric-query response. Field absence waits for the loaded tree and stable `Customer id` field before applying search.
- The exact old-value pill scopes its structural remove button; no generated Mantine CSS selector remains. The external Headway widget is blocked file-locally because its incidental iframe can prevent page load completion.
- Verification from repository root after a clean reset/reseed:
  - `pnpm -F e2e typecheck:playwright` — passed.
  - `pnpm -F e2e lint` — passed.
  - `pnpm -F e2e format` — passed.
  - Playwright discovery for the target — two Firefox tests discovered, plus auth setup.
  - Firefox `customer_id` focused run, `--workers=1` — 2/2 passed including auth setup.
  - Firefox `is_admin` focused run, `--workers=1` — 2/2 passed including auth setup.
  - Full target Firefox run, `--workers=1` — 3/3 passed including auth setup.
  - Full target Firefox run with `--repeat-each=2`, `--workers=1` — 5/5 passed including auth setup.
  - Full Firefox `--grep @mutating --workers=1` lane — 3/3 passed including auth setup.
  - Post-run API ledger check — no active `customer_id` or `is_admin` attributes remained.
- Earlier interrupted attempts coincided with the documented infrastructure outage, cold Vite route compilation, and host Maintenance Sleep; they were discarded by the clean reset and are non-gating. Remaining risk: the fixed organization-wide names still require the serialized mutation lane.
- Commit: pending signed commit.
