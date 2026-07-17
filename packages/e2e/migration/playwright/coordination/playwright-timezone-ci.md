# `playwright-timezone-ci` coordination contract

## Affected files

| File | Owner | Contract |
| --- | --- | --- |
| `packages/e2e/migration/playwright/findings/e2e/app/dates.cy.md` | Discovery/orchestrator | Evidence only; do not edit in coordinator commits. |
| `.github/workflows/pr.yml` | Timezone coordinator | Future prerequisite sets explicit UTC for smoke; later rollout converts the dedicated timezone lane to Playwright. |
| `.github/file-filters.yml` | Timezone coordinator | Rollout makes the Playwright dates spec trigger the dedicated timezone lane. |
| `packages/e2e/playwright/app/dates.spec.ts` | Dates porter | Owns the sole active UI test and file-local timezone expectations. |
| `packages/e2e/cypress/e2e/app/dates.cy.ts` | Orchestrator | Remains authoritative during dual-run; delete only after rollout gates pass. |

The nine skipped Cypress tests are outside this contract. Their unit/removal triage must not be added to the Playwright spec or either coordinator commit.

## Evidence

- The active Cypress test checks three distinct rendered domains: normalized UTC filter text, server-formatted UTC result data, and client-local filter text, then checks the UTC SQL literal.
- Its supported client zones are exactly `UTC`, `Europe/Madrid`, `America/New_York`, and `Asia/Tokyo`.
- Current UTC coverage comes from the ordinary Cypress app lane; the dedicated Cypress timezone lane covers only the three non-UTC zones.
- `.github/workflows/pr.yml` runs Playwright smoke without an explicit `TZ`, so a port that rejects an absent timezone is not independently green there.
- Playwright already supplies Firefox, admin storage state, one worker, retries, and the shared preview base URL. No shared helper or auth change is needed.
- The active test saves no content. Each execution receives a unique query UUID; only query history/cache can be written. Parallel timezone jobs cannot collide by name or cleanup target.

## Decision

Preserve all four zones in a **blocking, explicit Playwright matrix**. Keep smoke explicitly on UTC as a separate broad run. The dates spec must use only validated `process.env.TZ`, set `test.use({ timezoneId: timezone })` locally, and exhaustively map the four zones to expected local text. Missing or unsupported values fail immediately.

Do not put timezone selection in global Playwright config, add a shared helper, change the preview server timezone, or infer expected output from the machine default. Firefox remains the browser and `--workers=1` remains mandatory.

Two future coordinator implementation commits are required around the independently owned port:

1. A prerequisite commit adds explicit UTC to existing Playwright smoke before the dates spec lands.
2. A rollout commit converts the dedicated timezone lane after the dates spec lands.

This document is planning-only and implements neither change.

## Contract

### Branch and dependency strategy

Each branch is stacked on the immediately preceding signed commit; no branch may absorb another owner's files.

| Order | Exact branch | Owner and allowed files | Independently green state |
| --- | --- | --- | --- |
| C0 | `chore/e2e-coordinate-timezone-tests` | Coordinator: this document only. | Documentation-only. |
| C1 | `chore/e2e-playwright-timezone-default` | Coordinator: `.github/workflows/pr.yml` only. Add `TZ: "UTC"` to the `playwright-smoke` job environment. | Existing Playwright suite still runs unchanged, now deterministically in UTC; Cypress remains authoritative. |
| C2 | `chore/e2e-playwright-dates` | Dates porter: `packages/e2e/playwright/app/dates.spec.ts` and its assigned findings history only. | Smoke can load the strict spec because C1 supplies UTC. Cypress still provides dual-run coverage. |
| C3 | `chore/e2e-playwright-timezone-ci` | Coordinator: `.github/workflows/pr.yml` and `.github/file-filters.yml` only. | The dedicated blocking lane targets the landed Playwright spec in all four zones; Cypress source still exists. |
| C4 | Orchestrator-assigned removal branch | Orchestrator: Cypress source and migration state only. | Allowed only after C3 gates pass and the rollout is live. |

C1 is the prerequisite implementation commit. C2 must not start from a parent lacking C1, and C1 must not include a placeholder or skipped dates test. C3 must not use `--pass-with-no-tests` and therefore depends on C2.

### Dates spec boundary (C2)

- Reserve `packages/e2e/playwright/app/dates.spec.ts` to its porter.
- Validate `process.env.TZ` against the four-zone closed set before declaring `test.use({ timezoneId: timezone })`; do not default an absent value.
- Keep URL-state construction and zone-to-text mapping file-local.
- Use existing Firefox admin storage state. Do not add login or global config code.
- Wait for the matching metric-query POST to succeed, then for loading to disappear; use no fixed sleep.
- Scope UTC filter text, local filter text, result timestamp, and SQL literal to their distinct visible regions.
- Save no content and add no cleanup.

### Runner and CI boundary (C3)

Replace the implementation of `timezone-tests` without renaming the job:

