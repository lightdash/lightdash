import { DimensionType } from 'common';
import { createConnection } from 'snowflake-sdk';
import SnowflakeWarehouseClient, {
    mapFieldType,
} from './SnowflakeWarehouseClient';
import { columns, credentials } from './SnowflakeWarehouseClient.mock';
import {
    config,
    expectedRow,
    expectedWarehouseSchema,
} from './WarehouseClient.mock';

jest.mock('snowflake-sdk', () => ({
    ...jest.requireActual('snowflake-sdk'),
    createConnection: jest.fn(() => ({
        connect: jest.fn((callback) => callback(null, {})),
        execute: jest.fn(({ sqlText, complete }) => {
            complete(undefined, undefined, [expectedRow]);
        }),
        destroy: jest.fn(),
    })),
}));

describe('SnowflakeWarehouseClient', () => {
    it('expect query rows', async () => {
        const warehouse = new SnowflakeWarehouseClient(credentials);
        expect((await warehouse.runQuery('fake sql'))[0]).toEqual(expectedRow);
    });
    it('expect schema with snowflake types mapped to dimension types', async () => {
        (createConnection as jest.Mock).mockImplementationOnce(() => ({
            connect: jest.fn((callback) => callback(null, {})),
            execute: jest.fn(({ sqlText, complete }) => {
                complete(undefined, undefined, columns);
            }),
            destroy: jest.fn(),
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
