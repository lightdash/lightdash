import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { amplitudeIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpRequest, type LiveHttpResponse } from '../../types';
import { toRetentionCohortDate } from './run';

const jsonResponse = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const connect = (...responses: LiveHttpResponse[]) => {
    const send = vi.fn();
    responses.forEach((response) => send.mockResolvedValueOnce(response));
    return {
        send,
        source: connectLiveSource(
            amplitudeIntegration,
            { connector: ApiConnectorType.AMPLITUDE },
            send,
        ),
    };
};

const RANGE = { start: '2026-10-01', end: '2026-10-03' };

/** The query parameters of the nth call, repeated keys kept in order. */
const paramsOf = (send: ReturnType<typeof vi.fn>, call = 0) => {
    const request = send.mock.calls[call][0] as LiveHttpRequest;
    return [...new URLSearchParams(request.rawQuery).entries()];
};

describe('amplitudeIntegration run', () => {
    it('reads event segmentation per event and metric, merging rows by date and group', async () => {
        const series = (values: number[][]) =>
            jsonResponse({
                data: {
                    series: values,
                    seriesLabels: ['United States', 'Spain'],
                    seriesCollapsed: values.map((v) => [
                        { value: v.reduce((a, b) => a + b, 0) },
                    ]),
                    xValues: ['2026-10-01', '2026-10-02'],
                },
            });
        const { send, source } = connect(
            series([
                [10, 20],
                [1, 2],
            ]),
            series([
                [5, 8],
                [1, 1],
            ]),
        );

        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'segmentation',
                ...RANGE,
                segments: [{ prop: 'platform', op: 'is', values: ['iOS'] }],
                interval: 1,
                events: ['Purchase'],
                metrics: ['totals', 'uniques'],
                groupBy: 'country',
            }),
            limit: 100,
        });

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[0][0]).toMatchObject({
            method: 'GET',
            path: '/api/2/events/segmentation',
        });
        expect(paramsOf(send)).toEqual([
            [
                'e',
                '{"event_type":"Purchase","group_by":[{"type":"user","value":"country"}]}',
            ],
            ['m', 'totals'],
            ['start', '20261001'],
            ['end', '20261003'],
            ['s', '[{"prop":"platform","op":"is","values":["iOS"]}]'],
            ['i', '1'],
            ['limit', '1000'],
        ]);
        expect(result.rows).toEqual([
            {
                date: '2026-10-01',
                event_type: 'Purchase',
                country: 'United States',
                event_count: 10,
                unique_users: 5,
            },
            {
                date: '2026-10-02',
                event_type: 'Purchase',
                country: 'United States',
                event_count: 20,
                unique_users: 8,
            },
            {
                date: '2026-10-01',
                event_type: 'Purchase',
                country: 'Spain',
                event_count: 1,
                unique_users: 1,
            },
            {
                date: '2026-10-02',
                event_type: 'Purchase',
                country: 'Spain',
                event_count: 2,
                unique_users: 1,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it("uses Amplitude's collapsed value for a whole-range total", async () => {
        const { source } = connect(
            jsonResponse({
                data: {
                    series: [[3, 4]],
                    seriesLabels: [[0, 'Sign Up']],
                    seriesCollapsed: [[{ value: 6 }]],
                    xValues: ['2026-10-01', '2026-10-02'],
                },
            }),
        );
        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'segmentation',
                ...RANGE,
                interval: null,
                events: ['Sign Up'],
                metrics: ['uniques'],
                groupBy: null,
            }),
            limit: 100,
        });
        // Uniques over the range, not the sum of the days
        expect(result.rows).toEqual([
            { event_type: 'Sign Up', unique_users: 6 },
        ]);
    });

    it('reads active users grouped by the labels in seriesMeta', async () => {
        const { send, source } = connect(
            jsonResponse({
                data: {
                    series: [[100], [40]],
                    seriesMeta: ['iOS', 'Android'],
                    xValues: ['2026-10-01'],
                },
            }),
        );
        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'users',
                ...RANGE,
                interval: 30,
                metrics: ['active'],
                groupBy: 'platform',
            }),
            limit: 100,
        });
        expect(paramsOf(send)).toContainEqual(['g', 'platform']);
        expect(result.rows).toEqual([
            { month: '2026-10-01', platform: 'iOS', active_users: 100 },
            { month: '2026-10-01', platform: 'Android', active_users: 40 },
        ]);
    });

    it('sends each funnel step as its own e parameter and reads one row per step', async () => {
        const { send, source } = connect(
            jsonResponse({
                data: [
                    {
                        events: ['Sign Up', 'Purchase'],
                        cumulativeRaw: [200, 50],
                        cumulative: [1, 0.25],
                        stepByStep: [1, 0.25],
                        avgTransTimes: [0, 3_600_000],
                    },
                ],
            }),
        );
        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'funnel',
                ...RANGE,
                steps: ['Sign Up', 'Purchase'],
                conversionWindowDays: 7,
            }),
            limit: 100,
        });
        expect(paramsOf(send)).toEqual([
            ['e', '{"event_type":"Sign Up"}'],
            ['e', '{"event_type":"Purchase"}'],
            ['start', '20261001'],
            ['end', '20261003'],
            ['mode', 'ordered'],
            ['n', 'active'],
            ['cs', '604800'],
        ]);
        expect(result.rows).toEqual([
            {
                step_number: 1,
                step_event: 'Sign Up',
                users: 200,
                conversion_rate: 1,
                step_conversion_rate: 1,
                average_time_to_convert_seconds: null,
            },
            {
                step_number: 2,
                step_event: 'Purchase',
                users: 50,
                conversion_rate: 0.25,
                step_conversion_rate: 0.25,
                average_time_to_convert_seconds: 3_600,
            },
        ]);
    });

    it('reads retention cohorts, skipping the cohort size at index 0', async () => {
        const entries = (counts: number[], outof: number) =>
            counts.map((count) => ({ count, outof, incomplete: false }));
        const { source } = connect(
            jsonResponse({
                data: {
                    series: [
                        {
                            dates: ['Oct 2', 'Oct 1'],
                            values: {
                                'Oct 2': entries([50, 50, 10], 50),
                                'Oct 1': entries([40, 40, 20], 40),
                            },
                            combined: entries([90, 90, 30], 90),
                        },
                    ],
                    seriesMeta: [{ segmentIndex: 0, eventIndex: 0 }],
                },
            }),
        );
        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'retention',
                ...RANGE,
                interval: 1,
                startEvent: '_new',
                returnEvent: '_active',
                byCohort: true,
            }),
            limit: 100,
        });
        expect(result.rows).toEqual([
            {
                date: '2026-10-01',
                period: 0,
                retained_users: 40,
                cohort_users: 40,
                retention_rate: 1,
            },
            {
                date: '2026-10-01',
                period: 1,
                retained_users: 20,
                cohort_users: 40,
                retention_rate: 0.5,
            },
            {
                date: '2026-10-02',
                period: 0,
                retained_users: 50,
                cohort_users: 50,
                retention_rate: 1,
            },
            {
                date: '2026-10-02',
                period: 1,
                retained_users: 10,
                cohort_users: 50,
                retention_rate: 0.2,
            },
        ]);
    });

    it('reads both session reports into one row per day', async () => {
        const { send, source } = connect(
            jsonResponse({
                data: {
                    series: [[300, 240]],
                    xValues: ['2026-10-01', '2026-10-02'],
                },
            }),
            jsonResponse({
                data: {
                    series: [[1.5, 2]],
                    xValues: ['2026-10-01', '2026-10-02'],
                },
            }),
        );
        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'sessions',
                ...RANGE,
                metrics: ['average', 'peruser'],
            }),
            limit: 100,
        });
        expect(send.mock.calls.map(([request]) => request.path)).toEqual([
            '/api/2/sessions/average',
            '/api/2/sessions/peruser',
        ]);
        expect(result.rows).toEqual([
            {
                date: '2026-10-01',
                average_session_length_seconds: 300,
                sessions_per_user: 1.5,
            },
            {
                date: '2026-10-02',
                average_session_length_seconds: 240,
                sessions_per_user: 2,
            },
        ]);
    });

    it('keeps rows within the limit and says there were more', async () => {
        const { source } = connect(
            jsonResponse({
                data: {
                    series: [[1, 2, 3]],
                    xValues: ['2026-10-01', '2026-10-02', '2026-10-03'],
                },
            }),
        );
        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'sessions',
                ...RANGE,
                metrics: ['average'],
            }),
            limit: 2,
        });
        expect(result.rows).toHaveLength(2);
        expect(result.hasMoreRows).toBe(true);
    });

    it('says there were more rows when grouping reaches the group limit', async () => {
        const labels = Array.from({ length: 1000 }, (_, i) => `City ${i}`);
        const { source } = connect(
            jsonResponse({
                data: {
                    series: labels.map(() => [1]),
                    seriesLabels: labels,
                    seriesCollapsed: labels.map(() => [{ value: 1 }]),
                    xValues: ['2026-10-01'],
                },
            }),
        );
        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'segmentation',
                ...RANGE,
                interval: null,
                events: ['_all'],
                metrics: ['totals'],
                groupBy: 'city',
            }),
            limit: 5000,
        });
        expect(result.rows).toHaveLength(1000);
        expect(result.rows[0]).toMatchObject({ event_type: 'All events' });
        expect(result.hasMoreRows).toBe(true);
    });

    it('refuses a group without a label instead of merging it', async () => {
        const { source } = connect(
            jsonResponse({
                data: {
                    series: [[1], [2]],
                    seriesLabels: ['Spain', {}],
                    seriesCollapsed: [[{ value: 1 }], [{ value: 2 }]],
                    xValues: ['2026-10-01'],
                },
            }),
        );
        await expect(
            source.run({
                query: JSON.stringify({
                    endpoint: 'segmentation',
                    ...RANGE,
                    interval: null,
                    events: ['Purchase'],
                    metrics: ['totals'],
                    groupBy: 'country',
                }),
                limit: 10,
            }),
        ).rejects.toThrow(/without a country label/);
    });

    it('refuses a malformed request before calling', async () => {
        const { send, source } = connect();
        await expect(
            source.run({
                query: JSON.stringify({
                    endpoint: 'funnel',
                    ...RANGE,
                    steps: ['Only one'],
                    conversionWindowDays: 30,
                }),
                limit: 10,
            }),
        ).rejects.toThrow(/at least two steps/);
        await expect(
            source.run({
                query: JSON.stringify({
                    endpoint: 'sessions',
                    start: '2026-10-05',
                    end: '2026-10-01',
                    metrics: ['average'],
                }),
                limit: 10,
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            source.run({
                query: JSON.stringify({
                    endpoint: 'segmentation',
                    ...RANGE,
                    interval: 1,
                    events: ['A', 'B', 'C', 'D', 'E', 'F'],
                    metrics: ['totals', 'uniques', 'average', 'pct_dau'],
                    groupBy: null,
                }),
                limit: 10,
            }),
        ).rejects.toThrow(/events × metrics/);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses an unexpected response shape', async () => {
        const { source } = connect(jsonResponse({ data: { rows: [] } }));
        await expect(
            source.run({
                query: JSON.stringify({
                    endpoint: 'sessions',
                    ...RANGE,
                    metrics: ['average'],
                }),
                limit: 10,
            }),
        ).rejects.toThrow();
    });

    it.each([
        [
            401,
            'Invalid credentials',
            WarehouseConnectionError,
            /API key and secret key/,
        ],
        [403, 'Forbidden', WarehouseConnectionError, /data region/],
        [
            400,
            'Invalid e parameter',
            WarehouseQueryError,
            /rejected the request: Invalid e parameter/,
        ],
        [500, '<html>oops</html>', UnexpectedServerError, /returned 500\.$/],
    ])('explains a %i response', async (status, body, ErrorType, message) => {
        const { source } = connect(jsonResponse(body, status));
        const run = source.run({
            query: JSON.stringify({
                endpoint: 'sessions',
                ...RANGE,
                metrics: ['average'],
            }),
            limit: 10,
        });
        await expect(run).rejects.toBeInstanceOf(ErrorType);
        await expect(run).rejects.toThrow(message);
    });

    it('passes on how long to wait after a 429', async () => {
        const { source } = connect(
            jsonResponse({ error: 'Too many requests' }, 429, {
                'retry-after': '30',
            }),
        );
        const run = source.run({
            query: JSON.stringify({
                endpoint: 'sessions',
                ...RANGE,
                metrics: ['average'],
            }),
            limit: 10,
        });
        await expect(run).rejects.toBeInstanceOf(TooManyRequestsError);
        await expect(run).rejects.toThrow(/retry in 30 seconds/);
    });
});

describe('toRetentionCohortDate', () => {
    it('picks the year that puts the cohort in the range', () => {
        expect(
            toRetentionCohortDate('Dec 30', '2026-12-15', '2027-01-10'),
        ).toBe('2026-12-30');
        expect(toRetentionCohortDate('Jan 4', '2026-12-15', '2027-01-10')).toBe(
            '2027-01-04',
        );
        expect(
            toRetentionCohortDate('2026-10-01', '2026-10-01', '2026-10-31'),
        ).toBe('2026-10-01');
        expect(
            toRetentionCohortDate('Week 4', '2026-10-01', '2026-10-31'),
        ).toBe(null);
    });
});
