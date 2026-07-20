# packages/e2e/cypress/cli/dbt/cli.cy.ts

## Classification

- Recommended runner: CLI/Node integration tests (dedicated Vitest integration config), not Playwright. The spec never opens a page; every active behavior is a child-process/warehouse assertion (`packages/e2e/cypress/cli/dbt/cli.cy.ts:25-263`). The port contract also says browserless CLI coverage does not belong in Playwright (`packages/e2e/migration/playwright/prompts/port-file.md:17-18`).
- Execution lane: `cli-node`
- Active tests: 9
- Skipped tests: 1
- Persistent mutation: Yes — `dbt run` replaces/materializes tables in `SEED_SCHEMA`, `lightdash generate` rewrites model YAML, and dbt commands update ignored `target/`/`logs/` artifacts (`packages/e2e/cypress/cli/dbt/cli.cy.ts:25-36,39-241`; `packages/cli/src/handlers/generate.ts:128-175`; `examples/full-jaffle-shop-demo/dbt/dbt_project.yml:15-24`).
- Shared-preview dual-run safe: No. The preview is unused, but Cypress and the port would collide if they share the same Postgres schema or checkout. CI currently gives each dbt matrix job a schema, but not separate Cypress/Node schemas inside one job (`.github/workflows/pr.yml:753-820`).
- Difficulty total: 11/18 — persistent/shared state 3; browser interaction complexity 0; environment/external dependencies 3; synchronization/flakiness 2; authentication/authorization 0; cross-file infrastructure 3.
- Coordination keys: `cli-node-integration-runner`, `cli-dbt-postgres-isolation`
- Analysis status: coordination-required

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `Should run dbt first` | Active | Runs all dbt models and requires stdout to contain `Completed successfully` (`packages/e2e/cypress/cli/dbt/cli.cy.ts:25-36`). | Materializes all models as tables/views in the configured Postgres schema and refreshes dbt artifacts; model materialization is configured at `examples/full-jaffle-shop-demo/dbt/dbt_project.yml:20-24`. | Must run before every generate test because generate loads the existing manifest and inspects warehouse tables (`packages/cli/src/handlers/generate.ts:73-118`). Dynamic 188s timeout under the current 61-model/4-thread fixture. | `packages/cli/integration/dbt-cli.integration.test.ts` under a sequential CLI/Node suite. |
| `Should lightdash generate with --models` | Active | Verifies the legacy `--models orders customers` selector logs only the two requested model names plus `Filtering models` and `Done 🕶` (`packages/e2e/cypress/cli/dbt/cli.cy.ts:39-62`). `--models` is passed into the same selection path as `--select` (`packages/cli/src/handlers/generate.ts:95-104`). | Rewrites the matching model YAML files (`packages/cli/src/handlers/generate.ts:128-175`). | stderr substring assertions; ANSI/spinner output; default exec timeout; optional health/analytics network calls. | Same CLI/Node target; retain as a separate compatibility case. |
| `Should lightdash generate with --select` | Active | Verifies direct selection of `orders customers` and exclusion of named non-selected models (`packages/e2e/cypress/cli/dbt/cli.cy.ts:65-88`). | Rewrites matching YAML files. | dbt selection is delegated to `dbt ls --select ... --resource-type=model --output=json` (`packages/cli/src/dbt/models.ts:356-398`). | Same CLI/Node target. |
| `Should lightdash generate with --select with + prefix` | Active | Verifies `+orders` selects `orders` and upstream `stg_orders`/`stg_payments`, but not `customers`, `events`, `users`, or `stg_customers` (`packages/e2e/cypress/cli/dbt/cli.cy.ts:91-115`). | Rewrites selected YAML files. | The `payments` negative assertion is commented out because it is only a substring of selected names (`packages/e2e/cypress/cli/dbt/cli.cy.ts:110-111`). | Same CLI/Node target; assert parsed generated-model lines rather than unrestricted substrings. |
| `Should lightdash generate with --select with + postfix` | Active | Verifies `stg_orders+` includes downstream `orders` and `customers`, while excluding listed unrelated models (`packages/e2e/cypress/cli/dbt/cli.cy.ts:118-142`). | Rewrites selected YAML files. | The `payments` negative assertion is commented out because `customer_order_payments` can match it (`packages/e2e/cypress/cli/dbt/cli.cy.ts:137-138`). | Same CLI/Node target; use exact parsed model names. |
| `Should lightdash generate with --exclude` | Skipped by `it.skip` | Intended to generate all models except `events` and assert the remaining listed models (`packages/e2e/cypress/cli/dbt/cli.cy.ts:145-169`). | Would rewrite nearly all model YAML files. | Skip says `product_events` is absent from seed data (`packages/e2e/cypress/cli/dbt/cli.cy.ts:146`), but the current project declares `raw_product_events` seed typing (`examples/full-jaffle-shop-demo/dbt/data/seeds.yml:95-101`) and has `data/raw_product_events.csv`. | Do not port while skipped. Clarify whether the comment is stale; if current dbt 1.10/1.11 seed proves it works, re-enable later as a CLI/Node test in a separate change. |
| `Should lightdash generate with --select and --exclude` | Active | Verifies `+orders` followed by exclusion of `stg_orders stg_payments`, leaving `orders` while excluding the listed models (`packages/e2e/cypress/cli/dbt/cli.cy.ts:172-196`). | Rewrites selected YAML files. | Depends on dbt selector precedence; uses broad positive/negative stderr substrings. | Same CLI/Node target. |
| `Should lightdash generate all model` | Active | Generates every model without `Filtering models`, checks eight representative names and `Done 🕶` (`packages/e2e/cypress/cli/dbt/cli.cy.ts:199-223`). | Rewrites YAML for every compiled model. | Long dynamic timeout; largest filesystem/warehouse-read workload; grammar in title is singular but behavior is all models. | Same CLI/Node target using a private temporary fixture copy. |
| `Should lightdash compile` | Active | Compiles the full project and requires `Successfully compiled project` on stderr (`packages/e2e/cypress/cli/dbt/cli.cy.ts:226-241`). | Updates dbt `target/`/`logs/`; reads warehouse catalog. | Long dynamic timeout. Success text is emitted only when no explore errors remain (`packages/cli/src/handlers/compile.ts:537-552`). | Same CLI/Node target. |
| `Should throw error on lightdash compile` | Active | Compiles only `orders` with partial compilation disabled, asserting exit code 1 and exactly `Found 2 errors` (`packages/e2e/cypress/cli/dbt/cli.cy.ts:244-261`). | Updates dbt artifacts; reads warehouse catalog. | Per-process `PARTIAL_COMPILATION_ENABLED=false`; exact error count is coupled to demo metadata. `orders` currently joins `customers` and `raw_order_statuses` (`examples/full-jaffle-shop-demo/dbt/models/orders.yml:73-82`). | Same CLI/Node target; preserve exact exit/output contract pending clarification of the intended two failures. |

