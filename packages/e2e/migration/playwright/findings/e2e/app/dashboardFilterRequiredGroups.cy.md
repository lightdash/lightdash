# packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts

## Classification

Recommended runner: Playwright
Execution lane: Feature-flagged browser E2E, authenticated Firefox, serial shared seed project
Active tests: 3
Skipped tests: 0
Persistent mutation: Yes — three dashboards are created; cleanup deletes them and may leave soft-deleted rows
Shared-preview dual-run safe: No as written; fixed names plus delete-by-name can collide. The port can be safe with run-unique names and UUID cleanup.
Difficulty total: 13/18 (persistent/shared state 3, browser interaction complexity 3, environment/external dependencies 3, synchronization/flakiness 3, authentication/authorization 1, cross-file infrastructure 0)
Coordination keys: `project:3675b69e-8324-4110-bdca-059031aa8da3`; `feature-flag:dashboard-filter-requirements`; `seed-chart:How much revenue do we have per payment method?`; the three dashboard names at `packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:13-15`
Analysis status: analyzed

This belongs in Playwright, not API tests: every test verifies rendered locked-tile state, a guided modal, filter-chip/autocomplete interaction, live unlock, and ECharts mounting (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:134-164,193-232,248-254`). API setup and cleanup should remain API-driven.

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `locks the dashboard until any filter in the required group has a value` | Active | Creates a dashboard with two disabled filters sharing `requiredGroupId: 'g1'`; proves the guided card and locked placeholder appear without a chart query, dismisses the card, then sets only Payment method through the toolbar and proves the any-of group unlocks and renders the chart (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:120-165`). | Creates one dashboard in the seed project; view-mode filter selection changes in-memory state and the URL override, not the saved dashboard; suite cleanup deletes dashboards by name. | Request counting through `@chartQuery.all`, Mantine autocomplete portal, forced `Apply` click, ECharts wrapper assertion. | `packages/e2e/playwright/app/dashboardFilterRequiredGroups.spec.ts` |
| `completes setup through the guided card and unlocks live` | Active | Creates two requirement rules (one singleton and one one-member group), verifies the editor note and `0 of 2`, sets Payment method, verifies its collapsed summary, sets Order status, then proves live unlock and chart rendering (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:167-233`). | Creates one dashboard; viewer choices become URL overrides only; suite cleanup deletes by name. | Initial field-search wait, disabled-while-loading input, portal options, first-input ordering after collapse, a 15-second option timeout, and ECharts. | Same Playwright spec; keep as a separate test. |
| `locks a dashboard with a singleton required filter and shows the guided card` | Active | Creates one `required: true` filter and proves the singleton is represented as one guided rule while the tile and chart query remain blocked (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:235-255`). | Creates one dashboard; no filter value mutation; suite cleanup deletes by name. | Negative network assertion and guided-card count. | Same Playwright spec; keep as a separate test. |

There are no `.skip`, `describe.skip`, conditional skips, or inherited skipped suites. The comments at `packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:1-3` are an environment prerequisite, not a skip. All three tests need Playwright; none should move to API/CLI/unit tests or be removed.

## Cypress command expansion

### Local setup helper

`createDashboardWithFilters` is local rather than a registered command (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:51-104`):

1. `GET api/v1/projects/${SEED_PROJECT.project_uuid}/charts`, require 200, and select the first chart whose name exactly equals `How much revenue do we have per payment method?` (`:56-67`). The endpoint requires an authenticated registered account (`packages/backend/src/controllers/projectController.ts:169-190`).
2. Build a one-tile `CreateDashboard` using that saved-chart UUID, the supplied dimension filters, no metric/table-calculation filters, no tabs, and optional config (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:69-91`).
3. `POST api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`, require 201, and yield `body.results.uuid` (`:93-103`). Creation is authenticated, blocked in demo mode, and delegated to `DashboardService.createFromAccount` (`packages/backend/src/controllers/projectController.ts:955-1002`). The service resolves the first viewable space because no `spaceUuid` is provided and checks `create Dashboard` permission (`packages/backend/src/services/DashboardService/DashboardService.ts:1029-1084`).

The filter factories create disabled, empty `EQUALS` dimension rules for `payments_payment_method` and `orders_status`; callers add `required` or `requiredGroupId` (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:21-49`).

### `cy.login()`

Called before every test and again in the suite `after` hook (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:107-113`). It creates/restores a `cy.session` keyed by the seed admin email, logs in through `POST api/v1/login`, requires 200, and validates restored sessions with `GET api/v1/user` requiring 200 (`packages/e2e/cypress/support/commands.ts:152-172`). The account is the organization admin `demo@lightdash.com` with password `demo_password!` (`packages/common/src/index.ts:465-481`). Playwright already creates equivalent admin storage state through those endpoints (`packages/e2e/playwright/auth.setup.ts:10-23`) and applies it to Firefox (`packages/e2e/playwright.config.ts:33-40`); add no auth helper.

