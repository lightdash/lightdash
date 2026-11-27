import {
    FilterOperator,
    HYDRA_DEFAULT_SOURCE,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    type Explore,
    type HydraApiSource,
    type MetricQuery,
} from '@lightdash/common';
import { hydraIntegration } from '.';
import {
    buildLiveExplores,
    compileLiveMetricQuery,
} from '../../explores/build';
import { assertLiveQuery } from '../../explores/definition';
import { getInitialLiveSourceFieldEdits } from '../../explores/fields';
import { connectLiveSource } from '../../liveSource.mock';
import { HYDRA_MAX_QUERY_ROWS } from './run';
import { createHydraServer, type HydraServer } from './server';

const NOW = new Date('2026-11-23T12:00:00Z');

const settingsWith = (overrides: Partial<HydraApiSource> = {}) => ({
    ...HYDRA_DEFAULT_SOURCE,
    ...overrides,
});

const [EVENTS, USERS] = buildLiveExplores({
    connectionUuid: '9b0c3f6e-0d0a-4c55-9a26-5e6d4b7c2a11',
    sourceName: 'hydra',
    name: 'Hydra',
    apiSource: HYDRA_DEFAULT_SOURCE,
    scannedFields: [],
    edits: getInitialLiveSourceFieldEdits({
        scannedFields: [],
        isExistingSource: true,
    }),
});

const field = (explore: Explore, name: string) => `${explore.name}_${name}`;

const query = (
    explore: Explore,
    overrides: Partial<MetricQuery> = {},
): MetricQuery => ({
    exploreName: explore.name,
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    ...overrides,
});

const compile = (explore: Explore, metricQuery: MetricQuery) => {
    assertLiveQuery(explore, metricQuery);
    return compileLiveMetricQuery({
        explore,
        metricQuery,
        timezone: 'UTC',
        now: NOW,
    });
};

/** A source whose calls reach a fresh Hydra server, the way the service sends them. */
const connect = ({
    settings = settingsWith(),
    token = 'alice',
    server = createHydraServer({ now: () => NOW, sleep: vi.fn() }),
}: {
    settings?: HydraApiSource;
    token?: string | null;
    server?: HydraServer;
} = {}) => {
    const send = vi.fn((request) =>
        server.fetch({ sourceKey: 'source-1', settings, token, request }),
    );
    const source = connectLiveSource(hydraIntegration, settings, send);
    const run = (explore: Explore, metricQuery: MetricQuery) => {
        const compiled = compile(explore, metricQuery);
        return source.run({
            query: compiled.query,
            limit: compiled.requestLimit,
        });
    };
    return { send, run };
};

describe('Hydra compile', () => {
    it('reads the last 30 days with filters and sorts the API applies', () => {
        const compiled = compile(
            EVENTS,
            query(EVENTS, {
                dimensions: [field(EVENTS, 'event_type')],
                metrics: [field(EVENTS, 'event_count')],
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'country',
                                target: { fieldId: field(EVENTS, 'country') },
                                operator: FilterOperator.NOT_EQUALS,
                                values: ['US', 'GB'],
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: field(EVENTS, 'event_count'), descending: true },
                ],
            }),
        );
        expect(JSON.parse(compiled.query)).toEqual({
            report: 'events',
            dimensions: ['event_type'],
            metrics: ['event_count'],
            startDate: '2026-10-24',
            endDate: '2026-11-22',
            filters: [
                { field: 'country', operator: 'not_in', values: ['US', 'GB'] },
            ],
            orderBy: [{ field: 'event_count', descending: true }],
            limit: 100,
        });
        expect(compiled.localSorts).toEqual([]);
    });

    it('reads users with no date range', () => {
        const compiled = compile(
            USERS,
            query(USERS, {
                dimensions: [field(USERS, 'plan')],
                metrics: [field(USERS, 'user_count')],
            }),
        );
        expect(JSON.parse(compiled.query)).not.toHaveProperty('startDate');
    });

    it('is refused by the shared check before compiling what it cannot run', () => {
        expect(() =>
            compile(
                EVENTS,
                query(EVENTS, {
                    metrics: [field(EVENTS, 'event_count')],
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: 'count',
                                    target: {
                                        fieldId: field(EVENTS, 'event_count'),
                                    },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [5],
                                },
                            ],
                        },
                    },
                }),
            ),
        ).toThrow(ParameterError);
    });
});

