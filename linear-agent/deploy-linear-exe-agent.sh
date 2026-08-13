#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$SCRIPT_DIR"
VM_NAME="${LINEAR_EXE_CONTROLLER_VM:-ld-linear-agent}"
TEMPLATE_NAME="${LINEAR_EXE_TEMPLATE_VM:-ld-linear-agent-template}"
PUBLIC_URL="https://${VM_NAME}.exe.xyz"

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Missing required command '$1'."
}

validate_vm_name() {
    [[ "$VM_NAME" =~ ^ld-linear-agent(-[a-z0-9]+)*$ ]] ||
        fail 'Controller VM must match ld-linear-agent[-suffix].'
}

validate_template_name() {
    [[ "$TEMPLATE_NAME" =~ ^ld-linear-agent-template(-[a-z0-9]+)*$ ]] ||
        fail 'Runner template VM must match ld-linear-agent-template[-suffix].'
}

exe_api() {
    local response_file http_status
    response_file="$(mktemp /tmp/linear-exe-agent-api.XXXXXX)"
    if ! http_status="$(curl --silent --show-error --max-time 90 \
        -o "$response_file" -w '%{http_code}' \
        -X POST https://exe.dev/exec \
        -H "Authorization: Bearer ${EXE_API_KEY}" \
        --data-binary "$1")"; then
        rm -f "$response_file"
        return 1
    fi
    if ((http_status < 200 || http_status >= 300)); then
        echo "exe.dev API error ($http_status): $(<"$response_file")" >&2
        rm -f "$response_file"
        return 1
    fi
    cat "$response_file"
    rm -f "$response_file"
}