### `cy.deleteDashboardsByName()`

The suite-level cleanup passes all three fixed names (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:111-118`). The command lists every dashboard in the seed project, deletes every result whose name is in the supplied array through `DELETE api/v1/dashboards/{uuid}`, and requires each response to be 200 (`packages/e2e/cypress/support/commands.ts:412-431`). The route is authenticated and permission-checked (`packages/backend/src/routers/dashboardRouter.ts:89-109`; `packages/backend/src/services/DashboardService/DashboardService.ts:1854-1890`). Depending on server configuration, deletion is soft or permanent (`packages/backend/src/services/DashboardService/DashboardService.ts:1943-1959`).

### Testing Library commands

`findByTestId`, `findAllByTestId`, `findByText`, `findAllByText`, `findByPlaceholderText`, `findAllByPlaceholderText`, and `findByRole` are registered by `@testing-library/cypress/add-commands` (`packages/e2e/cypress/support/commands.ts:35-47`). In Playwright they map directly to `getByTestId`, `getByText`, `getByPlaceholder`, and `getByRole`, with `expect(locator)` providing retrying assertions. No wrapper is warranted.

## State, seed, and environment assumptions

- The server must enable `dashboard-filter-requirements`; with it disabled the app deliberately uses the legacy required-filter UX and ignores `requiredGroupId` (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:1-3`; `packages/common/src/types/featureFlags.ts:171-178`). The backend reads comma-separated IDs from `LIGHTDASH_ENABLE_FEATURE_FLAGS` (`packages/backend/src/config/parseConfig.ts:3079-3087`), and preview compose enables this exact flag (`docker/docker-compose.preview.yml:102-106`).
- The fixed seed project is Jaffle shop, UUID `3675b69e-8324-4110-bdca-059031aa8da3` (`packages/common/src/index.ts:550-557`). It must be compiled and have a viewable default space because dashboard creation omits `spaceUuid`.
- The exact saved chart must exist. The development seed creates it against the `payments` explore with dimension `payments_payment_method` (`packages/backend/src/database/seeds/development/02_saved_queries.ts:39-53`). The source takes the first exact-name match, so duplicate exact names make chart selection nondeterministic (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:62-67`). The port should fail clearly unless exactly one match exists rather than silently choosing an arbitrary duplicate.
- Warehouse/compiled metadata must include `payments_payment_method`, `orders_status`, and the `credit_card` payment value. Payment method is a demo model field (`examples/full-jaffle-shop-demo/dbt/models/customer_order_payments.yml:167-168`). Order status autocomplete is metadata-backed (`fetch_from_warehouse: false`) and maps `completed` to `Completed order` (`examples/full-jaffle-shop-demo/dbt/models/orders.yml:288-305`).
- Authentication is the seeded organization admin. It must be a registered account, have access to the seed project's default space, and be allowed to create/delete dashboards; API middleware also rejects writes when the server is in demo mode (`packages/backend/src/controllers/projectController.ts:955-965`).
- Cypress caches the login cookie session across tests. There is no required local/session storage beyond authentication. Guided-card dismissal is component state lasting only until reload (`packages/frontend/src/features/dashboardTabs/index.tsx:591-604`). Viewer filter changes are serialized into the URL `filters` parameter (`packages/frontend/src/providers/Dashboard/DashboardProvider.tsx:1108-1132`) and are not persisted to the dashboard API.
- The three tests are behaviorally independent and create distinct dashboard names. The final test's comment that chip unlock is covered above is only coverage commentary, not a runtime ordering dependency (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:248-250`).
- Failed attempts/retries can create duplicate fixed-name dashboards before suite cleanup. A process crash or missing `after` leaves rows behind. Name-based cleanup can delete dashboards created by another Cypress/Playwright run or a preexisting dashboard with the same name.

## Synchronization and timeout requirements