describe('Hydra through the shared engine', () => {
    it('returns the same totals for the same token and other rows for another', async () => {
        const totals = (token: string) =>
            connect({ token }).run(
                EVENTS,
                query(EVENTS, {
                    dimensions: [field(EVENTS, 'event_type')],
                    metrics: [
                        field(EVENTS, 'event_count'),
                        field(EVENTS, 'revenue'),
                    ],
                }),
            );
        const alice = await totals('alice');
        expect(await totals('alice')).toEqual(alice);
        expect(await totals('bob')).not.toEqual(alice);
        expect(alice.columns.map(({ name }) => name)).toEqual([
            'event_type',
            'event_count',
            'revenue',
        ]);
        // Sorted by the first metric, largest first, by the API
        const counts = alice.rows.map((row) => Number(row.event_count));
        expect(counts).toEqual([...counts].sort((a, b) => b - a));
    });

    it('counts every seeded event when nothing narrows it', async () => {
        const { rows } = await connect({
            settings: settingsWith({ rowCount: 250 }),
        }).run(
            EVENTS,
            query(EVENTS, {
                metrics: [field(EVENTS, 'event_count')],
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'date',
                                target: { fieldId: field(EVENTS, 'date') },
                                operator: FilterOperator.IN_THE_PAST,
                                values: [90],
                                settings: { unitOfTime: 'days' },
                            },
                        ],
                    },
                },
            }),
        );
        expect(rows).toHaveLength(1);
        // Today's events are outside "the past 90 days", which ends yesterday
        expect(Number(rows[0].event_count)).toBeLessThanOrEqual(250);
        expect(Number(rows[0].event_count)).toBeGreaterThan(200);
    });

    it('marks results cut at the limit and refuses a limit past its row cap', async () => {
        const { run, send } = connect();
        const byUser = (limit: number) =>
            query(EVENTS, {
                dimensions: [field(EVENTS, 'user_id')],
                metrics: [field(EVENTS, 'event_count')],
                limit,
            });
        const cut = await run(EVENTS, byUser(5));
        expect(cut.rows).toHaveLength(5);
        expect(cut.hasMoreRows).toBe(true);
        expect(send).toHaveBeenCalledTimes(1);

        await expect(
            run(EVENTS, byUser(HYDRA_MAX_QUERY_ROWS + 1)),
        ).rejects.toMatchObject({
            data: { liveSourceErrorCode: 'live_source.refused.row_limit' },
        });
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('answers its mock responses for the calls they name, then as usual', async () => {
        const { run } = connect({
            settings: settingsWith({
                mockResponses: [
                    { call: 1, status: 200 },
                    { call: 2, status: 429, retryAfterSeconds: 7 },
                ],
            }),
        });
        const count = query(EVENTS, {
            metrics: [field(EVENTS, 'event_count')],
        });
        await expect(run(EVENTS, count)).resolves.toBeDefined();
        const limited = run(EVENTS, count);
        await expect(limited).rejects.toBeInstanceOf(TooManyRequestsError);
        await expect(limited).rejects.toMatchObject({
            data: { retryAfterSeconds: 7 },
        });
        await expect(run(EVENTS, count)).resolves.toBeDefined();
    });

    it('reads a page at a time when the source pages', async () => {
        const byUser = query(EVENTS, {
            dimensions: [field(EVENTS, 'user_id')],
            metrics: [field(EVENTS, 'event_count')],
            limit: 60,
        });
        const whole = await connect().run(EVENTS, byUser);
        const paged = connect({ settings: settingsWith({ pageSize: 20 }) });
        await expect(paged.run(EVENTS, byUser)).resolves.toEqual(whole);
        // 61 rows asked for, 20 a page
        expect(paged.send).toHaveBeenCalledTimes(4);
    });

    it('fails sign-in when told to, or without a token', async () => {
        const count = query(EVENTS, {
            metrics: [field(EVENTS, 'event_count')],
        });
        await expect(
            connect({ settings: settingsWith({ failAuth: true }) }).run(
                EVENTS,
                count,
            ),
        ).rejects.toBeInstanceOf(WarehouseConnectionError);
        await expect(
            connect({ token: null }).run(EVENTS, count),
        ).rejects.toBeInstanceOf(WarehouseConnectionError);
    });

    it('fails the share of calls its error rate says', async () => {
        const count = query(EVENTS, {
            metrics: [field(EVENTS, 'event_count')],
        });
        const failing = createHydraServer({
            now: () => NOW,
            sleep: vi.fn(),
            random: () => 0.4,
        });
        await expect(
            connect({
                settings: settingsWith({ errorRate: 0.5 }),
                server: failing,
            }).run(EVENTS, count),
        ).rejects.toBeInstanceOf(UnexpectedServerError);
        await expect(
            connect({
                settings: settingsWith({ errorRate: 0.3 }),
                server: failing,
            }).run(EVENTS, count),
        ).resolves.toBeDefined();
    });

    it('waits its latency before answering', async () => {
        const sleep = vi.fn().mockResolvedValue(undefined);
        await connect({
            settings: settingsWith({ latencyMs: 1_500 }),
            server: createHydraServer({ now: () => NOW, sleep }),
        }).run(USERS, query(USERS, { metrics: [field(USERS, 'seats')] }));
        expect(sleep).toHaveBeenCalledWith(1_500);
    });

    it('explains a request it does not understand', async () => {
        const server = createHydraServer({ now: () => NOW });
        const response = await server.fetch({
            sourceKey: 'source-1',
            settings: settingsWith(),
            token: 'alice',
            request: {
                method: 'POST',
                path: '/v1/report',
                body: { report: 'users', metrics: ['revenue'] },
            },
        });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            message: expect.stringContaining('no field "revenue"'),
        });
    });

    it('summarizes the setup test with the account the token reads', async () => {
        const server = createHydraServer({ now: () => NOW });
        const { body } = await server.fetch({
            sourceKey: 'source-1',
            settings: settingsWith({ rowCount: 40 }),
            token: 'alice',
            request: { method: 'GET', path: '/v1/account', body: undefined },
        });
        expect(
            hydraIntegration.connection.summarizeTest?.(body, settingsWith()),
        ).toMatchObject({
            summary: expect.stringMatching(
                /^Connected to Hydra account hydra-/,
            ),
            facts: [
                { label: 'Events', value: '40' },
                { label: 'Users', value: '10' },
            ],
        });
    });

    it('declares the vendor limits by default, its own, or none', () => {
        expect(hydraIntegration.spec.rateLimitsFor?.(settingsWith())).toEqual({
            concurrentCalls: 2,
            callsPerSecond: null,
            buckets: [
                {
                    id: 'minute',
                    label: 'per minute',
                    windowMs: 60_000,
                    capacity: 30,
                },
                {
                    id: 'hour',
                    label: 'per hour',
                    windowMs: 3_600_000,
                    capacity: 300,
                },
            ],
        });
        expect(
            hydraIntegration.spec.rateLimitsFor?.(
                settingsWith({
                    declaredLimits: {
                        concurrentCalls: 1,
                        callsPerSecond: 5,
                        buckets: [
                            { id: 'burst', windowMs: 2_000, capacity: 3 },
                        ],
                    },
                }),
            ),
        ).toEqual({
            concurrentCalls: 1,
            callsPerSecond: 5,
            buckets: [
                {
                    id: 'burst',
                    label: 'per 2000 ms',
                    windowMs: 2_000,
                    capacity: 3,
                },
            ],
        });
        expect(
            hydraIntegration.spec.rateLimitsFor?.(
                settingsWith({ declaredLimits: null }),
            ),
        ).toMatchObject({ callsPerSecond: null, buckets: [] });
    });
});
