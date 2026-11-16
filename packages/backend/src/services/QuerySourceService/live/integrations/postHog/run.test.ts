import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { postHogIntegration } from '.';
import type { LiveHttpResponse, LiveTransport } from '../../connector';
import {
    clickHouseTypeToDimensionType,
    getPostHogPropertyDefinitionsPrefix,
} from './run';

// Trimmed from real PostHog responses; values replaced with neutral ones.
const weeklyActiveUsers = {
    columns: ['week', 'wau', 'events'],
    types: [
        ['week', 'Date'],
        ['wau', 'UInt64'],
        ['events', 'UInt64'],
    ],
    results: [
        ['2026-10-11', 278, 1279],
        ['2026-10-18', 36, 111],
        ['2026-10-25', 3, 3],
    ],
    hasMore: false,
    limit: 100,
    error: null,
};

const syntaxError = {
    type: 'validation_error',
    code: 'hogql_syntax_error',
    detail: "mismatched input 'SELEC' expecting {SELECT, WITH, '{', '(', '<'}",
    attr: null,
    extra: {
        hogql_metadata: {
            errors: [{ start: 16, end: 39, message: 'mismatched input' }],
        },
    },
};

const jsonResponse = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const createConnector = (response: LiveHttpResponse) => {
    const send = vi.fn().mockResolvedValue(response);
    return {
        connector: postHogIntegration.createConnector(
            { connector: ApiConnectorType.POSTHOG, projectId: '303731' },
            send,
        ).connector,
        send,
    };
};

const query = (hogql: string) => ({ kind: 'query' as const, query: hogql });

