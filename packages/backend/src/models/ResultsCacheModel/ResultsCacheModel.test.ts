import knex, { Knex } from 'knex';
import { MockClient, Tracker, getTracker } from 'knex-mock-client';
import { IResultsCacheStorageClient } from '../../clients/ResultsCacheStorageClients/ResultsCacheStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ResultsCacheModel } from './ResultsCacheModel';

// Mock storage client
const mockStorageClient = {
    createUploadStream: jest.fn().mockReturnValue({
        write: jest.fn(),
        close: jest.fn(),
    }),
    download: jest.fn(),
} as jest.Mocked<IResultsCacheStorageClient>;

describe('ResultsCacheModel', () => {
    let model: ResultsCacheModel;
    let tracker: Tracker;
    let db: Knex;

    beforeEach(() => {
        db = knex({ client: MockClient, dialect: 'pg' });
        tracker = getTracker();
        model = new ResultsCacheModel({
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
            const result = ResultsCacheModel.getCacheKey(projectUuid, { sql });
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64); // SHA-256 produces 64 character hex string
        });

        test('should generate correct hash with SQL and timezone', () => {
            const result = ResultsCacheModel.getCacheKey(projectUuid, {
                sql,
                timezone,
            });
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBe(64);
        });

        test('should generate different hashes for different projects with same SQL', () => {
            const projectUuid2 = 'different-project-uuid';
            const hash1 = ResultsCacheModel.getCacheKey(projectUuid, { sql });
            const hash2 = ResultsCacheModel.getCacheKey(projectUuid2, { sql });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hashes for same project with different SQL', () => {
            const sql2 = 'SELECT * FROM different_table';
            const hash1 = ResultsCacheModel.getCacheKey(projectUuid, { sql });
            const hash2 = ResultsCacheModel.getCacheKey(projectUuid, {
                sql: sql2,
            });
            expect(hash1).not.toBe(hash2);
        });

        test('should generate different hashes for same project and SQL but different timezone', () => {
            const timezone2 = 'America/New_York';
            const hash1 = ResultsCacheModel.getCacheKey(projectUuid, {
                sql,
                timezone,
            });
            const hash2 = ResultsCacheModel.getCacheKey(projectUuid, {
                sql,
                timezone: timezone2,
            });
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('createOrGetExistingCache', () => {
        const projectUuid = 'test-project-uuid';
        const sql = 'SELECT * FROM test_table';
        const cacheKey = 'test-cache-key';
        const now = new Date();
        const futureDate = new Date(now.getTime() + 3600000); // 1 hour in the future
        const pastDate = new Date(now.getTime() - 3600000); // 1 hour in the past

        beforeEach(() => {
            jest.spyOn(ResultsCacheModel, 'getCacheKey').mockReturnValue(
                cacheKey,
            );
            jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
        });

        test('should return existing cache when not expired and invalidateCache=false', async () => {
            const existingCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                total_row_count: 100,
            };

            tracker.on.select('results_cache').response([existingCache]);

            const result = await model.createOrGetExistingCache(
                projectUuid,
                { sql },
                mockStorageClient,
                false,
            );

            expect(result).toEqual({
                cacheKey,
                cacheHit: true,
                write: undefined,
                close: undefined,
                totalRowCount: 100,
            });
            expect(tracker.history.select).toHaveLength(1);
            expect(mockStorageClient.createUploadStream).not.toHaveBeenCalled();
        });

        test('should create new cache when no existing cache exists', async () => {
            tracker.on.select('results_cache').response([]);

            tracker.on
                .insert('results_cache')
                .response([{ cache_key: cacheKey }]);

            const result = await model.createOrGetExistingCache(
                projectUuid,
                { sql },
                mockStorageClient,
                false,
            );

            expect(result).toEqual({
                cacheKey,
                cacheHit: false,
                write: expect.any(Function),
                close: expect.any(Function),
                totalRowCount: null,
            });
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.insert).toHaveLength(1);
            expect(mockStorageClient.createUploadStream).toHaveBeenCalledWith(
                cacheKey,
                expect.any(Number),
            );
        });

        test('should delete expired cache and create new one when cache is expired', async () => {
            const expiredCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: pastDate,
                total_row_count: 100,
            };

            tracker.on.select('results_cache').response([expiredCache]);

            tracker.on.delete('results_cache').response([]);

            tracker.on
                .insert('results_cache')
                .response([{ cache_key: cacheKey }]);

            const result = await model.createOrGetExistingCache(
                projectUuid,
                { sql },
                mockStorageClient,
                false,
            );

            expect(result).toEqual({
                cacheKey,
                cacheHit: false,
                write: expect.any(Function),
                close: expect.any(Function),
                totalRowCount: null,
            });
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.insert).toHaveLength(1);
            expect(mockStorageClient.createUploadStream).toHaveBeenCalledWith(
                cacheKey,
                expect.any(Number),
            );
        });

        test('should delete existing cache and create new one when invalidateCache=true', async () => {
            const existingCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                total_row_count: 100,
            };

            tracker.on.select('results_cache').response([existingCache]);

            tracker.on.delete('results_cache').response([]);

            tracker.on
                .insert('results_cache')
                .response([{ cache_key: cacheKey }]);

            const result = await model.createOrGetExistingCache(
                projectUuid,
                { sql },
                mockStorageClient,
                true,
            );

            expect(result).toEqual({
                cacheKey,
                cacheHit: false,
                write: expect.any(Function),
                close: expect.any(Function),
                totalRowCount: null,
            });
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.insert).toHaveLength(1);
            expect(mockStorageClient.createUploadStream).toHaveBeenCalledWith(
                cacheKey,
                expect.any(Number),
            );
        });

        test('should handle errors during cache creation', async () => {
            tracker.on.select('results_cache').response([]);

            tracker.on.insert('results_cache').response([]);

            const mockWrite = jest.fn();
            const mockClose = jest.fn();
            mockStorageClient.createUploadStream.mockReturnValue({
                write: mockWrite,
                close: mockClose,
            });

            await expect(
                model.createOrGetExistingCache(
                    projectUuid,
                    { sql },
                    mockStorageClient,
                    false,
                ),
            ).rejects.toThrow('Failed to create cache');

            expect(mockClose).toHaveBeenCalled();
        });
    });
});
