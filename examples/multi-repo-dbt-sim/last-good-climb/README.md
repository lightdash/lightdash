# Last-good manifest climb

This fixture is the Fix 7b proof for a consumer refresh that climbs stored
last-good dbt manifests. It is not the ambiguous-version probe (run 7b) and
it is not the last-good explore catalogue kept after a failed source. No
product store, seed API, or stitcher change is included.

Names and SQL are synthetic. `dbt-core` is pinned to 1.12.0. The private venv
does not install dbt-loom. `dbt parse` is the refresh-shaped compile: it is
the command the server runs, and it does not query a warehouse.

## Graph

`proj_alpha` and `proj_beta` form a project ring:

- `proj_alpha.alpha_report` references `proj_beta.measure`
- `proj_beta.beta_report` references `proj_alpha.alpha_base`

Those plain refs do not close a model loop. `alpha_base` and both `measure`
versions are leaves. `measure` is the version hop. The unversioned ref has
no `v=` argument.

| Tree | `measure` versions on disk | Latest | Role |
| --- | --- | --- | --- |
| `seed/` | v3 only, leaf | 3 | Inputs for a successful upstream compile |
| `disk/` | v2 and v3, both leaves | 2 | Current consumer project files |

The expected climb binding is `model.proj_beta.measure.v3`. Latest on disk
is the acyclic v2 node. A refresh that recompiles `disk/` instead of the
stored manifest would bind v2. This harness must not do that.

## Inputs

A last-good manifest is `manifest.json` produced by `dbt parse` of `seed/`.
The runner writes them under `.work/last-good-climb/last-good/<project>/`.
The product would store that same manifest after a successful compile or
deploy. This runner only keeps files in the ignored work directory.

Injection uses the external-node plugin already used by server refresh. The
harness copy lives next to this fixture so the proof venv can import it.
Nothing here is installed into the product image.

## How to run

```bash
examples/multi-repo-dbt-sim/run-last-good
```

The first run creates `.work/venvs/dbt1120` from `requirements.txt`, using
`uv` when it is available and `python3.12 -m venv` otherwise. Later runs
reuse it. The command writes
`examples/multi-repo-dbt-sim/reports/last-good-climb.json`. Exit 0 means
both controls matched the contract.

Unit checks that do not invoke dbt:

```bash
python3 -m unittest examples/multi-repo-dbt-sim/tests/test_last_good_climb.py
```

## Present

Upstream last-good manifests are present. For each disk project the runner
injects public models from the other project's stored manifest, then runs
`dbt parse`.

Pass:

- both parses exit 0
- no `Found a cycle` error
- the real-node graph and the graph including injected nodes are acyclic
- `model.proj_alpha.alpha_report` depends on `model.proj_beta.measure.v3`
- `model.proj_beta.beta_report` depends on `model.proj_alpha.alpha_base`
- the stored manifests are not replaced by a parse of `disk/`

## Withheld

The withheld store is an empty directory. The runner does not copy
`disk/**/manifest.json`, does not parse `seed/` into that directory, and
does not write a placeholder manifest.

For each consumer it prints one cold-start warning and then runs today's
parse with no injected nodes:

```text
Cold start: dbt source "proj_alpha" cannot refresh because last-good manifests are not seeded for upstreams: proj_beta. Seed each upstream with a successful compile or deploy. No manifest was invented.
```

`proj_beta` names `proj_alpha` in the same sentence. The dbt parse fails
with `which was not found` for `measure` or `alpha_base`. The harness
rejects the run if either parse exits 0. That is the unresolved compile
failure, not a silent bind to `measure.v2`.

To withhold by hand, point a last-good directory at a folder that has no
`<project>/manifest.json` for the upstream. Deleting one project's file is
enough to name that project. Leaving a manifest beside the dbt project, or
in `target/`, does not count as seeded.

## Observed

`run-last-good` on this fixture recorded dbt-core 1.12.0, dbt-postgres 1.10.2,
and no dbt-loom. Python was 3.12.3. The adapter patch is the resolver result
for `dbt-postgres~=1.10.0`, the same range as the production image.

Present parses exited 0 with no cycle error. `alpha_report` depended on
`model.proj_beta.measure.v3` even though `disk/` declares latest version 2.
`beta_report` depended on `model.proj_alpha.alpha_base`. The stored manifests
were unchanged after those parses.

Withheld parses exited 2. The warnings named `proj_beta` for `proj_alpha` and
`proj_alpha` for `proj_beta`. dbt reported:

```text
Model 'model.proj_alpha.alpha_report' (models/alpha_report.sql) depends on a node named 'measure' in package or project 'proj_beta' which was not found
Model 'model.proj_beta.beta_report' (models/beta_report.sql) depends on a node named 'alpha_base' in package or project 'proj_alpha' which was not found
```

No manifest was written into the empty store. Neither withheld parse exited 0.

## Out of scope

Server explores are not created here. The manifest bindings are the compile
result a later product slice would persist. Ingesting one pre-combined
deploy artefact as the whole project is a separate follow-up.
