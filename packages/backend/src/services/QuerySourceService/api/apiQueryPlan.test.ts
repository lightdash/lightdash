import {
    ApiConnectorType,
    DimensionType,
    getItemId,
    ParameterError,
    TimeoutError,
    type Explore,
    type ExternalConnectionApiSource,
} from '@lightdash/common';
import {
    type ApiConnector,
    type ApiConnectorDescription,
    type ApiConnectorFetchArgs,
    type ApiConnectorResult,
} from './ApiConnector';
import {
    runApiQueryPlan,
    toOneStepApiQueryPlan,
    type ApiQueryPlan,
} from './apiQueryPlan';
import {
    buildApiSourceExplores,
    compileApiSourceMetricQuery,
    getLegacyLiveSourceName,
    toScannedLiveSourceFields,
} from './apiSourceExplores';
import { getApiSourceIntegration } from './apiSourceIntegrations';
import { getInitialLiveSourceFieldEdits } from './liveSourceFields';

const CONNECTION_UUID = '03386598-7a51-45b2-b1f9-5ef55bd09016';

const SHIPPED: ExternalConnectionApiSource[] = [
    { connector: ApiConnectorType.GA4, propertyId: '123' },
    {
        connector: ApiConnectorType.SEARCH_CONSOLE,
        siteUrl: 'sc-domain:example.com',
    },
    { connector: ApiConnectorType.POSTHOG, projectId: '42' },
    {
        connector: ApiConnectorType.GOOGLE_ADS,
        customerId: '123',
        loginCustomerId: null,
    },
    { connector: ApiConnectorType.YOUTUBE_ANALYTICS, channelId: 'UC123' },
    { connector: ApiConnectorType.LINKEDIN_ADS, adAccountId: '456' },
    { connector: ApiConnectorType.META_ADS, adAccountId: '789' },
];

const describeShipped = (apiSource: ExternalConnectionApiSource) =>
    getApiSourceIntegration(apiSource.connector)
        .createConnector(apiSource, async () => {
            throw new Error('No calls in this test');
        })
        .connector.describe();

const buildExplore = (apiSource: ExternalConnectionApiSource): Explore => {
    const scannedFields = toScannedLiveSourceFields(apiSource.connector, {});
    const [explore] = buildApiSourceExplores({
        connectionUuid: CONNECTION_UUID,
        sourceName: getLegacyLiveSourceName(
            apiSource.connector,
            CONNECTION_UUID,
        ),
        name: 'Source',
        apiSource,
        scannedFields,
        edits: getInitialLiveSourceFieldEdits({
            scannedFields,
            isExistingSource: true,
        }),
    });
    return explore;
};

const noUsage = () => ({ responseBytes: 0 });

describe.each(SHIPPED.map((apiSource) => [apiSource.connector, apiSource]))(
    '%s on a one-step plan',
    (_, apiSource) => {
        const description = describeShipped(apiSource);
        const payload = { kind: 'query' as const, query: '{"q":1}' };

        it('runs one execution, unchanged', async () => {
            const result: ApiConnectorResult = {
                columns: [{ name: 'a', type: DimensionType.STRING }],
                rows: [{ a: 'x' }],
                hasMoreRows: true,
                bytesRead: 12,
            };
            const execute = vi.fn(async () => result);
            const fetchRows = vi.fn();
            const connector: ApiConnector = {
                describe: () => description,
                execute,
                fetchRows,
            };

            await expect(
                runApiQueryPlan({
                    plan: toOneStepApiQueryPlan({
                        payload,
                        limit: 500,
                        description,
                    }),
                    connector,
                    usage: noUsage,
                }),
            ).resolves.toBe(result);
            expect(execute).toHaveBeenCalledTimes(1);
            expect(execute).toHaveBeenCalledWith({ payload, limit: 500 });
            expect(fetchRows).not.toHaveBeenCalled();
        });

        it('runs however long the query has already waited', async () => {
            const execute = vi.fn(async () => ({
                columns: [],
                rows: [],
                hasMoreRows: false,
                bytesRead: null,
            }));
            await runApiQueryPlan({
                plan: toOneStepApiQueryPlan({ payload, limit: 1, description }),
                connector: { describe: () => description, execute },
                usage: noUsage,
                // A day passes between starting the plan and its call
                now: vi.fn().mockReturnValueOnce(0).mockReturnValue(86_400_000),
            });
            expect(execute).toHaveBeenCalledTimes(1);
        });

        it('compiles with no plan, so its results cache key is unchanged', () => {
            const explore = buildExplore(apiSource);
            const metricId = getItemId(
                Object.values(explore.tables[explore.baseTable].metrics)[0],
            );
            const compiled = compileApiSourceMetricQuery({
                explore,
                metricQuery: {
                    exploreName: explore.name,
                    dimensions: [],
                    metrics: [metricId],
                    filters: {},
                    sorts: [],
                    limit: 10,
                    tableCalculations: [],
                },
                timezone: 'UTC',
                now: new Date('2026-11-04T12:00:00Z'),
            });
            expect(compiled).not.toHaveProperty('plan');
        });
    },
);

