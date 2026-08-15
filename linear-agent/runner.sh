#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

template_mode="${LINEAR_AGENT_TEMPLATE_MODE:-false}"
workspace="/home/exedev/linear-agent"
template_root="/opt/linear-agent-template"
template_marker="$template_root/metadata"
if [ "$template_mode" = true ]; then
    repository_dir="$template_root/repository"
    job_url=""
    auth_header=""
else
    job_url="${LINEAR_AGENT_CALLBACK_URL}/jobs/${LINEAR_AGENT_JOB_ID}"
    auth_header="Authorization: Bearer ${LINEAR_AGENT_JOB_TOKEN}"
    if [ -f "$template_marker" ]; then
        repository_dir="$template_root/repository"
    else
        repository_dir="$workspace/repository"
    fi
fi
codex_key_file="$workspace/codex-api-key"
preview_vite_config="$repository_dir/packages/frontend/vite.linear-agent.config.ts"
started_at="$(date +%s)"

mkdir -p "$workspace/bin" "$workspace/npm"

post_json() {
    curl --fail --silent --show-error --retry 5 \
        -H "$auth_header" -H 'content-type: application/json' \
        --data-binary "@$1" "$job_url/events" >/dev/null
}

post_simple_event() {
    local event_type="$1" body="$2" payload="$workspace/event.json"
    python3 - "$event_type" "$body" >"$payload" <<'PY'
import json
import sys
print(json.dumps({"type": sys.argv[1], "body": sys.argv[2]}))
PY
    post_json "$payload"
}

report_bootstrap_error() {
    local exit_code=$? line_number="$1"
    trap - ERR
    post_simple_event error "Runner bootstrap failed at line ${line_number} with status ${exit_code}." || true
    exit "$exit_code"
}

fail_runner() {
    if [ "$template_mode" = true ]; then
        echo "$1" >&2
    else
        post_simple_event error "$1" || true
    fi
    exit 1
}

install_node() {
    local node_version=v24.18.0 node_arch node_archive node_url install_root
    case "$(uname -m)" in
        x86_64) node_arch=x64 ;;
        aarch64|arm64) node_arch=arm64 ;;
        *) fail_runner "Unsupported runner architecture: $(uname -m)." ;;
    esac
    install_root="/opt/node-${node_version}-linux-${node_arch}"
    if [ ! -x "$install_root/bin/node" ]; then
        node_archive="node-${node_version}-linux-${node_arch}.tar.xz"
        node_url="https://nodejs.org/dist/${node_version}"
        curl --fail --silent --show-error "$node_url/$node_archive" -o "/tmp/$node_archive"
        curl --fail --silent --show-error "$node_url/SHASUMS256.txt" -o /tmp/node-SHASUMS256.txt
        (cd /tmp && grep "  ${node_archive}$" node-SHASUMS256.txt | sha256sum --check --strict)
        sudo mkdir -p "$install_root"
        sudo tar -xJf "/tmp/$node_archive" -C "$install_root" --strip-components=1
        rm "/tmp/$node_archive" /tmp/node-SHASUMS256.txt
    fi
    export PATH="$install_root/bin:$workspace/npm/bin:$workspace/bin:$PATH"
    export npm_config_prefix="$workspace/npm"
    export npm_config_nodedir="$install_root"
    if ! command -v pnpm >/dev/null 2>&1; then
        npm install --global pnpm@11.17.0 >/dev/null
        npm cache clean --force >/dev/null 2>&1
    fi
}

prepare_python() {
    local uv_version=0.11.32 uv_arch uv_archive uv_url dbt11_dir
    if [ ! -x "$workspace/bin/uv" ]; then
        case "$(uname -m)" in
            x86_64) uv_arch=x86_64-unknown-linux-gnu ;;
            aarch64|arm64) uv_arch=aarch64-unknown-linux-gnu ;;
            *) fail_runner "Unsupported runner architecture: $(uname -m)." ;;
        esac
        uv_archive="uv-${uv_arch}.tar.gz"
        uv_url="https://github.com/astral-sh/uv/releases/download/${uv_version}"
        curl --fail --location --silent --show-error "$uv_url/$uv_archive" -o "/tmp/$uv_archive"
        curl --fail --location --silent --show-error "$uv_url/$uv_archive.sha256" -o "/tmp/$uv_archive.sha256"
        (cd /tmp && sha256sum --check --strict "$uv_archive.sha256")
        tar -xzf "/tmp/$uv_archive" -C "$workspace/bin" --strip-components=1
        rm "/tmp/$uv_archive" "/tmp/$uv_archive.sha256"
    fi
    export UV_CACHE_DIR="$workspace/uv-cache"
    "$workspace/bin/uv" python install 3.11 >/dev/null
    if [ ! -x "$repository_dir/venv/bin/python" ]; then
        "$workspace/bin/uv" venv --python 3.11 "$repository_dir/venv" >/dev/null
    fi
    "$workspace/bin/uv" pip install --python "$repository_dir/venv/bin/python" \
        'dbt-core==1.7.0' 'dbt-postgres==1.7.0' 'protobuf>=4.0.0,<5.0.0' >/dev/null
    ln -sf dbt "$repository_dir/venv/bin/dbt1.7"
    dbt11_dir="$workspace/dbt-1.11-venv"
    if [ ! -x "$dbt11_dir/bin/python" ]; then
        "$workspace/bin/uv" venv --python 3.11 "$dbt11_dir" >/dev/null
    fi
    "$workspace/bin/uv" pip install --python "$dbt11_dir/bin/python" \
        'dbt-core==1.11.12' 'dbt-postgres==1.11.0' >/dev/null
    ln -sfn "$dbt11_dir/bin/dbt" "$repository_dir/venv/bin/dbt1.11"
    "$workspace/bin/uv" cache clean >/dev/null 2>&1 || true
}

