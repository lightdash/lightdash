# Cross-project dbt refs: clean-room architecture note

Status: research only. No merge, no flag change, no production touch.

Baseline inspected: `87c74eeeda04800c2111e0f2900c972d04ee242b` (2026-10-15, `chore(release): 2.589.3`), branch `research/fable-cross-source-cleanroom`. Load at start: 3.4 on one minute.

Everything below reasons from the product brief, this checkout, public dbt Mesh and dbt-loom behaviour, and a small `/tmp` experiment run on this box with dbt 1.12 and dbt-loom 0.9.6. No other thread, PR, branch or history was consulted.

## 0. What the baseline already does, and where it breaks

The unit of "a connected dbt project" on this baseline is a **dbt source** of a Lightdash project: `projects.dbt_connection` is the primary source, and `project_dbt_sources` holds the additional ones (name, precedence, encrypted dbt connection, warehouse database and schema, optional binding to an extra warehouse connection). A compile fetches every source's manifest independently (`DbtGitProjectAdapter` clone, `dbt deps`, `dbt ls`), stamps each model with `lightdash_source_uuid`, merges them with `combineManifestSources` (fail-closed on duplicate `unique_id`), persists a projected copy in `project_merged_manifests`, and compiles the merged manifest through a `DbtManifestProjectAdapter`. Multi-connection projects do the same per warehouse connection in `MultiConnectionCompiler` compile groups. The merged manifest already lets Lightdash `meta.joins` and explore lookups resolve across sources, and `qualifyManifestNames` already disambiguates bare model names by source or package.

The break is earlier than the merge. A `ref()` to a model that lives in another source is unresolvable while dbt parses the referring source on its own, so `dbt ls` exits 2 and the merge never runs. Verified on this box with dbt 1.12:

```
Model 'model.finance.revenue' (models/revenue.sql) depends on a node named
'public_orders' in package or project 'core_platform' which was not found
```

Nothing done after the parse can repair this. The fix has to put the upstream's public models in front of dbt before it parses the consumer, which is exactly what dbt Mesh does in dbt Cloud and what dbt-loom does for dbt Core.

## 1. Recommended architecture

Name: **share-surface seeds with dependency-ordered injection**.

Components:

1. **Share-surface extractor** (pure function in `@lightdash/common`). Input: one source's raw dbt manifest. Output: a *share manifest*: the manifest `metadata` plus only the model nodes that are project-owned and public, projected to the minimal node shape an injector needs, with `depends_on.nodes` pruned to ids that are themselves on the share surface. It also returns counts of what it omitted and why.
2. **Seed store** (new Postgres table, see section 2). One row per (project, dbt source): the last known-good share manifest, gzipped, with the upstream dbt project name, its manifest `generated_at`, a checksum, model counts and the job that wrote it. This is the "last known-good upstream catalog".
3. **Provider registry and plan** (pure function in common). Built per compile run from each source's `dbt_project.yml` `name:` and its `dependencies.yml` `projects:` list. Produces: provider map (dbt project name to source), consumer edges, topological order, and hard errors for duplicate provider names, cycles and cross-connection edges.
4. **Injector** (backend, around `DbtCliClient`). For a consumer source with declared upstreams, writes one share-manifest file per upstream plus a `dbt_loom.config.yml` into the client's private target directory, and passes `DBT_LOOM_CONFIG` to the dbt subprocess. dbt-loom (installed into the dbt 1.6+ virtualenvs in the image) injects those nodes through dbt's plugin hook before parsing.
5. **Post-parse strip** (backend). Removes the injected nodes from the consumer's manifest and from its `dbt ls` selection before the existing merge, so the provider's real nodes are the only copy.
6. **Existing merge and compile**: unchanged. `combineManifestSources`, compile groups, `qualifyManifestNames`, `project_merged_manifests`.

Data flow on refresh (flag on, project with N sources):

