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
        'Usage: npx tsx test-generate.ts "Build me a revenue dashboard"',
    );
    process.exit(1);
}

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

try {
    // Write .env into the sandbox so vite's loadEnv can pick it up too
    const envFileContent = Object.entries(dotenv)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
    await sandbox.files.write('/app/.env', envFileContent);

    // ------------------------------------------------------------------
    // 1. Generate the app with Claude
    // ------------------------------------------------------------------
    console.log('--- Generating app with Claude ---\n');

    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    const generateResult = await sandbox.commands.run(
        `claude -p '${escapedPrompt}' ` +
            `--append-system-prompt-file /app/skill.md ` +
            `--allowedTools "Read,Write,Edit,Glob,Grep"`,
        {
            cwd: '/app',
            timeoutMs: 5 * 60 * 1000,
            onStdout: (data) => process.stdout.write(String(data)),
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