## Cypress command expansion

- There are no imported or custom Cypress commands in this file. It uses only Cypress/Mocha built-ins: `cy.exec`, `.its`, `.should`, `.then`, and Chai `expect` (`packages/e2e/cypress/cli/dbt/cli.cy.ts:25-263`). No support command needs porting.
- Each `cy.exec` starts a shell command from the Cypress project working directory. CI sets that directory to `packages/e2e` (`.github/workflows/pr.yml:810-816`), which is why `../../examples/full-jaffle-shop-demo/...` resolves correctly (`packages/e2e/cypress/cli/dbt/cli.cy.ts:2-4`). The Node port should use argument arrays/`execFile` or `spawn`, absolute paths, and `packages/cli/dist/index.js`; it should not reproduce shell interpolation.
- `failOnNonZeroExit: false` is deliberately set for every process (`packages/e2e/cypress/cli/dbt/cli.cy.ts:29,43,69,95,122,150,176,203,230,248`). The successful generate cases infer success from terminal `Done 🕶`, emitted immediately before exit 0 (`packages/cli/src/index.ts:1743-1751`); the negative compile case explicitly checks exit 1.
- Generate selection is not implemented by Cypress: the CLI calls `dbt ls`, parses JSON lines, and intersects returned IDs with manifest models (`packages/cli/src/dbt/models.ts:342-398`). Generate then reads each warehouse relation and writes its YAML (`packages/cli/src/handlers/generate.ts:93-175`).

