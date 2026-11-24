import {
    ApiConnectorType,
    DimensionType,
    GOOGLE_PLAY_SCOPE,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { googlePlayIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpRequest, type LiveHttpResponse } from '../../types';
import { GOOGLE_PLAY_MAX_QUERY_ROWS } from './run';

const SETTINGS = {
    connector: ApiConnectorType.GOOGLE_PLAY,
    packageName: 'com.example.app',
} as const;
const CRASH_PATH = '/v1beta1/apps/com.example.app/crashRateMetricSet';
const CRASH_METRICS = [
    'crashRate28dUserWeighted',
    'crashRate7dUserWeighted',
    'crashRate',
    'userPerceivedCrashRate28dUserWeighted',
    'userPerceivedCrashRate7dUserWeighted',
    'userPerceivedCrashRate',
    'distinctUsers',
];

const ok = (body: unknown): LiveHttpResponse => ({
    status: 200,
    headers: {},
    body,
});

const failure = (
    status: number,
    error: Record<string, unknown>,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body: { error } });

const pacific = (year: number, month: number, day: number) => ({
    year,
    month,
    day,
    timeZone: { id: 'America/Los_Angeles' },
});

const freshness = (daily: { month: number; day: number } | null) => ({
    name: 'apps/com.example.app/crashRateMetricSet',
    freshnessInfo: {
        freshnesses: [
            {
                aggregationPeriod: 'HOURLY',
                latestEndTime: {
                    year: 2026,
                    month: 11,
                    day: 24,
                    hours: 8,
                    timeZone: { id: 'UTC' },
                },
            },
            ...(daily
                ? [
                      {
                          aggregationPeriod: 'DAILY',
                          latestEndTime: pacific(2026, daily.month, daily.day),
                      },
                  ]
                : []),
        ],
    },
});

const FRESH = freshness({ month: 11, day: 23 });

const row = (
    day: number,
    dimensions: Record<string, unknown>[],
    metrics: Record<string, string>,
) => ({
    aggregationPeriod: 'DAILY',
    startTime: pacific(2026, 11, day),
    dimensions,
    metrics: Object.entries(metrics).map(([metric, value]) => ({
        metric,
        decimalValue: { value },
    })),
});

const connect = (...responses: LiveHttpResponse[]) => {
    const send =
        vi.fn<(request: LiveHttpRequest) => Promise<LiveHttpResponse>>();
    responses.forEach((response) => send.mockResolvedValueOnce(response));
    return {
        send,
        source: connectLiveSource(googlePlayIntegration, SETTINGS, send),
    };
};

const query = (request: Record<string, unknown>, limit = 100) => ({
    query: JSON.stringify({
        metricSet: 'crashRateMetricSet',
        startDate: '2026-11-01',
        endDate: '2026-11-23',
        ...request,
    }),
    limit,
});

