#!/usr/bin/env bash
# Syncs credentials from local environment to a remote server.
# Credentials are written to ~/.credentials which is sourced in interactive bash sessions.
#
# Usage:
#   ./agent-harness/sync-credentials.sh <server> [options]
#
# Arguments:
#   server              IP address, hostname, or Tailscale hostname
#
# Options:
#   --user USER         SSH user (default: root)
#   --setup-tailscale   Run 'tailscale up' after syncing credentials
#   --secure            Apply firewall to block public SSH (requires Tailscale)
#   --help              Show this help message
#
# Required environment variables:
#   ANTHROPIC_API_KEY   API key for Claude Code
#
# Optional environment variables:
#   TAILSCALE_AUTH_KEY  Auth key for Tailscale (required if --setup-tailscale)
#
# The script writes credentials to /home/lightdash/.credentials on the server,
# which is automatically sourced in interactive bash sessions.
#
# Examples:
#   # Basic sync
#   ANTHROPIC_API_KEY=sk-xxx ./agent-harness/sync-credentials.sh 1.2.3.4
#
#   # Sync and set up Tailscale
#   ANTHROPIC_API_KEY=sk-xxx TAILSCALE_AUTH_KEY=tskey-xxx \
#     ./agent-harness/sync-credentials.sh 1.2.3.4 --setup-tailscale
#
#   # Full setup: sync, Tailscale, then block public SSH
#   ANTHROPIC_API_KEY=sk-xxx TAILSCALE_AUTH_KEY=tskey-xxx \
#     ./agent-harness/sync-credentials.sh 1.2.3.4 --setup-tailscale --secure
#
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
SERVER=""
SSH_USER="root"
SETUP_TAILSCALE=false
SECURE_SERVER=false

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}==>${NC} $*"; }
success() { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}==>${NC} $*"; }
error() { echo -e "${RED}==>${NC} $*" >&2; }

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --user) SSH_USER="$2"; shift 2 ;;
        --setup-tailscale) SETUP_TAILSCALE=true; shift ;;
        --secure) SECURE_SERVER=true; shift ;;
        --help)
            head -40 "$0" | grep "^#" | cut -c3-
            exit 0
            ;;
        -*)
            error "Unknown option: $1"
            exit 1
            ;;
        *)
            if [[ -z "$SERVER" ]]; then
                SERVER="$1"
            else
                error "Unexpected argument: $1"
                exit 1
            fi
            shift
            ;;
    esac
done

if [[ -z "$SERVER" ]]; then
    error "Missing required argument: server"
    echo "Usage: $0 <server> [options]"
    echo "Run '$0 --help' for more information."
    exit 1
fi

# ── Validate environment variables ────────────────────────────────────────────
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    error "ANTHROPIC_API_KEY environment variable is required"
    exit 1
fi

if [[ "$SETUP_TAILSCALE" == true ]] && [[ -z "${TAILSCALE_AUTH_KEY:-}" ]]; then
    error "TAILSCALE_AUTH_KEY environment variable is required when using --setup-tailscale"
    exit 1
fi

if [[ "$SECURE_SERVER" == true ]] && [[ "$SETUP_TAILSCALE" != true ]]; then
    error "--secure requires --setup-tailscale (need Tailscale before blocking public SSH)"
    exit 1
fi

# ── Step 1: Test SSH connection ───────────────────────────────────────────────
log "Testing SSH connection to $SSH_USER@$SERVER..."
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SSH_USER@$SERVER" "exit" 2>/dev/null; then
    error "Cannot connect to $SSH_USER@$SERVER"
    echo ""
    echo "Make sure:"
    echo "  1. The server is running and SSH is available"
    echo "  2. Your SSH key is authorized on the server"
    echo "  3. The firewall allows SSH from your IP"
    exit 1
fi
success "SSH connection successful"

# ── Step 2: Build credentials file content ────────────────────────────────────
log "Preparing credentials..."

CREDENTIALS_CONTENT="# Credentials synced by agent-harness/sync-credentials.sh
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)

export ANTHROPIC_API_KEY='${ANTHROPIC_API_KEY}'
"

if [[ -n "${TAILSCALE_AUTH_KEY:-}" ]]; then
    CREDENTIALS_CONTENT+="export TAILSCALE_AUTH_KEY='${TAILSCALE_AUTH_KEY}'
"
fi

# ── Step 3: Upload credentials ────────────────────────────────────────────────
log "Uploading credentials to server..."

ssh "$SSH_USER@$SERVER" bash <<EOF
# Write credentials file
cat > /home/lightdash/.credentials << 'CREDENTIALS'
${CREDENTIALS_CONTENT}
CREDENTIALS

# Secure permissions
chown lightdash:lightdash /home/lightdash/.credentials
chmod 600 /home/lightdash/.credentials

