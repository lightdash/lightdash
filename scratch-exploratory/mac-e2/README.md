# Mac E2 shutdown handoff, 21 October 2026

Testing stopped for the urgent Mac shutdown. No further tests were started. This branch contains evidence and source overlays only. It contains no runtime secrets, generated fixture identities, database dumps or generated manifests. Results use synthetic payments/merchants/marketing data. No product fix is included.

Read reports/31358.md and reports/31362.md first. JSON `success` fields describe the operation, not whether the scenario passed: the expected CLI 409 has success=false, and the confirmed chart-loss bug has deploy success=true.

## Source and evidence

- Failure-isolation head: dcf6e9eafb7e955959ffc804d9bb9faec1917cc6.
- Naming head: c0abadfe4a8ef5eee15c452f54e4096d5c60a01d (this branch's parent).
- Main control: 7ef1abdd388765a353ade4b98046b11c7078d1f0.
- Reference fixture: test/multi-repo-dbt-sim, 5cb32ce9ad9d5c8774451d6a09ed36a6135a7f4e, draft https://github.com/lightdash/lightdash/pull/31365. NEVER merge, change or push that fixture branch.
- results/31358-failures.json: reduced-fixture failures, recovery, cancellation/deadline, CLI carry and main control.
- results/31358-simulation.json: all ten published small scenarios on the isolation head.
- results/31362-owners.json: full saved owner/upgrade/conflict evidence.
- results/31362-owner-summary.json: operation flags only, read alongside the report.
- e2/: locally adapted reduced harness, generators and scenario batches. batch62_reservation.py is PREPARED BUT NEVER RUN.
- runtime/: private controller, environment entrypoints, fixture/CLI adapters and minimal CLI carry reproduction.
- backend/: private core+EE migrations and local storage bootstrap.
- fixture-overrides/: locally adapted published run.py and tooling.py.

## Restore on the dev box

Use a dedicated worktree and ONLY new private local services, ports and fresh throwaway secrets. Do not use the simulation thread's services or any shared ldenv containers. Read every controller before starting it. The scripts retain Mac paths and ports as evidence; they are not a turnkey dev-box bootstrap.

1. Fetch the product heads and the fixture branch. Keep this handoff commit available. On the chosen detached product head, restore examples/multi-repo-dbt-sim from the exact reference fixture commit read-only. Copy e2/ to scratch-exploratory/e2/, runtime/ to .expl-e2/, and backend/ to packages/backend/.expl-e2/. Copy fixture-overrides/run.py and tooling.py over the fixture's corresponding files. Locate their original directory with rg --files examples/multi-repo-dbt-sim.
2. Adjust the hardcoded checkout in runtime/run and run-clean, use a Linux-compatible shell, and select new free ports throughout runtime/ldenv, runtime/containers.py, e2/runtime.py and the local environment. e2/runtime.py currently uses API18962 and the local Git fixture server19462; database25462, warehouse25463 and MinIO29462 belonged only to this Mac instance.
3. Generate a NEW .env.expl-e2 locally. It is deliberately omitted. Provide app and warehouse connection settings (PGPORT_APP/PGDATABASE_APP separate from PGPORT/PGDATABASE), local passwords, LIGHTDASH_SECRET, local S3/MinIO settings, local test registration settings SIM_EMAIL/SIM_PASSWORD, and flags multi-dbt-sources,cross-source-dbt-refs. Leave the licence empty. Disable analytics/update checks and NATS. Do not load any stored credential. The controller reads each line as KEY=value; do not add comments. Keep the file ignored.
4. Generate a private .expl-e2/gitconfig for file:// and the local HTTPS fixture CA. trust_local_git in the published runner writes only this file via GIT_CONFIG_SYSTEM; runtime/git-private.cjs supplies it to backend git subprocesses. No system Git config was changed on the Mac. CLI configuration is isolated via cli-home.cjs. Inspect trust_local_git and adapt-published.py before running; the latter restores fixture scripts before applying its replacements.
5. Use Node24.18.1. Before each heavy step check df >=15GiB and 1-minute load <=10; keep heap <=6144MB, no watch. Install only into the worktree. Server .venv-dbt: dbt-core1.12.0/dbt-postgres1.10.2/psycopg2-binary2.9.13. Published CLI .venv-dbt-cli: dbt-core1.12.3/dbt-postgres1.10.0/dbt-loom0.9.6/psycopg2-binary2.9.13. Separate .venv-dbt19: dbt-core1.9.10/dbt-postgres1.9.1/dbt-loom0.9.6. setup-dbt.sh contains a Mac managed Python path that needs replacement.
6. Start only private Postgres app, Postgres warehouse and MinIO. PGPORT=5432 must override the host-port value INSIDE Postgres containers. Build common and CLI, regenerate backend API, apply both core and EE migrations with backend/migrate.ts (plus graphile migrations), create the private bucket with storage.ts, and start the own backend controller. switch-head.sh records the Mac serial rebuild/migration process. Recreate fixture repos/data with e2/prepare.py and build_fixture.py. Original generated state is omitted; initialise a fresh user/project/baseline using bootstrap.py and the harness.

## Exact remaining work

For31358, repeat runtime/repro-cli-carry.py on a fresh two-source project, inspect cached ownership before/after explicit source deploy and denial refresh, and compare main. The carry bug is confirmed twice; no draft fix was pushed. The full compile deadline and SIGTERM tests passed; generic SCHEDULER_JOB_TIMEOUT did not apply to this compile task, so do not claim that timer was tested.

For31362, first minimise first-owner-cli-fresh-newcomer from e2/batch62_owner.py and inspect primary source stamps. It fails before the first multi-source refresh, while the same deploy after a multi-source refresh passes. Recreate old62.py's old-writer baseline before running the full owner batch; its saved baseline identities are deliberately omitted. Then run EXPLORE_BATCH=31362 .expl-e2/run .venv-dbt/bin/python scratch-exploratory/e2/batch62_reservation.py against a freshly prepared compatible fixture. All reservation scenarios in that script remain untested: simultaneous newcomers, late third source via CLI, repeat, CLI persistence, restart, one/no survivors, no extra sources, return, and same-source packages. Finally run all ten published scenarios on this head into a new results directory.

No tests should be resumed on the Mac. Do not push either draft product branch or the fixture branch. The requested scratch branch is the only push from this handoff.
