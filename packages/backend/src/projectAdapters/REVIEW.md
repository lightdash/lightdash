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

With simplified architecture this becomes two function calls:
1. `getManifestFromGitRepo(config)` → manifest
2. `compileManifestToExplores(manifest, warehouse, cache)` → explores

### Alternative: First-party GitHub Action
Package `lightdash deploy` as `lightdash/deploy-action@v1` — a one-line CI
integration that compiles in the user's environment and pushes via the existing
PUT /explores API. Lightdash never needs dbt installed server-side.

## Recommendation

| Approach | Effort | Impact |
|----------|--------|--------|
| Replace hierarchy with functions | Medium | -400 lines, testable |
| Add GitHub webhook handler | Medium | No CI config needed |
| First-party GitHub Action | Low | Best UX for CI users |
| Deprecate server-side compilation | High | Eliminates adapter layer |

Start with **webhook handler + simplified functions**. Keep server-side
compilation but make it much simpler. Offer webhook path so users don't need CI.