prepare_lightdash() {
    local pnpm_store=/dev/shm/linear-agent-pnpm-store
    local pnpm_cache=/dev/shm/linear-agent-pnpm-cache
    local pnpm_tmp=/dev/shm/linear-agent-pnpm-tmp
    cd "$repository_dir"
    ulimit -n "$(ulimit -Hn)" 2>/dev/null || true
    rm -rf "$HOME/.cache/pnpm" "$HOME/.local/share/pnpm/store"
    mkdir -p "$pnpm_store" "$pnpm_cache" "$pnpm_tmp"
    XDG_CACHE_HOME="$pnpm_cache" TMPDIR="$pnpm_tmp" \
        pnpm install \
        --filter lightdash \
        --filter 'backend...' \
        --filter '@lightdash/frontend...' \
        --store-dir "$pnpm_store" \
        --package-import-method=copy \
        --network-concurrency=8 \
        --child-concurrency=2
    [ -x node_modules/.bin/tsc ] || fail_runner 'pnpm install did not produce the TypeScript toolchain.'
    rm -rf "$pnpm_store" "$pnpm_cache" "$pnpm_tmp"
    pnpm -F common build
    pnpm -F warehouses build
    pnpm -F @lightdash/formula build
}

build_shared_packages() {
    cd "$repository_dir"
    pnpm -F common build
    pnpm -F warehouses build
    pnpm -F @lightdash/formula build
}

lockfile_hash() {
    sha256sum "$repository_dir/pnpm-lock.yaml" | awk '{print $1}'
}

cache_preview_images() {
    sudo systemctl start docker.service
    docker pull pgvector/pgvector:pg18 >/dev/null
    docker pull coollabsio/minio:latest >/dev/null
    docker pull axllent/mailpit:latest >/dev/null
    docker pull ghcr.io/browserless/chromium:v2.49.0 >/dev/null
}

install_template_bootstrap() {
    local bootstrap_script=/usr/local/bin/linear-agent-template-bootstrap
    local bootstrap_token="$template_root/bootstrap-token"
    local bootstrap_service=/etc/systemd/system/linear-agent-template-bootstrap.service
    [ -n "${LINEAR_AGENT_CALLBACK_URL:-}" ] || fail_runner 'LINEAR_AGENT_CALLBACK_URL is required.'
    if [ ! -s "$bootstrap_token" ]; then
        openssl rand -hex 32 >"$bootstrap_token"
    fi
    chmod 600 "$bootstrap_token"
    cat >"$workspace/template-bootstrap.sh" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
vm_name="\$(hostname)"
[ "\$vm_name" != "$HOSTNAME" ] || exit 0
[[ "\$vm_name" =~ ^ldlin-[a-f0-9]{12}\$ ]]
response="\$(mktemp /tmp/linear-agent-bootstrap.XXXXXX)"
trap 'rm -f "\$response"' EXIT
curl --fail --silent --show-error --retry 30 --retry-delay 2 \\
    -H "Authorization: Bearer \$(cat $bootstrap_token)" \\
    "$LINEAR_AGENT_CALLBACK_URL/runner-bootstrap/\$vm_name" >"\$response"
bash "\$response"
EOF
    sudo install -m 700 -o exedev -g exedev "$workspace/template-bootstrap.sh" "$bootstrap_script"
    sudo chown exedev:exedev "$bootstrap_token"
    cat >"$workspace/template-bootstrap.service" <<EOF
[Unit]
Description=Start a copied Linear agent runner
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=exedev
ExecStart=$bootstrap_script
Restart=no

[Install]
WantedBy=multi-user.target
EOF
    sudo install -m 644 "$workspace/template-bootstrap.service" "$bootstrap_service"
    sudo systemctl daemon-reload
    sudo systemctl enable linear-agent-template-bootstrap.service >/dev/null
}