## State, seed, and environment assumptions

- **Ordering/shared state:** There are no hooks or aliases. Tests execute in declaration order, and the title `Should run dbt first` is a real dependency. Generate does not establish its own manifest or relations: it loads `target/manifest.json` and queries selected warehouse tables (`packages/cli/src/handlers/generate.ts:73-118`). Running a generate test alone is therefore unsupported without setup.
- **Seed prerequisite:** `dbt run` does not seed raw relations. CI performs `dbt seed --full-refresh` and `dbt run --full-refresh` before Cypress (`.github/workflows/pr.yml:777-798`), after which the first active test runs dbt again without `--full-refresh` (`packages/e2e/cypress/cli/dbt/cli.cy.ts:25-36`). A self-contained Node lane must retain seed setup rather than depend on an unrelated suite.
- **Database:** The profile is PostgreSQL and reads `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, and optional `SEED_SCHEMA`; it fixes `threads: 4` and disables SSL (`examples/full-jaffle-shop-demo/profiles/profiles.yml:4-16`). Source defaults are localhost/5432/postgres/password/postgres/jaffle (`packages/e2e/cypress/cli/dbt/cli.cy.ts:16-23`).
- **CI isolation/version matrix:** CI installs dbt Core/Postgres for dbt 1.10 and 1.11 and assigns `jaffle_dbt_tests_${run_id}_${job-index}` per matrix job (`.github/workflows/pr.yml:753-798`). The port must remain in this matrix. A separate suffix is needed if Cypress and Node run in the same job.
- **Executables/build:** The source assumes `dbt` and globally installed `lightdash` are on `PATH` (`packages/e2e/cypress/cli/dbt/cli.cy.ts:4,25-27`). CI builds common, warehouses, and CLI, then globally installs the CLI before execution (`.github/workflows/pr.yml:799-809`). The port should invoke the just-built CLI entrypoint directly to avoid resolving a stale global binary.
- **Filesystem:** `lightdash generate -y` is non-interactive and writes existing patch YAML or `<model>.yml` (`packages/cli/src/dbt/models.ts:183-220,328-339`; `packages/cli/src/handlers/generate.ts:162-175`). All generate cases point at the same tracked demo project, so repeated tests intentionally build on previous writes. Concurrent processes can truncate/overwrite the same files. Use a per-suite temporary copy; do not mutate the repository fixture.
- **dbt artifacts:** The demo project uses `target/` and `logs/` (`examples/full-jaffle-shop-demo/dbt/dbt_project.yml:15-19`); these are ignored but shared in the current checkout. They must also live under the temporary copy.
- **Authentication/authorization/storage:** No browser session, cookies, local storage, user role, Lightdash project UUID, or API permission is required by the asserted behavior. Generate calls a health check, but missing CLI login is swallowed (`packages/cli/src/handlers/dbt/apiClient.ts:331-357`). If a developer has CLI config, it may issue `GET /api/v1/health?skipMigrationCheck=true`; this response is not asserted.
- **External effects:** Generate and compile emit analytics. Tracking POSTs to `https://analytics.lightdash.com/v1/track`, with failures swallowed (`packages/cli/src/analytics/analytics.ts:571-609`). The test also needs a real PostgreSQL service; no preview HTTP service is needed.
- **Names/UUIDs:** There are no seed UUIDs. Assertions are tied to fixture model names (`orders`, `customers`, `events`, `users`, `payments`, and staging names). Output paths are name-based, so duplicate dbt model names/patches would make the fixture ambiguous; the current source does not test duplicates.
- **Environment:** Generate/compile processes force `CI=true` and `NODE_ENV=development`; the negative compile additionally forces `PARTIAL_COMPILATION_ENABLED=false` (`packages/e2e/cypress/cli/dbt/cli.cy.ts:44-47,249-253`). In native Cypress mode all host variables are exposed as Cypress env; otherwise CI relies on `CYPRESS_*` variables (`packages/e2e/cypress.config.ts:8-13`; `.github/workflows/pr.yml:817-820`).

## Synchronization and timeout requirements

