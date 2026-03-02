#!/usr/bin/env bash
# Destroys a Hetzner Cloud instance created by hetzner-create.sh
#
# Usage:
#   ./agent-harness/hetzner-destroy.sh [--name NAME]
#
# Options:
#   --name NAME    Instance name (default: lightdash-agents)
#   --yes          Skip confirmation prompt
#
set -euo pipefail

SERVER_NAME="lightdash-agents"
SKIP_CONFIRM=false

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
        --name) SERVER_NAME="$2"; shift 2 ;;
        --yes|-y) SKIP_CONFIRM=true; shift ;;
        --help)
            head -15 "$0" | grep "^#" | cut -c3-
            exit 0
            ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Check if server exists ────────────────────────────────────────────────────
log "Looking for server '$SERVER_NAME'..."

if ! hcloud server describe "$SERVER_NAME" &> /dev/null; then
    error "Server '$SERVER_NAME' not found"
    echo ""
    echo "Available servers:"
    hcloud server list
    exit 1
fi

# Get server info
SERVER_INFO=$(hcloud server describe "$SERVER_NAME" -o format='{{.PublicNet.IPv4.IP}} ({{.ServerType.Name}}, {{.Datacenter.Location.Name}})')
echo "  Found: $SERVER_INFO"

# ── Confirm deletion ──────────────────────────────────────────────────────────
if [[ "$SKIP_CONFIRM" != true ]]; then
    echo ""
    warn "This will permanently delete the server and all its data!"
    read -p "Are you sure you want to delete '$SERVER_NAME'? [y/N] " RESPONSE
    if [[ ! "$RESPONSE" =~ ^[Yy]$ ]]; then
        log "Aborted."
        exit 0
    fi
fi

# ── Delete the server ─────────────────────────────────────────────────────────
log "Deleting server '$SERVER_NAME'..."
hcloud server delete "$SERVER_NAME"

success "Server '$SERVER_NAME' deleted."
