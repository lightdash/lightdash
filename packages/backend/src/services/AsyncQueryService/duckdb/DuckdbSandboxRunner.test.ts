import {
    DimensionType,
    MissingConfigError,
    type ResultColumns,
} from '@lightdash/common';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import {
    type SandboxProvider,
    type SandboxSpec,
} from '../../../ee/services/SandboxRuntime/types';
import { getJsonlReferenceSelect } from '../../../utils/duckdb/duckdbSqlTables';
import { LocalProcessSandboxProvider } from '../sandbox/LocalProcessSandboxProvider';
import {
    DUCKDB_RUNNER_SOURCE,
    getDuckdbNodeWorkPaths,
} from './duckdbSandboxHarness';
import {
    DuckdbSandboxExecutionError,
    DuckdbSandboxRunner,
} from './DuckdbSandboxRunner';

vi.mock('../../../tracing/tracing', () => ({
    traceSpan: async (_options: unknown, fn: () => Promise<unknown>) => fn(),
}));

const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };

class RecordingProvider extends LocalProcessSandboxProvider {
    readonly sandboxIds: string[] = [];

    readonly specs: SandboxSpec[] = [];

    async create(spec?: SandboxSpec) {
        if (spec) this.specs.push(spec);
        const handle = await super.create();
        this.sandboxIds.push(handle.sandboxId);
        return handle;
    }
}

const createRunner = (
    provider: SandboxProvider,
    runnerSource: string | null = null,
) =>
    new DuckdbSandboxRunner({
        lightdashConfig: lightdashConfigMock,
        logger,
        provider,
        runnerSource,
    });

const ordersColumns = {
    customer: { reference: 'customer', type: DimensionType.STRING },
    amount: {
        reference: 'amount',
        type: DimensionType.NUMBER,
        numericKind: { kind: 'integer' },
    },
} as unknown as ResultColumns;

const nodePaths = getDuckdbNodeWorkPaths('query-uuid');
const ordersSelect = getJsonlReferenceSelect(
    `${nodePaths.inputDir}/orders.jsonl`,
    ordersColumns,
);

const ordersInput = {
    table: 'orders',
    bytes: Buffer.from(
        [
            { customer: 'ann', amount: '10' },
            { customer: 'bob', amount: '5' },
            { customer: 'ann', amount: '7' },
        ]
            .map((row) => `${JSON.stringify(row)}\n`)
            .join(''),
    ),
};

const createArgs = {
    queryUuid: 'query-uuid',
    projectUuid: 'project-uuid',
    commandTimeoutMs: 30_000,
    referenceWaitMs: 0,
};

const openArgs = { ...createArgs, inputs: [ordersInput] };

