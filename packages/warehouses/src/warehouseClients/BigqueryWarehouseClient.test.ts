import { Dataset } from '@google-cloud/bigquery';
import type { Mock, MockInstance } from 'vitest';
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

        (warehouse.client.createQueryJob as Mock) = vi.fn(
            () => createJobResponse,
        );

        const results = await warehouse.runQuery('fake sql');

        expect(results.fields).toEqual(expectedFields);
        expect(results.rows[0]).toEqual(expectedRow);
        expect(warehouse.client.createQueryJob as Mock).toHaveBeenCalledTimes(
            1,
        );
    });
    it('expect schema with bigquery types mapped to dimension types', async () => {
        const getTableMock = vi
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

describe('BigqueryWarehouseClient.sanitizeLabelsWithValues', () => {
    let warnSpy: MockInstance;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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

    it('sanitizes user attribute query tags for BigQuery labels', () => {
        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues({
            'user_attribute_User Tier': 'Enterprise Customer/EMEA',
            user_attribute_company: "O'Reilly Media",
        });
        expect(result).toEqual({
            user_attribute_user_tier: 'enterprise_customer_emea',
            user_attribute_company: 'o_reilly_media',
        });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('limits labels to the BigQuery maximum', () => {
        const labels = Object.fromEntries(
            Array.from({ length: 70 }, (_, index) => [
                `user_attribute_${index}`,
                `value_${index}`,
            ]),
        );

        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues(labels);

        expect(Object.keys(result ?? {})).toHaveLength(64);
    });

    it('keeps non-user-attribute labels when user attributes exceed the BigQuery maximum', () => {
        const labels = {
            ...Object.fromEntries(
                Array.from({ length: 70 }, (_, index) => [
                    `user_attribute_${index}`,
                    `value_${index}`,
                ]),
            ),
            query_uuid: 'query-uuid',
        };

        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues(labels);

        expect(result).toEqual(
            expect.objectContaining({ query_uuid: 'query-uuid' }),
        );
        expect(Object.keys(result ?? {})).toHaveLength(64);
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
