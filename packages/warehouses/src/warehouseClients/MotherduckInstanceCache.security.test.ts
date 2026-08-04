import { DuckdbConnectionType, WarehouseTypes } from '@lightdash/common';
import type { Mock } from 'vitest';
import { DuckdbWarehouseClient } from './DuckdbWarehouseClient';
import * as MotherduckInstanceCache from './MotherduckInstanceCache';

const createInstanceMock = vi.fn();

vi.mock('@duckdb/node-api', () => ({
    DuckDBTypeId: { INTEGER: 4, VARCHAR: 17 },
    DuckDBInstance: {
        create: (...args: unknown[]) => createInstanceMock(...args),
    },
    version: () => 'v1.5.2',
}));

const getMockStreamResult = (marker: string) => ({
    columnCount: 1,
    columnNames: () => ['marker'],
    columnTypeId: () => 17,
    yieldRowObjectJson: async function* yieldRows() {
        yield [{ marker }];
    },
});

const createMockInstance = (streamMock: Mock) => ({
    connect: async () => ({
        run: vi.fn(),
        stream: streamMock,
        extractStatements: vi.fn(async () => ({
            count: 1,
            prepare: async () => ({
                statementType: 1,
                destroySync: vi.fn(),
            }),
        })),
        interrupt: vi.fn(),
        closeSync: vi.fn(),
        disconnectSync: vi.fn(),
    }),
    closeSync: vi.fn(),
});

const motherduckCredentials = (database: string, token: string) =>
    ({
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.MOTHERDUCK,
        database,
        schema: 'main',
        token,
    }) as const;

const cachedOptions = (projectUuid: string) => ({
    enableInstanceCache: true,
    projectUuid,
});

const successStream = (marker: string) =>
    vi.fn(async () => getMockStreamResult(marker));

describe('MotherDuck instance cache security boundaries', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        MotherduckInstanceCache.resetForTesting();
        MotherduckInstanceCache.configure({
            idleTtlMs: 60_000,
            maxAgeMs: 3_600_000,
            maxEntries: 64,
        });
        DuckdbWarehouseClient.resetSharedDuckdbStateForTesting();
    });

    afterEach(async () => {
        await MotherduckInstanceCache.closeAll('shutdown');
        vi.useRealTimers();
    });

    it('isolates concurrent clients with different tokens for one database', async () => {
        const streamA = successStream('token-a-rows');
        const streamB = successStream('token-b-rows');
        const instanceA = createMockInstance(streamA);
        const instanceB = createMockInstance(streamB);
        createInstanceMock.mockImplementation(async (connectionString) =>
            String(connectionString).includes('token-a')
                ? instanceA
                : instanceB,
        );
        const clientA = new DuckdbWarehouseClient(
            motherduckCredentials('analytics', 'token-a'),
            cachedOptions('project-a'),
        );
        const clientB = new DuckdbWarehouseClient(
            motherduckCredentials('analytics', 'token-b'),
            cachedOptions('project-b'),
        );

        const [resultA, resultB] = await Promise.all([
            clientA.runQuery('SELECT 1'),
            clientB.runQuery('SELECT 1'),
        ]);

        expect(createInstanceMock).toHaveBeenCalledTimes(2);
        expect(resultA.rows).toEqual([{ marker: 'token-a-rows' }]);
        expect(resultB.rows).toEqual([{ marker: 'token-b-rows' }]);
    });

    it('isolates clients with one token across different databases', async () => {
        createInstanceMock.mockImplementation(async (connectionString) =>
            createMockInstance(
                successStream(
                    String(connectionString).startsWith('md:first')
                        ? 'first-rows'
                        : 'second-rows',
                ),
            ),
        );
        const firstClient = new DuckdbWarehouseClient(
            motherduckCredentials('first', 'shared-token'),
            cachedOptions('project-a'),
        );
        const secondClient = new DuckdbWarehouseClient(
            motherduckCredentials('second', 'shared-token'),
            cachedOptions('project-b'),
        );

        const [firstResult, secondResult] = await Promise.all([
            firstClient.runQuery('SELECT 1'),
            secondClient.runQuery('SELECT 1'),
        ]);

        expect(createInstanceMock).toHaveBeenCalledTimes(2);
        expect(firstResult.rows).toEqual([{ marker: 'first-rows' }]);
        expect(secondResult.rows).toEqual([{ marker: 'second-rows' }]);
    });

    it('never maps adversarial database names onto another credential entry', async () => {
        const victimConnectionString = `md:analytics?${new URLSearchParams({
            motherduck_token: 'victim-token',
            saas_mode: 'true',
        }).toString()}`;
        const adversarialNames = [
            'analytics?motherduck_token=victim-token',
            'analytics?motherduck_token=victim-token&saas_mode=true',
            'analytics&saas_mode=false',
            'analytics%3Fmotherduck_token%3Dvictim-token',
            'analytics/../analytics',
            'analytics#',
            'analytics/',
            'analytics ',
            'ANALYTICS',
            'café',
            'café',
            'analytics%00',
            '',
            '�',
        ];
        createInstanceMock.mockImplementation(async () =>
            createMockInstance(successStream('rows')),
        );

        await Promise.all(
            adversarialNames.map((database, index) => {
                const client = new DuckdbWarehouseClient(
                    motherduckCredentials(database, 'attacker-token'),
                    cachedOptions(`attacker-project-${index}`),
                );
                return client.runQuery('SELECT 1');
            }),
        );

        const adversarialConnectionStrings = createInstanceMock.mock.calls.map(
            ([connectionString]) => String(connectionString),
        );
        expect(adversarialConnectionStrings).not.toContain(
            victimConnectionString,
        );
        expect(new Set(adversarialConnectionStrings).size).toBe(
            adversarialNames.length,
        );

        const victimClient = new DuckdbWarehouseClient(
            motherduckCredentials('analytics', 'victim-token'),
            cachedOptions('victim-project'),
        );
        await victimClient.runQuery('SELECT 1');

        expect(createInstanceMock).toHaveBeenLastCalledWith(
            victimConnectionString,
        );
    });

    it('does not close an in-flight instance when max age evicts it', async () => {
        MotherduckInstanceCache.configure({
            idleTtlMs: 60_000,
            maxAgeMs: 1_000,
            maxEntries: 8,
        });
        const instance = createMockInstance(successStream('rows'));
        createInstanceMock
            .mockResolvedValueOnce(instance)
            .mockResolvedValue(createMockInstance(successStream('other')));
        let releaseQuery: () => void = () => undefined;
        const queryGate = new Promise<void>((resolve) => {
            releaseQuery = resolve;
        });
        let entryId = '';
        const inFlight = MotherduckInstanceCache.withInstance(
            'md:analytics?motherduck_token=token-a',
            {},
            async (_instance, acquiredEntryId) => {
                entryId = acquiredEntryId;
                await queryGate;
            },
        );
        await vi.waitFor(() => expect(entryId).not.toBe(''));

        await vi.advanceTimersByTimeAsync(1_500);
        await MotherduckInstanceCache.withInstance(
            'md:other?motherduck_token=token-b',
            {},
            async () => undefined,
        );

        expect(instance.closeSync).not.toHaveBeenCalled();
        releaseQuery();
        await inFlight;
        expect(instance.closeSync).toHaveBeenCalledOnce();
    });
});
