#!/usr/bin/env bash
# Creates a Hetzner Cloud instance for the Lightdash agent harness.
# Handles SSH key generation/upload, context setup, and instance creation.
#
# Prerequisites:
#   - hcloud CLI installed: brew install hcloud (macOS) or https://github.com/hetznercloud/cli
#   - A Hetzner Cloud account: https://console.hetzner.cloud
#
# Usage:
#   ./agent-harness/hetzner-create.sh [options]
#
# Options:
#   --name NAME           Instance name (default: lightdash-agents)
#   --type TYPE           Server type (default: cpx42 - 8 vCPU, 16GB RAM)
#   --location LOC        Location (default: nbg1 - Nuremberg)
#   --ssh-key PATH        Path to SSH public key (default: ~/.ssh/id_ed25519.pub)
#   --tailscale-key KEY   Tailscale auth key for auto-join (enables private access)
#   --help                Show this help message
#
# Examples:
#   ./agent-harness/hetzner-create.sh
#   ./agent-harness/hetzner-create.sh --name my-agents --type cpx52 --location ash
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────
SERVER_NAME="lightdash-agents"
SERVER_TYPE="cpx42"  # 8 vCPU, 16GB RAM - good for 3 agents
LOCATION="nbg1"      # Nuremberg, Germany
SSH_KEY_PATH=""
SSH_KEY_NAME="lightdash-agent-harness"
TAILSCALE_KEY=""     # Optional: auto-join Tailscale

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}==>${NC} $*"; }
success() { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}==>${NC} $*"; }
error() { echo -e "${RED}==>${NC} $*" >&2; }

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --name) SERVER_NAME="$2"; shift 2 ;;
        --type) SERVER_TYPE="$2"; shift 2 ;;
        --location) LOCATION="$2"; shift 2 ;;
        --ssh-key) SSH_KEY_PATH="$2"; shift 2 ;;
        --tailscale-key) TAILSCALE_KEY="$2"; shift 2 ;;
        --help)
            head -30 "$0" | grep "^#" | cut -c3-
            echo ""
            echo "Available server types:"
            echo "  cpx42   8 vCPU, 16GB RAM  (~€35/mo) - recommended for 3 agents"
            echo "  cpx52  12 vCPU, 24GB RAM  (~€65/mo) - for 5 agents"
            echo "  cpx62  16 vCPU, 32GB RAM  (~€95/mo) - for 5+ agents"
            echo ""
            echo "Available locations:"
            echo "  nbg1   Nuremberg, Germany (EU)"
            echo "  fsn1   Falkenstein, Germany (EU)"
            echo "  hel1   Helsinki, Finland (EU)"
            echo "  ash    Ashburn, VA (US East)"
            echo "  hil    Hillsboro, OR (US West)"
            echo "  sin    Singapore (Asia)"
            echo ""
            echo "Tailscale (optional):"
            echo "  --tailscale-key tskey-auth-xxxxx"
            echo "  Generate a reusable auth key at: https://login.tailscale.com/admin/settings/keys"
            echo "  This enables private SSH via Tailscale - no public SSH needed."
            exit 0
            ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Step 1: Check hcloud CLI ──────────────────────────────────────────────────
log "Checking hcloud CLI..."
if ! command -v hcloud &> /dev/null; then
    error "hcloud CLI not found. Install it first:"
    echo ""
    echo "  macOS:  brew install hcloud"
    echo "  Linux:  https://github.com/hetznercloud/cli#installation"
    echo ""
    exit 1
fi
success "hcloud CLI found: $(hcloud version)"

# ── Step 2: Check/setup Hetzner context ───────────────────────────────────────
log "Checking Hetzner Cloud context..."
if ! hcloud context active &> /dev/null; then
    warn "No active Hetzner context found. Let's set one up."
    echo ""
    echo "You need a Hetzner Cloud API token. To create one:"
    echo "  1. Go to https://console.hetzner.cloud"
    echo "  2. Create a project (or select existing)"
    echo "  3. Go to Security → API Tokens → Generate API Token"
    echo "  4. Give it Read & Write permissions"
    echo ""
    read -p "Enter a name for this context (e.g., lightdash-dev): " CONTEXT_NAME
    if [[ -z "$CONTEXT_NAME" ]]; then
        CONTEXT_NAME="lightdash-dev"
    fi

    echo ""
    echo "Paste your API token (it won't be displayed):"
    read -s API_TOKEN
    echo ""

    if [[ -z "$API_TOKEN" ]]; then
        error "API token cannot be empty"
        exit 1
    fi

    hcloud context create "$CONTEXT_NAME" --token "$API_TOKEN"
    success "Context '$CONTEXT_NAME' created and activated"
