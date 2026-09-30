#!/usr/bin/env node
/**
 * Proves a change to the chart engine leaves the web app's charts as they
 * were: builds every case through the frontend's own chart hooks on a base
 * ref and on this checkout, and compares everything they produce (the
 * ECharts option, the output of every formatter, the config model of tables,
 * big numbers and custom charts, and the state after editor actions).
 *
 *   node packages/visualization/scripts/regression/run.mjs [--base origin/main] [--base-dir DIR] [--modes light,dark,dash,shared]
 *
 * The base is checked out as a detached worktree (default: a sibling of this
 * repository), installed and built once; later runs reuse it. Exits 1 when
 * anything differs, and writes each difference to `regression-diff.json`
 * in the base directory.
 */
import { spawn } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const args = Object.fromEntries(
    process.argv
        .slice(2)
        .flatMap((arg, i, all) =>
            arg.startsWith('--') ? [[arg.slice(2), all[i + 1]]] : [],
        ),
);
const baseRef = args.base ?? 'origin/main';
const baseDir = resolve(
    args['base-dir'] ?? join(repo, '..', `${basename(repo)}-regression-base`),
);
const modes = (args.modes ?? 'light,dark,dash,shared').split(',');

const MODE_ENV = {
    light: { REPLAY_SCHEME: 'light' },
    dark: { REPLAY_SCHEME: 'dark' },
    dash: { REPLAY_SCHEME: 'dark', REPLAY_DASH: '1' },
    shared: { REPLAY_SCHEME: 'light', REPLAY_FLAG: '1', REPLAY_SHARED: '1' },
};

const TEST_DIR = 'packages/frontend/src/components/LightdashVisualization';

const run = (cmd, cmdArgs, { cwd, env = {}, quiet = false } = {}) =>
    new Promise((ok, fail) => {
        const child = spawn(cmd, cmdArgs, {
            cwd,
            env: { ...process.env, ...env },
            stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        });
        let output = '';
        child.stdout?.on('data', (chunk) => (output += chunk));
        child.stderr?.on('data', (chunk) => (output += chunk));
        child.on('close', (code) =>
            code === 0
                ? ok(output)
                : fail(
                      new Error(
                          `${cmd} ${cmdArgs.join(' ')} exited ${code}\n${output.slice(-3000)}`,
                      ),
                  ),
        );
    });

const withFiles = async (root, files, body) => {
    const copied = files.map((file) => join(root, TEST_DIR, file));
    files.forEach((file, i) => copyFileSync(join(here, file), copied[i]));
    try {
        return await body();
    } finally {
        copied.forEach((file) => rmSync(file, { force: true }));
    }
};

const vitest = (root, file, env) =>
    run(
        './node_modules/.bin/vitest',
        ['run', `src/components/LightdashVisualization/${file}`],
        {
            cwd: join(root, 'packages/frontend'),
            env,
            quiet: true,
        },
    );

/** Every difference between two snapshots, by path; at most `limit`. */
const differences = (a, b, path = '', out = [], limit = 8) => {
    if (out.length >= limit || JSON.stringify(a) === JSON.stringify(b))
        return out;
    const bothObjects =
        a && b && typeof a === 'object' && typeof b === 'object';
    if (
        bothObjects &&
        Array.isArray(a) === Array.isArray(b) &&
        (!Array.isArray(a) || a.length === b.length)
    ) {
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
            differences(a[key], b[key], `${path}.${key}`, out, limit);
        return out;
    }
    out.push(
        `${path}: base=${JSON.stringify(a)?.slice(0, 160)} head=${JSON.stringify(b)?.slice(0, 160)}`,
    );
    return out;
};

const prepareBase = async () => {
    if (existsSync(baseDir)) {
        await run('git', ['checkout', '--quiet', '--detach', baseRef], {
            cwd: baseDir,
        });
    } else {
        await run('git', ['worktree', 'add', '--detach', baseDir, baseRef], {
            cwd: repo,
        });
    }
    await run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
        cwd: baseDir,
    });
    await run('pnpm', ['formula:build'], { cwd: baseDir });
    await run('pnpm', ['common-build'], { cwd: baseDir });
};

const main = async () => {
    console.log(`Base: ${baseRef} in ${baseDir}`);
    await prepareBase();
    // The frontend's tests read the package's build, not its source.
    await run('pnpm', ['-F', 'visualization', 'build'], { cwd: repo });

    mkdirSync(baseDir, { recursive: true });
    const casesFile = join(baseDir, 'regression-cases.json');
    await withFiles(repo, ['fixtures.ts', 'generate.regression.test.ts'], () =>
        vitest(repo, 'generate.regression.test.ts', {
            REPLAY_CASES: casesFile,
        }),
    );
    const { cases } = JSON.parse(readFileSync(casesFile, 'utf8'));
    console.log(`${cases.length} cases`);

    const report = {};
    let total = 0;
    await withFiles(repo, ['replay.regression.test.tsx'], () =>
        withFiles(baseDir, ['replay.regression.test.tsx'], async () => {
            for (const mode of modes) {
                const outputs = ['base', 'head'].map((side) =>
                    join(baseDir, `regression-${mode}-${side}.json`),
                );
                await Promise.all(
                    [baseDir, repo].map((root, i) =>
                        vitest(root, 'replay.regression.test.tsx', {
                            ...MODE_ENV[mode],
                            REPLAY_CASES: casesFile,
                            REPLAY_OUT: outputs[i],
                        }),
                    ),
                );
                const [base, head] = outputs.map((file) =>
                    JSON.parse(readFileSync(file, 'utf8')),
                );
                const differing = [];
                let steps = 0;
                base.forEach((b, i) => {
                    const h = head[i];
                    if (b.error || h.error)
                        differing.push({
                            name: b.name,
                            differences: [
                                `error: base=${b.error} head=${h.error}`,
                            ],
                        });
                    b.steps.forEach((step, j) => {
                        steps += 1;
                        const found = differences(step, h.steps[j]);
                        if (found.length)
                            differing.push({
                                name: b.name,
                                step: step.step,
                                differences: found,
                            });
                    });
                });
                total += differing.length;
                report[mode] = differing;
                console.log(
                    `${mode}: ${steps} snapshots, ${differing.length} different`,
                );
            }
        }),
    );
    writeFileSync(
        join(baseDir, 'regression-diff.json'),
        JSON.stringify(report, null, 1),
    );
    if (total > 0) {
        console.error(
            `Different from ${baseRef}: see ${join(baseDir, 'regression-diff.json')}`,
        );
        process.exit(1);
    }
    console.log(`Same as ${baseRef} in every mode.`);
};

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