vm_ssh() {
    local vm_name="$1" ssh_host resolved_ip
    shift
    ssh_host="${vm_name}.exe.xyz"
    resolved_ip="$(dig +short @1.1.1.1 "$ssh_host" A 2>/dev/null | tail -n 1)"
    if [[ "$resolved_ip" =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
        ssh -o HostName="$resolved_ip" -o HostKeyAlgorithms=rsa-sha2-512 \
            -o HostKeyAlias=exe.dev "$ssh_host" "$@"
    else
        ssh -o HostKeyAlgorithms=rsa-sha2-512 -o HostKeyAlias=exe.dev \
            "$ssh_host" "$@"
    fi
}

controller_ssh() {
    vm_ssh "$VM_NAME" "$@"
}

template_ssh() {
    vm_ssh "$TEMPLATE_NAME" "$@"
}

exe_ssh() {
    ssh -o HostKeyAlgorithms=rsa-sha2-512 exe.dev "$@"
}

vm_exists() {
    exe_api ls | jq -e --arg vm "$VM_NAME" \
        '[.vms[]? | (.vm_name // .name // empty)] | index($vm) != null' >/dev/null
}

template_exists() {
    exe_api ls | jq -e --arg vm "$TEMPLATE_NAME" \
        '[.vms[]? | (.vm_name // .name // empty)] | index($vm) != null' >/dev/null
}

wait_for_ssh() {
    local deadline=$((SECONDS + 120)) remote_hostname
    while ((SECONDS < deadline)); do
        remote_hostname="$(controller_ssh -o BatchMode=yes -o ConnectTimeout=10 hostname 2>/dev/null || true)"
        if [ "$remote_hostname" = "$VM_NAME" ]; then
            return 0
        fi
        sleep 2
    done
    fail "Timed out waiting for ${VM_NAME}.exe.xyz."
}

wait_for_template_ssh() {
    local deadline=$((SECONDS + 180)) remote_hostname
    while ((SECONDS < deadline)); do
        remote_hostname="$(template_ssh -o BatchMode=yes -o ConnectTimeout=10 hostname 2>/dev/null || true)"
        if [ "$remote_hostname" = "$TEMPLATE_NAME" ]; then
            return 0
        fi
        sleep 2
    done
    fail "Timed out waiting for ${TEMPLATE_NAME}.exe.xyz."
}

preflight() {
    require_command curl
    require_command dig
    require_command jq
    require_command ssh
    require_command tar
    validate_vm_name
    validate_template_name
    [ -n "${EXE_API_KEY:-}" ] || fail 'EXE_API_KEY is required.'
    if grep -Eq '^(LINEAR_CLIENT_SECRET|LINEAR_WEBHOOK_SECRET|EXE_API_KEY|CODEX_API_KEY|GITHUB_TOKEN)=.+' \
        "$APP_ROOT/.env.example"; then
        fail '.env.example contains a secret; keep credentials only in .env.'
    fi
}

prepare_template() {
    local replace=false template_present=false env_file repository base_ref cpu memory disk disk_gb
    if [ "${1:-}" = --replace ]; then
        replace=true
        shift
    fi
    env_file="${1:-$APP_ROOT/.env}"
    [ "$#" -le 1 ] || fail 'prepare-template accepts [--replace] [env-file].'
    preflight
    [ -f "$env_file" ] || fail "Missing environment file $env_file."
    repository="$(awk -F= '/^GITHUB_REPOSITORY=/{print substr($0,index($0,"=")+1); exit}' "$env_file")"
    base_ref="$(awk -F= '/^GITHUB_BASE_REF=/{print substr($0,index($0,"=")+1); exit}' "$env_file")"
    cpu="$(awk -F= '/^EXE_RUNNER_CPU=/{print substr($0,index($0,"=")+1); exit}' "$env_file")"
    memory="$(awk -F= '/^EXE_RUNNER_MEMORY=/{print substr($0,index($0,"=")+1); exit}' "$env_file")"
    disk="$(awk -F= '/^EXE_RUNNER_DISK=/{print substr($0,index($0,"=")+1); exit}' "$env_file")"
    repository="${repository:-lightdash/lightdash}"
    base_ref="${base_ref:-main}"
    cpu="${cpu:-4}"
    memory="${memory:-16GB}"
    disk="${disk:-25GB}"
    [[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail 'Unsafe GITHUB_REPOSITORY.'
    [[ "$base_ref" =~ ^[A-Za-z0-9._/-]+$ ]] || fail 'Unsafe GITHUB_BASE_REF.'
    [[ "$cpu" =~ ^[1-9][0-9]*$ ]] || fail 'EXE_RUNNER_CPU must be a positive integer.'
    [[ "$memory" =~ ^[1-9][0-9]*(G|GB)$ ]] || fail 'EXE_RUNNER_MEMORY must use G or GB.'
    [[ "$disk" =~ ^[1-9][0-9]*(G|GB)$ ]] || fail 'EXE_RUNNER_DISK must use G or GB.'
    disk_gb="${disk%%G*}"
    ((disk_gb >= 20)) || fail 'The golden runner requires EXE_RUNNER_DISK of at least 20GB.'

    if template_exists; then
        template_present=true
    fi
    if [ "$template_present" = true ] && [ "$replace" = true ]; then
        exe_api "rm ${TEMPLATE_NAME}" >/dev/null
        echo "DELETED: $TEMPLATE_NAME (replaced template; not recoverable)"
        template_present=false
    fi

    if [ "$template_present" = true ]; then
        echo "Refreshing runner template $TEMPLATE_NAME..."
    else
        echo "Creating runner template $TEMPLATE_NAME..."
        exe_api "new --name=${TEMPLATE_NAME} --cpu=${cpu} --memory=${memory} --disk=${disk} --tag=linear-agent-template --no-email" >/dev/null
    fi
    wait_for_template_ssh
    template_ssh \
        "LINEAR_AGENT_TEMPLATE_MODE=true LINEAR_AGENT_CALLBACK_URL=${PUBLIC_URL} GITHUB_REPOSITORY=${repository} GITHUB_BASE_REF=${base_ref} bash -s" \
        <"$APP_ROOT/runner.sh"
    echo "TEMPLATE READY: $TEMPLATE_NAME"
}

deploy() {
    local env_file="${1:-$APP_ROOT/.env}" resolved_env runner_bootstrap_token
    preflight
    [ -f "$env_file" ] || fail "Missing environment file $env_file. Copy .env.example and fill it in."
    resolved_env="$(mktemp /tmp/linear-exe-agent-env.XXXXXX)"
    trap 'rm -f "$resolved_env"' EXIT
    awk '!/^(EXE_API_KEY|EXE_RUNNER_BOOTSTRAP_TOKEN|PUBLIC_URL)=/' "$env_file" >"$resolved_env"
    runner_bootstrap_token=""
    if template_exists; then
        wait_for_template_ssh
        runner_bootstrap_token="$(template_ssh 'cat /opt/linear-agent-template/bootstrap-token')"
        [[ "$runner_bootstrap_token" =~ ^[a-f0-9]{64}$ ]] || fail 'Invalid runner bootstrap token in template.'
    fi
    {
        printf 'EXE_API_KEY=%s\n' "$EXE_API_KEY"
        printf 'EXE_RUNNER_BOOTSTRAP_TOKEN=%s\n' "$runner_bootstrap_token"
        printf 'PUBLIC_URL=%s\n' "$PUBLIC_URL"
    } >>"$resolved_env"

    if ! vm_exists; then
        echo "Creating controller VM $VM_NAME..."
        exe_api "new --name=${VM_NAME} --cpu=2 --memory=4GB --disk=10GB --tag=linear-agent-controller --no-email" >/dev/null
    fi
    wait_for_ssh

    COPYFILE_DISABLE=1 tar --no-xattrs -C "$APP_ROOT" -czf - \
        --exclude='./data' --exclude='./.env' . |
        controller_ssh 'mkdir -p /tmp/linear-exe-agent && tar -xzf - -C /tmp/linear-exe-agent'
    controller_ssh 'cat > /tmp/linear-exe-agent.env' <"$resolved_env"
    controller_ssh bash -s <<'EOF'
set -euo pipefail
node_version=v24.18.0
if [ "$(node --version 2>/dev/null || true)" != "$node_version" ]; then
    case "$(uname -m)" in
        x86_64) node_arch=x64 ;;
        aarch64|arm64) node_arch=arm64 ;;
        *) echo "Unsupported controller architecture: $(uname -m)" >&2; exit 1 ;;
    esac
    node_archive="node-${node_version}-linux-${node_arch}.tar.xz"
    node_url="https://nodejs.org/dist/${node_version}"
    install_root="/opt/node-${node_version}-linux-${node_arch}"
    curl --fail --silent --show-error "$node_url/$node_archive" -o "/tmp/$node_archive"
    curl --fail --silent --show-error "$node_url/SHASUMS256.txt" -o /tmp/node-SHASUMS256.txt
    (cd /tmp && grep "  ${node_archive}$" node-SHASUMS256.txt | sha256sum --check --strict)
    sudo rm -rf "$install_root"
    sudo mkdir -p "$install_root"
    sudo tar -xJf "/tmp/$node_archive" -C "$install_root" --strip-components=1
    sudo ln -sfn "$install_root/bin/node" /usr/local/bin/node
    rm -f "/tmp/$node_archive" /tmp/node-SHASUMS256.txt
fi
sudo mkdir -p /opt/linear-exe-agent
sudo cp -R /tmp/linear-exe-agent/. /opt/linear-exe-agent/
sudo install -m 600 -o root -g root /tmp/linear-exe-agent.env /etc/linear-exe-agent.env
sudo install -m 644 /opt/linear-exe-agent/linear-exe-agent.service /etc/systemd/system/linear-exe-agent.service
sudo chown -R exedev:exedev /opt/linear-exe-agent
sudo systemctl daemon-reload
sudo systemctl enable linear-exe-agent.service
sudo systemctl restart linear-exe-agent.service
rm -rf /tmp/linear-exe-agent /tmp/linear-exe-agent.env
EOF
    exe_ssh share port "$VM_NAME" 8787 --json >/dev/null
    exe_ssh share set-public "$VM_NAME" --json >/dev/null

    for _ in $(seq 1 30); do
        if curl --fail --silent "$PUBLIC_URL/health" >/dev/null 2>&1; then
            echo "READY: $PUBLIC_URL"
            echo "INSTALL: $PUBLIC_URL/oauth/authorize"
            echo "WEBHOOK: $PUBLIC_URL/webhooks/linear"
            rm -f "$resolved_env"
            trap - EXIT
            return 0
        fi
        sleep 2
    done
    fail "Controller did not become healthy. Run '$0 logs'."
}

status() {
    preflight
    if ! vm_exists; then
        echo "MISSING: $VM_NAME"
        return 1
    fi
    controller_ssh 'systemctl --no-pager --full status linear-exe-agent.service'
    curl --fail --silent --show-error "$PUBLIC_URL/health"
    echo
}

logs() {
    preflight
    wait_for_ssh
    exec ssh -o HostKeyAlgorithms=rsa-sha2-512 -o HostKeyAlias=exe.dev \
        "${VM_NAME}.exe.xyz" 'journalctl -u linear-exe-agent.service -n 200 -f'
}

destroy() {
    local runner
    preflight
    while IFS= read -r runner; do
        if [[ "$runner" =~ ^ldlin-[a-f0-9]{12}$ ]]; then
            exe_api "rm ${runner}" >/dev/null
            echo "DELETED: $runner (not recoverable)"
        fi
    done < <(exe_api ls | jq -r '.vms[]? | (.vm_name // .name // empty)')
    if ! vm_exists; then
        echo "MISSING: $VM_NAME"
        return 0
    fi
    exe_api "rm ${VM_NAME}" >/dev/null
    echo "DELETED: $VM_NAME (not recoverable)"
}

usage() {
    cat <<EOF
Usage: $0 deploy [env-file]
       $0 prepare-template [--replace] [env-file]
       $0 status
       $0 logs
       $0 url
       $0 destroy
EOF
}

command_name="${1:-}"
[ "$#" -eq 0 ] || shift
case "$command_name" in
    deploy) deploy "$@" ;;
    prepare-template) prepare_template "$@" ;;
    status) [ "$#" -eq 0 ] || fail 'status takes no arguments.'; status ;;
    logs) [ "$#" -eq 0 ] || fail 'logs takes no arguments.'; logs ;;
    url) [ "$#" -eq 0 ] || fail 'url takes no arguments.'; echo "$PUBLIC_URL" ;;
    destroy) [ "$#" -eq 0 ] || fail 'destroy takes no arguments.'; destroy ;;
    help|-h|--help|'') usage ;;
    *) usage >&2; exit 2 ;;
esac
