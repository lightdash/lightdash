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
tip `b741e1618e` on #31471.

That tip also steers two policies that this fixture expresses. A provider
that parses successfully in the current refresh supplies its fresh catalogue
to later consumers; the confirmed store is the fallback for a provider that
has not parsed yet or whose parse failed. Each provider confirms on its own:
an explore error attributed to one source withholds only that source's
confirmation, an unattributed error withholds every confirmation.

Three steps run the product's own code from a checkout of the tip rather
than a harness model of it: explore compilation, the cross-source resolver
with its exact missing-ref wording, and the product's real-dbt wording test.
See [Product checkout](#product-checkout).

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

## Product checkout

The explore compile, the resolver wording and the product's own wording test
run real product TypeScript through `tsx`. `product_path.ts` imports
`DbtBaseProjectAdapter._validateDbtModel`, `attachTypesToModels`,
`convertExplores`, `resolveCrossSourceManifests`, `DbtCliClient`,
`parseMissingDbtNodeReferences`, the CLI `dbtList` handler and
`withCrossSourceDbtCliHint` from a checkout and writes JSON for
`product_path.py` to read. The checkout defaults to the repository that
contains this fixture. To measure against another revision, prepare a
detached checkout in the ignored work directory and point the runner at it:

```bash
examples/multi-repo-dbt-sim/last-good-climb/product-checkout.sh b741e1618ed6e0364d053e22409ed34ebba58642
LAST_GOOD_PRODUCT_ROOT=examples/multi-repo-dbt-sim/.work/product/b741e1618ed6e0364d053e22409ed34ebba58642 \
  examples/multi-repo-dbt-sim/run-last-good
```

The script adds a `git worktree` at that revision, reuses this checkout's
installed `node_modules` by symlink with the `@lightdash/*` entries pointed
at the detached sources, and builds `common` and `warehouses` there. It
installs nothing and changes no branch. The backend config parser needs a
secret and storage settings to load; `product_path.py` supplies harness-only
placeholder values. The report records the checkout and its revision under
`product_path`.

The product's dbt client runs a `dbt1.12` command from `PATH` and the CLI
handler runs `dbt`. The harness exposes its venv `dbt` under both names in
the work directory for the resolver, the CLI case and the product test only.

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

## Fresh over seed

The ring runs in dependency order. `proj_alpha` and `proj_beta` reference
each other, so neither is ready first and the product takes the first
source in its list. The harness runs the ring three times from the same
disk and the same confirmed store, and keeps every fresh manifest in memory
until a confirmation step writes it. The store digests do not change.

`alpha_first` is the product's ring order. `proj_alpha` parses with the
confirmed `proj_beta` seed and binds `model.proj_beta.measure.v3`.
`proj_beta` then parses with the fresh `proj_alpha` manifest, not the
store: its injected set is `alpha_base` and `alpha_report`, two owned
nodes, where the confirmed seed carries one. `beta_report` still binds
`model.proj_alpha.alpha_base`. The resolution injects 5 stubs.

`beta_first` reverses the order. `proj_beta` parses with the confirmed
`proj_alpha` seed. `proj_alpha` then parses with the fresh `proj_beta`
manifest: `measure` v2 and v3 arrive with `latest_version` 2, and the
unversioned ref binds `model.proj_beta.measure.v2`. Same disk, same store,
different binding, because the fresh catalogue wins over the seed. The
resolution injects 5 stubs.

`failed_provider` runs `beta_first` against a copy of `disk/proj_beta` with
an added `broken.sql` that references `missing_model`. The `dbt ls` for
`proj_beta` exits non-zero with `which was not found`, so no fresh
manifest is recorded for it. `proj_alpha` then falls back to the confirmed
seed and binds `model.proj_beta.measure.v3`. The failed attempt still
counts the stub it was handed, as the product does, so the resolution
reports 4.

Pass:

- the first source in each order reads its provider as `confirmed`, the
  second reads it as `fresh`
- `alpha_first` binds v3 then `alpha_base`; `beta_first` binds `alpha_base`
  then v2 with both measure versions at `latest_version` 2
- `failed_provider` fails `proj_beta`, keeps `proj_alpha` on v3
- every successful parse exits 0 with no cycle error
- the seeded store is unchanged after all three runs

## Per-provider confirm

The product confirms a provider only after its own parse and the explore
publication succeed. `persistArtifacts` receives the source UUIDs of
attributed explore errors and discards those entries before `confirm()`;
an unattributed explore error sets `successfulCompile` false and nothing
confirms. `replaceConfirmed` upserts, so a discarded provider keeps its
earlier confirmed row.

The explore errors are real. Each scenario runs the ring, writes the fresh
manifests to the work directory, and compiles them with the product's
explore compiler from the checkout: external nodes are stripped
(`stripExternalDbtNodes`), model and seed nodes are stamped with a fixed
synthetic `lightdash_source_uuid` as `CompileGroup` does, then
`DbtBaseProjectAdapter._validateDbtModel`, `attachTypesToModels` over a
catalogue built from the schema `data_type`s, and `convertExplores` with
`includeModelIdentity` run. The harness has no warehouse, so that catalogue
stands in for the warehouse fetch. Attribution follows
`MultiConnectionCompiler.save`: `dbtModelIdentity.sourceUuid`, then the
base table's `dbtSourceUuid`, then the stamped `dbtSourceUuid`; an error
with none of those is unattributed.

A broken source is a copy of its disk project plus `bad_meta`, a protected
model dbt parses but whose Lightdash metadata declares a metric of type
`not_a_metric_type`. The schema validator rejects it with
`METADATA_PARSE_ERROR`. The model is protected so the injection counts do
not move. The unattributed scenario compiles the same broken manifest
without stamping a source identity, which is the product's
`sourceUuid: null` fallback.

| Scenario | Broken source | Identity stamped | Rows written | Store rows replaced | `proj_alpha` after confirm |
| --- | --- | --- | ---: | --- | --- |
| `healthy` | none | yes | 2 | both | binds `measure.v2` from the new `proj_beta` row |
| `other_source_error` | `proj_beta` | yes | 1 | `proj_alpha` only | binds `measure.v3` from the retained seed |
| `every_source_error` | both | yes | 0 | none | binds `measure.v3` |
| `unattributed_error` | `proj_beta` | no | none | none | binds `measure.v3` |

Pass:

- `healthy` compiles every real model into an explore with no error, writes
  both rows, and the stored `proj_beta` row now declares latest version 2
- `other_source_error` has exactly one explore error, on `bad_meta`,
  attributed to `proj_beta`; it writes one row and logs one confirmation;
  the `proj_beta` row still declares latest version 3 and the next
  `proj_alpha` refresh binds v3
- `every_source_error` has one `bad_meta` error per source, writes nothing
  and logs `rowsWritten=0`, because `confirm()` logs after
  `replaceConfirmed` returns early on an empty entry list
- `unattributed_error` has one error with no source, writes nothing and
  logs no confirmation
- the seeded store used by the other cases is unchanged

## Publication and artefact writes

`MultiConnectionCompiler.save` publishes the explores first, then
`persistArtifacts` writes the merged manifest and finally confirms the
last-good rows. A throw in publication means `persistArtifacts` never runs;
a throw in the merged-manifest write means `confirm()` never runs. The
store write itself is wrapped: `CrossSourceCatalogCache.confirm` catches,
logs `dbt.compile.crossSourceCacheError` and writes no row.

The harness mirrors that order with real file writes in the work directory:
`published/explores.json` for the publication, then
`published/artefacts/merged-manifest.json.gz` for the merged manifest, then
the store rows. Every write goes through a sibling temp file and a rename,
and a failed write removes its temp file. Each scenario first publishes the
seeded state as the previous good publication, then runs the ring, compiles
the fresh explores, and saves. The failures are real operating-system
errors at the write boundary, not flags:

| Scenario | Mechanism | Error | Explores published | Merged manifest | Rows written |
| --- | --- | --- | --- | --- | --- |
| `healthy_save` | none | none | yes | written | 2 |
| `publication_failure` | `chattr +i` on `published/` | `EPERM` | no | unchanged | none |
| `artefact_write_failure` | tmpfs on `artefacts/` with less free space than the incoming gzip | `ENOSPC` | yes | unchanged | none |
| `store_write_failure` | `chattr +i` on both store directories | caught, `EPERM` | yes | written | none |

The tmpfs is sized to hold the previous artefact and leave fewer free bytes
than the incoming one, so the write runs out of space rather than being
refused up front. Both mechanisms need root on a filesystem that supports
the immutable attribute; the run fails loudly when neither is available
instead of simulating.

Pass:

- `healthy_save` changes both published files and both store rows, leaves
  no temp file, and the next `proj_alpha` refresh binds `measure.v2`
- `publication_failure` raises a real `EPERM`; the previous explores and
  merged manifest are byte-identical, no store row changes, no confirmation
  is logged, no temp file remains, and `proj_alpha` still binds `measure.v3`
- `artefact_write_failure` raises a real `ENOSPC` after the explores were
  published, as the product would have committed them; the previous merged
  manifest is byte-identical, no store row changes, no confirmation is
  logged, no temp file remains, and `proj_alpha` still binds `measure.v3`
- `store_write_failure` raises nothing to the caller, logs one
  `dbt.compile.crossSourceCacheError` with `code` `EPERM` and no
  confirmation, changes no store row, and `proj_alpha` still binds
  `measure.v3`

## Missing-ref wording

dbt reports a missing ref as
`Model 'model.proj_alpha.alpha_report' (models/alpha_report.sql) depends on
a node named 'measure' in package or project 'proj_beta' which was not
found`. The product parses that with the regular expression in
`packages/common/src/dbt/crossSourceRefs.ts:1` (re-exported by
`packages/backend/src/dbt/dbtExternalNodes.ts`) and rewrites it in
`packages/backend/src/projectAdapters/crossSourceRefs.ts` (`failureReason`).
The harness carries the same regular expression, checks it against every
failing dbt output in the withheld and failed-provider runs, and compares
its parse with the product's `parseMissingDbtNodeReferences` on the same
text.

The wording itself comes from the product resolver. The harness runs
`resolveCrossSourceManifests` over `DbtCliClient` tasks on the ring, with
and without the seeded catalogues, and compares the thrown `ParameterError`
message with the text composed from the product's templates:

| Scenario | Store | Projects | Expected template |
| --- | --- | --- | --- |
| `ring_healthy` | seeded | ring | no error; binds v3 and `alpha_base`, 5 stubs |
| `ring_confirmed_missing` | seeded | `proj_alpha` plus `uses_missing` -> `ref('proj_beta', 'absent_model')`, ring `proj_beta` | `crossSourceRefs.ts:561` with `confirmed last-good manifest` |
| `leaf_fresh_missing` | seeded | the same consumer, `proj_beta` without `beta_report` so it parses first | `crossSourceRefs.ts:561` with `fresh manifest` |
| `leaf_fresh_missing_unconfirmed` | none | the same pair | `crossSourceRefs.ts:561` plus `:564`: no last-good yet and the model hint |
| `ring_withheld` | none | ring | `crossSourceRefs.ts:398` plus `:540` for each source |

Exact texts the tip emits on this fixture:

```text
dbt source "proj_alpha" references ref('proj_beta', 'absent_model'), but the confirmed last-good manifest of dbt source "proj_beta" does not define that model (or version).
dbt source "proj_alpha" references ref('proj_beta', 'absent_model'), but the fresh manifest of dbt source "proj_beta" does not define that model (or version).
dbt source "proj_alpha" references ref('proj_beta', 'absent_model'), but the fresh manifest of dbt source "proj_beta" does not define that model (or version). dbt source "proj_beta" has no confirmed last-good manifest yet. Check that the model (or version) is present in the provider project and has access: public.
Cold start: dbt source "proj_alpha" references dbt source "proj_beta" (project "proj_beta"), but that upstream source has no confirmed last-good manifest. This refresh will try to seed the upstream in dependency order before compiling this consumer. dbt source "proj_alpha" could not resolve ref('proj_beta', 'measure') during its single parse.
```

The confirmed case now names the catalogue the consumer was given:
`bindingCatalogs` records `fresh` and `confirmed` per provider when the
consumer's payload is built (`crossSourceRefs.ts:472`), and `failureReason`
reads that record. The product's real-dbt test
`crossSourceRefs.realDbt.test.ts` (`names the consumer, provider and
missing numeric version`) that failed on the earlier tip `009bd64189`
passes here; the harness runs it from the checkout and records the result
under `missing_ref_wording.product_test`. CI now runs that file with a
real dbt (`.github/workflows/pr.yml`).

The CLI appends a hint to dbt's own error. `packages/cli/src/handlers/dbt/compile.ts:96` (`dbtCompile`) and `:210` (`dbtList`) pass the
execa message through `withCrossSourceDbtCliHint`
(`packages/common/src/dbt/crossSourceRefs.ts:24`), which appends
`Check that the model (or version) is present in the provider project and
has access: public. Local dbt commands must resolve cross-project refs
before deployment.` when the text carries a two-argument missing ref. The
harness calls the CLI's `dbtList` handler in-process from the checkout on
`disk/proj_alpha` with no injected nodes, with the harness dbt on `PATH`
as `dbt`, and also applies `withCrossSourceDbtCliHint` to the withheld
dbt line. Pass: `dbt ls` fails, the handler throws `ParseError` whose
message starts `Error executing 'dbt ls':`, contains dbt's sentence
followed by the hint, and ends with the handler's fixed `--use-dbt-list`
advice. This is the handler function, not the packaged `lightdash` binary;
the `dbtCompile` path shares the same hint call and is not run.

Finding, CLI punctuation. `withCrossSourceDbtCliHint` joins the hint with
a space, and dbt's sentence has no terminal full stop, so the CLI reads
`... in package or project 'proj_beta' which was not found Check that the
model (or version) is present ...`. The server text ends every sentence
with a full stop. The report records `hint_follows_without_full_stop`.
The CLI also leaves dbt's ANSI colour codes in the message because it does
not pass `--no-use-colors`; the harness strips them before comparing.

The earlier tip's divergence, a confirmed provider named as `fresh
manifest`, is fixed on this tip and the harness expectation moved with it.

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

The fresh-over-seed runs used the same disk and store. `alpha_first` read
`proj_beta` as `confirmed` and bound `measure.v3`, then read `proj_alpha` as
`fresh` and injected `alpha_base` and `alpha_report`. `beta_first` read
`proj_alpha` as `confirmed`, then read `proj_beta` as `fresh`, injected
`measure` v2 and v3 both at latest version 2, and bound `measure.v2`.
`failed_provider` exited 2 for `proj_beta` with
`Model 'model.proj_beta.broken' (models/broken.sql) depends on a node named
'missing_model' which was not found`; `proj_alpha` then read `proj_beta` as
`confirmed` and bound `measure.v3`. The store digests were unchanged.

The per-provider scenarios compiled explores with the product compiler
from checkout `b741e1618ed6e0364d053e22409ed34ebba58642`. `healthy`
compiled all 6 real models (2 in `proj_alpha`, 4 in `proj_beta`) with no
error. `other_source_error` compiled 6 of 7 and reported one
`METADATA_PARSE_ERROR` on `bad_meta` attributed to `proj_beta`:
`Model "bad_meta" from dbt source "proj_beta": Field at
/meta/metrics/broken/type must be equal to one of the allowed values.`
`every_source_error` compiled 6 of 8 with one such error per source.
`unattributed_error` compiled 6 of 7 and its error read `Model
"bad_meta": Field at ...` with no source name and no source UUID. The
scenarios wrote 2, 1, 0 rows and then nothing. After the
`other_source_error` confirm the `proj_alpha` row held the fresh manifest
and the `proj_beta` row still declared latest version 3; the next
`proj_alpha` refresh bound `measure.v3`. After the `healthy` confirm the
same refresh bound `measure.v2`.

The publication scenarios ran as root on ext4. `publication_failure` hit
`EPERM` opening `explores.json.tmp-<pid>` inside the immutable `published/`
directory; nothing was published, nothing confirmed, no temp file remained,
and `proj_alpha` bound `measure.v3`. `artefact_write_failure` mounted a
4096-byte tmpfs holding the previous gzip and hit `ENOSPC` on the incoming
one; `explores.json` had been published, the gzip was byte-identical, no
row changed and no confirmation was logged. `store_write_failure` logged
one `dbt.compile.crossSourceCacheError` with `code` `EPERM`, wrote no row
and no confirmation, and `proj_alpha` bound `measure.v3`. `healthy_save`
wrote both files and both rows and `proj_alpha` bound `measure.v2`.

The resolver scenarios ran the product `resolveCrossSourceManifests` with
`DbtCliClient` on the harness dbt from checkout
`b741e1618ed6e0364d053e22409ed34ebba58642`. `ring_healthy` bound
`model.proj_beta.measure.v3` and `model.proj_alpha.alpha_base` with 5
stubs, the same as the Python climb. The four failing scenarios each threw
`ParameterError` with the texts quoted under Missing-ref wording, the
harness regular expression and `parseMissingDbtNodeReferences` agreed on
every dbt output, the product's own wording test passed, and the CLI
`dbtList` handler threw `ParseError` with the hint appended directly after
dbt's `which was not found`.

The dbt outputs of the withheld and failed-provider runs parsed to
`measure` in `proj_beta`, `alpha_base` in `proj_alpha`, and
`missing_model` with no package, matching the product parser.

The markers recorded were confirmations with `rowsWritten` 2, 2, 2, 1, 0,
2 and resolutions with `ownedInjected` 4, 2, 5, 5, 4, then 5 for each of
the eight per-provider and publication refreshes (`packageNodesOmitted` 2
for the package resolution and 0 elsewhere), plus one cache error.

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
- Explore types come from the schema. The product attaches column types
  from a warehouse catalogue fetch; the harness has no warehouse and
  builds that catalogue from each column's `data_type`. The validator,
  type attachment and conversion are the product's.
- The harness cold-start warning is its own text. The product's cold-start
  sentence (`crossSourceRefs.ts:390`) is asserted through the resolver
  scenarios; the Python withheld run prints the shorter harness warning.
- Publication and the merged manifest are files. The product writes both
  to Postgres; the harness writes them under `published/` with temp-file
  renames and forces failures with the immutable attribute and a tiny
  tmpfs. The per-row store write is staged and renamed together, where the
  product's `replaceConfirmed` is one upsert.
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
surface limited to project-owned resources. The climb does not inject
every real model and then filter by ref. The scale timings are `dbt parse`;
the refresh proof above is `dbt ls`.

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
case. `--fixture full` measures only the 22-source generator. `machine`
records the host, kernel, CPU model, CPU count and memory of the run.

The generators keep their recorded shapes; `scale_additions.py` applies
three additions to the generated fixture before anything is parsed, and
the report records them under `scale_additions`:

- every source gets `<source>_public_seed`, a seed with `config.access:
  public`, and `<source>_history`, a YAML snapshot of that seed with
  `config.access: public`. The generators' existing `<source>_seed` has no
  access and stays local;
- `pkg_shared_assets` is a local dbt package with a public seed, a public
  snapshot and a public model. The consumer's first two upstreams install
  it with `packages.yml`, and the probe runs `dbt deps` in those two repos
  before their baseline parse. The three package nodes appear in each
  installer's stored manifest and must not cross: the injector counts them
  under `package_nodes_omitted`, refuses a payload that carries one, and
  the climb refuses a consumer manifest that contains one;
- the consumer gets `uses_public_assets`, which references its first
  upstream's public seed and snapshot under the bootstrap stub. The climb
  manifest must bind `seed.<upstream>.<upstream>_public_seed` and
  `snapshot.<upstream>.<upstream>_history`, so the injected seeds and
  snapshots are proven to resolve, not only to be present.

RSS uses `/usr/bin/time -v`. The field is `Maximum resident set size
(kbytes)`, multiplied by 1024. `peak_rss_bytes` is the climb `dbt parse`.
`injector_peak_rss_bytes` is a separate Python process that loads the other
manifests and writes the external-node payload; it now also imports the
fixture generator module for the package name, so it is not comparable
with the earlier injector figure. `baseline.peak_rss_bytes` is the highest
per-source stubbed parse. Each timed command is one process. The large-org
profile's compile concurrency is 4; this probe does not reproduce that. It
also does not start the loopback Git server, so `checkout_bytes` is the
materialized project tree (`target/`, `logs/`, `dbt_packages/`, and `.git`
excluded), not pack transfer or a disk eviction.

The timed climb injects public models, seeds, and snapshots from every
other source. It does not apply the ref filter. `ref_filtered_*` is the
smaller payload that a ref filter would keep. The withheld scale command is
still `dbt parse`. It injects nothing, must exit non-zero with `which was
not found`, and must not create a manifest.

The run on 25 October 2026 used dbt-core 1.12.0, dbt-postgres 1.10.2, no
dbt-loom and Python 3.12.3 on `charlie-lightdash-dev` (AMD EPYC 9554P, 8
CPUs, 33648496640 bytes of memory, kernel 6.12.113). The earlier public-only
run did not record its machine. Its headline is kept under
`previous_public_only` and each fixture carries
`delta_vs_previous_public_only`.

| Fixture | Sources | Models | Artefact bytes before | after | delta | Climb RSS bytes before | after | delta | Climb seconds before | after | delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| large-org healthy | 19 | 49 | 10321720 | 10460982 | +139262 | 133611520 | 136982528 | +3371008 | 2.53 | 3.548 | +1.018 |
| full | 22 | 3000 | 24698281 | 24855437 | +157156 | 178114560 | 180355072 | +2240512 | 4.224 | 5.87 | +1.646 |

| Fixture | Baseline parse seconds before | after | delta | Baseline peak RSS before | after | delta | Baseline checkout bytes before | after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| large-org healthy | 48.577 | 63.472 | +14.895 | 133357568 | 136777728 | +3420160 | 125473 | 161422 |
| full | 70.394 | 94.176 | +23.782 | 188633088 | 190586880 | +1953792 | 4509327 | 4552215 |

Large-org injected 80 nodes into `proj_core`: 44 models, 18 public seeds
and 18 public snapshots, 23973 payload bytes (12117 before). It omitted 18
non-public seeds, 0 non-public models and 6 installed-package nodes from
`proj_bank` and `proj_bank_reporting`; 0 package nodes reached the payload
or the consumer manifest. `uses_public_assets` bound
`seed.proj_bank.proj_bank_public_seed` and
`snapshot.proj_bank.proj_bank_history`. The ref filter would have kept 4
nodes (1302 bytes). Full injected 2943 nodes into `growth`: 2901 models,
21 seeds and 21 snapshots, 876819 payload bytes (862923 before), omitted 21
non-public seeds and 6 package nodes from `payments` and `merchants`, and
bound `seed.payments.payments_public_seed` and
`snapshot.payments.payments_history`. Per-source artefacts grew between
5911 and 16817 bytes on large-org and between 5838 and 16295 bytes on full;
the two installers in each fixture carry the larger growth because their
manifests also hold the package nodes. Withheld parses exited 2 in 3.212
and 3.938 seconds. The climb that previously bound only models now also
carries the seed and snapshot nodes dbt must resolve, so the parse-time
deltas include that work as well as run-to-run noise; no climb exceeded
the baseline per-source parse.

The prior inject-all run is kept under `previous_inject_all` in the JSON.

## Out of scope

Server explores are not created here. The manifest bindings are the compile
result a later product slice would persist. Ingesting one pre-combined
deploy artefact as the whole project is a separate follow-up.
