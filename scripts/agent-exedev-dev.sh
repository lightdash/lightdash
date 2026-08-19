#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KEY_ENV_VAR="LIGHTDASH_EXEDEV_SSH_KEY"
CONTROL_HOST="${LIGHTDASH_EXEDEV_CONTROL_HOST:-exe.dev}"
TEMPLATE_VM="${LIGHTDASH_EXEDEV_TEMPLATE:-ld-linear-agent-template}"
TEAM_SHARE="${LIGHTDASH_EXEDEV_TEAM_SHARE:-true}"
VM_PREFIX="${LIGHTDASH_EXEDEV_VM_PREFIX:-ld-cc-}"
VM_TAG="${LIGHTDASH_EXEDEV_VM_TAG:-lightdash-claude-session}"
REMOTE_USER="${LIGHTDASH_EXEDEV_REMOTE_USER:-exedev}"
REMOTE_REPO="${LIGHTDASH_EXEDEV_REMOTE_REPO:-/opt/linear-agent-template/repository}"
BOOTSTRAP_SCRIPT="${LIGHTDASH_EXEDEV_BOOTSTRAP:-$SCRIPT_DIR/agent-exedev-bootstrap.sh}"
REMOTE_BOOTSTRAP="/home/exedev/linear-agent/session-bootstrap.sh"
REMOTE_LOG="${LIGHTDASH_EXEDEV_REMOTE_LOG:-/home/exedev/linear-agent/bootstrap.log}"
PREVIEW_PORT="${LIGHTDASH_EXEDEV_PREVIEW_PORT:-3000}"
READY_TIMEOUT_SECONDS="${EXEDEV_READY_TIMEOUT_SECONDS:-900}"
SSH_TIMEOUT_SECONDS="${EXEDEV_SSH_TIMEOUT_SECONDS:-180}"
POLL_INTERVAL_SECONDS="${EXEDEV_POLL_INTERVAL_SECONDS:-5}"
SETUP_DOC="docs/agent-exedev.md"

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Usage: ./scripts/agent-exedev-dev.sh <start|wait|sync|url|ssh|exe>

Requires LIGHTDASH_EXEDEV_SSH_KEY. Commands safely skip when it is unset.

  start          Clone this session's VM from the template, sync the working
                 tree, and launch the preview stack in the background.
  wait           Sync, then block until the app is healthy: READY: <url>.
  sync           Push the full local repository state to the session VM.
  url            Print the public URL for this Claude session.
  ssh <args...>  Run a command on the session VM over SSH.
  exe <args...>  Run an exe.dev control command (ls, cp, tag, share, ...).
EOF
}

require_command() {
    local command_name="$1"
    command -v "$command_name" >/dev/null 2>&1 ||
        fail "Missing required command '$command_name'. See $SETUP_DOC."
}

extract_session_id() {
    local hook_input="$1" session_id

    session_id="$(
        printf '%s\n' "$hook_input" |
            sed -nE 's/.*"session_id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' |
            head -n 1
    )"

    [ -n "$session_id" ] || return 1
    [[ "$session_id" =~ ^[A-Za-z0-9._:-]+$ ]] || return 1

    printf '%s' "$session_id"
}

extract_json_string() {
    local hook_input="$1" key="$2"

    printf '%s\n' "$hook_input" |
        sed -nE 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' |
        head -n 1
}

agent_session_id() {
    local workspace_root

    if [ -n "${LIGHTDASH_AGENT_SESSION_ID:-}" ]; then
        printf '%s' "$LIGHTDASH_AGENT_SESSION_ID"
    elif [ -n "${CLAUDE_CODE_REMOTE_SESSION_ID:-}" ]; then
        printf '%s' "$CLAUDE_CODE_REMOTE_SESSION_ID"
    else
        workspace_root="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null)" ||
            fail "Agent session and workspace identity are unavailable."
        printf 'workspace:%s' "$workspace_root"
    fi
}

