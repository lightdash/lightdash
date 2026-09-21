import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
    BASELINE_APP_REF,
    getCompatibilityCases,
    MIGRATION_REF,
    type CompatibilityCase,
} from './cases';

type JsonObject = Record<string, unknown>;

const root = path.resolve(import.meta.dirname, '../..');
const runtimeSource = path.join(import.meta.dirname, 'runtime');
const runtimeDestination = 'packages/backend/src/migrationCompatibilityRuntime';
const runtimeEnvironment = {
    LIGHTDASH_SECRET: '0123456789abcdef0123456789abcdef',
    S3_ACCESS_KEY: 'migration-compatibility',
    S3_BUCKET: 'migration-compatibility',
    S3_ENDPOINT: 'http://127.0.0.1:9',
    S3_REGION: 'local',
    S3_SECRET_KEY: 'migration-compatibility',
    SITE_URL: 'https://migration-compatibility.example.com',
};

const argument = (flag: string): string | undefined => {
    const index = process.argv.indexOf(flag);
    return index === -1 ? undefined : process.argv[index + 1];
};

const parseArguments = () => {
    const caseNames = argument('--case')
        ?.split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    if (!caseNames || caseNames.length === 0)
        throw new Error('--case is required');
    return {
        cases: getCompatibilityCases(caseNames),
        appRef: argument('--app-ref'),
        candidateRef: argument('--candidate-ref'),
        migrationRef: argument('--migration-ref') ?? MIGRATION_REF,
    };
};

const run = async (
    command: string,
    args: string[],
    options: {
        cwd: string;
        env?: NodeJS.ProcessEnv;
        capture?: boolean;
    },
): Promise<string> =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        child.stdout.on('data', (chunk: Buffer) => {
            if (options.capture) stdout += chunk.toString();
            else process.stderr.write(chunk);
        });
        child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve(stdout);
            else reject(new Error(`${command} exited with code ${code}`));
        });
    });

const resolveRef = async (ref: string): Promise<string> =>
    (
        await run('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
            cwd: root,
            capture: true,
        })
    ).trim();

const prepareArchive = async (
    sha: string,
    tempRoot: string,
): Promise<string> => {
    const destination = path.join(tempRoot, sha);
    const archive = path.join(tempRoot, `${sha}.tar`);
    await fs.mkdir(destination, { recursive: true });
    await run('git', ['archive', '--format=tar', `--output=${archive}`, sha], {
        cwd: root,
    });
    await run('tar', ['-xf', archive, '-C', destination], { cwd: root });
    await fs.cp(runtimeSource, path.join(destination, runtimeDestination), {
        recursive: true,
    });
    await run(
        'corepack',
        [
            'pnpm',
            'install',
            '--frozen-lockfile',
            '--ignore-scripts',
            '--prefer-offline',
            '--network-concurrency=16',
        ],
        { cwd: destination, env: { HUSKY: '0' } },
    );
    await run('corepack', ['pnpm', 'common-build'], { cwd: destination });
    await run('corepack', ['pnpm', 'warehouses-build'], { cwd: destination });
    return destination;
};

const parseJsonResult = (stdout: string, allowLogs: boolean): JsonObject => {
    const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    if (!allowLogs && lines.length !== 1) {
        throw new Error(
            `Expected one JSON result, received ${lines.length}: ${JSON.stringify(lines)}`,
        );
    }
    const result = lines.at(-1);
    if (!result) throw new Error('Expected one JSON result, received none');
    if (allowLogs && lines.length > 1) {
        process.stderr.write(`${lines.slice(0, -1).join('\n')}\n`);
    }
    const value: unknown = JSON.parse(result);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Probe result must be a JSON object');
    }
    return value as JsonObject;
};

