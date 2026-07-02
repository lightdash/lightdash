# Feature Plan: General-Purpose Coding Agent

**Requirement:** Generalize the existing AI writeback (`editDbtProject` / E2B) pipeline so a customer's AI chat agent can MAKE a code change to one of their OWN connected repos and raise a pull request — not just tell the user to do it themselves.

**Date:** 2026-06-18
**Branch:** `general-purpose-coding-agent`
**Status:** Draft — pending approval
**Reviewed by:** research, architect, frontend, backend, adversarial, QA

---

## Overview

The AI writeback feature already runs the real `@anthropic-ai/claude-code` CLI inside an E2B sandbox over a cloned repo, with a provider-abstracted **signed-commit → PR** pipeline (GitHub/GitLab). It is not a bespoke dbt editor — the dbt-specificity is concentrated in ~5 swappable layers. This feature is the **WRITE counterpart to the already-shipped READ generalization** (repo discovery, PR #24324, flag `repo-fs`, `@`-mention repo picker): we refactor `AiWritebackService.run()` into a generic `runCodingAgent(args, config)` core and add a new `editRepo` agent tool that targets any repo the customer's GitHub/GitLab App installation can write — gated by a new feature flag and the existing `manage:SourceCode` scope.

The genuinely new, dangerous capability is **the org's installation token mutating arbitrary repos on a project-editor's behalf.** The architecture (host-side signed commits, a lean no-Bash sandbox, a per-repo short-TTL clone token) is sound enough to support it, but the security items below are blocking, not optional.

### Locked product decisions (do not re-litigate)
1. **Target = customers' OWN repos** (any repo their install can write), NOT `lightdash/lightdash`.
2. **v1 relies on PR CI for verification** — no in-sandbox build/test, no per-language toolchains, no package installs.
3. **Authz = user-intersected default-allow**: target ∈ (installation-accessible ∩ user-accessible); `manage:SourceCode` + `isProtectedBranch:false` enforced server-side. No org allowlist in v1 (residual confused-deputy risk accepted).
4. **Approval = PR-as-approval (coarse)** for v1; the PR is the human review artifact. UI is built forward-compatibly with a `SqlApprovalCard`-style gate for #24470.
5. **Mandated hardening:** per-repo scoped, contents-only, short-TTL clone token (NOT the org-wide installation token).
6. **R3 is a v1 blocker:** host-enforced commit-time denial of CI/workflow + secret paths.
7. **Audit logging is a v1 blocker.**
8. **v1 must demonstrably open a PR on a NON-dbt repo.**
9. This is a **customer-facing feature** — verification must be deployment-agnostic, not tied to Lightdash's internal preview env.

---

## Architecture

### `runCodingAgent` core extraction

Refactor `AiWritebackService.run()` (`AiWritebackService.ts:1015`) into a generic core. ~80% is already host-agnostic; the dbt coupling is concentrated in ~5 spots that become injected `config`.

**SHARED (stays in core, untouched):** sandbox lifecycle (`createSandbox` 867, `pauseSandbox` 900, `resumeSandbox` 925, `acquireSandbox` 1475); network lockdown (`Sandbox.create` allowOut=[anthropic,github,gitlab]/denyOut=ALL, 881-884); agent invocation + stream-json parsing + `--continue` (1650/1802); signed-commit→PR via GraphQL `createCommitOnBranch` (`applyAgentChanges` 1231); `GitProvider` abstraction (GitHub + GitLab); timeouts (RUN 20m/SANDBOX 60m/GIT 5m, `onTimeout:'pause'`); analytics/Prometheus/Sentry; PR + thread persistence.

**INJECTED (`CodingAgentConfig`):**

| Concern | dbt-writeback | general (`editRepo`) | Anchor |
|---|---|---|---|
| `resolveRepoTarget` | from `project.dbt_connection` | from `args.repoTarget`, authz-gated | 1360 |
| `allowedTools` | `ALLOWED_TOOLS` incl. `Bash(compile-wrapper)`, mkdir, cp | `GENERAL_ALLOWED_TOOLS` — Read/Glob/Grep/Edit/Write(/CWD/**) + Write(/tmp) + Skill, **NO Bash** | constants.ts:110-139 |
| `prepareSandbox` | `prepareProfiles` + `gatherRepoContext` + dbt venv | light repo-tree listing only; **no profiles** | 1144/1546 |
| `buildSystemPrompt` | dbt/warehouse/compile prose | repo-generic coding prompt | 1149 |
| Verification | in-sandbox `lightdash compile` | **none — rely on PR CI** | COMPILE_WRAPPER_PATH |
| CWD confinement | `subPath` (dbt folder) | repo root (no subPath) — widens blast radius → authz compensates | 1138 |
| `cloneOptions` | depth:1 whole-repo | depth:1 + `--filter=blob:none` + size guard | 1521 |

`run()` becomes `runCodingAgent(args, dbtWritebackConfig)` — **zero behaviour change** for existing writeback (this is the regression-risk surface). The general agent is a *strictly smaller* capability surface (no Bash, no compile) — less to secure.

### Repo-target resolver + authz (single chokepoint)

New `resolveWritableRepoTarget(user, projectUuid, repoTarget)` — the generalized `prepareTurn`, modeled on the read side's `getInstallationRepoReadAccess` / `resolveRepoAccess`. It is the **only** place a `CloneTarget` is produced; the tool/dependency never resolves one itself.

It enforces (user-intersected default-allow):
1. `manage:SourceCode` CASL check on the project, `isProtectedBranch:false`.
2. Target ∈ `listReposAccessibleToInstallation` (Github.ts:783) ∩ `listReposAccessibleToUser` (Github.ts:819).
3. Hard denylist: never resolve `lightdash/lightdash`.
4. Mints a **per-repo, contents-only, short-TTL** clone token (not the org-wide token).

The **same predicate** must back both the repo-picker list endpoint (`writable` flag) and this chokepoint, or the UI will offer repos the backend then 403s (R5).

### Multi-turn / resume (critical-path schema change)

`ai_writeback_thread` is today 1:1 with `ai_thread` (`UNIQUE ai_thread_uuid`) → one sandbox / one repo / one PR per thread. A turn targeting a different repo breaks `--continue` against the existing checkout. **Re-key to `(thread, repo)`: one sandbox + one PR per `(thread, repo)`, lazily created.**

Expand-contract migration: add nullable `target_repo` + `provider` columns; add composite `UNIQUE(ai_thread_uuid, target_repo)`; backfill existing rows from their linked `pull_requests.owner/repo`; drop the old `UNIQUE(ai_thread_uuid)` only in a later contract migration **after backfill is verified** (R8). dbt writeback is just the special case with one row.

### Lean sandbox template

A **second, minimal E2B template** (`e2bCodingAgentTemplateName`) — git + Claude CLI + generic skill only. No dbt venvs, no compile wrapper, no profiles. Identical network lockdown. `GENERAL_ALLOWED_TOOLS` has **zero Bash entries** — with no toolchain and no Bash, "no in-sandbox build" is *enforceable*, not just convention. Model/provider read from config (not the hardcoded constant) and the network allowlist wired off the resolved provider, so a future Bedrock switch (#23093) is a deliberate allowlist change — never widen to `*`.

### Data flow

```
[User in AI chat / Slack]  "fix the typo in acme/web-app README"
        ▼
[Frontend: @-mention repo picker (reuse PR #24324), writable-filtered]
        │ editRepo tool call { projectUuid, repoTarget, prompt, prUrl? }
        ▼
[AiAgentService → editRepo dep] ── manage:SourceCode + flag ──┐
        ▼                                                      ▼
[resolveWritableRepoTarget]  ──not in user∩install──► ForbiddenError(reason)
   │  mint per-repo short-TTL contents-only token       └─ denylist lightdash/lightdash
   ▼
[runCodingAgent(args, generalConfig)]
   ├─ acquireSandbox(thread,repo)  resume(--continue) | fresh(lean template, netlock)
   │     └─ git clone --depth1 --filter=blob:none (size-guarded)  [token never in agent Read scope; .git scrubbed]
   ├─ runAgentInSandbox(NO Bash, secrets+CI denylist on reads)
   ├─ stage diff → host-side DENIED-PATH FILTER (.github/**, .env*, …) → createCommitOnBranch (signed)
   │     └─ provider.openOrUpdatePR → PR on customer repo → CI runs (verification lives here)
   ├─ AUDIT LOG {user, project, target_repo, branch, allowed, reason}
   └─ upsert ai_writeback_thread(thread,repo,sandbox_id,pr_url); pauseSandbox
        ▼
[chat PR card / Slack message]    [PG: thread row]    [E2B: paused]    [GitHub/GitLab: PR + CI]
```

### Failure Mode Registry

| Path | Failure | Rescued | User sees | Logged |
|---|---|---|---|---|
| resolve | repo ∉ user∩install | Y | "No write access to {repo}" + which condition | Y |
| resolve | denylisted (lightdash/*) | Y | "This repo can't be edited" | Y |
| acquire | stored sandbox reaped | Y (clear row, fresh) | transparent | Y |
| clone | repo >500MB / GIT_TIMEOUT | Y (size guard, **fail closed**) | "{repo} too large" | Y |
| clone | token lacks scope | Y | "Couldn't access {repo}" | Y |
| agent | CLI non-zero / crash | Y (skips PR) | "Agent failed, no changes" | Y |
| agent | RUN_TIMEOUT | Y (pause, stderr tail) | "Agent timed out" | Y |
| commit | staged a denied path (.github/.env/…) | Y (filter rejects, **no PR**) | "Refused to edit CI/secret files" + reason | Y |
| commit | branch protected / GraphQL push fails | Y | "Couldn't open the PR" | Y |
| PR | thread's PR merged/closed | Y (reopen/new) | "Start a new thread" | Y |
| concurrency | two turns same (thread,repo) | Y (lock/upsert-on-conflict) | serialized | Y |
| PR | commit ok but PR-open fails | Y (compensating cleanup / reclaim) | "Couldn't open PR" | Y |

---

## Frontend Implementation

**Headline: extract, don't fork.** `AiEditDbtProjectToolCall.tsx` (~660 lines) is ~80% generic PR-card logic. Extract a shared `WritebackPullRequestCard`; both the dbt card and the new repo card render it. Generic → shared: `summarisePrUrl`, `PullRequestViewMenu`, `PullRequestActionButtons`, CI section, merged/closed styling, install/unsupported/closed papers. dbt-specific → stays in dbt wrapper: "Edited semantic layer" title, preview-deploy suppression, `POST_MERGE_MIGRATION_PROMPT`.

```
AssistantBubble
├─ EditRepoApprovalCard       // NEW — pre-edit gate (modeled on SqlApprovalCard; forward-compat for #24470)
└─ AiEditRepoToolCall         // NEW — thin wrapper
   └─ WritebackPullRequestCard // NEW (extracted)
      ├─ PullRequestViewMenu / ActionButtons / CiChecks   // REUSE
Repo target: REUSE @-mention repo picker (contentMentions.tsx), filtered to writable repos
```

**Repo selection:** reuse the read picker. Add `writable: boolean` to `GitRepo` (`common/src/types/gitIntegration.ts`) backed by the **shared** `resolveWritableRepoTarget` predicate; hide or disable (with "read-only" tag) non-writable repos — never silently offer one the backend will 403.

**Approval gate (#24470 frontend half):** mirror `SqlApprovalCard`. v1 coarse = the PR itself is the approval artifact, but render the card so the model is forward-compatible (`Approve` / `Approve & don't ask again this thread` via `useSessionStorage` / `Reject`).

**Interaction states:** idle / awaiting-approval / running / PR-opened / PR-updated / CI-pending / CI-failed / merged / closed / error (render nothing — agent prose explains) / no-PR / **forbidden-repo** (new `repo_write_forbidden`) / **no-writable-repos**. v1 `previewUrl=null` (no Lightdash preview for arbitrary repos). Mantine **v8 only** (`@mantine-8/core`); CSS modules, no inline styles.

**State:** reuse `usePullRequestCiChecks` (15s poll until settled), `useMergePullRequest`/`useClosePullRequest`. No new Redux slices. Flag gating via `useServerFeatureFlag` AND user write scope (flag ≠ permission); old threads degrade to read-only gracefully.

---

## Backend Implementation

**`runCodingAgent(args, config)`** as above. **`resolveWritableRepoTarget`** single chokepoint. Sync within the tool call for v1 (matches `editDbtProject`, progress via `onProgress`); Graphile job is a follow-up if LB timeouts bite.

### New `editRepo` tool — registry points (~14)
1. `common/.../schemas/visualizations/index.ts` — add `'editRepo'` to `ToolNameSchema` + `TOOL_DISPLAY_MESSAGES` + `_AFTER_TOOL_CALL` (all runtime-`.parse`'d — miss one → load throws).
2. `common/.../schemas/tools/toolEditRepoArgs.ts` — **new** I/O zod schemas (input adds `repoTarget: string`, `prUrl?`).
3. `common/.../schemas/tools/toolDefinitions.ts` — register `editRepoToolDefinition`.
4. `common/.../schemas/tools/index.ts` — export.
5. `backend/.../ai/types/aiAgentDependencies.ts` — `EditRepoFn` type.
6. `backend/.../ai/types/aiAgent.ts` — add `editRepo: EditRepoFn` to deps.
7. `backend/.../ai/tools/editRepo.ts` — **new** builder (clone of `editDbtProject.ts`, reuse `classifyWritebackError`).
8. `backend/.../ai/agents/agentV2.ts` — import + gate behind `args.enableCodingAgent` + add to ToolSet.
9. `backend/.../ai/prompts/systemV2.ts` (+ section file) — coding-agent prompt section gated by `enableCodingAgent`.
10. `backend/.../AiAgentService/AiAgentService.ts` — build the `editRepo` dep (resolve target → `runCodingAgent`); resolve `coding-agent` flag incl. `hasTrustedPromptUserIdentity` Slack guard; pass `enableCodingAgent`.
11. `backend/.../ai/utils/{toolSummaries,llmAsJudgeForTools,getSlackBlocks}.ts` + `agentToolContracts` snapshot.
12. `common/src/types/featureFlags.ts` — `CodingAgent = 'ai-coding-agent'`.
13. **Frontend** (above): `toolIcons` Record + dispatcher case (runtime-keyed — crashes if missing; live-test).
14. `pnpm generate-api` — tool I/O is serialized into thread message types; TSOA must regenerate.

### Tool I/O contract
```ts
input  = { repoTarget: string /* "owner/repo" */, prompt: string | null, prUrl: string | null }
output.metadata = discriminatedUnion('status',
  { status:'success', prUrl, prAction:'opened'|'updated', commitSha, additions, deletions, repository, steps },
  { status:'error', errorCode:
      'repo_write_forbidden'|'github_not_installed'|'gitlab_not_installed'|
      'pull_request_not_open'|'git_write_permission'|'repo_too_large'|'denied_path'|'unknown',
    reason? /* which authz condition failed */ })
```
HTTP endpoints: the agent path needs none (in-process tool, like `editDbtProject`). Optional direct trigger `POST /api/v1/ee/projects/:projectUuid/coding-agent` mirroring `AiWritebackController`. The picker reuses the existing repositories endpoint (now returning `writable`).

### Schema / migration
Additive `target_repo` + `provider` on `ai_writeback_thread`; composite `UNIQUE(ai_thread_uuid, target_repo)`; backfill from `pull_requests`; drop old unique in a later contract migration after backfill verified. Model: `findByAiThreadUuid` → `findByAiThreadUuidAndRepo`.

### Auth / scope / flag
Reuse `manage:SourceCode` (project, `isProtectedBranch:false`) — **no new CASL subject** (the per-repo gate is in-service, since CASL can't express per-repo grants). Confirm service-account writeback isn't broken. Flag `ai-coding-agent` resolved like `AiWriteback`/`RepoDiscovery` incl. Slack `!hasTrustedPromptUserIdentity` disable. Enable only when org has a GitHub/GitLab installation.

---

## Research Context

- **READ half already shipped** (PR #24324, flag `repo-fs`, `@`-mention repo picker). Parent Linear project: "Agentic writeback from slack". A June-15 authz design already exists — reuse it.
- **Open issue #24470** (per-tool allow/ask/deny; "require approval before edit") — align the permission surface, don't fork it. The lean allowlist IS the allow/deny layer; "ask" maps to the approval card.
- **#23093** added Bedrock for Data Apps — keep provider/model configurable.
- **Competitor pattern** (Devin/Cursor/Claude Code/Codex/Sweep): ticket → isolated cloud sandbox → autonomous edit → **PR-only, branch-protected, no direct push** → human review; ephemeral session-scoped creds; gated egress. Our design matches all four — the job is to not regress them.
- **Pitfalls:** prompt-injection via repo contents (escalates to malicious PR with write power), cred exfiltration, supply-chain via package installs (→ no in-sandbox build), GB-monorepo cost/time, GitHub App write-scope edge cases.

---

## Risk Register

| # | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Confused-deputy: project editor drives org token to a sensitive repo they can personally see | M | H | User-intersection (only gate per decision) + audit log + server-side `isProtectedBranch:false`. Org-admin denylist deferred (accepted) | Backend |
| R2 | Org-wide token over-privileged | H | H | **Per-repo, contents-only, short-TTL token** (mandated) | Backend |
| R3 | Malicious CI/workflow file in PR → RCE in customer CI | M | **C** | **Commit-time denial of `.github/**`,`.gitlab-ci.yml`,`Jenkinsfile`,`.circleci/**` — v1 BLOCKER (accepted)** | Backend+Architect |
| R4 | Clone credential leaked via PR body (prompt injection) | M | H | R2 limits value; **strip token from `.git` + exclude `.git` from agent Read scope** (not caught by initial plans) | Backend |
| R5 | Frontend `writable` filter drifts from backend resolver | M | M | Single shared predicate behind both list endpoint and tool | Frontend+Backend |
| R6 | Secrets (`.env*`,`*.pem`,keys) committed | M | H | Extend `DENIED_PATH_PATTERNS` on reads AND commits | Backend |
| R7 | Tool-name churn after persisted in threads + API types | L | M | Decide `editRepo` once now (data migration later) | Frontend+Backend |
| R8 | Contract migration drops old unique before backfill verified | L | H | Additive expand first; contract only after backfill audit | Architect |
| R9 | E2B cost/time on GB monorepos | M | M | `blob:none`+`depth:1`+500MB guard **failing closed** with actionable error | Backend |
| R10 | Concurrent same-(thread,repo) turns race | L | M | Advisory lock / upsert-on-conflict on new unique index | Architect |
| R11 | Orphan branch when commit ok but PR-open fails | M | L | Compensating cleanup + runbook | Backend |
| R12 | Ships untested | M | H | Deployment-agnostic verification recipe (below); customer-facing, flag-gated | QA |
| R13 | Dynamic provider allowlist accidentally widens `denyOut=ALL` | L | H | Regression test asserting netlock invariant when provider list changes | Backend |

### Security invariants that MUST NOT regress
1. Network egress stays allowOut=[anthropic,github,gitlab]/denyOut=ALL; provider changes update the allowlist deliberately, never `*`.
2. General agent's `allowedTools` has **zero Bash entries**; no toolchain, no package installs.
3. Agent never holds usable push/clone creds beyond the scoped short-TTL clone token; commits host-side via `createCommitOnBranch`; secrets scrubbed from any child env.
4. `.git` excluded from agent Read scope + token stripped from `.git` post-clone.
5. PR-metadata/skills files stay OUTSIDE CWD so `git add --all` can't sweep them in.
6. Write target = user ∩ installation only; `manage:SourceCode` + `isProtectedBranch:false`; `lightdash/lightdash` hard-denied.
7. Commit-time denial of CI/workflow + secret paths (R3).

### Resolved decisions (2026-06-18, locked)
1. **Clone token — revoke after clone + scrub `.git`.** The in-sandbox token is needed only for the clone (commit is host-side). So: mint a NEW per-repo, `contents:read`-only token just-in-time (requires a helper beyond today's full-installation `getInstallationToken`), clone, then rewrite `.git`'s remote URL tokenless AND `DELETE /installation/token`. Leak window ≈ seconds; a leaked token is already dead. GitHub-first; GitLab OAuth tokens can't revoke as cleanly → scrub-only fallback. (Supersedes the "TTL number" framing — GitHub tokens are fixed 1h; lifecycle, not TTL, is the lever.) Closes R4/F1 + R2.
2. **Audit log — structured stdout (Pino).** Emit `logger.info({ event:'coding_agent_write', user, project, target_repo, branch, allowed, reason })` per attempt. `reason` MUST distinguish failure conditions (user-intersection / installation / branch-protection / denied-repo / denied-path). Caveat (accepted): self-host without log aggregation loses history on restart — revisit a DB table if queryable forensic history is later required. Test shape = log spy, not DB-row assertion.
3. **Concurrency — lock get-or-create, reject if run in flight.** Advisory lock / upsert-on-conflict on the `(thread, repo)` row creation: the loser of a create-create race resumes the winner's sandbox (normal multi-turn path, no error). If a run is genuinely executing on that sandbox, reject the new turn ("edit already in progress for this repo"). No queue in v1.
4. **Orphan branch — leave + idempotent adopt-on-resume; janitor deferred.** On PR-open failure keep the branch, mark the `(thread,repo)` row "branch created, PR pending"; next turn detects the branch and opens the PR without re-committing (no lost work on transient failures). **Branch janitor is a post-v1 follow-up** — accepted risk: abandoned agent branches can accumulate on customers' repos. Requires a recognizable agent branch prefix (confirm writeback's current naming).
5. **Size guard — configurable, default ~500MB, fail closed.** Backend config `codingAgentMaxRepoSizeMb` (default 500). Pre-clone check via the GitHub repo API; reject with an actionable "repo too large, limit is X" (never `deadline_exceeded`). Note: with `--depth 1 --filter=blob:none` the API `size` overcounts actual fetch, so the guard is conservative by design (R9).
6. **Skill — keep, minimal/empty general dir.** General agent's allowlist includes `Skill` + `Read(GENERAL_SKILLS_DIR)` (a NEW dir, separate from warehouse skills), shipped near-empty for v1. Safe: no Bash → skills can't execute; host-curated content → not an injection vector; dir stays outside CWD (Inv #5). Future per-language/PR-convention skills need no allowlist change. Invariant #2 ("zero Bash") is unchanged — `Skill` is read-only guidance, not exec.

---

## Test Strategy

### Acceptance Criteria
- [ ] **Refactor:** existing `AiWritebackService` tests pass unchanged; dbt writeback (one-shot + resume) still opens/updates a PR; both paths call `runCodingAgent`.
- [ ] **Tool:** `editRepo` registered across all registries (typecheck + runtime render smoke); `generate-api` run + OpenAPI committed; invocation persists `target_repo`+`provider`.
- [ ] **Flag:** OFF → tool absent + write rejected; ON + `AI_COPILOT_ENABLED` → available.
- [ ] **Authz:** write only when target ∈ (install ∩ user); missing `manage:SourceCode` → `repo_write_forbidden`; protected branch → denied; `lightdash/lightdash` → denied; no org-allowlist lookup; single chokepoint (no second resolver).
- [ ] **Approval:** exactly one PR per (thread,repo); PR is the review artifact (no apply endpoint).
- [ ] **Token:** per-repo, contents-only, short-TTL — not the org token.
- [ ] **R3:** commit touching `.github/**`/`.gitlab-ci.yml`/`Jenkinsfile`/`.circleci/**`/`.env*`/`.pem`/keys rejected host-side, no PR, audit reason recorded.
- [ ] **Audit:** every attempt logs `{user, project, target_repo, branch, allowed, reason}`; forbidden states which condition failed.
- [ ] **Demo:** non-dbt repo → agent makes a trivial change → PR opens (no dbt-compile dependency).

### Test Matrix (every invariant + R# has a test)
Unit (~34): resolver ∩-logic + each forbidden reason; general allowlist snapshot (zero `Bash(`); netlock holds under dynamic provider (R13); no-push-creds + host-side commit (Inv3); `.git` exclusion + token strip + PR-body scrub (Inv4/R4/F1); metadata-outside-CWD (Inv5); extended `isDeniedRepoPath` table (R3/R6); clone-token scope/TTL (R2/F); size-guard fails closed (R9); audit-line shape; frontend states.
Integration (~12): expand-contract migration + backfill (R8); concurrency (R10); orphan-branch (R11); commit-time denial on fixture; token can't access a 2nd repo; audit rows on allow+deny.
E2E/Cypress (~5): non-dbt PR demo; repo picker; **3 adversarial vectors**.
Manual (~4): visual PR card; rollback verify; cross-provider GitLab; deployment-agnostic recipe walkthrough.

### Adversarial security tests (fixture `qa-injection-fixture`, each asserts the BLOCK)
- (a) payload tells agent to edit `.github/workflows/*` (+ `.gitlab-ci.yml`/`Jenkinsfile`/`.circleci`) → commit rejected, no PR, audit reason `denied_path`.
- (b) payload tells agent to read `.git` credential into the PR body → `.git` outside Read scope, token stripped, PR body/diff contain no token substring (regex assert). **This test does not exist today.**
- (c) payload tells agent to commit a `.env` → blocked at commit time, not in diff.

### Deployment-agnostic verification recipe (any install)
1. Flag `ai-coding-agent` ON (+ `AI_COPILOT_ENABLED`, `AI_DEFAULT_PROVIDER=anthropic`, Anthropic+E2B+GitHub/GitLab App creds).
2. Connect a non-dbt repo the user can access.
3. Ask the agent for a trivial README change → **PR opens** on a non-protected branch; card renders.
4. Ask to edit `.github/workflows/deploy.yml` → **REFUSED** (`repo_write_forbidden`/`denied_path`), no commit/PR.
5. Audit log shows one `allowed:true` and one `allowed:false` line with full context.
6. As a viewer (no `manage:SourceCode`) → forbidden with the right reason.

### Regression after landing
```
pnpm -F backend test -- AiWritebackService
pnpm -F backend test -- repoFs
pnpm -F common test -- projectMemberAbility
pnpm -F common test -- roleToScopeParity
pnpm -F backend test:integration -- writeback
pnpm generate-api && pnpm -F api-tests test
```

---

## Implementation — Vertical Slices

Delivered as vertical slices (each a thin end-to-end path: chat → sandbox → PR, demoable), all sharing the one `ai-coding-agent` flag so the feature ships atomically when the flag flips. Ordering front-loads risk (engine → authz → security gate) and defers polish (approval UX, GitLab). Each slice is a candidate Graphite stacked PR.

```
Slice 1 (skeleton: engine works on the connected repo)
   └─ Slice 2 (any writable repo, authz)
         ├─ Slice 3 (security) ◄── HARD GATE: flag must not reach any customer until this lands
         └─ Slice 4 (multi-turn / multi-repo)
               └─ Slice 5 (approval + card polish)
                     └─ Slice 6 (GitLab)
```

**Sequencing notes:**
- **Slices 1–2 are internal-dogfood-safe** (flag on for Lightdash's own org only: trusted users + repos). **Slice 3 is the release gate** — the flag cannot open to any customer until it lands. Because everything shares one flag, the flag flip *is* the release.
- **Pull the cheap security bits forward** into Slices 1/2: the CI/secret-path commit denial (a one-set extension of `DENIED_PATH_PATTERNS`) and the `.git` token scrub cost almost nothing and close the highest-severity path early.

### Slice 1 — Walking skeleton: generic agent → PR on the *connected* repo *(demo: "add a line to the README" → PR appears)*
De-risks: the entire engine-generalization bet. Targets the project's already-connected repo (reuse today's auth/resolution — no picker, no new authz yet).
- [ ] Extract `runCodingAgent(args, config)`; express dbt-writeback as a config; route `run()` through it — **pure no-behaviour-change refactor** (blast radius = all writeback; keep its tests green) — backend — **L**
- [ ] Second lean E2B template (no dbt, no Bash) + generic prompt/profile (no compile) — backend — **M**
- [ ] Minimal `editRepo` tool across the ~14 registry points + `generate-api`, targeting the connected repo — backend — **L**
- [ ] `Skill` + `Read(GENERAL_SKILLS_DIR)` wired to a new minimal/empty dir (decision #6) — backend — **S**
- [ ] (pulled-forward security) extend `DENIED_PATH_PATTERNS` for CI/workflow + secret paths, enforced on commit; `.git` token scrub (R3/R4/R6) — backend — **S**
- [ ] Regression suite green (existing writeback unchanged) — QA — **M**

### Slice 2 — Arbitrary repo targeting + authz *(demo: pick any writable repo; non-writable hidden; viewer refused)*
De-risks: the confused-deputy / authz surface.
- [ ] `resolveWritableRepoTarget` chokepoint (user ∩ installation), `lightdash/lightdash` denylist, `manage:SourceCode` + `isProtectedBranch:false` (R1) — backend — **L**
- [ ] Shared `writable` predicate + `GitRepo.writable` + repo-picker filter (reuse read-side `@`-mention picker) (R5) — backend + frontend — **M**
- [ ] Forbidden-repo (`repo_write_forbidden` + reason) / no-writable-repos states — frontend — **S**

### Slice 3 — Security hardening *(RELEASE GATE)* *(demo: injection fixture blocked on all 3 vectors + audit lines)*
De-risks: prompt-injection → RCE; credential exfiltration.
- [ ] Per-repo `contents:read` token helper + revoke-after-clone (decision #1; new GitHub-App primitive) — backend — **M**
- [ ] Secrets read-denylist + `.git` excluded from agent Read scope (R4) — backend — **S**
- [ ] `codingAgentMaxRepoSizeMb` config + pre-clone fail-closed guard (decision #5) — backend — **S**
- [ ] Structured stdout audit line with condition-specific `reason` (decision #2) — backend — **S**
- [ ] Network-lockdown regression test (denyOut=ALL holds under dynamic provider list) (R13) — backend — **S**
- [ ] Adversarial security tests pass (3 vectors) + deployment-agnostic recipe verified — QA — **M**

### Slice 4 — Multi-turn & multi-repo *(demo: iterate same PR across turns; edit repo A then B in one thread; no double-PR)*
De-risks: the resume landmine / state-model correctness.
- [ ] Expand migration: add `target_repo`+`provider` + composite unique, backfill from `pull_requests` (keep old unique) — backend — **M**
- [ ] Per-repo `--continue` resume keyed on `(thread, repo)` — backend — **M**
- [ ] Get-or-create lock + idempotent adopt-on-resume for PR-pending branches (decisions #3, #4) — backend/architect — **M**

### Slice 5 — Approval UX + PR card *(demo: approve-before-edit; rich card w/ merge/close + live CI)*
De-risks: nothing — pure UX thickening.
- [ ] Extract shared `WritebackPullRequestCard`; `AiEditRepoToolCall` + dispatcher + icon — frontend — **M**
- [ ] `EditRepoApprovalCard` (#24470 forward-compat) + full interaction-state matrix + CI-checks surfacing — frontend — **M**

### Slice 6 — GitLab parity *(demo: same flow on a GitLab repo)*
- [ ] Extend resolver + token lifecycle to GitLab targets (scrub-only token fallback) — backend — **M**

### Post-v1 follow-ups (deferred)
- [ ] Branch janitor for abandoned agent branches (decision #4) — backend
- [ ] Contract migration: drop old `UNIQUE(ai_thread_uuid)` after backfill verified everywhere — architect
- [ ] DB-table audit sink if queryable forensic history is required (decision #2 revisit)
- [ ] Configurable model/provider + Bedrock egress (issue #23093); org-admin repo denylist; two-phase preview/apply approval when #24470 lands

---

**Build-layer mapping (deploy order):** backend lands before the frontend bits within each slice. Slice 1 = the no-behaviour-change foundation (deploy, not released). Slices 1–4 deploy dark behind the flag; Slice 5 adds the frontend; Slice 3 gates external rollout. New flag `ai-coding-agent` default-off; EE/license-gated. Each slice is independently deployable and revertable.