describe('DuckdbSandboxRunner over a local process sandbox', () => {
    it('probes the columns of a statement over the input files', async () => {
        const provider = new RecordingProvider();
        const runner = createRunner(provider);

        const fields = await runner.withSession(openArgs, async (session) =>
            session.probe(
                `WITH orders AS (${ordersSelect}) SELECT customer, SUM(amount) AS total FROM orders GROUP BY customer LIMIT 1`,
            ),
        );

        expect(fields).toEqual({
            fields: {
                customer: { type: DimensionType.STRING },
                total: {
                    type: DimensionType.NUMBER,
                    numericKind: { kind: 'integer' },
                },
            },
        });
        expect(provider.sandboxIds).toHaveLength(1);
        expect(existsSync(provider.sandboxIds[0])).toBe(false);
    });

    it('runs a statement and returns the result lines, fields and row count', async () => {
        const provider = new RecordingProvider();
        const runner = createRunner(provider);

        const result = await runner.withSession(openArgs, async (session) =>
            session.run(
                `WITH orders AS (${ordersSelect}) SELECT customer, SUM(amount) AS total FROM orders GROUP BY customer ORDER BY customer`,
                { limit: 10 },
            ),
        );

        expect(
            result.resultBytes
                .toString('utf8')
                .split('\n')
                .filter(Boolean)
                .map((line) => JSON.parse(line)),
        ).toEqual([
            { customer: 'ann', total: '17' },
            { customer: 'bob', total: '5' },
        ]);
        expect(result.rowCount).toBe(2);
        expect(result.fields).toEqual({
            customer: { type: DimensionType.STRING },
            total: {
                type: DimensionType.NUMBER,
                numericKind: { kind: 'integer' },
            },
        });
        expect(existsSync(provider.sandboxIds[0])).toBe(false);
    });

    it('probes and runs in the same sandbox', async () => {
        const provider = new RecordingProvider();
        const runner = createRunner(provider);

        const rowCount = await runner.withSession(openArgs, async (session) => {
            await session.probe(`${ordersSelect} LIMIT 1`);
            return (await session.run(ordersSelect, { limit: 10 })).rowCount;
        });

        expect(rowCount).toBe(3);
        expect(provider.sandboxIds).toHaveLength(1);
    });

    it('reports the fields and no lines for a result without rows', async () => {
        const runner = createRunner(new RecordingProvider());

        const { probed, ran } = await runner.withSession(
            openArgs,
            async (session) => ({
                probed: await session.probe(`${ordersSelect} LIMIT 0`),
                ran: await session.run(`${ordersSelect} LIMIT 0`, {
                    limit: 10,
                }),
            }),
        );

        const fields = {
            customer: { type: DimensionType.STRING },
            amount: {
                type: DimensionType.NUMBER,
                numericKind: { kind: 'integer' },
            },
        };
        expect(probed).toEqual({ fields });
        expect(ran).toEqual({
            fields,
            rowCount: 0,
            resultBytes: Buffer.alloc(0),
        });
    });

    it('surfaces the DuckDB error message of invalid SQL and destroys the sandbox', async () => {
        const provider = new RecordingProvider();
        const runner = createRunner(provider);

        const error = await runner
            .withSession(openArgs, async (session) =>
                session.run(
                    `WITH orders AS (${ordersSelect}) SELECT missing_column FROM orders`,
                    { limit: 10 },
                ),
            )
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(DuckdbSandboxExecutionError);
        expect((error as Error).message).toMatch(
            /Binder Error: Referenced column "missing_column" not found/,
        );
        expect(existsSync(provider.sandboxIds[0])).toBe(false);
    });

    it('refuses a result with more rows than the limit', async () => {
        const runner = createRunner(new RecordingProvider());

        await expect(
            runner.withSession(openArgs, async (session) =>
                session.run(ordersSelect, { limit: 2 }),
            ),
        ).rejects.toThrow(
            new DuckdbSandboxExecutionError(
                'SQL transformation returned 3 rows, more than the limit of 2',
            ),
        );
    });

    it('stops a statement that outlives the timeout', async () => {
        const provider = new RecordingProvider();
        const runner = createRunner(provider);

        await expect(
            runner.withSession(
                { ...openArgs, commandTimeoutMs: 1_000 },
                async (session) =>
                    session.run(
                        'SELECT COUNT(*) AS n FROM range(100000000) a, range(100000000) b',
                        { limit: 10 },
                    ),
            ),
        ).rejects.toThrow(
            new DuckdbSandboxExecutionError('SQL transformation exceeded 1s'),
        );
        expect(existsSync(provider.sandboxIds[0])).toBe(false);
    });

    it('refuses a result file larger than 64 MiB', async () => {
        const provider = new RecordingProvider();
        const runner = createRunner(provider);

        await expect(
            runner.withSession(openArgs, async (session) =>
                session.run(
                    "SELECT repeat('x', 1000) AS padding FROM range(70000)",
                    { limit: 100_000 },
                ),
            ),
        ).rejects.toThrow(
            new DuckdbSandboxExecutionError(
                'SQL transformation result exceeds the 64 MiB limit',
            ),
        );
        expect(existsSync(provider.sandboxIds[0])).toBe(false);
    });

    it('creates the sandbox before its inputs exist, then runs over inputs written later', async () => {
        const provider = new RecordingProvider();
        const runner = createRunner(provider);

        const sandbox = await runner.create(createArgs);
        expect(provider.sandboxIds).toHaveLength(1);
        expect(
            existsSync(`${provider.sandboxIds[0]}/query-uuid/in/orders.jsonl`),
        ).toBe(false);
        try {
            sandbox.stageInputs([ordersInput]);
            const { rowCount } = await sandbox.run(ordersSelect, {
                limit: null,
            });
            expect(rowCount).toBe(3);
        } finally {
            await sandbox.close();
        }
        expect(existsSync(provider.sandboxIds[0])).toBe(false);
    });

    describe('sandbox lifetime', () => {
        const lifetimeOf = async (args: {
            commandTimeoutMs?: number;
            referenceWaitMs: number;
        }) => {
            const provider = new RecordingProvider();
            const sandbox = await createRunner(provider).create({
                queryUuid: 'query-uuid',
                projectUuid: 'project-uuid',
                ...args,
            });
            await sandbox.close();
            expect(provider.specs).toHaveLength(1);
            return provider.specs[0].timeoutMs;
        };

        it('covers the probe, the run, input and output transfer and an idle margin', async () => {
            // 2 x 30s commands + 2 min transfer + 1 min idle
            expect(
                await lifetimeOf({
                    commandTimeoutMs: 30_000,
                    referenceWaitMs: 0,
                }),
            ).toBe(60_000 + 120_000 + 60_000);
        });

        it('adds the reference wait still to come after creation', async () => {
            // 15 min wait + 2 x 30s commands + 2 min transfer + 1 min idle
            expect(
                await lifetimeOf({
                    commandTimeoutMs: 30_000,
                    referenceWaitMs: 15 * 60_000,
                }),
            ).toBe(15 * 60_000 + 60_000 + 120_000 + 60_000);
        });

        it('budgets two five-minute commands when no command timeout is given', async () => {
            expect(await lifetimeOf({ referenceWaitMs: 0 })).toBe(
                10 * 60_000 + 120_000 + 60_000,
            );
        });
    });

    it('destroys a sandbox closed before any input was written', async () => {
        const provider = new RecordingProvider();
        const sandbox = await createRunner(provider).create(createArgs);

        await sandbox.close();

        expect(existsSync(provider.sandboxIds[0])).toBe(false);
    });

    it('names the metadata cap when the run metadata is too large', async () => {
        // Metadata is the command's stdout; 1.5 MiB is over its cap but under the log cap
        const oversizedMetaRunner = [
            'import sys',
            "sys.stdout.write(' ' * (1024 * 1024 + 512 * 1024))",
        ].join('\n');
        const runner = createRunner(
            new RecordingProvider(),
            oversizedMetaRunner,
        );

        await expect(
            runner.withSession(openArgs, async (session) =>
                session.run(ordersSelect, { limit: null }),
            ),
        ).rejects.toThrow(
            new DuckdbSandboxExecutionError(
                'SQL transformation metadata exceeds the 1 MiB limit',
            ),
        );
    });

    it('cannot read files outside the input directory', async () => {
        const runner = createRunner(new RecordingProvider());

        await expect(
            runner.withSession(openArgs, async (session) =>
                session.run(
                    `SELECT * FROM read_json_auto('${nodePaths.settingsPath}')`,
                    {
                        limit: 10,
                    },
                ),
            ),
        ).rejects.toThrow(/Permission Error/);
    });
});

