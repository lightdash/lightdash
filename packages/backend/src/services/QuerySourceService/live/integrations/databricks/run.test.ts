import {
    ApiConnectorType,
    DimensionType,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { databricksIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpRequest, type LiveHttpResponse } from '../../types';
import {
    DATABRICKS_MAX_POLLS,
    DATABRICKS_POLL_MS,
    summarizeDatabricksTest,
} from './run';

const SETTINGS = {
    connector: ApiConnectorType.DATABRICKS,
    warehouseId: '1a2b3c4d5e6f7a8b',
} as const;

const ok = (body: unknown): LiveHttpResponse => ({
    status: 200,
    headers: {},
    body,
});

const MANIFEST = {
    format: 'JSON_ARRAY',
    schema: {
        column_count: 3,
        columns: [
            { name: 'c0', type_name: 'DATE', position: 0 },
            { name: 'c1', type_name: 'STRING', position: 1 },
            { name: 'c2', type_name: 'DECIMAL', position: 2 },
        ],
    },
    total_row_count: 2,
    truncated: false,
};

// Shaped like the Statement Execution API's documented responses
const succeeded = (
    rows: (string | null)[][],
    overrides: Record<string, unknown> = {},
) => ({
    statement_id: '01ed92c5-3583-1f38-b21b-c6773e7c56b3',
    status: { state: 'SUCCEEDED' },
    manifest: MANIFEST,
    result: {
        chunk_index: 0,
        row_offset: 0,
        row_count: rows.length,
        data_array: rows,
    },
    ...overrides,
});

const connect = (...responses: LiveHttpResponse[]) => {
    const send =
        vi.fn<(request: LiveHttpRequest) => Promise<LiveHttpResponse>>();
    responses.forEach((response) => send.mockResolvedValueOnce(response));
    return {
        source: connectLiveSource(databricksIntegration, SETTINGS, send),
        send,
    };
};

describe('databricksIntegration run', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('runs one statement on the warehouse and types its rows', async () => {
        const { source, send } = connect(
            ok(
                succeeded([
                    ['2026-10-01', 'PREMIUM_JOBS_COMPUTE', '1234.5'],
                    ['2026-10-01', 'PREMIUM_SQL_COMPUTE', null],
                ]),
            ),
        );
        const result = await source.run({ query: 'SELECT 1', limit: 10 });
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toEqual({
            method: 'POST',
            path: '/api/2.0/sql/statements',
            body: {
                warehouse_id: '1a2b3c4d5e6f7a8b',
                statement: 'SELECT 1',
                wait_timeout: '50s',
                on_wait_timeout: 'CONTINUE',
                format: 'JSON_ARRAY',
                disposition: 'INLINE',
                row_limit: 11,
            },
        });
        expect(result.columns).toEqual([
            { name: 'c0', type: DimensionType.DATE },
            { name: 'c1', type: DimensionType.STRING },
            { name: 'c2', type: DimensionType.NUMBER },
        ]);
        expect(result.rows).toEqual([
            { c0: '2026-10-01', c1: 'PREMIUM_JOBS_COMPUTE', c2: 1234.5 },
            { c0: '2026-10-01', c1: 'PREMIUM_SQL_COMPUTE', c2: null },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('reports more rows when Databricks returns one past the limit', async () => {
        const { source } = connect(
            ok(
                succeeded(
                    [
                        ['2026-10-01', 'a', '1'],
                        ['2026-10-02', 'b', '2'],
                        ['2026-10-03', 'c', '3'],
                    ],
                    { manifest: { ...MANIFEST, truncated: true } },
                ),
            ),
        );
        const result = await source.run({ query: 'SELECT 1', limit: 2 });
        expect(result.rows).toHaveLength(2);
        expect(result.hasMoreRows).toBe(true);
    });

    it('polls a statement that outlives the wait, then reads its chunks', async () => {
        vi.useFakeTimers();
        const { source, send } = connect(
            ok({
                statement_id: 'statement-1',
                status: { state: 'PENDING' },
            }),
            ok({ statement_id: 'statement-1', status: { state: 'RUNNING' } }),
            ok(
                succeeded([['2026-10-01', 'a', '1']], {
                    statement_id: 'statement-1',
                    result: {
                        data_array: [['2026-10-01', 'a', '1']],
                        next_chunk_internal_link:
                            '/api/2.0/sql/statements/statement-1/result/chunks/1?row_offset=1',
                    },
                }),
            ),
            ok({ data_array: [['2026-10-02', 'b', '2']] }),
        );
        const running = source.run({ query: 'SELECT 1', limit: 10 });
        await vi.advanceTimersByTimeAsync(DATABRICKS_POLL_MS * 2);
        const result = await running;
        expect(send.mock.calls.map(([request]) => request.path)).toEqual([
            '/api/2.0/sql/statements',
            '/api/2.0/sql/statements/statement-1',
            '/api/2.0/sql/statements/statement-1',
            '/api/2.0/sql/statements/statement-1/result/chunks/1',
        ]);
        expect(send.mock.calls[3][0].query).toEqual({ row_offset: '1' });
        expect(result.rows).toEqual([
            { c0: '2026-10-01', c1: 'a', c2: 1 },
            { c0: '2026-10-02', c1: 'b', c2: 2 },
        ]);
    });

    it('cancels and times out a statement that never finishes', async () => {
        vi.useFakeTimers();
        const pending = ok({
            statement_id: 'statement-1',
            status: { state: 'RUNNING' },
        });
        const { source, send } = connect(
            ...Array.from({ length: DATABRICKS_MAX_POLLS + 1 }, () => pending),
            ok({}),
        );
        const running = source.run({ query: 'SELECT 1', limit: 10 });
        const outcome = running.catch((error: unknown) => error);
        // One poll at a time, each after the last one's response
        await Array.from({ length: DATABRICKS_MAX_POLLS + 1 }).reduce<
            Promise<unknown>
        >(
            (previous) =>
                previous.then(() =>
                    vi.advanceTimersByTimeAsync(DATABRICKS_POLL_MS),
                ),
            Promise.resolve(),
        );
        expect(await outcome).toBeInstanceOf(TimeoutError);
        expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
            method: 'POST',
            path: '/api/2.0/sql/statements/statement-1/cancel',
        });
    });

    it('explains a statement Databricks could not run', async () => {
        const { source } = connect(
            ok({
                statement_id: 'statement-1',
                status: {
                    state: 'FAILED',
                    error: {
                        error_code: 'BAD_REQUEST',
                        message:
                            '[TABLE_OR_VIEW_NOT_FOUND] The table or view `system`.`billing`.`usage` cannot be found.',
                    },
                },
            }),
        );
        await expect(
            source.run({ query: 'SELECT 1', limit: 10 }),
        ).rejects.toThrow(
            new WarehouseQueryError(
                'Databricks could not run the statement: [TABLE_OR_VIEW_NOT_FOUND] The table or view `system`.`billing`.`usage` cannot be found.',
            ),
        );
    });

    it('refuses an unexpected response shape', async () => {
        const { source } = connect(ok({ rows: [] }));
        await expect(
            source.run({ query: 'SELECT 1', limit: 10 }),
        ).rejects.toThrow(UnexpectedServerError);
    });

    it('asks for named columns', async () => {
        const { source } = connect(
            ok(
                succeeded([['1']], {
                    manifest: {
                        ...MANIFEST,
                        schema: {
                            columns: [
                                {
                                    name: 'count(1)',
                                    type_name: 'LONG',
                                    position: 0,
                                },
                            ],
                        },
                    },
                }),
            ),
        );
        await expect(
            source.run({ query: 'SELECT count(1) FROM t', limit: 10 }),
        ).rejects.toThrow(WarehouseQueryError);
    });

    it.each([
        [401, WarehouseConnectionError, 'rejected the token'],
        [
            403,
            WarehouseConnectionError,
            'CAN USE on SQL warehouse 1a2b3c4d5e6f7a8b',
        ],
        [404, WarehouseConnectionError, 'no SQL warehouse 1a2b3c4d5e6f7a8b'],
        [429, TooManyRequestsError, 'Retry after 30 seconds'],
        [400, WarehouseQueryError, 'PARSE_SYNTAX_ERROR'],
        [500, UnexpectedServerError, 'Databricks returned 500'],
    ])('maps a %i response', async (status, ErrorType, message) => {
        const { source } = connect({
            status,
            headers: status === 429 ? { 'retry-after': '30' } : {},
            body: {
                error_code: 'X',
                message: '[PARSE_SYNTAX_ERROR] Syntax error',
            },
        });
        const run = source.run({ query: 'SELECT 1', limit: 10 });
        await expect(run).rejects.toThrow(ErrorType);
        await expect(run).rejects.toThrow(message);
    });

    it('refuses more rows than one statement returns inline', async () => {
        const { source, send } = connect();
        await expect(
            source.run({ query: 'SELECT 1', limit: 50_001 }),
        ).rejects.toThrow('limit must be between 1 and 50000 rows');
        expect(send).not.toHaveBeenCalled();
    });
});

describe('summarizeDatabricksTest', () => {
    it('names the SQL warehouse the token reached', () => {
        expect(
            summarizeDatabricksTest(
                {
                    id: '1a2b3c4d5e6f7a8b',
                    name: 'Serverless Starter Warehouse',
                    state: 'STOPPED',
                    cluster_size: '2X-Small',
                },
                SETTINGS,
            ),
        ).toEqual({
            summary: 'Connected to SQL warehouse Serverless Starter Warehouse',
            facts: [
                { label: 'Warehouse ID', value: '1a2b3c4d5e6f7a8b' },
                { label: 'State', value: 'STOPPED' },
                { label: 'Size', value: '2X-Small' },
            ],
        });
        expect(summarizeDatabricksTest({ rows: [] }, SETTINGS)).toBeNull();
    });
});

describe('databricksIntegration settings', () => {
    it.each([
        'https://dbc-1a2b3c4d-5e6f.cloud.databricks.com',
        'https://adb-1234567890123456.7.azuredatabricks.net',
        'https://1234567890123456.7.gcp.databricks.com',
    ])('accepts the workspace %s', (origin) => {
        expect(databricksIntegration.acceptsOrigin?.(origin)).toBe(true);
    });

    it.each([
        'https://accounts.cloud.databricks.com',
        'https://evil.example.com',
        'http://dbc-1a2b3c4d-5e6f.cloud.databricks.com',
        'https://cloud.databricks.com.evil.com',
    ])('refuses %s', (origin) => {
        expect(databricksIntegration.acceptsOrigin?.(origin)).toBe(false);
    });

    it('takes a service principal only from its workspace token endpoint', () => {
        const origin = 'https://dbc-1a2b3c4d-5e6f.cloud.databricks.com';
        expect(() =>
            databricksIntegration.checkAuth({
                type: 'oauth_client_credentials',
                origin,
                oauthTokenUrl: `${origin}/oidc/v1/token`,
            }),
        ).not.toThrow();
        expect(() =>
            databricksIntegration.checkAuth({
                type: 'oauth_client_credentials',
                origin,
                oauthTokenUrl: 'https://evil.example.com/token',
            }),
        ).toThrow();
        expect(() =>
            databricksIntegration.checkAuth({ type: 'api_key', origin }),
        ).toThrow();
    });
});