prepare_template() {
    local cached_commit cached_lock current_commit current_lock
    install_node
    sudo mkdir -p "$template_root"
    sudo chown -R exedev:exedev "$template_root"
    if [ ! -d "$repository_dir/.git" ]; then
        git clone --quiet --depth=1 --filter=blob:none \
            --branch "$GITHUB_BASE_REF" --single-branch \
            "https://github.com/${GITHUB_REPOSITORY}.git" "$repository_dir"
    else
        git -C "$repository_dir" fetch --quiet --depth=1 origin "$GITHUB_BASE_REF"
        git -C "$repository_dir" checkout --quiet -B "$GITHUB_BASE_REF" FETCH_HEAD
        git -C "$repository_dir" reset --quiet --hard FETCH_HEAD
        git -C "$repository_dir" clean -ffd >/dev/null
    fi
    install_template_bootstrap
    current_commit="$(git -C "$repository_dir" rev-parse HEAD)"
    current_lock="$(lockfile_hash)"
    cached_commit="$(sed -n 's/^commit=//p' "$template_marker" 2>/dev/null || true)"
    cached_lock="$(sed -n 's/^lockfile_sha256=//p' "$template_marker" 2>/dev/null || true)"
    if [ "$cached_lock" = "$current_lock" ] && [ -x "$repository_dir/node_modules/.bin/tsc" ]; then
        if [ "$cached_commit" != "$current_commit" ]; then
            build_shared_packages
        fi
        warm_vite_dependencies
        cache_preview_images
        printf 'commit=%s\nlockfile_sha256=%s\n' \
            "$current_commit" "$current_lock" >"$template_marker"
        sudo systemctl stop docker.service docker.socket >/dev/null 2>&1 || true
        echo "READY: template=$HOSTNAME commit=$current_commit"
        return
    fi
    prepare_python
    prepare_lightdash
    warm_vite_dependencies
    cache_preview_images
    printf 'commit=%s\nlockfile_sha256=%s\n' \
        "$(git -C "$repository_dir" rev-parse HEAD)" \
        "$(lockfile_hash)" >"$template_marker"
    sudo systemctl stop docker.service docker.socket >/dev/null 2>&1 || true
    echo "READY: template=$HOSTNAME commit=$(git -C "$repository_dir" rev-parse HEAD)"
}

refresh_template_checkout() {
    local cached_commit cached_lock current_commit current_lock
    install_node
    git -C "$repository_dir" fetch --quiet --depth=1 origin "$GITHUB_BASE_REF"
    git -C "$repository_dir" checkout --quiet -B "$GITHUB_BASE_REF" FETCH_HEAD
    git -C "$repository_dir" reset --quiet --hard FETCH_HEAD
    git -C "$repository_dir" clean -ffd >/dev/null
    cached_commit="$(sed -n 's/^commit=//p' "$template_marker")"
    cached_lock="$(sed -n 's/^lockfile_sha256=//p' "$template_marker")"
    current_commit="$(git -C "$repository_dir" rev-parse HEAD)"
    current_lock="$(lockfile_hash)"
    if [ -z "$cached_lock" ] || [ "$cached_lock" != "$current_lock" ]; then
        prepare_lightdash
        printf 'commit=%s\nlockfile_sha256=%s\n' \
            "$current_commit" \
            "$current_lock" >"$template_marker"
    elif [ "$cached_commit" != "$current_commit" ]; then
        build_shared_packages
        printf 'commit=%s\nlockfile_sha256=%s\n' \
            "$current_commit" \
            "$current_lock" >"$template_marker"
    fi
}

set_env_value() {
    local key="$1" value="$2" file="$3"
    if grep -q "^${key}=" "$file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    else
        printf '%s=%s\n' "$key" "$value" >>"$file"
    fi
}

write_preview_vite_config() {
    cp "$repository_dir/packages/frontend/vite.config.ts" "$preview_vite_config"
    node - "$preview_vite_config" <<'JS'
const fs = require('node:fs');
const path = process.argv[2];
const source = fs.readFileSync(path, 'utf8');
const needle = '    server: {\n        port: FE_PORT,';
const replacement = `    server: {
        warmup: {
            clientFiles: [
                './src/index.tsx',
                './src/App.tsx',
                './src/Routes.tsx',
                './src/pages/Login.tsx',
                './src/providers/**/*.{ts,tsx}',
                './src/features/users/**/*.{ts,tsx}',
                './src/hooks/thirdPartyServices/**/*.{ts,tsx}',
                './src/components/NavBar/**/*.{ts,tsx}',
                './src/components/common/DocumentTitle/**/*.{ts,tsx}',
                './src/components/common/ProjectLayout/**/*.{ts,tsx}',
                './src/pages/Home.tsx',
                './src/components/Home/**/*.{ts,tsx}',
                './src/ee/components/Home/**/*.{ts,tsx}',
                './src/ee/features/homepageBuilder/**/*.{ts,tsx}',
                './src/ee/features/managedAgent/ManagedAgentHomeCard.tsx',
                './src/pages/Explorer.tsx',
                './src/components/Explorer/**/*.{ts,tsx}',
                './src/features/explorer/**/*.{ts,tsx}',
                './src/providers/Explorer/**/*.{ts,tsx}',
                './src/hooks/explorer/**/*.{ts,tsx}',
                './src/hooks/useExplorer*.{ts,tsx}',
                './src/pages/Dashboard.tsx',
                './src/components/common/Dashboard/**/*.{ts,tsx}',
                './src/components/DashboardTiles/**/*.{ts,tsx}',
                './src/features/dashboardFilters/**/*.{ts,tsx}',
                './src/features/dashboardTabs/**/*.{ts,tsx}',
                './src/providers/Dashboard/**/*.{ts,tsx}',
                './src/hooks/dashboard/**/*.{ts,tsx}',
                '!./src/**/*.{test,spec}.{ts,tsx}',
                '!./src/**/*.stories.{ts,tsx}',
                '!./src/**/*.{mock,mocks}.{ts,tsx}',
                '!./src/**/__tests__/**/*.{ts,tsx}',
                '!./src/**/__mocks__/**/*.{ts,tsx}',
            ],
        },
        port: FE_PORT,`;
if (!source.includes(needle)) throw new Error('Vite server configuration shape changed');
fs.writeFileSync(path, source.replace(needle, replacement));
JS
    grep -qxF '/packages/frontend/vite.linear-agent.config.ts' "$repository_dir/.git/info/exclude" || \
        printf '%s\n' '/packages/frontend/vite.linear-agent.config.ts' >>"$repository_dir/.git/info/exclude"
}

