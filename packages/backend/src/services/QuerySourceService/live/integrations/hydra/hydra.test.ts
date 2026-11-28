import {
    FilterOperator,
    HYDRA_DEFAULT_SOURCE,
    ParameterError,
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
import { connectLiveSource } from '../../liveSource.mock';
import { HYDRA_MAX_QUERY_ROWS } from './run';

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

/** A source run the way the service runs it; `send` would carry any call it made. */
const connect = (settings: HydraApiSource = settingsWith()) => {
    const send = vi.fn();
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
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the same totals every time, without calling anything', async () => {
        const totals = () => {
            const { run, send } = connect();
            return run(
                EVENTS,
                query(EVENTS, {
                    dimensions: [field(EVENTS, 'event_type')],
                    metrics: [
                        field(EVENTS, 'event_count'),
                        field(EVENTS, 'revenue'),
                    ],
                }),
            ).then((result) => ({ result, send }));
        };
        const first = await totals();
        expect((await totals()).result).toEqual(first.result);
        expect(first.send).not.toHaveBeenCalled();
        expect(first.result.columns.map(({ name }) => name)).toEqual([
            'event_type',
            'event_count',
            'revenue',
        ]);
        // Sorted by the first metric, largest first
        const counts = first.result.rows.map((row) => Number(row.event_count));
        expect(counts).toEqual([...counts].sort((a, b) => b - a));
    });

    it('counts every seeded event when nothing narrows it', async () => {
        const { rows } = await connect(settingsWith({ rowCount: 250 })).run(
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
        const { run } = connect();
        const byUser = (limit: number) =>
            query(EVENTS, {
                dimensions: [field(EVENTS, 'user_id')],
                metrics: [field(EVENTS, 'event_count')],
                limit,
            });
        const cut = await run(EVENTS, byUser(5));
        expect(cut.rows).toHaveLength(5);
        expect(cut.hasMoreRows).toBe(true);

        await expect(
            run(EVENTS, byUser(HYDRA_MAX_QUERY_ROWS + 1)),
        ).rejects.toMatchObject({
            data: { liveSourceErrorCode: 'live_source.refused.row_limit' },
        });
    });

    it('reads users too', async () => {
        const { rows } = await connect().run(
            USERS,
            query(USERS, { metrics: [field(USERS, 'user_count')] }),
        );
        expect(Number(rows[0].user_count)).toBeGreaterThan(0);
    });
});