- The long timeout is `60,000 + ceil(MODEL_COUNT / DBT_THREADS) * 8,000` ms (`packages/e2e/cypress/cli/dbt/cli.cy.ts:6-14`). Cypress recursively counts `.sql` files and reads profile threads (`packages/e2e/cypress.config.ts:37-67`). The current fixture has 61 SQL models and 4 threads, so the effective timeout is **188,000 ms**. Preserve at least this per-process budget for full dbt run, generate-all, and compile (`packages/e2e/cypress/cli/dbt/cli.cy.ts:32,210,237`).
- Selected generate cases and the expected-failure compile omit a custom timeout (`packages/e2e/cypress/cli/dbt/cli.cy.ts:39-196,244-262`) and therefore rely on Cypress's exec timeout. The Node integration runner needs an explicit bounded process timeout rather than Vitest's unit-test defaults.
- No arbitrary sleeps, network intercepts, aliases, retries, debounce, or browser waits exist. Completion is process exit plus captured stdout/stderr.
- Keep cases sequential: the first test establishes compiled relations/manifest, and later generate cases rewrite overlapping files. Do not enable file-local concurrency.
- Cypress run-mode retries default to 2 (`packages/e2e/cypress.config.ts:12-22`). Do not copy broad retries into the Node runner; isolate state and use process completion as the synchronization signal.

## Locator and strictness risks

- There are no DOM locators.
- Terminal assertions are loose substring locators. `orders` can match `stg_orders` or `customer_order_payments`; `payments` can match both `stg_payments` and `customer_order_payments`. The source already comments out two unsafe `payments` negatives (`packages/e2e/cypress/cli/dbt/cli.cy.ts:110-111,137-138`).
- ANSI styling and spinner rendering may vary by TTY/CI/dbt version. The target should disable color where supported, normalize ANSI/control characters, and parse the CLI's generated-model result lines into exact model names before membership assertions. Preserve explicit checks for `Filtering models`, `Done 🕶`, compile success, and the negative compile summary.
- All successful generate cases should also assert exit code 0, not only the presence of substrings. The source's `Done 🕶` is currently the implicit exit-success sentinel (`packages/cli/src/index.ts:1743-1751`).

## Nonstandard or surprising behavior

- This is a browser test only in name: it launches no browser behavior and does not use `baseUrl`; the preview dependency in CI is unnecessary for this spec (`.github/workflows/pr.yml:748-752,810-820`).
- `--models` and `--select` are deliberately tested as equivalent input paths (`packages/e2e/cypress/cli/dbt/cli.cy.ts:39-88`; `packages/cli/src/handlers/generate.ts:95-104`). Do not collapse those cases.
- Generate is destructive to fixture YAML even though assertions only inspect stderr (`packages/cli/src/handlers/generate.ts:128-175`). There is no source cleanup or git-clean assertion.
- `failOnNonZeroExit: false` means process failures are never rejected automatically; only expected text protects successful cases (`packages/e2e/cypress/cli/dbt/cli.cy.ts:29-260`).
- The skipped-test rationale appears inconsistent with the current checked-in seed declaration/file. This is evidence for clarification, not permission to unskip.
- No downloads/uploads, popups, iframes, clipboard, canvas/SVG, Monaco, virtualization, drag-and-drop, browser APIs, or timezone-sensitive browser behavior is present.

## Coordination requirements

1. **`cli-node-integration-runner`: required shared prerequisite.** Current CLI Vitest config only includes `src/**/*.test.ts`, is named `cli-unit-tests`, and uses up to 50% workers (`packages/cli/vitest.config.ts:5-18`). A coordinator should add a dedicated serial integration config/script and CI invocation rather than turning `pnpm -F cli test` into a Postgres/dbt-dependent suite. This runner is likely reusable by other CLI migration files, but this spec needs no shared assertion/helper module.
2. **`cli-dbt-postgres-isolation`: required shared prerequisite.** Define lane-specific schema naming, seed setup, dbt 1.10/1.11 matrix execution, and cleanup. Existing CI isolation is per matrix job only (`.github/workflows/pr.yml:753-820`); dual-run requires distinct Cypress and Node schemas.
3. Do **not** add a browser fixture, authenticated storage state, API-test helper, or shared model-output parser solely for this file. A small parser can remain local unless another analyzed CLI file proves the same contract.
4. The target owns its temporary project copy and sequential process wrapper. The coordinator owns only runner/config/workflow/schema contracts, so the eventual port remains independently green.