hash_value() {
    local value="$1"

    if command -v sha256sum >/dev/null 2>&1; then
        printf '%s' "$value" | sha256sum | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        printf '%s' "$value" | shasum -a 256 | awk '{print $1}'
    else
        fail "Missing sha256sum or shasum. See $SETUP_DOC."
    fi
}

file_hash() {
    local path="$1"

    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$path" | awk '{print $1}'
    else
        shasum -a 256 "$path" | awk '{print $1}'
    fi
}

load_session_config() {
    local id

    id="$(agent_session_id)"
    SESSION_HASH="$(hash_value "$id")"
    SESSION_HASH="${SESSION_HASH:0:16}"
    VM_NAME="${VM_PREFIX}${SESSION_HASH:0:10}"
    VM_HOST="$VM_NAME.exe.xyz"
    PUBLIC_URL="https://$VM_HOST"
    RUN_DIR="${TMPDIR:-/tmp}/lightdash-agent-exedev/$SESSION_HASH"
    PROVISIONED_FILE="$RUN_DIR/provisioned"
    printf -v REMOTE_REPO_Q '%q' "$REMOTE_REPO"
}

require_runtime() {
    [ -n "${!KEY_ENV_VAR:-}" ] ||
        fail "$KEY_ENV_VAR is not set. See $SETUP_DOC."

    require_command ssh
    require_command git
    require_command curl
    require_command tar
}

# The key env var holds either a path to a private key or the key material
# itself (how Claude code-session environment secrets arrive).
ensure_key_file() {
    local key_value="${!KEY_ENV_VAR:-}"

    if [ -f "$key_value" ]; then
        KEY_FILE="$key_value"
        return
    fi

    mkdir -p "$RUN_DIR"
    KEY_FILE="$RUN_DIR/ssh-key"
    printf '%s\n' "$key_value" >"$KEY_FILE"
    chmod 600 "$KEY_FILE"
}

configure_ssh() {
    # Control sockets need a short path: unix sockets cap at ~104 bytes and
    # macOS TMPDIRs alone exceed that.
    local control_dir="/tmp/ld-exe-cm-$(id -u)"

    ensure_key_file
    mkdir -p "$RUN_DIR" "$control_dir"
    chmod 700 "$control_dir"
    SSH_OPTS=(
        -i "$KEY_FILE"
        -o IdentitiesOnly=yes
        -o IdentityAgent=none
        -o StrictHostKeyChecking=accept-new
        -o BatchMode=yes
        -o ConnectTimeout=15
        -o ControlMaster=auto
        -o ControlPath="$control_dir/%C"
        -o ControlPersist=10m
    )
}

git_ssh_command() {
    local arg out="ssh"

    for arg in "${SSH_OPTS[@]}"; do
        out+=" $(printf '%q' "$arg")"
    done
    printf '%s' "$out"
}

exe_ctl() {
    ssh "${SSH_OPTS[@]}" "$CONTROL_HOST" "$@" </dev/null
}

vm_ssh() {
    ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$VM_HOST" "$@"
}

vm_exists() {
    exe_ctl ls 2>/dev/null | grep -Eq "(^|[[:space:]])${VM_NAME}\.exe\.xyz([[:space:]]|$)"
}

ensure_vm() {
    if vm_exists; then
        return
    fi

    echo "Cloning $TEMPLATE_VM into $VM_NAME..."
    exe_ctl cp "$TEMPLATE_VM" "$VM_NAME" --copy-tags=false ||
        fail "Could not clone $TEMPLATE_VM. Check $KEY_ENV_VAR permissions and see $SETUP_DOC."
    # Untagged clones escape the sweeper; warn but keep going.
    exe_ctl tag "$VM_NAME" "$VM_TAG" ||
        echo "WARNING: could not tag $VM_NAME as $VM_TAG." >&2
    if [ "$TEAM_SHARE" = "true" ]; then
        # Make the session VM visible and SSH-able to the whole exe.dev team.
        exe_ctl share add "$VM_NAME" team --root ||
            echo "WARNING: could not team-share $VM_NAME." >&2
    fi
}

