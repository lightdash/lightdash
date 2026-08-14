/**
 * PM2 Ecosystem Configuration for Lightdash Local Development
 *
 * This file configures PM2 to manage all development processes.
 * Use `pnpm pm2:start` to start all processes.
 *
 * Multi-instance support:
 *   Set LD_INSTANCE_ID to namespace PM2 process names (default: 'lightdash').
 *   Port env vars (PORT, FE_PORT, SCHEDULER_PORT, etc.) override defaults.
 *   Use scripts/dev-ports.sh to manage port allocation across worktrees.
 *
 * Prerequisites:
 *   - Docker services running: `/docker-dev`
 *   - Dependencies installed: `pnpm install`
 *
 * Process overview:
 *   - <instanceId>-api: Backend API server (default port 8080)
 *   - <instanceId>-api-routes-watch: Regenerates TSOA routes on controller changes
 *   - <instanceId>-scheduler: Background job processor (default port 8081)
 *   - <instanceId>-frontend: Vite dev server (default port 3000)
 *   - <instanceId>-common-watch: TypeScript watcher for common package
 *   - <instanceId>-warehouses-watch: TypeScript watcher for warehouses package
 *   - <instanceId>-maple: Maple local-mode tracing server (default port 4320)
 *
 * Logs are stored in ~/.pm2/logs/ (PM2 default location)
 */

const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables: base config first, then local overrides
const baseEnvPath = path.resolve(__dirname, '.env.development');
const localEnvPath = path.resolve(__dirname, '.env.development.local');

const baseEnv = dotenv.config({ path: baseEnvPath }).parsed || {};
const localEnv = dotenv.config({ path: localEnvPath }).parsed || {};

// Merge: local overrides base
const env = { ...baseEnv, ...localEnv };

// Add venv/bin to PATH for dbt access
const venvBinPath = path.join(__dirname, 'venv', 'bin');
const envWithPath = {
    ...env,
    PATH: `${venvBinPath}:${process.env.PATH}`,
    // Production runs UTC. Without this, node-postgres parses the DB's naive-UTC
    // timestamps as local time, skewing every timestamp by the host's UTC offset
    // (false "message timed out" errors, wrong relative times in the UI).
    TZ: 'UTC',
};

// Instance ID for namespacing PM2 process names (supports multiple worktrees)
const instanceId = env.LD_INSTANCE_ID || 'lightdash';

// Configurable ports (defaults match single-instance behavior)
const apiPort = env.PORT || '8080';
const schedulerPort = env.SCHEDULER_PORT || '8081';
const debugPort = env.DEBUG_PORT || '9229';
const fePort = env.FE_PORT || undefined; // Vite auto-detects if not set
const sdkTestPort = env.SDK_TEST_PORT || '3030';
const sdkTestEnabled =
    (process.env.LD_ENABLE_SDK_TEST ?? env.LD_ENABLE_SDK_TEST) === 'true';
const maplePort = env.MAPLE_PORT || '4320';

// Maple is a standalone binary (not a node_modules bin), so it may be absent.
// Resolve it up front: without it there is nothing to export traces to, and an
// OTLP exporter pointed at a dead port just logs export failures every batch.
const mapleBin = (() => {
    const { stdout } = spawnSync('sh', ['-c', 'command -v maple'], {
        encoding: 'utf8',
    });
    return (stdout || '').trim() || undefined;
})();

// One Maple server per data dir, so namespace it by instance the same way the
// port is — two worktrees must not fight over ~/.maple/data.
const mapleDataDir = path.join(os.homedir(), '.maple', `data-${instanceId}`);

