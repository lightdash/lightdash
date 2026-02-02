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

module.exports = {
    apps: [
        // ─────────────────────────────────────────────────────────────────
        // Backend API Server
        // ─────────────────────────────────────────────────────────────────
        {
            name: 'lightdash-api',
            script: '../../node_modules/.bin/tsx',
            args: 'watch --clear-screen=false --inspect=0.0.0.0:9229 src/index.ts',
            interpreter: 'none',
            cwd: path.join(__dirname, 'packages/backend'),
            env: {
                ...env,
                LIGHTDASH_MODE: 'development',
                HEADLESS: 'true',
                NODE_ENV: 'development',
            },
            // tsx watch handles file watching and restarts
            watch: false,
            autorestart: false,
            // Graceful shutdown
            kill_timeout: 5000,
            // Use PM2 default log location for better monit compatibility
            merge_logs: true,
            time: true,
        },

        // ─────────────────────────────────────────────────────────────────
        // Background Job Scheduler
        // ─────────────────────────────────────────────────────────────────
        {
            name: 'lightdash-scheduler',
            script: '../../node_modules/.bin/tsx',
            args: 'watch --clear-screen=false src/scheduler.ts',
            interpreter: 'none',
            cwd: path.join(__dirname, 'packages/backend'),
            env: {
                ...env,
                NODE_ENV: 'development',
            },
            watch: false,
            autorestart: false,
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

    ],
};
