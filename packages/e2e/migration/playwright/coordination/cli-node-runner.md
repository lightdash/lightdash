# CLI Node runner coordination

Coordination key: `cli-node-runner`

## Affected files

| Cypress source | CLI Node target | CI lane |
| --- | --- | --- |
| `packages/e2e/cypress/cli/api/commands.cy.ts` | `packages/cli/integration/no-dbt/commands.integration.test.ts` | `cli-tests-without-dbt` |
| `packages/e2e/cypress/cli/api/contentAsCode.cy.ts` | `packages/cli/integration/no-dbt/content-as-code.integration.test.ts` | `cli-tests-without-dbt` |
| `packages/e2e/cypress/cli/yaml-only/cli.cy.ts` | `packages/cli/integration/no-dbt/yaml-only.integration.test.ts` | `cli-tests-without-dbt` |
| `packages/e2e/cypress/cli/integration/cli.cy.ts` | `packages/cli/integration/backend-dbt/cli.integration.test.ts` | `cli-tests` |
| `packages/e2e/cypress/cli/dbt/cli.cy.ts` | `packages/cli/integration/dbt-version/cli.integration.test.ts` | `cli-dbt-tests` (dbt 1.10 and 1.11) |

Shared prerequisite files, in a separate future coordinator commit:

- `packages/cli/vitest.integration.config.ts`
- `packages/cli/package.json`
- `.github/workflows/pr.yml`

No Cypress source, port target, finding, manifest, application code, or shared test helper belongs in this coordination commit.

## Evidence

- All five findings describe child-process, filesystem, HTTP, and/or dbt behavior; none uses a rendered page. `packages/e2e/CLAUDE.md` reserves the browser package for rendered UI, and the migration control plane defines `cli-node` for CLI process coverage.
- `packages/api-tests` is for direct HTTP behavior. These tests exercise the built CLI process, so moving them there would blur package ownership.
- The current CLI Vitest config includes only `src/**/*.test.ts`, permits parallel workers, and is named `cli-unit-tests`; it cannot safely discover these live integration tests.
- The current Playwright Firefox project matches every `*.spec.ts`, depends on browser authentication, and applies a browser device. Adding Node-only CLI specs there would require exclusion/setup rules for no browser benefit.
- Every finding reports one or more shared-state hazards: `~/.config/lightdash`, a fixed cwd, leaked PATs/projects/content, seed-content mutation, a shared dbt target, or a shared Postgres schema.
- Existing CI already has the correct dependency boundaries: a preview-backed no-dbt job, a preview/Postgres/dbt 1.9 integration job, and a dbt 1.10/1.11 matrix. A fourth generic Playwright job is unnecessary.

## Decision

Use a dedicated **Vitest integration runner owned by `packages/cli`**. Do not use Playwright as a browserless process runner and do not place CLI process tests in `packages/api-tests`.

The current planning branch is exactly `chore/e2e-coordinate-cli-tests`. The shared implementation prerequisite must be a separate signed commit on branch `feat(e2e)/add-cli-node-runner`, based on this coordination commit, with proposed message `chore(e2e): add CLI Node runner`.

That future prerequisite adds only runner/configuration and lane routing. It must not port any Cypress assertion. Port branches are based on the prerequisite and use these exact names:

- `feat(e2e)/port-cli-commands`
- `feat(e2e)/port-cli-content-as-code`
- `feat(e2e)/port-cli-yaml-only`
- `feat(e2e)/port-cli-integration`
- `feat(e2e)/port-cli-dbt`

## Contract

### Runner

`packages/cli/package.json` exposes:

```text
test:integration = vitest run --config vitest.integration.config.ts
```

`packages/cli/vitest.integration.config.ts` has this stable behavior:

- includes only `integration/**/*.integration.test.ts`;
- Node environment, `pool: 'forks'`, `fileParallelism: false`, `maxWorkers: 1`, and no retries;
- 360-second test and hook timeouts;
- `TZ=UTC`, `LANG=en_US.UTF-8`, and `FORCE_COLOR=0`;
- does not change the existing unit-test config or `pnpm -F @lightdash/cli test`.

Every target uses `describe.sequential`. Every CLI invocation uses `process.execPath` with the absolute repository path to `packages/cli/dist/index.js` and an argument array. Tests must not depend on a globally installed `lightdash`, a shell command string, or another target file. Each child process has its own timeout of at most 300 seconds and reports exit code, stdout, and stderr on failure.

The global install and exact `lightdash --version` check remain in CI as packaging coverage. The weak Cypress `0.` version assertion is not ported.

### CI routing

The prerequisite adds one directory-guarded Node step **before** the existing Cypress step in each existing CLI job:

```bash
if [ -d packages/cli/integration/no-dbt ]; then
  pnpm -F @lightdash/cli test:integration -- integration/no-dbt
fi
```

