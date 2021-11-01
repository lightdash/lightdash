import { createConnection } from 'snowflake-sdk';
import PostgresWarehouseClient from './PostgresWarehouseClient';
import { columns, credentials } from './PostgresWarehouseClient.mock';
import {
    config,
    expectedRow,
    expectedWarehouseSchema,
} from './WarehouseClient.mock';

jest.mock('snowflake-sdk', () => ({
    ...jest.requireActual('snowflake-sdk'),
    createConnection: jest.fn(() => ({
        connect: jest.fn(),
        execute: jest.fn(({ sqlText, complete }) => {
            complete(undefined, undefined, [expectedRow]);
        }),
        destroy: jest.fn(),
    })),
}));

describe('PostgresWarehouseClient', () => {
    it('expect query rows', async () => {
        const warehouse = new PostgresWarehouseClient(credentials);
        expect((await warehouse.runQuery('fake sql'))[0]).toEqual(expectedRow);
    });
    it('expect schema with bigquery types mapped to dimension types', async () => {
        (createConnection as jest.Mock).mockImplementationOnce(() => ({
            connect: jest.fn(),
            execute: jest.fn(({ sqlText, complete }) => {
                complete(undefined, undefined, columns);
            }),
            destroy: jest.fn(),
        }));
        const warehouse = new PostgresWarehouseClient(credentials);
        expect(await warehouse.getSchema(config)).toEqual(
            expectedWarehouseSchema,
        );
    });
});
