# Sandbox Runtime

Lightdash runs LLM-generated code (Claude Code) on a user's behalf for two EE
features:

- **AI writeback** (`AiWritebackService`) — the agent edits a dbt repo, runs
  `lightdash compile`, and opens a pull request.
- **Data app generation** (`AppGenerateService`) — the agent generates and builds
  a small React app from a prompt.

Both run the agent inside an **isolated sandbox** rather than on the Lightdash
server. The sandbox runtime is the provider-neutral abstraction those features
talk to, so the same feature code runs on whichever backend an operator has
configured (hosted E2B, a local Docker container, or AWS Lambda MicroVMs).

This doc is the engineering reference for that abstraction: how it's structured,
how to drive it from a feature, and how to add a backend. The operator-facing
configuration is documented on the public docs site
([self-host → sandboxes](https://docs.lightdash.com/self-host/customize-deployment/sandboxes)).

Code lives in `packages/backend/src/ee/services/SandboxRuntime/`.

## Why an abstraction

The features originally imported the `e2b` SDK directly and threaded the concrete
`Sandbox` type through their internals. E2B is a good hosted product but it's an
external dependency: it needs an API key, sends repo contents to a third party,
and can't be self-hosted. The runtime introduces a thin seam so feature code
depends on an interface, not a vendor, and an operator can pick the backend that
fits their environment.

## Architecture: three layers

```
 AppGenerateService / AiWritebackService        feature code
        │  (talks only to the Manager + SandboxHandle)
        ▼
 SandboxManager                                 lifecycle + policy
   registry (stable sandbox_uuid ↔ thread)
   suspend/resume policy (pause-in-place vs snapshot+destroy)
        │
        ▼
 SandboxProvider                                control plane
   create / connect / destroy
   persist / resume / deleteSnapshot
        │  returns
        ▼
 SandboxHandle                                  data plane
   commands.run · files.read/write/remove · git.*
```

### SandboxManager (`SandboxManager.ts`)

The only lifecycle surface feature code talks to. It wraps a provider and adds:

- **A registry** — a `sandbox_registry` row keyed by a stable `sandbox_uuid` that
  maps a sandbox to its org/project, its current provider id, its snapshot
  reference, and its status (`running` | `suspended`). Backed by
  `SandboxRegistryModel`; a fake satisfies the `SandboxRegistryStore` interface in
  tests. The stable id is what lets a thread resume across turns (and across a
  worker crash — a fresh worker `connect()`s by the recorded provider id).
- **The suspend/resume policy** — the Manager decides, from the provider's single
  capability `pauseResume`, whether to pause a sandbox in place or snapshot it and
  destroy the container. Feature code never makes that decision.

Key methods: `acquire` (create + register), `resume` (re-materialize by
`sandbox_uuid`), `suspend` / `suspendByUuid` (end-of-turn or cancel), `destroy`
(kill + GC snapshot + drop row).

### SandboxProvider (`types.ts`) — the control plane

```ts
interface SandboxProvider {
    readonly capabilities: SandboxCapabilities; // { pauseResume: boolean }
    create(spec: SandboxSpec): Promise<SandboxHandle>;
    connect(sandboxId: string): Promise<SandboxHandle>;
    destroy(sandboxId: string): Promise<void>;
    persist(handle: SandboxHandle, options: PersistOptions): Promise<SnapshotRef>;
    resume(ref: SnapshotRef, spec: SandboxSpec): Promise<SandboxHandle>;
    deleteSnapshot(ref: SnapshotRef): Promise<void>;
}
```

`SandboxCapabilities` is a single flag, `pauseResume` — the only thing the Manager
branches on. It's `true` where the backend has a native memory snapshot (E2B,
Lambda MicroVMs) and `false` where it doesn't (Docker). See
[Persistence](#persistence) for what that controls.

### SandboxHandle (`types.ts`) — the data plane

A handle to one running sandbox. Uniform across backends:

```ts
interface SandboxHandle {
    readonly sandboxId: string;
    readonly commands: { run(cmd, opts?): Promise<CommandResult> };
    readonly files: { read; readBytes; write; remove };
    readonly git: SandboxGit; // clone/status/createBranch/add/commit/push
}
```

Errors are normalized so feature code never sees a vendor type: a non-zero exit
throws `SandboxCommandError` (`exitCode`, `stderr`, `stdout`) and a timeout throws
`SandboxTimeoutError` (`errors.ts`). Each provider catches its backend's error and
rethrows one of these.

## Providers

Selected by the `SANDBOX_PROVIDER` env var; the factory is
`createSandboxProvider` in `index.ts`.

| `SANDBOX_PROVIDER` | File | Use | `pauseResume` | Data plane |
| --- | --- | --- | --- | --- |
| `e2b` (default) | `E2bSandboxProvider.ts` | Production / managed | `true` | `e2b` SDK (passthrough) |
| `docker` | `DockerSandboxProvider.ts` | Local dev / self-host testbed | `false` | `docker exec` over the socket |
| `lambda-microvm` | `LambdaMicroVmSandboxProvider.ts` | AWS (native pause) | `true` | HTTPS to an in-VM exec agent |

- **E2B** — a near 1:1 passthrough to the `e2b` SDK. The reference implementation
  and the managed default. Egress is enforced via E2B's `network.allowOut`.
- **Docker** — backs each sandbox with a plain container reached over the Docker
  socket. `runc` isolation only, so it **refuses to start when
  `NODE_ENV=production`**. The simplest backend that exercises every layer with
  zero external services.
- **Lambda MicroVMs** — a native-pause backend on AWS. The control plane
  (`RunMicrovm`/`Suspend`/`Resume`/`Terminate`) maps 1:1 onto
  `create`/`persist`/`resume`/`destroy`. Lambda ships no native exec SDK, so the
  data plane (`LambdaExecChannel.ts`) is HTTPS to a small in-microVM agent baked
  into the image, authenticated with a per-call `X-aws-proxy-auth` bearer. The AWS
  `idlePolicy` (auto-suspend / auto-terminate) owns idle expiry.

The Docker and Lambda providers don't have a native git helper, so both build
`SandboxGit` on top of `commands`/`files` via the shared `createGitOverCommands`
(`gitOverCommands.ts`) — the system `git` binary inside the sandbox, with
credentials passed per-invocation (an HTTPS `http.extraHeader`) and never written
to the repo.

## Persistence

Multi-turn agents keep their chat history on the sandbox filesystem, so a turn
must be able to suspend a sandbox and resume it later. There are two strategies,
chosen by `capabilities.pauseResume`:

| `pauseResume` | Providers | `persist()` does | `SnapshotRef` |
| --- | --- | --- | --- |
| `true` | E2B, Lambda | Suspends in memory (RAM + disk + live processes). The suspended sandbox **is** the snapshot. The container is **not** destroyed. | `e2b-paused` / `lambda-microvm-suspended` |
| `false` | Docker | Tars the declared workspace and uploads it to object storage, then the Manager **destroys** the container. | `s3-tar` |

`PersistOptions.workspace` is a `PersistentWorkspace` — `{ include, exclude }`
declaring the small slice of the filesystem worth keeping (e.g. the agent session
dir and the working tree). Everything else (re-cloneable repo objects, installed
deps) is re-derived on resume, keeping snapshots small and free of injected
secrets. Native-pause providers ignore it (the whole VM is captured); the Docker
provider passes the include set to `tar -C /`.

`deleteSnapshot` is **provider-owned**: a no-op for native-pause backends (the
suspended sandbox is reclaimed by `destroy`), and a blob delete for the Docker
path. The Manager calls it on `destroy`/cleanup so storage handling stays next to
the code that wrote the snapshot — the Manager never sees an object-store key or
constructs an S3 client.

The object store (`SnapshotStore.ts`) is a narrow `put`/`get`/`delete` over
S3/MinIO (`S3SnapshotStore`), reusing the app's existing storage config. It's only
constructed for the Docker provider; native-pause paths pass `null`.

## Lifecycle of a turn

```
turn 1   Manager.acquire(spec, workspace)         provider.create → register row (running)
         feature drives handle.commands/files/git
         Manager.suspend(handle, workspace)        provider.persist → row (suspended, snapshotRef)
                                                    (object-store: + provider.destroy)
turn 2   Manager.resume(sandbox_uuid, spec)        provider.resume(ref) | connect → row (running)
         …
done     Manager.destroy(sandbox_uuid)             provider.destroy + deleteSnapshot → drop row
```

A turn that's cancelled or whose app is soft-deleted calls
`Manager.suspendByUuid` — it has no live handle, so it connects to the recorded
container, suspends it, and preserves state for a later resume.

### Idle / expiry

There is **no application-side reaper**. Every turn suspends its own sandbox, and
native-pause backends own idle expiry themselves — E2B via its create-time
`onTimeout: 'pause'`, Lambda via its AWS `idlePolicy`, which is fed by
`SANDBOX_IDLE_TIMEOUT_MS` (auto-suspend) and `SANDBOX_SNAPSHOT_RETENTION_MS`
(auto-terminate). The Docker provider is dev-only and has no idle handling.

## Using the runtime in a feature

1. Build a `SandboxManager` once via `createSandboxManager` (`index.ts`), passing
   the configured provider kind, the per-provider config, the registry model, and
   — for the Docker path only — an `S3SnapshotStore`:

   ```ts
   this.sandboxManager = createSandboxManager({
       provider: this.lightdashConfig.appRuntime.sandboxProvider,
       e2bApiKey: this.lightdashConfig.appRuntime.e2bApiKey,
       dockerImage: this.lightdashConfig.appRuntime.sandboxDockerImage,
       lambdaMicroVm: this.lightdashConfig.appRuntime.lambdaMicroVm,
       snapshotStore:
           this.lightdashConfig.appRuntime.sandboxProvider === 'docker'
               ? new S3SnapshotStore({ lightdashConfig: this.lightdashConfig })
               : null,
       registryModel: this.sandboxRegistryModel,
       logger: this.logger,
   });
   ```

2. Define a `SandboxSpec` (image/template ref, per-turn `timeoutMs`, egress
   allowlist, env) and a `PersistentWorkspace` (what to snapshot). Keep the
   workspace a module constant — e.g. `WRITEBACK_WORKSPACE` in
   `AiWritebackService.ts`, `DATA_APP_WORKSPACE` in `AppGenerateService.ts`.

3. `acquire` for a new thread or `resume` for an existing one; drive the work
   through `handle.commands` / `handle.files` / `handle.git`; `suspend` at the end
   of the turn; `destroy` when the thread is finished.

Feature code is provider-agnostic throughout — it never imports a provider or the
`e2b` SDK, and it branches only on `SandboxCommandError`, never a vendor error.
Unit tests drive a fake `SandboxProvider`/`SandboxRegistryStore` (see
`AiWritebackService.test.ts` and `SandboxManager.test.ts`).

## Adding a provider

Implement `SandboxProvider` and return a `SandboxHandle`. The work splits by
whether the backend has a native memory snapshot:

- **Native-pause backend** (like E2B / Lambda): set `capabilities.pauseResume =
  true`; `persist` suspends and returns a ref that is just the id to resume;
  `resume` reconnects; `deleteSnapshot` is a no-op (the suspended sandbox is
  reclaimed by `destroy`). Add a new `SnapshotRef` variant in `types.ts`.
- **No native pause** (like Docker): set `pauseResume = false`; reuse the
  object-store pattern — tar the declared workspace to a `SnapshotStore` in
  `persist`, restore it in `resume`, delete the blob in `deleteSnapshot` — and the
  Manager will destroy the container after persisting.

If the backend has no native git helper, build `SandboxGit` with
`createGitOverCommands(handle.commands, handle.files)` rather than reimplementing
it. Normalize the backend's command/timeout errors to `SandboxCommandError` /
`SandboxTimeoutError`. Wire the new kind into the `createSandboxProvider` factory
and the `SANDBOX_PROVIDER` parsing in `parseConfig.ts`.

## Configuration

The full operator reference is on the public docs site. The values are parsed into
`lightdashConfig.appRuntime` (`parseConfig.ts`):

| Variable | Used by | Notes |
| --- | --- | --- |
| `SANDBOX_PROVIDER` | all | `e2b` (default) · `docker` · `lambda-microvm` |
| `E2B_API_KEY`, `E2B_*_TEMPLATE_NAME/TAG` | e2b | Separate data-app vs writeback templates |
| `SANDBOX_DOCKER_IMAGE`, `SANDBOX_AI_WRITEBACK_DOCKER_IMAGE` | docker | Local images built from `sandboxes/<feature>/` |
| `LAMBDA_MICROVM_*` (region, role, connectors, image ARNs) | lambda-microvm | Image ARNs are separate per feature |
| `SANDBOX_IDLE_TIMEOUT_MS`, `SANDBOX_SNAPSHOT_RETENTION_MS` | lambda-microvm | Feed the AWS `idlePolicy`; ignored by e2b/docker |
| `ANTHROPIC_API_KEY` | all | The Claude Code agent runs inside the sandbox |

The data-app and writeback features use **separate images/templates** on every
backend (different toolchains), so each image setting comes in a pair.