```
clone/refresh every source  ──►  read dbt_project.yml name + dependencies.yml
        │                                   │
        ▼                                   ▼
  plan: providers, edges, topo order, fail closed on dup names / cycles / cross-connection
        │
        ▼  dependency-ordered pool (a source starts when all its upstreams finished)
  for each source S:
      inputs = for each declared upstream U:
                 fresh share surface from this run      (U parsed OK this run)
                 else seed row for U                    (warn: fallbackToSeed, seed age)
                 else nothing                           (warn: coldStart)
      write share files + dbt_loom.config.yml  → dbt deps → dbt ls (loom injects)
      strip injected nodes from S's manifest and selection
      extract S's share surface → stage it (S is now a usable upstream for later sources)
        │
        ▼
  combineManifestSources (unchanged) → compile explores (unchanged)
        │
        ▼ on job success, same place persistMergedManifest runs today
  commit staged share surfaces to the seed store (only for sources whose own parse succeeded)
```

Where state lives:

- Seeds: Postgres, because the API, scheduler worker and headless browser share no filesystem and the baseline already keeps `project_merged_manifests` in Postgres for the same reason. Share manifests are small (public models only, projected fields).
- Everything per run: the per-client temp target directory `DbtCliClient` already creates, cleaned up by the adapter's `destroy()`.
- Partial-parse baselines: unchanged, still per project and source under `DBT_PARTIAL_PARSE_BASELINE_ROOT`. Injection and partial parse coexist (verified below).

How compile uses it: the consumer's manifest, after strip, contains its own models whose `depends_on` point at `model.<upstream>.<name>`. Those ids exist in the merged manifest from the provider's own fetch, so Lightdash's joins and name qualification behave exactly as they do for any multi-source project today. Lightdash never reads the injected copies.

### Why dbt-loom rather than our own mechanism

dbt-loom is the de facto dbt Core implementation of Mesh cross-project refs. It uses dbt's public plugin hook (`get_nodes` returning `PluginNodes`), supports the two-argument `ref('project', 'model')`, model versions and groups, and ships the per-version shims for dbt 1.6 through 1.12 (`dbt-core>=1.6.0,<1.13.0` in its metadata). Running it on the Lightdash server costs us a pinned Python package per virtualenv, not a service.

What loom does **not** do for us is the share-surface rule. Its `identify_node_subgraph` injects every node in the manifest, including protected and private models and package models, then relies on monkeypatched access checks to refuse refs to protected nodes. That is why the share-surface extractor is ours and runs before loom ever sees a file: what reaches dbt is already only project-owned public models. Loom's `included_packages` is set as belt and braces, not as the filter.

### Experiment evidence (dbt 1.12.0, dbt-postgres 1.10.2, dbt-loom 0.9.6, no warehouse connection)

Two tiny projects under `/tmp/fable-cleanroom-cross-source/spike/`: `core_platform` (a public model, a protected model, a public model that depends on the protected one, and an installed package `vendor_pkg` with its own public model) and `finance` with `dependencies.yml` declaring `core_platform`.

| Case | Result |
|---|---|
| `finance` parsed alone | exit 2, "depends on a node named 'public_orders' in package or project 'core_platform' which was not found" |
| Upstream manifest fields | `metadata.project_name=core_platform`; every model has `package_name` and `access`; `vendor_pkg.vendor_public` has `package_name=vendor_pkg`, `access=public` |
| Loom with the **full** upstream manifest, consumer refs a protected model | exit 2, dbt Parsing Error: "referenced node is protected to the 'core_platform' package" |
| Loom with a **share manifest** (project-owned public only) | exit 0; both `ref('core_platform','public_orders')` and bare `ref('public_orders')` resolve; `depends_on` = `['model.core_platform.public_orders']`; vendor and protected models absent |
| Same, consumer refs the protected model | exit 2, "not found" (never injected) |
| Share manifest keeping a public model's `depends_on` to a protected model | exit 2, "'model.core_platform.public_summary' depends on 'model.core_platform.internal_orders' which is not in the graph!" |
| Share manifest with `depends_on.nodes` pruned | exit 0, "Found 5 models" (3 local + 2 injected) |
| `DBT_PARTIAL_PARSE=true`, second run | injected nodes still present, no error |
| Injected node shape in the consumer manifest | same keys as a local model; `original_file_path=''`, `path=''`, `raw_code=''`, empty `columns` and `meta`; listed by `dbt ls` |
| Hand-placed stub package under `dbt_packages/` without a `packages.yml` entry | exit 2 at parse: "dbt expects 0 package(s) based on packages specified in packages.yml, but found only 1 package(s) installed" |