else
    ACTIVE_CONTEXT=$(hcloud context active)
    success "Using Hetzner context: $ACTIVE_CONTEXT"
fi

# ── Step 3: Find or create SSH key ────────────────────────────────────────────
log "Setting up SSH key..."

# Find SSH public key
if [[ -n "$SSH_KEY_PATH" ]]; then
    if [[ ! -f "$SSH_KEY_PATH" ]]; then
        error "SSH key not found: $SSH_KEY_PATH"
        exit 1
    fi
elif [[ -f "$HOME/.ssh/id_ed25519.pub" ]]; then
    SSH_KEY_PATH="$HOME/.ssh/id_ed25519.pub"
elif [[ -f "$HOME/.ssh/id_rsa.pub" ]]; then
    SSH_KEY_PATH="$HOME/.ssh/id_rsa.pub"
else
    warn "No SSH key found. Creating one..."
    SSH_KEY_PATH="$HOME/.ssh/id_ed25519.pub"
    ssh-keygen -t ed25519 -f "${SSH_KEY_PATH%.pub}" -N "" -C "lightdash-agent-harness"
    success "Created SSH key: $SSH_KEY_PATH"
fi

log "Using SSH key: $SSH_KEY_PATH"

# Get fingerprint of local key
LOCAL_FINGERPRINT=$(ssh-keygen -lf "$SSH_KEY_PATH" | awk '{print $2}')
log "Local key fingerprint: $LOCAL_FINGERPRINT"

# Check if this exact key (by fingerprint) is already in Hetzner
EXISTING_KEY_NAME=$(hcloud ssh-key list -o noheader -o columns=name,fingerprint | grep "$LOCAL_FINGERPRINT" | awk '{print $1}' || true)

if [[ -n "$EXISTING_KEY_NAME" ]]; then
    SSH_KEY_NAME="$EXISTING_KEY_NAME"
    log "SSH key already in Hetzner as '$SSH_KEY_NAME'"
else
    # Key not in Hetzner - upload it with a unique name based on fingerprint
    SHORT_FP=$(echo "$LOCAL_FINGERPRINT" | sed 's/SHA256://' | cut -c1-8)
    SSH_KEY_NAME="lightdash-${SHORT_FP}"

    log "Uploading SSH key to Hetzner as '$SSH_KEY_NAME'..."
    hcloud ssh-key create --name "$SSH_KEY_NAME" --public-key-from-file "$SSH_KEY_PATH"
    success "SSH key uploaded"
fi

# ── Step 4: Check if server already exists ────────────────────────────────────
log "Checking for existing server..."
EXISTING_SERVER=$(hcloud server list -o noheader -o columns=name | grep -x "$SERVER_NAME" || true)
if [[ -n "$EXISTING_SERVER" ]]; then
    error "Server '$SERVER_NAME' already exists!"
    echo ""
    echo "Options:"
    echo "  1. Delete it first:  hcloud server delete $SERVER_NAME"
    echo "  2. Use a different name:  $0 --name different-name"
    echo ""
    exit 1
fi

# ── Step 5: Verify server type and location ───────────────────────────────────
log "Verifying server type '$SERVER_TYPE' in location '$LOCATION'..."

# Check if server type exists
if ! hcloud server-type describe "$SERVER_TYPE" &> /dev/null; then
    error "Server type '$SERVER_TYPE' not found"
    echo ""
    echo "Available server types:"
    hcloud server-type list -o columns=name,cores,memory,disk | head -20
    exit 1
fi

# Check if location exists
if ! hcloud location describe "$LOCATION" &> /dev/null; then
    error "Location '$LOCATION' not found"
    echo ""
    echo "Available locations:"
    hcloud location list
    exit 1
fi

# ── Step 6: Create the server ─────────────────────────────────────────────────
log "Creating server '$SERVER_NAME'..."
echo "  Type:     $SERVER_TYPE"
echo "  Location: $LOCATION"
echo "  SSH Key:  $SSH_KEY_NAME"
if [[ -n "$TAILSCALE_KEY" ]]; then
    echo "  Tailscale: auto-join enabled"
fi
echo ""

CLOUD_INIT_FILE="$SCRIPT_DIR/cloud-init.yml"
if [[ ! -f "$CLOUD_INIT_FILE" ]]; then
    error "cloud-init.yml not found at: $CLOUD_INIT_FILE"
    exit 1
fi

# If Tailscale key provided, create modified cloud-init with auto-join
CLOUD_INIT_FINAL="$CLOUD_INIT_FILE"
if [[ -n "$TAILSCALE_KEY" ]]; then
    log "Configuring Tailscale auto-join..."
    CLOUD_INIT_FINAL=$(mktemp)
    trap "rm -f $CLOUD_INIT_FINAL" EXIT

    # Copy original and add Tailscale auth command before the final_message
    sed '/^final_message:/i\
  # -- Auto-join Tailscale with SSH enabled ------------------------------------\
  - |\
    tailscale up --authkey='"$TAILSCALE_KEY"' --ssh --accept-routes\
    echo "Tailscale: joined network with SSH enabled"\
' "$CLOUD_INIT_FILE" > "$CLOUD_INIT_FINAL"
fi

