# Skipped suite disposition

Coordination key: `skipped-suite-disposition`

## Affected files

| Cypress source | Current coverage | Disposition | Replacement / target lane |
|---|---:|---|---|
| `packages/e2e/cypress/e2e/app/customDimensions.cy.ts` | 0 active, 4 skipped | Do not port to Playwright. Retire after prerequisite C1. | Backend Vitest only. |
| `packages/e2e/cypress/e2e/app/formats.cy.ts` | 0 active, 1 skipped | Do not port. Retire with no new test. | Existing Common Vitest coverage is authoritative. |
| `packages/e2e/cypress/e2e/app/projectPermission.cy.ts` | 0 active, 5 skipped | Do not port. Retire after prerequisite C2. | Existing API tests plus one read-only org-editor API assertion. |
| `packages/e2e/cypress/e2e/app/tableCalculation.cy.ts` | 0 active, 4 skipped | Do not port. Retire after prerequisite C3. | Backend Vitest and API tests only. |
| `packages/e2e/cypress/e2e/app/userAttributes.cy.ts` | 13 active, 0 skipped | Port current browser behavior as two independent atomic tests; do not port setup cases as tests. | Existing serialized `@mutating` Firefox lane. |

The related findings are the evidence record. This contract does not edit or append to them.

## Evidence

- The first four suites execute no tests today. Their source comments ask for unit tests or removal, so activating copied browser flows would create coverage rather than migrate authoritative coverage.
- `customDimensions` already has fixed-bin, custom-SQL, reference-compilation, and unselected-dimension coverage. The distinct missing contract is an additional `MAX` metric derived from an unselected SQL custom dimension.
- `formats` conflicts with current Common expectations: stale Cypress expects integer default EUR/GBP/DKK output, while current formatter tests require ISO-default decimal places. Current Common behavior wins.
- `projectPermission` already covers member/no-project (403) and member/project-editor (200) through API tests. Greetings and global `Browse` text are incidental, feature-sensitive smoke assertions. The remaining stable policy is that a seeded organization editor can read the seed project without an explicit project grant.
- `tableCalculation` already covers running-total SQL. The stable gaps are rank template compilation and typed string/number table-calculation result filtering; old Ace/Monaco, positional menu, icon-class, and exact seed-value interactions are not contracts.
- `userAttributes` is active and genuinely exercises browser CRUD and field visibility. It is currently an ordered state machine over organization-unique names and has no cleanup. `Users.last_name` is not guarded in checked-in metadata; `Customers.age` is guarded by `is_admin: "true"`, so the checked-in fixture is authoritative.

## Decision and stable contract

1. A skipped Cypress body is not copied to Playwright and is never re-enabled merely for parity. Preserve only the stable behavior listed below in its natural runner.
2. `customDimensions`: C1 adds exactly one QueryBuilder snapshot case in the existing custom-dimension suite. Select the derived additional `MAX` metric, do not select its source custom dimension, and prove SQL contains the inlined metric expression but not the source dimension's selected alias. Exact warehouse results and UI mechanics are retired.
3. `formats`: add nothing. Default legacy currencies keep the current Common decimal behavior. Existing currency, percent, km/mi, and explicit-round tests are the retirement gate.
4. `projectPermission`: C2 adds one API assertion using the existing seeded editor login and `SEED_PROJECT`; `GET /api/v1/projects/{projectUuid}` must return 200 without provisioning a user or project grant. Existing member cases remain authoritative. Settings-menu, greeting, and `Browse` assertions are retired.
5. `tableCalculation`: C3 adds the missing backend `RANK_IN_COLUMN` compiler case and one API-test file with two read-only metric-query cases: typed string calculation plus `startsWith`, and typed number calculation plus `greaterThan`. Assert the named calculation field and predicate outcome, not the old exact seed matrix. Existing running-total coverage remains unchanged. Icon CSS and legacy SQL-modal interaction are retired.
6. `userAttributes`: target `packages/e2e/playwright/app/userAttributes.spec.ts` under the normal Playwright config, with every active test inside a file-level describe/test tagged `@mutating`. It contains only:
   - one self-contained `customer_id` test: delete exact name, assert missing-attribute query error, create value `20` through UI, assert `Anna` in results, edit to `30`, assert `Christina`, and delete the exact name in `finally`;
   - one self-contained `is_admin` test against `Customers.age`: delete exact name and assert `Age` absent after the field tree is ready, create `true` through UI and assert `Age` visible/queryable, edit to `false` and assert `Age` absent, then delete the exact name in `finally`.
