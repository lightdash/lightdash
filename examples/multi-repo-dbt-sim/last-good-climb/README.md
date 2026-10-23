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

## Scale

The sibling runner measures last-good artefact size, climb RSS, and a
no-store baseline. Both this proof and the scale probe inject only real
models whose `access` is `public`. Protected and private models are
omitted, including when `access` is unset. That is the dbt Mesh /
dbt-loom share surface. The climb does not inject every real model and
then filter by ref.

```bash
examples/multi-repo-dbt-sim/run-last-good-scale
```

That default measures the large-org `healthy` profile (19 sources). The
recorded run used the same venv and both fixtures:

```bash
examples/multi-repo-dbt-sim/run-last-good-scale --fixture both
```

It writes `examples/multi-repo-dbt-sim/reports/last-good-scale.json`.
Top-level fields are the large-org case. `fixtures` lists every measured
case. `--fixture full` measures only the 22-source generator.

RSS uses `/usr/bin/time -v`. The field is `Maximum resident set size
(kbytes)`, multiplied by 1024. `peak_rss_bytes` is the climb `dbt parse`.
`injector_peak_rss_bytes` is a separate Python process that loads the other
manifests and writes the external-node payload. `baseline.peak_rss_bytes`
is the highest per-source stubbed parse. Each timed command is one process.
The large-org profile's compile concurrency is 4; this probe does not
reproduce that. It also does not start the loopback Git server, so
`checkout_bytes` is the materialized project tree (`target/`, `logs/`,
`dbt_packages/`, and `.git` excluded), not pack transfer or a disk eviction.

The timed climb injects public models from every other source. It does
not apply the ref filter. These fixtures set `access: public` on every
model, so the omitted non-public count is 0 and the injected count matches
the earlier inject-all run. `ref_filtered_*` is the smaller payload that a
ref filter would keep. The withheld parse injects nothing, must exit
non-zero with `which was not found`, and must not create a manifest.

On the recorded public-only run, dbt-core was 1.12.0, dbt-postgres resolved
to 1.10.2, dbt-loom was absent, and Python was 3.12.3.

| Fixture | Sources | Models | Artefact bytes | Climb RSS bytes | Climb seconds | Baseline checkout bytes | Baseline parse seconds | Baseline peak RSS bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| large-org healthy | 19 | 49 | 10321720 | 133611520 | 2.53 | 125473 | 48.577 | 133357568 |
| full | 22 | 3000 | 24698281 | 178114560 | 4.224 | 4509327 | 70.394 | 188633088 |

The full fixture has 3001 manifest model nodes. The extra node is the
versioned `rate` model. Large-org injected 44 public nodes (12117 bytes)
into `proj_core` and omitted 0 non-public models. Full injected 2901
public nodes (862923 bytes) into `growth` and omitted 0. The ref filter
would have kept 2 nodes in each case (630 and 525 bytes). Those filtered
payloads were not the timed parses. Injector RSS was 24023040 bytes
(0.086 seconds) and 72302592 bytes (0.211 seconds). Withheld parses exited
2: 2.414 seconds and 130748416 bytes, then 2.762 seconds and 133718016
bytes.

The prior inject-all run, kept under `previous_inject_all` in the JSON,
injected the same 44 and 2901 nodes and the same 12117 and 862923 payload
bytes. Artefact totals moved by 86 and 65 bytes. Climb RSS moved from
133746688 to 133611520 bytes and from 178040832 to 178114560 bytes. Climb
time moved from 2.531 to 2.53 seconds and from 4.343 to 4.224 seconds.
Checkout bytes were unchanged. Per-source sizes are in the JSON.

## Out of scope

Server explores are not created here. The manifest bindings are the compile
result a later product slice would persist. Ingesting one pre-combined
deploy artefact as the whole project is a separate follow-up.
