/* eslint-disable @typescript-eslint/no-floating-promises */
import { AnyType, QueryExecutionContext,} from '@lightdash/common';
import { Columns, Iterator, QueryData, QueryResult, Trino } from 'trino-client';
import { TrinoTypes, TrinoWarehouseClient } from './TrinoWarehouseClient';
import {
    credentials,
    queryResponse,
    querySchemaResponse,
} from './TrinoWarehouseClient.mock';
import * as wharehouseClient from './WarehouseClient.mock';

const queryResultMock = jest.fn();

jest.mock('trino-client', () => ({
    BasicAuth: jest.fn(),
    Trino: {
        create: jest.fn(() =>
            Promise.resolve({
                query: queryResultMock,
            }),
        ),
    },
}));

describe('TrinoWarehouseClient', () => {
    const lowerCaseFields = Object.keys(wharehouseClient.expectedFields).reduce<
        Record<string, AnyType>
    >((acc, key) => {
        acc[key.toLowerCase()] = wharehouseClient.expectedFields[key];
        return acc;
    }, {});
    const lowerCaseRow = Object.keys(wharehouseClient.expectedRow).reduce<
        Record<string, AnyType>
    >((acc, key) => {
        acc[key.toLowerCase()] = wharehouseClient.expectedRow[key];
        return acc;
    }, {});
    it('expect query rows', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: jest
                .fn()
                .mockResolvedValue({ done: true, value: queryResponse }),
        });
        const results = await warehouse.runQuery('fake sql');
        expect(results.rows[0]).toEqual(lowerCaseRow);
        expect(results.fields).toEqual(lowerCaseFields);
    });

    it('expect query has mutiple result chunks', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: jest
                .fn()
                // First chunk: has nextUri indicating more data available
                .mockResolvedValueOnce({
                    done: false,
                    value: { ...queryResponse, nextUri: 'http://trino/next' },
                })
                // Second chunk: no nextUri, query complete
                .mockResolvedValueOnce({ done: true, value: queryResponse }),
        });
        const results = await warehouse.runQuery('fake sql');
        expect(results.rows[0]).toEqual(lowerCaseRow);
        expect(results.fields).toEqual(lowerCaseFields);
        expect(results.rows.length).toEqual(2);
    });

    it('expect schema with trino types mapped to dimension types', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: jest
                .fn()
                .mockResolvedValue({ done: true, value: querySchemaResponse }),
        });

        expect(warehouse.getCatalog(wharehouseClient.config)).resolves.toEqual(
            wharehouseClient.expectedWarehouseSchema,
        );
    });

    it('sends query context as Trino client tag', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: jest
                .fn()
                .mockResolvedValue({ done: true, value: queryResponse }),
        });

        await warehouse.runQuery('fake sql', {
            query_context: QueryExecutionContext.SCHEDULED_DELIVERY,
        });

        expect(queryResultMock).toHaveBeenCalledWith({
            query: expect.stringContaining('fake sql'),
            extraHeaders: {
                'X-Trino-Client-Tags': QueryExecutionContext.SCHEDULED_DELIVERY,
            },
        });
    });
    
    describe('streamQuery client tag headers', () => {
        it('sends X-Trino-Client-Tags header as comma-separated key:value pairs when tags are provided', async () => {
            const warehouse = new TrinoWarehouseClient(credentials);
            queryResultMock.mockReturnValue({
                next: jest
                    .fn()
                    .mockResolvedValue({ done: true, value: queryResponse }),
            });

            await warehouse.runQuery('SELECT 1', {
                dashboard_uuid: 'abc-123',
                chart_uuid: 'def-456',
            });

            expect(queryResultMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    extraHeaders: expect.objectContaining({
                        'X-Trino-Client-Tags':
                            'dashboard_uuid=abc-123,chart_uuid=def-456',
                    }),
                }),
            );
        });

        it('sends query as plain string (no extraHeaders) when no tags are provided', async () => {
            const warehouse = new TrinoWarehouseClient(credentials);
            queryResultMock.mockReturnValue({
                next: jest
                    .fn()
                    .mockResolvedValue({ done: true, value: queryResponse }),
            });

            await warehouse.runQuery('SELECT 1');

            expect(queryResultMock).toHaveBeenCalledWith('SELECT 1');
        });
    });
});