describe('DuckdbSandboxRunner configuration', () => {
    it('pins the image duckdb to the minor version of the server client', () => {
        const repoRoot = path.resolve(__dirname, '../../../../../..');
        const pinned = readFileSync(
            path.join(repoRoot, 'sandboxes/duckdb-runner/requirements.txt'),
            'utf8',
        ).match(/^duckdb==(\d+\.\d+)\.\d+$/m)?.[1];
        const server = JSON.parse(
            readFileSync(
                path.join(repoRoot, 'packages/backend/package.json'),
                'utf8',
            ),
        ).dependencies['@duckdb/node-api'].match(/^(\d+\.\d+)\./)?.[1];

        expect(pinned).toBeDefined();
        expect(pinned).toBe(server);
    });

    const configWith = (
        appRuntime: Partial<typeof lightdashConfigMock.appRuntime>,
    ) => ({
        ...lightdashConfigMock,
        appRuntime: { ...lightdashConfigMock.appRuntime, ...appRuntime },
    });

    it('fails fast when the e2b provider has no API key', () => {
        const runner = new DuckdbSandboxRunner({
            lightdashConfig: configWith({
                sandboxProvider: 'e2b',
                e2bApiKey: null,
            }),
            logger,
            provider: null,
            runnerSource: null,
        });
        expect(() => runner.assertConfigured()).toThrow(
            new MissingConfigError(
                'E2B API key is not configured (E2B_API_KEY)',
            ),
        );
    });

    it('fails fast on a provider that cannot run DuckDB sandboxes', () => {
        const runner = new DuckdbSandboxRunner({
            lightdashConfig: configWith({ sandboxProvider: 'lambda-microvm' }),
            logger,
            provider: null,
            runnerSource: null,
        });
        expect(() => runner.assertConfigured()).toThrow(MissingConfigError);
        expect(() => runner.assertConfigured()).toThrow(/SANDBOX_PROVIDER/);
    });

    it('is configured with an e2b API key', () => {
        const runner = new DuckdbSandboxRunner({
            lightdashConfig: configWith({
                sandboxProvider: 'e2b',
                e2bApiKey: 'key',
            }),
            logger,
            provider: null,
            runnerSource: null,
        });
        expect(() => runner.assertConfigured()).not.toThrow();
    });

    it('versions by provider, template and runner script', () => {
        const lightdashConfig = configWith({
            sandboxProvider: 'e2b',
            e2bDuckdbTemplateName: 'lightdash-duckdb-runner',
            e2bDuckdbTemplateTag: '1.2.3',
        });
        const current = new DuckdbSandboxRunner({
            lightdashConfig,
            logger,
            provider: null,
            runnerSource: null,
        });
        const changed = new DuckdbSandboxRunner({
            lightdashConfig,
            logger,
            provider: null,
            runnerSource: `${DUCKDB_RUNNER_SOURCE}\n// changed`,
        });
        const docker = new DuckdbSandboxRunner({
            lightdashConfig: configWith({
                sandboxProvider: 'docker',
                sandboxDuckdbDockerImage: 'lightdash-duckdb-runner:local',
            }),
            logger,
            provider: null,
            runnerSource: null,
        });

        expect(current.version).toMatch(
            /^e2b:lightdash-duckdb-runner:1\.2\.3:[0-9a-f]{16}$/,
        );
        expect(changed.version).toMatch(
            /^e2b:lightdash-duckdb-runner:1\.2\.3:[0-9a-f]{16}$/,
        );
        expect(changed.version).not.toBe(current.version);
        expect(docker.version).toMatch(
            /^docker:lightdash-duckdb-runner:local:[0-9a-f]{16}$/,
        );
    });
});
