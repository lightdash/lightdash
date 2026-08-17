#!/usr/bin/env bash
# VM-side Lightdash preview bootstrap — port of linear-agent/runner.sh start_preview.
# Credential-free by design: publishing the port needs EXE_API_KEY and stays
# app-side (scripts/preview.sh). Runs on a clone of ld-linear-agent-template.
# Usage: start-preview.sh [vm-name]   (vm-name defaults to hostname)
set -Eeuo pipefail

vm_name="${1:-$(hostname)}"
workspace="/home/exedev/linear-agent"
repository_dir="/opt/linear-agent-template/repository"
preview_vite_config="$repository_dir/packages/frontend/vite.linear-agent.config.ts"
preview_url="https://${vm_name}.exe.xyz"
preview_compose="$workspace/docker-compose.preview.yml"
preview_ecosystem="$workspace/preview.ecosystem.config.js"

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

echo "== compose (pg/minio/mailpit) =="
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
docker compose -p "$LD_COMPOSE_PROJECT" -f "$preview_compose" up -d
for _ in $(seq 1 30); do
    docker exec "$db_container" pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 2
done
docker exec "$db_container" pg_isready -U postgres >/dev/null 2>&1

export PATH="$repository_dir/venv/bin:$PATH"

echo "== build shared packages =="
pnpm -F common build
pnpm -F warehouses build
pnpm -F @lightdash/formula build

echo "== migrate + seed =="
PGHOST=localhost PGPORT="$LD_PG_PORT" \
    pnpx dotenv-cli -e .env.development.local -e .env.development -- \
    pnpm -F backend migrate
PGHOST=localhost PGPORT="$LD_PG_PORT" \
    pnpx dotenv-cli -e .env.development.local -e .env.development -- \
    pnpm -F backend seed

echo "== dbt =="
PGHOST=localhost PGPORT="$LD_PG_PORT" PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
    "$repository_dir/venv/bin/dbt" seed \
    --project-dir examples/full-jaffle-shop-demo/dbt \
    --profiles-dir examples/full-jaffle-shop-demo/profiles
PGHOST=localhost PGPORT="$LD_PG_PORT" PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
    "$repository_dir/venv/bin/dbt" run \
    --project-dir examples/full-jaffle-shop-demo/dbt \
    --profiles-dir examples/full-jaffle-shop-demo/profiles

echo "== pm2 (api + frontend, dev mode) =="
[ -f "$preview_vite_config" ] || write_preview_vite_config
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

echo "PREVIEW_PORT=${FE_PORT}"
echo "PREVIEW READY (vm-local): publish port ${FE_PORT} -> ${preview_url}"
