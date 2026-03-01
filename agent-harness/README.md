# Agent Harness

Run multiple isolated Lightdash development environments on a single machine. Each agent gets its own database, S3 bucket, ports, and PM2 processes while sharing one set of infrastructure containers (PostgreSQL, MinIO, headless browser, Mailpit).

Built for AI coding agents (Claude Code, etc.) but works just as well for parallel human development.

## Quick Start (Local)

```bash
# 1. Set up shared infrastructure (Docker containers + template database)
./agent-harness/setup-infra.sh

# 2. Launch agent 1
./agent-harness/launch.sh 1

# 3. Open in browser
#    Frontend: http://localhost:3010
#    API:      http://localhost:8010
#    Login:    demo@lightdash.com / demo_password!

# 4. Check status
./agent-harness/agent-cli.sh 1 status

# 5. Run verification after making changes
./agent-harness/verify.sh 1

# 6. Tear down when done
./agent-harness/teardown.sh 1
```

## Quick Start (Remote VPS)

For running agents on a cloud server — ideal for always-on agents or mobile prompting.

### 1. Provision a VPS

Use `cloud-init.yml` to provision a server with everything pre-installed (Docker, Node.js, pnpm, PM2, dbt, the repo, and all remote access tools).

**Hetzner** (recommended):
```bash
hcloud server create \
  --name lightdash-agents \
  --type cpx41 \
  --image ubuntu-24.04 \
  --ssh-key my-key \
  --user-data-from-file agent-harness/cloud-init.yml
```

**DigitalOcean**:
```bash
doctl compute droplet create lightdash-agents \
  --size s-8vcpu-16gb \
  --image ubuntu-24-04-x64 \
  --ssh-keys <fingerprint> \
  --user-data "$(cat agent-harness/cloud-init.yml)"
```

**Recommended sizes**: 8 vCPU / 16 GB for 3 agents, 8 vCPU / 32 GB for 5 agents.

Cloud-init takes 5–10 minutes. Check progress with `tail -f /var/log/cloud-init-output.log`.

### 2. SSH in and start agents

```bash
ssh root@<server-ip>
sudo -iu lightdash
cd /opt/lightdash

./agent-harness/setup-infra.sh
./agent-harness/launch.sh 1
./agent-harness/launch.sh 2
```

### 3. Set up remote access

The VPS comes with four remote access tools pre-installed for a seamless experience, especially from mobile devices.

#### Tailscale — Private VPN (recommended first step)

Tailscale creates a WireGuard VPN so the server is reachable by hostname without exposing ports to the public internet. Agent web UIs become accessible from any device on your tailnet.

```bash
# On the server:
sudo tailscale up --ssh

# From your laptop/phone (with Tailscale installed):
ssh lightdash@<tailscale-hostname>
# Agent UIs are now accessible at http://<tailscale-ip>:3010, :3020, etc.
```

#### tmux — Session persistence

Every interactive session should run inside tmux. If your connection drops, the session survives and you reattach.

```bash
# Start a session:
tmux new -s agents

# Create per-agent windows:
tmux new-window -t agents -n agent-1
tmux new-window -t agents -n agent-2

# Detach: C-a d (prefix is C-a, not the default C-b)

# Reattach from a new connection:
tmux attach -t agents
```

The pre-installed config uses `C-a` prefix (easier on mobile keyboards), enables mouse support, sets 50K line scrollback, and reduces escape delay for mosh compatibility.

#### mosh — Roaming-friendly SSH

Standard SSH breaks on Wi-Fi handoffs and mobile network switches. Mosh uses UDP and handles roaming gracefully.

```bash
# Connect (instead of ssh):
mosh lightdash@<server-ip>

# Best combo — mosh + tmux:
mosh lightdash@<server-ip> -- tmux attach -t agents
```

Requires UDP ports 60000–61000 open. If using a firewall:
```bash
sudo ufw allow 60000:61000/udp
```

#### Happy Coder — Mobile Claude Code client

A native mobile app for prompting Claude Code from your phone with touch UI, voice input, and push notifications.

```bash
# On the server (inside tmux):
happy --auth
# Scan the QR code with the Happy app on your phone (iOS/Android)
```

Why Happy Coder over mobile SSH:
- Native touch UI instead of a flickering terminal
- Push notifications when Claude needs permission approval
- Offline message queuing — type prompts on the subway, they send when back online
- End-to-end encrypted via Signal protocol

### Recommended Remote Workflow

1. **Provision** the VPS with `cloud-init.yml`
2. **Join Tailscale**: `sudo tailscale up --ssh`
3. **Connect via mosh**: `mosh lightdash@<ts-hostname> -- tmux new -s agents`
4. **Set up infra**: `./agent-harness/setup-infra.sh`
5. **Launch agents** in tmux windows: `./agent-harness/launch.sh 1`, etc.
6. **Pair phone**: `happy --auth` in a tmux pane, scan QR
7. **Go mobile**: monitor and prompt from your phone via Happy
8. **Return to laptop**: `mosh lightdash@<ts-hostname> -- tmux attach -t agents`

