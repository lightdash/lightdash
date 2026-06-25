# Sandbox Runtime — Design

> Status: **Design / RFC** · Branch: `claude/e2b-abstraction-research-2yqno9`
> Scope: backend EE (`AppGenerateService`, `AiWritebackService`)

## 1. What we're trying to do

Today, two EE features run AI agents (Claude Code) inside an **E2B** sandbox: data-app
generation (`AppGenerateService`) and AI writeback to dbt repos (`AiWritebackService`).
Both import the `e2b` SDK directly and pass the concrete `Sandbox` type through their
internal layers (e.g. the git-provider strategy takes `sandbox: Sandbox`). E2B is a great
hosted product, but it is an **external dependency**: it requires an API key, sends code
and repository contents to a third party, and can't be self-hosted.

**Goal:** introduce a thin abstraction so the application code depends on a
provider-neutral interface instead of the `e2b` package, and so the _same_ feature code
runs on top of whichever sandbox backend an operator has available:

| Environment                             | Realistic backend                                    | Isolation                     |
| --------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| **Local dev (laptop / Docker Compose)** | **plain Docker container** (this doc's first target) | container (`runc`) — dev only |
| Self-hosted VM                          | microsandbox (`msbserver`) if KVM, else Docker       | microVM → container           |
| GCP **GKE**                             | GKE Agent Sandbox (gVisor + warm pool)               | gVisor                        |
| AWS **ECS**                             | Fargate task per sandbox (Firecracker)               | microVM                       |
| Managed default                         | **E2B** (unchanged)                                  | microVM                       |

This is explicitly a **multi-architecture** abstraction. But we are **not** building all
providers at once. The first deliverable is the interface plus a **local Docker provider**,
because it lets us exercise the whole abstraction on a MacBook with zero external services,
and it forces the interface to be honest about a backend that has _none_ of E2B's
conveniences (no native pause, no built-in agent, no egress allowlist).

### Non-goals (for now)

- Production-grade isolation in the local provider (it's a testbed; `runc` + Docker socket
  is root-equivalent on the host — gated to non-production only).
- Building the GKE / ECS / microsandbox providers (designed for here, implemented later).
- Replacing E2B's in-memory pause with a true memory snapshot. We replace it with
  **filesystem persistence + agent resume** (see §6), which is sufficient for multi-turn.

## 2. How E2B is used today (the surface we must cover)

Reverse-engineered from `AppGenerateService` and `AiWritebackService`:

- **Lifecycle (static):** `Sandbox.create(templateRef, opts)`, `Sandbox.connect(id, opts)`,
  `Sandbox.kill(id, opts)`; instance `sandbox.pause()`, `sandbox.sandboxId`.
  `create` opts used: `timeoutMs`, `apiKey`, `lifecycle: { onTimeout: 'pause' }`,
  `network: { allowOut, denyOut: [ALL_TRAFFIC] }`.
- **Commands:** `sandbox.commands.run(cmd, { cwd?, envs?, timeoutMs?, onStdout?, onStderr? })`
  → `{ stdout, stderr, exitCode }`. Throws `CommandExitError` (`.exitCode`, `.stderr`) on
  non-zero exit, `TimeoutError` on timeout.
- **Files:** `sandbox.files.write(path, contents)`, `.read(path)`, `.remove(path)`.
- **Git helper:** `sandbox.git.clone/status/createBranch/add/commit/push`.
- **Constants/errors imported:** `ALL_TRAFFIC`, `CommandExitError`, `TimeoutError`.

The interface in §5 is derived from exactly this list, so the **E2B provider is nearly a
1:1 passthrough** and the migration is no-behavior-change.

## 3. Architecture: three layers, two planes

The design separates two concerns that generalize very differently:

- **Control plane** — _spawn / stop / persist / resume a sandbox._ Irreducibly
  environment-specific (Docker API, k8s API, ECS RunTask, E2B API).
- **Data plane** — _run a command, read/write files, git inside a sandbox._ Can be made
  **uniform** across environments.

These map onto three layers:

```
        ┌──────────────────────────────────────────────────────────┐
        │ AppGenerateService / AiWritebackService                   │
        │   (feature code — sees ONLY the Manager + SandboxHandle)  │
        └───────────────────────────┬──────────────────────────────┘
                                     │
        ┌────────────────────────────▼─────────────────────────────┐
LAYER 1 │ Sandbox Manager                                          │
        │  registry (Postgres) · pool/warm · reaper (Graphile) ·   │
        │  capacity caps · leases (JetStream KV) · live logs (NATS)│
        │  picks a Provider by config; owns persist/resume policy   │
        └───────┬──────────────────────────────────┬───────────────┘
                │ control plane                     │ delegates persistence
        ┌───────▼───────────┐              ┌────────▼─────────────────┐
LAYER 2 │ SandboxProvider   │   returns →  │ LAYER 3  Volume / Storage│
        │  create/connect/  │  SandboxHandle│  persist(): snapshot    │
        │  destroy/persist/ │   ┌─────────┐ │  resume():  restore     │
        │  resume           │   │Execution│ │  tiers: memory|volume|  │
        │  (Docker/E2B/k8s/ │   │  (data  │ │         objectstore     │
        │   ECS impls)      │   │  plane) │ │  default: tar→S3/MinIO  │
        └───────────────────┘   └─────────┘ └──────────────────────────┘
```

- **Layer 1 — Sandbox Manager:** the only thing feature code talks to. Env-agnostic.
  Owns the _operational_ concerns (which sandbox belongs to which thread, idle reaping,
  capacity, crash recovery, live log fan-out). Selects a provider via `SANDBOX_PROVIDER`.
- **Layer 2 — Execution layer (the `SandboxHandle` data plane):** `commands` / `files` /
  `git`. For E2B/GKE this is the provider's native client; for local Docker it's
  `docker exec` through the socket; for ECS/raw-Docker-in-prod it's a small **in-sandbox
  agent** (see §5.4). Same interface regardless.
- **Layer 3 — Volume / storage layer:** how on-disk state survives between turns. Has a
  **universal default** (tar the working set to S3/MinIO) and **per-provider overrides**
  (E2B memory pause; ECS EFS; k8s PVC).

## 4. Features the abstraction must provide

1. **Lifecycle:** create, connect (re-attach by id), destroy.
2. **Command execution:** run a shell command with `cwd`, `envs`, `timeoutMs`, and
   **streaming** `onStdout`/`onStderr`; return `{ stdout, stderr, exitCode }`.
3. **File operations:** read, write, remove.
4. **Git operations:** clone, status, createBranch, add, commit, push (provider-native on
   E2B; otherwise implemented over command execution).
5. **Normalized errors:** `SandboxCommandError` (non-zero exit) and `SandboxTimeoutError`,
   so callers never `instanceof CommandExitError` against a vendor type.
6. **Egress control:** an allowlist of outbound hosts (`api.anthropic.com`, `github.com`,
   …) enforced by whatever mechanism the environment offers.
7. **Persistence / multi-turn:** snapshot a declared working set at end of turn and restore
   it next turn, so agent chat history (on disk) survives. Pause/resume where native.
8. **Operational robustness (Manager):** idle reaping, capacity limits, crash recovery via
   leases, warm pools where supported, live log streaming.
9. **Capability discovery:** providers advertise what they can do (pause/resume, isolation
   level, egress enforcement, warm pool) so the Manager can degrade gracefully.

## 5. The interfaces

Location (proposed): `packages/backend/src/ee/services/SandboxRuntime/`.

### 5.1 Provider (control plane)

```ts
interface SandboxProvider {
    create(spec: SandboxSpec): Promise<SandboxHandle>;
    connect(sandboxId: string): Promise<SandboxHandle>;
    destroy(sandboxId: string): Promise<void>;

    // Persistence — see §6. Default impls live in the Manager (tar→S3);
    // providers override when they have something better.
    persist(sandboxId: string): Promise<SnapshotRef>;
    resume(ref: SnapshotRef): Promise<SandboxHandle>;

    readonly capabilities: SandboxCapabilities;
}

interface SandboxSpec {
    templateRef: string; // OCI image / E2B template / k8s SandboxTemplate
    timeoutMs: number;
    egress: { allow: string[] }; // denyOut: ALL_TRAFFIC is implicit
    envs?: Record<string, string>;
    workspace: PersistentWorkspace; // declares what persist() captures (§6)
}

interface SandboxCapabilities {
    isolation: 'microvm' | 'gvisor' | 'container';
    pauseResume: boolean; // true only where memory snapshot exists (E2B)
    egressAllowlist: boolean; // can it actually enforce SandboxSpec.egress?
    warmPool: boolean;
    persistence: 'memory' | 'volume' | 'objectstore';
}
```

### 5.2 Handle (execution / data plane)

```ts
interface SandboxHandle {
    readonly sandboxId: string;
    pause(): Promise<void>; // capability-gated; no-op→throws if unsupported

    commands: {
        run(cmd: string, opts?: RunOptions): Promise<CommandResult>;
    };
    files: {
        read(path: string): Promise<string>;
        write(path: string, contents: string | Buffer): Promise<void>;
        remove(path: string): Promise<void>;
    };
    git: SandboxGit;
}

interface RunOptions {
    cwd?: string;
    envs?: Record<string, string>;
    timeoutMs?: number;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
}

interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

interface SandboxGit {
    clone(url: string, opts: GitCloneOptions): Promise<void>;
    status(
        cwd: string,
    ): Promise<{ currentBranch: string | null; hasChanges: boolean }>;
    createBranch(cwd: string, branch: string): Promise<void>;
    add(cwd: string, opts: { files: string[] } | { all: true }): Promise<void>;
    commit(
        cwd: string,
        message: string,
        author: { name: string; email: string },
    ): Promise<void>;
    push(cwd: string, opts: GitPushOptions): Promise<void>;
}
```

### 5.3 Errors (normalized, vendor-neutral)

```ts
class SandboxCommandError extends Error {
    // maps E2B CommandExitError
    constructor(
        readonly exitCode: number,
        readonly stderr: string,
    ) {
        super();
    }
}
class SandboxTimeoutError extends Error {} // maps E2B TimeoutError
```

The only real translation work in any provider is catching the vendor error and rethrowing
one of these. Feature code branches on `instanceof SandboxCommandError` only.

### 5.4 The execution layer's two shapes

`SandboxHandle` is satisfied one of three ways, all behind the same interface:

| Backend                             | How `commands/files/git` are implemented                                                                                                                    | Build an agent?                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **E2B**                             | thin shim over the `e2b` SDK (`sandbox.commands/files/git`)                                                                                                 | no — E2B's `envd`                  |
| **GKE Agent Sandbox**               | shim over the Sandbox Router / `sandbox.run()`                                                                                                              | no — provided                      |
| **Local Docker (first target)**     | `docker exec` via the Docker socket; files via `putArchive`/`getArchive` or base64-over-exec; git over exec                                                 | **no** — the socket is the channel |
| **ECS Fargate / raw Docker (prod)** | HTTP to a small **in-sandbox agent** baked into the image, started by the entrypoint; per-sandbox bearer token over TLS; reached on the task/pod private IP | **yes**                            |

Key point: the local provider needs **no agent and no networking** — `docker exec` streams
stdout/stderr/exit back through the daemon, which is why it's the simplest possible testbed
(and dodges macOS container-IP routing entirely).

### 5.5 What is E2B-compatible — and what isn't

**Maps natively / near-1:1 (E2B provider is a passthrough):**

- `create/connect/destroy/pause` → `Sandbox.create/connect/kill` + `sandbox.pause`.
- `commands.run` incl. `cwd/envs/timeoutMs/onStdout/onStderr` → `sandbox.commands.run`.
- `files.read/write/remove` → `sandbox.files.*`.
- `git.*` → `sandbox.git.*` (E2B even ships the git helper).
- `egress.allow` → `network.allowOut` with implicit `denyOut: [ALL_TRAFFIC]`.
- Errors → catch `CommandExitError`/`TimeoutError`, rethrow neutral.

**Does NOT carry over to other providers (must be emulated by the Manager / providers):**

| E2B feature                                           | Why it won't port                                         | Replacement                                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **In-memory `pause()`/resume** (RAM + live processes) | needs microVM memory snapshot; Docker/k8s/ECS can't       | **filesystem persistence + agent `--resume`** (§6); `capabilities.pauseResume=false`                        |
| **Native egress allowlist**                           | Docker/k8s/ECS enforce egress differently                 | provider-specific: NetworkPolicy / security group / host firewall; local Docker = best-effort or none (dev) |
| **Managed transport + auth** (API key, no IPs, TLS)   | self-hosted has no managed plane                          | in-sandbox agent + per-sandbox token + NetworkPolicy/SG (prod); Docker socket (local)                       |
| **Built-in `git` helper**                             | only E2B ships it                                         | implement `SandboxGit` over `commands.run` (git binary in image)                                            |
| **Elastic capacity**                                  | one host/cluster is finite                                | Manager capacity caps + warm pools                                                                          |
| **Streaming fidelity**                                | some data planes merge stdout/stderr (k8s exec, ECS Exec) | accept merged streams there, or rely on the agent which keeps them separate                                 |

So the abstraction is "**E2B-shaped**": E2B is the reference and the easy case; the design
work is making poorer backends present the same `SandboxHandle`.

## 6. Volume / storage layer (persistence & multi-turn)

Multi-turn agents persist **chat history to disk** inside the sandbox. We don't need E2B's
memory snapshot to keep that — we need the _filesystem_ to survive between turns, plus a
relaunch of the agent in resume mode. Three fidelity tiers:

| Tier          | Survives                        | Mechanism                                  | Notes                                   |
| ------------- | ------------------------------- | ------------------------------------------ | --------------------------------------- |
| 1 memory      | RAM + disk + **live processes** | E2B `pause()`                              | transparent resume; E2B only            |
| 2 volume      | disk                            | EFS / PVC / named Docker volume reattached | fast (no copy); pins location           |
| 3 objectstore | disk subset                     | **tar working set → S3/MinIO**             | portable; copy cost ∝ size; **default** |

### Declared working set — persist a slice, not the disk

`PersistentWorkspace` declares the small set of paths worth keeping; everything else is
re-derived (`git clone`, `pnpm install`) on resume. This keeps snapshots tiny and avoids
persisting secrets.

```ts
interface PersistentWorkspace {
    include: string[]; // e.g. agent session dir (~/.claude), mutable working tree
    exclude: string[]; // node_modules, .git objects, build output, injected secrets
}
type SnapshotRef =
    | { kind: 'e2b-paused'; sandboxId: string }
    | { kind: 'volume'; volumeId: string }
    | { kind: 's3-tar'; key: string };
```

### Default implementation lives in the Manager

`persist`/`resume` have a **single default implementation in the Manager** — tar the
working set and stream it to S3 via the existing `FileStorageClient` (locally: MinIO, zero
new infra). Every provider inherits working multi-turn for free. Providers **override**
only when they have something faster: E2B → `pause()` (tier 1), ECS → EFS (tier 2).

### Resume flow (tier 2/3)

```
turn ends   → Manager.persist(): quiesce agent → tar {workspace.include} → S3 key
              → store {snapshotRef, agentSessionId} in registry → destroy/stop sandbox
turn starts → Manager.resume(ref):
                provider.create() (warm pool if available)
                re-derive code:   git clone + install
                restore state:    download tar → extract over the top
                relaunch agent:   `claude --resume <agentSessionId>`
```

The agent reading its restored transcript is what continues the conversation — RAM was
never the source of truth.

### Two retention policies (don't conflate)

- **Idle reap** (minutes): a _live_ sandbox with no activity → stop/destroy to free the
  host. Keyed on `lastActivityAt`.
- **Snapshot retention** (days): how long a _thread_ can be resumed → GC the S3 tar / volume.

## 7. Sandbox Manager layer (operational concerns)

The Manager is the only dependency of `AppGenerateService` / `AiWritebackService`. It wraps
a `SandboxProvider` and adds everything E2B's hosted plane gave us for free. It reuses
**infra we already run**:

| Concern                                                                                                      | Implementation                                                                    | Infra                                           |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Registry** (sandbox ↔ thread, provider, address, state, `lastActivityAt`, `snapshotRef`, `agentSessionId`) | new table; extends today's persisted `sandboxId`                                  | **Postgres**                                    |
| **Capacity / claim**                                                                                         | `SELECT … FOR UPDATE SKIP LOCKED` to cap concurrent sandboxes and claim warm ones | **Postgres**                                    |
| **Reaper** (idle + snapshot GC)                                                                              | recurring job; generalizes today's stale-job release                              | **Graphile cron**                               |
| **Durable retry / state machine**                                                                            | enqueue next turn + registry update in one txn                                    | **Graphile + Postgres**                         |
| **Lease / liveness / orphan detect**                                                                         | worker heartbeats a TTL key; expiry ⇒ orphan ⇒ re-adopt or reap                   | **JetStream KV** (TTL) or Postgres lease column |
| **Live + replayable stdout, cancel**                                                                         | fan out `onStdout` to the API pod holding the user's stream                       | **NATS / JetStream**                            |
| **Warm pool**                                                                                                | pre-created idle sandboxes (provider-native on GKE/ECS)                           | provider + registry                             |

**Crash recovery is the headline robustness property:** because the sandbox lives _outside_
the worker, a worker death doesn't kill the run. The lease expires, a fresh worker
`connect()`s by `sandboxId` and resumes streaming. The Manager owns this; providers just
implement `connect`.

### Manager ↔ Provider ↔ Volume interaction (per turn)

```
feature code → Manager.runTurn(threadId, prompt)
  Manager: look up registry row for threadId
    if none / expired snapshot  → provider.create(spec)             [+ Volume restore if snapshotRef]
    else                        → provider.connect(id) | resume(ref)
  Manager: acquire lease (JetStream KV TTL), start heartbeat
  feature code uses SandboxHandle.commands/files/git  (Execution/data plane)
    Manager streams onStdout → NATS → user
  turn ends:
    Manager.persist(id) → Volume layer: tar include-set → MinIO/S3 → snapshotRef
    Manager: update registry (snapshotRef, lastActivityAt), release lease
    Manager: provider.destroy(id)  (or pause on E2B)
  later: reaper GCs idle sandboxes (minutes) and stale snapshots (days)
```

## 8. Local-dev testbed (first target, concrete)

`DockerSandboxProvider` — the simplest thing that exercises every layer on a MacBook:

- **Image:** reuse `sandboxes/ai-writeback/e2b.Dockerfile` built as a plain image
  (`lightdash-sandbox:local`) — already has node, git, claude, dbt.
- **Control plane:** `dockerode` over the Docker socket mounted into `lightdash-dev`
  (`- /var/run/docker.sock:/var/run/docker.sock`). `create` runs the image with entrypoint
  `sleep infinity` on the `lightdash-app_default` network; `destroy` force-removes it.
- **Execution layer:** `container.exec` (no agent, no network, no token). Files via
  `putArchive`/`getArchive` or base64-over-exec; git over exec.
- **Volume layer:** Manager default — tar working set → **MinIO** (already wired into
  `FileStorageClient`). Validates tier-3 persistence end-to-end locally.
- **Capabilities:** `{ isolation: 'container', pauseResume: false, egressAllowlist: false,
warmPool: false, persistence: 'objectstore' }`.
- **Safety gate:** refuses to initialize when `NODE_ENV === 'production'`.

Selected by `SANDBOX_PROVIDER=docker`; `SANDBOX_PROVIDER=e2b` keeps today's path.

## 9. Configuration

```
SANDBOX_PROVIDER = e2b | docker        # (later: kubernetes | ecs | microsandbox)
```

Lives in `lightdashConfig.appRuntime`. E2B keeps its existing `E2B_*` settings. The Docker
provider needs only the image name and the socket mount. Egress allowlists move from
hard-coded arrays into `SandboxSpec.egress.allow` built by each feature service.

## 10. Phasing

- **Phase 0 — interface + local provider (this design):** `SandboxProvider`/`SandboxHandle`
    - errors + capabilities; `DockerSandboxProvider`; `SANDBOX_PROVIDER` flag; migrate
      `AppGenerateService`/`AiWritebackService` and the git-provider strategy off the concrete
      `e2b` type (E2B shim = no behavior change). Compose socket mount. _No persistence yet._
- **Phase 1 — persistence / multi-turn:** `PersistentWorkspace` + Manager default
  `persist`/`resume` (tar→MinIO) + agent `--resume`. Validate a 2-turn conversation
  surviving container destruction.
- **Phase 2 — Manager hardening:** registry table, reaper (Graphile cron), capacity caps,
  leases (JetStream KV), live logs (NATS), crash-recovery re-adopt.
- **Phase 3 — real providers:** GKE Agent Sandbox, ECS Fargate (+ in-sandbox agent),
  microsandbox — each conforming to the Phase-0 interface.

```

```
