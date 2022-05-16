import { columns, credentials } from './PostgresWarehouseClient.mock';
import {
    config,
    expectedRow,
    expectedWarehouseSchema,
} from './WarehouseClient.mock';
import { PostgresWarehouseClient } from './PostgresWarehouseClient';

jest.mock('pg', () => ({
    ...jest.requireActual('pg'),
    Pool: jest.fn(() => ({
        query: jest.fn(() => ({ rows: [expectedRow] })),
    })),
}));

describe('PostgresWarehouseClient', () => {
    it('expect query rows', async () => {
        const warehouse = new PostgresWarehouseClient(credentials);
        expect((await warehouse.runQuery('fake sql'))[0]).toEqual(expectedRow);
    });
    it('expect schema with postgres types mapped to dimension types', async () => {
        const warehouse = new PostgresWarehouseClient(credentials);
        (warehouse.pool.query as jest.Mock).mockImplementationOnce(() => ({
            rows: columns,
        }));
        expect(await warehouse.getCatalog(config)).toEqual(
            expectedWarehouseSchema,
        );
    });
});