`cli-tests` uses the same command with `integration/backend-dbt`; `cli-dbt-tests` uses `integration/dbt-version`. The guards let the prerequisite remain green before target files exist; once a directory exists, Vitest must discover at least one matching test or fail. Cypress remains present and authoritative during dual-run. The generic `playwright-smoke` job and `packages/e2e/playwright.config.ts` are unchanged.

The lane environment is explicit:

- all preview-backed lanes pass `SITE_URL=https://lightdash-preview-pr-${PR_NUMBER}.lightdash.okteto.dev`;
- backend/dbt lanes pass `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` directly, without `CYPRESS_` prefixes;
- `cli-tests` passes `SEED_SCHEMA=jaffle_cli_node_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}`;
- each `cli-dbt-tests` matrix job passes `SEED_SCHEMA=jaffle_dbt_node_${GITHUB_RUN_ID}_${strategy.job-index}_${GITHUB_RUN_ATTEMPT}`.

The final schema cleanup job must accept only these four exact CI prefix families: existing `jaffle_cli_tests_*` and `jaffle_dbt_tests_*`, plus `jaffle_cli_node_*` and `jaffle_dbt_node_*`. It must not use an unbounded `jaffle_*` match.

### Process and filesystem isolation

Each test or lifecycle owns a fresh `mkdtemp` root containing its `HOME`, cwd, and dbt target. It passes `HOME`, `CI=true`, `NODE_ENV=development`, and `FORCE_COLOR=0` explicitly to the child. It removes only that root in `finally`.

- Content-as-code uses only its temporary cwd; no shared `./lightdash` path.
- dbt-backed targets copy the fixture into their temporary root before any generate/compile operation and set `DBT_TARGET_PATH` or `--target-path` inside that root.
- No target may modify `examples/full-jaffle-shop-demo` or `examples/snowflake-template` in place.
- File edits use Node/YAML APIs with guarded parsing, not `sed`, `rm`, `ls`, shell pipelines, or string-interpolated commands.

Helpers remain file-local in the first ports. A shared process/auth helper requires a later coordination change only after two real consumers prove an identical API.

### Server and authentication isolation

Every preview-backed target is independently runnable and cleans its own mutations even when an assertion or process fails:

- Log in through the API as the seeded admin, create at most one PAT per target file, retain its UUID and secret, and delete it in `afterAll`/`finally`. Do not assume `SEED_PAT` is installed in every preview.
- Pass the seed project UUID explicitly where setup needs a project; never select “the first project.”
- Generate names/slugs from `randomUUID()`. Slugs are display identifiers, not cleanup keys.
- Capture created project/chart/dashboard/SQL-chart UUIDs from API responses. Cleanup is by UUID. If a CLI-only create exposes no structured UUID, use an exact unique-name lookup and delete every exact match; never delete by a legacy fixed name or broad prefix.
- Content-as-code update coverage creates and updates a run-owned chart; it must not update the seeded chart. Unfiltered uploads must not reconcile shared spaces unless space behavior is the assertion under test.
- Preview start/stop is one test with direct API fallback deletion in `finally`; it is not two order-dependent tests.
- Validation may leave its unique append-only validation-job record because no cleanup API is established, but it must not mutate seed project content or use the job as cross-test state.

### Postgres/dbt isolation

The `backend-dbt` and `dbt-version` targets own setup and teardown for the `SEED_SCHEMA` supplied by the lane:

1. Validate the schema against the exact lane prefix before using it.
2. Seed/run the target's temporary fixture as required by that file; do not rely on Cypress setup or another target.
3. Keep all tests in that file sequential.
4. Drop only that schema in `afterAll`, including after test failure. CI's final cleanup is the fallback for cancelled jobs.

Local runs generate a lower-case schema with the corresponding `jaffle_cli_node_` or `jaffle_dbt_node_` prefix plus a UUID fragment, remain below PostgreSQL's 63-byte identifier limit, and apply the same exact-prefix validation before `DROP SCHEMA ... CASCADE`.

### Independent-green rule

A port is ready only when its focused target passes from a clean temporary root using only the built CLI, declared environment, live preview/Postgres prerequisites, and its own setup. It may not require another migrated file to have run first. Full lane runs remain serial, but serial execution is load control rather than a state dependency.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `cli-node-runner` coordinator | Dedicated Vitest config/script, guarded routing in the three existing CLI jobs, direct Node env names, schema prefixes, and final cleanup allowlist. |
| Each port owner | Exactly one target file, file-local process/API helpers, owned fixture/schema setup, UUID tracking, cleanup, focused/repeated verification, and findings `Port history`. |
| `commands` port owner | Help and token-login/config coverage only; exact version remains owned by the existing CI check. |
| Orchestrator | Manifest status, assignment order, and deletion of Cypress only after dual-run acceptance. |

No port owner may edit the shared runner/config contract without returning to the coordinator.

## Dependency graph

```text
this documentation commit
  -> future feat(e2e)/add-cli-node-runner prerequisite
       -> no-dbt ports: commands | content-as-code | yaml-only
       -> backend-dbt port: integration/cli
       -> dbt-version port: dbt/cli (both matrix versions)
  -> successful per-file dual-run
  -> orchestrator-authorized Cypress deletion
```