wait_for_vm_ssh() {
    local deadline=$((SECONDS + SSH_TIMEOUT_SECONDS))

    while ! vm_ssh true </dev/null >/dev/null 2>&1; do
        ((SECONDS < deadline)) ||
            fail "Cannot reach $VM_HOST over SSH after ${SSH_TIMEOUT_SECONDS}s."
        sleep "$POLL_INTERVAL_SECONDS"
    done
}

push_session_ref() {
    GIT_SSH_COMMAND="$(git_ssh_command)" git -C "$REPO_ROOT" push \
        --quiet --force \
        "ssh://$REMOTE_USER@$VM_HOST$REMOTE_REPO" \
        HEAD:refs/agent/session
}

remote_has_commit() {
    vm_ssh "git -C $REMOTE_REPO_Q cat-file -e $1 2>/dev/null" </dev/null
}

set_session_ref() {
    vm_ssh "git -C $REMOTE_REPO_Q update-ref refs/agent/session $1" </dev/null ||
        fail "Could not update the session ref on $VM_HOST."
}

# Full one-way sync: git computes the delta against the template's baked
# checkout, so nothing ever scans the working tree. Ignored files (node_modules,
# .env, build output) never cross the wire.
full_sync() {
    local diff_file="$RUN_DIR/worktree.diff" untracked_file="$RUN_DIR/untracked.z" head_sha

    mkdir -p "$RUN_DIR"
    echo "Syncing repository state to $VM_NAME..."
    head_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"

    # Empty-pack pushes deadlock git 2.43 receive-pack on partial-clone repos,
    # so when the commit already exists remotely set the ref directly.
    if remote_has_commit "$head_sha"; then
        set_session_ref "$head_sha"
    else
        # Knowing the template's tip locally lets push negotiation find the
        # common base; a stale checkout would pack the entire repository.
        git -C "$REPO_ROOT" fetch --quiet origin 2>/dev/null || true
        if ! push_session_ref; then
            # A shallow template clone rejects pushes of commits that predate
            # its tip; deepen the VM's history from GitHub and try again. The
            # deepen itself often brings the commit over, in which case pushing
            # again would send an empty pack — set the ref directly instead.
            echo "Push rejected; deepening the VM's git history from origin..."
            vm_ssh "git -C $REMOTE_REPO_Q fetch --quiet --deepen=1000 origin" </dev/null ||
                fail "Could not deepen the repository history on $VM_HOST."
            if remote_has_commit "$head_sha"; then
                set_session_ref "$head_sha"
            else
                push_session_ref ||
                    fail "git push to $VM_HOST failed. See $SETUP_DOC."
            fi
        fi
    fi

    vm_ssh "git -C $REMOTE_REPO_Q -c advice.detachedHead=false checkout --force --quiet --detach refs/agent/session" </dev/null ||
        fail "Remote checkout failed on $VM_HOST."

    git -C "$REPO_ROOT" diff HEAD --binary >"$diff_file"
    if [ -s "$diff_file" ]; then
        vm_ssh "git -C $REMOTE_REPO_Q apply --whitespace=nowarn" <"$diff_file" ||
            fail "Applying the working-tree diff failed on $VM_HOST."
    fi

    git -C "$REPO_ROOT" ls-files -o --exclude-standard -z >"$untracked_file"
    if [ -s "$untracked_file" ]; then
        COPYFILE_DISABLE=1 tar -C "$REPO_ROOT" --null -T "$untracked_file" -cf - |
            vm_ssh "tar --warning=no-unknown-keyword -C $REMOTE_REPO_Q -xf -" ||
            fail "Copying untracked files failed on $VM_HOST."
    fi
}

