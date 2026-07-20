/* eslint-disable @typescript-eslint/no-floating-promises */
import { AnyType, QueryExecutionContext } from '@lightdash/common';
import { Columns, Iterator, QueryData, QueryResult, Trino } from 'trino-client';
import { TrinoTypes, TrinoWarehouseClient } from './TrinoWarehouseClient';
import {
    credentials,
    queryResponse,
    querySchemaResponse,
} from './TrinoWarehouseClient.mock';
import * as warehouseClient from './WarehouseClient.mock';

const queryResultMock = vi.fn();

vi.mock('trino-client', () => ({
    BasicAuth: vi.fn(),
    Trino: {
        create: vi.fn(() =>
            Promise.resolve({
                query: queryResultMock,
            }),
        ),
    },
}));

describe('TrinoWarehouseClient', () => {
    const lowerCaseFields = Object.keys(
        warehouseClient.expectedFieldsWithNaiveTimestamp,
    ).reduce<Record<string, AnyType>>((acc, key) => {
        acc[key.toLowerCase()] =
            warehouseClient.expectedFieldsWithNaiveTimestamp[key];
        return acc;
    }, {});
    const lowerCaseRow = Object.keys(warehouseClient.expectedRow).reduce<
        Record<string, AnyType>
    >((acc, key) => {
        acc[key.toLowerCase()] = warehouseClient.expectedRow[key];
        return acc;
    }, {});
    it('expect query rows', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: vi
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
            next: vi
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
            next: vi
                .fn()
                .mockResolvedValue({ done: true, value: querySchemaResponse }),
        });

        await expect(
            warehouse.getCatalog(warehouseClient.config),
        ).resolves.toEqual(
            warehouseClient.expectedWarehouseSchemaWithNaiveTimestamp,
        );
    });

    describe('streamQuery client tag headers', () => {
        it('sends X-Trino-Client-Tags header as comma-separated key=value pairs when tags are provided', async () => {
            const warehouse = new TrinoWarehouseClient(credentials);
            queryResultMock.mockReturnValue({
                next: vi
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

        it('sanitizes tag values that are unsafe for the header', async () => {
            const warehouse = new TrinoWarehouseClient(credentials);
            queryResultMock.mockReturnValue({
                next: vi
                    .fn()
                    .mockResolvedValue({ done: true, value: queryResponse }),
            });

            await warehouse.runQuery('SELECT 1', {
                scheduler_name: 'Weekly report, EMEA 📊',
                query_context: QueryExecutionContext.SCHEDULED_DELIVERY,
            });

            expect(queryResultMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    extraHeaders: {
                        'X-Trino-Client-Tags':
                            'scheduler_name=Weekly_report__EMEA___,query_context=scheduledDelivery',
                    },
                }),
            );
        });

        it('sends query as plain string (no extraHeaders) when no tags are provided', async () => {
            const warehouse = new TrinoWarehouseClient(credentials);
            queryResultMock.mockReturnValue({
                next: vi
                    .fn()
                    .mockResolvedValue({ done: true, value: queryResponse }),
            });

            await warehouse.runQuery('SELECT 1');

            expect(queryResultMock).toHaveBeenCalledWith('SELECT 1');
        });
    });
});
