# Agent Harness

Run multiple isolated Lightdash development environments on a single machine. Each agent gets its own database, S3 bucket, ports, and PM2 processes while sharing one set of infrastructure containers (PostgreSQL, MinIO, headless browser, Mailpit).

Built for AI coding agents (Claude Code, etc.) but works just as well for parallel human development.

## For AI Agents (Claude Code)

If you're an AI agent running in the harness, use the `/agent-harness` skill to get started:

```
/agent-harness
```

This skill guides you through discovering your agent ID, finding your ports, managing your stack, and running verification. It covers everything you need to be productive immediately.

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

### Prerequisites

- **Hetzner Cloud account**: Sign up at https://console.hetzner.cloud
- **hcloud CLI**: Install with `brew install hcloud` (macOS) or see [hcloud releases](https://github.com/hetznercloud/cli/releases)

### 1. Create a Hetzner API Token

1. Go to https://console.hetzner.cloud
2. Create a project (or select existing)
3. Go to **Security → API Tokens → Generate API Token**
4. Give it **Read & Write** permissions
5. Copy the token (you'll need it in the next step)

### 2. Provision the Server

The easiest way is to use the provided script:

```bash
./agent-harness/cloud/hetzner/create.sh
```

This script will:
- Set up your Hetzner CLI context (prompts for API token on first run)
- Create/upload an SSH key if needed
- Create the server with cloud-init

**Options:**
```bash
./agent-harness/cloud/hetzner/create.sh --help              # Show all options
./agent-harness/cloud/hetzner/create.sh --type cpx52        # Use larger server (12 vCPU, 24GB)
./agent-harness/cloud/hetzner/create.sh --location ash      # Use US East location
./agent-harness/cloud/hetzner/create.sh --name my-agents    # Custom server name
```

**Server sizes:**
| Type | vCPU | RAM | Cost | Recommended for |
|------|------|-----|------|-----------------|
| cpx42 | 8 | 16 GB | ~€35/mo | 3 agents |
| cpx52 | 12 | 24 GB | ~€65/mo | 5 agents |
| cpx62 | 16 | 32 GB | ~€95/mo | 5+ agents |

**Locations:** `nbg1` (Nuremberg), `fsn1` (Falkenstein), `hel1` (Helsinki), `ash` (US East), `hil` (US West), `sin` (Singapore)

<details>
<summary>Manual setup (without the script)</summary>

```bash
# 1. Set up hcloud CLI
hcloud context create lightdash-dev
# Enter your API token when prompted

# 2. Upload your SSH key
hcloud ssh-key create --name my-key --public-key-from-file ~/.ssh/id_ed25519.pub

# 3. Create the server
hcloud server create \
  --name lightdash-agents \
  --type cpx42 \
  --image ubuntu-24.04 \
  --location nbg1 \
  --ssh-key my-key \
  --user-data-from-file agent-harness/cloud-init.yml
```
</details>

Cloud-init takes ~5 minutes. The script can optionally wait for it to complete.

### 3. Sync credentials

Once cloud-init completes, sync your API keys from your local machine:

```bash
# 1. Create your credentials file from the template
cp agent-harness/cloud/credentials.env.template agent-harness/cloud/credentials.env

# 2. Edit with your API keys (ANTHROPIC_AUTH_TOKEN is required)
#    Get yours by running: claude setup-token

# 3. Sync credentials to the server
./agent-harness/cloud/sync-credentials.sh <server-ip>
```

The credentials are stored in `/home/lightdash/.credentials` (mode 600) and automatically loaded in interactive bash sessions.

### 4. Set up Tailscale (optional but recommended)

```bash
# On the server:
ssh lightdash@<server-ip>
sudo tailscale up --ssh

# Once connected, you can block public SSH (Hetzner only):
./agent-harness/cloud/hetzner/secure.sh lightdash-agents
```

After this, SSH is only accessible via Tailscale (100.64.0.0/10).

### 5. SSH in and start agents

```bash
# SSH via Tailscale (if set up) or public IP
ssh lightdash@<tailscale-hostname>  # or ssh lightdash@<server-ip>
cd /opt/lightdash

./agent-harness/setup-infra.sh
./agent-harness/launch.sh 1
./agent-harness/launch.sh 2

# Start Claude Code
claude
```

### 6. Remote access tools

The VPS comes with remote access tools pre-installed for a seamless experience, especially from mobile devices.

#### Tailscale — Private VPN

If you ran `tailscale up --ssh` on the server, agent web UIs are accessible from any device on your tailnet:

```
http://<tailscale-ip>:3010  # Agent 1 frontend
http://<tailscale-ip>:8010  # Agent 1 API
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

### `cloud/hetzner/create.sh [options]`

Creates a Hetzner Cloud server with cloud-init. Handles SSH key setup, API token configuration, and server provisioning.

```bash
./agent-harness/cloud/hetzner/create.sh                    # Use defaults
./agent-harness/cloud/hetzner/create.sh --type cpx52       # Larger server
./agent-harness/cloud/hetzner/create.sh --location ash     # US East
./agent-harness/cloud/hetzner/create.sh --name my-agents   # Custom server name
./agent-harness/cloud/hetzner/create.sh --help             # Show all options
```

### `cloud/sync-credentials.sh <server> [options]`

Syncs credentials from `credentials.env` to the server via SSH. Provider-agnostic (works with any server that has SSH).

```bash
# 1. Create credentials file
cp agent-harness/cloud/credentials.env.template agent-harness/cloud/credentials.env
# Edit credentials.env with your API keys

# 2. Sync to server
./agent-harness/cloud/sync-credentials.sh 1.2.3.4
./agent-harness/cloud/sync-credentials.sh my-server.tail1234.ts.net  # Works with Tailscale hostnames too
```

| Option | Description |
|--------|-------------|
| `--env FILE` | Path to credentials file (default: `agent-harness/cloud/credentials.env`) |
| `--user USER` | SSH user (default: root) |

### `cloud/hetzner/secure.sh <server-name>`

Applies a Hetzner firewall to block public SSH. Run this after setting up Tailscale.

```bash
# First, set up Tailscale on the server
ssh lightdash@<ip> 'sudo tailscale up --ssh'

# Then apply the firewall
./agent-harness/cloud/hetzner/secure.sh lightdash-agents
```

### `cloud/hetzner/destroy.sh [--name NAME]`

Destroys a Hetzner Cloud server created by `cloud/hetzner/create.sh`.

```bash
./agent-harness/cloud/hetzner/destroy.sh                   # Delete default server
./agent-harness/cloud/hetzner/destroy.sh --name my-agents  # Delete specific server
./agent-harness/cloud/hetzner/destroy.sh --yes             # Skip confirmation
```

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

## FAQ

<details>
<summary><strong>How do migrations and seeds work?</strong></summary>

`setup-infra.sh` runs migrations and seeds **once** to create a PostgreSQL template database (`lightdash_template`). When you launch an agent, `launch.sh` creates its database using `CREATE DATABASE agent_X TEMPLATE lightdash_template`, which is a near-instant copy operation.

This means:
- All agents start with identical database state
- No per-agent migration or seed runs needed
- Template creation includes: migrations → Lightdash seed → Jaffle Shop dbt models

</details>

<details>
<summary><strong>Can agents run different migration versions?</strong></summary>

**Not by default.** All agents share the same template, so they all start with the same migration state.

**Workaround with `--worktree`:**

1. Launch an agent with an isolated worktree:
   ```bash
   ./agent-harness/launch.sh 2 --worktree
   ```

2. Switch to a branch with different migrations:
   ```bash
   cd ~/worktrees/agent-2
   git checkout feature-branch-with-new-migrations
   ```

3. Manually run migrations on that agent's database:
   ```bash
   source .env.agent.2
   pnpm -F backend migrate
   ```

The agent's database (`agent_2`) is fully isolated, so this won't affect other agents.

</details>

<details>
<summary><strong>What if Tailscale doesn't come online?</strong></summary>

If you used `hetzner-secure.sh` and public SSH is blocked:

1. **Remove the firewall temporarily:**
   ```bash
   hcloud firewall remove-from-resource lightdash-tailscale-only \
     --type server --server lightdash-agents
   ```

2. **SSH in and debug:**
   ```bash
   ssh lightdash@<public-ip>
   tail -100 /var/log/cloud-init-output.log
   sudo systemctl status tailscaled
   ```

3. **Re-add the firewall once fixed:**
   ```bash
   hcloud firewall apply-to-resource lightdash-tailscale-only \
     --type server --server lightdash-agents
   ```

Alternatively, use Hetzner's web console (Security → Reset Root Password to get console access).

</details>

<details>
<summary><strong>How do I reset an agent's database?</strong></summary>

Tear down and relaunch the agent:

```bash
./agent-harness/teardown.sh 1
./agent-harness/launch.sh 1
```

This drops the database and recreates it fresh from the template.

</details>

<details>
<summary><strong>How do I update the template database?</strong></summary>

If you've added new migrations or changed seeds:

1. Drop the existing template:
   ```bash
   psql -h localhost -p 15432 -U postgres -c "DROP DATABASE lightdash_template"
   ```

2. Re-run setup:
   ```bash
   ./agent-harness/setup-infra.sh
   ```

3. Tear down and relaunch agents to pick up the new template:
   ```bash
   ./agent-harness/teardown.sh 1
   ./agent-harness/launch.sh 1
   ```

</details>