describe('postHogIntegration run', () => {
    it('describes itself as an L5 HogQL connector', () => {
        const { connector } = createConnector(jsonResponse({}));
        expect(connector.describe()).toEqual({
            connector: ApiConnectorType.POSTHOG,
            label: 'PostHog',
            maxRows: 49_999,
            timeoutMs: 45_000,
            limits: {
                concurrentCalls: 3,
                callsPerMinute: 240,
                callsPerHour: 2_400,
                callsPerQuery: 1,
            },
            capabilities: postHogIntegration.baseLayer.capabilities,
        });
    });

    it('wraps the query to ask for one row more than the limit', async () => {
        const { connector, send } = createConnector(
            jsonResponse(weeklyActiveUsers),
        );
        await connector.execute({
            payload: query('SELECT 1 AS a;  '),
            limit: 500,
        });

        expect(send).toHaveBeenCalledExactlyOnceWith({
            method: 'POST',
            path: '/api/projects/303731/query/',
            body: {
                query: {
                    kind: 'HogQLQuery',
                    query: 'SELECT * FROM (\nSELECT 1 AS a\n) LIMIT 501',
                },
                name: 'api-query-source',
            },
        });
    });

    it('maps columns, types and rows', async () => {
        const { connector } = createConnector(
            jsonResponse(weeklyActiveUsers, 200, {
                'x-posthog-query-bytes-read': '12392719',
            }),
        );
        const result = await connector.execute({
            payload: query('SELECT week, wau, events FROM weekly'),
            limit: 500,
        });

        expect(result).toEqual({
            columns: [
                { name: 'week', type: DimensionType.DATE },
                { name: 'wau', type: DimensionType.NUMBER },
                { name: 'events', type: DimensionType.NUMBER },
            ],
            rows: [
                { week: '2026-10-11', wau: 278, events: 1279 },
                { week: '2026-10-18', wau: 36, events: 111 },
                { week: '2026-10-25', wau: 3, events: 3 },
            ],
            hasMoreRows: false,
            bytesRead: 12392719,
        });
    });

    it('flags truncation and keeps only limit rows', async () => {
        const { connector } = createConnector(jsonResponse(weeklyActiveUsers));
        const result = await connector.execute({
            payload: query('SELECT week, wau, events FROM weekly'),
            limit: 2,
        });

        expect(result.hasMoreRows).toBe(true);
        expect(result.rows).toHaveLength(2);
        expect(result.bytesRead).toBeNull();
    });

    it('stores arrays and maps as JSON strings', async () => {
        const { connector } = createConnector(
            jsonResponse({
                columns: ['arr', 'm'],
                types: [
                    ['arr', 'Array(UInt8)'],
                    ['m', 'Map(String, UInt8)'],
                ],
                results: [[[1, 2], { a: 1 }]],
                error: null,
            }),
        );
        const result = await connector.execute({
            payload: query('SELECT [1,2] AS arr, map(1, 2) AS m'),
            limit: 10,
        });

        expect(result.rows).toEqual([{ arr: '[1,2]', m: '{"a":1}' }]);
    });

    it('asks for an alias when a column name is not identifier-safe', async () => {
        const { connector } = createConnector(
            jsonResponse({
                columns: ['event', 'count()'],
                types: [
                    ['event', 'String'],
                    ['count()', 'UInt64'],
                ],
                results: [['pageview', 54]],
                error: null,
            }),
        );

        await expect(
            connector.execute({
                payload: query('SELECT event, count() FROM events'),
                limit: 10,
            }),
        ).rejects.toThrow(
            new WarehouseQueryError(
                'Name every column with AS, using letters, digits and underscores: count()',
            ),
        );
    });

    it.each([0, 1.5, 50_000])('rejects a limit of %s', async (limit) => {
        const { connector, send } = createConnector(jsonResponse({}));
        await expect(
            connector.execute({
                payload: query('SELECT 1'),
                limit,
            }),
        ).rejects.toThrow(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('rejects an empty query', async () => {
        const { connector } = createConnector(jsonResponse({}));
        await expect(
            connector.execute({
                payload: query(' ; '),
                limit: 10,
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('shifts syntax error positions back to the caller query', async () => {
        const { connector } = createConnector(jsonResponse(syntaxError, 400));
        const error = await connector
            .execute({
                payload: query('SELEC event FROM events'),
                limit: 10,
            })
            .catch((e) => e);

        expect(error).toBeInstanceOf(WarehouseQueryError);
        expect(error.message).toBe(
            "PostHog rejected the query: mismatched input 'SELEC' expecting {SELECT, WITH, '{', '(', '<'}",
        );
        expect(error.data).toEqual({
            code: 'hogql_syntax_error',
            start: 0,
            end: 23,
        });
    });

    it.each([
        [401, WarehouseConnectionError],
        [404, WarehouseConnectionError],
        [504, TimeoutError],
        [500, UnexpectedServerError],
    ])('maps status %s to %s', async (status, ErrorClass) => {
        const { connector } = createConnector(
            jsonResponse({ detail: 'nope' }, status),
        );
        await expect(
            connector.execute({
                payload: query('SELECT 1 AS a'),
                limit: 10,
            }),
        ).rejects.toThrow(ErrorClass);
    });

    it('passes Retry-After through on 429', async () => {
        const { connector } = createConnector(
            jsonResponse(
                {
                    code: 'api_queries_budget_exceeded',
                    detail: 'Query budget exceeded',
                },
                429,
                { 'retry-after': '30' },
            ),
        );
        const error = await connector
            .execute({
                payload: query('SELECT 1 AS a'),
                limit: 10,
            })
            .catch((e) => e);

        expect(error).toBeInstanceOf(TooManyRequestsError);
        expect(error.data).toEqual({ retryAfterSeconds: 30 });
    });
});

describe('postHogIntegration scan', () => {
    const scanWith = (send: LiveTransport) =>
        postHogIntegration.createConnector(
            { connector: ApiConnectorType.POSTHOG, projectId: '303731' },
            send,
        ).scan!();

    it('reads event and person property definitions page by page', async () => {
        const send = vi.fn(async ({ query: params }) =>
            jsonResponse(
                params.offset
                    ? { next: null, results: [{ name: `${params.type}_2` }] }
                    : {
                          next: 'next-page',
                          results: [{ name: `${params.type}_1` }],
                      },
            ),
        );

        await expect(scanWith(send)).resolves.toEqual({
            posthogProperties: {
                event: { results: [{ name: 'event_1' }, { name: 'event_2' }] },
                person: {
                    results: [{ name: 'person_1' }, { name: 'person_2' }],
                },
            },
        });
        expect(send).toHaveBeenCalledWith({
            method: 'GET',
            path: getPostHogPropertyDefinitionsPrefix('303731'),
            query: { type: 'event', limit: '500', offset: '1' },
            body: null,
        });
    });

    it('reads an unreadable page as no properties', async () => {
        const send = vi.fn().mockResolvedValue(jsonResponse({ nope: true }));

        await expect(scanWith(send)).resolves.toEqual({
            posthogProperties: {
                event: { results: [] },
                person: { results: [] },
            },
        });
    });

    it('maps a failed call to the PostHog error', async () => {
        const send = vi
            .fn()
            .mockResolvedValue(jsonResponse({ detail: 'nope' }, 401));

        await expect(scanWith(send)).rejects.toThrow(WarehouseConnectionError);
    });
});

describe('clickHouseTypeToDimensionType', () => {
    it.each([
        ['Date', DimensionType.DATE],
        ['Nullable(Date)', DimensionType.DATE],
        ["DateTime64(6, 'UTC')", DimensionType.TIMESTAMP],
        ["DateTime('UTC')", DimensionType.TIMESTAMP],
        ['UInt64', DimensionType.NUMBER],
        ['Nullable(Int64)', DimensionType.NUMBER],
        ['Float64', DimensionType.NUMBER],
        ['Nullable(Decimal(18, 2))', DimensionType.NUMBER],
        ['Bool', DimensionType.BOOLEAN],
        ['LowCardinality(String)', DimensionType.STRING],
        ['UUID', DimensionType.STRING],
        ['Array(UInt8)', DimensionType.STRING],
        ['Nullable(Nothing)', DimensionType.STRING],
    ])('maps %s to %s', (type, expected) => {
        expect(clickHouseTypeToDimensionType(type)).toBe(expected);
    });
});
