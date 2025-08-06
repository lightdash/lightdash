import { Dataset } from '@google-cloud/bigquery';
import {
    BigquerySqlBuilder,
    BigqueryWarehouseClient,
} from './BigqueryWarehouseClient';
import {
    createJobResponse,
    credentials,
    getTableResponse,
} from './BigqueryWarehouseClient.mock';
import {
    config,
    expectedFields,
    expectedRow,
    expectedWarehouseSchema,
} from './WarehouseClient.mock';

describe('BigqueryWarehouseClient', () => {
    it('expect query rows with mapped values', async () => {
        const warehouse = new BigqueryWarehouseClient(credentials);

        (warehouse.client.createQueryJob as jest.Mock) = jest.fn(
            () => createJobResponse,
        );

        const results = await warehouse.runQuery('fake sql');

        expect(results.fields).toEqual(expectedFields);
        expect(results.rows[0]).toEqual(expectedRow);
        expect(
            warehouse.client.createQueryJob as jest.Mock,
        ).toHaveBeenCalledTimes(1);
    });
    it('expect schema with bigquery types mapped to dimension types', async () => {
        const getTableMock = jest
            .fn()
            .mockImplementationOnce(() => getTableResponse);
        Dataset.prototype.table = getTableMock;
        const warehouse = new BigqueryWarehouseClient(credentials);
        expect(await warehouse.getCatalog(config)).toEqual(
            expectedWarehouseSchema,
        );
        expect(getTableMock).toHaveBeenCalledTimes(1);
        expect(getTableResponse.getMetadata).toHaveBeenCalledTimes(1);
    });
});

describe('BigquerySqlBuilder escaping', () => {
    const bigquerySqlBuilder = new BigquerySqlBuilder();

    test('Should escape backslashes and quotes in bigquery', () => {
        expect(bigquerySqlBuilder.escapeString("\\') OR (1=1) --")).toBe(
            "\\\\\\') OR (1=1) ",
        );
    });

    test('Should handle SQL injection attempts', () => {
        // Test with a typical SQL injection pattern
        const maliciousInput = "'; DROP TABLE users; --";
        const escaped = bigquerySqlBuilder.escapeString(maliciousInput);
        expect(escaped).toBe("\\'; DROP TABLE users; ");

        // Test with another common SQL injection pattern
        const anotherMaliciousInput = "' OR '1'='1";
        const anotherEscaped = bigquerySqlBuilder.escapeString(
            anotherMaliciousInput,
        );
        expect(anotherEscaped).toBe("\\' OR \\'1\\'=\\'1");
    });
});