/**
 * A records API like an L1 or L2 source: deals come in pages, and their
 * owners' names need a second call per batch of owner ids.
 */
const DEALS = Array.from({ length: 7 }, (_, index) => ({
    deal_id: `d${index}`,
    owner_id: index === 6 ? null : `o${index % 3}`,
    amount: (index + 1) * 10,
}));
const OWNERS: Record<string, string> = { o0: 'Ada', o1: 'Grace' };

const FAKE_DESCRIPTION: ApiConnectorDescription = {
    connector: ApiConnectorType.POSTHOG,
    label: 'Records',
    level: 2,
    queryLanguage: 'fake',
    maxRows: 100,
    timeoutMs: 1000,
    limits: {
        concurrentCalls: 1,
        callsPerMinute: 100,
        callsPerHour: 1000,
        callsPerQuery: 10,
    },
    capabilities: describeShipped(SHIPPED[0]).capabilities,
};

const fakeConnector = () => {
    const calls: ApiConnectorFetchArgs[] = [];
    const connector: ApiConnector = {
        describe: () => FAKE_DESCRIPTION,
        execute: vi.fn(),
        fetchRows: async (args) => {
            calls.push(args);
            if (args.request === 'owners') {
                return {
                    rows: (args.keys ?? []).flatMap((key) =>
                        OWNERS[key]
                            ? [{ owner_id: key, owner_name: OWNERS[key] }]
                            : [],
                    ),
                };
            }
            const start = Number(args.cursor ?? 0);
            const end = Math.min(start + args.limit, DEALS.length);
            return {
                rows: DEALS.slice(start, end),
                nextCursor: end < DEALS.length ? String(end) : undefined,
            };
        },
    };
    return { connector, calls };
};

const plan = (overrides: Partial<ApiQueryPlan> = {}): ApiQueryPlan => ({
    steps: [
        {
            id: 'deals',
            kind: 'scan',
            request: 'deals',
            columns: [
                { name: 'deal_id', type: DimensionType.STRING },
                { name: 'owner_id', type: DimensionType.STRING },
                { name: 'amount', type: DimensionType.NUMBER },
            ],
            requestedRows: 50,
            maxRows: 100,
            pageSize: 3,
            maxCalls: 4,
        },
        {
            id: 'owners',
            kind: 'lookup',
            from: 'deals',
            keyColumn: 'owner_id',
            request: 'owners',
            batchSize: 2,
            maxCalls: 2,
            columns: [{ name: 'owner_name', type: DimensionType.STRING }],
        },
    ],
    budget: { calls: 10, bytes: 1_000_000, ms: 60_000 },
    ...overrides,
});

