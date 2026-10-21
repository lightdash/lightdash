# Mac e1 emergency handoff

Testing stopped on 21 October 2026 before either draft head was executed. Read the four reports first. No product bug has been confirmed; no product fix/PR exists. Do not resume the Mac instance. All data is synthetic. Credentials, raw logs, generated fixture repositories/manifests, process IDs and local state are deliberately excluded.

## Restore the harness on the dev box

Start in this branch's dedicated checkout. Do not use the simulation thread's environment or shared containers. Fetch `origin test/multi-repo-dbt-sim`; restore `examples/multi-repo-dbt-sim` from `5cb32ce9ad9d5c8774451d6a09ed36a6135a7f4e` read-only. Never push or merge that branch. Copy `scratch-exploratory/mac-e1/scripts/*` into `scratch-exploratory/e1/` and `backend-scripts/*.ts` into `packages/backend/src/scripts/thunder-expl-e1/`. The scripts intentionally retain those original relative locations; do not run them from the archive directory.

Read `infra.py`, `start_api.py`, `harness.py` and the fixture README before setup. Replace Mac-only fnm/lsof assumptions and fixed ports as needed. Check free ports, disk >=15 GiB, load <=10. Create only owned containers and regenerate all throwaway credentials in the target `.env`; no credentials travelled in this branch. `infra.py` is the setup reference, not a command to run without checking ownership. API was 18981, worker 18982, Postgres 15981, S3 19981 on the Mac. Node 24.18.1, heap <=6144 MB, no watch. Run heavy operations sequentially.

Build normal dependencies/CLI and generate backend routes. Backend helper `migrate.ts` creates a fresh core+EE migration schema without an EE licence. Helper `control.ts` has a multi-source fixture seed path that was written but NOT executed; distinguish fixture provisioning from API entitlement tests. The instance used API plus a separate one-concurrency compile worker. See `start_api.py` for the exact process environment.

Create Python 3.11 environments: CLI `.venv-dbt` core1.12.3/postgres1.10.0/Loom0.9.6; `.venv-dbt19` core1.9.10/postgres1.9.1/Loom0.9.6. For the next stock-server baseline use separate `.venv-dbt-server` core1.12.0/postgres1.10.0, NO Loom. Set SERVER_DBT_BIN to that environment's bin directory for API/worker. A frozen 1.12.3-without-Loom package list is included solely to reproduce the latest ambiguity control. Ensure `dbt1.12` and `dbt1.9` aliases and fixture `.work/venvs/dbt12`/`dbt19` links target the correct environments.

`tls.cjs` injects a private Git include only for the fixture localhost URL: main's cancellable Git spawn drops environment variables, so GIT_CONFIG_SYSTEM alone did not work. TLS verification stays enabled. `adapters.py` creates the scoped CA configuration. `cli-home.cjs` isolates the CLI home; `local-telemetry.cjs` intercepts the CLI's otherwise unconditional analytics call. Do not run the CLI with Charlie's real home/config. Never copy a real login or licence into this environment.

## Commands after setup

The canonical full small run already completed on main with server Loom enabled:

```sh
python3 scratch-exploratory/e1/run.py --heavy .venv-dbt/bin/python -u scratch-exploratory/e1/simulation_runner.py --url http://127.0.0.1:18981 --skip-build --dbt19 .venv-dbt19/bin/dbt --timeout 600
```

The fresh ambiguity control completed successfully with server Loom removed, same core1.12.3:

```sh
python3 scratch-exploratory/e1/run.py --heavy env FRESH_AMBIGUITY_REPRO=1 .venv-dbt/bin/python -u scratch-exploratory/e1/simulation_runner.py --url http://127.0.0.1:18981 --skip-build --dbt19 .venv-dbt19/bin/dbt --scenarios ambiguity --timeout 600
python3 scratch-exploratory/e1/assert_ambiguity.py
```

Inspect `prepared_explore.py` argparse/help for positional suite invocation (`merged`, `deploy_raw`, `deploy`, `params`); the prepared extended suites have NOT been run. Its wrapper delegates to the canonical runner while replacing shared-ldenv assumptions. `OLD_CLI` and `RELEASE_CLI` target real npx `@lightdash/cli@3.19.0`; that install/run is pending. Do not substitute a mixed-dependency old CLI build. Read each PR report's remaining matrix.

Check out fetched PR heads detached in this worktree, rebuild and restart only this instance. Head 31326 is older than both merged fixes: test exact head separately from a local main integration. A clean merge-tree was computed locally, but no integration commit exists. Head 31359 includes the merged fixes. Re-fetch both branches before testing. Never push either draft owner's branch.

## Evidence interpretation

`main-with-server-loom.json` contains the complete canonical baseline, including the retry-loop ambiguity candidate. `main-latest-includes-no-loom-ambiguity.json` has that single scenario replaced by the later successful fresh-project control; all other rows remain the earlier server-with-Loom baseline. Do not treat it as a full run without Loom. Initial missing dbt1.9 executable was corrected and the server1.9 case rerun successfully. Synthetic identifiers and generated hashes are redacted, so these files are evidence summaries, not replayable database snapshots. Raw logs were omitted because they contain generated identifiers. Build passed for all small repos. Full scale, pre-fix differential and all draft/old-CLI comparisons remain pending.

## Shutdown and source state

Only this batch used `thunder-expl-e1-pg`, `thunder-expl-e1-s3`, API18981 and worker18982. Stop helpers verify saved process ownership before signalling. This handoff does not depend on keeping any Mac container or volume. Product routes/swagger generated locally were never staged. The archive contains no dependency trees, venvs, credentials or private fixture state.