7. User-attribute API setup must send `groups: []`, assert every response, resolve attributes by exact name, and delete only the resolved UUID. Keep helpers file-local. Both tests must pass alone, in either order, and on retry; neither may depend on another test's residue.

## Branch and ownership strategy

All branches use isolated worktrees. No dependent branch edits another dependent's target.

| ID | Branch/base | Owner | Allowed files | Signed commit intent |
|---|---|---|---|---|
| C1 | `fix(e2e)/cover-custom-dimension-retirement`, from this coordination commit | skipped-suite coordinator | Existing custom-dimension QueryBuilder test and generated snapshot only | Cover the unselected-source additional metric. |
| C2 | `fix(e2e)/cover-project-permission-retirement`, from this coordination commit | skipped-suite coordinator | `packages/api-tests/tests/organizationPermissions.test.ts` only | Cover seeded org-editor project access without mutation. |
| C3 | `fix(e2e)/cover-table-calculation-retirement`, from this coordination commit | skipped-suite coordinator | Existing backend compiler test plus new `packages/api-tests/tests/tableCalculations.test.ts` only | Cover rank compilation and typed calculation filters. |
| U1 | `fix(e2e)/migrate-user-attributes`, based on `chore/e2e-mutating-playwright-lane` | `userAttributes` port owner | `packages/e2e/playwright/app/userAttributes.spec.ts` and its append-only findings history only | Port the two atomic browser contracts into the approved lane. |
| R1 | `fix(e2e)/retire-triaged-cypress-suites`, after C1-C3 | migration orchestrator | The four fully skipped Cypress sources and orchestrator-owned manifest/history updates | Cleanup only after C1-C3 gates pass. |

C1, C2, and C3 are separate future coordinator commits; none belongs in this planning commit. They are independent siblings. The signed lane commit `14fef47a3e` already owns workflow ordering and selection, so this key must not add Playwright configuration or CI jobs. U1 is based on `chore/e2e-mutating-playwright-lane`, not on C1-C3. R1 waits for C1-C3. Only the orchestrator changes `manifest.json` or deletes Cypress sources.

## Runner and isolation contract

### Unit/API replacements

- C1 and the backend part of C3 run in package Vitest and need no preview.
- C2 uses seeded `loginAsEditor`; it creates no users, grants, or named content and may run in the normal `api-tests` lane.
- C3 API queries use generated query UUIDs, create no named content, poll to `ready` with a bounded approximately 60-second deadline, and may run in the normal `api-tests` lane with bounded concurrency.
- No replacement introduces a Playwright helper, page object, Cypress command, test enum, or shared state module.

### User attributes

U1 reuses the approved `mutating-preview-isolation` contract and signed lane commit `14fef47a3e` without modification:

- use the normal `playwright.config.ts`, existing `firefox` project, admin storage state, and 1920x1080 viewport;
- tag the file-level describe/test `@mutating`; existing smoke excludes that tag, while existing `playwright-mutating` selects it with `--grep @mutating --workers=1 --pass-with-no-tests`;
- `playwright-mutating` starts only after the full `app-tests` matrix and read-only Playwright smoke complete, so Cypress remains authoritative and the known Cypress writer has released the PR preview before U1 starts;
- under the lane's exact-name exclusive lease, no Cypress/Playwright/API/manual writer may use organization `172a2270-000f-42be-9c68-c4752c23ae51` attribute names `customer_id` or `is_admin` during U1 setup, browser actions, assertions, or cleanup;
- no concurrent Cypress/Playwright parity run is permitted. Compare source and target sequentially under the orchestrator's mutation lease. U1 normalizes dirty Cypress residue on entry and removes both owned names in `finally`;
- retries are allowed only because each atomic test performs idempotent exact-name setup and cleanup. Run the focused target with `--repeat-each=2` on one preview before Cypress retirement.