# Sync only what `git status` reports changed since HEAD. Fast enough for a
# PostToolUse hook; deletions of tracked files propagate via `rm` on the VM.
sync_changed() {
    local changed_file="$RUN_DIR/changed.z" path
    local -a existing=() deleted=()

    mkdir -p "$RUN_DIR"
    git -C "$REPO_ROOT" ls-files -m -o --exclude-standard -z >"$changed_file"
    [ -s "$changed_file" ] || return 0

    while IFS= read -r -d '' path; do
        if [ -e "$REPO_ROOT/$path" ]; then
            existing+=("$path")
        else
            deleted+=("$path")
        fi
    done <"$changed_file"

    if [ "${#existing[@]}" -gt 0 ]; then
        printf '%s\0' "${existing[@]}" |
            COPYFILE_DISABLE=1 tar -C "$REPO_ROOT" --null -T - -cf - |
            vm_ssh "tar --warning=no-unknown-keyword -C $REMOTE_REPO_Q -xf -"
    fi
    if [ "${#deleted[@]}" -gt 0 ]; then
        vm_ssh "cd $REMOTE_REPO_Q && rm -f -- $(printf '%q ' "${deleted[@]}")" </dev/null
    fi
}

sync_single_file() {
    local abs_path="$1" rel_path

    case "$abs_path" in
        "$REPO_ROOT"/*) rel_path="${abs_path#"$REPO_ROOT"/}" ;;
        *) return 0 ;;
    esac
    git -C "$REPO_ROOT" check-ignore -q "$rel_path" && return 0

    if [ -e "$abs_path" ]; then
        printf '%s\0' "$rel_path" |
            COPYFILE_DISABLE=1 tar -C "$REPO_ROOT" --null -T - -cf - |
            vm_ssh "tar --warning=no-unknown-keyword -C $REMOTE_REPO_Q -xf -"
    else
        vm_ssh "cd $REMOTE_REPO_Q && rm -f -- $(printf '%q' "$rel_path")" </dev/null
    fi
}

# Template node_modules matches the template's lockfile; install on the VM only
# when the session's lockfile differs from the recorded template hash.
maybe_install_dependencies() {
    local metadata_path local_lock remote_lock

    metadata_path="$(dirname "$REMOTE_REPO")/preview-prepared"
    local_lock="$(file_hash "$REPO_ROOT/pnpm-lock.yaml")"
    remote_lock="$(
        vm_ssh "sed -n 's/^lockfile_sha256=//p' $(printf '%q' "$metadata_path") 2>/dev/null" </dev/null || true
    )"
    [ -n "$remote_lock" ] && [ "$local_lock" = "$remote_lock" ] && return 0

    echo "pnpm-lock.yaml changed; installing dependencies on $VM_NAME..."
    vm_ssh "cd $REMOTE_REPO_Q && CI=true pnpm install --prefer-offline" </dev/null ||
        fail "pnpm install failed on $VM_HOST. See $SETUP_DOC."
    vm_ssh "sed -i 's/^lockfile_sha256=.*/lockfile_sha256=$local_lock/' $(printf '%q' "$metadata_path") 2>/dev/null" </dev/null || true
}

# Require a real 200: unshared VMs answer 307 (exe.dev login redirect), which
# `curl --fail` would treat as success.
app_is_healthy() {
    [ "$(
        curl --silent --output /dev/null --write-out '%{http_code}' \
            --max-time 10 "$PUBLIC_URL/api/v1/health" 2>/dev/null
    )" = "200" ]
}

