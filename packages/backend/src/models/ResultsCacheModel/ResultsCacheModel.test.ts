import { ExpiredError, NotFoundError, ResultRow } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { MockClient, Tracker, getTracker } from 'knex-mock-client';
import { Readable } from 'stream';
import { IResultsCacheStorageClient } from '../../clients/ResultsCacheStorageClients/ResultsCacheStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    ResultsCacheTableName,
    type DbResultsCache,
} from '../../database/entities/resultsCache';
import { ResultsCacheModel } from './ResultsCacheModel';

// Mock storage client
const mockStorageClient = {
    createUploadStream: jest.fn().mockReturnValue({
        write: jest.fn(),
        close: jest.fn(),
    }),
    getDowloadStream: jest.fn(),
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
        const futureDateCreatedAt = new Date(
            futureDate.getTime() - 24 * 60 * 60 * 1000,
        ); // one day in the past
        const pastDate = new Date(now.getTime() - 3600000); // 1 hour in the past
        const pastDateCreatedAt = new Date(
            pastDate.getTime() - 24 * 60 * 60 * 1000,
        ); // one day in the past

        beforeEach(() => {
            jest.spyOn(ResultsCacheModel, 'getCacheKey').mockReturnValue(
                cacheKey,
            );
            jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
        });

        test('should return existing cache when not expired and invalidateCache=false', async () => {
            const existingCache: DbResultsCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                created_at: futureDateCreatedAt,
                updated_at: futureDateCreatedAt,
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
                createdAt: futureDateCreatedAt,
                updatedAt: futureDateCreatedAt,
                expiresAt: futureDate,
            });
            expect(tracker.history.select).toHaveLength(1);
            expect(mockStorageClient.createUploadStream).not.toHaveBeenCalled();
        });

        test('should create new cache when no existing cache exists', async () => {
            tracker.on.select('results_cache').response([]);

            tracker.on.insert('results_cache').response([
                {
                    cache_key: cacheKey,
                    expires_at: futureDate,
                    created_at: futureDateCreatedAt,
                    updated_at: futureDateCreatedAt,
                },
            ]);

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
                createdAt: futureDateCreatedAt,
                updatedAt: futureDateCreatedAt,
                expiresAt: futureDate,
            });
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.insert).toHaveLength(1);
            expect(mockStorageClient.createUploadStream).toHaveBeenCalledWith(
                cacheKey,
                expect.any(Number),
            );
        });

        test('should update expired cache and reset total row count when cache is expired', async () => {
            const expiredCache: DbResultsCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: pastDate,
                created_at: pastDateCreatedAt,
                updated_at: pastDateCreatedAt,
                total_row_count: 100,
            };

            tracker.on.select('results_cache').response([expiredCache]);

            tracker.on.update('results_cache').response(1);

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
                createdAt: pastDateCreatedAt,
                updatedAt: expect.any(Date),
                expiresAt: expect.any(Date),
            });
            expect(result.updatedAt.getTime()).toBeGreaterThan(
                pastDateCreatedAt.getTime(),
            );
            expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.update).toHaveLength(1);
            expect(tracker.history.update[0].bindings).toEqual([
                expect.any(Date), // expires_at
                expect.any(Date), // updated_at
                cacheKey,
                projectUuid,
            ]);
            expect(mockStorageClient.createUploadStream).toHaveBeenCalledWith(
                cacheKey,
                expect.any(Number),
            );
        });

        test('should update existing cache and reset total row count when invalidateCache=true', async () => {
            const existingCache: DbResultsCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                total_row_count: 100,
                created_at: futureDateCreatedAt,
                updated_at: futureDateCreatedAt,
            };

            tracker.on.select('results_cache').response([existingCache]);

            tracker.on.update('results_cache').response(1);

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
                createdAt: futureDateCreatedAt,
                updatedAt: expect.any(Date),
                expiresAt: expect.any(Date),
            });
            expect(result.updatedAt.getTime()).toBeGreaterThan(
                futureDateCreatedAt.getTime(),
            );
            expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.update).toHaveLength(1);
            expect(tracker.history.update[0].bindings).toEqual([
                expect.any(Date), // expires_at
                expect.any(Date), // updated_at
                cacheKey,
                projectUuid,
            ]);
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

    describe('getCachedResultsPage', () => {
        const projectUuid = 'test-project-uuid';
        const cacheKey = 'test-cache-key';
        const now = new Date();
        const futureDate = new Date(now.getTime() + 3600000); // 1 hour in the future
        const pastDate = new Date(now.getTime() - 3600000); // 1 hour in the past
        const mockRows = [
            '{"value":"test1"}',
            '{"value":"test2"}',
            '{"value":"test3"}',
            '{"value":"test4"}',
        ];

        const getMockStream = (rows: string[]) =>
            new Readable({
                objectMode: true,
                read() {
                    for (const row of rows) {
                        this.push(`${row}\n`);
                    }
                    this.push(null);
                },
            });

        const mockFormatter = (row: ResultRow): ResultRow => row;

        beforeEach(() => {
            jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
        });

        test('should return paginated results with formatting', async () => {
            const existingCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                total_row_count: 100,
            };

            tracker.on.select(ResultsCacheTableName).response([existingCache]);

            mockStorageClient.getDowloadStream.mockResolvedValue(
                getMockStream(mockRows),
            );

            const result = await model.getCachedResultsPage(
                cacheKey,
                projectUuid,
                1, // page
                10, // pageSize
                mockStorageClient,
                mockFormatter,
            );

            expect(result).toEqual({
                rows: [
                    { value: 'test1' },
                    { value: 'test2' },
                    { value: 'test3' },
                    { value: 'test4' },
                ],
                totalRowCount: 100,
                expiresAt: futureDate,
            });

            expect(mockStorageClient.getDowloadStream).toHaveBeenCalledWith(
                cacheKey,
            );
        });

        test('should handle empty results', async () => {
            const existingCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                total_row_count: 0,
            };

            const emptyMockStream = Readable.from([]);

            tracker.on.select(ResultsCacheTableName).response([existingCache]);

            mockStorageClient.getDowloadStream.mockResolvedValue(
                emptyMockStream,
            );

            const result = await model.getCachedResultsPage(
                cacheKey,
                projectUuid,
                1,
                10,
                mockStorageClient,
                mockFormatter,
            );

            expect(result).toEqual({
                rows: [],
                totalRowCount: 0,
                expiresAt: futureDate,
            });
        });

        test('should throw NotFoundError when cache does not exist', async () => {
            tracker.on.select(ResultsCacheTableName).response([]);

            await expect(
                model.getCachedResultsPage(
                    cacheKey,
                    projectUuid,
                    1,
                    10,
                    mockStorageClient,
                    mockFormatter,
                ),
            ).rejects.toThrow(NotFoundError);

            expect(mockStorageClient.getDowloadStream).not.toHaveBeenCalled();
        });

        test('should throw ExpiredError when cache is expired', async () => {
            const expiredCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: pastDate,
                total_row_count: 100,
            };

            tracker.on.select(ResultsCacheTableName).response([expiredCache]);

            tracker.on.delete(ResultsCacheTableName).response([]);

            await expect(
                model.getCachedResultsPage(
                    cacheKey,
                    projectUuid,
                    1,
                    10,
                    mockStorageClient,
                    mockFormatter,
                ),
            ).rejects.toThrow(ExpiredError);

            expect(mockStorageClient.getDowloadStream).not.toHaveBeenCalled();
            expect(tracker.history.delete).toHaveLength(1);
        });

        test('should handle pagination correctly', async () => {
            const existingCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                total_row_count: 100,
            };

            tracker.on.select(ResultsCacheTableName).response([existingCache]);

            mockStorageClient.getDowloadStream.mockResolvedValue(
                getMockStream(mockRows),
            );

            const result = await model.getCachedResultsPage(
                cacheKey,
                projectUuid,
                2, // page
                2, // pageSize
                mockStorageClient,
                mockFormatter,
            );

            expect(result).toEqual({
                rows: [{ value: 'test3' }, { value: 'test4' }],
                totalRowCount: 100,
                expiresAt: futureDate,
            });

            expect(mockStorageClient.getDowloadStream).toHaveBeenCalledWith(
                cacheKey,
            );
        });

        test('should handle empty lines in results', async () => {
            const existingCache = {
                cache_key: cacheKey,
                project_uuid: projectUuid,
                expires_at: futureDate,
                total_row_count: 100,
            };

            const mockRowsWithEmptyLines = [
                '{"value":"test1"}',
                '',
                '{"value":"test2"}',
                '   ',
                '{"value":"test3"}',
            ];

            const mockStreamWithEmptyLines = new Readable({
                objectMode: true,
                read() {
                    for (const row of mockRowsWithEmptyLines) {
                        this.push(`${row}\n`);
                    }
                    this.push(null);
                },
            });

            tracker.on.select(ResultsCacheTableName).response([existingCache]);

            mockStorageClient.getDowloadStream.mockResolvedValue(
                mockStreamWithEmptyLines,
            );

            const result = await model.getCachedResultsPage(
                cacheKey,
                projectUuid,
                1,
                3,
                mockStorageClient,
                mockFormatter,
            );

            expect(result).toEqual({
                rows: [
                    { value: 'test1' },
                    { value: 'test2' },
                    { value: 'test3' },
                ],
                totalRowCount: 100,
                expiresAt: futureDate,
            });
        });
    });
});
