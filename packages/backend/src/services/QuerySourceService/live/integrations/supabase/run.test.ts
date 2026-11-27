import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { supabaseIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { SUPABASE_MAX_QUERY_ROWS, toSupabaseQuery } from './run';
import { OPEN_API, ORDERS_TABLE } from './supabase.fixtures';

const response = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const connect = (...responses: LiveHttpResponse[]) => {
    const send = vi.fn();
    responses.forEach((item) => send.mockResolvedValueOnce(item));
    return {
        send,
        source: connectLiveSource(
            supabaseIntegration,
            { connector: ApiConnectorType.SUPABASE, table: 'orders' },
            send,
        ),
    };
};

const run = (
    source: ReturnType<typeof connect>['source'],
    request: Record<string, unknown>,
    limit = 10,
) => source.run({ query: JSON.stringify(request), limit });

const rows = (count: number, start = 0) =>
    Array.from({ length: count }, (_, index) => ({
        id: start + index,
        status: 'paid',
        metadata: { source: 'web' },
    }));

describe('toSupabaseQuery', () => {
    it('writes select, an and=(…) of filters and the order', () => {
        expect(
            toSupabaseQuery({
                select: ['id', 'Customer Name'],
                filters: [
                    { column: 'status', operator: 'in', value: ['a,b', 'c'] },
                    { column: 'amount', operator: 'gte', value: '10.5' },
                    { column: 'amount', operator: 'lt', value: '20' },
                    { column: 'note', operator: 'is_null' },
                    { column: 'note', operator: 'not_null' },
                    {
                        column: 'Customer Name',
                        operator: 'not_ilike',
                        value: ['*x*', '*"y"*'],
                    },
                    { column: 'status', operator: 'neq', value: '' },
                ],
                order: [{ column: 'id', ascending: false }],
            }),
        ).toEqual({
            select: 'id,"Customer Name"',
            and: '(status.in.("a,b",c),amount.gte.10.5,amount.lt.20,note.is.null,note.not.is.null,"Customer Name".not.ilike(any).{*x*,"*\\"y\\"*"},status.neq."")',
            order: 'id.desc',
        });
    });
});

describe('supabaseIntegration run', () => {
    it('reads the table with the query and a limit', async () => {
        const { source, send } = connect(response(rows(3)));

        const result = await run(source, {
            select: ['id', 'metadata'],
            filters: [{ column: 'status', operator: 'eq', value: 'paid' }],
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toMatchObject({
            method: 'GET',
            path: '/rest/v1/orders',
            query: {
                select: 'id,metadata',
                and: '(status.eq.paid)',
                limit: '11',
                offset: '0',
            },
        });
        expect(result.rows[0]).toEqual({
            id: 0,
            metadata: '{"source":"web"}',
        });
        expect(result.columns).toEqual([
            { name: 'id', type: 'number' },
            { name: 'metadata', type: 'string' },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('pages by offset and stops at a short page', async () => {
        const { source, send } = connect(
            response(rows(1000)),
            response(rows(200, 1000)),
        );

        const result = await run(source, { select: ['id'] }, 4000);

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0].query).toMatchObject({
            limit: '1000',
            offset: '1000',
        });
        expect(result.rows).toHaveLength(1200);
    });

    it('refuses more rows than one query can read', async () => {
        const { source, send } = connect();
        await expect(
            run(source, { select: ['id'] }, SUPABASE_MAX_QUERY_ROWS + 1),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('marks a table with rows past the cap as having more', async () => {
        const { source, send } = connect(
            ...Array.from({ length: 5 }, (_, page) =>
                response(rows(1000, page * 1000)),
            ),
        );
        const result = await run(
            source,
            { select: ['id'] },
            SUPABASE_MAX_QUERY_ROWS,
        );
        expect(send).toHaveBeenCalledTimes(5);
        expect(result.rows).toHaveLength(SUPABASE_MAX_QUERY_ROWS);
        expect(result.hasMoreRows).toBe(true);
    });

    it('refuses a malformed request before calling', async () => {
        const { source, send } = connect();
        await expect(
            run(source, {
                select: ['id'],
                filters: [{ column: 'id', operator: 'in', value: '1' }],
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            run(source, { select: ['id'], table: 'secrets' }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('explains an unexpected response shape', async () => {
        const { source } = connect(response({ nope: true }));
        await expect(run(source, { select: ['id'] })).rejects.toThrow();
    });

    it.each([
        [
            401,
            { message: 'Invalid API key' },
            WarehouseConnectionError,
            'secret key',
        ],
        [
            404,
            { code: 'PGRST205', message: 'Could not find the table' },
            WarehouseConnectionError,
            'can\'t find the table "orders"',
        ],
        [
            400,
            { code: '22P02', message: 'invalid input syntax for type bigint' },
            WarehouseQueryError,
            'invalid input syntax',
        ],
        [429, {}, TooManyRequestsError, 'retry in 5 seconds'],
        [503, {}, UnexpectedServerError, 'Supabase returned 503'],
    ])('explains a %s', async (status, body, ErrorClass, text) => {
        const { source } = connect(
            response(body, status, { 'retry-after': '5' }),
            response(body, status, { 'retry-after': '5' }),
            response(body, status, { 'retry-after': '5' }),
            response(body, status, { 'retry-after': '5' }),
        );
        const result = run(source, { select: ['id'] });
        await expect(result).rejects.toBeInstanceOf(ErrorClass);
        await expect(result).rejects.toThrow(text);
    });
});

describe('supabaseIntegration scan', () => {
    it('keeps only the source table from the OpenAPI description', async () => {
        const { source, send } = connect(
            response(OPEN_API, 200, {
                'content-type': 'application/openapi+json',
            }),
        );
        await expect(source.discover()).resolves.toEqual({
            supabaseTable: ORDERS_TABLE,
        });
        expect(send.mock.calls[0][0]).toMatchObject({
            method: 'GET',
            path: '/rest/v1/',
        });
    });

    it('names the tables it has when the source table is missing', async () => {
        const { source } = connect(
            response({ ...OPEN_API, definitions: { customers: {} } }),
        );
        await expect(source.discover()).rejects.toThrow(
            'Supabase has no table or view called "orders" in the exposed schema; it has customers.',
        );
    });
});
