// PM2 ecosystem template for agent instances.
// launch.sh generates a concrete version per agent by substituting AGENT_ID, ports, etc.
//
// Placeholder tokens (replaced by launch.sh via sed):
//   __AGENT_ID__       — numeric agent ID (1-5)
//   __REPO_ROOT__      — absolute path to repo root (or worktree)
//   __ENV_FILE__       — path to .env.agent.<id> file
//   __API_PORT__       — backend API port
//   __FE_PORT__        — frontend Vite port
//   __DEBUG_PORT__     — Node.js inspector port

const path = require('path');
const dotenv = require('dotenv');

const envFile = '__ENV_FILE__';
const repoRoot = '__REPO_ROOT__';
const agentId = '__AGENT_ID__';
const apiPort = '__API_PORT__';
const fePort = '__FE_PORT__';
const debugPort = '__DEBUG_PORT__';

const env = dotenv.config({ path: envFile }).parsed || {};

const venvBinPath = path.join(repoRoot, 'venv', 'bin');
const envWithPath = { ...env, PATH: `${venvBinPath}:${process.env.PATH}` };

module.exports = {
    apps: [
        {
            name: `agent-${agentId}-api`,
            script: 'src/index.ts',
            interpreter: 'node',
            node_args: `--import tsx --inspect=0.0.0.0:${debugPort}`,
            cwd: path.join(repoRoot, 'packages/backend'),
            env: {
                ...envWithPath,
                LIGHTDASH_MODE: 'development',
                HEADLESS: 'true',
                NODE_ENV: 'development',
            },
            watch: false,
            autorestart: true,
            kill_timeout: 5000,
            merge_logs: true,
            time: true,
        },
        {
            name: `agent-${agentId}-frontend`,
            script: '../../node_modules/.bin/vite',
            args: `--port ${fePort} --strictPort`,
            interpreter: 'none',
            cwd: path.join(repoRoot, 'packages/frontend'),
            env: { NODE_ENV: 'development' },
            watch: false,
            autorestart: false,
        },
        {
            name: `agent-${agentId}-common-watch`,
            script: '../../node_modules/.bin/tsc',
            args: '--build --watch --preserveWatchOutput --incremental tsconfig.build.json',
            interpreter: 'none',
            cwd: path.join(repoRoot, 'packages/common'),
        },
        {
            name: `agent-${agentId}-warehouses-watch`,
            script: '../../node_modules/.bin/tsc',
            args: '--build --watch --preserveWatchOutput tsconfig.json',
            interpreter: 'none',
            cwd: path.join(repoRoot, 'packages/warehouses'),
        },
    ],
};