The last row is why the stub-package alternative is rejected (section 7). The "listed by `dbt ls`" row is why the strip step is mandatory: without it the injected copy lands in `selectedModelIds`, becomes a `compiled` node and collides with the provider's real node in the merge.

## 2. Implementation on this baseline

Sequenced so each step is independently reviewable and the flag-off path stays byte-identical.

1. **Flag**: `FeatureFlags.CrossSourceDbtRefs = 'cross-source-dbt-refs'` in `packages/common/src/types/featureFlags.ts`, resolved with `featureFlagModel.get({ user: { userUuid, organizationUuid } })` next to the existing `MultiDbtSources` check in `resolveCompileAdapter` and `compileMultiConnectionProject`. Requires `MultiDbtSources` to be on; a project with zero additional sources short-circuits exactly as today.
2. **Common, pure, unit-tested**:
   - `packages/common/src/dbt/shareSurface.ts`: `extractShareSurface(manifest) -> { manifest, counts, checksum }`. Filter: `resource_type === 'model'`, `package_name === metadata.project_name`, `access === 'public'`, `config.enabled !== false`. Projection: `unique_id, name, package_name, resource_type, fqn, database, schema, alias, relation_name, access, group, version, latest_version, deprecation_date, depends_on (pruned), config: { materialized, event_time, access }, description, columns (name, description, data_type only)`. Metadata keeps `project_name, project_id, adapter_type, dbt_schema_version, dbt_version, generated_at`.
   - `packages/common/src/dbt/dbtDependencies.ts`: parse `dependencies.yml` `projects[].name` (ignore `packages:` entries). Tolerant of a missing file; strict on malformed YAML (error names the source).
   - `packages/common/src/dbt/crossSourcePlan.ts`: `planCrossSourceFetch(sources: { sourceUuid, name, dbtProjectName, declaredUpstreams, compileGroupKey })`. Returns provider map, edges, topological waves; throws typed errors for duplicate dbt project names, cycles, and an edge whose provider sits in a different compile group.
   - `stripInjectedNodes(manifest, selectedModelIds, injectedIds)`.