- condition: `needs.files-changed.outputs.timezone == 'true'`;
- blocking behavior: retain no `continue-on-error` and use `fail-fast: false`;
- runner: `depot-ubuntu-24.04-4`;
- container: `mcr.microsoft.com/playwright:v1.56.1-noble`, with no Cypress image/user option;
- needs: `[preview, files-changed]`, removing `build-cypress-e2e-image`;
- matrix, in full: `UTC`, `Europe/Madrid`, `America/New_York`, `Asia/Tokyo`;
- setup: copy checkout, Socket Firewall, pnpm, Node, frozen install, and common-build steps from `playwright-smoke`; run `pnpm -F e2e typecheck:playwright`;
- invocation:

```bash
pnpm -F e2e exec playwright test playwright/app/dates.spec.ts \
  --project=firefox --workers=1
```

- run environment:

```text
TZ=${{ matrix.timezone }}
PLAYWRIGHT_BASE_URL=https://lightdash-preview-pr-${{ github.event.number }}.lightdash.okteto.dev
```

- failure artifacts: upload `packages/e2e/playwright-report` and `packages/e2e/playwright-results` under a timezone-unique name such as `playwright-report-timezone-${{ strategy.job-index }}`;
- trigger ownership: add `packages/e2e/playwright/app/dates.spec.ts` to the `timezone` paths in `.github/file-filters.yml`.

Remove `CYPRESS_TZ`, Cypress setup, credentials-fixture creation, Cypress action invocation, Cypress artifact paths, and the Cypress image dependency from this lane only. Do not alter the general Cypress app lane in C3.

### Isolation

Each matrix value runs in a separate GitHub Actions job and a fresh Firefox context, while all jobs may share the same preview and seed database. Playwright remains serial inside each job (`fullyParallel: false`, one worker). Authentication state is generated on that job's filesystem. No preview lease, seed lock, schema suffix, serial matrix, created-name namespace, or cross-job cleanup is required because the test performs only isolated query execution.

The preview server must remain in its normal UTC-formatting environment. `TZ` controls the test process and, through `timezoneId`, the browser context; it must not be propagated as a server deployment setting.

## Ownership

- **Timezone coordinator:** C1 and C3 workflow/filter changes, matrix CI evidence, and artifact naming.
- **Dates porter:** C2 test behavior, strict timezone parsing, synchronization, and locators.
- **Orchestrator:** serialized branch order, findings/manifest transitions, Cypress authority, and eventual C4 removal.
- **Preview/application owners:** resolve any failure showing that server-formatted results are no longer UTC; the porter must not weaken that assertion unilaterally.

## Dependency graph

```text
C0 coordination document
  -> C1 explicit UTC smoke prerequisite
      -> C2 dates Playwright port
          -> C3 four-zone Playwright CI rollout
              -> C4 Cypress dates removal
```

Cypress and Playwright may dual-run against one preview through C3. C4 is forbidden if any matrix zone is skipped, non-blocking, or dependent on a container default.

## Verification and gates

### C0 gate

- `git diff --check`
- `git status --short` shows only `packages/e2e/migration/playwright/coordination/playwright-timezone-ci.md`.

### C1 prerequisite gate

Because workflow-only changes do not select a preview/frontend run, its PR body must include both `deploy-preview` and `test-frontend`. Require the UTC `E2E: Playwright smoke` run to execute successfully before C2 starts.

### C2 port gate

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e lint
pnpm -F e2e format
for timezone in UTC Europe/Madrid America/New_York Asia/Tokyo; do
  TZ="$timezone" PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" \
    pnpm -F e2e exec playwright test playwright/app/dates.spec.ts \
      --project=firefox --workers=1
done
```

Require four passes against the same preview. Also require the stacked PR's UTC smoke and legacy Cypress app checks to remain green; no Cypress source deletion is allowed here.

### C3 rollout gate

A C3-only diff does not itself match preview/timezone paths, so its PR body must include both `deploy-preview` and `test-timezone`. Require all four blocking `E2E: Timezone (...)` jobs to run the exact Playwright target and pass. Verify failed-job artifacts are uniquely named and that the job no longer needs or invokes Cypress. Re-run `pnpm -F e2e typecheck:playwright` and `git diff --check`.

### C4 removal gate

C3 must be merged/live, all four zones must have passed in the blocking lane, UTC smoke must remain explicit, and the Cypress/Playwright assertions must have demonstrated parity. Removal is a separate authorized change.

## Rollout order

1. Sign and land C0 after the signing lease.
2. Coordinator creates, verifies, and separately signs C1.
3. Orchestrator releases the dates porter on top of C1; porter lands C2 without deleting Cypress.
4. Coordinator creates, verifies, and separately signs C3 on top of C2.
5. Observe one qualifying CI run with all four matrix jobs green.
6. Orchestrator may then schedule C4.

## Unresolved questions

- The preview server's UTC result-formatting guarantee is asserted by the legacy test but is not documented as an environment contract. A non-UTC server result blocks C2/C3 and goes to preview/application owners; it is not grounds for making the expected value dynamic.
- Stable DOM regions distinguishing UTC filter text, local filter text, result text, and SQL must be confirmed by the dates porter against the live page. This is file-local discovery and does not justify shared locator infrastructure.
- Ownership of the nine skipped Cypress tests remains separate unit/removal triage and does not block this active-test rollout.

COORDINATION_COMPLETE
