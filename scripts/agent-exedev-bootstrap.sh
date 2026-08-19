#!/usr/bin/env bash
# VM-side preview bootstrap for agent exe.dev sessions: starts the runner
# containers, builds shared packages, migrates, and serves the app with pm2.
# Uploaded and launched by agent-exedev-dev.sh; credential-free by design
# (publishing the port needs exe.dev access and stays on the client side).
# Usage: agent-exedev-bootstrap.sh [vm-name] | agent-exedev-bootstrap.sh --prepare-template
set -Eeuo pipefail

template_mode=false
if [ "${1:-}" = "--prepare-template" ]; then
    template_mode=true
    vm_name="$(hostname)"
else
    vm_name="${1:-$(hostname)}"
fi
workspace="/home/exedev/linear-agent"
repository_dir="/opt/linear-agent-template/repository"
preview_prepared_marker="/opt/linear-agent-template/preview-prepared"
preview_vite_config="$repository_dir/packages/frontend/vite.linear-agent.config.ts"
preview_url="https://${vm_name}.exe.xyz"
runner_compose="$workspace/docker-compose.runner.yml"
preview_ecosystem="$workspace/preview.ecosystem.config.js"

[ -f "$runner_compose" ] || {
    echo "runner compose file not found: $runner_compose" >&2
    exit 1
}

# Template installs node under /opt and pnpm under the workspace npm prefix.
node_root="$(ls -d /opt/node-v*-linux-* 2>/dev/null | head -1)"
[ -n "$node_root" ] || { echo "node install root not found under /opt" >&2; exit 1; }
export PATH="$node_root/bin:$workspace/npm/bin:$workspace/bin:$PATH"
export npm_config_prefix="$workspace/npm"

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

cd "$repository_dir"

current_commit="$(git rev-parse HEAD)"
current_lock="$(sha256sum pnpm-lock.yaml | awk '{print $1}')"
prepared_commit="$(sed -n 's/^commit=//p' "$preview_prepared_marker" 2>/dev/null || true)"
prepared_lock="$(sed -n 's/^lockfile_sha256=//p' "$preview_prepared_marker" 2>/dev/null || true)"
seed_required=false
dbt_required=false
if [ "$template_mode" = true ] || [ "${PREVIEW_RESEED:-0}" = 1 ] || \
    [ -z "$prepared_commit" ] || [ -z "$prepared_lock" ]; then
    seed_required=true
    dbt_required=true
elif git cat-file -e "${prepared_commit}^{commit}" 2>/dev/null && \
    ! git diff --quiet "$prepared_commit" -- examples/full-jaffle-shop-demo/dbt; then
    dbt_required=true
fi

echo "== docker =="
if ! docker info >/dev/null 2>&1; then
    sudo systemctl start docker.service 2>/dev/null || \
        sudo sh -c 'nohup dockerd >/tmp/linear-agent-dockerd.log 2>&1 &'
    for _ in $(seq 1 30); do
        docker info >/dev/null 2>&1 && break
        sleep 2
    done
    docker info >/dev/null 2>&1 || { echo "dockerd did not come up" >&2; exit 1; }
fi

