# Project Adapters Review

## Current Architecture

The project adapters are a 5-level deep class hierarchy whose job is to take a
dbt project from some source, compile it, and produce `(Explore | ExploreError)[]`.

```
ProjectAdapter (interface)
└── DbtBaseProjectAdapter              ← core compilation pipeline
    ├── DbtLocalProjectAdapter         ← wraps DbtCliClient
    │   └── DbtLocalCredentialsProjectAdapter  ← generates profiles.yml
    │       └── DbtGitProjectAdapter           ← clone/pull + delegate
    │           ├── DbtGithubProjectAdapter     ← URL: github.com
    │           ├── DbtGitlabProjectAdapter     ← URL: gitlab.com
    │           ├── DbtBitBucketProjectAdapter  ← URL: bitbucket.org
    │           └── DbtAzureDevOpsProjectAdapter← URL: dev.azure.com
    ├── DbtCloudIdeProjectAdapter      ← dbt Cloud Metadata API
    └── DbtManifestProjectAdapter      ← parse pre-compiled manifest
└── DbtNoneCredentialsProjectAdapter   ← throws on compile
```

## Problems

### 1. Deep inheritance for trivial variation

The four Git provider adapters override nothing. Their only job is constructing
a URL string. That's 4 classes (260 lines) to format 4 URL patterns.

### 2. Compilation tightly coupled to project lifecycle

`buildAdapter()` requires a fully configured project with warehouse credentials,
SSH tunnel, OAuth token refresh. You can't "just compile" without all that.

### 3. Two code paths for the same outcome

CLI deploy (`setExplores`) and backend compile (`compileProject`) both end at
`saveExploresToCacheAndIndexCatalog()`, but the backend path drags in the entire
adapter apparatus. The CLI path proves adapters aren't necessary.

### 4. Code smells

- `DbtNoneCredentialsProjectAdapter` implements the interface but throws on compile
- `DbtManifestProjectAdapter` creates a dummy `DbtClient` to satisfy the base class

## Proposed Simplification

Separate the two concerns currently fused in the hierarchy:

1. **Getting a manifest** (clone + dbt, dbt Cloud API, CLI push, etc.)
2. **Compiling a manifest into explores** (validate, attach types, convert)

### Replace class hierarchy with composable functions

```typescript
// Manifest sources (simple functions, not classes)
async function getManifestFromGitRepo(config, credentials, dbtVersion): Promise<ManifestResult>
async function getManifestFromDbtCloud(config): Promise<ManifestResult>
async function getManifestFromString(manifestJson): Promise<ManifestResult>

// Compilation (one function, not a base class)
async function compileManifestToExplores(manifest, warehouseClient, cache, options): Promise<(Explore | ExploreError)[]>
```

### Replace Git adapters with a URL builder

```typescript
function buildGitUrl(config: GitRepoConfig): string {
  switch (config.provider) {
    case 'github':  return `https://lightdash:${config.token}@${config.host ?? 'github.com'}/${config.repo}.git`;
    case 'gitlab':  return `https://lightdash:${config.token}@${config.host ?? 'gitlab.com'}/${config.repo}.git`;
    case 'bitbucket': return `https://${config.username}:${config.token}@${config.host ?? 'bitbucket.org'}/${config.repo}.git`;
    case 'azure_devops': return `https://${config.token}@dev.azure.com/${config.org}/${config.project}/_git/${config.repo}`;
  }
}
```

4 classes become a 10-line function.

---

## Server-Side Compilation: Performance Analysis & Simplification

### Current compilation timeline

When a user triggers a compile for a GitHub-connected project, here's what
happens end-to-end, with approximate timings:

```
1. buildAdapter()                                    ~50ms
   ├─ getWithSensitiveFields()                        DB query
   ├─ getWarehouseFromCache()                         DB query
   ├─ OAuth token refresh (Snowflake/Databricks)      0-500ms (network)
   └─ SSH tunnel connect                              0-200ms (network)