# Fire the preview bootstrap on the VM and return immediately; the log stays on
# the VM so the agent can tail it over SSH.
launch_bootstrap() {
    if app_is_healthy; then
        echo "Preview stack already serving $PUBLIC_URL."
        return
    fi

    [ -f "$BOOTSTRAP_SCRIPT" ] ||
        fail "Bootstrap script not found: $BOOTSTRAP_SCRIPT"

    echo "Launching the preview stack on $VM_NAME (background)..."
    vm_ssh "cat >$(printf '%q' "$REMOTE_BOOTSTRAP") && chmod +x $(printf '%q' "$REMOTE_BOOTSTRAP")" <"$BOOTSTRAP_SCRIPT" ||
        fail "Could not upload the preview bootstrap to $VM_HOST."

    # A pidfile guard, not pgrep: the ssh wrapper shell's own command line
    # contains the script path and would self-match.
    local pid_file="${REMOTE_LOG}.pid" remote_cmd
    printf -v remote_cmd \
        'if kill -0 "$(cat %q 2>/dev/null)" 2>/dev/null; then echo "Bootstrap already running."; else nohup bash %q %q >%q 2>&1 & echo $! >%q; fi' \
        "$pid_file" "$REMOTE_BOOTSTRAP" "$VM_NAME" "$REMOTE_LOG" "$pid_file"
    vm_ssh "$remote_cmd" </dev/null ||
        fail "Could not launch the preview bootstrap on $VM_HOST."

    exe_ctl share port "$VM_NAME" "$PREVIEW_PORT" ||
        echo "WARNING: could not publish port $PREVIEW_PORT for $VM_NAME." >&2
    exe_ctl share set-public "$VM_NAME" ||
        echo "WARNING: could not make $VM_NAME public." >&2
}

wait_until_healthy() {
    local deadline last_report now

    deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
    last_report=$((SECONDS - 30))

    while ((SECONDS < deadline)); do
        if app_is_healthy; then
            sleep 2
            if app_is_healthy; then
                echo "READY: $PUBLIC_URL"
                return
            fi
        fi

        now=$SECONDS
        if ((now - last_report >= 30)); then
            echo "Waiting for application health at $PUBLIC_URL..."
            last_report=$now
        fi
        sleep "$POLL_INTERVAL_SECONDS"
    done

    echo "Inspect the bootstrap on the VM: ./scripts/agent-exedev-dev.sh ssh 'tail -n 80 $REMOTE_LOG'" >&2
    fail "Timed out waiting for $PUBLIC_URL."
}

provision() {
    require_runtime
    configure_ssh
    ensure_vm
    wait_for_vm_ssh
    full_sync
    maybe_install_dependencies
    launch_bootstrap
    touch "$PROVISIONED_FILE"

    cat <<EOF
exe.dev VM $VM_NAME is provisioned; the preview stack is starting in the background.
Test URL (healthy once /api/v1/health responds): $PUBLIC_URL
Inspect the server: ./scripts/agent-exedev-dev.sh ssh '<command>' (bootstrap log: $REMOTE_LOG)
Before the final response, run ./scripts/agent-exedev-dev.sh wait and include the URL from its READY: line.
EOF
}

hook_start() {
    local hook_input hook_output session_id

    [ -n "${!KEY_ENV_VAR:-}" ] || return 0

    hook_input="$(cat)"
    if [ -z "${CLAUDE_ENV_FILE:-}" ]; then
        hook_setup_failed "CLAUDE_ENV_FILE is unavailable."
        return
    fi
    if ! session_id="$(extract_session_id "$hook_input")"; then
        hook_setup_failed "Claude SessionStart input has no usable session_id."
        return
    fi

    export LIGHTDASH_AGENT_SESSION_ID="$session_id"
    if ! printf 'export LIGHTDASH_AGENT_SESSION_ID=%s\n' \
        "$session_id" >>"$CLAUDE_ENV_FILE"; then
        hook_setup_failed "Could not persist the Claude session ID."
        return
    fi

    load_session_config
    if ! hook_output="$(provision 2>&1)"; then
        printf '%s\n' "$hook_output" >&2
        hook_setup_failed "$(
            printf '%s\n' "$hook_output" |
                grep '^ERROR:' |
                tail -n 1 |
                sed 's/^ERROR:[[:space:]]*//' ||
                true
        )"
        return
    fi

    printf '%s\n' "$hook_output"
}

hook_setup_failed() {
    local detail="${1:-exe.dev provisioning exited unexpectedly.}"

    printf '%s\n' "$detail" >&2
    printf '%s\n' \
        '{"continue":false,"stopReason":"Lightdash exe.dev setup failed before Claude could start. Check the SessionStart hook error and docs/agent-exedev.md, fix the setup, then resume the session."}'
}

