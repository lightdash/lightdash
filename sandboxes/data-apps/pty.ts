#!/usr/bin/env npx tsx
/**
 * Spins up an e2b sandbox and attaches your terminal to an interactive shell
 * inside it. Run whatever you want from the shell (e.g. `claude`).
 *
 * Usage:
 *   npx tsx pty.ts                 # interactive shell in /app
 *   npx tsx pty.ts claude          # optionally auto-run a command
 *
 * Exit with Ctrl-D or Ctrl-C.
 */
import { Sandbox } from 'e2b';
import fs from 'node:fs';

function loadEnvFile(filePath: string): Record<string, string> {
    const envs: Record<string, string> = {};
    if (!fs.existsSync(filePath)) return envs;
    for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
        const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
        if (match) envs[match[1]] = match[2];
    }
    return envs;
}

const dotenv = loadEnvFile('.env');
for (const [k, v] of Object.entries(dotenv)) {
    if (!process.env[k]) process.env[k] = v;
}

if (!process.env.E2B_API_KEY) {
    console.error('Error: E2B_API_KEY is required (set in .env or shell)');
    process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
        'Error: ANTHROPIC_API_KEY is required (set in .env or shell)',
    );
    process.exit(1);
}

const templateName = process.env.E2B_TEMPLATE_NAME || 'lightdash-data-app';
const templateTag = process.env.E2B_TEMPLATE_TAG;
const templateRef = templateTag
    ? `${templateName}:${templateTag}`
    : templateName;

// Optional command to auto-run in the shell. Omit to just get the shell.
const userCmd = process.argv.slice(2);
const command = userCmd.length > 0 ? userCmd.join(' ') : null;

console.error(`Creating sandbox from ${templateRef}...`);
const sandbox = await Sandbox.create(templateRef, {
    timeoutMs: 60 * 60 * 1000, // 1h
    apiKey: process.env.E2B_API_KEY,
    envs: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        ...dotenv,
    },
});
console.error(`Sandbox ready: ${sandbox.sandboxId}\n`);

const cols = process.stdout.columns || 120;
const rows = process.stdout.rows || 40;

const ptyHandle = await sandbox.pty.create({
    cols,
    rows,
    cwd: '/app',
    envs: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        TERM: process.env.TERM || 'xterm-256color',
    },
    timeoutMs: 60 * 60 * 1000,
    onData: (data) => {
        process.stdout.write(data);
    },
});

if (command) {
    await sandbox.pty.sendInput(
        ptyHandle.pid,
        new TextEncoder().encode(`${command}\n`),
    );
}

// Put stdin in raw mode so every keystroke (including Ctrl chars, arrow keys,
// escape sequences) is forwarded to the remote PTY untouched.
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}
process.stdin.resume();

const onStdin = (chunk: Buffer) => {
    sandbox.pty.sendInput(ptyHandle.pid, new Uint8Array(chunk)).catch((err) => {
        console.error('\nsendInput failed:', err);
    });
};
process.stdin.on('data', onStdin);

const onResize = () => {
    const newCols = process.stdout.columns || cols;
    const newRows = process.stdout.rows || rows;
    sandbox.pty
        .resize(ptyHandle.pid, { cols: newCols, rows: newRows })
        .catch(() => {
            /* ignore — pty may already be gone */
        });
};
process.stdout.on('resize', onResize);

let shuttingDown = false;
async function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdin.removeListener('data', onStdin);
    process.stdout.removeListener('resize', onResize);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    try {
        await sandbox.kill();
    } catch {
        /* ignore */
    }
    console.error('\nSandbox terminated.');
    process.exit(code);
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

try {
    await ptyHandle.wait();
    await shutdown(0);
} catch (err) {
    console.error('\nPTY error:', err);
    await shutdown(1);
}
