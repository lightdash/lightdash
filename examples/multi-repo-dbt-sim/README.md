# Multi-repo dbt simulation

This development fixture simulates a customer with ~20 dbt repos on one
Lightdash project and one Postgres connection. All names, SQL and seed rows
are synthetic. It contains no customer inputs.

See the [observed matrix and Findings](reports/README.md) for the recorded
main-build results, including the three cross-repo join comparisons.

The small fixture has six hand-written repos: payments, merchants, finance,
risk, growth and marketing. They have 19 logical models and 20 model nodes.
The full fixture has 22 repos, 3,000 logical models and 3,001 model nodes.
Payments has 1,300 models. There are 177 distinct duplicated names, including
158 shared by payments and merchants and one three-way overlap.

`base/` is the reviewable input. `generate.py` expands it deterministically
from a seed. Generated repos, signed Git history, manifests, venvs, TLS keys
and results stay in the ignored `.work/` directory. Each generated repo has
its own Git history and schema. The shared profile reads the five `PG*`
variables from this worktree's environment.

The production `dockerfile` and preview `dockerfile-prs` use selected copy
paths. Neither copies this directory. Published packages use `files`
allowlists that exclude this directory; the root package is private.
`.dockerignore` is a symlink to the root `.gitignore`; the root
ignore entry also excludes the generated work directory from Docker's build
context. This fixture changes no product behaviour or API.

## Set up this worktree

Use this worktree's ldenv instance. Do not start a second server or use another
worktree's instance. The commands require the repo's Node/pnpm versions,
Python 3.12, uv, Git, OpenSSL and the existing Git signing configuration.

```bash
ldenv up --no-wait
ldenv wait
bash examples/multi-repo-dbt-sim/setup.sh
python3 examples/multi-repo-dbt-sim/configure.py
examples/multi-repo-dbt-sim/run
```

`setup.sh` creates two private venvs with dbt 1.12.3 and 1.9.10, their Postgres
adapters and dbt-loom 0.9.6. It builds the CLI from this worktree. It does not
change shared dbt installations. `configure.py` enables `multi-dbt-sources`
and `cross-source-dbt-refs` and JSON logs on this worktree's API process. It
adds the private dbt 1.9 executable to that process's PATH. It waits for a real
HTTP health response after the restart. It caps source fetch concurrency at two.

The runner prints `uptime` and `free -g` before builds and scenario operations.
It waits while the one-minute load is above six. Each child command has a
30-minute limit. For a bounded whole invocation, use
`timeout --signal=TERM 1800s examples/multi-repo-dbt-sim/run`.

## Run and compare builds

The default runs the complete small matrix. Select scenarios or scale:

```bash
examples/multi-repo-dbt-sim/run --scenarios baseline ambiguity collision
examples/multi-repo-dbt-sim/run --skip-build --scenarios cli-join-connected cli-join-unconnected server-join
examples/multi-repo-dbt-sim/run --scale full --build-only
examples/multi-repo-dbt-sim/run --scale full --skip-build --scenarios baseline scale versioned collision unreadable cli-deploy
```