describe('googlePlayIntegration run', () => {
    test('reads freshness, then queries by day with every metric of the set', async () => {
        const { source, send } = connect(
            ok(FRESH),
            ok({
                rows: [
                    row(
                        21,
                        [
                            { dimension: 'versionCode', stringValue: '1308' },
                            { dimension: 'apiLevel', int64Value: '34' },
                        ],
                        { crashRate: '0.0123', distinctUsers: '10' },
                    ),
                ],
            }),
        );

        const result = await source.run(
            query({
                dimensions: ['date', 'versionCode', 'apiLevel'],
                filter: '(versionCode = "1308")',
            }),
        );

        expect(send).toHaveBeenNthCalledWith(1, {
            method: 'GET',
            path: CRASH_PATH,
            body: undefined,
        });
        expect(send).toHaveBeenNthCalledWith(2, {
            method: 'POST',
            path: `${CRASH_PATH}:query`,
            body: {
                timelineSpec: {
                    aggregationPeriod: 'DAILY',
                    startTime: pacific(2026, 11, 1),
                    endTime: pacific(2026, 11, 23),
                },
                dimensions: ['versionCode', 'apiLevel'],
                metrics: CRASH_METRICS,
                filter: '(versionCode = "1308")',
                pageSize: 101,
            },
        });
        expect(result.columns).toEqual([
            { name: 'date', type: DimensionType.DATE },
            { name: 'versionCode', type: DimensionType.NUMBER },
            { name: 'apiLevel', type: DimensionType.STRING },
            ...CRASH_METRICS.map((name) => ({
                name,
                type: DimensionType.NUMBER,
            })),
        ]);
        expect(result.rows).toEqual([
            {
                date: '2026-11-21',
                versionCode: 1308,
                apiLevel: '34',
                crashRate28dUserWeighted: null,
                crashRate7dUserWeighted: null,
                crashRate: 0.0123,
                userPerceivedCrashRate28dUserWeighted: null,
                userPerceivedCrashRate7dUserWeighted: null,
                userPerceivedCrashRate: null,
                distinctUsers: 10,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    test('reads only the latest day with data without a date', async () => {
        const { source, send } = connect(
            ok(FRESH),
            ok({
                rows: [
                    row(
                        22,
                        [
                            {
                                dimension: 'deviceModel',
                                stringValue: 'google/coral',
                            },
                        ],
                        {
                            crashRate28dUserWeighted: '0.004',
                        },
                    ),
                ],
            }),
        );

        const result = await source.run(
            query({ dimensions: ['deviceModel'], endDate: '2026-11-30' }),
        );

        expect(send.mock.calls[1][0].body).toMatchObject({
            timelineSpec: {
                startTime: pacific(2026, 11, 22),
                endTime: pacific(2026, 11, 23),
            },
            dimensions: ['deviceModel'],
        });
        expect(result.rows).toEqual([
            expect.objectContaining({
                deviceModel: 'google/coral',
                crashRate28dUserWeighted: 0.004,
                crashRate: null,
            }),
        ]);
        expect(result.rows[0]).not.toHaveProperty('date');
    });

    test('ends a range that runs past the freshness at the freshness', async () => {
        const { source, send } = connect(ok(FRESH), ok({}));
        const result = await source.run(
            query({ dimensions: ['date'], endDate: '2026-11-30' }),
        );
        expect(send.mock.calls[1][0].body).toMatchObject({
            timelineSpec: {
                startTime: pacific(2026, 11, 1),
                endTime: pacific(2026, 11, 23),
            },
        });
        expect(result.rows).toEqual([]);
    });

    test('returns no rows without querying when the range is all after the freshness', async () => {
        const { source, send } = connect(ok(FRESH));
        const byDay = await source.run(
            query({
                dimensions: ['date'],
                startDate: '2026-11-23',
                endDate: '2026-11-24',
            }),
        );
        expect(byDay.rows).toEqual([]);
        expect(byDay.hasMoreRows).toBe(false);
        expect(send).toHaveBeenCalledTimes(1);

        const latest = connect(ok(FRESH));
        await expect(
            latest.source.run(
                query({ startDate: '2026-11-23', endDate: '2026-11-24' }),
            ),
        ).resolves.toMatchObject({ rows: [] });
        expect(latest.send).toHaveBeenCalledTimes(1);
    });

    test('returns no rows when the metric set has no daily data yet', async () => {
        const { source, send } = connect(ok(freshness(null)));
        const result = await source.run(query({ dimensions: ['date'] }));
        expect(result.rows).toEqual([]);
        expect(result.columns[0]).toEqual({
            name: 'date',
            type: DimensionType.DATE,
        });
        expect(send).toHaveBeenCalledTimes(1);
    });

    test('ignores the hours on a daily freshness', async () => {
        const { source, send } = connect(
            ok({
                name: 'apps/com.example.app/errorCountMetricSet',
                freshnessInfo: {
                    freshnesses: [
                        {
                            aggregationPeriod: 'DAILY',
                            latestEndTime: {
                                ...pacific(2026, 11, 23),
                                hours: 1,
                            },
                        },
                    ],
                },
            }),
            ok({}),
        );
        await source.run(
            query({
                metricSet: 'errorCountMetricSet',
                dimensions: ['date', 'reportType'],
                endDate: '2026-11-30',
            }),
        );
        expect(send.mock.calls[1][0].body).toMatchObject({
            timelineSpec: { endTime: pacific(2026, 11, 23) },
            dimensions: ['reportType'],
            metrics: ['errorReportCount', 'distinctUsers'],
        });
    });

    test('always sends and returns the start type of slow starts', async () => {
        const { source, send } = connect(
            ok(FRESH),
            ok({
                rows: [
                    row(5, [{ dimension: 'startType', stringValue: 'COLD' }], {
                        slowStartRate: '0.1',
                    }),
                ],
            }),
        );
        const result = await source.run(
            query({
                metricSet: 'slowStartRateMetricSet',
                dimensions: ['date'],
                filter: '(startType = "COLD")',
            }),
        );
        expect(send.mock.calls[1][0].body).toMatchObject({
            dimensions: ['startType'],
        });
        expect(result.columns.slice(0, 2)).toEqual([
            { name: 'date', type: DimensionType.DATE },
            { name: 'startType', type: DimensionType.STRING },
        ]);
        expect(result.rows[0]).toMatchObject({
            date: '2026-11-05',
            startType: 'COLD',
            slowStartRate: 0.1,
        });
    });

    test('reads missing dimension and metric values as null', async () => {
        const { source } = connect(
            ok(FRESH),
            ok({
                rows: [
                    {
                        startTime: pacific(2026, 11, 2),
                        dimensions: [{ dimension: 'versionCode' }],
                        metrics: [{ metric: 'crashRate' }],
                    },
                ],
            }),
        );
        const result = await source.run(
            query({ dimensions: ['date', 'versionCode', 'countryCode'] }),
        );
        expect(result.rows[0]).toMatchObject({
            versionCode: null,
            countryCode: null,
            crashRate: null,
        });
    });

    test('pages with nextPageToken, repeating the first call', async () => {
        const page = (day: number) =>
            row(day, [], { crashRate: String(day / 1000) });
        const { source, send } = connect(
            ok(FRESH),
            ok({ rows: [page(1), page(2)], nextPageToken: 'CgIIAg==' }),
            ok({ rows: [page(3)] }),
        );
        const result = await source.run(query({ dimensions: ['date'] }));

        const [, first, second] = send.mock.calls.map(([request]) => request);
        expect(second.body).toEqual({
            ...(first.body as object),
            pageToken: 'CgIIAg==',
        });
        expect(result.rows.map(({ date }) => date)).toEqual([
            '2026-11-01',
            '2026-11-02',
            '2026-11-03',
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    test('says when there are more rows than the limit', async () => {
        const { source } = connect(
            ok(FRESH),
            ok({
                rows: [1, 2, 3].map((day) => row(day, [], {})),
                nextPageToken: 'next',
            }),
        );
        const result = await source.run(query({ dimensions: ['date'] }, 2));
        expect(result.rows).toHaveLength(2);
        expect(result.hasMoreRows).toBe(true);
    });

    test('refuses a limit past the most one query can read', async () => {
        const { source, send } = connect(ok(FRESH));
        await expect(
            source.run(
                query({ dimensions: ['date'] }, GOOGLE_PLAY_MAX_QUERY_ROWS + 1),
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    test('refuses a query whose rows run past the pages it may read', async () => {
        const short = ok({ rows: [row(1, [], {})], nextPageToken: 'more' });
        const { source } = connect(
            ok(FRESH),
            short,
            short,
            short,
            short,
            short,
        );
        await expect(
            source.run(
                query({ dimensions: ['date'] }, GOOGLE_PLAY_MAX_QUERY_ROWS),
            ),
        ).rejects.toThrow('more than 49,999 rows');
    });

    test('refuses a dimension the metric set lacks before calling', async () => {
        const { source, send } = connect();
        await expect(
            source.run(
                query({
                    metricSet: 'errorCountMetricSet',
                    dimensions: ['countryCode'],
                }),
            ),
        ).rejects.toThrow(
            '"countryCode" isn\'t a dimension of errorCountMetricSet',
        );
        await expect(
            source.run(query({ metrics: ['crashRate'] })),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            source.run(query({ startDate: '2026-11-24' })),
        ).rejects.toThrow('startDate must not be after endDate');
        expect(send).not.toHaveBeenCalled();
    });

    test('says when the response has an unexpected shape', async () => {
        const { source } = connect(ok(FRESH), ok({ rows: 'nope' }));
        await expect(
            source.run(query({ dimensions: ['date'] })),
        ).rejects.toBeInstanceOf(UnexpectedServerError);
    });

    describe('errors', () => {
        const run = (response: LiveHttpResponse) =>
            connect(response).source.run(query({ dimensions: ['date'] }));

        test('400 says the request was rejected', async () => {
            await expect(
                run(
                    failure(400, {
                        code: 400,
                        message:
                            "'timeline_spec.end_date' field should be at most the current freshness 2026-11-23 00:00",
                        status: 'INVALID_ARGUMENT',
                    }),
                ),
            ).rejects.toThrow(
                new WarehouseQueryError(
                    "Google Play rejected the request: 'timeline_spec.end_date' field should be at most the current freshness 2026-11-23 00:00",
                ),
            );
        });

        test('403 explains the service account permission', async () => {
            const run403 = run(
                failure(403, {
                    code: 403,
                    message: 'The caller does not have permission',
                    status: 'PERMISSION_DENIED',
                }),
            );
            await expect(run403).rejects.toBeInstanceOf(
                WarehouseConnectionError,
            );
            await expect(run403).rejects.toThrow(
                "Google denied access to com.example.app: The caller does not have permission. Check that the service account has the 'View app information and download bulk reports' permission in Play Console and that the Google Play Developer Reporting API is enabled in its Google Cloud project.",
            );
        });

        test('403 RESOURCE_EXHAUSTED is a quota error', async () => {
            await expect(
                run(
                    failure(403, {
                        code: 403,
                        message: 'Quota exceeded',
                        status: 'RESOURCE_EXHAUSTED',
                    }),
                ),
            ).rejects.toBeInstanceOf(TooManyRequestsError);
        });

        test('404 says the app was not found', async () => {
            await expect(
                run(
                    failure(404, {
                        code: 404,
                        message: 'Requested entity was not found.',
                        status: 'NOT_FOUND',
                    }),
                ),
            ).rejects.toThrow(
                'Google Play could not find com.example.app: Requested entity was not found.',
            );
        });

        test('429 reads Retry-After', async () => {
            const error = await run(
                failure(
                    429,
                    { code: 429, status: 'RESOURCE_EXHAUSTED' },
                    { 'retry-after': '30' },
                ),
            ).catch((caught: unknown) => caught);
            expect(error).toBeInstanceOf(TooManyRequestsError);
            expect(error).toMatchObject({
                data: { retryAfterSeconds: 30 },
            });
        });
    });
});

describe('googlePlayIntegration setup', () => {
    test('summarizes the test with the last day of daily data', () => {
        expect(googlePlayIntegration.summarizeTest?.(FRESH, SETTINGS)).toEqual({
            summary: 'Connected to com.example.app',
            facts: [{ label: 'Daily data through', value: '2026-11-22' }],
        });
        expect(
            googlePlayIntegration.summarizeTest?.(freshness(null), SETTINGS),
        ).toEqual({ summary: 'Connected to com.example.app', facts: [] });
        expect(
            googlePlayIntegration.summarizeTest?.({ rows: [] }, SETTINGS),
        ).toBeNull();
    });

    test('accepts only a service account with the Play scope', () => {
        const check = (type: string, oauthScopes: string[] | null) => () =>
            googlePlayIntegration.checkAuth({
                type: type as 'google_service_account',
                origin: 'https://playdeveloperreporting.googleapis.com',
                oauthScopes,
            });
        expect(
            check('google_service_account', [GOOGLE_PLAY_SCOPE]),
        ).not.toThrow();
        [
            check('google_service_account', null),
            check('google_service_account', []),
            check('google_service_account', [
                GOOGLE_PLAY_SCOPE,
                'https://www.googleapis.com/auth/cloud-platform',
            ]),
            check('google_service_account', [
                'https://www.googleapis.com/auth/androidpublisher',
            ]),
            check('oauth_authorization_code', [GOOGLE_PLAY_SCOPE]),
            check('bearer_token', [GOOGLE_PLAY_SCOPE]),
        ].forEach((fn) => {
            expect(fn).toThrow(
                'Google Play connections authenticate with a Google service account key and the playdeveloperreporting scope',
            );
        });
    });

    test('validates the package name', () => {
        ['com.example.app', 'com.Example_1.app2'].forEach((packageName) => {
            expect(() =>
                googlePlayIntegration.validate({ ...SETTINGS, packageName }),
            ).not.toThrow();
        });
        ['example', '1com.example', 'com..app', 'com.example/app', ''].forEach(
            (packageName) => {
                expect(() =>
                    googlePlayIntegration.validate({
                        ...SETTINGS,
                        packageName,
                    }),
                ).toThrow(
                    'The Google Play package name must look like com.example.app',
                );
            },
        );
    });

    test('reaches only its own app', () => {
        expect(googlePlayIntegration.access(SETTINGS)).toEqual({
            pathPrefixes: ['/v1beta1/apps/com.example.app/'],
            methods: ['GET', 'POST'],
        });
        expect(
            googlePlayIntegration.describeTarget({
                settings: SETTINGS,
                origin: 'https://playdeveloperreporting.googleapis.com',
                targetLabel: null,
            }),
        ).toBe('Google Play app com.example.app');
    });
});