warm_vite_dependencies() {
    write_preview_vite_config
    cd "$repository_dir"
    pnpm -F frontend exec vite optimize \
        --config "$preview_vite_config" >/dev/null
}

start_preview() {
    local preview_url="https://${EXE_RUNNER_VM_NAME}.exe.xyz"
    local preview_compose="$workspace/docker-compose.preview.yml"
    local preview_ecosystem="$workspace/preview.ecosystem.config.js"
    local db_container health_code
    cd "$repository_dir"
    if ! docker info >/dev/null 2>&1; then
        sudo sh -c 'nohup dockerd >/tmp/linear-agent-dockerd.log 2>&1 &'
        for _ in $(seq 1 30); do
            docker info >/dev/null 2>&1 && break
            sleep 2
        done
        docker info >/dev/null 2>&1 || return $?
    fi
    ./scripts/dev-ports.sh claim >/dev/null 2>&1 || return $?
    eval "$(./scripts/dev-ports.sh env)" || return $?
    touch .env.development.local
    set_env_value LD_INSTANCE_ID "$LD_INSTANCE_ID" .env.development.local
    set_env_value PGHOST localhost .env.development.local
    set_env_value PGPORT "$LD_PG_PORT" .env.development.local
    set_env_value PORT "$PORT" .env.development.local
    set_env_value FE_PORT "$FE_PORT" .env.development.local
    set_env_value SCHEDULER_PORT "$SCHEDULER_PORT" .env.development.local
    set_env_value DEBUG_PORT "$DEBUG_PORT" .env.development.local
    set_env_value SDK_TEST_PORT "$SDK_TEST_PORT" .env.development.local
    set_env_value MAPLE_PORT "$MAPLE_PORT" .env.development.local
    set_env_value LIGHTDASH_PROMETHEUS_PORT "$LIGHTDASH_PROMETHEUS_PORT" .env.development.local
    set_env_value SITE_URL "$preview_url" .env.development.local
    set_env_value INTERNAL_LIGHTDASH_HOST "http://localhost:${FE_PORT}" .env.development.local
    set_env_value LIGHTDASH_API_URL "http://localhost:${PORT}" .env.development.local
    set_env_value S3_ENDPOINT http://localhost:9000 .env.development.local
    set_env_value HEADLESS_BROWSER_HOST localhost .env.development.local
    set_env_value HEADLESS_BROWSER_PORT 3001 .env.development.local
    set_env_value EMAIL_SMTP_HOST localhost .env.development.local
    set_env_value EMAIL_SMTP_PORT 1025 .env.development.local
    set_env_value EMAIL_SMTP_SECURE false .env.development.local
    set_env_value EMAIL_SMTP_USE_AUTH false .env.development.local
    set_env_value EMAIL_SMTP_ALLOW_INVALID_CERT true .env.development.local
    set_env_value EMAIL_SMTP_SENDER_NAME Lightdash .env.development.local
    set_env_value EMAIL_SMTP_SENDER_EMAIL noreply@lightdash.local .env.development.local
    set_env_value DBT_DEMO_DIR "$repository_dir/examples/full-jaffle-shop-demo" .env.development.local
    set_env_value LDPAT ldpat_deadbeefdeadbeefdeadbeefdeadbeef .env.development.local
    set_env_value ALLOW_MULTIPLE_ORGS false .env.development.local
    set_env_value RUDDERSTACK_ANALYTICS_DISABLED true .env.development.local
    set_env_value SENTRY_DSN '' .env.development.local
    set_env_value SENTRY_BE_DSN '' .env.development.local
    set_env_value SENTRY_FE_DSN '' .env.development.local
    set_env_value LIGHTDASH_OTEL_TRACES_ENABLED false .env.development.local
    db_container="${LD_CONTAINER_PREFIX}-db-dev-1"
    cat >"$preview_compose" <<YAML
volumes:
    minio_data:
    postgres_data:

services:
    db-dev:
        image: pgvector/pgvector:pg18
        container_name: ${db_container}
        restart: always
        environment:
            POSTGRES_PASSWORD: password
        ports:
            - '${LD_PG_PORT}:5432'
        volumes:
            - postgres_data:/var/lib/postgresql

    minio:
        image: coollabsio/minio:latest
        ports:
            - '9000:9000'
        environment:
            - MINIO_ROOT_USER=minioadmin
            - MINIO_ROOT_PASSWORD=minioadmin
            - MINIO_DEFAULT_BUCKETS=default,results,lightdash-apps
            - MINIO_BROWSER=off
        volumes:
            - minio_data:/minio/data
            - ${repository_dir}/docker/init-minio.sh:/init-minio.sh:ro
        entrypoint: '/init-minio.sh'

    mailpit:
        image: axllent/mailpit:latest
        restart: unless-stopped
        ports:
            - '1025:1025'
        environment:
            MP_MAX_MESSAGES: 5000
            MP_SMTP_AUTH_ACCEPT_ANY: 1
            MP_SMTP_AUTH_ALLOW_INSECURE: 1
YAML
    docker compose -p "$LD_COMPOSE_PROJECT" -f "$preview_compose" up -d || return $?
    for _ in $(seq 1 30); do
        docker exec "$db_container" pg_isready -U postgres >/dev/null 2>&1 && break
        sleep 2
    done
    docker exec "$db_container" pg_isready -U postgres >/dev/null 2>&1 || return $?
    export PATH="$repository_dir/venv/bin:$PATH"
    build_shared_packages || return $?
    PGHOST=localhost PGPORT="$LD_PG_PORT" \
        pnpx dotenv-cli -e .env.development.local -e .env.development -- \
        pnpm -F backend migrate || return $?
    PGHOST=localhost PGPORT="$LD_PG_PORT" \
        pnpx dotenv-cli -e .env.development.local -e .env.development -- \
        pnpm -F backend seed || return $?
    PGHOST=localhost PGPORT="$LD_PG_PORT" PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
        "$repository_dir/venv/bin/dbt" seed \
        --project-dir examples/full-jaffle-shop-demo/dbt \
        --profiles-dir examples/full-jaffle-shop-demo/profiles || return $?
    PGHOST=localhost PGPORT="$LD_PG_PORT" PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
        "$repository_dir/venv/bin/dbt" run \
        --project-dir examples/full-jaffle-shop-demo/dbt \
        --profiles-dir examples/full-jaffle-shop-demo/profiles || return $?
    warm_vite_dependencies || return $?
    cat >"$preview_ecosystem" <<JS
const base = require('${repository_dir}/ecosystem.config.js');
const names = new Set(['${LD_INSTANCE_ID}-api', '${LD_INSTANCE_ID}-frontend']);
const frontendName = '${LD_INSTANCE_ID}-frontend';

module.exports = {
    apps: base.apps.filter((app) => names.has(app.name)).map((app) => ({
        ...app,
        ...(app.name === frontendName
            ? { args: ((app.args || '') + ' --config ${preview_vite_config}').trim() }
            : {}),
        env: {
            ...app.env,
            RUDDERSTACK_ANALYTICS_DISABLED: 'true',
            SENTRY_DSN: '',
            SENTRY_BE_DSN: '',
            SENTRY_FE_DSN: '',
            LIGHTDASH_OTEL_TRACES_ENABLED: 'false',
        },
    })),
};
JS
    pnpm exec pm2 delete "${LD_INSTANCE_ID}-api" "${LD_INSTANCE_ID}-frontend" \
        >/dev/null 2>&1 || true
    pnpm exec pm2 start "$preview_ecosystem" >/dev/null || return $?
    health_code=""
    for _ in $(seq 1 60); do
        health_code="$(curl --silent --output /dev/null --write-out '%{http_code}' \
            "http://localhost:${FE_PORT}/api/v1/health" 2>/dev/null || true)"
        [ "$health_code" = 200 ] && break
        sleep 2
    done
    [ "$health_code" = 200 ]
    curl --fail --silent --output /dev/null "http://localhost:${FE_PORT}/login"
}

