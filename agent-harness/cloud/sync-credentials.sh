#!/usr/bin/env bash
# Syncs credentials from a local .env file to a remote server.
# Credentials are written to ~/.credentials which is sourced in interactive bash sessions.
# Optionally syncs SSH key for git commit signing and GitHub push access.
#
# Usage:
#   ./agent-harness/cloud/sync-credentials.sh <server> [options]
#
# Arguments:
#   server              IP address, hostname, or Tailscale hostname
#
# Options:
#   --env FILE          Path to credentials file (default: agent-harness/cloud/credentials.env)
#   --ssh-key PATH      Path to SSH private key to sync for git signing/push (e.g., ~/.ssh/id_ed25519)
#   --git-name NAME     Git user.name for commits (default: from local git config)
#   --git-email EMAIL   Git user.email for commits (default: from local git config)
#   --user USER         SSH user (default: root)
#   --help              Show this help message
#
# Setup:
#   1. Copy the template:  cp agent-harness/cloud/credentials.env.template agent-harness/cloud/credentials.env
#   2. Edit credentials.env with your API keys
#   3. Run this script:    ./agent-harness/cloud/sync-credentials.sh <server-ip>
#
# Examples:
#   ./agent-harness/cloud/sync-credentials.sh 1.2.3.4
#   ./agent-harness/cloud/sync-credentials.sh my-server.tail1234.ts.net --ssh-key ~/.ssh/id_ed25519
#   ./agent-harness/cloud/sync-credentials.sh 1.2.3.4 --env ~/my-credentials.env
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────
SERVER=""
SSH_USER="root"
ENV_FILE="$SCRIPT_DIR/credentials.env"
SSH_KEY_PATH=""
GIT_NAME=""
GIT_EMAIL=""

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
        --ssh-key) SSH_KEY_PATH="$2"; shift 2 ;;
        --git-name) GIT_NAME="$2"; shift 2 ;;
        --git-email) GIT_EMAIL="$2"; shift 2 ;;
        --user) SSH_USER="$2"; shift 2 ;;
        --help)
            head -35 "$0" | grep "^#" | cut -c3-
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
    echo "  1. cp agent-harness/cloud/credentials.env.template agent-harness/cloud/credentials.env"
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
    echo "  cp agent-harness/cloud/credentials.env.template agent-harness/cloud/credentials.env"
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

# ── Upload SSH key for git signing/push (optional) ───────────────────────────
if [[ -n "$SSH_KEY_PATH" ]]; then
    if [[ ! -f "$SSH_KEY_PATH" ]]; then
        error "SSH key not found: $SSH_KEY_PATH"
        exit 1
    fi

    # Determine key filename
    SSH_KEY_NAME=$(basename "$SSH_KEY_PATH")
    SSH_PUB_PATH="${SSH_KEY_PATH}.pub"

    if [[ ! -f "$SSH_PUB_PATH" ]]; then
        error "SSH public key not found: $SSH_PUB_PATH"
        exit 1
    fi

    log "Syncing SSH key for git signing and GitHub access..."

    # Get git config from local if not specified
    if [[ -z "$GIT_NAME" ]]; then
        GIT_NAME=$(git config --global user.name 2>/dev/null || echo "")
    fi
    if [[ -z "$GIT_EMAIL" ]]; then
        GIT_EMAIL=$(git config --global user.email 2>/dev/null || echo "")
    fi

    if [[ -z "$GIT_NAME" ]] || [[ -z "$GIT_EMAIL" ]]; then
        warn "Git name/email not configured. Use --git-name and --git-email or set locally with:"
        echo "  git config --global user.name 'Your Name'"
        echo "  git config --global user.email 'you@example.com'"
        exit 1
    fi

    log "  Git user: $GIT_NAME <$GIT_EMAIL>"

    # Read public key for display later
    SSH_PUBLIC_KEY=$(cat "$SSH_PUB_PATH")

    # Prepare .ssh directory on server
    ssh -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER" bash <<'PREPEOF'
