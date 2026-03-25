#!/usr/bin/env npx tsx
/**
 * Spins up an e2b sandbox, runs Claude to generate a data app from a prompt,
 * builds the Vite project, and downloads the dist/ output locally.
 *
 * Prerequisites:
 *   npm install       # in this directory
 *   Add E2B_API_KEY and ANTHROPIC_API_KEY to .env
 *
 * Usage:
 *   npx tsx test-generate.ts "Build a revenue dashboard by customer segment"
 */
import { Sandbox } from 'e2b';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Load .env (all keys live in one file)
// ---------------------------------------------------------------------------
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

// Merge .env into process.env (don't override shell exports)
for (const [k, v] of Object.entries(dotenv)) {
    if (!process.env[k]) process.env[k] = v;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const prompt = process.argv[2];
if (!prompt) {
    console.error(
        'Usage: npx tsx test-generate.ts "Build me a revenue dashboard" [/path/to/dbt/models]',
    );
    process.exit(1);
}

const dbtModelsPath = process.argv[3] || path.resolve(os.homedir(), 'code/lightdash-analytics/dbt/models');

if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is required (set in .env or shell)');
    process.exit(1);
}
if (!process.env.E2B_API_KEY) {
    console.error('Error: E2B_API_KEY is required (set in .env or shell)');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Create sandbox
// ---------------------------------------------------------------------------
console.log('Creating sandbox from lightdash-data-app template...');

const sandbox = await Sandbox.create('lightdash-data-app', {
    timeoutMs: 10 * 60 * 1000, // 10 min TTL
    envs: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
        ...dotenv,
    },
});

console.log(`Sandbox created: ${sandbox.sandboxId}\n`);

// ---------------------------------------------------------------------------
// Pretty-print Claude stream-json events
// ---------------------------------------------------------------------------
let stdoutBuffer = '';
const streamStartTime = Date.now();
let lastEventTime = streamStartTime;

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

/** Format elapsed time as mm:ss */
function elapsed(): string {
    const ms = Date.now() - streamStartTime;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Format delta since last event */
function delta(): string {
    const now = Date.now();
    const d = now - lastEventTime;
    lastEventTime = now;
    if (d < 1000) return `+${d}ms`;
    return `+${(d / 1000).toFixed(1)}s`;
}

function timestamp(): string {
    return `${DIM}[${elapsed()} ${delta().padStart(7)}]${RESET}`;
}



function processStreamLines(chunk: string) {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    // Keep the last (possibly incomplete) line in the buffer
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const event = JSON.parse(line);
            formatStreamEvent(event);
        } catch {
            // Incomplete JSON or non-JSON line — skip silently
        }
    }
}

/** Truncate a string with an ellipsis */
function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + '…' : s;
}

/** Format a tool_use block concisely */
function formatToolUse(name: string, input: Record<string, unknown>) {
    switch (name) {
        case 'Read': {
            const fp = String(input.file_path ?? '');
            console.log(`${timestamp()} ${DIM}📖 Read ${fp}${RESET}`);
            break;
        }
        case 'Write': {
            const fp = String(input.file_path ?? '');
            const content = String(input.content ?? '');
            const lines = content.split('\n').length;
            console.log(`${timestamp()} ${GREEN}📝 Write ${fp} (${lines} lines)${RESET}`);
            break;
        }
        case 'Edit': {
            const fp = String(input.file_path ?? '');
            const oldStr = String(input.old_string ?? '');
            const newStr = String(input.new_string ?? '');
            const removed = oldStr.split('\n').length;
            const added = newStr.split('\n').length;
            console.log(`${timestamp()} ${GREEN}✏️  Edit ${fp} (-${removed}/+${added} lines)${RESET}`);
            break;
        }
        case 'Glob': {
            const pattern = String(input.pattern ?? '');
            const p = input.path ? ` in ${input.path}` : '';
            console.log(`${timestamp()} ${DIM}🔍 Glob ${pattern}${p}${RESET}`);
            break;
        }
        case 'Grep': {
            const pattern = String(input.pattern ?? '');
            const p = input.path ? ` in ${input.path}` : '';
            console.log(`${timestamp()} ${DIM}🔍 Grep "${pattern}"${p}${RESET}`);
            break;
        }
        case 'Bash': {
            const cmd = truncate(String(input.command ?? ''), 120);
            console.log(`${timestamp()} ${YELLOW}$ ${cmd}${RESET}`);
            break;
        }
        case 'ToolSearch':
            console.log(`${timestamp()} ${DIM}🔎 ToolSearch: ${input.query}${RESET}`);
            break;
        default: {
            // Generic fallback: show name + compact input keys
            const keys = Object.keys(input);
            console.log(`${timestamp()} ${DIM}🔧 ${name}(${keys.join(', ')})${RESET}`);
            break;
        }
    }
}

/** Format a tool_result block concisely */
function formatToolResult(content: unknown) {
    if (typeof content === 'string') {
        // File contents, glob results, etc — just show line count or truncated preview
        const lines = content.split('\n');
        if (lines.length > 3) {
            console.log(`${timestamp()} ${DIM}  ↳ ${lines.length} lines${RESET}`);
        } else {
            console.log(`${timestamp()} ${DIM}  ↳ ${truncate(content.replace(/\n/g, ' '), 120)}${RESET}`);
        }
    } else if (Array.isArray(content)) {
        // e.g. tool references
        const summary = content.map((c: Record<string, unknown>) =>
            c.tool_name ?? c.type ?? '?'
        ).join(', ');
        console.log(`${timestamp()} ${DIM}  ↳ [${truncate(summary, 120)}]${RESET}`);
    }
}