write_failed_evidence_result() {
    local prompt_id="$1" plan_file="$2" result_file="$3" reason="$4"
    NODE_PATH="$repository_dir/packages/backend/node_modules" node \
        "$workspace/capture-evidence.cjs" \
        "http://host.docker.internal:${FE_PORT}" \
        unavailable \
        "$plan_file" \
        "$workspace/evidence-${prompt_id}" \
        "$result_file" \
        "$reason" >"$workspace/evidence-capture-${prompt_id}.log" 2>&1 || true
}

capture_visual_evidence() {
    local prompt_id="$1"
    local plan_file="$workspace/evidence-plan-${prompt_id}.json"
    local result_file="$workspace/evidence-result-${prompt_id}.json"
    local error_file="$workspace/evidence-error-${prompt_id}.log"
    local evidence_prompt="$workspace/evidence-prompt-${prompt_id}.txt"
    local browser_container="${LD_CONTAINER_PREFIX}-evidence-browser"
    local browser_ready=false capture_exit plan_valid=false

    [ -f "$workspace/capture-evidence.cjs" ] || {
        printf '%s\n' 'The evidence capture helper is missing.' >"$error_file"
        return 1
    }
    cat >"$evidence_prompt" <<EOF
The Lightdash preview for the implementation is running locally. Prepare a visual evidence plan that demonstrates the fix or functionality you just implemented. Do not modify repository files and do not take a generic homepage screenshot unless the change itself is on the homepage.

Respond with only valid JSON using this shape:
{
  "screenshots": [
    {
      "name": "short-kebab-name",
      "description": "What this screenshot proves",
      "path": "/relevant/lightdash/path",
      "steps": [
        "Open the relevant dashboard or page.",
        "Use the visible controls to reproduce the changed state.",
        "Confirm the expected result shown in the screenshot."
      ],
      "authenticated": true,
      "fullPage": false,
      "actions": [
        { "type": "fill", "selector": "CSS selector", "value": "value" },
        { "type": "click", "selector": "CSS selector", "repeat": 1, "force": false, "waitAfterMs": 500 },
        { "type": "press", "selector": "CSS selector", "key": "Enter" },
        { "type": "waitFor", "selector": "CSS selector", "state": "visible" },
        { "type": "assertText", "selector": "optional CSS selector", "value": "Expected visible text" },
        { "type": "wait", "milliseconds": 500 }
      ]
    }
  ]
}

Use at most three screenshots. For each screenshot, write 2-6 steps in plain language that let a reviewer reproduce the visual result. Name visible controls and the expected result; do not mention CSS selectors or include login as a step. Make the description explain the page, changed state, and what visibly confirms success. Set authenticated to false for login or authentication states. The capture uses the seeded demo user automatically when authenticated is true. Use only seeded demo data. Never put client or customer names, organization names, or customer-provided data examples in screenshot names, descriptions, steps, actions, assertions, or visible form values. Set force to true for repeated clicks that may be covered by transient notifications. End each screenshot with assertText for the visible result that proves its description. Inspect routes, selectors, and seeded data as needed so the plan targets the implemented behavior. Omit unnecessary actions and ensure the final state visibly demonstrates the change.
EOF
    set +e
    (
        cd "$repository_dir"
        CODEX_API_KEY="$(cat "$codex_key_file")" codex exec resume --last \
            --ignore-user-config --output-last-message "$plan_file" \
            --config 'sandbox_mode="read-only"' \
            --config shell_environment_policy.ignore_default_excludes=false \
            - <"$evidence_prompt" >"$workspace/evidence-codex-${prompt_id}.log" 2>&1
    )
    capture_exit=$?
    set -e
    if [ "$capture_exit" -eq 0 ] && [ -s "$plan_file" ]; then
        plan_valid="$(python3 - "$plan_file" <<'PY'
import json
import pathlib
import sys
try:
    path = pathlib.Path(sys.argv[1])
    text = path.read_text(encoding='utf-8').strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        value = json.loads(text[text.index('{'):text.rindex('}') + 1])
    shots = value.get('screenshots', [])
    valid = (
        isinstance(shots, list)
        and 0 < len(shots) <= 3
        and all(
            isinstance(shot, dict)
            and isinstance(shot.get('steps'), list)
            and 2 <= len(shot['steps']) <= 6
            and all(isinstance(step, str) and step.strip() for step in shot['steps'])
            for shot in shots
        )
    )
    if valid:
        path.write_text(json.dumps(value), encoding='utf-8')
    print('true' if valid else 'false')
except Exception:
    print('false')
PY
)"
    fi
    if [ "$plan_valid" != true ]; then
        printf '%s\n' 'The visual evidence agent did not produce a valid screenshot plan.' >"$error_file"
        return 1
    fi

    docker rm -f "$browser_container" >/dev/null 2>&1 || true
    if ! docker run --detach --rm \
        --name "$browser_container" \
        --add-host host.docker.internal:host-gateway \
        --shm-size=512m \
        --publish 127.0.0.1:3001:3000 \
        --env CONNECTION_TIMEOUT=120000 \
        ghcr.io/browserless/chromium:v2.49.0 >"$workspace/evidence-browser-${prompt_id}.id"; then
        write_failed_evidence_result \
            "$prompt_id" "$plan_file" "$result_file" 'Browserless failed to start.'
        printf '%s\n' 'Browserless failed to start.' >"$error_file"
        return 1
    fi
    for _ in $(seq 1 30); do
        if curl --fail --silent --output /dev/null http://127.0.0.1:3001/json/version; then
            browser_ready=true
            break
        fi
        sleep 1
    done
    if [ "$browser_ready" != true ]; then
        write_failed_evidence_result \
            "$prompt_id" "$plan_file" "$result_file" 'Browserless did not become ready.'
        printf '%s\n' 'Browserless did not become ready.' >"$error_file"
        docker rm -f "$browser_container" >/dev/null 2>&1 || true
        return 1
    fi

    set +e
    NODE_PATH="$repository_dir/packages/backend/node_modules" node \
        "$workspace/capture-evidence.cjs" \
        "http://host.docker.internal:${FE_PORT}" \
        ws://127.0.0.1:3001 \
        "$plan_file" \
        "$workspace/evidence-${prompt_id}" \
        "$result_file" >"$workspace/evidence-capture-${prompt_id}.log" 2>&1
    capture_exit=$?
    set -e
    docker rm -f "$browser_container" >/dev/null 2>&1 || true
    if [ "$capture_exit" -ne 0 ]; then
        {
            tail -c 2000 "$workspace/evidence-codex-${prompt_id}.log" 2>/dev/null || true
            tail -c 2000 "$workspace/evidence-capture-${prompt_id}.log" 2>/dev/null || true
        } >"$error_file"
        return 1
    fi
}

