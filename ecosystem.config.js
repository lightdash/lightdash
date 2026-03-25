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
 *   - <instanceId>-scheduler: Background job processor (default port 8081)
 *   - <instanceId>-frontend: Vite dev server (default port 3000)
 *   - <instanceId>-common-watch: TypeScript watcher for common package
 *   - <instanceId>-warehouses-watch: TypeScript watcher for warehouses package
 *   - <instanceId>-spotlight: Sentry Spotlight debugging UI (default port 8969)
 *
 * Logs are stored in ~/.pm2/logs/ (PM2 default location)
 */

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
};

// Instance ID for namespacing PM2 process names (supports multiple worktrees)
const instanceId = env.LD_INSTANCE_ID || 'lightdash';

// Configurable ports (defaults match single-instance behavior)
const apiPort = env.PORT || '8080';
const schedulerPort = env.SCHEDULER_PORT || '8081';
const debugPort = env.DEBUG_PORT || '9229';
const fePort = env.FE_PORT || undefined; // Vite auto-detects if not set
const sdkTestPort = env.SDK_TEST_PORT || '3030';
const spotlightPort = env.SPOTLIGHT_PORT || '8969';

// Log the root directory so it's obvious which worktree PM2 is running from
console.log(`\n  Lightdash PM2 root: ${__dirname}`);
console.log(`  Instance ID: ${instanceId}\n`);

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
                SENTRY_SPOTLIGHT: `http://localhost:${spotlightPort}/stream`,
                PORT: apiPort,
            },
            watch: false,
            autorestart: true,
            kill_timeout: 5000,
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
                SENTRY_SPOTLIGHT: `http://localhost:${spotlightPort}/stream`,
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
                VITE_SENTRY_SPOTLIGHT: `http://localhost:${spotlightPort}/stream`,
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

        // SDK Test App
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

        // Spotlight.js Sidecar (Sentry Dev Debugging UI)
        {
            name: `${instanceId}-spotlight`,
            script: 'node_modules/.bin/spotlight',
            args: `--port ${spotlightPort}`,
            interpreter: 'none',
            cwd: __dirname,
            env: {
                NODE_ENV: 'development',
            },
            watch: false,
            autorestart: true,
            kill_timeout: 3000,
            merge_logs: true,
            time: true,
        },
    ],
};
