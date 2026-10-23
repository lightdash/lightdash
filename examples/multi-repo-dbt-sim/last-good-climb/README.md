# Last-good manifest climb

This fixture is the Fix 7b proof for a consumer refresh that climbs stored
last-good dbt manifests. It is not the ambiguous-version probe (run 7b) and
it is not the last-good explore catalogue kept after a failed source. No
product store, seed API, or stitcher change is included.

Names and SQL are synthetic. `dbt-core` is pinned to 1.12.0. The private venv
does not install dbt-loom. A refresh runs
`dbt ls --output json --output-keys unique_id`, the server command. That
command builds the graph, so an injected cycle is reported. `dbt parse` is
kept for seeding a last-good manifest, which is the Test & deploy command.
Neither command queries a warehouse.

The share surface is project-owned public resources. A stored manifest names
its owner in `metadata.project_name`. Only public models, seeds, and
snapshots whose `package_name` is that owner cross to another project. Nodes
from an installed dbt package stay local to the project that installs them.
A manifest with no owner identity exports no nodes. This mirrors the product
tip `04c9461063` on #31471.

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
That is the Test & deploy compile, not the refresh. The runner writes them
under `.work/last-good-climb/last-good/<project>/`. The product would store
that same manifest after a successful compile or deploy. This runner only
keeps files in the ignored work directory.

Injection uses the external-node plugin already used by server refresh. The
harness copy lives next to this fixture so the proof venv can import it.
Nothing here is installed into the product image.

The `package/` tree is the shared-package control. `shared_pkg` is a local
dbt package with one public model. `proj_owner_one` and `proj_owner_two`
both install it with `packages.yml` and each owns one public model that
references the package model. `proj_consumer` references the two owned
models and does not install the package. The runner copies that tree into
the work directory and runs `dbt deps` there, so no `dbt_packages/` or
`package-lock.yml` lands in the fixture.

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
injects the other project's own public models, seeds, and snapshots from its
stored manifest, then runs `dbt ls --output json --output-keys unique_id`.
Seeds and snapshots take `config.access` when the node itself has no access.
`depends_on` edges are kept only when the target is also injected. Two
upstreams that both export the same public id are rejected before dbt runs.
This fixture's cross-project nodes are public models owned by the ring
projects, so the bindings below are unchanged. `proj_alpha` receives three
owned nodes and `proj_beta` receives one; the ring installs no package, so
the omitted package-node count is 0.

Pass:

- both `dbt ls` runs exit 0
- no `Found a cycle` error
- the real-node graph and the graph including injected nodes are acyclic
- `model.proj_alpha.alpha_report` depends on `model.proj_beta.measure.v3`
- `model.proj_beta.beta_report` depends on `model.proj_alpha.alpha_base`
- the stored manifests are not replaced by a refresh of `disk/`

## Withheld

The withheld store is an empty directory. The runner does not copy
`disk/**/manifest.json`, does not parse `seed/` into that directory, and
does not write a placeholder manifest.

For each consumer it prints one cold-start warning and then runs today's
refresh with no injected nodes:

```text
Cold start: dbt source "proj_alpha" cannot refresh because last-good manifests are not seeded for upstreams: proj_beta. Seed each upstream with a successful compile or deploy. No manifest was invented.
```

`proj_beta` names `proj_alpha` in the same sentence. The `dbt ls` fails
with `which was not found` for `measure` or `alpha_base`. The harness
rejects the run if either refresh exits 0. That is the unresolved compile
failure, not a silent bind to `measure.v2`.

To withhold by hand, point a last-good directory at a folder that has no
`<project>/manifest.json` for the upstream. Deleting one project's file is
enough to name that project. Leaving a manifest beside the dbt project, or
in `target/`, does not count as seeded.

## Package share

Charlie locked the cross-project share surface on 23 October 2026: only
models that belong to each project cross, not models from an installed dbt
package. The `package/` control proves that rule on real dbt.