# A runner VM owns all of its infrastructure. Lightdash's normal local-dev
# bootstrap may leave the multi-worktree `ld-shared` project behind if an agent
# invokes it accidentally. Remove only those legacy containers before starting
# the runner project so fixed ports remain single-owner resources.
mapfile -t legacy_shared_containers < <(
    docker ps -aq --filter label=com.docker.compose.project=ld-shared
)
if ((${#legacy_shared_containers[@]} > 0)); then
    echo "== remove unsupported ld-shared containers =="
    docker rm -f "${legacy_shared_containers[@]}" >/dev/null
fi

echo "== ports + env =="
./scripts/dev-ports.sh claim >/dev/null 2>&1
eval "$(./scripts/dev-ports.sh env)"
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

echo "== runner compose (postgres/minio/mailpit/browserless) =="
db_container="${LD_CONTAINER_PREFIX}-db-dev-1"
# Recreate containers around the persistent named volumes. Docker can leave a
# container detached from its network after an earlier fixed-port bind failure;
# a plain `start` reports success without repairing that stale endpoint.
docker compose -p "$LD_COMPOSE_PROJECT" -f "$runner_compose" up -d --force-recreate
for _ in $(seq 1 30); do
    docker exec "$db_container" pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 2
done
docker exec "$db_container" pg_isready -U postgres >/dev/null 2>&1
for _ in $(seq 1 30); do
    curl --fail --silent --output /dev/null http://127.0.0.1:3001/json/version && break
    sleep 2
done
curl --fail --silent --output /dev/null http://127.0.0.1:3001/json/version

export PATH="$repository_dir/venv/bin:$PATH"

echo "== build shared packages =="
pnpm -F common build
pnpm -F warehouses build
pnpm -F @lightdash/formula build

echo "== migrate =="
# Development seeds reference tables owned by the EE migration directory even
# when the preview app runs unlicensed. A non-secret marker includes the full
# schema during migration without enabling licensed features in the app.
LIGHTDASH_LICENSE_KEY=preview-template PGHOST=localhost PGPORT="$LD_PG_PORT" \
    pnpx dotenv-cli -e .env.development.local -e .env.development -- \
    pnpm -F backend migrate
if [ "$seed_required" = true ]; then
    echo "== seed application data =="
    PGHOST=localhost PGPORT="$LD_PG_PORT" \
        pnpx dotenv-cli -e .env.development.local -e .env.development -- \
        pnpm -F backend seed

fi

if [ "$dbt_required" = true ]; then
    echo "== dbt seed + run =="
    PGHOST=localhost PGPORT="$LD_PG_PORT" PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
        "$repository_dir/venv/bin/dbt" seed \
        --project-dir examples/full-jaffle-shop-demo/dbt \
        --profiles-dir examples/full-jaffle-shop-demo/profiles
    PGHOST=localhost PGPORT="$LD_PG_PORT" PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
        "$repository_dir/venv/bin/dbt" run \
        --project-dir examples/full-jaffle-shop-demo/dbt \
        --profiles-dir examples/full-jaffle-shop-demo/profiles
fi

if [ "$seed_required" = false ] && [ "$dbt_required" = false ]; then
    echo "== seeded data inherited from template =="
else
    echo "== seeded data ready =="
fi

echo "== pm2 (api + frontend, dev mode) =="
write_preview_vite_config
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
pnpm exec pm2 start "$preview_ecosystem" >/dev/null

echo "== health check =="
health_code=""
for _ in $(seq 1 60); do
    health_code="$(curl --silent --output /dev/null --write-out '%{http_code}' \
        "http://localhost:${FE_PORT}/api/v1/health" 2>/dev/null || true)"
    [ "$health_code" = 200 ] && break
    sleep 2
done
[ "$health_code" = 200 ] || { echo "health check failed (last code: $health_code)" >&2; exit 1; }
curl --fail --silent --output /dev/null "http://localhost:${FE_PORT}/login"

if [ "$template_mode" = true ]; then
    printf 'commit=%s\nlockfile_sha256=%s\ncompose_project=%s\n' \
        "$current_commit" "$current_lock" "$LD_COMPOSE_PROJECT" > "$preview_prepared_marker"
    pnpm exec pm2 delete "${LD_INSTANCE_ID}-api" "${LD_INSTANCE_ID}-frontend" \
        >/dev/null 2>&1 || true
    pnpm exec pm2 kill >/dev/null 2>&1 || true
    docker compose -p "$LD_COMPOSE_PROJECT" -f "$runner_compose" stop >/dev/null
    sudo systemctl stop docker.service docker.socket >/dev/null 2>&1 || true
    echo "TEMPLATE PREVIEW READY: commit=${current_commit} compose=${LD_COMPOSE_PROJECT}"
    exit 0
fi

echo "PREVIEW_PORT=${FE_PORT}"
echo "PREVIEW READY (vm-local): publish port ${FE_PORT} -> ${preview_url}"
