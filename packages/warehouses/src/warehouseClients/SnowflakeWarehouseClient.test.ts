import { DimensionType } from '@lightdash/common';
import { createConnection } from 'snowflake-sdk';
import {
    mapFieldType,
    SnowflakeWarehouseClient,
} from './SnowflakeWarehouseClient';
import {
    columns,
    credentials,
    expectedFields,
    expectedRow,
    expectedWarehouseSchema,
    queryColumnsMock,
} from './SnowflakeWarehouseClient.mock';
import { config } from './WarehouseClient.mock';

jest.mock('snowflake-sdk', () => ({
    ...jest.requireActual('snowflake-sdk'),
    createConnection: jest.fn(() => ({
        connect: jest.fn((callback) => callback(null, {})),
        execute: jest.fn(({ sqlText, complete }) => {
            complete(undefined, { getColumns: () => queryColumnsMock }, [
                expectedRow,
            ]);
        }),
        destroy: jest.fn((callback) => callback(null, {})),
    })),
}));

describe('SnowflakeWarehouseClient', () => {
    it('expect query rows', async () => {
        const warehouse = new SnowflakeWarehouseClient(credentials);
        const results = await warehouse.runQuery('fake sql');
        expect(results.fields).toEqual(expectedFields);
        expect(results.rows[0]).toEqual(expectedRow);
    });
    it('expect schema with snowflake types mapped to dimension types', async () => {
        (createConnection as jest.Mock).mockImplementationOnce(() => ({
            connect: jest.fn((callback) => callback(null, {})),
            execute: jest.fn(({ sqlText, complete }) => {
                complete(
                    undefined,
                    { getColumns: () => queryColumnsMock },
                    columns,
                );
            }),
            destroy: jest.fn((callback) => callback(null, {})),
        }));
        const warehouse = new SnowflakeWarehouseClient(credentials);
        expect(await warehouse.getCatalog(config)).toEqual(
            expectedWarehouseSchema,
        );
    });
});

describe('SnowflakeTypeParsing', () => {
    it('expect NUMBER(x,x) to be a number', () => {
        expect(mapFieldType('NUMBER(12,10)')).toEqual(DimensionType.NUMBER);
    });
    it('expect VARCHAR(x) to be a string', () => {
        expect(mapFieldType('VARCHAR(12)')).toEqual(DimensionType.STRING);
    });
});