- Intercepts are registered before dashboard creation/navigation, so request observation cannot miss an early chart request (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:120-132,167-191,235-246`). In Playwright, register request listeners or `waitForRequest` promises before `page.goto` or before the action that unlocks.
- The locked-state negative assertion occurs only after the guided card and placeholder are visible. Track matching POST requests from before navigation and then assert the collected count is zero; do not use `networkidle` or a sleep (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:134-143`).
- Toolbar unlock waits for the dashboard-chart POST after Apply, then relies on retrying DOM assertions for placeholder removal and ECharts mounting (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:151-164`). Create the Playwright `waitForRequest` promise before clicking Apply.
- Guided setup explicitly waits for the initial Payment method field-search POST because the focused autocomplete is disabled while it is in flight (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:171-175,193-203`). The frontend field-value flow can poll async results for roughly 30 seconds before its own timeout (`packages/frontend/src/hooks/useFieldValues.ts:128-178`), while Cypress's normal command timeout is 10 seconds and only the `Completed order` option gets 15 seconds (`packages/e2e/cypress.config.ts:16-22`; `packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:220-223`). Preserve the explicit 15-second option allowance and wait for the first input to become enabled rather than adding fixed delays.
- The final guided option instantly updates view-mode filter state; setting it can unlock before the click returns. Establish the dashboard-chart request promise before selecting `Completed order`, then await both card removal and the request (`packages/frontend/src/features/dashboardFilters/FilterRequirements/useUpdateDashboardFilterRule.ts:10-49`; `packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:215-232`).
- A dashboard-chart POST starts an async query; it is not proof that rendering is complete. Keep the separate ECharts visibility assertion. The hook posts to `/api/v2/projects/{projectUuid}/query/dashboard-chart` only once chart/explore/dashboard data are available (`packages/frontend/src/hooks/dashboard/useDashboardChartReadyQuery.ts:20-33,281-319`).
- Cypress run mode retries twice by default; Playwright retries only in CI and uses 10-second assertions, 10-second actions, and 30-second navigation (`packages/e2e/cypress.config.ts:18-23`; `packages/e2e/playwright.config.ts:4-13,20-26`). Avoid depending on retries for setup cleanup.

## Locator and strictness risks

- `guided-filter-setup` and `unmet-requirements-placeholder` are stable test IDs (`packages/frontend/src/features/dashboardFilters/FilterRequirements/GuidedFilterSetup.tsx:270`; `packages/frontend/src/components/DashboardTiles/UnmetRequirementsPlaceholder.tsx:7-10`). Scope subtitle, progress, summary, and input assertions to the guided-card locator.
- `any value` is intentionally non-unique when a rule has multiple members. The source uses `.first()`, relying on requirement first-appearance order and on the satisfied first rule collapsing before the second selection (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:199-203,208-217`). Common rule derivation preserves dimensions-first/first-appearance order and appends same-group members (`packages/common/src/utils/filters.ts:1557-1597`). Preserve the explicit `.first()` only where this ordering is the behavior under test.
- Autocomplete options render through a portal outside the card (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:205-206,219-223`; `packages/frontend/src/features/dashboardFilters/FilterRequirements/GuidedFilterSetup.tsx:420-436`). Find the visible exact-name option from `page`, not from the card.
- `cy.contains('button', 'Payment method')` and the global `Apply` lookup are broader than Playwright strict mode permits (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:152-155`). Use exact role/name for the filter chip and scope Apply to the visible filter popover. Do not copy `{ force: true }` unless an actual actionability defect is reproduced.
- `Change` is safe only while scoped to the card; `Loading chart` and `.echarts-for-react` are global implementation-level checks. The CSS class proves ECharts mounted but does not validate canvas/SVG pixels (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:139-140,163-164,209-213`).
- The card is a Mantine modal with accessible name `Set filters to load this dashboard`; it is withheld while filterable fields load (`packages/frontend/src/features/dashboardFilters/FilterRequirements/GuidedFilterSetupOverlay.tsx:31-52`). The modal role/name can anchor strict scoping if the test ID is unavailable during initial loading.

## Nonstandard or surprising behavior

- `required: true` is a singleton rule; filters sharing `requiredGroupId` are one any-member rule. Disabled/empty members are unsatisfied, and any non-valueless member satisfies the group (`packages/common/src/utils/filters.ts:1546-1615`). This explains why one Payment method value unlocks the first dashboard and why the guided test reports two rules rather than three filters.
- The dashboard fails closed while a group-bearing dashboard's feature-flag request is unresolved, preventing an unfiltered chart query; once the flag resolves off, group IDs are ignored and legacy behavior applies (`packages/frontend/src/providers/Dashboard/DashboardProvider.tsx:1654-1688`).
- Locked saved-chart tiles do not mount `ChartTile`; with the flag enabled they mount a skeleton tile containing the unmet-requirements placeholder. Therefore zero dashboard-chart requests is a structural behavior, not merely a canceled request (`packages/frontend/src/features/dashboardTabs/GridTile.tsx:36-77`).
- Dismissing the guided card only hides the overlay for that page lifetime; it does not satisfy requirements or unlock tiles (`packages/frontend/src/features/dashboardTabs/index.tsx:591-604`; `packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:145-149`).
- Guided-card changes apply immediately and collapse satisfied rules to a summary with `Change`; the toolbar flow has a separate Apply button (`packages/frontend/src/features/dashboardFilters/FilterRequirements/GuidedFilterSetup.tsx:143-175,246-257,313-441`).
- The UI auto-scrolls the first unmet rule and uses a scroll area capped by viewport height (`packages/frontend/src/features/dashboardFilters/FilterRequirements/GuidedFilterSetup.tsx:232-243,307-312`), but the tested two-rule case should not need manual scrolling at the configured 1920×1080 viewport.
- There are no downloads/uploads, browser popups, iframes, clipboard access, Monaco, virtualization, drag-and-drop, timezone assertions, or direct environment-variable reads in the spec. The only canvas/SVG-adjacent behavior is ECharts mounting.

