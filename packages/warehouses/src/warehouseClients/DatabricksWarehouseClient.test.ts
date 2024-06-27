import { DatabricksWarehouseClient } from './DatabricksWarehouseClient';
import { credentials, rows, schema } from './DatabricksWarehouseClient.mock';
import { expectedFields } from './WarehouseClient.mock';

jest.mock('@databricks/sql', () => ({
    ...jest.requireActual('@databricks/sql'),
    DBSQLClient: jest.fn(() => ({
        connect: jest.fn(() => ({
            openSession: jest.fn(() => ({
                executeStatement: jest.fn(() => ({
                    getSchema: jest.fn(async () => schema),
                    fetchChunk: jest.fn(async () => rows),
                    hasMoreRows: jest.fn(async () => false),
                    close: jest.fn(async () => undefined),
                })),
                close: jest.fn(async () => undefined),
            })),
            close: jest.fn(async () => undefined),
        })),
    })),
}));

describe('DatabricksWarehouseClient', () => {
    it('expect query fields and rows', async () => {
        const warehouse = new DatabricksWarehouseClient(credentials);

        const results = await warehouse.runQuery('fake sql');

        expect(results.fields).toEqual(expectedFields);
        expect(results.rows[0]).toEqual(rows[0]);
    });
});
