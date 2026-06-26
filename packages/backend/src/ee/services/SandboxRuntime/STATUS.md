# Sandbox Runtime — Implementation Status

> Companion to [`DESIGN.md`](./DESIGN.md). Tracks what is actually built on
> branch `claude/e2b-abstraction-research-2yqno9` vs. what the design calls for.
>
> Last updated: 2026-06-25 · Commits: `b92777baf6` (design), `b96e6db930` (wip impl)

## TL;DR

Phase 0 is **done**. The interface (now including `git`), both providers
(E2B + local Docker), the config flags, and **both feature migrations**
(`AppGenerateService` and `AiWritebackService`) are complete and typecheck.
Writeback has been verified end-to-end on the Docker provider — a real PR was
opened against the connected dbt repo from a local `lightdash-ai-writeback:local`
container (clone → agent edit → `lightdash compile` → signed commit → PR).

Shipping is low-risk: `SANDBOX_PROVIDER` defaults to `e2b` (unchanged behavior),
and the Docker provider refuses to start when `NODE_ENV=production`. The only
thing live in prod is a **no-behavior-change refactor** of the AppGenerate +
writeback E2B paths through the new shim.

---

## Phase 0 — interface + local Docker provider

| Item                                                                                                   | Status       | Where                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `SandboxProvider` / `SandboxHandle` / `commands` / `files` interfaces                                  | ✅ Done      | `types.ts`                                                                                                                                |
| `SandboxCapabilities` + `SandboxSpec`                                                                  | ✅ Done      | `types.ts`                                                                                                                                |
| Normalized errors `SandboxCommandError` / `SandboxTimeoutError`                                        | ✅ Done      | `errors.ts`                                                                                                                               |
| **E2B provider** (near-1:1 passthrough; lifecycle/network/timeout replicated)                          | ✅ Done      | `E2bSandboxProvider.ts`                                                                                                                   |
| **Docker provider** (dockerode control plane, `exec` data plane, file r/w/remove, stdout/stderr demux) | ✅ Done      | `DockerSandboxProvider.ts`                                                                                                                |
| Docker provider prod safety-gate (`NODE_ENV=production` ⇒ throw)                                       | ✅ Done      | `DockerSandboxProvider.ts`                                                                                                                |
| Provider factory + `SANDBOX_PROVIDER` selection (default `e2b`)                                        | ✅ Done      | `index.ts`, `parseConfig.ts`                                                                                                              |
| Config: `appRuntime.sandboxProvider`, `appRuntime.sandboxDockerImage`                                  | ✅ Done      | `parseConfig.ts`, `lightdashConfig.mock.ts`                                                                                               |
| `dockerode` + `@types/dockerode` deps                                                                  | ✅ Done      | `packages/backend/package.json`                                                                                                           |
| Local image build script + example dbt project                                                         | ✅ Done      | `sandboxes/data-apps/build-local-image.sh`, `examples/empty-lightdash-project/`                                                           |
| **`AppGenerateService` migrated** off concrete `e2b.Sandbox` → `SandboxHandle`                         | ✅ Done      | `AppGenerateService.ts`, `designSandboxCopy.ts`                                                                                           |
| Backend typecheck passes                                                                               | ✅ Done      | —                                                                                                                                         |
| **`AiWritebackService` migrated** off `e2b`                                                            | ✅ Done      | `AiWritebackService.ts` (provider factory + `SandboxHandle`, normalized errors)                                                           |
| **Git-provider strategy migrated** (takes `SandboxHandle`, not `Sandbox`)                              | ✅ Done      | `providers/GitProvider.ts`, `GithubProvider.ts`, `GitlabProvider.ts`, `sandboxGit.ts`                                                     |
| **`git` in the `SandboxHandle` interface** (`SandboxGit`)                                              | ✅ Done      | `types.ts` — `clone`/`status`/`createBranch`/`add`/`commit`/`push`                                                                        |
| Docker provider git support                                                                            | ✅ Done      | `DockerSandboxProvider.ts` — git over `commands.run`; HTTPS auth via per-call `http.extraHeader` (never persisted)                        |
| Separate Docker image for writeback (`SANDBOX_AI_WRITEBACK_DOCKER_IMAGE`)                              | ✅ Done      | `parseConfig.ts` — decoupled from the data-app image, mirroring the split E2B template                                                    |
| Docker socket access from the backend                                                                  | ✅ Confirmed | backend runs via pm2 on the host; default `new Docker()` socket reaches the daemon (verified — no compose mount needed in this dev setup) |
| Tests for providers / errors / factory                                                                 | ❌ None      | no `*.test.ts` in this folder                                                                                                             |
| End-to-end proof the Docker path runs                                                                  | ✅ Verified  | see "Verification" below — 15/15 checks against the real `lightdash-sandbox:local` image                                                  |

### Verification (2026-06-25)

The `DockerSandboxProvider` was exercised end-to-end against the real
`lightdash-sandbox:local` image (2.3GB, built from `e2b.Dockerfile`) via a
throwaway script driving the compiled provider — **15/15 checks passed**:

- `capabilities` shape (container / no-pause / no-egress / objectstore)
- `create` returns a sandboxId; container starts
- `commands.run`: stdout/stderr **demuxed separately**, exit 0; `cwd` honored;
  per-command `envs` and spec-level `envs` both reach the process; `onStdout`
  streaming fires
