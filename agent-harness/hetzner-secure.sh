#!/usr/bin/env bash
# Applies Hetzner firewall to block public SSH (Tailscale-only access).
# Run this AFTER setting up Tailscale on the server.
#
# Usage:
#   ./agent-harness/hetzner-secure.sh <server-name>
#
# Prerequisites:
#   - Tailscale must be running on the server: ssh lightdash@<ip> 'sudo tailscale up --ssh'
#   - hcloud CLI must be configured
#
# What this does:
#   1. Creates a firewall (if it doesn't exist) that:
#      - Allows SSH only from Tailscale IPs (100.64.0.0/10)
#      - Allows mosh, HTTP, HTTPS, and agent ports from anywhere
#   2. Applies the firewall to the specified server
#
# Examples:
#   ./agent-harness/hetzner-secure.sh lightdash-agents
#
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
SERVER_NAME="${1:-}"
FIREWALL_NAME="lightdash-tailscale-only"

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

# ── Validate arguments ────────────────────────────────────────────────────────
if [[ -z "$SERVER_NAME" ]]; then
    error "Missing required argument: server-name"
    echo ""
    echo "Usage: $0 <server-name>"
    echo ""
    echo "List your servers with: hcloud server list"
    exit 1
fi

if [[ "$SERVER_NAME" == "--help" ]] || [[ "$SERVER_NAME" == "-h" ]]; then
    head -25 "$0" | grep "^#" | cut -c3-
    exit 0
fi

# ── Check hcloud CLI ──────────────────────────────────────────────────────────
if ! command -v hcloud &> /dev/null; then
    error "hcloud CLI not found. This script is Hetzner-specific."
    exit 1
fi

# ── Verify server exists ──────────────────────────────────────────────────────
log "Checking server '$SERVER_NAME'..."
if ! hcloud server describe "$SERVER_NAME" &> /dev/null; then
    error "Server '$SERVER_NAME' not found"
    echo ""
    echo "Available servers:"
    hcloud server list
    exit 1
fi

SERVER_IP=$(hcloud server describe "$SERVER_NAME" -o format='{{.PublicNet.IPv4.IP}}')
success "Found server: $SERVER_IP"

# ── Create firewall if needed ─────────────────────────────────────────────────
if hcloud firewall describe "$FIREWALL_NAME" &> /dev/null; then
    log "Firewall '$FIREWALL_NAME' already exists"
else
    log "Creating firewall '$FIREWALL_NAME'..."
    hcloud firewall create --name "$FIREWALL_NAME"

    # SSH only from Tailscale CGNAT range
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

    # Agent ports (3010-3050 frontend, 8010-8050 API)
    hcloud firewall add-rule "$FIREWALL_NAME" \
        --direction in --protocol tcp --port 3010-3050 \
        --source-ips 0.0.0.0/0 --source-ips ::/0 \
        --description "Agent frontends"
    hcloud firewall add-rule "$FIREWALL_NAME" \
        --direction in --protocol tcp --port 8010-8050 \
        --source-ips 0.0.0.0/0 --source-ips ::/0 \
        --description "Agent APIs"

    # ICMP (ping)
    hcloud firewall add-rule "$FIREWALL_NAME" \
        --direction in --protocol icmp \
        --source-ips 0.0.0.0/0 --source-ips ::/0 \
        --description "ICMP ping"

    success "Firewall created"
fi

# ── Apply firewall to server ──────────────────────────────────────────────────
log "Applying firewall to '$SERVER_NAME'..."
hcloud firewall apply-to-resource "$FIREWALL_NAME" --type server --server "$SERVER_NAME"

success "Firewall applied!"
echo ""
echo "  Public SSH is now blocked. Access via Tailscale only:"
echo "    ssh lightdash@<tailscale-hostname>"
echo ""
echo "  To remove the firewall later:"
echo "    hcloud firewall remove-from-resource $FIREWALL_NAME --type server --server $SERVER_NAME"