3. **Backend storage**: migration `create_project_dbt_source_share_manifests` (project_uuid FK cascade, project_dbt_source_uuid, dbt_project_name, manifest bytea, source_generated_at, checksum, model_count, omitted_package_model_count, omitted_non_public_count, written_at, job_uuid; PK (project_uuid, project_dbt_source_uuid); unique (project_uuid, dbt_project_name)). Entity + `ProjectDbtSourceShareManifestModel` with `getForProject`, `upsertMany` (one transaction), `deleteForSource`. Additive only, no release-safety declaration needed. The primary source uses `projects.dbt_source_uuid` from `getDbtSourceIdentity` as its key, matching how `lightdash_source_uuid` is stamped today.
4. **Image**: `pip install --no-deps dbt-loom==<pinned>` into `/usr/local/dbt1.6` through `/usr/local/dbt1.12` in `dockerfile` (its hard requirements beyond dbt-core are already present in those virtualenvs: PyYAML, pydantic, networkx, requests; the cloud client extras are only imported for non-file manifest types). Vendor the wheel hash. Add a CI smoke job that parses a two-project fixture under `examples/` with each installed dbt version so a dbt bump cannot silently break injection.
5. **dbt subprocess**: `dbtProcessEnvironment.ts` gains an explicit optional `loomConfigPath` argument that sets `DBT_LOOM_CONFIG`; never via the customer allowlist. Unit tests pin that it is absent when not requested.
6. **`DbtCliClient`**: `setExternalProjects(shares: { dbtProjectName, manifestJson }[])` writes `<target>/cross-source/<name>.json` files and `<target>/dbt_loom.config.yml` (`type: file`, `included_packages: [<name>]`) and remembers the injected ids. `getDbtManifest()` unchanged in shape. Both land in the per-client temp target dir that `cleanup()` already removes.
7. **Adapters**: `ProjectAdapter` gains `getDbtProjectIdentity(): Promise<{ dbtProjectName, declaredUpstreams, dbtVersion }>`. For git adapters this performs the clone/refresh that `getDbtManifest` does today and reads `dbt_project.yml` and `dependencies.yml` from `dbtProjectDir`; `getDbtManifest` then reuses the clone. The manifest adapter returns the manifest's `project_name` and no upstreams.
8. **Orchestration**: a `CrossSourceFetchRunner` used by both `buildMergedManifestAdapter` (single-connection merge in `ProjectService`) and `MultiConnectionCompiler.compileExtraGroup`, replacing the flat `runWithConcurrency` queue with a readiness-gated pool (same concurrency decision from `resolveDbtSourceFetchConcurrency`). Per source: inject, fetch, strip, extract and stage. Flag off or no `dependencies.yml` anywhere: the runner degrades to today's flat queue with no injection and no seed writes.
9. **Commit seeds**: alongside `persistMergedManifest` in both compile entry points (`compileProject` and `testAndCompileProject`), one transaction, only for sources whose own parse succeeded this run. A source whose parse failed keeps its previous seed untouched. Nothing is written when the job crashes before that point.
10. **Errors surfaced to users**: wrap dbt's "not found in package or project 'X'" when X is a declared upstream, adding which origin was used (fresh, seed with age, or none) so the message says *why* the model was missing. Keep the existing `DbtSourceError` naming of the failing source.
11. **Tests**: common unit tests for the three pure modules; a backend integration test in the style of `__tests__/multi_connection_compile.migration.integration.ts` using fixture manifests (fresh path, seed fallback path, cold start, duplicate provider, cycle, strip); the dbt-level CI smoke above.
12. **Docs**: `docs/cross-source-dbt-refs.md` for operators (log events, seed table, how to clear a seed) and an entry in `docs/feature-flags.md`. Public docs are out of scope for this pass.

No spike PR was opened. The `/tmp` experiment and this note are the artefacts; the note is also committed on the research branch under `docs/research/`.

## 3. Cold start

"Cold" means a consumer declares an upstream that has no seed row yet.

- **Same-run first seed is the normal path.** Because fetches run in dependency order, the first ever refresh parses the upstream first and hands its fresh share surface to the consumer. No seed is needed for the common case. This is the "ordered first-seed path" the brief asks for and it makes progress without any manual step.
- **Upstream fails on the first run and has no seed**: the consumer is parsed with nothing injected for that upstream. If it actually refs that upstream, dbt fails with the "not found" error and Lightdash wraps it: "Upstream 'core_platform' has no known-good catalog yet and failed this run: <upstream error>. Fix the upstream and refresh." A `dbt.crossSource.coldStart` warning is logged. Sources that do not depend on the failing upstream still compile. No silent wrong answer, and no attempt to guess.
- **Declared upstream that is not a connected source** (typo, or a true dbt Cloud dependency): not injected, `dbt.crossSource.upstreamUnknown` warning naming the consumer and the declared name, parse proceeds. If the consumer refs it, dbt's own error names the project.
- **Preview projects**: `copySources` copies source rows; seeds are copied with them so a preview inherits the parent's last known-good state rather than starting cold.
- **Flag turned on for an existing project**: the next refresh is a cold start in the sense above; because ordering handles it, the usual outcome is a clean first seed.