2. adapter.compileAllExplores()
   ├─ _refreshRepo()                                 3-30s (BOTTLENECK 1)
   │   ├─ git pull (fast-forward)                     1-5s if repo exists
   │   └─ git clone --depth 1 (fallback)              3-30s depending on repo size
   ├─ dbt deps                                       5-60s (BOTTLENECK 2)
   │   └─ Downloads all dbt packages from hub/git
   ├─ dbt ls / dbt compile                           5-30s (BOTTLENECK 3)
   │   └─ Parses all models, generates manifest.json
   ├─ Read manifest.json from disk                    10-500ms (I/O)
   │   └─ JSON.parse() on 1-200MB file
   ├─ Validate models against schema                  <50ms
   ├─ attachTypesToModels (cached catalog)            <200ms
   │   └─ On MissingCatalogEntryError:
   │       └─ warehouseClient.getCatalog()            1-10s (BOTTLENECK 4)
   │           └─ Queries information_schema in batches of 100 tables
   └─ convertExplores()                               500ms-2s
       └─ For each model: dimensions, metrics, joins, SQL compilation

3. saveExploresToCacheAndIndexCatalog()               100-500ms
   ├─ JSON.stringify() all explores
   ├─ Batch insert to cached_explore table
   ├─ Upsert to cached_explores table (all-in-one blob)
   └─ Schedule catalog indexing
```

**Total: 15s to 2+ minutes for a typical project.**

The four bottlenecks are: git clone, dbt deps, dbt compile, and warehouse
catalog fetch (on first run or schema change). Everything else is fast.

### What costs what

| Phase | Time | Disk I/O | Memory | Network |
|-------|------|----------|--------|---------|
| Git clone (depth=1) | 3-30s | Writes full worktree to /tmp | Low (streaming) | Download entire branch snapshot |
| dbt deps | 5-60s | Writes packages to dbt_packages/ | Medium | Downloads from hub/git |
| dbt compile/ls | 5-30s | Reads all .sql/.yml, writes manifest.json | **High** (full manifest in Python) | None |
| Read manifest.json | 10-500ms | Reads 1-200MB file | **High** (full JSON in memory) | None |
| Warehouse catalog | 1-10s | None | Low (column names + types) | Queries warehouse |
| convertExplores | 500ms-2s | None | Medium (explore objects) | None |
| Save to DB | 100-500ms | None | Medium (JSON serialization) | None |

### The disk problem

Today, every compilation creates **two** temp directories:

1. `/tmp/git_XXXXXX` — full git worktree (clone of the repo)
2. `/tmp/local_XXXXXX` — profiles.yml with warehouse credentials

These are cleaned up in `destroy()`, but during compilation the full repo is on
disk. For a large dbt project, this can be 50-500MB of files that dbt needs to
read. The `--depth 1 --single-branch --no-tags` options keep the .git directory
small, but the worktree (all the .sql and .yml files) is always fully checked out.

dbt itself then reads every file, parses every model, and writes a manifest.json
that can be 50-200MB for large projects. That manifest is then read back by
Node.js and parsed with `JSON.parse()`, creating a second in-memory copy.

**Partial parse is explicitly disabled** (`DBT_PARTIAL_PARSE: 'false'` in
dbtCliClient.ts:212), meaning dbt does a full parse every time. This was likely
done for correctness (partial parse can be flaky), but it means there's no
incremental compilation benefit even if the worktree is reused.

### Key insight: the manifest is the only output that matters

After dbt runs, the only artifact Lightdash uses is `manifest.json`. Everything
else on disk — the .sql files, the dbt_packages, the profiles.yml — is
intermediate. The manifest contains all the compiled SQL, column metadata, and
model relationships that `compileAllExplores` needs.

This means: **if you can get a manifest, you don't need disk at all** for the
Lightdash-specific compilation step. The `attachTypesToModels` +
`convertExplores` pipeline operates entirely on in-memory objects.

### Proposed architecture: manifest-centric compilation

Split the pipeline into three clean phases with clear boundaries:

```
Phase 1: Get manifest (source-specific, may need disk)
  ├─ Git repo: clone → write profiles.yml → dbt deps → dbt compile → read manifest.json → cleanup
  ├─ dbt Cloud: GraphQL API call → synthetic manifest (already in memory)
  ├─ CLI push: receive manifest JSON over HTTP (already in memory)
  └─ Returns: { manifest: DbtManifest, projectConfig?: LightdashProjectConfig }

