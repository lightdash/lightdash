# Coding agent development environments on exe.dev

`scripts/agent-exedev-dev.sh` gives a coding agent session (Claude Code on the
web, the Claude desktop app's Code tab, or local Claude Code) a full disposable
Lightdash environment on an [exe.dev](https://exe.dev) VM with a public test
URL. It clones a prepared VM template (copy-on-write, sub-second) and pushes
git-computed deltas of the working tree over SSH.

The flow is opt-in: every command and hook is a silent no-op unless
`LIGHTDASH_EXEDEV_SSH_KEY` is set. Configure one environment provider per
session; do not set it together with `LIGHTDASH_OKTETO_TOKEN`.

## What you need

-   `LIGHTDASH_EXEDEV_SSH_KEY` — an SSH private key (the key material itself,
    or a path to a key file) for an exe.dev identity that is allowed to `cp`
    the template, `tag` VMs, and SSH into clones.
-   A template VM (default `ld-linear-agent-template`, override with
    `LIGHTDASH_EXEDEV_TEMPLATE`) root-shared with the exe.dev team. The
    template bakes in the toolchain, a repository checkout with installed
    dependencies, built shared packages, and pre-pulled Docker images for
    Postgres, MinIO, Mailpit, and browserless Chromium.

## How a session works

1. **SessionStart hook** (`hook-start`): derives a VM name from the Claude
   session ID (`ld-cc-<hash>`, short for Lightdash Claude Code), clones the
   template with `cp <template> <vm> --copy-tags=false`, tags it
   `lightdash-claude-session` for automated cleanup, root-shares it with the
   exe.dev team (`share add <vm> team --root`, so session VMs are visible and
   SSH-able to everyone in the team UI), syncs the working tree, launches the
   preview stack **in the background**, and publishes the port (`share port`
   + `share set-public`). It returns in seconds; the app may still be booting
   when the agent starts working.
2. **PostToolUse hook** (`hook-sync`): after `Edit`/`Write` it copies exactly
   that file to the VM (one SSH round trip over a persistent connection);
   after `Bash` it syncs whatever `git status` reports changed. Vite HMR and
   pm2 watch pick changes up immediately. Sync failures never block the agent;
   `wait` is the authoritative sync.
3. **Stop hook** (`hook-stop`): syncs, blocks until `/api/v1/health` responds,
   and refuses the final response unless it contains the ready URL.

There is no readiness state machine between those hooks. The agent inspects
the VM directly over SSH — that is the intended debugging loop:

```bash
./scripts/agent-exedev-dev.sh ssh 'tail -n 80 /home/exedev/linear-agent/bootstrap.log'
./scripts/agent-exedev-dev.sh ssh 'pm2 status && pm2 logs --nostream --lines 50'
./scripts/agent-exedev-dev.sh ssh 'docker compose -f /home/exedev/linear-agent/docker-compose.runner.yml ps'
curl -fsS "$(./scripts/agent-exedev-dev.sh url)/api/v1/health"
```

Run `./scripts/agent-exedev-dev.sh wait` after making and validating changes
and include the URL from its `READY:` line in the final response.

## Sync model

Sync is one-way (session ➞ VM) and git-delta based; nothing ever scans the
working tree:

-   When the VM's checkout already contains the session's HEAD commit, the
    ref is set directly with `update-ref` (one SSH round trip). This also
    sidesteps a git 2.43 `receive-pack` deadlock: empty-pack pushes hang
    forever on partial-clone (`--filter=blob:none`) repositories.
-   Otherwise `git push ssh://<vm>/<repo> HEAD:refs/agent/session` transfers
    only the objects the VM's baked checkout lacks. If the shallow template
    clone rejects the push (`missing necessary objects`), the VM's history is
    deepened from GitHub and the sync retried. Either way the VM then
    force-checkouts the ref (detached).
-   Uncommitted changes travel as `git diff HEAD --binary` applied on the VM;
    untracked files are tar-piped. Ignored files (`node_modules`, `.env`,
    build output) never cross the wire.
-   If `pnpm-lock.yaml` differs from the template's recorded lockfile hash,
    `pnpm install` runs on the VM.

Consequences: generate artifacts on the VM only if they are gitignored or you
copy them back yourself; the session workspace is the single source of truth
for code. Deleting a locally *untracked* file does not delete it on the VM.

## Commands

```bash
./scripts/agent-exedev-dev.sh start      # clone + sync + launch preview (background)
./scripts/agent-exedev-dev.sh wait       # sync, block until healthy, print READY: <url>
./scripts/agent-exedev-dev.sh sync       # full git-delta sync now
./scripts/agent-exedev-dev.sh url        # print this session's public URL
./scripts/agent-exedev-dev.sh ssh <cmd>  # run a command on the session VM
./scripts/agent-exedev-dev.sh exe <cmd>  # exe.dev control command (ls, share, tag, ...)
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LIGHTDASH_EXEDEV_SSH_KEY` | — | Opt-in gate; key material or key path |
| `LIGHTDASH_EXEDEV_TEMPLATE` | `ld-linear-agent-template` | Template VM to clone |
| `LIGHTDASH_EXEDEV_TEAM_SHARE` | `true` | Root-share session VMs with the team |
| `LIGHTDASH_EXEDEV_CONTROL_HOST` | `exe.dev` | Control-plane SSH host |
| `LIGHTDASH_EXEDEV_VM_PREFIX` | `ld-cc-` | Session VM name prefix |
| `LIGHTDASH_EXEDEV_VM_TAG` | `lightdash-claude-session` | Sweeper tag for clones |
| `LIGHTDASH_EXEDEV_REMOTE_USER` | `exedev` | SSH user on VMs |
| `LIGHTDASH_EXEDEV_REMOTE_REPO` | `/opt/linear-agent-template/repository` | Repo checkout path on the VM |
| `LIGHTDASH_EXEDEV_BOOTSTRAP` | `scripts/agent-exedev-bootstrap.sh` | Local bootstrap script uploaded to the VM |
| `LIGHTDASH_EXEDEV_REMOTE_LOG` | `/home/exedev/linear-agent/bootstrap.log` | Bootstrap log path on the VM |
| `LIGHTDASH_EXEDEV_PREVIEW_PORT` | `3000` | Port published via `share port` |
| `EXEDEV_READY_TIMEOUT_SECONDS` | `900` | `wait`/Stop-hook readiness deadline |

## Claude Code on the web / desktop app

Set `LIGHTDASH_EXEDEV_SSH_KEY` as a secret in the code-session environment
configuration. Network access must allow outbound SSH (port 22) to `exe.dev`
and `*.exe.xyz`, and HTTPS to `*.exe.xyz` for health checks.

## Operations

-   Session VMs are tagged and reaped by internal automation; exe.dev
    auto-suspends idle VMs in the meantime. The VM stays up after the session
    so the user can test at the public URL and open a PR.
-   The template is refreshed regularly, so clones start near current `main`.
-   `share set-public` makes the preview URL world-reachable (demo
    credentials).
-   The bootstrap log lives on the VM (`bootstrap.log` next to the workspace);
    the only local session state is the SSH key and a provisioned marker under
    `${TMPDIR:-/tmp}/lightdash-agent-exedev/<session-hash>/`.
