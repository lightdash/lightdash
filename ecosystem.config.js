/**
 * PM2 Ecosystem Configuration for Lightdash Local Development
 *
 * This file configures PM2 to manage all development processes.
 * Use `pnpm pm2:start` to start all processes.
 *
 * Prerequisites:
 *   - Docker services running: `./scripts/docker-dev.sh` or `/docker-dev`
 *   - Dependencies installed: `pnpm install`
 *
 * Process overview:
 *   - lightdash-api: Backend API server (port 8080)
 *   - lightdash-scheduler: Background job processor (port 8081)
 *   - lightdash-frontend: Vite dev server (port 3000)
 *   - lightdash-common-watch: TypeScript watcher for common package
 *   - lightdash-warehouses-watch: TypeScript watcher for warehouses package
 *   - lightdash-spotlight: Sentry Spotlight debugging UI (port 8969)
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

module.exports = {
    apps: [
        // ─────────────────────────────────────────────────────────────────
        // Backend API Server
        // ─────────────────────────────────────────────────────────────────
        {
            name: 'lightdash-api',
            script: 'src/index.ts',
            interpreter: 'node',
            node_args: '--import tsx --inspect=0.0.0.0:9229',
            cwd: path.join(__dirname, 'packages/backend'),
            env: {
                ...envWithPath,
                LIGHTDASH_MODE: 'development',
                HEADLESS: 'true',
                NODE_ENV: 'development',
                SENTRY_SPOTLIGHT: 'http://localhost:8969/stream',
            },
            watch: false,
            autorestart: true,
            kill_timeout: 5000,
            merge_logs: true,
            time: true,
        },

        // ─────────────────────────────────────────────────────────────────
        // Background Job Scheduler
        // ─────────────────────────────────────────────────────────────────
        {
            name: 'lightdash-scheduler',
            script: 'src/scheduler.ts',
            interpreter: 'node',
            node_args: '--import tsx',
            cwd: path.join(__dirname, 'packages/backend'),
            env: {
                ...envWithPath,
                NODE_ENV: 'development',
                SENTRY_SPOTLIGHT: 'http://localhost:8969/stream',
                // Override PORT to avoid conflict with API (which uses 8080)
                PORT: '8081',
            },
            watch: false,
            autorestart: true,
            kill_timeout: 5000,
            merge_logs: true,
            time: true,
        },

        // ─────────────────────────────────────────────────────────────────
        // Frontend Vite Dev Server
        // ─────────────────────────────────────────────────────────────────
        {
            name: 'lightdash-frontend',
            script: 'node_modules/.bin/vite',
            interpreter: 'none',
            cwd: path.join(__dirname, 'packages/frontend'),
            env: {
                NODE_ENV: 'development',
                VITE_SENTRY_SPOTLIGHT: 'http://localhost:8969/stream',
            },
            watch: false,
            autorestart: false,
            kill_timeout: 5000,
            merge_logs: true,
            time: true,
        },

        // ─────────────────────────────────────────────────────────────────
        // Common Package TypeScript Watcher
        // ─────────────────────────────────────────────────────────────────
        {
            name: 'lightdash-common-watch',
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

        // ─────────────────────────────────────────────────────────────────
        // Warehouses Package TypeScript Watcher
        // ─────────────────────────────────────────────────────────────────
        {
            name: 'lightdash-warehouses-watch',
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

        // ─────────────────────────────────────────────────────────────────
        // Spotlight.js Sidecar (Sentry Dev Debugging UI)
        // ─────────────────────────────────────────────────────────────────
        {
            name: 'lightdash-spotlight',
            script: 'node_modules/.bin/spotlight',
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