Phase 2: Compile manifest to explores (pure in-memory, no disk, no network*)
  ├─ Validate adapter type
  ├─ Filter + validate models
  ├─ Attach warehouse types from cached catalog
  ├─ Convert to explores
  └─ Returns: (Explore | ExploreError)[]
  (* warehouse catalog fetch only if cache miss)

Phase 3: Persist (database writes)
  ├─ Save explores to cache
  ├─ Index catalog
  ├─ Update warehouse catalog cache
  └─ Schedule validation
```

Phase 2 is a **pure function** of (manifest, catalog, options) → explores. No
classes, no lifecycle, no temp directories. This is the
`compileManifestToExplores` function from the earlier section.

Phase 1 is where all the complexity lives, but it's now isolated. Each manifest
source is an independent function with its own resource management.

### How each manifest source should work

#### Git repos (GitHub/GitLab/Bitbucket/Azure DevOps)

**Current:** Clone to /tmp, run dbt, read manifest, clean up. Every compile
starts from scratch because `DBT_PARTIAL_PARSE` is disabled and temp dirs are
ephemeral.

**Recommended approach — still needs disk, but scoped tightly:**

```typescript
async function getManifestFromGitRepo(
  gitConfig: GitRepoConfig,
  warehouseCredentials: CreateWarehouseCredentials,
  dbtVersion: SupportedDbtVersions,
): Promise<ManifestResult> {
  const workDir = mkdtempSync('/tmp/dbt_compile_');
  try {
    // 1. Clone (shallow, single branch)
    await cloneRepo(buildGitUrl(gitConfig), gitConfig.branch, workDir);

    // 2. Write profiles.yml (in same temp dir, not a separate one)
    const profilesDir = path.join(workDir, '.lightdash_profiles');
    mkdirSync(profilesDir);
    writeProfilesYml(profilesDir, warehouseCredentials, gitConfig.targetName);

    // 3. Run dbt
    const projectDir = path.join(workDir, gitConfig.subPath);
    await runDbt(['deps'], projectDir, profilesDir, dbtVersion);
    await runDbt(['compile'], projectDir, profilesDir, dbtVersion);

    // 4. Read outputs (manifest + optional lightdash config)
    const manifest = JSON.parse(readFileSync(path.join(projectDir, 'target/manifest.json'), 'utf-8'));
    const projectConfig = tryReadLightdashConfig(projectDir);

    return { manifest, projectConfig };
  } finally {
    // 5. Always clean up
    rmSync(workDir, { recursive: true, force: true });
  }
}
```

Key differences from current code:
- **Single temp directory** instead of two
- **Cleanup in `finally`** instead of a `destroy()` method that callers must remember
- **Function, not a class** — no lifecycle to manage
- **Returns data** (manifest) instead of *being* the compilation

**Performance improvement options for git repos:**

1. **Persistent clone directory per project.** Instead of cloning from scratch
   every time, keep a bare clone cached on disk and do `git fetch + checkout`.
   This saves the initial clone time (3-30s) on subsequent compiles. The risk is
   disk usage growth, but a periodic cleanup job handles that.

2. **Enable partial parse.** dbt's partial parse is more reliable in recent
   versions (1.7+). If you keep the worktree around between compiles, partial
   parse can reduce compile time from 30s to 2-5s. The tradeoff is disk space
   and potential staleness.

3. **Use `dbt parse` instead of `dbt compile`.** `dbt parse` generates a
   manifest without compiling SQL expressions (Jinja rendering). This is faster
   but the manifest won't have `compiled_code`. Lightdash uses `compiled_code`
   for the SQL preview but not for explore compilation itself. Could be a fast
   path for the common case.

4. **Stream manifest parsing.** For large manifests (100MB+), `JSON.parse()` of
   the entire file blocks the event loop. A streaming JSON parser (like
   `stream-json`) can parse incrementally and extract only the `nodes` and
   `metadata` keys without loading the full object.

#### dbt Cloud

**Current:** `DbtMetadataApiClient` makes GraphQL calls and constructs a
synthetic manifest in memory. No disk needed.

**Recommendation:** This is already clean. Extract it as a function:

```typescript
async function getManifestFromDbtCloud(config: DbtCloudConfig): Promise<ManifestResult> {
  const client = new GraphQLClient(config.endpoint, { headers: { Authorization: `Bearer ${config.apiKey}` } });
  // Paginated fetch, build synthetic manifest
  return { manifest, projectConfig: undefined };
}
```

No performance changes needed — it's network-bound and already batched.

#### CLI push (manifest string)

**Current:** `DbtManifestProjectAdapter` wraps the manifest string in a dummy
`DbtClient`, then `DbtBaseProjectAdapter.compileAllExplores()` calls
`getDbtManifest()` which does `JSON.parse()`.

**Recommendation:** This should just be:

```typescript
function getManifestFromString(manifestJson: string): ManifestResult {
  const manifest = JSON.parse(manifestJson);
  if (!isDbtRpcManifestResults({ manifest })) {
    throw new DbtError('Invalid manifest');
  }
  return { manifest, projectConfig: undefined };
}
```

No class, no dummy client, no adapter. One parse call.

### Warehouse catalog strategy

The current two-phase catalog strategy (try cache, fetch on miss) is actually
good. The main improvements are around when and how the cache is populated:

**Current problems:**
- Cache has no TTL — a stale catalog stays forever until a column is missing
- Cache stores the entire catalog as one JSONB blob per project — no partial updates
- First compile for a new project always fetches the full catalog

**Recommendations:**

1. **Add a TTL hint.** Store a `last_fetched_at` timestamp alongside the
   warehouse catalog. If it's older than e.g. 24 hours, proactively refresh
   before compile instead of waiting for a `MissingCatalogEntryError`. This
   catches column *type changes* (e.g., varchar→text) that don't cause a missing
   entry error but produce wrong dimension types.

2. **Incremental catalog updates.** When `MissingCatalogEntryError` fires, the
   current code fetches the catalog for ALL models and replaces the entire
   cache. Instead, fetch only the missing tables and merge them into the
   existing cache. This is faster for large projects where only one model
   changed.

3. **Pre-warm the cache on project creation.** When a project is first created
   and the dbt connection is configured, immediately fetch the warehouse
   catalog in the background. This way the first real compile hits the fast
   path.

### Memory considerations

For the Lightdash-specific compilation (Phase 2), everything is in-memory and
that's fine. The objects involved are:

| Object | Typical size | Notes |
|--------|-------------|-------|
| Parsed manifest | 10-200MB in memory | Largest object. Contains all nodes including macros/tests/sources that Lightdash doesn't use |
| Filtered models only | 1-20MB | After filtering to just `resource_type: 'model'` with `meta` |
| Warehouse catalog | 100-500KB | Just column names and types |
| Compiled explores | 2-30MB | Final output, stored in DB as JSONB |

**The manifest is the memory problem.** A 200MB manifest means 200MB+ of heap
allocation just for parsing. Since only the `nodes` (filtered to models) and
`metadata` are used, the rest (macros, tests, sources, exposures, docs) is
wasted memory.

**Recommendation:** When reading from disk, use a streaming parser to extract
only `nodes` and `metadata`. Or, if keeping the current approach, explicitly
null out unused keys after extraction:

```typescript
const { manifest } = await dbtClient.getDbtManifest();
const models = filterModels(manifest.nodes);
const metadata = manifest.metadata;
// Let GC reclaim the rest
manifest.nodes = {};
manifest.metrics = {};
manifest.docs = {};
```

### Proposed `compileManifestToExplores` function

This is the extracted Phase 2 — a pure function with no class, no lifecycle,
no disk, no network (except the optional catalog fetch on cache miss):

```typescript
type CompileOptions = {
  selector?: string;
  loadSources?: boolean;
  allowPartialCompilation?: boolean;
};