## 4. Share-surface filter

Applied by Lightdash to each provider's own freshly parsed manifest, before anything is stored or injected:

```
node.resource_type === 'model'
&& node.package_name === manifest.metadata.project_name
&& node.access === 'public'
&& node.config.enabled !== false
```

- `package_name === metadata.project_name` is the project-owned test. Models that arrived through `packages.yml` carry their package's name (`vendor_pkg` in the experiment) and are omitted even when that package marks them `public`. This is also what keeps multi-hop leakage out: nodes that were injected into a provider from *its* upstream carry the upstream's `package_name`, and are stripped anyway before extraction.
- `access` is read from the node; dbt 1.5+ writes it on every model (`protected` by default). A manifest from dbt 1.4 has no `access` and therefore exposes nothing, which is the correct fail-closed outcome and matches Mesh's dbt version floor.
- Seeds, snapshots, sources and semantic models are not shared. Mesh's public surface is models. Consumers that need a provider's seed should wrap it in a public model.
- `depends_on.nodes` is pruned to ids that are themselves on the share surface. Verified necessary: a dangling dependency makes the consumer parse fail with "not in the graph".
- Counts of each omission class are returned and logged (`omittedPackageModels`, `omittedNonPublic`, `omittedNonModel`, `prunedDependsOn`).
- Lightdash-side `meta` is intentionally dropped from the share surface. The consumer's dbt only needs relation identity; explore metadata for the upstream model comes from the provider's own fetch in the merge.

The filter is a pure common function with table-driven tests over fixture manifests from dbt 1.4 (no `access`), 1.7 and 1.12.

## 5. Edge cases and failure modes

