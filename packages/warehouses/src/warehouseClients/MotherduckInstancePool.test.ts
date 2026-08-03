import { createHash } from 'crypto';
import type { Mock } from 'vitest';
import {
    closeAll,
    configure,
    invalidate,
    resetForTesting,
    setObserver,
    withInstance,
    type MotherduckPoolEvent,
} from './MotherduckInstancePool';

const createInstanceMock = vi.fn();

vi.mock('@duckdb/node-api', () => ({
    DuckDBInstance: {
        create: (...args: unknown[]) => createInstanceMock(...args),
    },
}));

const createInstance = (connect: Mock = vi.fn(async () => ({}))) => ({
    connect,
    closeSync: vi.fn(),
});

const configureForTesting = (
    overrides: Partial<Parameters<typeof configure>[0]> = {},
) =>
    configure({
        idleTtlMs: 1000,
        maxAgeMs: 10_000,
        maxEntries: 8,
        ...overrides,
    });

describe('MotherduckInstancePool', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        resetForTesting();
        configureForTesting();
    });

    afterEach(async () => {
        await closeAll('shutdown');
        vi.useRealTimers();
    });

    it('shares identical connection strings and separates different tokens', async () => {
        createInstanceMock.mockImplementation(async () => createInstance());

        const entryIds = await Promise.all([
            withInstance(
                'md:analytics?motherduck_token=token-a',
                {},
                async (_instance, entryId) => entryId,
            ),
            withInstance(
                'md:analytics?motherduck_token=token-a',
                {},
                async (_instance, entryId) => entryId,
            ),
            withInstance(
                'md:analytics?motherduck_token=token-b',
                {},
                async (_instance, entryId) => entryId,
            ),
        ]);

        expect(createInstanceMock).toHaveBeenCalledTimes(2);
        expect(entryIds[0]).toBe(entryIds[1]);
        expect(entryIds[2]).not.toBe(entryIds[0]);
    });

    it('single-flights concurrent creation for an identical connection string', async () => {
        let resolveCreation:
            | ((instance: ReturnType<typeof createInstance>) => void)
            | undefined;
        createInstanceMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveCreation = resolve;
                }),
        );

        const first = withInstance(
            'md:analytics?motherduck_token=token-a',
            {},
            async (_instance, entryId) => entryId,
        );
        const second = withInstance(
            'md:analytics?motherduck_token=token-a',
            {},
            async (_instance, entryId) => entryId,
        );
        await vi.waitFor(() =>
            expect(createInstanceMock).toHaveBeenCalledOnce(),
        );
        resolveCreation?.(createInstance());

        await expect(Promise.all([first, second])).resolves.toEqual([
            expect.any(String),
            expect.any(String),
        ]);
        expect(await first).toBe(await second);
    });

    it.each([
        {
            bound: 'idle TTL',
            options: { idleTtlMs: 10 },
            elapsedMs: 11,
            reason: 'idle_ttl',
        },
        {
            bound: 'max age',
            options: { maxAgeMs: 10 },
            elapsedMs: 11,
            reason: 'max_age',
        },
    ] as const)(
        'evicts by $bound with the matching reason',
        async ({ options, elapsedMs, reason }) => {
            const events: MotherduckPoolEvent[] = [];
            setObserver((event) => events.push(event));
            createInstanceMock.mockImplementation(async () => createInstance());
            configureForTesting(options);

            await withInstance(
                'md:analytics?motherduck_token=token-a',
                {},
                async () => undefined,
            );
            await vi.advanceTimersByTimeAsync(elapsedMs);

            expect(events).toContainEqual(
                expect.objectContaining({ type: 'evict', reason }),
            );
        },
    );

    it('evicts the least recently used entry at the configured cap', async () => {
        const events: MotherduckPoolEvent[] = [];
        setObserver((event) => events.push(event));
        createInstanceMock.mockImplementation(async () => createInstance());
        configureForTesting({ maxEntries: 2 });

        await withInstance(
            'md:a?motherduck_token=a',
            {},
            async () => undefined,
        );
        await vi.advanceTimersByTimeAsync(1);
        await withInstance(
            'md:b?motherduck_token=b',
            {},
            async () => undefined,
        );
        await vi.advanceTimersByTimeAsync(1);
        await withInstance(
            'md:a?motherduck_token=a',
            {},
            async () => undefined,
        );
        await vi.advanceTimersByTimeAsync(1);
        await withInstance(
            'md:c?motherduck_token=c',
            {},
            async () => undefined,
        );

        expect(events).toContainEqual(
            expect.objectContaining({ type: 'evict', reason: 'lru' }),
        );
        await withInstance(
            'md:b?motherduck_token=b',
            {},
            async () => undefined,
        );
        expect(createInstanceMock).toHaveBeenCalledTimes(4);
    });

    it('unlinks an in-flight entry immediately and closes it only after release', async () => {
        const firstInstance = createInstance();
        const secondInstance = createInstance();
        createInstanceMock
            .mockResolvedValueOnce(firstInstance)
            .mockResolvedValueOnce(secondInstance);
        let entryId = '';
        let releaseQuery: () => void = () => undefined;
        const queryGate = new Promise<void>((resolve) => {
            releaseQuery = resolve;
        });

        const inFlight = withInstance(
            'md:analytics?motherduck_token=token-a',
            {},
            async (_instance, acquiredEntryId) => {
                entryId = acquiredEntryId;
                await queryGate;
            },
        );
        await vi.waitFor(() => expect(entryId).not.toBe(''));
        const draining = invalidate(entryId, 'stale');
        await withInstance(
            'md:analytics?motherduck_token=token-a',
            {},
            async () => undefined,
        );

        expect(firstInstance.closeSync).not.toHaveBeenCalled();
        expect(createInstanceMock).toHaveBeenCalledTimes(2);
        releaseQuery();
        await Promise.all([inFlight, draining]);
        expect(firstInstance.closeSync).toHaveBeenCalledOnce();
    });

    it('reserves newly created entries before concurrent LRU eviction can drain them', async () => {
        const firstInstance = createInstance();
        const secondInstance = createInstance();
        createInstanceMock
            .mockResolvedValueOnce(firstInstance)
            .mockResolvedValueOnce(secondInstance);
        configureForTesting({ maxEntries: 1 });
        let startedCallbacks = 0;
        let releaseQueries: () => void = () => undefined;
        const queryGate = new Promise<void>((resolve) => {
            releaseQueries = resolve;
        });

        const first = withInstance(
            'md:first?motherduck_token=first',
            {},
            async () => {
                expect(firstInstance.closeSync).not.toHaveBeenCalled();
                startedCallbacks += 1;
                await queryGate;
            },
        );
        const second = withInstance(
            'md:second?motherduck_token=second',
            {},
            async () => {
                expect(secondInstance.closeSync).not.toHaveBeenCalled();
                startedCallbacks += 1;
                await queryGate;
            },
        );

        await vi.waitFor(() => expect(startedCallbacks).toBe(2));
        expect(firstInstance.closeSync).not.toHaveBeenCalled();
        releaseQueries();
        await Promise.all([first, second]);
        expect(firstInstance.closeSync).toHaveBeenCalledOnce();
    });

    it('never emits the credential-derived digest and isolates observer failures', async () => {
        const connectionString =
            'md:analytics?motherduck_token=token-a&saas_mode=true';
        const digest = createHash('sha256')
            .update(JSON.stringify({ connectionString, v: 1 }))
            .digest('hex');
        const events: MotherduckPoolEvent[] = [];
        const observer = vi.fn((event: MotherduckPoolEvent) => {
            events.push(event);
            throw new Error('observer failure');
        });
        setObserver(observer);
        createInstanceMock.mockResolvedValue(createInstance());

        await expect(
            withInstance(
                connectionString,
                { projectUuid: 'project-a' },
                async () => 'ok',
            ),
        ).resolves.toBe('ok');
        expect(JSON.stringify(events)).not.toContain(digest);
        expect(JSON.stringify(events)).not.toContain('token-a');
    });

    it('uses an unrefed interval without keepalive queries', () => {
        const setIntervalSpy = vi.spyOn(global, 'setInterval');
        configureForTesting();

        const timer = setIntervalSpy.mock.results.at(-1)?.value;
        if (!timer || typeof timer === 'number') {
            throw new Error('Expected a Node.js interval handle');
        }
        expect(timer.hasRef()).toBe(false);
        expect(createInstanceMock).not.toHaveBeenCalled();
    });
});