hook_stop() {
    local hook_input hook_output last_message ready_line ready_url session_id

    [ -n "${!KEY_ENV_VAR:-}" ] || return 0

    hook_input="$(cat)"
    session_id="$(extract_session_id "$hook_input")" || {
        echo "Cannot verify Lightdash exe.dev readiness: no usable Claude session ID." >&2
        exit 2
    }
    export LIGHTDASH_AGENT_SESSION_ID="$session_id"
    load_session_config
    require_runtime
    require_command jq
    configure_ssh

    if ! hook_output="$( (full_sync && maybe_install_dependencies && wait_until_healthy) 2>&1)"; then
        printf '%s\n' "$hook_output" >&2
        echo "The Lightdash exe.dev environment must be healthy before the final response." >&2
        exit 2
    fi

    ready_line="$(
        printf '%s\n' "$hook_output" |
            grep '^READY: https://' |
            tail -n 1 ||
            true
    )"
    ready_url="${ready_line#READY: }"
    last_message="$(
        printf '%s\n' "$hook_input" |
            jq -r '.last_assistant_message // empty'
    )" || {
        echo "Cannot inspect the final response. See $SETUP_DOC." >&2
        exit 2
    }

    if [ -z "$ready_line" ] ||
        ! printf '%s' "$last_message" | grep -Fq "$ready_url"; then
        echo "The final response must include the ready testing URL: $PUBLIC_URL" >&2
        exit 2
    fi
}

# PostToolUse hook: mirror the edit onto the VM. Never blocks the agent; the
# `wait` before the final response is the authoritative sync.
hook_sync() {
    local hook_input tool_name file_path session_id

    [ -n "${!KEY_ENV_VAR:-}" ] || return 0

    hook_input="$(cat)"
    session_id="$(extract_session_id "$hook_input")" || return 0
    export LIGHTDASH_AGENT_SESSION_ID="$session_id"
    load_session_config
    [ -f "$PROVISIONED_FILE" ] || return 0

    configure_ssh
    tool_name="$(extract_json_string "$hook_input" "tool_name")"
    case "$tool_name" in
        Edit | Write | MultiEdit | NotebookEdit)
            file_path="$(extract_json_string "$hook_input" "file_path")"
            [ -n "$file_path" ] || return 0
            sync_single_file "$file_path" ||
                echo "WARNING: could not sync $file_path to $VM_NAME." >&2
            ;;
        *)
            sync_changed ||
                echo "WARNING: could not sync changed files to $VM_NAME." >&2
            ;;
    esac
    return 0
}

main() {
    local command_name="${1:-}"

    case "$command_name" in
        hook-start)
            hook_start
            ;;
        hook-stop)
            hook_stop
            ;;
        hook-sync)
            hook_sync
            ;;
        ssh | exe)
            shift || true
            if [ -z "${!KEY_ENV_VAR:-}" ]; then
                echo "SKIPPED: $KEY_ENV_VAR is not set."
                return
            fi
            load_session_config
            configure_ssh
            case "$command_name" in
                ssh) vm_ssh "$@" ;;
                exe) exe_ctl "$@" ;;
            esac
            ;;
        start | wait | sync | url)
            if [ -z "${!KEY_ENV_VAR:-}" ]; then
                echo "SKIPPED: $KEY_ENV_VAR is not set."
                return
            fi

            load_session_config
            case "$command_name" in
                start) provision ;;
                wait)
                    require_runtime
                    configure_ssh
                    full_sync
                    maybe_install_dependencies
                    wait_until_healthy
                    ;;
                sync)
                    require_runtime
                    configure_ssh
                    full_sync
                    ;;
                url) echo "$PUBLIC_URL" ;;
            esac
            ;;
        -h | --help | help | "")
            usage
            ;;
        *)
            usage >&2
            exit 1
            ;;
    esac
}

main "$@"
