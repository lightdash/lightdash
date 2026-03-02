#!/usr/bin/env bash
# Syncs credentials from a local .env file to a remote server.
# Credentials are written to ~/.credentials which is sourced in interactive bash sessions.
#
# Usage:
#   ./agent-harness/sync-credentials.sh <server> [options]
#
# Arguments:
#   server              IP address, hostname, or Tailscale hostname
#
# Options:
#   --env FILE          Path to credentials file (default: agent-harness/credentials.env)
#   --user USER         SSH user (default: root)
#   --help              Show this help message
#
# Setup:
#   1. Copy the template:  cp agent-harness/credentials.env.template agent-harness/credentials.env
#   2. Edit credentials.env with your API keys
#   3. Run this script:    ./agent-harness/sync-credentials.sh <server-ip>
#
# Examples:
#   ./agent-harness/sync-credentials.sh 1.2.3.4
#   ./agent-harness/sync-credentials.sh my-server.tail1234.ts.net
#   ./agent-harness/sync-credentials.sh 1.2.3.4 --env ~/my-credentials.env
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────
SERVER=""
SSH_USER="root"
ENV_FILE="$SCRIPT_DIR/credentials.env"

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
        --env) ENV_FILE="$2"; shift 2 ;;
        --user) SSH_USER="$2"; shift 2 ;;
        --help)
            head -30 "$0" | grep "^#" | cut -c3-
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
    echo ""
    echo "Usage: $0 <server> [options]"
    echo ""
    echo "Setup:"
    echo "  1. cp agent-harness/credentials.env.template agent-harness/credentials.env"
    echo "  2. Edit credentials.env with your API keys"
    echo "  3. $0 <server-ip>"
    echo ""
    echo "Run '$0 --help' for more information."
    exit 1
fi

# ── Load and validate credentials file ────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
    error "Credentials file not found: $ENV_FILE"
    echo ""
    echo "Create it from the template:"
    echo "  cp agent-harness/credentials.env.template agent-harness/credentials.env"
    echo "  # Edit credentials.env with your API keys"
    exit 1
fi

log "Loading credentials from $ENV_FILE..."

# Read the env file and filter out comments and empty lines
CREDENTIALS_CONTENT="# Credentials synced by agent-harness/sync-credentials.sh
# Source: $ENV_FILE
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
"

# Read each non-comment, non-empty line and add export
while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip comments and empty lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    # Add export prefix if not already present
    if [[ "$line" =~ ^[A-Z_]+= ]]; then
        CREDENTIALS_CONTENT+="export $line
"
    fi
done < "$ENV_FILE"

# Check that we have at least ANTHROPIC_AUTH_TOKEN
if ! grep -q "ANTHROPIC_AUTH_TOKEN=" "$ENV_FILE" 2>/dev/null || \
   grep "ANTHROPIC_AUTH_TOKEN=" "$ENV_FILE" | grep -q "ANTHROPIC_AUTH_TOKEN=$"; then
    error "ANTHROPIC_AUTH_TOKEN is not set in $ENV_FILE"
    exit 1
fi

success "Credentials loaded"

# ── Test SSH connection ───────────────────────────────────────────────────────
log "Testing SSH connection to $SSH_USER@$SERVER..."
# Use StrictHostKeyChecking=accept-new to auto-accept new hosts but warn on changed keys
if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER" "exit" 2>/dev/null; then
    error "Cannot connect to $SSH_USER@$SERVER"
    echo ""
    echo "Make sure:"
    echo "  1. The server is running and SSH is available"
    echo "  2. Your SSH key is authorized on the server"
    echo "  3. Any firewall allows SSH from your IP"
    echo ""
    echo "If you recreated the server, remove the old host key:"
    echo "  ssh-keygen -R $SERVER"
    exit 1
fi
success "SSH connection successful"

# ── Upload credentials ────────────────────────────────────────────────────────
log "Uploading credentials to server..."

ssh -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER" bash <<EOF
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

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
success "Credentials synced successfully!"
echo ""
echo "  To verify, SSH in and check:"
echo "    ssh lightdash@${SERVER}"
echo "    echo \$ANTHROPIC_AUTH_TOKEN"
echo ""
echo "  To start Claude Code:"
echo "    claude"
echo ""
echo "  To set up Tailscale (optional):"
echo "    ssh lightdash@${SERVER} 'sudo tailscale up --ssh'"