## Exact port plan

1. Coordinator prerequisite: add a dedicated serial Node/Vitest integration runner (for example `packages/cli/vitest.integration.config.ts` plus `test:integration`) that includes `packages/cli/integration/**/*.integration.test.ts`, has bounded long-test timeouts, and does not inherit unit-test parallelism.
2. Coordinator prerequisite: update the existing `CLI: dbt` 1.10/1.11 job to seed/run and clean a Node-specific `SEED_SCHEMA`, while Cypress remains authoritative in its own schema during dual-run (`.github/workflows/pr.yml:747-820`). Remove the preview dependency only in a later CI cleanup, not in this file port.
3. Create exactly `packages/cli/integration/dbt-cli.integration.test.ts` for this source. Do not create a Playwright spec.
4. In suite setup, copy `examples/full-jaffle-shop-demo/dbt` and its profile into a unique temporary directory, seed its unique Postgres schema, and retain the first active case as the dbt-run completion assertion. Remove the temporary directory in teardown. Use coordinator-owned database cleanup for the unique schema.
5. Invoke `packages/cli/dist/index.js` with `process.execPath` and argument arrays; invoke `dbt` with argument arrays. Capture exit code/stdout/stderr, enforce the 188,000 ms full-project timeout, and preserve `CI`, `NODE_ENV`, database variables, and per-case `PARTIAL_COMPILATION_ENABLED`.
6. Port all 9 active cases in source order. Parse normalized generated-model output for exact membership, while retaining command-level messages and the exact negative compile exit/error-count assertion.
7. Do not port `Should lightdash generate with --exclude`; record it as unresolved skipped coverage. Do not modify or delete the Cypress source during dual-run.

## Verification plan

After the two coordination prerequisites exist, run from repository root with an isolated test schema and reachable PostgreSQL:

```bash
pnpm -F common build:fast
pnpm -F warehouses build:fast
pnpm -F cli build:fast
pnpm -F cli typecheck:fast
pnpm -F cli lint
pnpm -F cli format
SEED_SCHEMA="jaffle_cli_node_${USER}_focused" pnpm -F cli test:integration -- integration/dbt-cli.integration.test.ts
pnpm -F cli test
pnpm -F cli test:integration
git diff --exit-code -- examples/full-jaffle-shop-demo/dbt
```

Timing/state repeat with a distinct schema each run:

```bash
for run in 1 2 3; do
  SEED_SCHEMA="jaffle_cli_node_${USER}_repeat_${run}" pnpm -F cli test:integration -- integration/dbt-cli.integration.test.ts || exit 1
done
```

CI verification must run the focused/full integration suite in both existing dbt matrix entries, 1.10 and 1.11 (`.github/workflows/pr.yml:753-798`). The proposed `test:integration` command/config does not exist yet; that is why porting is coordination-gated.

## Open questions

- Is the skipped `--exclude` rationale stale now that `raw_product_events` is declared and checked in (`packages/e2e/cypress/cli/dbt/cli.cy.ts:145-146`; `examples/full-jaffle-shop-demo/dbt/data/seeds.yml:95-101`)? Keep skipped until a maintainer confirms the intended coverage.
- Which two specific compile errors are the intended contract for `-m orders` with partial compilation disabled? The source asserts only the count, while `orders` currently has two joins (`packages/e2e/cypress/cli/dbt/cli.cy.ts:244-261`; `examples/full-jaffle-shop-demo/dbt/models/orders.yml:73-82`). Fixture changes can alter the count without changing CLI error handling.
- Should integration tests suppress real analytics/version-health requests, or is exercising their swallowed-failure behavior intentional? Current generate behavior can make both external calls (`packages/cli/src/handlers/generate.ts:38-69`; `packages/cli/src/analytics/analytics.ts:578-609`).
- What schema-drop mechanism should the coordinator standardize for local failures, where CI's final cleanup job is unavailable? This must be resolved before claiming persistent-state isolation.

## Port history

Not started.

### 2026-07-20 — static implementation complete

