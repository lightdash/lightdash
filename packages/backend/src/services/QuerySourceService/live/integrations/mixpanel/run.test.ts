import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { mixpanelIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpRequest, type LiveHttpResponse } from '../../types';
import { getRetentionPeriods, toWhereExpression } from './run';

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
            mixpanelIntegration,
            { connector: ApiConnectorType.MIXPANEL, projectId: '12345' },
            send,
        ),
    };
};

const RANGE = { start: '2026-10-01', end: '2026-10-03' };

const requestOf = (send: ReturnType<typeof vi.fn>, call = 0) =>
    send.mock.calls[call][0] as LiveHttpRequest;

const segmentation = (values: Record<string, Record<string, number>>) =>
    jsonResponse({
        data: {
            series: ['2026-10-01', '2026-10-02', '2026-10-03'],
            values,
        },
        legend_size: Object.keys(values).length,
    });

const SEGMENTATION = {
    endpoint: 'segmentation',
    ...RANGE,
    unit: 'day',
    events: ['Purchase'],
    metrics: ['general'],
    groupBy: null,
    filters: [],
};

describe('mixpanelIntegration run', () => {
    it('reads segmentation per event and metric, merging rows by date and property value', async () => {
        const { send, source } = connect(
            segmentation({
                US: { '2026-10-01': 10, '2026-10-02': 20 },
                ES: { '2026-10-01': 1 },
            }),
            segmentation({
                US: { '2026-10-01': 5, '2026-10-02': 8 },
                ES: { '2026-10-01': 1 },
            }),
        );

        const result = await source.run({
            query: JSON.stringify({
                ...SEGMENTATION,
                metrics: ['general', 'unique'],
                groupBy: 'country',
                filters: [{ property: 'os', op: 'is', values: ['iOS'] }],
            }),
            limit: 100,
        });

        expect(send).toHaveBeenCalledTimes(2);
        expect(requestOf(send)).toMatchObject({
            method: 'GET',
            path: '/api/query/segmentation',
            query: {
                project_id: '12345',
                event: 'Purchase',
                from_date: '2026-10-01',
                to_date: '2026-10-03',
                type: 'general',
                unit: 'day',
                where: '(properties["$os"] == "iOS")',
                on: 'properties["mp_country_code"]',
                limit: '1000',
            },
        });
        expect(requestOf(send, 1).query?.type).toBe('unique');
        expect(result.rows).toEqual([
            {
                date: '2026-10-01',
                event: 'Purchase',
                country: 'US',
                event_count: 10,
                unique_users: 5,
            },
            {
                date: '2026-10-02',
                event: 'Purchase',
                country: 'US',
                event_count: 20,
                unique_users: 8,
            },
            {
                date: '2026-10-01',
                event: 'Purchase',
                country: 'ES',
                event_count: 1,
                unique_users: 1,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('adds up totals over the range, and reads uniques as one bucket', async () => {
        const { send, source } = connect(
            segmentation({
                Purchase: { '2026-10-01': 3, '2026-10-02': 4, '2026-10-03': 5 },
            }),
            // As Mixpanel returns it: the bucket on its first day, 0 after
            segmentation({
                Purchase: { '2026-10-01': 7, '2026-10-02': 0, '2026-10-03': 0 },
            }),
        );

        const result = await source.run({
            query: JSON.stringify({
                ...SEGMENTATION,
                unit: null,
                metrics: ['general', 'unique'],
            }),
            limit: 100,
        });

        expect(requestOf(send).query).toMatchObject({ unit: 'day' });
        expect(requestOf(send, 1).query).toMatchObject({ interval: '3' });
        expect(requestOf(send, 1).query).not.toHaveProperty('unit');
        expect(result.rows).toEqual([
            { event: 'Purchase', event_count: 12, unique_users: 7 },
        ]);
    });

    it('refuses uniques Mixpanel split into several periods', async () => {
        const { source } = connect(
            segmentation({ Purchase: { '2026-10-01': 1, '2026-10-02': 2 } }),
        );
        await expect(
            source.run({
                query: JSON.stringify({
                    ...SEGMENTATION,
                    unit: null,
                    metrics: ['unique'],
                }),
                limit: 100,
            }),
        ).rejects.toBeInstanceOf(UnexpectedServerError);
    });

    it('reads events without the property as an empty value', async () => {
        const { source } = connect(
            segmentation({
                undefined: { '2026-10-01': 2 },
                US: { '2026-10-01': 1 },
            }),
        );
        const result = await source.run({
            query: JSON.stringify({ ...SEGMENTATION, groupBy: 'country' }),
            limit: 100,
        });
        expect(result.rows).toEqual([
            {
                date: '2026-10-01',
                event: 'Purchase',
                country: null,
                event_count: 2,
            },
            {
                date: '2026-10-01',
                event: 'Purchase',
                country: 'US',
                event_count: 1,
            },
        ]);
    });

    it('drops property values with no events on a date, keeping empty dates without a split', async () => {
        const { source } = connect(
            segmentation({
                Chrome: { '2026-10-01': 0, '2026-10-02': 3 },
                Safari: { '2026-10-01': 0, '2026-10-02': 0 },
            }),
            segmentation({ Purchase: { '2026-10-01': 0, '2026-10-02': 3 } }),
        );
        const split = await source.run({
            query: JSON.stringify({ ...SEGMENTATION, groupBy: 'browser' }),
            limit: 100,
        });
        const unsplit = await source.run({
            query: JSON.stringify(SEGMENTATION),
            limit: 100,
        });
        expect(split.rows).toEqual([
            {
                date: '2026-10-02',
                event: 'Purchase',
                browser: 'Chrome',
                event_count: 3,
            },
        ]);
        expect(unsplit.rows).toEqual([
            { date: '2026-10-01', event: 'Purchase', event_count: 0 },
            { date: '2026-10-02', event: 'Purchase', event_count: 3 },
        ]);
    });

    it('reads a saved funnel as one row per step', async () => {
        const { send, source } = connect(
            jsonResponse({
                meta: { dates: ['2026-10-01'] },
                data: {
                    '2026-10-01': {
                        steps: [
                            {
                                count: 100,
                                step_conv_ratio: 1,
                                overall_conv_ratio: 1,
                                avg_time: null,
                                event: 'View Pricing',
                                goal: 'View Pricing',
                                step_label: 'View Pricing',
                            },
                            {
                                count: 40,
                                step_conv_ratio: 0.4,
                                overall_conv_ratio: 0.4,
                                avg_time: 95,
                                event: 'Purchase',
                                goal: 'Purchase',
                            },
                        ],
                        analysis: { completion: 40, starting_amount: 100 },
                    },
                },
            }),
        );

        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'funnel',
                ...RANGE,
                funnelId: 42,
            }),
            limit: 100,
        });

        expect(requestOf(send)).toMatchObject({
            path: '/api/query/funnels',
            query: {
                project_id: '12345',
                funnel_id: '42',
                from_date: '2026-10-01',
                to_date: '2026-10-03',
                interval: '3',
            },
        });
        expect(result.rows).toEqual([
            {
                step_number: 1,
                step_event: 'View Pricing',
                users: 100,
                conversion_rate: 1,
                step_conversion_rate: 1,
                average_time_to_convert_seconds: null,
            },
            {
                step_number: 2,
                step_event: 'Purchase',
                users: 40,
                conversion_rate: 0.4,
                step_conversion_rate: 0.4,
                average_time_to_convert_seconds: 95,
            },
        ]);
    });

    it('reads retention cohorts with every period after the start', async () => {
        const { send, source } = connect(
            jsonResponse({
                '2026-10-02T00:00:00': { counts: [8, 3], first: 10 },
                '2026-10-01T00:00:00': { counts: [4, 2, 1], first: 5 },
            }),
        );

        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'retention',
                ...RANGE,
                unit: 'day',
                startEvent: 'Sign Up',
                returnEvent: null,
            }),
            limit: 100,
        });

        expect(requestOf(send)).toMatchObject({
            path: '/api/query/retention',
            query: {
                retention_type: 'birth',
                born_event: 'Sign Up',
                unit: 'day',
                interval_count: '2',
            },
        });
        expect(requestOf(send).query).not.toHaveProperty('event');
        expect(result.rows).toEqual([
            {
                date: '2026-10-01',
                period: 0,
                retained_users: 4,
                cohort_users: 5,
                retention_rate: 0.8,
            },
            {
                date: '2026-10-01',
                period: 1,
                retained_users: 2,
                cohort_users: 5,
                retention_rate: 0.4,
            },
            {
                date: '2026-10-01',
                period: 2,
                retained_users: 1,
                cohort_users: 5,
                retention_rate: 0.2,
            },
            {
                date: '2026-10-02',
                period: 0,
                retained_users: 8,
                cohort_users: 10,
                retention_rate: 0.8,
            },
            {
                date: '2026-10-02',
                period: 1,
                retained_users: 3,
                cohort_users: 10,
                retention_rate: 0.3,
            },
        ]);
    });

    it('says there were more rows when the range needs more periods than Mixpanel reads', async () => {
        const { send, source } = connect(
            jsonResponse({ '2025-01-06': { counts: [4, 2], first: 9 } }),
        );
        const result = await source.run({
            query: JSON.stringify({
                endpoint: 'retention',
                start: '2025-01-01',
                end: '2026-10-31',
                unit: 'week',
                startEvent: 'Sign Up',
                returnEvent: null,
            }),
            limit: 5_000,
        });
        expect(requestOf(send).query?.interval_count).toBe('52');
        expect(result.hasMoreRows).toBe(true);
    });

    it('reads recurring retention when no start event is set', async () => {
        const { send, source } = connect(jsonResponse({}));
        await source.run({
            query: JSON.stringify({
                endpoint: 'retention',
                ...RANGE,
                unit: 'week',
                startEvent: null,
                returnEvent: 'Login',
            }),
            limit: 100,
        });
        expect(requestOf(send).query).toMatchObject({
            retention_type: 'compounded',
            event: 'Login',
            unit: 'week',
        });
        expect(requestOf(send).query).not.toHaveProperty('born_event');
    });

    it("reads today's top events", async () => {
        const { send, source } = connect(
            jsonResponse({
                events: [
                    { amount: 120, event: 'Page View', percent_change: 0.25 },
                    { amount: 7, event: 'Purchase', percent_change: -0.1 },
                ],
                type: 'general',
            }),
        );
        const result = await source.run({
            query: JSON.stringify({ endpoint: 'top_events' }),
            limit: 100,
        });
        expect(requestOf(send)).toMatchObject({
            path: '/api/query/events/top',
            query: { project_id: '12345', type: 'general', limit: '100' },
        });
        expect(result.rows).toEqual([
            { event: 'Page View', event_count: 120, percent_change: 0.25 },
            { event: 'Purchase', event_count: 7, percent_change: -0.1 },
        ]);
    });

    it('keeps rows within the limit and says there were more', async () => {
        const { source } = connect(
            segmentation({
                Purchase: { '2026-10-01': 1, '2026-10-02': 2, '2026-10-03': 3 },
            }),
        );
        const result = await source.run({
            query: JSON.stringify(SEGMENTATION),
            limit: 2,
        });
        expect(result.rows).toHaveLength(2);
        expect(result.hasMoreRows).toBe(true);
    });

    it('says there were more rows when a split reaches the value limit', async () => {
        const values = Object.fromEntries(
            Array.from({ length: 1_000 }, (_, i) => [
                `city-${i}`,
                { '2026-10-01': 1 },
            ]),
        );
        const { source } = connect(segmentation(values));
        const result = await source.run({
            query: JSON.stringify({ ...SEGMENTATION, groupBy: 'city' }),
            limit: 5_000,
        });
        expect(result.hasMoreRows).toBe(true);
    });

    it('refuses a malformed request before calling', async () => {
        const { send, source } = connect();
        await expect(
            source.run({
                query: JSON.stringify({
                    ...SEGMENTATION,
                    events: ['A', 'B', 'C'],
                    metrics: ['general', 'unique', 'average'],
                }),
                limit: 10,
            }),
        ).rejects.toThrow(/events × metrics/);
        await expect(
            source.run({
                query: JSON.stringify({
                    ...SEGMENTATION,
                    groupBy: 'properties["anything"]',
                }),
                limit: 10,
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            source.run({
                query: JSON.stringify({
                    endpoint: 'funnel',
                    start: '2026-10-05',
                    end: '2026-10-01',
                    funnelId: 1,
                }),
                limit: 10,
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses an unexpected response shape', async () => {
        const { source } = connect(jsonResponse({ data: { rows: [] } }));
        await expect(
            source.run({ query: JSON.stringify(SEGMENTATION), limit: 10 }),
        ).rejects.toThrow();
    });

    it.each([
        [
            401,
            { error: 'Invalid credentials' },
            WarehouseConnectionError,
            /service account: Invalid credentials/,
        ],
        [403, 'Forbidden', WarehouseConnectionError, /data region/],
        [
            402,
            {
                request: '/api/query/segmentation?project_id=12345',
                status: 'error',
                error: 'Your plan does not allow API calls. Upgrade at mixpanel.com/pricing',
                error_code: 'query_api.request.plan_restricted',
            },
            WarehouseConnectionError,
            /Growth or Enterprise plan/,
        ],
        [
            400,
            { request: '/api/query/segmentation', error: 'Unknown event' },
            WarehouseQueryError,
            /rejected the request: Unknown event\.$/,
        ],
        [500, '<html>oops</html>', UnexpectedServerError, /returned 500\.$/],
    ])('explains a %i response', async (status, body, ErrorType, message) => {
        const { source } = connect(jsonResponse(body, status));
        const run = source.run({
            query: JSON.stringify(SEGMENTATION),
            limit: 10,
        });
        await expect(run).rejects.toBeInstanceOf(ErrorType);
        await expect(run).rejects.toThrow(message);
    });

    it('passes on how long to wait after a 429', async () => {
        const { source } = connect(
            jsonResponse({ error: 'rate limited' }, 429, {
                'retry-after': '120',
            }),
        );
        const run = source.run({
            query: JSON.stringify(SEGMENTATION),
            limit: 10,
        });
        await expect(run).rejects.toBeInstanceOf(TooManyRequestsError);
        await expect(run).rejects.toThrow(/retry in 120 seconds/);
    });
});

describe('toWhereExpression', () => {
    it('ORs the values of one filter, ANDs filters, and escapes values', () => {
        expect(
            toWhereExpression([
                {
                    property: 'browser',
                    op: 'is',
                    values: ['Chrome', 'Fi"refox'],
                },
                { property: 'country', op: 'is not', values: ['US', 'GB'] },
            ]),
        ).toBe(
            '(properties["$browser"] == "Chrome" or properties["$browser"] == "Fi\\"refox") and (properties["mp_country_code"] != "US" and properties["mp_country_code"] != "GB")',
        );
        expect(toWhereExpression([])).toBeNull();
    });
});

describe('getRetentionPeriods', () => {
    it('reads the periods after the start that the earliest cohort needs to reach the end', () => {
        // Thursday 1 Oct to Saturday 31 Oct: weeks of 28 Sep to 26 Oct
        expect(
            getRetentionPeriods('2026-10-01', '2026-10-31', 'week'),
        ).toMatchObject({ needed: 4, count: 4, capped: false });
        expect(
            getRetentionPeriods('2026-08-03', '2026-10-31', 'day'),
        ).toMatchObject({ needed: 89, capped: false });
        expect(
            getRetentionPeriods('2025-01-01', '2026-12-31', 'month'),
        ).toMatchObject({ needed: 23, capped: false });
        // One period still asks for the next one
        expect(
            getRetentionPeriods('2026-10-12', '2026-10-18', 'week'),
        ).toMatchObject({ needed: 0, count: 1 });
    });

    it('caps the periods per unit', () => {
        expect(
            getRetentionPeriods('2025-01-01', '2026-10-31', 'day'),
        ).toMatchObject({ count: 90, capped: true });
        expect(
            getRetentionPeriods('2025-01-01', '2027-01-01', 'month'),
        ).toMatchObject({ needed: 24, count: 24, capped: false });
        expect(
            getRetentionPeriods('2025-01-01', '2027-02-01', 'month'),
        ).toMatchObject({ needed: 25, count: 24, capped: true });
    });
});