mkdir -p /home/lightdash/.ssh
chmod 700 /home/lightdash/.ssh
chown lightdash:lightdash /home/lightdash/.ssh
PREPEOF

    # Securely copy keys using scp (encrypted transfer, no shell expansion)
    log "Copying SSH keys via scp..."
    scp -o StrictHostKeyChecking=accept-new "$SSH_KEY_PATH" "$SSH_USER@$SERVER:/home/lightdash/.ssh/${SSH_KEY_NAME}"
    scp -o StrictHostKeyChecking=accept-new "$SSH_PUB_PATH" "$SSH_USER@$SERVER:/home/lightdash/.ssh/${SSH_KEY_NAME}.pub"

    # Configure permissions and git on server
    ssh -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER" bash <<SSHEOF
# Secure key permissions
chmod 600 /home/lightdash/.ssh/${SSH_KEY_NAME}
chmod 644 /home/lightdash/.ssh/${SSH_KEY_NAME}.pub
chown lightdash:lightdash /home/lightdash/.ssh/${SSH_KEY_NAME}
chown lightdash:lightdash /home/lightdash/.ssh/${SSH_KEY_NAME}.pub

# Configure SSH to use this key for GitHub
cat > /home/lightdash/.ssh/config << 'SSHCONFIG'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/${SSH_KEY_NAME}
    IdentitiesOnly yes
SSHCONFIG
chmod 600 /home/lightdash/.ssh/config
chown lightdash:lightdash /home/lightdash/.ssh/config

# Configure git for the lightdash user
su - lightdash -c "git config --global user.name '${GIT_NAME}'"
su - lightdash -c "git config --global user.email '${GIT_EMAIL}'"
su - lightdash -c "git config --global gpg.format ssh"
su - lightdash -c "git config --global user.signingkey ~/.ssh/${SSH_KEY_NAME}.pub"
su - lightdash -c "git config --global commit.gpgsign true"
su - lightdash -c "git config --global tag.gpgsign true"

# Add GitHub to known_hosts to avoid prompts
ssh-keyscan github.com >> /home/lightdash/.ssh/known_hosts 2>/dev/null
chown lightdash:lightdash /home/lightdash/.ssh/known_hosts
chmod 600 /home/lightdash/.ssh/known_hosts
SSHEOF

    success "SSH key synced and git configured for signing"

    # Verify the lightdash user can read the key
    log "Verifying key is accessible by lightdash user..."
    if ssh -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER" "su - lightdash -c 'test -r ~/.ssh/${SSH_KEY_NAME}'"; then
        success "Key is readable by lightdash user"
    else
        error "Key is NOT readable by lightdash user - check permissions"
        exit 1
    fi

    # Test GitHub connection (will fail if key not added to GitHub, but shows if SSH works)
    log "Testing SSH connection to GitHub (will fail if key not yet added to GitHub)..."
    GITHUB_TEST=$(ssh -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER" "su - lightdash -c 'ssh -T git@github.com 2>&1'" || true)
    if echo "$GITHUB_TEST" | grep -q "successfully authenticated"; then
        success "GitHub authentication working!"
    else
        warn "GitHub auth not yet working (add key to GitHub - see instructions below)"
    fi

    echo ""
    echo "════════════════════════════════════════════════════════════════════════════════"
    echo "  IMPORTANT: Add this key to GitHub for push and commit signing to work!"
    echo "════════════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "  1. Go to: https://github.com/settings/keys"
    echo ""
    echo "  2. Click 'New SSH key' and add as AUTHENTICATION key (for git push):"
    echo "     Title: lightdash-agents"
    echo "     Key type: Authentication Key"
    echo ""
    echo "  3. Click 'New SSH key' again and add as SIGNING key (for verified commits):"
    echo "     Title: lightdash-agents-signing"
    echo "     Key type: Signing Key"
    echo ""
    echo "  Public key to copy:"
    echo "  ┌────────────────────────────────────────────────────────────────────────────"
    echo "  │ ${SSH_PUBLIC_KEY}"
    echo "  └────────────────────────────────────────────────────────────────────────────"
    echo ""
    echo "  Server config:"
    echo "    Private key: ~/.ssh/${SSH_KEY_NAME}"
    echo "    Git signing: Enabled (SSH format)"
    echo "    Git user:    ${GIT_NAME} <${GIT_EMAIL}>"
    echo ""
fi

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
