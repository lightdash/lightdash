import { QueryHistoryModel } from './QueryHistoryModel';

describe('QueryHistoryModel', () => {
    describe('getCacheKey', () => {
        const projectUuid = 'test-project-uuid';
        const sql = 'SELECT * FROM test_table';
        const timezone = 'UTC';

        test('should generate correct hash with SQL only', () => {
            const result = QueryHistoryModel.getCacheKey(projectUuid, { sql });
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64); // SHA-256 produces 64 character hex string
        });

        test('should generate correct hash with SQL and timezone', () => {
            const result = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
            });
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64);
        });

        test('should generate different hashes for different projects with same SQL', () => {
            const projectUuid2 = 'different-project-uuid';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, { sql });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid2, { sql });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hashes for same project with different SQL', () => {
            const sql2 = 'SELECT * FROM different_table';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, { sql });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql: sql2,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hashes for same project and SQL but different timezone', () => {
            const timezone2 = 'America/New_York';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone: timezone2,
            });
            expect(hash1).not.toBe(hash2);
        });
    });
});
