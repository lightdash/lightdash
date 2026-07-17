# mutating-preview-isolation

## Scope

This contract covers the mutating Playwright ports discovered in:

| Cypress source | Playwright owner file | Shared-state class |
| --- | --- | --- |
| `packages/e2e/cypress/e2e/app/createProjects.cy.ts` | `packages/e2e/playwright/app/createProjects.spec.ts` | organization projects and warehouse jobs |
| `packages/e2e/cypress/e2e/app/dashboard.cy.ts` | `packages/e2e/playwright/app/dashboard.spec.ts` | dashboards, dashboard-owned charts, versions |
| `packages/e2e/cypress/e2e/app/dashboardFilterRequiredGroups.cy.ts` | `packages/e2e/playwright/app/dashboardFilterRequiredGroups.spec.ts` | dashboards in the seed project |
| `packages/e2e/cypress/e2e/app/dateZoom.cy.ts` | `packages/e2e/playwright/app/dateZoom.spec.ts` | saved charts and dashboards |
| `packages/e2e/cypress/e2e/app/embed.cy.ts` | `packages/e2e/playwright/app/embed.spec.ts` | singleton seed-project embed configuration |
| `packages/e2e/cypress/e2e/app/explore.cy.ts` | `packages/e2e/playwright/app/explore.spec.ts` | saved charts and versions |
| `packages/e2e/cypress/e2e/app/savedDashboards.cy.ts` | `packages/e2e/playwright/app/savedDashboards.spec.ts` | dashboard CRUD lifecycle |
| `packages/e2e/cypress/e2e/app/settings/invites.cy.ts` | `packages/e2e/playwright/app/settings/invites.spec.ts` | organization users, invites, sessions |
| `packages/e2e/cypress/e2e/app/settings/profile.cy.ts` | `packages/e2e/playwright/app/settings/profile.spec.ts` | singleton seeded-admin profile |
| `packages/e2e/cypress/e2e/app/space.cy.ts` | `packages/e2e/playwright/app/space.spec.ts` | spaces, content, users, project access |
| `packages/e2e/cypress/e2e/app/sqlRunner.cy.ts` | `packages/e2e/playwright/app/sqlRunner.spec.ts` | saved SQL charts and versions |
| `packages/e2e/cypress/e2e/app/userAttributes.cy.ts` | `packages/e2e/playwright/app/userAttributes.spec.ts` | organization-unique user attributes |

## Evidence

All twelve findings describe persistent database writes. The collision modes fall into three groups:

1. Fixed-name content is created without cleanup (`createProjects`, `dashboard`, `dateZoom`, `explore`, `sqlRunner`) or is cleaned by name (`dashboardFilterRequiredGroups`). A concurrent Cypress/Playwright run can delete, select, or duplicate the other run's content.
2. Singleton rows or identities are rewritten (`embed` configuration, the seeded admin profile, `customer_id`/`is_admin` user attributes). Random names cannot isolate these writes.
3. Organization membership and permission graphs are changed (`invites`, `space`), while `savedDashboards` has an ordered fixed-name lifecycle. Failed attempts can poison retries or later files.

`packages/e2e/playwright.config.ts` currently provides only intra-process serialization (`workers: 1`). In CI, `playwright-smoke` and the five Cypress `app-tests` shards target the same PR preview and may run concurrently. Therefore the current runner configuration is not an isolation boundary.

## Decision

Use the existing ephemeral **per-PR preview/database**, but give mutating Playwright tests a **temporal exclusive lane**. A second permanent preview is unnecessary once runner overlap and entity ownership are removed.

The isolation unit is:

```text
one PR preview
  -> all Cypress app shards finish (Cypress remains authoritative)
  -> read-only Playwright smoke finishes
  -> one mutating Playwright process, Firefox, workers=1
  -> preview is eventually destroyed with the PR
```

Mutating Playwright tests must never run in the existing smoke process. The lane is exclusive against Cypress and other mutating Playwright jobs, not against harmless backend activity. Query history, caches, view counters, and soft-delete tombstones may remain because the PR preview is disposable; active test-created domain entities must be removed where a public deletion contract exists.