type CompileResult = {
  explores: (Explore | ExploreError)[];
  warehouseCatalog: WarehouseCatalog;  // updated catalog for cache write-back
};

async function compileManifestToExplores(
  manifest: DbtManifest,
  warehouseClient: WarehouseClient,
  cachedCatalog: WarehouseCatalog | undefined,
  lightdashProjectConfig: LightdashProjectConfig,
  options: CompileOptions = {},
): Promise<CompileResult> {
  // 1. Validate adapter
  if (!isSupportedDbtAdapter(manifest.metadata)) {
    throw new ParseError(`Unsupported adapter: ${manifest.metadata.adapter_type}`);
  }
  const adapterType = manifest.metadata.adapter_type;

  // 2. Extract and filter models
  const allNodes = Object.values(manifest.nodes);
  let models = allNodes.filter(n => n.resource_type === 'model' && n.meta) as DbtRawModelNode[];
  if (options.selector) {
    models = applySelector(models, options.selector);
  }
  if (models.length === 0) throw new NotFoundError('No models found');

  // 3. Validate
  const manifestVersion = getDbtManifestVersion(manifest);
  const [validModels, failedExplores] = validateModels(adapterType, models, manifestVersion);
  const metrics = validateMetrics(manifestVersion, manifest.metrics);

  // 4. Attach types (try cached, fetch on miss)
  let catalog = cachedCatalog;
  let typedModels: DbtModelNode[];
  try {
    if (!catalog) throw new MissingCatalogEntryError('No cached catalog', {});
    typedModels = attachTypesToModels(validModels, catalog, true, adapterType !== 'snowflake');
  } catch (e) {
    if (!(e instanceof MissingCatalogEntryError)) throw e;
    const modelCatalog = getSchemaStructureFromDbtModels(validModels);
    catalog = await warehouseClient.getCatalog(modelCatalog);
    typedModels = attachTypesToModels(validModels, catalog, false, adapterType !== 'snowflake');
  }

  // 5. Convert
  const explores = await convertExplores(
    typedModels, options.loadSources ?? false, adapterType,
    metrics, warehouseClient, lightdashProjectConfig,
    warehouseClient.credentials.type === 'snowflake' &&
      warehouseClient.credentials.disableTimestampConversion === true,
    options.allowPartialCompilation ?? false,
  );

  return {
    explores: [...explores, ...failedExplores],
    warehouseCatalog: catalog ?? {},
  };
}
```

This function is ~50 lines and replaces the 380-line `DbtBaseProjectAdapter`
class. It's testable (pass in a mock warehouseClient and a manifest fixture),
composable (call it from anywhere), and has no resource management concerns.

---

## Webhook-Driven Model

### Current state
- Users maintain GitHub Actions running `lightdash deploy` after merge to main
- GitHub App infrastructure exists with webhook secret configured
- dbt Cloud webhooks already work (POST /api/v1/projects/{projectUuid}/dbt-cloud/webhook)

### What's missing
A `push` event handler:

```
GitHub push event (merge to main)
  → POST /api/v1/github/webhook
  → Match event to project(s) using that repo+branch
  → Queue compilation job
  → Clone, compile, cache explores