if [ "$template_mode" = true ]; then
    prepare_template
    exit 0
fi

post_simple_event started 'Refreshing the prepared Lightdash environment.'
trap 'report_bootstrap_error "$LINENO"' ERR
if [ -f "$template_marker" ] && [ -d "$repository_dir/.git" ]; then
    refresh_template_checkout
else
    install_node
    git clone --quiet --depth=1 --filter=blob:none --branch "$GITHUB_BASE_REF" --single-branch \
        "https://github.com/${GITHUB_REPOSITORY}.git" "$repository_dir"
    prepare_python
    prepare_lightdash
fi
base_commit="$(git -C "$repository_dir" rev-parse HEAD)"
curl --fail --silent --show-error --retry 5 -H "$auth_header" \
    "$job_url/codex-key" >"$codex_key_file"
cat >"$workspace/codex-output-schema.json" <<'JSON'
{
  "type": "object",
  "properties": {
    "prTitle": { "type": "string" },
    "summary": { "type": "string" },
    "responseMarkdown": { "type": "string" }
  },
  "required": ["prTitle", "summary", "responseMarkdown"],
  "additionalProperties": false
}
JSON
post_simple_event ready 'Repository and runtimes are ready.'
trap - ERR

first_turn=true
while [ "$(($(date +%s) - started_at))" -lt "$EXE_RUNNER_TTL_SECONDS" ]; do
    headers="$workspace/next.headers"
    prompt="$workspace/prompt.txt"
    status="$(curl --silent --show-error --retry 5 -D "$headers" -o "$prompt" \
        -w '%{http_code}' -H "$auth_header" "$job_url/next")"
    if [ "$status" = 204 ]; then
        sleep 3
        continue
    fi
    if [ "$status" != 200 ]; then
        post_simple_event error "Prompt polling failed with HTTP $status."
        sleep 10
        continue
    fi

    prompt_id="$(sed -n 's/^[Xx]-[Pp]rompt-[Ii]d: *//p' "$headers" | tr -d '\r' | tail -n 1)"
    final_message="$workspace/final-${prompt_id}.md"
    run_prompt="$workspace/run-prompt-${prompt_id}.txt"
    {
        printf 'Work on this Linear request in the current repository. Implement the change, run focused validation, and leave all edits in the working tree. Do not push or create a pull request. The runner will start the Lightdash preview after your turn, so do not run scripts/dev-fast-start.sh yourself. In the structured final response, generate a semantic prTitle based on the actual implementation (for example, fix(auth): enforce login attempt limits), a concise 1-3 sentence summary, and responseMarkdown with clear headings for what changed and validation. Never include client or customer names, organization names, or customer data examples in prTitle, summary, or responseMarkdown; describe the behavior generically. Do not add Linear or GitHub closing/reference lines because the controller adds verified references. Use Markdown lists and fenced code blocks where they improve readability.\n\n'
        cat "$prompt"
    } >"$run_prompt"

    post_simple_event started "Codex started prompt ${prompt_id}."
    set +e
    if [ "$first_turn" = true ]; then
        CODEX_API_KEY="$(cat "$codex_key_file")" codex exec \
            --sandbox danger-full-access --ignore-user-config \
            --config shell_environment_policy.ignore_default_excludes=false \
            --output-schema "$workspace/codex-output-schema.json" \
            --json \
            --cd "$repository_dir" --output-last-message "$final_message" - \
            <"$run_prompt" 2>>"$workspace/codex-${prompt_id}.log" |
            node "$workspace/stream-codex-events.cjs" \
                "$workspace/codex-${prompt_id}.jsonl" \
                2>>"$workspace/codex-${prompt_id}.log"
        exit_code="${PIPESTATUS[0]}"
    else
        (
            cd "$repository_dir"
            CODEX_API_KEY="$(cat "$codex_key_file")" codex exec resume --last \
                --ignore-user-config --output-last-message "$final_message" \
                --config 'sandbox_mode="danger-full-access"' \
                --config shell_environment_policy.ignore_default_excludes=false \
                --output-schema "$workspace/codex-output-schema.json" \
                --json \
                - \
                <"$run_prompt" 2>>"$workspace/codex-${prompt_id}.log" |
                node "$workspace/stream-codex-events.cjs" \
                    "$workspace/codex-${prompt_id}.jsonl" \
                    2>>"$workspace/codex-${prompt_id}.log"
            exit "${PIPESTATUS[0]}"
        )
        exit_code=$?
    fi
    set -e

    if [ "$exit_code" -ne 0 ]; then
        post_simple_event error "Codex exited with status ${exit_code}."
        continue
    fi
    first_turn=false

    git -C "$repository_dir" add --intent-to-add --all
    patch_file="$workspace/change-${prompt_id}.patch"
    git -C "$repository_dir" diff --binary --full-index HEAD -- >"$patch_file"

    preview_ready=false
    preview_error=""
    evidence_result="$workspace/evidence-result-${prompt_id}.json"
    evidence_error_file="$workspace/evidence-error-${prompt_id}.log"
    if [ "$EXE_RUNNER_PUBLIC_PREVIEW" = true ]; then
        post_simple_event preview-started 'Starting the Lightdash preview.'
        set +e
        start_preview >"$workspace/preview-${prompt_id}.log" 2>&1
        preview_exit=$?
        set -e
        if [ "$preview_exit" -eq 0 ]; then
            preview_ready=true
            post_simple_event evidence-started 'Capturing visual evidence for the draft pull request.'
            set +e
            (capture_visual_evidence "$prompt_id")
            evidence_exit=$?
            set -e
            if [ "$evidence_exit" -ne 0 ] && [ ! -s "$evidence_error_file" ]; then
                printf '%s\n' 'Visual evidence capture failed.' >"$evidence_error_file"
            fi
        else
            preview_error="$(tail -c 3000 "$workspace/preview-${prompt_id}.log")"
            printf '%s\n' 'The preview was unavailable, so visual evidence could not be captured.' >"$evidence_error_file"
        fi
    else
        printf '%s\n' 'Public previews are disabled, so visual evidence could not be captured.' >"$evidence_error_file"
    fi

    payload="$workspace/result-${prompt_id}.json"
    python3 - "$final_message" "$patch_file" "$evidence_result" \
        "$evidence_error_file" "$base_commit" "$prompt_id" \
        "$preview_ready" "$preview_error" >"$payload" <<'PY'