A canceled workflow may interrupt cleanup. This is handled by run-unique identities plus idempotent preconditions, not by deleting resources by display name. GitHub's existing PR-level `concurrency` prevents two current workflow runs for one PR from continuing together.

## Required future prerequisite commit

This planning commit does not change CI. Before any affected port is enabled, a separate coordinator change must land:

- Branch: `chore/e2e-mutating-playwright-lane`
- Proposed commit: `chore(e2e): add serialized mutating Playwright lane`
- Owner: mutation-isolation coordinator
- Owned files: `.github/workflows/pr.yml` only, unless review proves a package script is required

That change must:

1. Reserve the Playwright tag `@mutating`.
2. Change `playwright-smoke` to run `playwright test --project=firefox --grep-invert @mutating`.
3. Add `playwright-mutating` using the same Playwright container and PR `PLAYWRIGHT_BASE_URL`, dependent on successful completion of both `app-tests` and `playwright-smoke`.
4. Run `playwright test --project=firefox --grep @mutating --workers=1 --pass-with-no-tests` with a 60-minute job timeout.
5. Keep the new job `continue-on-error: true` while Cypress is authoritative. Make it blocking only after every included port has passed its focused, repeated, and full-lane gates below.
6. Upload the existing Playwright report/results artifacts on failure under a distinct mutating-lane artifact name.

The prerequisite must not add database reset code, shared test helpers, retries, or warehouse secrets. Warehouse provisioning for `createProjects.spec.ts` remains owned by its separate `playwright-warehouse-secrets` coordinator.

## Per-file contract

Each affected target file owns its setup, typed response validation, resource ledger, and cleanup. No shared page object or mutation helper is created by this coordination key.

Every target must:

- Put all active tests under a file-level `@mutating` tag. Do not tag setup or read-only files globally.
- Use the existing Firefox/admin storage state unless its findings require a local role context.
- Generate every freely chosen name/email with a Playwright prefix plus `randomUUID()`; do not use only `Date.now()`, worker index, source fixed names, or slugs as identity.
- Capture returned UUIDs immediately. Address assertions and cleanup by UUID. Never list/delete organization content by name; name lookup is allowed only to find immutable seed fixtures and must require the expected exact cardinality.
- Register cleanup as soon as a resource is created and execute it in reverse dependency order in `finally`/`afterEach`. Cleanup must be idempotent and accept only the documented success or already-absent response.
- Preserve the first assertion failure if cleanup also fails, while reporting the cleanup failure. A successful test with failed cleanup is a test failure.
- Leave seeded dashboards, charts, spaces, users, and projects untouched.

Additional fixed-state rules:

- `embed.spec.ts`: hold the lane for the whole config-PATCH/JWT/navigation/assertion interval. Restore the captured prior config when the API exposes it; otherwise the analyzed canonical Jaffle-dashboard payload is the approved terminal state.
- `profile.spec.ts`: reset `demo@lightdash.com` to canonical seed values before and after the test.
- `userAttributes.spec.ts`: exclusively own `customer_id` and `is_admin`; delete exact existing names as setup, create asserted values, and delete both in `finally`.
- `invites.spec.ts` and `space.spec.ts`: use unique emails and delete the exact generated user/invite/content/access graph where supported. Any unreclaimable rows are acceptable only on the disposable PR preview and must not be selected by a later run.
- Dashboard/chart/saved-SQL/project ports: use public UUID deletion. Active-row removal is sufficient when soft delete is enabled; PR-preview destruction owns tombstone reclamation.

The global one-worker setting is defense in depth, not the contract. A focused command must still pass with `--workers=1`, and no affected spec may assume another affected spec ran first.

## Branch and ownership strategy