## Coordination requirements

A literal dual run is unsafe: both runners would create the same fixed names, and Cypress's suite cleanup deletes every matching dashboard rather than only its own UUIDs (`packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts:13-15,111-118`; `packages/e2e/cypress/support/commands.ts:412-431`). Retries have the same duplicate-name risk.

No shared helper or infrastructure change is justified. Keep dashboard creation, request tracking, and UUID cleanup local to the one Playwright spec; reuse only existing admin storage state. Make Playwright dashboard names run-unique (Playwright-specific base plus `crypto.randomUUID()`), record every returned UUID immediately, and delete only those UUIDs in `afterEach`. This makes concurrent Cypress/Playwright execution safe because Cypress's exact-name cleanup cannot match the Playwright names.

The environment coordinator must ensure the server—not merely the test process—was started with `dashboard-filter-requirements` enabled. The seed project/chart and warehouse are shared read dependencies and must not be reset or deleted during the run.

## Exact port plan

1. Create `packages/e2e/playwright/app/dashboardFilterRequiredGroups.spec.ts`; use existing admin storage state and import the dashboard/filter types plus `SEED_PROJECT` from `@lightdash/common`. Do not add a shared helper.
2. Recreate `paymentMethodFilter` and `orderStatusFilter` as local factories. Add a local API setup function that lists charts, requires exactly one exact-name seed chart, creates a one-tile dashboard with the supplied filters/config, validates 200/201 responses, and records its UUID.
3. Generate a unique Playwright dashboard name per test. In `test.afterEach`, delete recorded UUIDs directly and assert successful responses; never list/delete by name. Clear the local UUID collection even when an assertion fails.
4. Port all three tests one-for-one. Register a local request collector for POST `/api/v2/projects/*/query/dashboard-chart` before navigation. Use it for the two zero-query checks and create action-specific `page.waitForRequest` promises before Apply/final-option clicks.
5. In the group test, assert the guided card, placeholder, no loading text/ECharts/query, dismiss via exact text, operate the exact Payment method chip, select the portal option, scope Apply to the visible popover, and assert request, unlock, and ECharts mounting.
6. In the guided test, register the Payment method search response wait before navigation, scope note/progress/inputs to the card, wait for the first input to enable, select portal options from `page`, verify the collapsed summary, give `Completed order` 15 seconds, and assert live card removal/query/unlock/ECharts.
7. In the singleton test, assert placeholder, card, `0 of 1 set`, and zero collected chart queries after locked UI is visible.
8. During migration removal, delete `packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts` only after parity passes. Update the source-name-only comment at `docker/docker-compose.preview.yml:102-106` from the Cypress filename to the Playwright filename; do not change the feature-flag value or Playwright configuration.

## Verification plan

Prerequisite: confirm the backend serving `PLAYWRIGHT_BASE_URL` was started with `LIGHTDASH_ENABLE_FEATURE_FLAGS` containing `dashboard-filter-requirements` (preview compose already does this at `docker/docker-compose.preview.yml:106`). Then run from repository root:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e run linter ./playwright/app/dashboardFilterRequiredGroups.spec.ts
pnpm -F e2e run formatter ./playwright/app/dashboardFilterRequiredGroups.spec.ts --check
pnpm -F e2e exec playwright test playwright/app/dashboardFilterRequiredGroups.spec.ts --project=firefox
```

For dual-run validation, use a disposable/shared preview with the flag enabled and run the assigned Cypress spec and target Playwright spec concurrently only after the Playwright port uses unique names and UUID-only cleanup. Verify both pass and that no active Playwright-named dashboards remain. Do not use concurrent validation with a literal fixed-name port.

## Open questions

- Preview compose enables the required flag, but no evidence inspected here proves the always-running local backend does. Confirm the server process's effective `LIGHTDASH_ENABLE_FEATURE_FLAGS` before executing the port.
- Dashboard deletion may be soft deletion depending on deployment configuration (`packages/backend/src/services/DashboardService/DashboardService.ts:1943-1959`). The existing test accepts that historical rows can remain; confirm whether migration policy requires stronger test-data reclamation before changing cleanup semantics.

## Port history

Not started.