function formatStreamEvent(event: Record<string, unknown>) {
    const type = event.type as string;

    switch (type) {
        case 'system': {
            if (event.subtype === 'init') {
                const model = event.model ?? 'unknown';
                console.log(`${timestamp()} ${CYAN}⚡ Claude session started (${model})${RESET}`);
            }
            break;
        }
        case 'assistant': {
            const msg = event.message as Record<string, unknown> | undefined;
            const content = (msg?.content ?? []) as Array<Record<string, unknown>>;
            for (const block of content) {
                const blockType = block.type as string;
                if (blockType === 'text') {
                    console.log(`\n${timestamp()} ${String(block.text ?? '')}`);
                } else if (blockType === 'thinking') {
                    // Show brief thinking indicator, not full content
                    const thinking = String(block.thinking ?? '');
                    if (thinking) {
                        console.log(`${timestamp()} ${DIM}💭 ${truncate(thinking, 100)}${RESET}`);
                    }
                } else if (blockType === 'tool_use') {
                    formatToolUse(
                        String(block.name ?? ''),
                        (block.input ?? {}) as Record<string, unknown>,
                    );
                }
            }
            break;
        }
        case 'user': {
            const msg = event.message as Record<string, unknown> | undefined;
            const content = (msg?.content ?? []) as Array<Record<string, unknown>>;
            for (const block of content) {
                if (block.type === 'tool_result') {
                    formatToolResult(block.content);
                }
            }
            break;
        }
        default:
            break;
    }
}

try {
    // Write .env into the sandbox so vite's loadEnv can pick it up too
    const envFileContent = Object.entries(dotenv)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
    await sandbox.files.write('/app/.env', envFileContent);

    // ------------------------------------------------------------------
    // Upload dbt semantic layer so Claude can discover fields
    // ------------------------------------------------------------------
    console.log('--- Uploading dbt semantic layer ---\n');
    const modelsTar = execSync(`tar -cf - -C "${path.dirname(dbtModelsPath)}" "${path.basename(dbtModelsPath)}"`, { maxBuffer: 10 * 1024 * 1024 });
    await sandbox.files.write('/tmp/models.tar', modelsTar);
    await sandbox.commands.run(`mkdir -p /tmp/dbt-repo && tar -xf /tmp/models.tar -C /tmp/dbt-repo`, { timeoutMs: 10_000 });
    console.log('dbt models uploaded to /tmp/dbt-repo/\n');

    // ------------------------------------------------------------------
    // 1. Generate the app with Claude
    // ------------------------------------------------------------------
    console.log('--- Generating app with Claude ---\n');

    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    const generateResult = await sandbox.commands.run(
        `echo '${escapedPrompt}' | claude -p ` +
            `--model sonnet ` +
            `--verbose --output-format stream-json ` +
            `--append-system-prompt-file /app/skill.md ` +
            `--allowedTools "Read,Write,Edit,Glob,Grep"`,
        {
            cwd: '/app',
            timeoutMs: 8 * 60 * 1000,
            onStdout: (data) => {
                fs.appendFileSync('raw-stream.jsonl', String(data));
                processStreamLines(String(data));
            },
            onStderr: (data) => process.stderr.write(String(data)),
        },
    );

    if (generateResult.exitCode !== 0) {
        console.error(
            '\nGeneration failed with exit code:',
            generateResult.exitCode,
        );
        console.error(generateResult.stderr);
        process.exit(1);
    }

    // ------------------------------------------------------------------
    // 2. Build the Vite project
    // ------------------------------------------------------------------
    console.log('\n\n--- Building app ---\n');

    const buildResult = await sandbox.commands.run('pnpm build', {
        cwd: '/app',
        timeoutMs: 60 * 1000,
        onStdout: (data) => process.stdout.write(String(data)),
        onStderr: (data) => process.stderr.write(String(data)),
    });

    if (buildResult.exitCode !== 0) {
        console.error(
            '\nBuild failed with exit code:',
            buildResult.exitCode,
        );
        console.error(buildResult.stderr);
        process.exit(1);
    }

    // ------------------------------------------------------------------
    // 3. Download the dist/ output
    // ------------------------------------------------------------------
    console.log('\n\n--- Downloading dist ---\n');

    // Tar inside the sandbox for a single download
    await sandbox.commands.run('tar -cf /tmp/dist.tar -C /app dist', {
        timeoutMs: 10_000,
    });

    const tarBytes = await sandbox.files.read('/tmp/dist.tar', {
        format: 'bytes',
    });

    const outputDir = path.resolve('dist-output');
    fs.mkdirSync(outputDir, { recursive: true });

    const tarPath = path.join(outputDir, 'dist.tar');
    fs.writeFileSync(tarPath, Buffer.from(tarBytes as ArrayBuffer));
    execSync('tar -xf dist.tar', { cwd: outputDir });
    fs.unlinkSync(tarPath);

    console.log(`Done! Output written to: ${outputDir}/dist/`);
} finally {
    await sandbox.kill();
    console.log('Sandbox terminated.');
}