- non-zero exit ⇒ `SandboxCommandError` (correct `exitCode` + `stderr`)
- timeout ⇒ `SandboxTimeoutError`
- `files.write` (auto-creates nested dirs) + `read` text round-trip
- `files.write` + `readBytes` **binary** round-trip (bytes preserved exactly)
- `files.remove`
- `pause()` no-op resolves
- `connect()` re-attaches by id with filesystem state preserved
- `destroy()` removes the container; second `destroy()` on a missing id is a no-op

### Writeback verification (2026-06-25)

Writeback was driven end-to-end through the **Docker provider** against the
local `lightdash-ai-writeback:local` image (built from
`sandboxes/ai-writeback/e2b.Dockerfile` via `build-local-image.sh`), via the
real `POST /ai-writeback` endpoint on the connected dbt repo:

- `create` launched the container; `git.clone` cloned the repo over HTTPS with
  the per-call `http.extraHeader` token (~1.3s)
- repo-context gather + credential-free profiles staged
- the Claude agent ran (Read/Edit/Bash, 5 turns) and `lightdash compile`
  succeeded inside the container (1 run, 0 failures) — proving the dbt venvs +
  Lightdash CLI work
- `git.add`/`git.commit` (local) staged the change; the signed commit + PR were
  created via the GitHub API → **PR opened**, `exitCode 0`, `+1/-1`
- one-shot teardown: `provider.destroy` removed the container

The E2B path was confirmed to route identically through `E2bSandboxProvider`
(same `create` call, same template-resolution) — a faithful passthrough. A full
E2B end-to-end run is blocked only by the `lightdash-ai-writeback` template not
being published on the dev E2B account (infra, not code).

### Phase 0 remaining work

1. Unit tests: error mapping, factory selection/validation, Docker exec
   collect/demux + git command construction, E2B shim option mapping. (The
   abstraction is covered indirectly by `AiWritebackService.test.ts`, which now
   drives a fake `SandboxProvider`.)

---

## Phase 1 — persistence / multi-turn

**Status: ❌ Not started.** Explicitly out of scope for this branch.

- No `PersistentWorkspace` type, no `persist`/`resume` on the provider/Manager.
- Docker `pause()` is a deliberate no-op (container left running) — there is no
  tar→S3 snapshot/restore, so a destroyed Docker container loses agent state.
- AppGenerate's own S3 source-restore (`restoreSourceFromS3`) is app-level logic
  and still works; it is **not** the provider persistence layer the design describes.

---

## Phase 2 — Manager hardening

**Status: ❌ Not started.** The design's headline "Layer 1 — Sandbox Manager"
does not exist. Feature code talks to a `SandboxProvider` directly.

Missing: registry table, reaper (Graphile cron), capacity caps, leases
(JetStream KV), live log fan-out (NATS), crash-recovery re-adopt, warm pools.

---

## Phase 3 — real providers (GKE / ECS / microsandbox)

**Status: ❌ Not started.** Designed for in §5.4 / §5.5; no implementation.

---

## What hits prod if this ships

- **Default path unchanged.** `SANDBOX_PROVIDER` defaults to `e2b`; the Docker
  provider cannot activate in prod (`NODE_ENV=production` throws).
- **Live surface = AppGenerate E2B refactor** routed through the shim. Review for
  parity, especially:
    - **Missing-E2B-key error moved stages.** Previously validated upfront in the
      config `try/catch` (failure categorized `'config'`); now surfaces later in the
      `sandbox` stage. Still handled, different analytics category.
      (`AppGenerateService.ts` ~line 2381)
    - Error branching changed `CommandExitError` → `SandboxCommandError`. Only
      `commands.run` is wrapped by the shim; all AppGenerate catches are around
      `commands.run`, so this is consistent.
    - `files.read(…,{format:'bytes'})` → `readBytes`; ArrayBuffer slicing moved
      into the provider. Faithful.
- **Writeback E2B refactor** also routed through the shim. The lifecycle now goes
  through the provider factory: `Sandbox.create/connect` → `provider.create/connect`,
  `sandbox.kill()` → `provider.destroy(sandboxId)`, and the `git`/`commands`/`files`
  surfaces go through `SandboxHandle`. E2B is a near-1:1 passthrough (git included),
  so the hosted path is unchanged; the missing-E2B-key error now surfaces from the
  factory rather than a local getter (same `MissingConfigError`).

## PR split (this stack)

Shipped as a Graphite stack on top of `main`:

1. **`sandbox-runtime-refactor`** (PR 1, no behaviour change) — interfaces, errors,
   capability discovery, E2bSandboxProvider, the `SANDBOX_PROVIDER` config flag
   (defaults to `e2b`), and AppGenerateService migrated off the concrete
   `e2b.Sandbox` type. The factory only knows `e2b`; anything else throws.
2. **`sandbox-runtime-docker-provider`** (PR 2, stacked) — DockerSandboxProvider,
   the `docker` case in the factory, `dockerode` dependency, the local image
   build script, and this status doc.

3. **`sandbox-runtime-writeback-git`** (PR 3, stacked) — the `git` member on
   `SandboxHandle` (`SandboxGit`) implemented on both providers, the
   `AiWritebackService` + git-provider migration off `e2b`, the dedicated
   `SANDBOX_AI_WRITEBACK_DOCKER_IMAGE` config + `sandboxes/ai-writeback/build-local-image.sh`.

Still future (separate efforts, not in this stack):

4. Phases 1–3 (persistence, Manager, real GKE/ECS providers) as separate efforts.