```

With simplified architecture this becomes:
1. `getManifestFromGitRepo(config)` → manifest
2. `compileManifestToExplores(manifest, warehouse, cache)` → explores
3. `saveExploresToCacheAndIndexCatalog(explores)` → done

### Alternative: First-party GitHub Action
Package `lightdash deploy` as `lightdash/deploy-action@v1` — a one-line CI
integration that compiles in the user's environment and pushes via the existing
PUT /explores API. Lightdash never needs dbt installed server-side.

---

## Recommendation

| Approach | Effort | Impact |
|----------|--------|--------|
| Replace hierarchy with functions | Medium | -400 lines, testable |
| Add GitHub webhook handler | Medium | No CI config needed |
| First-party GitHub Action | Low | Best UX for CI users |
| Persistent clone dir per project | Low | Saves 3-30s on repeat compiles |
| Enable dbt partial parse | Low | Saves 5-25s on repeat compiles |
| Streaming manifest parse | Medium | Fixes memory for large projects |
| Catalog TTL + incremental updates | Low | Catches type changes, faster refreshes |
| Deprecate server-side compilation | High | Eliminates adapter layer |

Start with **function extraction + webhook handler**. The function extraction
(extracting `compileManifestToExplores` and the manifest source functions) is
the enabler for everything else — it makes the webhook handler simple to build,
makes the code testable, and creates a clear path toward deprecating the class
hierarchy.

For performance, the highest-impact changes are **persistent clone directories**
and **enabling partial parse** — together they can cut repeat compile times from
60s+ to under 10s. These are independent of the architectural refactor and could
be done first.