Both owners run `dbt deps` and `dbt parse`. Each stored manifest holds two
real nodes: the owned public model and `model.shared_pkg.shared_model`, the
package node, also public and also on disk. That stored manifest is the
contaminated older snapshot: the projection has to drop the package node
when it loads. The owner projection exports exactly one node, the owned
model, with `package_name` equal to the owner. Its `depends_on` link to the
package node is kept at projection and dropped at injection, because the
package node is not in the injection set.

The consumer refresh runs `dbt ls` with both owners injected. Pass:

- the two owners are not rejected as duplicate providers, because neither
  exports the package node
- `model.proj_consumer.report` depends on `model.proj_owner_one.shared_model`
  and `model.proj_owner_two.owned_other`
- `model.shared_pkg.shared_model` is absent from the consumer manifest and
  present in both owner manifests
- the injected payload is the two owned models with empty `depends_on`
- `ownedInjected` is 2 and `packageNodesOmitted` is 2
- a copy of an owner manifest with `metadata.project_name` removed exports
  no nodes and omits nothing
- the owners' stored manifests are unchanged after the refresh

## Log markers

The product tip logs two markers that a post-merge success watch reads. The
runner emits the same text and the same structured fields, and the contract
checks them on the happy path.

`dbt.compile.crossSourceLastGoodConfirmed` is emitted once per confirmed
store write, after the manifests are on disk. The text is
`dbt.compile.crossSourceLastGoodConfirmed rowsWritten=N projectUuid=<uuid>
connectionGroup=original`; the fields are `event`, `projectUuid`,
`connectionGroup` and `rowsWritten`. The ring seed writes 2 rows and the
package seed writes 2 rows. The withheld run writes nothing and must not log
a confirmation. The project UUID and connection group are fixed synthetic
values; the harness has no project table.

`dbt.compile.crossSourceRefsResolved` is emitted once per resolution. The
text ends with ` ownedInjected=X packageNodesOmitted=Y`; the fields include
`event`, `projectUuid`, `ownedInjected`, `packageNodesOmitted` and a
`sources` list with `injectedFrom` and `injectedStubs`. The harness has no
disk pool, so `diskEvictions` and `diskRecreations` are 0. The ring
resolution reports 4 and 0. The package resolution reports 2 and 2. The
contract fails if a count, the text suffix, or a field name drifts.

The harness counts each stored manifest once per resolution. The product
counts package nodes when it loads older confirmed rows and again when it
projects a fresh manifest, so the same node can count twice there.

Every marker is kept under `markers` in the report with its message and
fields.

## Observed

`run-last-good` on this fixture recorded dbt-core 1.12.0, dbt-postgres 1.10.2,
and no dbt-loom. Python was 3.12.3. The adapter patch is the resolver result
for `dbt-postgres~=1.10.0`, the same range as the production image.

Present refreshes used `dbt ls --output json --output-keys unique_id` and
exited 0 with no cycle error. `alpha_report` depended on
`model.proj_beta.measure.v3` even though `disk/` declares latest version 2.
`beta_report` depended on `model.proj_alpha.alpha_base`. The stored manifests
were unchanged after those refreshes. Seeding those manifests still used
`dbt parse`.

The same run injected a two-node cycle and compiled a leaf that references
one side. `dbt ls` exited 2 with `Found a cycle`. `dbt parse` of that same
payload exited 0 and did not report a cycle.

Withheld refreshes exited 2. The warnings named `proj_beta` for `proj_alpha`
and `proj_alpha` for `proj_beta`. dbt reported:

```text
Model 'model.proj_alpha.alpha_report' (models/alpha_report.sql) depends on a node named 'measure' in package or project 'proj_beta' which was not found
Model 'model.proj_beta.beta_report' (models/beta_report.sql) depends on a node named 'alpha_base' in package or project 'proj_alpha' which was not found
```

