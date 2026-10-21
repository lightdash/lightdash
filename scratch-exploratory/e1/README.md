# E1 exploratory preparation

This branch contains preparation only. No PR runtime matrix ran on the source machine. The source machine completed bootstrap parsing, all six seeds and all six base-model builds. The normal cross-source build remains undone. Start with a fresh local warehouse on the destination; no database, credentials, generated repositories or built CLI artifacts are transferred.

The scenario harness is prepared, with Python and JavaScript syntax checks only. Its runtime behaviour is not yet validated. Four report drafts are in `reports/`.

## Revisions and scope

- Baseline: `7ef1abdd388765a353ade4b98046b11c7078d1f0`, released CLI 3.20.1. It includes [the ref fix](https://github.com/lightdash/lightdash/pull/31313) and [the empty-selection fix](https://github.com/lightdash/lightdash/pull/31283).
- [Deploy inference](https://github.com/lightdash/lightdash/pull/31326), last fetched: `4629b2f651098b48e90f0cd340253980af03bcf1`. This contains the source deprecation warning. Its package version is 3.12.2. It contains neither merged fix. Test the exact head with `deploy_raw`, which uses two sources without the mixed-ref shape. Then create a local merge with the baseline for the integrated `deploy` matrix. A merge-tree check on the source machine was clean. Do not push this test merge.
- [Parameter omission](https://github.com/lightdash/lightdash/pull/31359), last fetched: `d135364f71ea34b1597f4d304c2de014c5859e9e`. It includes both merged fixes. Its package version is 3.20.1.

Re-fetch draft heads before testing. Do not push their branches. Bug fixes belong to their owning threads. Keep commits signed and use normal pushes. Do not merge or mark a PR ready.

## Bootstrap on the destination

Run these commands in Bash, inside a dedicated T3-bound worktree. Do not use another thread's instance. Use Node from `.nvmrc`, the repository's pinned pnpm, Python 3.12, `uv`, Docker, Git signing and an installed ldenv. Keep heavy work serial with E2 on this machine and check load before each heavy step. `check-load.py` prints `uptime` and `free -g`, or `vm_stat` on macOS, and waits above a one-minute load of 6.

```bash
git fetch origin scratch/exploratory-prep-e1
git checkout --detach origin/scratch/exploratory-prep-e1
export NODE_OPTIONS=--max-old-space-size=4096
export EXPLORATORY_WORK_DIR="$PWD/scratch-exploratory/e1/.work"
export LIGHTDASH_ENABLE_FEATURE_FLAGS=multi-dbt-sources,cross-source-dbt-refs,multi-connection-projects
export LIGHTDASH_LOG_CONSOLE_FORMAT=json
export DBT_SOURCE_FETCH_CONCURRENCY=2
umask 077
mkdir -p "$EXPLORATORY_WORK_DIR"
export GIT_CONFIG_SYSTEM="$EXPLORATORY_WORK_DIR/gitconfig"
touch "$GIT_CONFIG_SYSTEM"
python3 scratch-exploratory/e1/check-load.py
"$HOME/.ldenv/bin/ldenv" up --backend bundle
"$HOME/.ldenv/bin/ldenv" wait
```

Use the local seed login printed by ldenv, or a local API key. Do not copy a remote API key or the user's CLI configuration. These shell inputs are private and are not written to tracked files:

```bash
unset LIGHTDASH_API_KEY
read -r -p 'Local seed email: ' SIM_EMAIL
read -r -s -p 'Local seed password: ' SIM_PASSWORD
export SIM_EMAIL SIM_PASSWORD
examples/multi-repo-dbt-sim/setup.sh
python3 scratch-exploratory/e1/check-load.py
python3 examples/multi-repo-dbt-sim/configure.py
```

`setup.sh` creates private environments with these exact versions:

- Python 3.12; dbt-core 1.12.3; dbt-postgres 1.10.0; dbt-loom 0.9.6.
- Python 3.12; dbt-core 1.9.10; dbt-postgres 1.9.1; dbt-loom 0.9.6 for the older source.

`configure.py` installs instance-local `dbt1.12` and `dbt1.9` aliases and restarts only the worktree's API with the fixture flags, structured logs and private Git configuration. The server and CLI can then use the prepared dbt executables. The third feature flag is needed for extra warehouse connections; the local licence must allow them too.

The profile is `multi_repo_sim`, target `dev`, schema `sim`, from `base/profiles/profiles.yml`. Its connection values come from `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` loaded from the instance's local environment. The runner rejects non-loopback warehouses. All seeds are synthetic CSV files with three rows. No real warehouse is required.

Keep an old CLI before changing code. The optional second artifact allows an additional older-version check:

```bash
npm pack @lightdash/cli@3.19.0 --pack-destination "$EXPLORATORY_WORK_DIR"
mkdir -p "$EXPLORATORY_WORK_DIR/cli-3.19.0"
tar -xzf "$EXPLORATORY_WORK_DIR/lightdash-cli-3.19.0.tgz" -C "$EXPLORATORY_WORK_DIR/cli-3.19.0" --strip-components=1
python3 scratch-exploratory/e1/freeze-baseline.py
node "$EXPLORATORY_WORK_DIR/old-cli/dist/index.js" --version
```

The frozen baseline is the built 3.20.1 CLI with its own copied workspace runtime code and fixed dependency links. The 3.19.0 npm artifact uses those same baseline dependencies; describe this limitation when reporting it. Do not run the freeze script after switching to a draft head.

Build the entire small fixture, including the normal cross-source runs:

```bash
python3 scratch-exploratory/e1/check-load.py
examples/multi-repo-dbt-sim/run --scale small --build-only --timeout 1200
```

The build first parses and publishes bootstrap manifests, then seeds every repository, then builds every `sim_base` model, then performs normal full-refresh runs. dbt-loom loads the published upstream manifests from local files. This ordering supports the project ring without a model cycle.

During a scenario the runner signs synthetic local Git repositories, publishes bare copies beneath `.work/small/remotes/sim/`, and serves them through `git http-backend` over loopback HTTPS. The API project has a Git-backed primary and rows in `project_dbt_sources` for additional repositories. Their GitHub-style connections point to the temporary local server and `sim/<synthetic source>`, with an empty access credential. No external repository or token is needed. The runner adds one URL-scoped CA entry to the private `GIT_CONFIG_SYSTEM` file, then removes it in `finally`. TLS verification stays enabled. Confirm that the destination API inherits this environment setting; this macOS path has not yet had a runtime check.

## Run the prepared cases

```bash
examples/multi-repo-dbt-sim/run --skip-build --scenarios baseline ambiguity empty-selector warn-error versioned config-none --timeout 600
examples/multi-repo-dbt-sim/.work/venvs/dbt12/bin/python -u scratch-exploratory/e1/explore.py merged
```

The baseline runner has the ring, ambiguity, basic empty-selector and YAML warning controls. The `merged` suite adds mixed refs in one consumer, three owners, a qualified primary, all version syntaxes with repeated refresh, a real model cycle, strict warning environment, a referenced empty source, a single-source empty catalogue, CLI empty selections and a broken-project control. It reads stored manifest dependencies as well as refresh jobs and resolver metrics.

After a baseline pass, stop the instance before changing code. Preserve the prep files when checking out an exact product revision, since these paths do not exist on the draft branches:

```bash
"$HOME/.ldenv/bin/ldenv" stop
git fetch origin main fix/cli-deploy-infer-source thunder/params-missing-section-noop
git checkout --detach origin/fix/cli-deploy-infer-source
git restore --source origin/scratch/exploratory-prep-e1 --worktree -- examples/multi-repo-dbt-sim scratch-exploratory/e1
```

Rebuild runtime dependencies, CLI and backend from each code revision, one command at a time after a load check. Install that revision's lockfile dependencies if required. Do not use watch mode:

```bash
python3 scratch-exploratory/e1/check-load.py
pnpm common-build
python3 scratch-exploratory/e1/check-load.py
pnpm warehouses-build
python3 scratch-exploratory/e1/check-load.py
pnpm -F @lightdash/cli build
LDENV_TOOLS_DIR=$(python3 -c 'import json,pathlib; print(json.loads((pathlib.Path.home()/".ldenv/tool.json").read_text())["directory"])')
python3 scratch-exploratory/e1/check-load.py
node "$LDENV_TOOLS_DIR/scripts/ldenv/backend-bundle.cjs" --root "$PWD" --out-dir "$EXPLORATORY_WORK_DIR/backend"
python3 scratch-exploratory/e1/start-api-and-wait.py "$EXPLORATORY_WORK_DIR/backend/api.cjs"
examples/multi-repo-dbt-sim/.work/venvs/dbt12/bin/python -u scratch-exploratory/e1/explore.py deploy_raw
```

`start-api-and-wait.py` starts only the existing instance's API from the fixed bundle and waits for health. It derives the instance identity and port from ldenv. It does not start package watchers. ldenv can still stop the owned process. The normal instance readiness flag can remain stopped; the custom suite uses the actual API port and HTTP health rather than that flag.

For the integrated deploy matrix, make a local merge in the detached worktree, resolve any new conflicts, restore the prep paths again, rebuild as above, and run `explore.py deploy`. The local merge must contain both the selected baseline and the fetched deploy head. Do not commit or push restored prep paths to a product fix branch.

For parameters, stop the instance, check out the fetched parameter head detached, restore the prep paths, rebuild and run `explore.py params`.

The `deploy` suite covers inferred/explicit/old CLI deploys, sibling preservation, duplicate names, rejected unknown uploads, collisions with the saved chart's stored query, unchanged remote Git during CLI-only additions, refresh after deploy, single-source behaviour, non-watching preview paths, two warehouse connections, a separate synthetic replica database and ambiguous inference.

The `params` suite covers missing file/section, YAML null, empty map and replacement through new and old CLIs, server refresh, one configured source among several, other config controls, and `start-preview`. Each omission test seeds a retained parameter first. HTTP recording distinguishes an omitted request from an explicit empty-map request. CLI config writes are isolated by `cli-home.cjs` without changing the user's home or CLI login.

`FILTER_CASE` can select comma-separated cases. Cases with setup dependencies must run with their prerequisites. `SIM_URL` can override the API URL, but only a loopback local instance is allowed. Results append by case under `$EXPLORATORY_WORK_DIR/evidence/`; errors and generated identifiers are redacted. The original runner writes results under the fixture's `.work/small/results/`. Keep every command below 35 minutes and split suites if necessary. `resume-build.py seed|bases|run` can continue a partial build on the same machine; never treat source-machine completion as destination-machine state.

## Completion

Update the four reports with actual tested revisions, commands, observed versus expected results, severity, fixes requested, retest status and explicit gaps. A zero process exit from the scenario runner is not a product pass: inspect job status, explore errors, ownership, stored config, HTTP events and saved-query results.

Stop the owned instance with `ldenv stop` before idling or finishing. The source instance was already stopped before this handoff. No product fix, PR, public comment or owner fix request was made during preparation.
