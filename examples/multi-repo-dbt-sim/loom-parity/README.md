# dbt-loom config surface versus the last-good climb

This runner compares what dbt-loom does with a loom-shaped configuration
against what the last-good climb does with the same stored manifests. It is a
parity probe, not a product change. Names are synthetic. Nothing here installs
dbt-loom into the server-shaped venv; the loom venv is the ground truth only.

Two venvs under `.work/venvs/`:

| Venv | Packages | Role |
| --- | --- | --- |
| `dbt1120` | dbt-core 1.12.0, dbt-postgres ~1.10 | server-shaped parse with the external-node plugin copy from `last-good-climb/` |
| `dbt1120-loom` | the same plus dbt-loom 0.9.6 | loom ground truth |

Each case writes small dbt projects, parses providers to produce last-good
manifests, then parses each consumer twice: once under dbt-loom reading those
manifests through a `dbt_loom.config.yml` with the case's `included_packages`,
`excluded_packages` and `optional` knobs, and once under the plugin reading the
public-only projection from `climb.py`. `FUZZ_DBT_COMMAND=ls` runs
`dbt ls --output json --output-keys unique_id`, which is the command the server
runs for a refresh. Without it the runner uses `dbt parse`, which does not build
the graph and therefore never reports `Found a cycle`.

```bash
examples/multi-repo-dbt-sim/run-loom-parity
```

The wrapper runs `seed_cases.py` under `dbt ls`, `loader_probe.py`,
`select_probe.py` and `combo.py` for the seed range in
`LOOM_PARITY_COMBO_START` (42) and `LOOM_PARITY_COMBO_CASES` (40). Results go to
`reports/loom-parity/`. Unit checks that do not invoke dbt:

```bash
python3 -m unittest examples/multi-repo-dbt-sim/tests/test_loom_parity.py
```

## Status vocabulary

`pass` means exit 0 and a manifest. `unresolved` is dbt's
`which was not found`. `access-denied` is dbt's protected or private reference
error, which only loom can produce because the climb never injects a
non-public node. `error` is another dbt compilation or parsing error, for
example the one-argument `found nodes in multiple packages` message. `crash` is
a Python traceback, which loom raises for configuration problems. `cycle` is
`Found a cycle` and only appears under `dbt ls`.

## Seed cases (`seed_cases.py`)

| Case | Loom-shaped setup | Loom | Climb plugin | Parity |
| --- | --- | --- | --- | --- |
| S1a | two public `orders`, one-argument ref | error: dbt multiple packages | error: same dbt text | same; the resolver on #31471 rejects it earlier with a source-level message |
| S1b | one provider has `orders` | pass | pass | same |
| S2a | A public `orders`, B protected `orders`, one-argument ref | error: dbt multiple packages | pass, binds A | intentional: loom injects protected nodes so dbt sees two candidates; Mesh and the climb only see public |
| S2b | explicit ref to the protected twin | access-denied | unresolved | withheld on both |
| S3 | only protected, private or unset upstream models | access-denied | unresolved | withheld on both; `unset` is protected on both |
| S4 | public seed and public snapshot | pass with native ids | pass with native ids | same under `parse` and `ls` |
| S5 | protected seed under a public model | model ref passes; seed ref access-denied | model ref passes; seed ref unresolved | withheld on both; loom's shim only restricts model nodes, so a protected seed is denied by dbt, not by loom |
| S6, S6b | unversioned ref to a versioned model | binds `latest_version` | binds `latest_version` | same, including a pinned older latest |
| S7, S7b | explicit `v=2`; missing `v=3` | v2 binds; v3 unresolved | v2 binds; v3 unresolved | same |
| S8 | ordered cold chain a -> b -> consumer | pass | pass | same; the resolver seeds in provider order |
| S9 | cold ring with no manifests | crash: `LoomConfigurationError` | unresolved | both fail loud; the resolver names the unseeded upstream |
| S9b | seeded model cycle | `ls`: cycle at the first consumer; `parse`: pass | `ls` and `parse`: pass | the climb drops cross edges from the payload, so dbt never sees the cycle; the resolver's post-parse graph check on #31471 reports it |
| S9c | cycle through a protected intermediate | `ls`: cycle | pass | as S9b |
| S10 | empty store, `optional: true` | unresolved | unresolved | same |
| S12 | public model whose `depends_on` names a protected sibling | injects the sibling | drops the edge, keeps the public node | same bindings; the climb payload has no edge to a non-injected id |
| S13 | provider installed a local package with a public model | plain: pass; `included_packages`, `excluded_packages` or an unknown name: package ref unresolved | pass, injects `model.shared_pkg.shared_model` | intentional gap: the climb has no package filter and injects public package models with the provider |
| S14 | missing upstream manifest | `optional: true`: skipped; without it: crash | pass with the upstream silently absent in this runner | the climb has no optional knob; the resolver warns and tries a fresh seed |
| S15 | no additional sources | pass | pass | same |
| G1 | consumer refs a provider analysis | access-denied | unresolved | withheld on both |
| E1, E2 | string and float versions | pass, `.va`, `.v1.5` | pass, same ids | same |
| D1 | public alias | pass | pass | same; dbt rejects `access: public` on ephemeral models, so that divergence cannot occur |

`FUZZ_DBT_COMMAND=ls seed_cases.py` is the recorded run; `seed-cases.json` is
the same table under `dbt parse`.

## Loader and filter probes (`loader_probe.py`)

Loom's `optional` only swallows `LoomConfigurationError`, which the file
loader raises for a missing path. An HTTP 404, a refused connection, or a
missing cloud credential is a dbt runtime error with or without `optional`.
A gzipped local file crashes in loom; a gzipped HTTP response loads. Setting
both `included_packages` and `excluded_packages` is a validation crash. An
unknown `included_packages` name or excluding the provider's own package
silently drops every node. The same manifest listed twice merges by unique id.
The config `name` is ignored in favour of the manifest's `project_name`.

Cloud loaders (`s3`, `gcs`, `azure`, `dbt_cloud`, `paradime`, `snowflake`,
`databricks`) are credential errors here and are not applicable to the climb,
which reads confirmed rows rather than host artefacts.

## Selection and unreadable stores (`select_probe.py`)

`dbt ls --select orders` lists one node and still writes the complete parsed
manifest, so a selective deploy seeds the whole public surface. A selector
that matches nothing warns and exits 0 with the same complete manifest. A
corrupt or key-less last-good file makes `climb.injection_for` raise a bare
`JSONDecodeError` or `KeyError`.

## Combinatorial cases (`combo.py`)

`combo.py START COUNT` generates providers with mixed access, versions, seeds
and snapshots, plus a consumer with one to three refs, and classifies the pair
of statuses. Every pair outside the `KNOWN` table prints `UNCLASSIFIED`, and a
`pass`/`pass` pair with different bindings prints a gap.

## Resolver fuzz (`resolver-fuzz/`)

`crossSourceRefs.fuzz.test.ts` is a Vitest file for the resolver on #31471.
It is not run from this directory. It drives `resolveCrossSourceManifests`
with a dbt-emulating fetch mock over 3000 generated cases from a seeded
generator and checks: only `access: public` nodes are injected, every
`depends_on` edge points at an injected id, a consumer never receives its own
package, each source is fetched once, and no exception other than
`ParameterError` escapes. It also records the S1 to S15 resolver outcomes.