No manifest was written into the empty store. Neither withheld refresh exited 0.
No confirmation marker was logged during the withheld run.

The package share ran `dbt deps` and `dbt parse` for both owners, then
`dbt ls` for the consumer. The consumer exited 0 and bound
`model.proj_owner_one.shared_model` and `model.proj_owner_two.owned_other`.
`model.shared_pkg.shared_model` stayed in both owner manifests and did not
appear in the consumer manifest. The injected payload carried two nodes
with empty `depends_on`. The ownerless copy exported no nodes.

The markers recorded were two confirmations (`rowsWritten=2` each) and two
resolutions (`ownedInjected=4 packageNodesOmitted=0`, then
`ownedInjected=2 packageNodesOmitted=2`).

## Recorded divergences

These are harness notes. They are not product changes.

- Public-only versus loom ambiguity. A one-argument ref to a name that is
  public in one upstream and protected in another binds the public node
  here. dbt-loom injects the protected node as well, and dbt then reports
  that the name exists in multiple packages. Mesh-style injection only
  shares `access: public`.
- Package filter. The climb shares project-owned public resources only, the
  product rule since tip `04c9461063`. There is still no `included_packages`
  or `excluded_packages` list; an installed package never crosses, whatever
  its access.
- Last-good cycle lag. `depends_on` keeps an edge only when the target is
  in the injection set, so a back edge to a consumer node is dropped before
  dbt runs. `dbt ls` therefore does not report that cross-source cycle.
  The product resolver checks the unfiltered catalogue graph and reports
  it. This harness does not copy that check. A cycle whose two ends are
  both injected is a different case: `dbt ls` reports `Found a cycle` and
  `dbt parse` does not. The runner checks that pair.
- Duplicate ids are not a divergence. `injection_for` raises before dbt
  when two upstreams export the same public id. With the owner filter that
  needs two sources that claim the same project name; two owners of the
  same installed package no longer collide. The plugin no longer hashes a
  `lightdash_placeholder` identifier.

## Scale

The sibling runner measures last-good artefact size, climb RSS, and a
no-store baseline. Both this proof and the scale probe inject only real
models, seeds, and snapshots whose resolved access is `public` and whose
`package_name` is the stored manifest's owner. Protected and private nodes
are omitted, including when `access` is unset. That is the dbt Mesh share
surface limited to project-owned resources. The scale fixtures install no
package, so the owner filter changes none of their counts; the recorded
scale run predates it and was not re-measured. The climb does not inject
every real model and then filter by ref. The recorded scale timings below are
still `dbt parse`. The refresh proof above is `dbt ls`. The scale probe
was not re-run for that command change, so its table is the earlier
public-only measurement.

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
(kbytes)`, multiplied by 1024. `peak_rss_bytes` is the recorded climb
`dbt parse`, not the refresh `dbt ls`.
`injector_peak_rss_bytes` is a separate Python process that loads the other
manifests and writes the external-node payload. `baseline.peak_rss_bytes`
is the highest per-source stubbed parse. Each timed command is one process.
The large-org profile's compile concurrency is 4; this probe does not
reproduce that. It also does not start the loopback Git server, so
`checkout_bytes` is the materialized project tree (`target/`, `logs/`,
`dbt_packages/`, and `.git` excluded), not pack transfer or a disk eviction.

The timed climb injects public models, seeds, and snapshots from every
other source. It does not apply the ref filter. These fixtures set
`access: public` on every model. Their seeds have no access, and they have
no snapshots, so seeds and snapshots stay out of the inject surface. The
omitted non-public model count is 0 and the injected node count matches
the earlier public-only run. The recorded scale numbers below were not
re-run when the inject surface grew, and they were not re-run when the
refresh proof moved to `dbt ls`. `ref_filtered_*` is the smaller payload
that a ref filter would keep. The withheld scale command is still
`dbt parse`. It injects nothing, must exit non-zero with
`which was not found`, and must not create a manifest.

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
