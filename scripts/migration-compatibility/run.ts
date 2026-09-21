import { spawn } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
    BASELINE_APP_REF,
    getCompatibilityCase,
    type FindingOneExpectation,
} from './cases';

type JsonObject = Record<string, unknown>;

const root = path.resolve(import.meta.dirname, '../..');
const runtimeSource = path.join(import.meta.dirname, 'runtime');
const runtimeDestination = 'packages/backend/src/migrationCompatibilityRuntime';

const parseArguments = () => {
    const value = (flag: string) => {
        const index = process.argv.indexOf(flag);
        return index === -1 ? undefined : process.argv[index + 1];
    };
    const caseName = value('--case');
    if (!caseName) throw new Error('--case is required');
    return { caseName, candidateRef: value('--candidate-ref') };
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

const prepareArchive = async (sha: string, tempRoot: string): Promise<string> => {
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
        'sfw',
        [
            'pnpm',
            'install',
            '--frozen-lockfile',
            '--prefer-offline',
            '--network-concurrency=16',
        ],
        { cwd: destination },
    );
    await run('pnpm', ['common-build'], { cwd: destination });
    await run('pnpm', ['warehouses-build'], { cwd: destination });
    return destination;
};

const parseJsonResult = (stdout: string): JsonObject => {
    const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length !== 1) {
        throw new Error(`Expected one JSON result, received ${lines.length}`);
    }
    const value: unknown = JSON.parse(lines[0]);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Probe result must be a JSON object');
    }
    return value as JsonObject;
};

const runRuntime = async (
    archive: string,
    file: 'database.ts' | 'findingOneProbe.ts',
    args: string[],
    env: NodeJS.ProcessEnv = {},
): Promise<JsonObject> =>
    parseJsonResult(
        await run(
            'pnpm',
            [
                '-F',
                'backend',
                'exec',
                'tsx',
                `src/migrationCompatibilityRuntime/${file}`,
                ...args,
            ],
            { cwd: archive, env, capture: true },
        ),
    );

const assertExact = (actual: unknown, expected: unknown, label: string) => {
    if (!isDeepStrictEqual(actual, expected)) {
        throw new Error(
            `${label} mismatch\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
        );
    }
};

const expectedRead = (expectation: FindingOneExpectation) => ({
    probe: 'finding-1-read',
    status: 'ok',
    pointers: {
        project: '20000000-0000-4000-8000-000000000001',
        connection: '20000000-0000-4000-8000-000000000002',
    },
    outcome: expectation,
});

const main = async () => {
    const { caseName, candidateRef } = parseArguments();
    const selectedCase = getCompatibilityCase(caseName);
    if (selectedCase.appRef === 'candidate' && !candidateRef) {
        throw new Error('--candidate-ref is required for candidate cases');
    }
    const adminUri = process.env.PGCONNECTIONURI;
    if (!adminUri) throw new Error('PGCONNECTIONURI is required');
    const refs = {
        baseline: await resolveRef(BASELINE_APP_REF),
        migration: await resolveRef(selectedCase.migrationRef),
        app: await resolveRef(
            selectedCase.appRef === 'candidate' ? candidateRef! : selectedCase.appRef,
        ),
    };
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
    const databaseName = `ld_compat_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    let databaseCreated = false;
    let migrationArchive: string | undefined;
    try {
        const baselineArchive = await archiveFor(refs.baseline);
        migrationArchive = await archiveFor(refs.migration);
        const appArchive = await archiveFor(refs.app);
        const created = await runRuntime(migrationArchive, 'database.ts', [
            'create',
            '--connection-uri',
            adminUri,
            '--database-name',
            databaseName,
        ]);
        databaseCreated = true;
        const connectionUri = created.connectionUri;
        if (typeof connectionUri !== 'string') {
            throw new Error('Database creation did not return a connection URI');
        }
        await runRuntime(baselineArchive, 'database.ts', [
            'apply-through',
            '--connection-uri',
            connectionUri,
            '--through',
            'latest',
        ]);
        const fixture = await runRuntime(
            baselineArchive,
            'findingOneProbe.ts',
            ['fixture'],
            { PGCONNECTIONURI: connectionUri, EXPERIMENTAL_CACHE: 'false' },
        );
        const expectedFixture = {
            probe: 'finding-1-fixture',
            status: 'ok',
            projectUuid: '10000000-0000-4000-8000-000000000001',
            projectCredentialUuid: '20000000-0000-4000-8000-000000000001',
        };
        assertExact(fixture, expectedFixture, 'Fixture probe');
        process.stdout.write(`${JSON.stringify(fixture)}\n`);
        const boundary = await runRuntime(migrationArchive, 'database.ts', [
            'apply-through',
            '--connection-uri',
            connectionUri,
            '--through',
            selectedCase.through,
        ]);
        assertExact(boundary.ledgerBoundary, selectedCase.through, 'Migration ledger');
        const result = await runRuntime(
            appArchive,
            'findingOneProbe.ts',
            ['read'],
            { PGCONNECTIONURI: connectionUri, EXPERIMENTAL_CACHE: 'false' },
        );
        assertExact(result, expectedRead(selectedCase.expected), 'Finding 1 probe');
        process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally {
        if (databaseCreated && migrationArchive) {
            await runRuntime(migrationArchive, 'database.ts', [
                'drop',
                '--connection-uri',
                adminUri,
                '--database-name',
                databaseName,
            ]).catch((error: unknown) => {
                process.stderr.write(`Database cleanup failed: ${String(error)}\n`);
            });
        }
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
};

main().catch((error: unknown) => {
    process.stderr.write(
        `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
});