import base64
import json
import pathlib
import sys

(
    final_path,
    patch_path,
    evidence_path,
    evidence_error_path,
    base_commit,
    prompt_id,
    preview_ready,
    preview_error,
) = sys.argv[1:]
final_output = {}
try:
    final_output = json.loads(pathlib.Path(final_path).read_text())
except (FileNotFoundError, json.JSONDecodeError):
    pass
body = str(final_output.get("responseMarkdown", "Implementation complete."))
patch = base64.b64encode(pathlib.Path(patch_path).read_bytes()).decode()
evidence = []
evidence_errors = []
evidence_bytes = 0
try:
    capture = json.loads(pathlib.Path(evidence_path).read_text())
    evidence_errors.extend(capture.get("errors", []))
    for item in capture.get("evidence", [])[:3]:
        evidence_item = {
            "name": str(item.get("name", "screenshot"))[:80],
            "description": str(item.get("description", "Visual evidence"))[:300],
            "relativeUrl": str(item.get("relativeUrl", ""))[:2000],
            "steps": [str(step)[:300] for step in item.get("steps", [])[:10]],
        }
        image_path = pathlib.Path(item.get("file", ""))
        if not image_path.is_file() or image_path.stat().st_size > 2 * 1024 * 1024:
            evidence_item["error"] = str(item.get("error", "Image capture failed"))[:1000]
            evidence.append(evidence_item)
            continue
        if evidence_bytes + image_path.stat().st_size > 4 * 1024 * 1024:
            evidence_errors.append(f"Skipped {image_path.name}: total evidence size exceeded 4 MB")
            evidence_item["error"] = "Image capture exceeded the total evidence size limit"
            evidence.append(evidence_item)
            continue
        evidence_bytes += image_path.stat().st_size
        evidence_item.update({
            "mimeType": "image/jpeg",
            "dataBase64": base64.b64encode(image_path.read_bytes()).decode(),
        })
        evidence.append(evidence_item)
except (FileNotFoundError, json.JSONDecodeError):
    pass
try:
    evidence_errors.append(pathlib.Path(evidence_error_path).read_text()[-2000:])
except FileNotFoundError:
    pass
print(json.dumps({
    "type": "result",
    "body": body,
    "prTitle": str(final_output.get("prTitle", ""))[:160],
    "summary": str(final_output.get("summary", ""))[:3000],
    "patchBase64": patch,
    "baseCommit": base_commit,
    "promptId": int(prompt_id),
    "previewReady": preview_ready == "true",
    "previewError": preview_error,
    "evidence": evidence,
    "evidenceError": "\n".join(str(error) for error in evidence_errors if error).strip(),
}))
PY
    post_json "$payload"
done