Do not add another config, project, tag, job, or ordering dependency. Any newly discovered writer of either exact key must join the existing `@mutating` lease or block U1.

## Dependency graph and gates

```text
coordination commit
├── C1 ──> customDimensions retirement gate ──┐
├── C2 ──> projectPermission retirement gate ├──> R1 skipped-source cleanup
├── C3 ──> tableCalculation retirement gate ─┘
├── formats existing Common gate ────────────┘
└── approved lane 14fef47a3e ──> U1 focused/repeat ──> full @mutating lane ──> userAttributes Cypress cleanup (later orchestrator change)
```

A dependent is green only when its own focused command and destination package checks pass; sibling commits are never required for that result. Do not run or copy any skipped Cypress body as a gate.

## Verification

C1:

```bash
pnpm -F backend test -- src/utils/QueryBuilder/metricQueryBuilderSnapshots/customDimensionQueries.test.ts
pnpm -F backend typecheck:fast
pnpm -F backend lint
pnpm -F backend format
```

Formats retirement gate:

```bash
pnpm -F common test -- src/utils/formatting.test.ts
pnpm -F common typecheck:fast
pnpm -F common lint
pnpm -F common format
```

C2:

```bash
pnpm -F api-tests exec vitest run --config vitest.config.ts tests/organizationPermissions.test.ts
pnpm -F api-tests lint
pnpm -F api-tests typecheck
```

C3:

```bash
pnpm -F backend test -- src/tableCalculationTemplateQueryCompiler.test.ts
pnpm -F backend typecheck:fast
pnpm -F backend lint
pnpm -F backend format
pnpm -F api-tests test:api -- tests/tableCalculations.test.ts
pnpm -F api-tests lint
pnpm -F api-tests typecheck
```

U1, only after the app-test matrix releases the existing `@mutating` attribute-name lease:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e linter ./playwright/app/userAttributes.spec.ts
pnpm -F e2e formatter ./playwright/app/userAttributes.spec.ts --check
PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" pnpm -F e2e exec playwright test playwright/app/userAttributes.spec.ts --project=firefox --workers=1
PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" pnpm -F e2e exec playwright test playwright/app/userAttributes.spec.ts --project=firefox --workers=1 --repeat-each=2
```

Before cleanup, run each affected destination's full suite in its own lane. The existing serialized Playwright command is `pnpm -F e2e exec playwright test --project=firefox --grep @mutating --workers=1`; U1 must not run in smoke.

## Rollout order

1. Land this signed documentation-only coordination commit on `chore/e2e-triage-skipped-tests`.
2. Land C1, C2, and C3 independently; generated snapshots are reviewed, never hand-edited.
3. Mark the first four findings ready only when their own replacement/existing-coverage gate passes. No Playwright files are assigned for them.
4. Base U1 on `chore/e2e-mutating-playwright-lane`, implement the two atomic tagged tests, and run focused plus `--repeat-each=2` verification under the existing exact-name lease.
5. Observe U1 green in the existing `playwright-mutating` job after the Cypress app-test matrix; promotion of that lane from `continue-on-error` remains owned by the mutation-lane coordinator.
6. Orchestrator lands R1 for the four fully skipped sources. Remove `userAttributes.cy.ts` only in a later cleanup after U1's focused-repeat and full `@mutating` lane gates pass.
7. Never push or submit any coordination, prerequisite, port, or cleanup commit without explicit approval and a serialized signing/push lease.

## Unresolved questions

No product-contract questions remain for this coordination key. The mutation infrastructure and ordering contract are already approved in `mutating-preview-isolation.md` and signed commit `14fef47a3e`; U1 only needs an orchestrator-granted execution lease. If `Customers.age` metadata changes before U1, stop and open a new fixture-contract coordination task rather than silently changing the guarded field.

COORDINATION_COMPLETE
