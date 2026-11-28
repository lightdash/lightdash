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
import { stripeIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { summarizeStripeTest } from './connection';
import {
    createStripeRun,
    STRIPE_POLL_DELAYS_MS,
    STRIPE_START_RETRIES,
} from './run';

// Synthetic fixtures only: never paste rows from a real Stripe account here.

const response = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const sleep = vi.fn(async () => {});

const connect = (...responses: LiveHttpResponse[]) => {
    const send = vi.fn();
    responses.forEach((item) => send.mockResolvedValueOnce(item));
    return {
        send,
        source: connectLiveSource(
            {
                ...stripeIntegration,
                query: {
                    ...stripeIntegration.query,
                    // The integration's request type is erased once defined
                    run: createStripeRun(
                        sleep,
                    ) as typeof stripeIntegration.query.run,
                },
            },
            { connector: ApiConnectorType.STRIPE },
            send,
        ),
    };
};

const COLUMNS = [
    { name: 'c0', type: 'date' },
    { name: 'c1', type: 'varchar' },
    { name: 'c2', type: 'double' },
    { name: 'c3', type: 'boolean' },
];

const row = (index: number) => ({
    data: {
        c0: `2026-${String(index).padStart(2, '0')}-01`,
        c1: 'usd',
        c2: `${index * 100}.5`,
        c3: index % 2 === 0 ? 'true' : 'false',
    },
});

const queryRun = (
    status: string,
    inline?: { rows: unknown[]; next_page_url?: string | null },
    extra: Record<string, unknown> = {},
) =>
    response({
        id: 'qrun_test',
        object: 'v2.data.query_run',
        status,
        result: inline
            ? {
                  inline: {
                      columns: COLUMNS,
                      next_page_url: null,
                      previous_page_url: null,
                      ...inline,
                  },
              }
            : null,
        ...extra,
    });

beforeEach(() => {
    sleep.mockClear();
});

describe('stripeIntegration run', () => {
    it('starts a run, waits for it, and reads typed rows inline', async () => {
        const { source, send } = connect(
            queryRun('running'),
            queryRun('running'),
            queryRun('succeeded', { rows: [row(1), row(2)] }),
        );

        const result = await source.run({ query: 'SELECT 1;', limit: 10 });

        expect(send).toHaveBeenNthCalledWith(1, {
            method: 'POST',
            path: '/v2/data/query_runs',
            body: {
                query: { sql: 'SELECT 1\nLIMIT 11' },
                dataset: 'analytical',
                format: 'csv',
            },
        });
        expect(send).toHaveBeenNthCalledWith(2, {
            method: 'GET',
            path: '/v2/data/query_runs/qrun_test',
            query: { 'include[0]': 'result.inline', limit: '11' },
            body: null,
        });
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(result.columns).toEqual([
            { name: 'c0', type: DimensionType.DATE },
            { name: 'c1', type: DimensionType.STRING },
            { name: 'c2', type: DimensionType.NUMBER },
            { name: 'c3', type: DimensionType.BOOLEAN },
        ]);
        expect(result.rows).toEqual([
            { c0: '2026-01-01', c1: 'usd', c2: 100.5, c3: false },
            { c0: '2026-02-01', c1: 'usd', c2: 200.5, c3: true },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('reads a run Stripe already finished without waiting', async () => {
        const { source, send } = connect(
            queryRun('succeeded'),
            queryRun('succeeded', { rows: [row(1)] }),
        );

        const result = await source.run({ query: 'SELECT 1', limit: 10 });

        expect(sleep).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledTimes(2);
        expect(result.rows).toHaveLength(1);
    });

    it('starts the run again after Stripe says to slow down', async () => {
        const slowDown = response(
            { error: { code: 'rate_limit', message: 'Too many requests.' } },
            429,
        );
        const { source, send } = connect(
            slowDown,
            slowDown,
            queryRun('succeeded'),
            queryRun('succeeded', { rows: [row(1)] }),
        );

        const result = await source.run({ query: 'SELECT 1', limit: 10 });

        expect(send).toHaveBeenCalledTimes(4);
        expect(result.rows).toHaveLength(1);
    });

    it('gives up starting the run after every retry is refused', async () => {
        const slowDown = response(
            { error: { code: 'rate_limit', message: 'Too many requests.' } },
            429,
        );
        const { source, send } = connect(
            ...Array.from({ length: STRIPE_START_RETRIES + 1 }, () => slowDown),
        );

        const error = await source
            .run({ query: 'SELECT 1', limit: 5 })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(TooManyRequestsError);
        expect((error as TooManyRequestsError).message).toContain(
            'Stripe rate limit reached: Too many requests. Stripe starts up to 10 query runs a second (1 in a sandbox); retry in 1 second.',
        );
        expect((error as TooManyRequestsError).data.retryAfterSeconds).toBe(1);
        expect(send).toHaveBeenCalledTimes(STRIPE_START_RETRIES + 1);
    });

    it('waits as long as a 429 says', async () => {
        const { send, source } = connect(
            ...Array.from({ length: STRIPE_START_RETRIES + 1 }, () =>
                response({}, 429, { 'retry-after': '3' }),
            ),
        );

        const error = await source
            .run({ query: 'SELECT 1', limit: 5 })
            .catch((caught: unknown) => caught);

        expect((error as TooManyRequestsError).data.retryAfterSeconds).toBe(3);
        expect(send).toHaveBeenCalledTimes(STRIPE_START_RETRIES + 1);
    });

    it('follows next page links until it has one row past the limit', async () => {
        const { source, send } = connect(
            queryRun('running'),
            queryRun('succeeded', {
                rows: [row(1), row(2)],
                next_page_url:
                    'https://api.stripe.com/v2/data/query_runs/qrun_test?include%5B0%5D=result.inline&limit=2&page=abc',
            }),
            response({
                result: {
                    inline: {
                        columns: COLUMNS,
                        rows: [row(3), row(4)],
                        next_page_url: '/v2/data/query_runs/qrun_test?page=def',
                    },
                },
            }),
        );

        const result = await source.run({ query: 'SELECT 1', limit: 3 });

        expect(send).toHaveBeenNthCalledWith(3, {
            method: 'GET',
            path: '/v2/data/query_runs/qrun_test',
            rawQuery: 'include%5B0%5D=result.inline&limit=2&page=abc',
            body: null,
        });
        expect(send).toHaveBeenCalledTimes(3);
        expect(result.rows).toHaveLength(3);
        expect(result.hasMoreRows).toBe(true);
    });

    it('refuses a next page link outside the query run', async () => {
        const { source } = connect(
            queryRun('running'),
            queryRun('succeeded', {
                rows: [row(1)],
                next_page_url: 'https://example.com/v2/data/query_runs/x',
            }),
        );

        await expect(
            source.run({ query: 'SELECT 1', limit: 5 }),
        ).rejects.toThrow(UnexpectedServerError);
    });

    it('explains a failed run with Stripe’s query errors', async () => {
        const { source } = connect(
            queryRun('running'),
            queryRun('failed', undefined, {
                status_details: {
                    code: 'query_run_invalid_sql',
                    message: 'Your query contains invalid SQL.',
                    query_errors: [
                        {
                            type: 'unknown_column',
                            message: "Column 'nope' cannot be resolved",
                        },
                    ],
                },
            }),
        );

        const error = await source
            .run({ query: 'SELECT nope', limit: 5 })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(WarehouseQueryError);
        expect((error as Error).message).toBe(
            "Stripe query failed: Your query contains invalid SQL. Column 'nope' cannot be resolved",
        );
    });

    it('gives up when the run outlasts every wait', async () => {
        const { source, send } = connect(
            ...Array.from({ length: STRIPE_POLL_DELAYS_MS.length + 1 }, () =>
                queryRun('running'),
            ),
        );

        await expect(
            source.run({ query: 'SELECT 1', limit: 5 }),
        ).rejects.toThrow(TimeoutError);
        expect(send).toHaveBeenCalledTimes(STRIPE_POLL_DELAYS_MS.length + 1);
    });

    it('rejects a response in an unexpected shape', async () => {
        const { source } = connect(response({ nope: true }));

        await expect(
            source.run({ query: 'SELECT 1', limit: 5 }),
        ).rejects.toThrow(UnexpectedServerError);
    });

    it('refuses an empty query', async () => {
        const { source, send } = connect();

        await expect(source.run({ query: ' ; ', limit: 5 })).rejects.toThrow(
            ParameterError,
        );
        expect(send).not.toHaveBeenCalled();
    });

    it.each([
        [400, WarehouseQueryError, 'Stripe rejected the query: Syntax error'],
        [401, WarehouseConnectionError, 'Stripe rejected the API key'],
        [403, WarehouseConnectionError, 'Data > Queries > Read'],
        [500, UnexpectedServerError, 'Stripe returned 500'],
    ])('maps a %s response', async (status, ErrorType, message) => {
        const { source } = connect(
            response(
                { error: { code: 'some_code', message: 'Syntax error.' } },
                status,
            ),
        );

        const error = await source
            .run({ query: 'SELECT 1', limit: 5 })
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ErrorType);
        expect((error as Error).message).toContain(message);
    });
});

describe('summarizeStripeTest', () => {
    it('counts the tables of a single page', () => {
        expect(
            summarizeStripeTest({ data: [{}, {}], next_page_url: null }),
        ).toEqual({
            summary: 'Connected to your Stripe account',
            facts: [{ label: 'Tables to query', value: '2' }],
        });
    });

    it('leaves the count out when the list pages', () => {
        expect(
            summarizeStripeTest({ data: [{}], next_page_url: '/next' })?.facts,
        ).toEqual([]);
    });
});