// Each app adds its own OTEL_SERVICE_NAME on top of this: service.name is what
// namespaces traces per checkout in the Maple UI.
const tracingEnv = mapleBin
    ? {
          LIGHTDASH_OTEL_TRACES_ENABLED: 'true',
          OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${maplePort}`,
      }
    : {};

// Log the root directory so it's obvious which worktree PM2 is running from
console.log(`\n  Lightdash PM2 root: ${__dirname}`);
console.log(`  Instance ID: ${instanceId}\n`);

if (!mapleBin) {
    console.log(
        '  maple not found on PATH — local tracing disabled.\n' +
            '  Install it with: curl -fsSL https://maple.dev/cli/install | sh\n',
    );
}

const frontendArgs = fePort ? `--port ${fePort}` : undefined;

module.exports = {
    apps: [
        // Backend API Server
        {
            name: `${instanceId}-api`,
            script: 'src/index.ts',
            interpreter: 'node',
            node_args: `--import tsx --inspect=0.0.0.0:${debugPort}`,
            cwd: path.join(__dirname, 'packages/backend'),
            env: {
                ...envWithPath,
                LIGHTDASH_MODE: 'development',
                HEADLESS: 'true',
                NODE_ENV: 'development',
                ...tracingEnv,
                OTEL_SERVICE_NAME: instanceId,
                PORT: apiPort,
            },
            watch: ['src'],
            ignore_watch: ['src/generated/swagger.json'],
            watch_delay: 500,
            autorestart: true,
            kill_timeout: 5000,
            merge_logs: true,
            time: true,
        },

        // TSOA route generation watcher
        {
            name: `${instanceId}-api-routes-watch`,
            script: 'pnpm',
            args: 'generate-api-dev',
            interpreter: 'none',
            cwd: __dirname,
            env: envWithPath,
            watch: false,
            autorestart: true,
            kill_timeout: 3000,
            merge_logs: true,
            time: true,
        },

        // Background Job Scheduler
        {
            name: `${instanceId}-scheduler`,
            script: 'src/scheduler.ts',
            interpreter: 'node',
            node_args: '--import tsx',
            cwd: path.join(__dirname, 'packages/backend'),
            env: {
                ...envWithPath,
                NODE_ENV: 'development',
                ...tracingEnv,
                OTEL_SERVICE_NAME: `${instanceId}-scheduler`,
                PORT: schedulerPort,
                LIGHTDASH_PROMETHEUS_ENABLED: 'false',
            },
            watch: false,
            autorestart: true,
            kill_timeout: 5000,
            merge_logs: true,
            time: true,
        },

        // Frontend Vite Dev Server
        {
            name: `${instanceId}-frontend`,
            script: 'node_modules/.bin/vite',
            ...(frontendArgs ? { args: frontendArgs } : {}),
            interpreter: 'none',
            cwd: path.join(__dirname, 'packages/frontend'),
            env: {
                NODE_ENV: 'development',
                PORT: apiPort,
            },
            watch: false,
            autorestart: false,
            kill_timeout: 5000,
            merge_logs: true,
            time: true,
        },

        // Common Package TypeScript Watcher
        {
            name: `${instanceId}-common-watch`,
            script: '../../node_modules/.bin/tsc',
            args: '--build --watch --preserveWatchOutput --incremental tsconfig.build.json',
            interpreter: 'none',
            cwd: path.join(__dirname, 'packages/common'),
            watch: false,
            autorestart: false,
            kill_timeout: 3000,
            merge_logs: true,
            time: true,
        },

        // Formula Package TypeScript Watcher
        {
            name: `${instanceId}-formula-watch`,
            script: '../../node_modules/.bin/tsc',
            args: '--build --watch --preserveWatchOutput tsconfig.json',
            interpreter: 'none',
            cwd: path.join(__dirname, 'packages/formula'),
            watch: false,
            autorestart: false,
            kill_timeout: 3000,
            merge_logs: true,
            time: true,
        },

        // Warehouses Package TypeScript Watcher
        {
            name: `${instanceId}-warehouses-watch`,
            script: '../../node_modules/.bin/tsc',
            args: '--build --watch --preserveWatchOutput tsconfig.json',
            interpreter: 'none',
            cwd: path.join(__dirname, 'packages/warehouses'),
            watch: false,
            autorestart: false,
            kill_timeout: 3000,
            merge_logs: true,
            time: true,
        },

        // SDK Test App (opt-in via LD_ENABLE_SDK_TEST=true — a full Vite dev
        // server that costs ~1.5GB RSS, so it must not start by default)
        ...(sdkTestEnabled
            ? [
                  {
                      name: `${instanceId}-sdk-test`,
                      script: 'node_modules/.bin/vite',
                      args: `--port ${sdkTestPort}`,
                      interpreter: 'none',
                      cwd: path.join(__dirname, 'packages/sdk-test-app'),
                      env: {
                          NODE_ENV: 'development',
                      },
                      watch: false,
                      autorestart: false,
                      kill_timeout: 3000,
                      merge_logs: true,
                      time: true,
                  },
              ]
            : []),

        // Maple local mode: OTLP ingest + embedded ClickHouse + trace UI.
        // --offline serves the UI from the binary (same-origin, no internet, no
        // Chrome local-network prompt). --on-dirty-store wipe keeps it from
        // refusing to boot after PM2 SIGKILLs it; local traces are disposable.
        ...(mapleBin
            ? [
                  {
                      name: `${instanceId}-maple`,
                      script: mapleBin,
                      args: `start --port ${maplePort} --data-dir ${mapleDataDir} --offline --on-dirty-store wipe`,
                      interpreter: 'none',
                      cwd: __dirname,
                      env: {
                          NODE_ENV: 'development',
                          MAPLE_NO_UPDATE_CHECK: '1',
                      },
                      watch: false,
                      autorestart: true,
                      kill_timeout: 3000,
                      merge_logs: true,
                      time: true,
                  },
              ]
            : []),
    ],
};
