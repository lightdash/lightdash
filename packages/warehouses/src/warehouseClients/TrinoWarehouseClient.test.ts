/* eslint-disable @typescript-eslint/no-floating-promises */
import { AnyType, DimensionType } from '@lightdash/common';
import { Columns, Iterator, QueryData, QueryResult, Trino } from 'trino-client';
import {
    forceLowercaseColumns,
    TrinoTypes,
    TrinoWarehouseClient,
} from './TrinoWarehouseClient';
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

describe('forceLowercaseColumns', () => {
    const lowerCasedFields: Record<string, AnyType> = {
        mystringcolumn: { type: DimensionType.STRING },
        mynumbercolumn: { type: DimensionType.NUMBER },
    };
    it('should return false when all columns match their case', () => {
        const schema = [{ name: 'mystringcolumn' }, { name: 'mynumbercolumn' }];
        const result = forceLowercaseColumns(schema, lowerCasedFields);
        expect(result).toBe(false);
    });
    it('should return true when some columns are found by forcing lowercase', () => {
        const schema = [{ name: 'MYSTRINGCOLUMN' }, { name: 'mynumbercolumn' }];
        const consoleSpy = jest.spyOn(console, 'warn');
        const result = forceLowercaseColumns(schema, lowerCasedFields);
        expect(result).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(
            'Forcing Trino column names to lowercase',
        );
        consoleSpy.mockRestore();
    });

    it('should return false when no fields are provided', () => {
        const schema = [{ name: 'ColumnA' }, { name: 'ColumnB' }];

        const result = forceLowercaseColumns(schema, {});
        expect(result).toBe(false);
    });

    it('should return false when columns do not match even after forcing lowercase', () => {
        const schema = [{ name: 'ColumnA' }, { name: 'ColumnB' }];
        const consoleSpy = jest.spyOn(console, 'warn');
        const result = forceLowercaseColumns(schema, {
            myStringColumn: { type: DimensionType.STRING },
        });
        expect(result).toBe(false);
        expect(consoleSpy).toHaveBeenCalledWith(
            'Could not match columns on Trino results, expected myStringColumn but found ColumnA, ColumnB',
        );
        consoleSpy.mockRestore();
    });
});