## Architecture

```
┌─────────────────────────── Host Machine ───────────────────────────┐
│                                                                     │
│  ┌─── Shared Docker Containers ──────────────────────────────────┐  │
│  │  PostgreSQL (:15432)  MinIO (:19000)  Browser (:13001)        │  │
│  │  Mailpit (:11025/:18025)                                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─── Agent 1 (PM2) ────┐  ┌─── Agent 2 (PM2) ────┐              │
│  │  Frontend  :3010      │  │  Frontend  :3020      │              │
│  │  API       :8010      │  │  API       :8020      │              │
│  │  DB: agent_1          │  │  DB: agent_2          │   ...        │
│  │  Bucket: agent-1      │  │  Bucket: agent-2      │              │
│  └───────────────────────┘  └───────────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### Port Allocation

Each agent gets ports derived from `AGENT_ID * 10`:

| Service         | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 |
|-----------------|---------|---------|---------|---------|---------|
| Frontend (Vite) | 3010    | 3020    | 3030    | 3040    | 3050    |
| Backend API     | 8010    | 8020    | 8030    | 8040    | 8050    |
| Node Debugger   | 9210    | 9220    | 9230    | 9240    | 9250    |

Shared infrastructure uses non-standard ports to avoid conflicts with normal dev:

| Service        | Port  |
|----------------|-------|
| PostgreSQL     | 15432 |
| MinIO S3 API   | 19000 |
| MinIO Console  | 19001 |
| Headless Browser | 13001 |
| Mailpit SMTP   | 11025 |
| Mailpit Web UI | 18025 |

### Database Templating

PostgreSQL's `CREATE DATABASE ... TEMPLATE` copies the fully-migrated, seeded template database in milliseconds. No per-agent migration or seed runs needed.

## Scripts Reference

### `setup-infra.sh`

Starts shared Docker containers and creates the template database (migrations + seeds + dbt models). Idempotent — safe to run multiple times.

### `launch.sh <agent-id> [--worktree]`

Launches one agent (ID 1–5). Creates its database from the template, MinIO bucket, `.env` file, PM2 config, and starts all processes. Waits for the health check.

`--worktree`: creates an isolated git worktree at `~/worktrees/agent-<id>/` so the agent can modify files without affecting other agents.

### `teardown.sh <agent-id>`

Safely tears down one agent: stops PM2 processes, drops database, removes bucket, cleans up generated files. Only touches that agent's resources.

### `agent-cli.sh <agent-id> <command>`

Namespaced CLI for managing a running agent:

| Command | Description |
|---------|-------------|
| `status` | PM2 process status table |
| `logs [service]` | PM2 logs (api, frontend, common-watch, warehouses-watch) |
| `health` | Check API health endpoint |
| `url` | Print frontend/API URLs |
| `restart [service]` | Restart PM2 processes |
| `psql [query]` | SQL against agent's database |
| `stats` | CPU/memory for agent's processes |
| `slow-queries` | Top 10 slow queries from pg_stat_statements |
| `exec <cmd...>` | Run command with agent env vars |

### `verify.sh <agent-id> [--full]`

Progressive verification pipeline. Outputs JSON to stdout, human-readable progress to stderr.

**Default stages** (exit on first failure):
1. Typecheck — common, backend, frontend in parallel
2. Lint — common, backend, frontend in parallel
3. Unit tests — backend + common in parallel

**With `--full`**:
4. Full test suite
5. API smoke test

Output example:
```json
{
  "status": "pass",
  "stages": [
    {"name": "typecheck", "status": "pass", "duration_ms": 3200},
    {"name": "lint", "status": "pass", "duration_ms": 1800},
    {"name": "test-unit", "status": "pass", "duration_ms": 4500}
  ],
  "total_duration_ms": 9500
}
```

## Using `just` (Optional)

If you have [just](https://github.com/casey/just) installed:

```bash
cd agent-harness

just setup               # One-time infra setup
just launch 1            # Launch agent 1
just teardown 1          # Tear down agent 1
just verify 1            # Quick verification
just verify-full 1       # Full verification
just status              # All agent statuses
just launch-all 3        # Launch agents 1-3
just teardown-all        # Tear down all agents
just cli 1 logs api      # CLI shortcut
```

## GitHub Actions

The `agent-task.yml` workflow runs automatically when an issue is labeled `agent-task`. It provisions a full environment in CI, runs Claude Code with the issue body as the prompt, verifies the result, and creates a PR if verification passes.

## Resource Estimates

| Component | Per Agent | Shared |
|-----------|-----------|--------|
| Backend API | 300–500 MB | — |
| Frontend (Vite) | 300–500 MB | — |
| TypeScript watchers | 100–200 MB | — |
| PostgreSQL | — | 500 MB–1 GB |
| MinIO | — | 128–256 MB |
| Headless Browser | — | 500 MB–1 GB |
| Mailpit | — | 64 MB |

**3 agents**: ~4–6 GB total (comfortable on 16 GB)
**5 agents**: ~6–8 GB total (needs 16+ GB)
