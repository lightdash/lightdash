# Cloud Deployment

Run the agent harness on a remote VPS for always-on agents or mobile prompting.

## Hetzner Cloud

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
  --user-data-from-file agent-harness/cloud/cloud-init.yml
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

## Remote Access Tools

The VPS comes with remote access tools pre-installed for a seamless experience, especially from mobile devices.

### Tailscale — Private VPN

If you ran `tailscale up --ssh` on the server, agent web UIs are accessible from any device on your tailnet:

```
http://<tailscale-ip>:3010  # Agent 1 frontend
http://<tailscale-ip>:8010  # Agent 1 API
```

### tmux — Session persistence

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

### mosh — Roaming-friendly SSH

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

### Happy Coder — Mobile Claude Code client

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

## Recommended Remote Workflow

1. **Provision** the VPS with `cloud-init.yml`
2. **Join Tailscale**: `sudo tailscale up --ssh`
3. **Connect via mosh**: `mosh lightdash@<ts-hostname> -- tmux new -s agents`
4. **Set up infra**: `./agent-harness/setup-infra.sh`
5. **Launch agents** in tmux windows: `./agent-harness/launch.sh 1`, etc.
6. **Pair phone**: `happy --auth` in a tmux pane, scan QR
7. **Go mobile**: monitor and prompt from your phone via Happy
8. **Return to laptop**: `mosh lightdash@<ts-hostname> -- tmux attach -t agents`

## Scripts Reference

### `hetzner/create.sh [options]`

Creates a Hetzner Cloud server with cloud-init. Handles SSH key setup, API token configuration, and server provisioning.

```bash
./agent-harness/cloud/hetzner/create.sh                    # Use defaults
./agent-harness/cloud/hetzner/create.sh --type cpx52       # Larger server
./agent-harness/cloud/hetzner/create.sh --location ash     # US East
./agent-harness/cloud/hetzner/create.sh --name my-agents   # Custom server name
./agent-harness/cloud/hetzner/create.sh --help             # Show all options
```

### `sync-credentials.sh <server> [options]`

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

### `hetzner/secure.sh <server-name>`

Applies a Hetzner firewall to block public SSH. Run this after setting up Tailscale.

```bash
# First, set up Tailscale on the server
ssh lightdash@<ip> 'sudo tailscale up --ssh'

# Then apply the firewall
./agent-harness/cloud/hetzner/secure.sh lightdash-agents
```

### `hetzner/destroy.sh [--name NAME]`

Destroys a Hetzner Cloud server created by `hetzner/create.sh`.

```bash
./agent-harness/cloud/hetzner/destroy.sh                   # Delete default server
./agent-harness/cloud/hetzner/destroy.sh --name my-agents  # Delete specific server
./agent-harness/cloud/hetzner/destroy.sh --yes             # Skip confirmation
```

## Troubleshooting

### What if Tailscale doesn't come online?

If you used `hetzner/secure.sh` and public SSH is blocked:

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