| Situation | Behaviour |
|---|---|
| Upstream parse fails, seed exists | Consumers inject the seed. `dbt.crossSource.fallbackToSeed` warning with the seed's `generated_at`, age and the upstream error summary. The upstream's seed is not overwritten. The job still fails overall because a source failed (today's rule), but the consumer's manifest is valid and its error attribution is accurate. |
| Upstream parse fails, no seed | Section 3, cold start. |
| Upstream relation moved (database or schema) while the upstream is broken | Consumers compile against the stale relation name. Inherent to last known-good; the fallback warning carries seed age so an operator can see it. |
| Two sources declare the same dbt project `name:` | Fail closed at plan time with both source names, before any dbt runs. Today this surfaces later as a unique_id collision in the merge; moving it earlier gives a clearer message. |
| Two declared upstreams expose the same model name, consumer uses a bare `ref('x')` | dbt raises its ambiguous-reference error. Lightdash passes it through. The two-argument form resolves it. |
| Consumer bare `ref('x')` where `x` exists only in an undeclared sibling | Not injected, dbt "not found". By design: undeclared cross-project refs are the silent-wrong-answer path the brief rules out. |
| Cycle A → B → A in `dependencies.yml` | Fail closed at plan time, listing the cycle. Mesh does not permit cycles either. |
| Multi-hop A → B → C | Topological order fetches A, then B (A fresh), then C (B fresh). C sees only B's project-owned public models; A's nodes are not re-exported through B. If C also needs A it must declare A. |
| Provider in a different compile group (other warehouse connection) | Fail closed at plan time. dbt Mesh assumes one warehouse; a ref across connections would compile and then fail at query time. Revisit if a customer needs it. |
| Model versions (`v2`) | Loom preserves `version` and `latest_version`; unique_ids with `.vN` are carried through the strip and merge unchanged. |
| Groups on public models | Loom patches dbt's group validation so consumers do not fail on unknown group names. |
| Upstream model removed or made protected | Consumer parse fails at the next refresh with dbt's error. Correct: the contract was broken upstream. |
| dbt 1.4 or 1.5 consumer with declared upstreams | Fail with "cross-project refs need dbt 1.6 or later on this source" at plan time. Loom does not load on those versions. |
| Flag off after seeds exist | No injection, no reads, no writes; rows stay until the source or project is deleted (FK cascade). A maintenance command can clear them. |
| Source deleted or renamed | Seed row cascades on source delete. Renaming the Lightdash source does not matter; the key is the source uuid and the dbt project name. |
| Share surface is empty (upstream has no public models) | Seed row written with `model_count = 0`, logged. Consumers that ref it get dbt "not found" with the hint that the upstream exposes no public models. |
| Agent-connection (CLI) compiles | Same path; `DbtSourceError` and the seed commit follow the existing `agentExecutionContext` rules for `deleteMergedManifestBestEffort`. |

## 6. Observability

Structured events, with the decisive values also in the message string because the default log format drops metadata (the baseline does this for `dbt.compile.*`). All carry `projectUuid`, `jobUuid`, and the source name and uuid where relevant.

| Event | Level | Fields | Proves |
|---|---|---|---|
| `dbt.crossSource.plan` | info | sources, providers (name → source), edges, waves, flag=true | planning ran and what it decided |
| `dbt.crossSource.planRejected` | error | reason ∈ duplicateProvider, cycle, crossConnection, dbtVersionTooOld, details | fail-closed decisions |
| `dbt.crossSource.upstreamUnknown` | warn | consumer, declaredName | declared but not connected |
| `dbt.crossSource.shareSurface` | info | source, dbtProjectName, publicOwnedModels, omittedPackageModels, omittedNonPublic, omittedNonModel, prunedDependsOn, bytes, checksum | the filter ran and what it kept and dropped |
| `dbt.crossSource.inject` | info | consumer, upstream, origin ∈ fresh, seed, none, injectedModels, seedGeneratedAt, seedAgeMs, loomVersion, dbtVersion | what dbt was given |
| `dbt.crossSource.fallbackToSeed` | warn | consumer, upstream, upstreamError, seedGeneratedAt, seedAgeMs | last known-good was used |
| `dbt.crossSource.coldStart` | warn | consumer, upstream, upstreamError | no seed and upstream failed |
| `dbt.crossSource.strip` | info | consumer, strippedNodes, strippedFromSelection | injected copies removed before merge |
| `dbt.crossSource.seedWrite` | info | source, checksum, changed, bytes, modelCount | store written (or unchanged) |
| `dbt.crossSource.seedWriteSkipped` | warn | source, reason ∈ parseFailed, flagOff, jobFailedBeforeCommit | store not written and why |

Plus: the per-source `dbt.compile.sourceFetched` lines keep working, so a run reads as plan → shareSurface per provider → inject per consumer → strip → mergedManifestShape → seedWrite. Loom's own "Loading manifest / Injecting nodes" lines appear in the dbt JSON logs already captured by `DbtCliClient`, and are attached to `DbtSourceError.logs` on failure.

Analytics: extend the existing `project.compiled` properties with `crossSourceConsumers`, `crossSourceInjections`, `crossSourceSeedFallbacks`, so adoption and fallback rate can be read without log access.

## 7. Risks and alternatives

### Rejected: generated stub package instead of loom

Write a throwaway dbt package into the consumer's `dbt_packages/` containing one `select * from <relation>` model per upstream public model. No Python dependency, works on any dbt version. Rejected because dbt refuses to parse when `dbt_packages/` holds a package that `packages.yml` does not list (verified: "dbt expects 0 package(s) ... found 1"), so Lightdash would have to edit the customer's `packages.yml` in the clone; because the stub carries no `access`, group or version semantics, so protected models would surface as "not found" rather than dbt's access error; and because the stub models are real nodes that `dbt ls` selects and dbt would try to compile SQL for.

### Rejected: inject every sibling source without `dependencies.yml`

Simpler to configure and what some loom users do. Rejected because it has no dependency graph, so there is no fetch order and the fresh-first path is impossible; because a bare `ref('orders')` can bind to another project's model with no declaration, which is the silent wrong answer the brief rules out; and because it is not how Mesh describes dependencies. `dependencies.yml` is one short file the dbt author already knows.

### Considered and parked

- **Our own dbt plugin** (same hook loom uses, around 150 lines of Python). More control, no monkeypatching we did not write, but we would own the per-version shims loom already maintains. Revisit if loom's pin blocks a dbt upgrade.
- **Customer-hosted artefacts** (loom's `s3`, `gcs`, `dbt_cloud` manifest types): explicitly out of scope per the brief. The design does not preclude it; the injector would hand loom a URL instead of a local file.
- **Serving share manifests over the API** so a developer running `lightdash deploy` or `preview` locally can point their own loom at the server (loom's `file` type accepts an http(s) URL). Natural follow-up, since local dbt parses hit the same missing-ref failure the server does.

### Risks in the recommended design

- **Third-party dependency**: loom monkeypatches dbt internals (`is_invalid_protected_ref`, `check_valid_group_config_node`, `ModelNode.from_args`). Mitigation: pin per virtualenv, vendor the wheel, CI smoke parse per dbt version, and the share surface is already Mesh-shaped so a loom regression in access checks cannot widen exposure.
- **Loom's own filter is permissive**: it injects every node in a manifest. Mitigation: Lightdash never hands it anything but a share manifest; `included_packages` is set as well.
- **Injected nodes are selected by `dbt ls`**: must be stripped, or they collide in the merge and become empty explores. Mitigation: strip step with a count that must equal the injected count, else fail the source.
- **Seed semantics**: committing a provider's seed when its own parse succeeded, even if a sibling failed the job, means a provider can move forward while a consumer is broken. This is deliberate: gating on whole-job success would let one stuck consumer freeze the provider's seed for every other consumer. Trade-off is recorded in the design note.
- **Image size**: one small package per virtualenv with `--no-deps`; the heavy cloud clients are not installed.
- **Memory**: share manifests are small; the dependency-ordered pool reuses today's concurrency ceiling, but ordering can lengthen wall time when the graph is deep. Logged per wave.

## 8. Assumptions

1. "More than one dbt project connected" maps to the baseline's dbt sources inside one Lightdash project. Sharing across different Lightdash projects in the same organisation is not modelled on this baseline; the seed table is keyed by project so it could later be extended with an organisation-scoped provider registry, but that is not designed here.
2. Providers and consumers share a warehouse connection (one compile group). Cross-connection refs are rejected at plan time.
3. The share surface is exactly dbt Mesh's: project-owned models with `access: public`. No Lightdash-side override to share protected models or package models is offered.
4. Consumers declare upstreams in `dependencies.yml` `projects:`. Undeclared cross-project refs are not resolved.
5. dbt 1.6 or later on any source that declares upstreams. Older sources keep working as long as they declare nothing.
6. dbt-loom's licence is compatible with shipping it in the Lightdash image. To be checked before the image change lands.
7. The flag `cross-source-dbt-refs` is an organisation-scoped flag resolved through `FeatureFlagModel`, default off, and requires `multi-dbt-sources` to be on.
8. `dependencies.yml` lives at the dbt project root (`project_sub_path`), the same directory as `dbt_project.yml`.
9. A seed is good when the provider's own parse succeeded and the extractor ran without error; downstream compile success is not required for a provider's seed to update.
10. The experiment ran on dbt 1.12 with dbt-postgres only. Behaviour on 1.6 through 1.11 is expected from loom's version support but was not exercised here; the proposed CI smoke job is the verification.
11. The two modified generated files in the worktree (`packages/backend/src/generated/routes.ts`, `swagger.json`) were regenerated by worktree setup, not by this research, and are not part of any deliverable.
