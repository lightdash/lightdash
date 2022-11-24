import { TrinoWarehouseClient } from './TrinoWarehouseClient';
import {
    columns,
    credentials,
    queryColumnsMock,
} from './TrinoWarehouseClient.mock';
import {
    config,
    expectedFields,
    expectedRow,
    expectedWarehouseSchema,
} from './WarehouseClient.mock';

jest.mock('pg', () => ({
    ...jest.requireActual('pg'),
    Pool: jest.fn(() => ({
        query: jest.fn(() => ({
            fields: queryColumnsMock,
            rows: [expectedRow],
        })),
    })),
}));

describe('TrinoWarehouseClient', () => {
    it('expect query rows', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        const results = await warehouse.runQuery('fake sql');
        expect(results.fields).toEqual(expectedFields);
        expect(results.rows[0]).toEqual(expectedRow);
    });
    it('expect schema with postgres types mapped to dimension types', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        (warehouse.runQuery as jest.Mock).mockImplementationOnce(() => ({
            fields: queryColumnsMock,
            rows: columns,
        }));
        expect(await warehouse.getCatalog(config)).toEqual(
            expectedWarehouseSchema,
        );
    });
    it('expect empty catalog when dbt project has no references', async () => {
        const warehouse = new TrinoWarehouseClient(credentials);
        expect(await warehouse.getCatalog([])).toEqual({});
    });
});