const runRuntime = async (
    archive: string,
    file: 'database.ts' | 'probe.ts',
    args: string[],
    env: NodeJS.ProcessEnv = {},
): Promise<JsonObject> =>
    parseJsonResult(
        await run(
            'corepack',
            [
                'pnpm',
                '-F',
                'backend',
                'exec',
                'tsx',
                `src/migrationCompatibilityRuntime/${file}`,
                ...args,
            ],
            {
                cwd: archive,
                env: { ...runtimeEnvironment, ...env },
                capture: true,
            },
        ),
        file === 'database.ts',
    );

const assertExact = (actual: unknown, expected: unknown, label: string) => {
    if (!isDeepStrictEqual(actual, expected)) {
        throw new Error(
            `${label} mismatch\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
        );
    }
};

const createDatabaseName = (suffix: string) =>
    `ld_compat_${process.pid}_${suffix}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;

const probeEnvironment = (connectionUri: string) => ({
    PGCONNECTIONURI: connectionUri,
    EXPERIMENTAL_CACHE: 'false',
});

const runCase = async ({
    selectedCase,
    appArchive,
    migrationArchive,
    adminUri,
    templateName,
}: {
    selectedCase: CompatibilityCase;
    appArchive: string;
    migrationArchive: string;
    adminUri: string;
    templateName: string;
}) => {
    const caseDatabase = createDatabaseName('case');
    const created = await runRuntime(migrationArchive, 'database.ts', [
        'create',
        '--connection-uri',
        adminUri,
        '--database-name',
        caseDatabase,
        '--template',
        templateName,
    ]);
    const { connectionUri } = created;
    if (typeof connectionUri !== 'string') {
        throw new Error('Database creation did not return a connection URI');
    }
    try {
        if (selectedCase.probe === 'finding-one') {
            await runRuntime(appArchive, 'probe.ts', ['finding-one-fixture'], {
                ...probeEnvironment(connectionUri),
            });
        }
        const boundary = await runRuntime(migrationArchive, 'database.ts', [
            'apply-through',
            '--connection-uri',
            connectionUri,
            '--through',
            selectedCase.through,
        ]);
        assertExact(
            boundary.ledgerBoundary,
            selectedCase.through,
            `${selectedCase.name} migration boundary`,
        );
        let result: JsonObject;
        if (selectedCase.probe === 'finding-one') {
            result = await runRuntime(
                appArchive,
                'probe.ts',
                ['finding-one-read'],
                {
                    ...probeEnvironment(connectionUri),
                },
            );
            assertExact(
                result.outcome,
                selectedCase.expected,
                selectedCase.name,
            );
        } else if (
            selectedCase.probe === 'catalog-cache' ||
            selectedCase.probe === 'merged-manifest'
        ) {
            await runRuntime(
                migrationArchive,
                'probe.ts',
                ['artifact-fixture', selectedCase.probe],
                probeEnvironment(connectionUri),
            );
            await runRuntime(
                appArchive,
                'probe.ts',
                ['artifact-write', selectedCase.probe],
                probeEnvironment(connectionUri),
            );
            result = await runRuntime(
                migrationArchive,
                'probe.ts',
                ['artifact-read', selectedCase.probe],
                probeEnvironment(connectionUri),
            );
            assertExact(
                result.values,
                selectedCase.expected,
                selectedCase.name,
            );
        } else {
            await runRuntime(
                migrationArchive,
                'probe.ts',
                ['two-live-fixture'],
                probeEnvironment(connectionUri),
            );
            result = await runRuntime(
                appArchive,
                'probe.ts',
                ['two-live-read'],
                probeEnvironment(connectionUri),
            );
            assertExact(
                result.values,
                selectedCase.expected,
                selectedCase.name,
            );
        }
        return { case: selectedCase.name, status: 'passed', result } as const;
    } finally {
        await runRuntime(migrationArchive, 'database.ts', [
            'drop',
            '--connection-uri',
            adminUri,
            '--database-name',
            caseDatabase,
        ]).catch((error: unknown) => {
            process.stderr.write(`Database cleanup failed: ${String(error)}\n`);
        });
    }
};

const main = async () => {
    const startedAt = Date.now();
    const { cases, appRef, candidateRef, migrationRef } = parseArguments();
    const adminUri = process.env.PGCONNECTIONURI;
    if (!adminUri) throw new Error('PGCONNECTIONURI is required');
    if (
        cases.some((selectedCase) => selectedCase.appRef === 'candidate') &&
        !appRef &&
        !candidateRef
    ) {
        throw new Error(
            '--candidate-ref or --app-ref is required for compatible cases',
        );
    }
    const resolvedMigrationRef = await resolveRef(migrationRef);
    const resolvedCases = await Promise.all(
        cases.map(async (selectedCase) => ({
            selectedCase,
            appSha: await resolveRef(
                selectedCase.appRef === 'candidate'
                    ? (candidateRef ?? appRef!)
                    : (appRef ?? selectedCase.appRef),
            ),
        })),
    );
    const baselineSha = await resolveRef(BASELINE_APP_REF);
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), 'lightdash-migration-compatibility-'),
    );
    const archives = new Map<string, string>();
    const archiveFor = async (sha: string) => {
        const existing = archives.get(sha);
        if (existing) return existing;
        const prepared = await prepareArchive(sha, tempRoot);
        archives.set(sha, prepared);
        return prepared;
    };
    const templateName = createDatabaseName('template');
    let templateCreated = false;
    let summary: JsonObject | undefined;
    try {
        const baselineArchive = await archiveFor(baselineSha);
        const migrationArchive = await archiveFor(resolvedMigrationRef);
        await [...new Set(resolvedCases.map(({ appSha }) => appSha))].reduce(
            async (previousArchive, appSha) => {
                await previousArchive;
                await archiveFor(appSha);
            },
            Promise.resolve(),
        );
        await runRuntime(baselineArchive, 'database.ts', [
            'create',
            '--connection-uri',
            adminUri,
            '--database-name',
            templateName,
        ]);
        templateCreated = true;
        const templateUri = new URL(adminUri);
        templateUri.pathname = `/${templateName}`;
        await runRuntime(baselineArchive, 'database.ts', [
            'apply-through',
            '--connection-uri',
            templateUri.toString(),
            '--through',
            'latest',
        ]);
        const results = await resolvedCases.reduce<
            Promise<Awaited<ReturnType<typeof runCase>>[]>
        >(async (previousResults, { selectedCase, appSha }) => {
            const accumulatedResults = await previousResults;
            return [
                ...accumulatedResults,
                await runCase({
                    selectedCase,
                    appArchive: await archiveFor(appSha),
                    migrationArchive,
                    adminUri,
                    templateName,
                }),
            ];
        }, Promise.resolve([]));
        summary = {
            status: 'passed',
            refs: {
                baseline: baselineSha,
                migration: resolvedMigrationRef,
                applications: Object.fromEntries(
                    resolvedCases.map(({ selectedCase, appSha }) => [
                        selectedCase.name,
                        appSha,
                    ]),
                ),
            },
            results,
        };
    } finally {
        if (templateCreated) {
            const cleanupArchive = archives.get(resolvedMigrationRef);
            if (cleanupArchive) {
                await runRuntime(cleanupArchive, 'database.ts', [
                    'drop',
                    '--connection-uri',
                    adminUri,
                    '--database-name',
                    templateName,
                ]).catch((error: unknown) => {
                    process.stderr.write(
                        `Template database cleanup failed: ${String(error)}\n`,
                    );
                });
            }
        }
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
    if (!summary) throw new Error('Compatibility run did not produce a result');
    process.stdout.write(
        `${JSON.stringify({
            ...summary,
            durationSeconds: Math.round((Date.now() - startedAt) / 1000),
        })}\n`,
    );
};

main().catch((error: unknown) => {
    process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
});
