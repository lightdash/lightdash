import { DimensionType } from '@lightdash/common';
import { existsSync } from 'node:fs';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { LocalProcessSandboxProvider } from '../sandbox/LocalProcessSandboxProvider';
import {
    DuckdbSandboxExecutionError,
    DuckdbSandboxRunner,
    type DuckdbSandboxSession,
} from './DuckdbSandboxRunner';

vi.mock('../../../tracing/tracing', () => ({
    traceSpan: async (_options: unknown, fn: () => Promise<unknown>) => fn(),
}));

const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };

class RecordingProvider extends LocalProcessSandboxProvider {
    readonly sandboxIds: string[] = [];

    async create() {
        const handle = await super.create();
        this.sandboxIds.push(handle.sandboxId);
        return handle;
    }
}

const ordersInput = {
    table: 'orders',
    bytes: Buffer.from(
        '{"id":1,"status":"placed"}\n{"id":2,"status":"shipped"}\n',
    ),
};

const inSandbox = async <T>(
    fn: (session: DuckdbSandboxSession) => Promise<T>,
    {
        provider = new RecordingProvider(),
        memoryLimit = lightdashConfigMock.appRuntime.duckdbSandboxMemoryLimit,
    }: { provider?: RecordingProvider; memoryLimit?: string } = {},
): Promise<T> =>
    new DuckdbSandboxRunner({
        lightdashConfig: {
            ...lightdashConfigMock,
            appRuntime: {
                ...lightdashConfigMock.appRuntime,
                duckdbSandboxMemoryLimit: memoryLimit,
                duckdbSandboxThreads: 1,
            },
        },
        logger,
        provider,
        runnerSource: null,
    }).withSession(
        {
            queryUuid: 'query-uuid',
            projectUuid: 'project-uuid',
            commandTimeoutMs: 30_000,
            referenceWaitMs: 0,
            inputs: [ordersInput],
        },
        fn,
    );

const run = (sql: string) =>
    inSandbox((session) => session.run(sql, { limit: null }));

const rowsOf = (resultBytes: Buffer) =>
    resultBytes
        .toString('utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));

describe('DuckDB sandbox runner isolation', () => {
    it('reads a JSONL file inside the input directory', async () => {
        const result = await run(
            `SELECT * FROM read_json('/work/in/orders.jsonl', columns={"id": 'INTEGER', "status": 'VARCHAR'}, format='newline_delimited') ORDER BY id`,
        );

        expect(rowsOf(result.resultBytes)).toEqual([
            { id: 1, status: 'placed' },
            { id: 2, status: 'shipped' },
        ]);
        expect(result.fields).toEqual({
            id: {
                type: DimensionType.NUMBER,
                numericKind: { kind: 'integer' },
            },
            status: { type: DimensionType.STRING },
        });
    });

    it.each([
        ['a file outside the input directory', '/work/settings.json'],
        [
            'a path that traverses out of the input directory',
            '/work/in/../run.sql',
        ],
        ['a system file', '/etc/hosts'],
    ])('refuses to read %s', async (_label, filePath) => {
        await expect(
            run(`SELECT * FROM read_text('${filePath}')`),
        ).rejects.toThrow(/Permission Error/);
    });

    it('refuses remote reads', async () => {
        await expect(
            run(`SELECT * FROM read_text('https://example.com/data.csv')`),
        ).rejects.toThrow(DuckdbSandboxExecutionError);
    });

    it.each([
        ['the input directory', '/work/in/copy.csv', 'in/copy.csv'],
        ['the temp directory', '/work/tmp/copy.csv', 'tmp/copy.csv'],
        ['the work directory', '/work/copy.csv', 'copy.csv'],
    ])(
        'refuses to write a file into %s',
        async (_label, sandboxPath, relativePath) => {
            const provider = new RecordingProvider();
            const written = await inSandbox(
                async (session) => {
                    await expect(
                        session.run(`COPY (SELECT 1) TO '${sandboxPath}'`, {
                            limit: null,
                        }),
                    ).rejects.toThrow(/only SELECT statements are allowed/);
                    return existsSync(
                        `${provider.sandboxIds[0]}/${relativePath}`,
                    );
                },
                { provider },
            );
            expect(written).toBe(false);
        },
    );

    it.each([
        `SET allowed_directories = ['/']`,
        'SET enable_external_access = true',
        'SET lock_configuration = false',
        `SELECT 1; SET allowed_directories = ['/']`,
        `SELECT * FROM query('SET allowed_directories = [''/'']')`,
    ])('cannot reverse the lockdown with: %s', async (sql) => {
        await expect(run(sql)).rejects.toThrow(DuckdbSandboxExecutionError);
    });

    it('refuses a read hidden inside query()', async () => {
        await expect(
            run(
                `SELECT * FROM query('SELECT * FROM read_text(''/etc/hosts'')')`,
            ),
        ).rejects.toThrow(/Permission Error/);
    });

    it('does not resolve table names to the runner’s Python variables', async () => {
        await expect(run('SELECT * FROM connection')).rejects.toThrow(
            /Catalog Error/,
        );
    });

    it('applies the memory limit', async () => {
        await expect(
            inSandbox(
                (session) =>
                    session.run(
                        'SELECT length(list(x)) AS n FROM range(20000000) t(x)',
                        { limit: null },
                    ),
                { memoryLimit: '32MB' },
            ),
        ).rejects.toThrow(/Out of Memory/);
    });
});
