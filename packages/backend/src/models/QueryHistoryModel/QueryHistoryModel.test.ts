import {
    Account,
    QueryExecutionContext,
    QueryHistory,
    QueryHistoryStatus,
} from '@lightdash/common';
import { Knex } from 'knex';
import { QueryHistoryModel } from './QueryHistoryModel';

describe('QueryHistoryModel', () => {
    describe('pollForQueryCompletion', () => {
        test('preserves the stored error name', async () => {
            const model = new QueryHistoryModel({ database: {} as Knex });
            vi.spyOn(model, 'get').mockResolvedValue({
                status: QueryHistoryStatus.ERROR,
                error: 'Warehouse query failed',
                errorName: 'WarehouseQueryError',
                context: QueryExecutionContext.EXPLORE,
            } as QueryHistory & { errorName: string });

            await expect(
                model.pollForQueryCompletion({
                    queryUuid: 'query-uuid',
                    account: {} as Account,
                    projectUuid: 'project-uuid',
                    initialBackoffMs: 1,
                    maxBackoffMs: 1,
                    timeoutMs: 100,
                }),
            ).rejects.toMatchObject({
                name: 'WarehouseQueryError',
                message: 'Warehouse query failed',
            });
        });
    });

    describe('getCacheKey', () => {
        const projectUuid = 'test-project-uuid';
        const sql = 'SELECT * FROM test_table';
        const timezone = 'UTC';

        test('should generate correct hash with SQL only', () => {
            const result = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                userUuid: null,
            });
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64); // SHA-256 produces 64 character hex string
        });

        test('should generate correct hash with SQL and timezone', () => {
            const result = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64);
        });

        test('data timezone changes the hash', () => {
            const withDataTz = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
                dataTimezone: 'Asia/Tokyo',
            });
            const withoutDataTz = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            const withOtherDataTz = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
                dataTimezone: 'America/New_York',
            });
            expect(withDataTz).not.toBe(withoutDataTz);
            expect(withDataTz).not.toBe(withOtherDataTz);
        });

        test('undefined data timezone keeps existing keys stable', () => {
            const explicitUndefined = QueryHistoryModel.getCacheKey(
                projectUuid,
                {
                    sql,
                    timezone,
                    userUuid: null,
                    dataTimezone: undefined,
                },
            );
            const omitted = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            expect(explicitUndefined).toBe(omitted);
        });

        test('data timezone component cannot collide with the display timezone component', () => {
            const displayOnly = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone: 'UTC',
                userUuid: null,
            });
            const dataOnly = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                userUuid: null,
                dataTimezone: 'UTC',
            });
            expect(displayOnly).not.toBe(dataOnly);
        });

        test('should generate different hashes for different projects with same SQL', () => {
            const projectUuid2 = 'different-project-uuid';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                userUuid: null,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid2, {
                sql,
                userUuid: null,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hashes for same project with different SQL', () => {
            const sql2 = 'SELECT * FROM different_table';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                userUuid: null,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql: sql2,
                userUuid: null,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hashes for same project and SQL but different timezone', () => {
            const timezone2 = 'America/New_York';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone: timezone2,
                userUuid: null,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate same hash when userUuid is null (backward compatibility)', () => {
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            expect(hash1).toBe(hash2);
        });

        test('should generate different hashes for different users', () => {
            const userUuid1 = 'user-uuid-1';
            const userUuid2 = 'user-uuid-2';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: userUuid1,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: userUuid2,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate same hash for same user', () => {
            const userUuid = 'user-uuid-1';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid,
            });
            expect(hash1).toBe(hash2);
        });

        test('should generate different hash with vs without user UUID', () => {
            const userUuid = 'user-uuid-1';
            const hash1 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid: null,
            });
            const hash2 = QueryHistoryModel.getCacheKey(projectUuid, {
                sql,
                timezone,
                userUuid,
            });
            expect(hash1).not.toBe(hash2);
        });
    });
});