# Ensure credentials are sourced in interactive sessions
PROFILE_SCRIPT="/home/lightdash/.profile.d/credentials.sh"
cat > "\$PROFILE_SCRIPT" << 'PROFILE'
# Source credentials if available
if [ -f /home/lightdash/.credentials ]; then
    source /home/lightdash/.credentials
fi
PROFILE
chown lightdash:lightdash "\$PROFILE_SCRIPT"
chmod 644 "\$PROFILE_SCRIPT"
EOF

success "Credentials uploaded to /home/lightdash/.credentials"

# ── Step 4: Set up Tailscale (optional) ───────────────────────────────────────
if [[ "$SETUP_TAILSCALE" == true ]]; then
    log "Setting up Tailscale..."

    TAILSCALE_OUTPUT=$(ssh "$SSH_USER@$SERVER" bash <<EOF
        # Run tailscale up with the auth key
        tailscale up --authkey='${TAILSCALE_AUTH_KEY}' --ssh --accept-routes 2>&1

        # Wait a moment for Tailscale to connect
        sleep 3

        # Get Tailscale hostname
        tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//'
EOF
    )

    TAILSCALE_HOSTNAME=$(echo "$TAILSCALE_OUTPUT" | tail -1)

    if [[ -n "$TAILSCALE_HOSTNAME" ]] && [[ "$TAILSCALE_HOSTNAME" != "null" ]]; then
        success "Tailscale connected: $TAILSCALE_HOSTNAME"
        echo ""
        echo "  You can now SSH via Tailscale:"
        echo "    ssh lightdash@$TAILSCALE_HOSTNAME"
    else
        warn "Tailscale may not have connected properly. Check with: ssh $SSH_USER@$SERVER 'tailscale status'"
    fi
fi

# ── Step 5: Secure server (optional) ──────────────────────────────────────────
if [[ "$SECURE_SERVER" == true ]]; then
    log "Applying firewall to block public SSH..."

    FIREWALL_NAME="lightdash-tailscale-only"

    # Check if firewall exists, create if not
    if ! hcloud firewall describe "$FIREWALL_NAME" &> /dev/null; then
        log "Creating firewall '$FIREWALL_NAME'..."
        hcloud firewall create --name "$FIREWALL_NAME"

        # SSH only from Tailscale
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in --protocol tcp --port 22 \
            --source-ips 100.64.0.0/10 \
            --description "SSH from Tailscale only"

        # mosh from anywhere
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in --protocol udp --port 60000-61000 \
            --source-ips 0.0.0.0/0 --source-ips ::/0 \
            --description "mosh UDP"

        # HTTP/HTTPS
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in --protocol tcp --port 80 \
            --source-ips 0.0.0.0/0 --source-ips ::/0 \
            --description "HTTP"
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in --protocol tcp --port 443 \
            --source-ips 0.0.0.0/0 --source-ips ::/0 \
            --description "HTTPS"

        # Agent ports
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in --protocol tcp --port 3010-3050 \
            --source-ips 0.0.0.0/0 --source-ips ::/0 \
            --description "Agent frontends"
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in --protocol tcp --port 8010-8050 \
            --source-ips 0.0.0.0/0 --source-ips ::/0 \
            --description "Agent APIs"

        # ICMP
        hcloud firewall add-rule "$FIREWALL_NAME" \
            --direction in --protocol icmp \
            --source-ips 0.0.0.0/0 --source-ips ::/0 \
            --description "ICMP ping"
    fi

    # Get server name from IP (for hcloud command)
    SERVER_NAME=$(hcloud server list -o noheader -o columns=name,ipv4 | grep "$SERVER" | awk '{print $1}' || true)

    if [[ -n "$SERVER_NAME" ]]; then
        hcloud firewall apply-to-resource "$FIREWALL_NAME" --type server --server "$SERVER_NAME"
        success "Firewall applied. Public SSH is now blocked."
        echo ""
        echo "  SSH is now only accessible via Tailscale:"
        echo "    ssh lightdash@$TAILSCALE_HOSTNAME"
    else
        warn "Could not find server in hcloud. Apply firewall manually:"
        echo "    hcloud firewall apply-to-resource $FIREWALL_NAME --type server --server <server-name>"
    fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
success "Credentials synced successfully!"
echo ""
echo "  The lightdash user now has access to:"
echo "    - ANTHROPIC_API_KEY"
if [[ -n "${TAILSCALE_AUTH_KEY:-}" ]]; then
    echo "    - TAILSCALE_AUTH_KEY"
fi
echo ""
echo "  To verify, SSH in and run:"
echo "    ssh ${SSH_USER}@${SERVER}"
echo "    sudo -iu lightdash"
echo "    echo \$ANTHROPIC_API_KEY"
echo ""
if [[ "$SETUP_TAILSCALE" == true ]] && [[ -n "${TAILSCALE_HOSTNAME:-}" ]]; then
    echo "  Or via Tailscale:"
    echo "    ssh lightdash@$TAILSCALE_HOSTNAME"
    echo ""
fi
echo "  To start Claude Code:"
echo "    claude"
