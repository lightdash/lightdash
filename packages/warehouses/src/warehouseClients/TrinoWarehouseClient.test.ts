/* eslint-disable @typescript-eslint/no-floating-promises */
import { DimensionType } from '@lightdash/common';
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
    it('expect query rows', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: jest
                .fn()
                .mockResolvedValue({ done: true, value: queryResponse }),
        });
        const results = await warehouse.runQuery('fake sql');
        expect(results.rows[0]).toEqual(wharehouseClient.expectedRow);
        expect(results.fields).toEqual(wharehouseClient.expectedFields);
    });

    it('expect query has mutiple result chunks', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        queryResultMock.mockReturnValue({
            next: jest
                .fn()
                .mockResolvedValueOnce({ done: false, value: queryResponse })
                .mockResolvedValueOnce({ done: true, value: queryResponse }),
        });
        const results = await warehouse.runQuery('fake sql');
        expect(results.rows[0]).toEqual(wharehouseClient.expectedRow);
        expect(results.fields).toEqual(wharehouseClient.expectedFields);
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
});