The five port branches depend only on the prerequisite, not on each other. The three lane directories and CI guards avoid a “first port owns shared workflow” dependency.

## Verification

Future prerequisite gate:

```bash
pnpm -F @lightdash/cli build:fast
pnpm -F @lightdash/cli test:integration -- --passWithNoTests
pnpm -F @lightdash/cli typecheck:fast
pnpm -F @lightdash/cli run linter ./vitest.integration.config.ts
pnpm -F @lightdash/cli exec oxfmt vitest.integration.config.ts package.json --check
git diff --check
```

Per-port focused gates after building common, warehouses, and CLI:

```bash
pnpm -F @lightdash/cli test:integration -- integration/no-dbt/commands.integration.test.ts
pnpm -F @lightdash/cli test:integration -- integration/no-dbt/content-as-code.integration.test.ts
pnpm -F @lightdash/cli test:integration -- integration/no-dbt/yaml-only.integration.test.ts
pnpm -F @lightdash/cli test:integration -- integration/backend-dbt/cli.integration.test.ts
pnpm -F @lightdash/cli test:integration -- integration/dbt-version/cli.integration.test.ts
```

Each owner also runs CLI lint/format/typecheck, its full lane directory, and its focused file three times with a fresh temp root/schema each time. The dbt-version owner runs both dbt 1.10 and 1.11. Before merge, verify:

- temporary HOME/cwd/target roots are gone;
- no generated test PAT/project/content UUID remains;
- seed chart/dashboard/space content is unchanged;
- `git diff --exit-code -- examples/full-jaffle-shop-demo examples/snowflake-template` succeeds;
- Node schemas are absent after normal teardown and covered by the CI fallback cleanup;
- the corresponding legacy Cypress file and Node target both pass in the same CI lane.

## Rollout order

1. Land this documentation-only coordination commit.
2. Land the separate signed `feat(e2e)/add-cli-node-runner` prerequisite; verify its empty-runner command and all three directory guards.
3. Port `commands` first as the smallest proof of process capture, isolated HOME, PAT cleanup, and no-dbt routing.
4. Port `yaml-only`, then `content-as-code`; keep each commit independently runnable and cleanup-complete.
5. Port `integration/cli` after proving the Node Postgres schema lifecycle in the dbt 1.9 lane.
6. Port `dbt/cli` last and gate it on both dbt matrix versions plus fixture-clean checks.
7. Keep Cypress during bounded dual-run. Removal/version-job simplification is a later orchestrator-authorized change, never part of a port or coordinator prerequisite.

## Unresolved questions

None blocks the runner prerequisite. Port owners must record, but not silently redefine, these product-level contracts:

- whether token login must assert first-project persistence or only successful authentication and normalized config;
- whether content-as-code's exact five linked-chart count is stable product behavior;
- whether the skipped dbt `--exclude` case should be re-enabled (it remains skipped in this migration);
- whether the negative partial-compile contract is the exact count of two errors or specific missing explores;
- whether validation accepts any completed business findings or must validate cleanly;
- whether a supported CLI telemetry opt-out should be added. Until product code exposes one, tests use bounded process timeouts and do not add a test-only bypass.

## Correction — 2026-07-18

The prerequisite's TypeScript Vitest config cannot be linted through the current `packages/cli/.eslintrc.js` project because `packages/cli/tsconfig.json` includes only `src`, sets `rootDir` to `src`, and intentionally excludes root config and integration files.

Approve the smallest dedicated lint-only wiring:

- add `packages/cli/tsconfig.eslint.json`, extending `./tsconfig.json`, overriding `rootDir` to `.`, setting `noEmit: true`, and including only `vitest.integration.config.ts` and `integration/**/*.ts`;
- update `packages/cli/.eslintrc.js` with a TypeScript parser-project override for exactly `vitest.integration.config.ts` and `integration/**/*.ts`, pointing to `./tsconfig.eslint.json`;
- retain all existing ESLint extensions and rules. Do not add ignores, disable type-aware linting, or weaken any rule;
- do not modify or reference the lint-only config from `packages/cli/tsconfig.json`, `packages/cli/tsconfig.fast.json`, or any root build config. Build `rootDir`, includes, references, composite output, and build semantics remain unchanged.

The exact additional files allowed in the future prerequisite are:

- `packages/cli/tsconfig.eslint.json` (new);
- `packages/cli/.eslintrc.js` (targeted parser-project override only).

These are additional to the previously approved `packages/cli/vitest.integration.config.ts`, `packages/cli/package.json`, and `.github/workflows/pr.yml`.

For pnpm 10, the corrected empty-runner verification command is:

```bash
pnpm -F @lightdash/cli test:integration --passWithNoTests
```

This supersedes the earlier command containing a literal argument separator (`--`).

COORDINATION_COMPLETE
