#!/usr/bin/env npx tsx
/**
 * Data-app skill benchmark: run a fixed prompt suite against one or more
 * sandbox template variants, in parallel, and score each run with the
 * behavioral rubric in assertions.ts plus stream-timing metrics.
 *
 * Usage (from sandboxes/data-apps/):
 *   npx tsx benchmark/run.ts --variant candidate=lukas-dev-template:latest
 *   npx tsx benchmark/run.ts \
 *       --variant baseline=lightdash-data-app \
 *       --variant candidate=lukas-dev-template:latest \
 *       --reps 5 --prompts kpi-dashboard,pdf-report --concurrency 8
 *
 * Requires E2B_API_KEY and ANTHROPIC_API_KEY (shell or ./.env).
 * Results land in benchmark/runs/<timestamp>/ (raw JSONL, sources, summary).
 */
import { Sandbox } from 'e2b';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    sourceRules,
    transcriptRules,
    type PromptSpec,
    type RuleResults,
} from './assertions.ts';
import { writeGallery } from './gallery.ts';
import { renderRun } from './renderGate.ts';
import { analyzeStream, type StreamAnalysis } from './stream.ts';

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));

// Must stay identical to AppGenerateService.runClaudeGeneration — the
// benchmark measures the production configuration, not a lookalike.
const ALLOWED_TOOLS =
    'Read(//app/**),Read(//tmp/dbt-repo/**),Read(//tmp/images/**),Read(//tmp/metric-queries/**),Read(//tmp/external-data/**),Write(//app/src/**),Edit(//app/src/**),Glob(//app/**),Glob(//tmp/dbt-repo/**),Glob(//tmp/metric-queries/**),Glob(//tmp/external-data/**),Grep(//app/**),Grep(//tmp/dbt-repo/**),Grep(//tmp/external-data/**),Bash(pnpm check),Bash(pnpm check:*)';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadDotEnv() {
    const envPath = path.resolve(BENCH_DIR, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
        const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
}

const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type EffortLevel = (typeof EFFORT_LEVELS)[number];

type VariantSpec = {
    name: string;
    templateRef: string;
    // null = no --effort flag, i.e. the CLI default the production pipeline runs with.
    effort: EffortLevel | null;
    envs: Record<string, string>;
};

type Config = {
    variants: VariantSpec[];
    reps: number;
    promptIds: string[] | null;
    concurrency: number;
    model: string;
    outDir: string;
};

// The CLI warns-and-ignores unknown --effort values, which would silently run
// a whole variant at default effort — validate up front instead.
function parseVariant(value: string): VariantSpec {
    const eq = value.indexOf('=');
    if (eq === -1)
        throw new Error(
            '--variant expects name=templateRef[,effort=<level>][,env.KEY=VAL]',
        );
    const [templateRef, ...options] = value.slice(eq + 1).split(',');
    const variant: VariantSpec = {
        name: value.slice(0, eq),
        templateRef,
        effort: null,
        envs: {},
    };
    for (const option of options) {
        const optEq = option.indexOf('=');
        if (optEq === -1)
            throw new Error(`--variant option "${option}" expects key=value`);
        const key = option.slice(0, optEq);
        const optValue = option.slice(optEq + 1);
        if (key === 'effort') {
            if (!EFFORT_LEVELS.includes(optValue as EffortLevel))
                throw new Error(
                    `Invalid effort "${optValue}" (expected ${EFFORT_LEVELS.join('|')})`,
                );
            variant.effort = optValue as EffortLevel;
        } else if (key.startsWith('env.') && key.length > 4) {
            variant.envs[key.slice(4)] = optValue;
        } else {
            throw new Error(
                `Unknown --variant option "${key}" (expected effort or env.KEY)`,
            );
        }
    }
    return variant;
}

function describeVariant(variant: VariantSpec): string {
    const parts = [variant.templateRef];
    if (variant.effort) parts.push(`effort=${variant.effort}`);
    for (const [key, value] of Object.entries(variant.envs))
        parts.push(`${key}=${value}`);
    return parts.join(', ');
}

function parseArgs(argv: string[]): Config {
    const config: Config = {
        variants: [],
        reps: 3,
        promptIds: null,
        concurrency: 8,
        model: 'sonnet',
        outDir: path.join(
            BENCH_DIR,
            'runs',
            new Date().toISOString().replace(/[:.]/g, '-'),
        ),
    };
    for (let i = 0; i < argv.length; i += 2) {
        const [flag, value] = [argv[i], argv[i + 1]];
        if (value === undefined) throw new Error(`Missing value for ${flag}`);
        switch (flag) {
            case '--variant':
                config.variants.push(parseVariant(value));
                break;
            case '--reps':
                config.reps = Number(value);
                break;
            case '--prompts':
                config.promptIds = value.split(',');
                break;
            case '--concurrency':
                config.concurrency = Number(value);
                break;
            case '--model':
                config.model = value;
                break;
            case '--out':
                config.outDir = path.resolve(value);
                break;
            default:
                throw new Error(`Unknown flag: ${flag}`);
        }
    }
    if (config.variants.length === 0) {
        config.variants.push({
            name: 'default',
            templateRef:
                process.env.E2B_TEMPLATE_NAME || 'lightdash-data-app',
            effort: null,
            envs: {},
        });
    }
    return config;
}

// ---------------------------------------------------------------------------
// One benchmark cell
// ---------------------------------------------------------------------------

type RunResult = {
    variant: string;
    promptId: string;
    rep: number;
    error: string | null;
    claudeExitCode: number;
    durationMs: number;
    analysis: StreamAnalysis | null;
    rules: RuleResults;
};

async function runOne(
    config: Config,
    variant: VariantSpec,
    spec: PromptSpec,
    rep: number,
): Promise<RunResult> {
    const cell = `${variant.name}__${spec.id}__r${rep}`;
    const result: RunResult = {
        variant: variant.name,
        promptId: spec.id,
        rep,
        error: null,
        claudeExitCode: -1,
        durationMs: 0,
        analysis: null,
        rules: {},
    };

    let sandbox: Sandbox | null = null;
    try {
        sandbox = await Sandbox.create(variant.templateRef, {
            timeoutMs: 30 * 60 * 1000,
            envs: {
                ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
                ...variant.envs,
            },
        });

        // Fixture catalog + prompt (+ per-prompt extra files).
        const schemaYml = fs.readFileSync(
            path.join(BENCH_DIR, 'fixtures', 'schema.yml'),
            'utf-8',
        );
        await sandbox.commands.run('mkdir -p /tmp/dbt-repo/models', {
            timeoutMs: 10_000,
        });
        await sandbox.files.write('/tmp/dbt-repo/models/schema.yml', schemaYml);
        for (const [sandboxPath, localRel] of Object.entries(
            spec.sandboxFiles ?? {},
        )) {
            // eslint-disable-next-line no-await-in-loop
            await sandbox.commands.run(
                `mkdir -p ${path.posix.dirname(sandboxPath)}`,
                { timeoutMs: 10_000 },
            );
            // eslint-disable-next-line no-await-in-loop
            await sandbox.files.write(
                sandboxPath,
                fs.readFileSync(path.join(BENCH_DIR, localRel), 'utf-8'),
            );
        }
        await sandbox.files.write(
            '/tmp/prompt.txt',
            `${spec.prepend ?? ''}${spec.prompt}\n`,
        );

        // Generation — flags mirror the production pipeline.
        const events: { atMs: number; line: string }[] = [];
        let lineBuffer = '';
        const onStdout = (chunk: string) => {
            const atMs = Date.now();
            lineBuffer += chunk;
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() ?? '';
            for (const line of lines) {
                if (line.trim()) events.push({ atMs, line });
            }
        };

        const startedAt = Date.now();
        let exitCode = 0;
        try {
            const generate = await sandbox.commands.run(
                `cat /tmp/prompt.txt | claude -p ` +
                    `--model ${config.model} ` +
                    (variant.effort ? `--effort ${variant.effort} ` : '') +
                    `--verbose --output-format stream-json --include-partial-messages ` +
                    `--allowedTools "${ALLOWED_TOOLS}" ` +
                    `--append-system-prompt-file /app/skill.md`,
                { cwd: '/app', timeoutMs: 20 * 60 * 1000, onStdout },
            );
            exitCode = generate.exitCode;
        } catch (err) {
            exitCode =
                typeof (err as { exitCode?: number }).exitCode === 'number'
                    ? (err as { exitCode: number }).exitCode
                    : 1;
        }
        result.claudeExitCode = exitCode;
        result.durationMs = Date.now() - startedAt;

        const rawDir = path.join(config.outDir, 'raw');
        fs.mkdirSync(rawDir, { recursive: true });
        fs.writeFileSync(
            path.join(rawDir, `${cell}.jsonl`),
            events.map((e) => JSON.stringify(e)).join('\n'),
        );

        result.analysis = analyzeStream(events);
        result.rules = transcriptRules(result.analysis, spec);

        // Independent build gate — the model's own `pnpm check` doesn't count.
        let buildPasses = false;
        try {
            const build = await sandbox.commands.run('pnpm build', {
                cwd: '/app',
                timeoutMs: 120_000,
            });
            buildPasses = build.exitCode === 0;
        } catch {
            buildPasses = false;
        }
        result.rules['build-passes'] = buildPasses;

        // Download the built assets for the local render gate.
        if (buildPasses) {
            await sandbox.commands.run('tar -cf /tmp/dist.tar -C /app/dist .', {
                timeoutMs: 30_000,
            });
            const distBytes = await sandbox.files.read('/tmp/dist.tar', {
                format: 'bytes',
            });
            const distDir = path.join(config.outDir, 'dist', cell);
            fs.mkdirSync(distDir, { recursive: true });
            fs.writeFileSync(
                path.join(distDir, 'dist.tar'),
                Buffer.from(distBytes),
            );
            execSync('tar -xf dist.tar && rm dist.tar', { cwd: distDir });
        }

        // Download the generated source for the mechanical gates.
        await sandbox.commands.run('tar -cf /tmp/src.tar -C /app src', {
            timeoutMs: 30_000,
        });
        const tarBytes = await sandbox.files.read('/tmp/src.tar', {
            format: 'bytes',
        });
        const srcDir = path.join(config.outDir, 'src', cell);
        fs.mkdirSync(srcDir, { recursive: true });
        const tarPath = path.join(srcDir, 'src.tar');
        fs.writeFileSync(tarPath, Buffer.from(tarBytes));
        execSync('tar -xf src.tar && rm src.tar', { cwd: srcDir });

        const files: Record<string, string> = {};
        for (const entry of fs.readdirSync(srcDir, {
            recursive: true,
            withFileTypes: true,
        })) {
            if (!entry.isFile()) continue;
            const full = path.join(entry.parentPath, entry.name);
            files[path.relative(srcDir, full)] = fs.readFileSync(full, 'utf-8');
        }
        Object.assign(result.rules, sourceRules(files));
    } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
    } finally {
        await sandbox?.kill().catch(() => {});
    }
    return result;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const median = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(0)}s`;

function summarize(results: RunResult[], config: Config): string {
    const lines: string[] = [];
    const ok = results.filter((r) => r.error === null && r.analysis !== null);
    const failed = results.filter((r) => r.error !== null);

    for (const variant of config.variants) {
        lines.push(`\n=== ${variant.name} (${describeVariant(variant)}) ===`);
        const rows = ok.filter((r) => r.variant === variant.name);

        lines.push(
            'prompt'.padEnd(18) +
                'n'.padEnd(4) +
                'total'.padEnd(8) +
                'think'.padEnd(8) +
                'toolIn'.padEnd(8) +
                'toolEx'.padEnd(8) +
                'outTok'.padEnd(8) +
                'turns',
        );
        const promptIds = [...new Set(rows.map((r) => r.promptId))];
        for (const promptId of promptIds) {
            const cell = rows.filter((r) => r.promptId === promptId);
            const m = (f: (r: RunResult) => number) => median(cell.map(f));
            lines.push(
                promptId.padEnd(18) +
                    String(cell.length).padEnd(4) +
                    seconds(m((r) => r.durationMs)).padEnd(8) +
                    seconds(m((r) => r.analysis!.timings.thinkingMs)).padEnd(
                        8,
                    ) +
                    seconds(m((r) => r.analysis!.timings.toolInputMs)).padEnd(
                        8,
                    ) +
                    seconds(m((r) => r.analysis!.timings.toolExecMs)).padEnd(
                        8,
                    ) +
                    String(m((r) => r.analysis!.usage?.outputTokens ?? 0)).padEnd(
                        8,
                    ) +
                    String(m((r) => r.analysis!.turns)),
            );
        }

        lines.push('\nrule pass rates:');
        const ruleNames = [
            ...new Set(rows.flatMap((r) => Object.keys(r.rules))),
        ].sort();
        for (const rule of ruleNames) {
            const applicable = rows.filter((r) => rule in r.rules);
            const passed = applicable.filter((r) => r.rules[rule]).length;
            const rate = `${passed}/${applicable.length}`;
            const marker = passed === applicable.length ? '  ' : '✗ ';
            lines.push(`  ${marker}${rule.padEnd(34)} ${rate}`);
            for (const r of applicable.filter((x) => !x.rules[rule])) {
                lines.push(`      failed: ${r.promptId} r${r.rep}`);
            }
        }
    }

    // Paired comparison against the first variant.
    if (config.variants.length > 1) {
        const baseline = config.variants[0].name;
        for (const variant of config.variants.slice(1)) {
            lines.push(`\n=== ${variant.name} vs ${baseline} (median deltas) ===`);
            const promptIds = [...new Set(ok.map((r) => r.promptId))];
            for (const promptId of promptIds) {
                const pick = (v: string, f: (r: RunResult) => number) =>
                    median(
                        ok
                            .filter(
                                (r) =>
                                    r.variant === v && r.promptId === promptId,
                            )
                            .map(f),
                    );
                const delta = (f: (r: RunResult) => number) => {
                    const base = pick(baseline, f);
                    const cand = pick(variant.name, f);
                    if (base === 0) return 'n/a';
                    const pct = ((cand - base) / base) * 100;
                    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
                };
                lines.push(
                    promptId.padEnd(18) +
                        `total ${delta((r) => r.durationMs)}`.padEnd(14) +
                        `think ${delta(
                            (r) => r.analysis!.timings.thinkingMs,
                        )}`.padEnd(14) +
                        `toolIn ${delta(
                            (r) => r.analysis!.timings.toolInputMs,
                        )}`.padEnd(15) +
                        `outTok ${delta(
                            (r) => r.analysis!.usage?.outputTokens ?? 0,
                        )}`,
                );
            }
        }
    }

    if (failed.length > 0) {
        lines.push(`\n${failed.length} run(s) errored:`);
        for (const r of failed) {
            lines.push(`  ${r.variant}/${r.promptId} r${r.rep}: ${r.error}`);
        }
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    loadDotEnv();
    for (const key of ['E2B_API_KEY', 'ANTHROPIC_API_KEY']) {
        if (!process.env[key]) {
            console.error(`Error: ${key} is required (set in .env or shell)`);
            process.exit(1);
        }
    }

    const config = parseArgs(process.argv.slice(2));
    const suite = JSON.parse(
        fs.readFileSync(path.join(BENCH_DIR, 'prompts.json'), 'utf-8'),
    ).prompts as PromptSpec[];
    const prompts = config.promptIds
        ? suite.filter((p) => config.promptIds!.includes(p.id))
        : suite;
    if (prompts.length === 0) {
        console.error('No prompts matched --prompts');
        process.exit(1);
    }

    const cells: (() => Promise<RunResult>)[] = [];
    for (const variant of config.variants) {
        for (const spec of prompts) {
            for (let rep = 1; rep <= config.reps; rep += 1) {
                cells.push(() => runOne(config, variant, spec, rep));
            }
        }
    }

    console.log(
        `Running ${cells.length} generations (${config.variants.length} variant(s) × ${prompts.length} prompt(s) × ${config.reps} rep(s), concurrency ${config.concurrency})`,
    );
    console.log(`Output: ${config.outDir}\n`);
    fs.mkdirSync(config.outDir, { recursive: true });
    fs.writeFileSync(
        path.join(config.outDir, 'config.json'),
        JSON.stringify(config, null, 2),
    );

    // Simple concurrency pool.
    const results: RunResult[] = [];
    let next = 0;
    let done = 0;
    const workers = Array.from(
        { length: Math.min(config.concurrency, cells.length) },
        async () => {
            while (next < cells.length) {
                const index = next;
                next += 1;
                const result = await cells[index]();
                results.push(result);
                done += 1;
                const status = result.error
                    ? `ERROR ${result.error.slice(0, 80)}`
                    : `${seconds(result.durationMs)}, ${
                          Object.values(result.rules).filter(Boolean).length
                      }/${Object.keys(result.rules).length} rules`;
                console.log(
                    `[${done}/${cells.length}] ${result.variant}/${result.promptId} r${result.rep}: ${status}`,
                );
            }
        },
    );
    await Promise.all(workers);

    // Render gate: run every built app under the local mock host and fold
    // the runtime rules (renders-clean, query validity) into the rubric.
    console.log('\nRendering built apps through the mock host…');
    try {
        const rendered = await renderRun(config.outDir, {
            concurrency: Math.min(4, config.concurrency),
        });
        for (const result of results) {
            const render =
                rendered[
                    `${result.variant}__${result.promptId}__r${result.rep}`
                ];
            if (render) Object.assign(result.rules, render.rules);
        }
    } catch (err) {
        console.error(
            `Render gate failed (rules skipped): ${
                err instanceof Error ? err.message : String(err)
            }`,
        );
    }

    fs.writeFileSync(
        path.join(config.outDir, 'results.json'),
        JSON.stringify(results, null, 2),
    );
    const summary = summarize(results, config);
    fs.writeFileSync(path.join(config.outDir, 'summary.txt'), summary);
    console.log(summary);
    console.log(`\nGallery: ${writeGallery(config.outDir)}`);
}

await main();
