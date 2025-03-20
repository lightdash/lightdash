/* eslint-disable @typescript-eslint/no-floating-promises */
import { AnyType, DimensionType } from '@lightdash/common';
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
                .mockResolvedValueOnce({ done: false, value: queryResponse })
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
});