describe('a multi-call plan', () => {
    it('pages through records, then looks up their owners in batches', async () => {
        const { connector, calls } = fakeConnector();

        const result = await runApiQueryPlan({
            plan: plan(),
            connector,
            usage: noUsage,
        });

        expect(
            calls.map(({ request, cursor, keys }) => ({
                request,
                cursor,
                keys,
            })),
        ).toEqual([
            { request: 'deals', cursor: undefined, keys: undefined },
            { request: 'deals', cursor: '3', keys: undefined },
            { request: 'deals', cursor: '6', keys: undefined },
            { request: 'owners', cursor: undefined, keys: ['o0', 'o1'] },
            { request: 'owners', cursor: undefined, keys: ['o2'] },
        ]);
        expect(result.columns.map(({ name }) => name)).toEqual([
            'deal_id',
            'owner_id',
            'amount',
            'owner_name',
        ]);
        expect(result.rows.map((row) => [row.deal_id, row.owner_name])).toEqual(
            [
                ['d0', 'Ada'],
                ['d1', 'Grace'],
                // Ids the lookup doesn't find, and rows without one, keep null
                ['d2', null],
                ['d3', 'Ada'],
                ['d4', 'Grace'],
                ['d5', null],
                ['d6', null],
            ],
        );
        expect(result.hasMoreRows).toBe(false);
    });

    it('refuses before any call when it could make more calls than one query may', async () => {
        const { connector, calls } = fakeConnector();

        await expect(
            runApiQueryPlan({
                plan: plan({
                    budget: { calls: 5, bytes: 1_000_000, ms: 60_000 },
                }),
                connector,
                usage: noUsage,
            }),
        ).rejects.toMatchObject({
            message:
                'This query can need up to 6 Records API calls, more than the 5 one query may make. Narrow it with filters or a shorter time range.',
            data: { liveSourceErrorCode: 'live_source.refused.call_budget' },
        });
        expect(calls).toHaveLength(0);
    });

    it("refuses within the connector's own per-query limit too", async () => {
        const { connector, calls } = fakeConnector();
        const tight = {
            ...FAKE_DESCRIPTION,
            limits: { ...FAKE_DESCRIPTION.limits, callsPerQuery: 4 },
        };

        await expect(
            runApiQueryPlan({
                plan: plan(),
                connector: { ...connector, describe: () => tight },
                usage: noUsage,
            }),
        ).rejects.toThrow('more than the 4 one query may make');
        expect(calls).toHaveLength(0);
    });

    it('fails a lookup with more ids than its calls can cover, before looking any up', async () => {
        const { connector, calls } = fakeConnector();
        const [scan, lookup] = plan().steps;

        const error = await runApiQueryPlan({
            plan: plan({ steps: [scan, { ...lookup, maxCalls: 1 }] }),
            connector,
            usage: noUsage,
        }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ParameterError);
        expect(error).toMatchObject({
            message:
                'This query needs more than 1 Records API calls to look up 3 ids. Narrow it with filters or a shorter time range.',
        });
        // The scan already called the API, so it isn't a refusal
        expect((error as ParameterError).data).toEqual({});
        expect(
            calls.filter(({ request }) => request === 'owners'),
        ).toHaveLength(0);
    });

    describe('lookup answers', () => {
        const run = (
            fetchOwners: (args: ApiConnectorFetchArgs) => Promise<{
                rows: Record<string, unknown>[];
                nextCursor?: string;
            }>,
            steps = plan().steps,
        ) => {
            const { connector } = fakeConnector();
            return runApiQueryPlan({
                plan: plan({ steps }),
                connector: {
                    ...connector,
                    fetchRows: (args) =>
                        args.request === 'owners'
                            ? fetchOwners(args)
                            : connector.fetchRows!(args),
                },
                usage: noUsage,
            });
        };

        it('matches a numeric id to its string form', async () => {
            const [scan, lookup] = plan().steps;
            const numeric = await runApiQueryPlan({
                plan: plan({ steps: [scan, lookup] }),
                connector: {
                    describe: () => FAKE_DESCRIPTION,
                    execute: vi.fn(),
                    fetchRows: async (args) =>
                        args.request === 'owners'
                            ? { rows: [{ owner_id: 7, owner_name: 'Seven' }] }
                            : {
                                  rows: [
                                      {
                                          deal_id: 'd',
                                          owner_id: '7',
                                          amount: 1,
                                      },
                                  ],
                              },
                },
                usage: noUsage,
            });
            expect(numeric.rows).toEqual([
                { deal_id: 'd', owner_id: '7', amount: 1, owner_name: 'Seven' },
            ]);
        });

        it('fails when a batch comes back in more than one page', async () => {
            await expect(
                run(async () => ({ rows: [], nextCursor: 'next' })),
            ).rejects.toThrow('with more than one page');
        });

        it('fails when an id comes back twice', async () => {
            await expect(
                run(async () => ({
                    rows: [
                        { owner_id: 'o0', owner_name: 'Ada' },
                        { owner_id: 'o0', owner_name: 'Ada L.' },
                    ],
                })),
            ).rejects.toThrow('two rows for one id');
        });

        it("fails on an id that isn't a string or number", async () => {
            await expect(
                run(async () => ({
                    rows: [{ owner_id: { id: 'o0' }, owner_name: 'Ada' }],
                })),
            ).rejects.toThrow("isn't a string or number");
        });

        it('fails when it adds a column the earlier step has', async () => {
            const [scan, lookup] = plan().steps;
            await expect(
                run(
                    async () => ({ rows: [] }),
                    [
                        scan,
                        {
                            ...lookup,
                            columns: [
                                { name: 'amount', type: DimensionType.NUMBER },
                            ],
                        } as typeof lookup,
                    ],
                ),
            ).rejects.toThrow('adds a column "deals" already has');
        });
    });

    it('refuses records past what its pages can read', async () => {
        const { connector } = fakeConnector();
        const [scan, lookup] = plan().steps;

        await expect(
            runApiQueryPlan({
                plan: plan({ steps: [{ ...scan, maxCalls: 2 }, lookup] }),
                connector,
                usage: noUsage,
            }),
        ).rejects.toThrow('This Records query has more than 100 rows');
    });

    it('stops before the next call once its bytes are spent', async () => {
        const { connector, calls } = fakeConnector();
        let bytes = 0;
        const counting: ApiConnector = {
            ...connector,
            fetchRows: async (args) => {
                bytes += 600;
                return connector.fetchRows!(args);
            },
        };

        await expect(
            runApiQueryPlan({
                plan: plan({ budget: { calls: 10, bytes: 1000, ms: 60_000 } }),
                connector: counting,
                usage: () => ({ responseBytes: bytes }),
            }),
        ).rejects.toThrow(ParameterError);
        expect(calls).toHaveLength(2);
    });

    it('stops before the next call once its time is spent', async () => {
        const { connector, calls } = fakeConnector();
        let clock = 0;
        const slow: ApiConnector = {
            ...connector,
            fetchRows: async (args) => {
                clock += 40_000;
                return connector.fetchRows!(args);
            },
        };

        await expect(
            runApiQueryPlan({
                plan: plan(),
                connector: slow,
                usage: noUsage,
                now: () => clock,
            }),
        ).rejects.toThrow(TimeoutError);
        expect(calls).toHaveLength(2);
    });

    it('fails the whole query when one step fails', async () => {
        const { connector } = fakeConnector();
        const failing: ApiConnector = {
            ...connector,
            fetchRows: async (args) => {
                if (args.request === 'owners') {
                    throw new TimeoutError('Owners timed out');
                }
                return connector.fetchRows!(args);
            },
        };

        await expect(
            runApiQueryPlan({
                plan: plan(),
                connector: failing,
                usage: noUsage,
            }),
        ).rejects.toThrow('Owners timed out');
    });

    it('rejects a step that reads a step after it', async () => {
        const { connector, calls } = fakeConnector();
        const [scan, lookup] = plan().steps;

        await expect(
            runApiQueryPlan({
                plan: plan({ steps: [lookup, scan] }),
                connector,
                usage: noUsage,
            }),
        ).rejects.toThrow('reads "deals", which doesn\'t run before it');
        expect(calls).toHaveLength(0);
    });
});
