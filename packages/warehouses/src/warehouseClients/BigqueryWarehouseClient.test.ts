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

describe('BigqueryWarehouseClient drive scope', () => {
    const getBigQueryConstructorOptions = async (
        driveScopeSetting?: 'false' | 'true',
    ) => {
        const { env } = process;
        let options: Record<string, unknown> = {};
        process.env = {
            ...env,
            ...(driveScopeSetting
                ? { AUTH_ENABLE_BIGQUERY_DRIVE_SCOPE: driveScopeSetting }
                : {}),
        };

        try {
            jest.resetModules();
            jest.doMock('@google-cloud/bigquery', () => ({
                BigQuery: jest.fn((opts) => {
                    options = opts ?? {};
                    return { createQueryJob: jest.fn() };
                }),
                Dataset: jest.fn(),
            }));
            const { BigqueryWarehouseClient: Client } =
                await import('./BigqueryWarehouseClient');
            void new Client(credentials);
            return options;
        } finally {
            process.env = env;
            jest.dontMock('@google-cloud/bigquery');
        }
    };

    it.each<
        [
            driveScopeSetting: 'false' | 'true' | undefined,
            expectedScopes: string[] | undefined,
        ]
    >([
        [undefined, undefined],
        ['false', undefined],
        [
            'true',
            [
                'https://www.googleapis.com/auth/bigquery',
                'https://www.googleapis.com/auth/drive.readonly',
            ],
        ],
    ])('drive scope %s', async (driveScopeSetting, expectedScopes) => {
        const bigQueryConstructorOptions =
            await getBigQueryConstructorOptions(driveScopeSetting);

        if (expectedScopes) {
            expect(bigQueryConstructorOptions.scopes).toEqual(expectedScopes);
        } else {
            expect(bigQueryConstructorOptions).not.toHaveProperty('scopes');
        }
    });
});

describe('BigqueryWarehouseClient.sanitizeLabelsWithValues', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('returns undefined when given no labels', () => {
        expect(
            BigqueryWarehouseClient.sanitizeLabelsWithValues(undefined),
        ).toBeUndefined();
    });

    it('lowercases and normalises string values', () => {
        expect(
            BigqueryWarehouseClient.sanitizeLabelsWithValues({
                Scheduler_Uuid: 'ABC-123',
            }),
        ).toEqual({ scheduler_uuid: 'abc-123' });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('coerces numeric values without crashing and logs a warning', () => {
        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues({
            job_id: 224187 as unknown as string,
        });
        expect(result).toEqual({ job_id: '224187' });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('coerced non-string label value'),
            { key: 'job_id', valueType: 'number' },
        );
    });

    it('replaces null/undefined with empty_value silently', () => {
        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues({
            scheduler_name: null as unknown as string,
            saved_sql_uuid: undefined as unknown as string,
        });
        expect(result).toEqual({
            scheduler_name: 'empty_value',
            saved_sql_uuid: 'empty_value',
        });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('coerces boolean values', () => {
        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues({
            embed: true as unknown as string,
        });
        expect(result).toEqual({ embed: 'true' });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ valueType: 'boolean' }),
        );
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