# Create the server
OUTPUT=$(hcloud server create \
    --name "$SERVER_NAME" \
    --type "$SERVER_TYPE" \
    --image ubuntu-24.04 \
    --location "$LOCATION" \
    --ssh-key "$SSH_KEY_NAME" \
    --user-data-from-file "$CLOUD_INIT_FINAL" 2>&1)

echo "$OUTPUT"

# Extract IP address
SERVER_IP=$(echo "$OUTPUT" | grep -oE 'IPv4: [0-9.]+' | cut -d' ' -f2)

if [[ -z "$SERVER_IP" ]]; then
    error "Failed to get server IP"
    exit 1
fi

success "Server created successfully!"
echo ""

# ── Step 7: Print next steps ──────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                        Lightdash Agent Harness                               ║"
echo "╠══════════════════════════════════════════════════════════════════════════════╣"
echo "║  Server: $SERVER_NAME"
echo "║  IP:     $SERVER_IP"
echo "║  Type:   $SERVER_TYPE"
if [[ -n "$TAILSCALE_KEY" ]]; then
echo "║  Tailscale: auto-join enabled (will join your tailnet automatically)"
fi
echo "╠══════════════════════════════════════════════════════════════════════════════╣"
echo "║  Cloud-init is now running (takes ~5 minutes).                               ║"
echo "║                                                                              ║"
echo "║  Monitor progress:                                                           ║"
echo "║    ssh root@$SERVER_IP 'tail -f /var/log/cloud-init-output.log'"
echo "║                                                                              ║"
echo "║  Once complete, run:                                                         ║"
if [[ -n "$TAILSCALE_KEY" ]]; then
echo "║    ssh root@<tailscale-hostname>     # or use public IP                      ║"
else
echo "║    ssh root@$SERVER_IP"
fi
echo "║    sudo -iu lightdash                                                        ║"
echo "║    cd /opt/lightdash                                                         ║"
echo "║    ./agent-harness/setup-infra.sh                                            ║"
echo "║    ./agent-harness/launch.sh 1                                               ║"
echo "║                                                                              ║"
if [[ -z "$TAILSCALE_KEY" ]]; then
echo "║  Remote access setup:                                                        ║"
echo "║    sudo tailscale up --ssh    # Join your Tailscale network                  ║"
echo "║    happy --auth               # Mobile Claude Code client                    ║"
echo "║    mosh root@$SERVER_IP       # Roaming-friendly SSH"
else
echo "║  Tailscale SSH is auto-enabled. Once cloud-init completes:                   ║"
echo "║    - Find hostname: tailscale status | grep $SERVER_IP"
echo "║    - SSH via Tailscale: ssh root@<tailscale-hostname>                        ║"
echo "║    - You can now disable public SSH if desired                               ║"
fi
echo "╠══════════════════════════════════════════════════════════════════════════════╣"
echo "║  Useful commands:                                                            ║"
echo "║    hcloud server ssh $SERVER_NAME              # SSH via hcloud"
echo "║    hcloud server delete $SERVER_NAME           # Delete server"
echo "║    hcloud server list                          # List all servers            ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"

# ── Optional: Wait for cloud-init ─────────────────────────────────────────────
echo ""
read -p "Wait for cloud-init to complete? [y/N] " WAIT_RESPONSE
if [[ "$WAIT_RESPONSE" =~ ^[Yy]$ ]]; then
    log "Waiting for cloud-init to complete..."
    echo "  (This typically takes 4-6 minutes)"
    echo ""

    # Wait for SSH to be available
    log "Waiting for SSH..."
    for i in {1..30}; do
        if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes \
            root@"$SERVER_IP" "exit" 2>/dev/null; then
            break
        fi
        sleep 5
    done

    # Wait for cloud-init complete marker
    log "Waiting for cloud-init to finish..."
    while true; do
        if ssh -o StrictHostKeyChecking=no root@"$SERVER_IP" \
            "test -f /opt/lightdash/.cloud-init-complete" 2>/dev/null; then
            break
        fi
        sleep 10
        echo -n "."
    done
    echo ""

    success "Cloud-init complete!"
    echo ""
    echo "You can now SSH in and run:"
    echo "  ssh root@$SERVER_IP"
    echo "  sudo -iu lightdash"
    echo "  cd /opt/lightdash && ./agent-harness/setup-infra.sh && ./agent-harness/launch.sh 1"
fi