The warehouse build seeds every repo, builds leaf models across all repos,
then builds consumer models. A bootstrap parse publishes real manifests with
cross-repo refs disabled through `sim_bootstrap`. Normal builds use dbt-loom
against those locally published manifests. The ring is between projects;
its model graph has no closed loop. Imports exclude foreign packages and load
their dependency closure separately. This follows dbt-loom's
[package exclusion configuration](https://nicholasyager.github.io/dbt-loom/0.8/advanced-configuration/).

To target another locally running branch build, supply its API URL and CLI:

```bash
examples/multi-repo-dbt-sim/run --target url \
  --url http://localhost:8080 \
  --cli 'node /absolute/checkout/packages/cli/dist/index.js' --target-sha REVISION \
  --out examples/multi-repo-dbt-sim/.work/comparison
```

Only loopback URLs are accepted. An explicit `--server-project` or
`--cli-project` targets a disposable project and requires exactly one scenario.
The runner resets that project's connections and sources. `code_sha` identifies
the fixture checkout; `target_sha` records the supplied comparison revision.
Use a separate
output directory for each target build. `--seed` defaults to 42. `--dbt` and
`--dbt19` select prepared executables. `--skip-build` reuses the warehouse and
published manifests; use it only after a successful build of those inputs.

Results land in `.work/<scale>/results/results.json` and `SUMMARY.md`.
`build.json` records each dbt stage and its duration. The JSON preserves the
before/after source counts, total explores, parameters, YAML spotlight tags,
table groups, defaults, connection mode, errors, HTTP conflicts, resolver
passes and timings. HTTP error responses from CLI requests are captured by a
temporary loopback proxy. Credentials and generated identifiers are redacted.
Source counts use the table's source marker when present, with the synthetic
schema domain as a fallback. The API names the primary source `dbt_project`.
The runner retains previous scenario rows and replaces a selected row on
rerun. A nonzero exit means a harness failure; expected product failures are
observations in the report.

## Two project modes

Server scenarios use a Git-backed primary and additional Git sources.
CLI scenarios use a separate CLI-managed project. Every repo gets one full
`lightdash deploy`, compiled with dbt-loom, without `--source`. `cli-source` is
an explicit diagnostic control for the legacy flag. Projects used for the
refresh-after-CLI scenario remain server-configured so that the crossover
itself can be tested.

Additional sources currently accept GitHub connections, rather than arbitrary
local paths. The runner serves one signed bare repo per source through
`git http-backend` over loopback HTTPS. Source configuration uses a synthetic
`sim/<domain>` repository and this server's host/port. No GitHub repo, token
or public push is needed. Each repo is unreadable on demand by returning HTTP 403. This also works when the caller runs as root.

The local Git server uses a private certificate. During the run, the runner
adds one URL-scoped `http.https://localhost:<port>/.sslCAInfo` system Git key.
It refuses to overwrite an existing key and removes its key in `finally`.
This needs permission to write system Git configuration on the dev box. TLS
verification stays enabled. The server and CLI proxy stop at the end. The
reported Git count is upload-pack discovery requests, including failed
attempts and retries; it is not an exact count of completed clones. No global
`/tmp` disk attribution is attempted while other instances run.

## Scenario expectations

| Scenario                                     | Operation and expected behaviour                                                                                                                    | Related work                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `baseline`                                   | Refresh the ring, shared upstream, mixed refs, versions and cross-repo join. Query three seeded ledger rows.                                        | [#31313](https://github.com/lightdash/lightdash/pull/31313) fixes the stale-ref loop.                   |
| `ambiguity`                                  | Remove the explicit qualified ref. Expect a clear one-argument ambiguity error.                                                                     | Same control as the stale-ref fix.                                                                      |
| `cli-deploy`, `cli-source`                   | Deploy repos in order. Record sibling loss, source ownership and connection mode.                                                                   | Reworked [#31326](https://github.com/lightdash/lightdash/pull/31326).                                   |
| `config-none`, `config-partial`              | Deploy full config, then no config or partial config. Record parameters, tags, groups and defaults.                                                 | Config replacement remains separate work.                                                               |
| `refresh-after-cli`                          | Deploy a local-only model, then refresh the server's restored Git inputs.                                                                           | CLI-only explores can disappear.                                                                        |
| `unreadable`                                 | Start from a good catalogue, deny one remote, then refresh.                                                                                         | Pending failure-isolation work.                                                                         |
| `empty-selector`, `warn-error`               | Select a missing tag; promote NoNodesForSelectionCriteria to error; run the CI-style suppression control.                                           | [#31283](https://github.com/lightdash/lightdash/pull/31283) and pending isolation work.                 |
| `collision`, `cli-collision`                 | Save a chart and query on ledger; add a newcomer ledger; deploy/refresh; run the original query again.                                              | Reworked [#31326](https://github.com/lightdash/lightdash/pull/31326) and pending collision-naming work. |
| `duplicate-project`, `cli-duplicate-project` | Reuse the growth dbt project name in marketing. Record early refresh validation and CLI inference.                                                  | Distinct from duplicate model names.                                                                    |
| `versioned`                                  | Compare consecutive refresh times and resolver passes for v=, version= and latest refs.                                                             | Record an extra pass if observed; cacheRowsLoaded identifies cache state.                               |
| `scale`                                      | Refresh all generated sources. Record counts, timings and Git discovery requests.                                                                   | Disk/clone pressure observation.                                                                        |
| `cli-join`                                   | Deploy payments alone. Capture the missing cross-repo join warning and resulting explore.                                                           | Join import remains separate work.                                                                      |
| `cli-join-connected`                         | Register payments and merchants. Deploy merchants, then payments with dbt-loom. Record compile/deploy, the join, and upstream explore loss.         | Separate local compilation from registered sources.                                                     |
| `cli-join-unconnected`                       | Register only payments. Deploy it with the same locally published merchants manifest. Record compile/deploy, the join, and upstream explore import. | Control for source registration.                                                                        |
| `server-join`                                | Refresh payments and merchants from Git. Record the same join and upstream explore.                                                                 | Server comparison for the same model YAML.                                                              |
| `dbt19-server`, `dbt19-cli`                  | Run the graph with server dbt 1.9 and deploy the older repo with its separate CLI venv.                                                             | Server dbt version is project-wide.                                                                     |

The full fixture includes thousands of one-argument seed/local refs, hundreds
of qualified refs, and 270 generated rate refs in payments split across pinned
v=, pinned version= and latest syntax. It includes small two-way and three-way
name overlaps. Payments directly references 15 upstream projects and finance
directly references 10. The generated model counts approximate the reported
shape rather than matching each repo's size.

The growth repo declares a dbt 1.9 version range. Combined server scenarios
set `DBT_VERSION_CHECK=false` for that source because Lightdash chooses one
dbt version for the project. The dedicated 1.9 server scenario selects 1.9 for
the whole graph. CLI deploy uses the separate 1.9 executable for growth.

The join comparison uses `payments` model metadata with a join to `merchant`
owned by the merchants repo. Its SQL also uses a qualified dbt ref to that
upstream model. The downstream repo has no local merchant model. CLI cases
use dbt-loom against the same published manifest. Neither passes `--source`.
`join_observation` records compile/deploy success, joined tables, upstream
explore presence before and after, and exact warnings or errors. The connected
case first deploys the upstream, so source registration and an existing
upstream explore are both present when the downstream compiles. Server refresh
uses the same YAML from the signed local Git repositories.

## Join findings on the pinned main build

These are runtime observations on main revision `b7dd419f98`, small scale,
seed 42. The CLI is built from that checkout. The server uses dbt 1.12.0;
the CLI uses the private dbt 1.12.3 and dbt-loom 0.9.6 environment.

| Case                                        | Expected                                 | Observed compile / deploy | Join on payments                          | Upstream merchant explore                           |
| ------------------------------------------- | ---------------------------------------- | ------------------------- | ----------------------------------------- | --------------------------------------------------- |
| CLI, upstream registered and deployed first | Local compile may drop the external join | Both succeed              | Absent                                    | Present before; absent after downstream deploy      |
| CLI, upstream not registered                | Local compile may drop the external join | Both succeed              | Absent                                    | Absent before and after; not imported as an explore |
| Server refresh, both repos registered       | Resolve the cross-repo join              | Refresh succeeds          | Present, with the compiled join condition | Present after refresh                               |

Both CLI runs emit the same warning for payments:

```text
Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

The CLI reports `PARTIAL_SUCCESS` for that explore and `ERRORS=0`, then
deploys successfully. The ledger join emits the same warning. The server
comparison emits no join warning or error. Its payments explore contains
the merchant table and a compiled many-to-one join.

Both CLI manifests contain `model.merchants.merchant` and the downstream
payments node depends on it. The recorded manifests and successful compiled
SQL establish that dbt-loom resolves the upstream dbt model in both cases.

Registering and deploying the upstream does not make this join available to
the downstream CLI compile. dbt resolves the downstream SQL with dbt-loom,
but the deployed payments explore has only its own table. The runtime result
supports the external-node exclusion explanation; it does not establish the
internal cause by itself. Upstream explore loss is also the existing full
CLI deploy replacement behaviour tracked by #31326. The warning's claim that
the model is unavailable is misleading in the connected case, where that
model was already a registered and deployed explore.

## Checks and cleanup

```bash
uv tool run --from ruff ruff check examples/multi-repo-dbt-sim
uv tool run --from ruff ruff format --check examples/multi-repo-dbt-sim
examples/multi-repo-dbt-sim/.work/venvs/dbt12/bin/python \
  -m unittest discover -s examples/multi-repo-dbt-sim/tests
ldenv stop
```

Set `DBT_SIM_TEST_DBT`, `DBT_SIM_TEST_DBT19` and `DBT_SIM_TEST_LOOM=1` to opt
into the real parse checks. These parse checks do not query a warehouse.
The fixture tests check deterministic output, actual files against model
counts, distinct duplicate owners, package closure, version bindings, the
acyclic model graph, profile isolation and output-path protection.

`ldenv stop` stops only the instance attached to this worktree. Generated
warehouse schemas and disposable Lightdash projects remain for inspection
inside that instance. The runner revokes its temporary CLI access token and
stops its own HTTP servers. It does not retire worktrees or delete other data.

Refs #31323
Refs #31113