- Target: `packages/cli/integration/dbt-version/cli.integration.test.ts`.
- Ported all nine active contracts in source order to the serial CLI Node runner: dbt run, legacy `--models`, direct/prefix/postfix selectors, combined select/exclude, generate-all, successful compile, and the exact partial-compile exit/error-count contract.
- Kept `Should lightdash generate with --exclude` out because the Cypress case remains skipped and its product contract is unresolved.
- Isolation: the suite copies dbt/project profiles into a fresh root, uses isolated `HOME`/cwd/target/log paths, validates and uses the lane-provided `jaffle_dbt_node_*` schema (with a validated local UUID fallback), drops only that schema, and removes only its generated root in teardown.
- Static verification passed:
  - `pnpm -F common build:fast`
  - `pnpm -F warehouses build:fast`
  - `pnpm -F cli build:fast`
  - `pnpm -F @lightdash/cli typecheck:fast`
  - `pnpm -F cli lint`
  - `pnpm -F cli format`
  - `pnpm -F @lightdash/cli run linter ./integration/dbt-version/cli.integration.test.ts`
  - `pnpm -F @lightdash/cli exec oxfmt integration/dbt-version/cli.integration.test.ts --check`
  - `packages/cli/node_modules/.bin/tsc6 --project packages/cli/tsconfig.eslint.json --noEmit`
  - `git diff --check`
  - `git diff --exit-code -- examples/full-jaffle-shop-demo examples/snowflake-template`
- The initial `pnpm -F @lightdash/cli exec tsc --project tsconfig.eslint.json --noEmit` attempt selected the workspace TypeScript 7 RC and failed because the coordinator-owned config inherits `moduleResolution=node10`; the package's TypeScript 6 compiler passed the same integration typecheck. No shared config was changed.
- Live dbt/Postgres execution, focused repeats, full lane execution, and dbt 1.10/1.11 matrix evidence remain pending the serialized execution lease; `contentAsCode` currently owns the sole mutation lease.
- Remaining runtime risks: generated-model line parsing and schema teardown still need live confirmation against both matrix versions; analytics/version-health calls retain their existing bounded, swallowed-failure behavior.
- Commit: pending signed commit (`chore(e2e): port dbt CLI tests`).

### 2026-07-20 — execution complete

- The first local setup attempt exposed the inherited Docker-only `PGHOST=db-dev` and unavailable host `psql`. Local gates were rerun with the explicit host PostgreSQL environment, and schema teardown now uses a temporary-project dbt macro instead of requiring a separate client binary.
- Focused target passed with the exact version shims and distinct schemas:
  - dbt 1.10 (`dbt1.10`, `DBT_VERSION=1.10`): 9/9 passed.
  - dbt 1.11 (`dbt1.11`, `DBT_VERSION=1.11`): 9/9 passed.
- Repeat gate passed serially three times per version with six distinct schemas: dbt 1.10 27/27; dbt 1.11 27/27.
- Full `integration/dbt-version` lane passed serially for both versions with distinct schemas: dbt 1.10 9/9; dbt 1.11 9/9.
- CLI unit suite passed: 31 files, 273 tests.
- Final build, CLI source/integration lint, source/integration format, fast typecheck, and integration TypeScript 6 checks passed.
- Cleanup evidence: `information_schema.schemata` returned no `jaffle_dbt_node_local_%` schemas; the OS temp root contained no `lightdash-cli-dbt-*` or dbt shim directories; tracked demo fixtures remained unchanged.
- Legacy Cypress was not run, per execution-lease scope. No runtime risks remain from the approved port plan; CI dual-run remains the post-commit acceptance gate.
- Commit: pending signed commit (`chore(e2e): port dbt CLI tests`).

### 2026-07-20 — legacy Cypress parity

- The first local Cypress attempt failed because this CLI spec assumes its CI lane has already seeded the selected schema; running it against a fresh unique schema left every raw relation absent.
- After reproducing that lane prerequisite with dbt 1.10 `seed --full-refresh`, the unchanged Cypress spec passed 9/9 active tests with its one existing skipped `--exclude` case.
- The unique Cypress schema was dropped after the run, and all generated demo-fixture changes were restored and verified clean.
