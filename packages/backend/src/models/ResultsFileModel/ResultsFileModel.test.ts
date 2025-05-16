import knex, { Knex } from 'knex';
import { MockClient, Tracker, getTracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ResultsCacheTableName } from '../../database/entities/resultsFile';
import { ResultsCacheStatus } from '../../services/CacheService/types';
import { ResultsFileModel } from './ResultsFileModel';

describe('ResultsFileModel', () => {
    let model: ResultsFileModel;
    let tracker: Tracker;
    let db: Knex;

    beforeEach(() => {
        db = knex({ client: MockClient, dialect: 'pg' });
        tracker = getTracker();
        model = new ResultsFileModel({
            database: db,
            lightdashConfig: lightdashConfigMock,
        });
    });

    afterEach(() => {
        tracker.reset();
        jest.clearAllMocks();
    });

    describe('getCacheKey', () => {
        const projectUuid = 'test-project-uuid';
        const sql = 'SELECT * FROM test_table';
        const timezone = 'UTC';

        test('should generate correct hash with SQL only', () => {
            const result = ResultsFileModel.getCacheKey(projectUuid, { sql });
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64); // SHA-256 produces 64 character hex string
        });

        test('should generate correct hash with SQL and timezone', () => {
            const result = ResultsFileModel.getCacheKey(projectUuid, {
                sql,
                timezone,
            });
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64);
        });

        test('should generate different hashes for different projects with same SQL', () => {
            const projectUuid2 = 'different-project-uuid';
            const hash1 = ResultsFileModel.getCacheKey(projectUuid, { sql });
            const hash2 = ResultsFileModel.getCacheKey(projectUuid2, { sql });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hashes for same project with different SQL', () => {
            const sql2 = 'SELECT * FROM different_table';
            const hash1 = ResultsFileModel.getCacheKey(projectUuid, { sql });
            const hash2 = ResultsFileModel.getCacheKey(projectUuid, {
                sql: sql2,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hashes for same project and SQL but different timezone', () => {
            const timezone2 = 'America/New_York';
            const hash1 = ResultsFileModel.getCacheKey(projectUuid, {
                sql,
                timezone,
            });
            const hash2 = ResultsFileModel.getCacheKey(projectUuid, {
                sql,
                timezone: timezone2,
            });
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('create', () => {
        const projectUuid = 'test-project-uuid';
        const cacheKey = 'test-cache-key';
        const now = new Date();
        const futureDate = new Date(now.getTime() + 3600000); // 1 hour in the future

        test('should successfully create cache metadata', async () => {
            const newCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                total_row_count: 100,
                status: ResultsCacheStatus.READY,
                columns: null,
            };

            const expectedResponse = {
                cache_key: cacheKey,
                created_at: now,
                updated_at: now,
                expires_at: futureDate,
                status: ResultsCacheStatus.READY,
            };

            tracker.on
                .insert(ResultsCacheTableName)
                .response([expectedResponse]);

            const result = await model.create(newCache);

            expect(result).toEqual(expectedResponse);
            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.insert[0].bindings).toEqual([
                cacheKey,
                futureDate,
                projectUuid,
                ResultsCacheStatus.READY,
                100,
            ]);
        });

        test('should create cache metadata with null total_row_count', async () => {
            const newCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                total_row_count: null,
                status: ResultsCacheStatus.READY,
                columns: null,
            };

            const expectedResponse = {
                cache_key: cacheKey,
                created_at: now,
                updated_at: now,
                expires_at: futureDate,
                status: ResultsCacheStatus.READY,
            };

            tracker.on
                .insert(ResultsCacheTableName)
                .response([expectedResponse]);

            const result = await model.create(newCache);

            expect(result).toEqual(expectedResponse);
            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.insert[0].bindings).toEqual([
                cacheKey,
                futureDate,
                projectUuid,
                ResultsCacheStatus.READY,
                null,
            ]);
        });
    });

    describe('update', () => {
        const projectUuid = 'test-project-uuid';
        const cacheKey = 'test-cache-key';
        const update = {
            total_row_count: 100,
            expires_at: new Date(),
        };

        test('should successfully update cache metadata', async () => {
            tracker.on.update(ResultsCacheTableName).response(1);

            const result = await model.update(cacheKey, projectUuid, update);

            expect(result).toBe(1);
            expect(tracker.history.update).toHaveLength(1);
            expect(tracker.history.update[0].bindings).toEqual([
                update.total_row_count,
                update.expires_at,
                cacheKey,
                projectUuid,
            ]);
        });

        test('should handle non-existent cache', async () => {
            tracker.on.update(ResultsCacheTableName).response(0);

            const result = await model.update(cacheKey, projectUuid, update);

            expect(result).toBe(0);
            expect(tracker.history.update).toHaveLength(1);
        });
    });

    describe('find', () => {
        const projectUuid = 'test-project-uuid';
        const cacheKey = 'test-cache-key';
        const now = new Date();
        const futureDate = new Date(now.getTime() + 3600000); // 1 hour in the future

        beforeEach(() => {
            jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
        });

        test('should find existing cache', async () => {
            const existingCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                total_row_count: 100,
            };

            tracker.on.select(ResultsCacheTableName).response([existingCache]);

            const result = await model.find(cacheKey, projectUuid);

            expect(result).toEqual(existingCache);
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.select[0].bindings).toContain(cacheKey);
            expect(tracker.history.select[0].bindings).toContain(projectUuid);
        });

        test('should return undefined for non-existent cache', async () => {
            tracker.on.select(ResultsCacheTableName).response([]);

            const result = await model.find(cacheKey, projectUuid);

            expect(result).toBeUndefined();
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.select[0].bindings).toContain(cacheKey);
            expect(tracker.history.select[0].bindings).toContain(projectUuid);
        });

        test('should only find cache for specified project', async () => {
            const differentProjectUuid = 'different-project-uuid';
            tracker.on.select(ResultsCacheTableName).response([]);

            const result = await model.find(cacheKey, differentProjectUuid);

            expect(result).toBeUndefined();
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.select[0].bindings).toContain(cacheKey);
            expect(tracker.history.select[0].bindings).toContain(
                differentProjectUuid,
            );
        });
    });
});
