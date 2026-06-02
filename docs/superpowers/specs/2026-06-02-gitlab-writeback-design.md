# GitLab writeback support (PROD-8073)

## Goal

Extend AI writeback — today GitHub-only — to also work against GitLab-backed dbt
projects. A writeback run on a GitLab project clones the repo into the sandbox,
runs the agent, and opens (or updates) a **merge request**, mirroring the GitHub
flow end to end (one-shot, conversational resume, and pasted-link adoption).

## Decisions

- **Base branch:** built on `main` after the AiWritebackService refactor (#23795)
  merged — the GitHub specifics are already isolated in `utils.ts` + named
  helpers.
- **Landing changes (GitLab):** `git commit` + `git push` over HTTPS from inside
  the sandbox, then open the MR via the API. GitHub keeps its signed
  `createCommitOnBranch` API path. GitLab commits are therefore **unsigned** —
  accepted; GitLab has no app-signing equivalent.
- **Auth (GitLab):** the org's GitLab app installation OAuth token
  (`gitlab_app_installations`: token + refresh + instance URL). Fails clearly
  when the org has not connected the GitLab app.
- **Hosts:** honor the connection / app-install instance URL, including
  self-hosted GitLab.
- **Structure:** the provider is resolved **once** into a strategy; the service
  never branches on provider type again. The only provider conditionals live in
  two pure functions (`getGitProvider` factory + `resolveGitConnection`).

## Architecture

### The single conditional → a strategy

```
getGitProvider(dbtConnection.type): GitProvider   // one switch, assertUnreachable
```

`GitProvider` is a strategy with one implementation per host. The service calls
`provider.*` and stays provider-agnostic:

```ts
type GitProvider = {
    readonly requestNoun: 'pull request' | 'merge request';
    resolveConnection(dbtConnection: DbtProjectConfig): GitConnection;
    resolveInstallation(organizationUuid: string): Promise<GitInstallation>;
    getCloneUrl(connection: GitConnection, auth: GitInstallation): string;
    landChanges(args: LandChangesArgs): Promise<void>;
    openRequest(args: OpenRequestArgs): Promise<string>;   // returns request URL
    updateRequest(args: UpdateRequestArgs): Promise<void>; // resume / adopted
    adoptRequest(args: AdoptRequestArgs): Promise<AdoptedRequest>;
};
```

- **`githubProvider`** wraps the existing path unchanged: app-install token +
  OAuth user identity, signed `createCommitOnBranch`, `pull/<n>` URLs.
- **`gitlabProvider`** resolves the app-install OAuth token + instance URL,
  clones `https://oauth2:<token>@<host>/owner/repo.git`, lands via in-sandbox
  `git commit && git push`, and opens/patches the MR via the Gitlab client.

### Pure, branch-free helpers (`utils.ts`)

- `resolveGitConnection(dbtConnection): GitConnection` — replaces
  `resolveGithubConnection`; the **only** place dbt-type → provider mapping
  happens. Returns a discriminated union:
  - `{ provider: 'github'; owner; repo; projectSubPath }`
  - `{ provider: 'gitlab'; owner; repo; projectSubPath; hostDomain }`
- `buildCloneUrl(connection, token)` — provider-aware HTTPS clone URL with the
  token as credentials (`x-access-token` for GitHub, `oauth2` for GitLab).
- `parseRequestNumber(url)` — PR/MR number from a `.../pull/<n>` or
  `.../merge_requests/<n>` URL.
- Existing identity/email + stream helpers are unchanged.

### Types (`types.ts`)

- `GitConnection` (discriminated union above) replaces `GithubConnection` in
  `TurnContext` and the provider signatures.
- `GitInstallation` (discriminated) replaces `GithubInstallation`: GitHub keeps
  `{ installationId, token, prToken, commitAuthor, coAuthorTrailer }`; GitLab
  carries `{ token, instanceUrl, commitAuthor }`.
- `AdoptedRequest` replaces `AdoptedPullRequest` (provider-neutral name).

### Service (`AiWritebackService.ts`)

- `prepareTurn` resolves `provider = getGitProvider(type)` and
  `connection = provider.resolveConnection(...)`; stores both on `TurnContext`.
- `getGithubInstallation` → `provider.resolveInstallation(orgUuid)`.
- `acquireSandbox` clones from `provider.getCloneUrl(...)`.
- `applyAgentChanges` calls `provider.landChanges` + `provider.openRequest` /
  `provider.updateRequest`; the adopt path calls `provider.adoptRequest`.
- New dependency: `gitlabAppInstallationsModel`.
- The agent run, repo-context gathering, PR-metadata extraction, and sandbox
  lifecycle are provider-independent and untouched.

### Gitlab client (`clients/gitlab/Gitlab.ts`)

- Reuse `createPullRequest` (opens MR), `getOrRefreshToken`, `getGitlabUser`.
- Add `updateMergeRequest` (title/description on resume) and a single-MR getter
  for adopt validation (state/source-project checks), mirroring GitHub's
  `updatePullRequest` / `getPullRequest`.

## Data flow (unchanged skeleton)

```
prepareTurn        flag + manage:SourceCode gate; provider = getGitProvider(type)
  → resolveInstallation (provider)        app-install token / OAuth, instance URL
  → acquireSandbox    clone provider.getCloneUrl(); resume reuses paused sandbox
  → runAgentInSandbox  (provider-independent)
  → applyAgentChanges
       landChanges   GH: staged-files → signed API commit
                     GL: git commit && git push from sandbox
       openRequest / updateRequest   PR vs MR
  → record in pull_requests with provider tag (GITHUB | GITLAB)
  → release sandbox (pause for resumable, else kill)
```

## Error handling

- No GitLab app installation for the org → `ForbiddenError` (same shape as the
  GitHub "App is not installed" error).
- Non-GitHub/GitLab dbt connection → `ParameterError` from
  `resolveGitConnection`.
- `git push` failure inside the sandbox surfaces through the existing stage
  error handling (stage = `push`), captured to Sentry with the stderr tail.
- Adopt: reject MRs in a different project, closed/merged MRs, and fork-sourced
  MRs — parity with the GitHub adopt checks.

## Testing

- **utils.test** — `resolveGitConnection` for both dbt types + invalid types,
  `buildCloneUrl` (GitHub vs GitLab, self-hosted host), `parseRequestNumber`
  (pull vs merge_requests URLs).
- **provider tests** — `gitlabProvider` with a mocked sandbox + Gitlab client:
  clone URL, land-changes issues `git push`, openRequest returns the MR URL,
  adopt validation rejects cross-project/closed/fork MRs.
- **service tests** — stay provider-agnostic: `getGitProvider` returns a fake
  provider; existing `applyAgentChanges` / `prepareTurn` / mocked `run()` tests
  extended with a GitLab connection case.

## Out of scope

- Signed/verified GitLab commits.
- Bitbucket / Azure DevOps writeback (separate dbt connection types).
- Any change to the GitHub behavior beyond the rename to provider-neutral types.
