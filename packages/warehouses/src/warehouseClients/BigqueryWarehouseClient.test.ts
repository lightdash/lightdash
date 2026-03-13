import { Dataset } from '@google-cloud/bigquery';
import {
    BigquerySqlBuilder,
    BigqueryWarehouseClient,
} from './BigqueryWarehouseClient';
import {
    createJobResponse,
    credentials,
    getTableResponse,
    rows,
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

    it('batches async query result callbacks', async () => {
        const warehouse = new BigqueryWarehouseClient(credentials);
        type MockJob = {
            id: string;
            location: string;
            metadata: {
                statistics: {
                    startTime: number;
                    endTime: number;
                };
            };
            getQueryResults: jest.Mock;
            getQueryResultsStream: jest.Mock;
            on: jest.Mock;
        };

        const job = {} as MockJob;
        Object.assign(job, {
            id: 'job-1',
            location: 'US',
            metadata: {
                statistics: {
                    startTime: 1,
                    endTime: 11,
                },
            },
            getQueryResults: jest.fn(() => [
                rows,
                undefined,
                createJobResponse[0].getQueryResults()[2],
            ]),
            getQueryResultsStream: createJobResponse[0].getQueryResultsStream,
            on: jest.fn((event, callback) => {
                if (event === 'complete') callback();
                return job;
            }),
        });

        (warehouse.client.createQueryJob as jest.Mock) = jest.fn(() => [job]);

        const callback = jest.fn();
        const result = await warehouse.executeAsyncQuery(
            {
                sql: 'fake sql',
                tags: {},
            },
            callback,
        );

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith([expectedRow], expectedFields);
        expect(result).toEqual({
            queryId: 'job-1',
            queryMetadata: {
                type: 'bigquery',
                jobLocation: 'US',
            },
            totalRows: 1,
            durationMs: 10,
        });
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

    test('Should NOT remove # comments from strings', () => {
        // Test that # symbols are preserved in strings (not treated as comments)
        const stringWithHash = 'Column name with # symbol';
        const escaped = bigquerySqlBuilder.escapeString(stringWithHash);
        expect(escaped).toBe('Column name with # symbol');

        // Test that # at start of line is preserved
        const hashAtStart = '#important-tag';
        const escapedHashStart = bigquerySqlBuilder.escapeString(hashAtStart);
        expect(escapedHashStart).toBe('#important-tag');

        // Test multiple # symbols are preserved
        const multipleHashes = 'value1#value2#value3';
        const escapedMultiple = bigquerySqlBuilder.escapeString(multipleHashes);
        expect(escapedMultiple).toBe('value1#value2#value3');
    });

    test('Should still remove -- and /* */ comments', () => {
        // Test that -- comments are still removed
        const stringWithDashComment = 'test value -- this is a comment';
        const escapedDash = bigquerySqlBuilder.escapeString(
            stringWithDashComment,
        );
        expect(escapedDash).toBe('test value ');

        // Test that /* */ comments are still removed
        const stringWithBlockComment = 'test /* block comment */ value';
        const escapedBlock = bigquerySqlBuilder.escapeString(
            stringWithBlockComment,
        );
        expect(escapedBlock).toBe('test  value');
    });
});