1. This branch, `chore/e2e-coordinate-mutating-tests`, owns only this coordination document.
2. The future prerequisite branch above is based on this coordination commit and owns only CI lane selection/ordering.
3. Each port branch is based on the prerequisite commit, owns exactly its Cypress source assignment, target spec, and findings history, and remains independently mergeable. Port branches do not stack on one another.
4. The migration orchestrator owns the manifest state and grants local/shared-preview execution leases. Port agents do not edit the manifest.
5. Cypress remains present and authoritative during dual-run. Removal is a later per-source migration change after parity and blocking-lane promotion.

For local or agent-swarm verification, a shared localhost database is not implicitly safe. The orchestrator must grant a single `mutating-preview-isolation` execution lease, or the agent must use its own branch PR preview/disposable database. The lease covers the complete setup/test/cleanup command, not only browser actions.

## Dependency graph

```text
this coordination document
  -> future CI lane prerequisite commit
      -> each affected port may start independently
          -> file-local focused/repeat/cleanup gates
              -> full serialized @mutating lane
                  -> make lane blocking
                      -> later Cypress removals
```

Additional unresolved dependencies do not block the other ports:

- `createProjects.spec.ts` also requires `playwright-warehouse-secrets` and UTC provisioning.
- `dashboardFilterRequiredGroups.spec.ts` requires the preview backend feature flag `dashboard-filter-requirements`.
- `sqlRunner.spec.ts` still requires `skip-triage/sql-runner` for skipped-test disposition, not for its active port.
- `userAttributes.spec.ts` remains blocked on the guarded-dimension fixture and SQL-filter scope questions recorded in its findings.
- `embed.spec.ts` requires the existing embedding commercial feature/config row.

## Rollout order

1. Sign and land this documentation-only coordination commit.
2. Land the future CI prerequisite. Dry-run it with no tagged tests: smoke must pass and the mutating job must pass with no tests.
3. Port files independently. Add one tagged target at a time; do not batch unrelated ports to create the lane.
4. For each port, run its focused gate twice on the same disposable preview, then run the authoritative Cypress source and Playwright target sequentially, then run the complete tagged lane.
5. After all tagged files are green and cleanup audits pass, remove `continue-on-error` from `playwright-mutating` in a separate coordinator commit.
6. Remove Cypress sources only in later migration commits. Do not parallelize the mutating lane until a new coordination decision proves resource-level isolation.

## Gates and verification

### Prerequisite gate

The future CI change must demonstrate from workflow logs that:

- `playwright-smoke` selects zero `@mutating` tests;
- `playwright-mutating` starts only after all Cypress app matrix children and smoke finish;
- exactly one Firefox worker runs tagged tests;
- a no-tag branch succeeds via `--pass-with-no-tests`;
- a failed tagged probe produces the distinct report/results artifact.

### Per-port gate

From repository root, under the execution lease or against the branch's own preview:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e linter ./playwright/<target>.spec.ts
pnpm -F e2e formatter ./playwright/<target>.spec.ts --check
PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" pnpm -F e2e exec playwright test playwright/<target>.spec.ts --project=firefox --workers=1
PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" pnpm -F e2e exec playwright test playwright/<target>.spec.ts --project=firefox --workers=1 --repeat-each=2
```

Then run the source Cypress spec and target Playwright spec **sequentially**, never concurrently, and run:

```bash
PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" pnpm -F e2e exec playwright test --project=firefox --grep @mutating --workers=1
```

The port is green only when its resource ledger is empty of active entities after success and induced assertion failure, fixed singleton state is restored or in its approved terminal state, and another affected spec passes when run alone immediately afterward.

### Promotion gate

The lane becomes blocking only after every included target passes focused execution, `--repeat-each=2`, sequential Cypress parity, cleanup inspection, and the full tagged run on the same PR preview. Warehouse- or feature-specific ports join only after their additional coordinator gates are satisfied.

## Unresolved questions

There are no unresolved isolation-policy questions: the approved strategy is one ephemeral PR preview with Cypress/read-only Playwright first and one exclusive tagged Playwright mutation process afterward. Product behavior, skipped-test triage, warehouse secrets, feature flags, and the `userAttributes` fixture mismatch remain with their named owners and must not be folded into the isolation prerequisite.

COORDINATION_COMPLETE
