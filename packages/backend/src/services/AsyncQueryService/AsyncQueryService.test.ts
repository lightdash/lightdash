import {
    NotFoundError,
    QueryExecutionContext,
    QueryHistoryStatus,
    type CreateWarehouseCredentials,
    type ExecuteAsyncQueryRequestParams,
    type QueryHistory,
} from '@lightdash/common';
import type { SshTunnel } from '@lightdash/warehouses';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import type { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import { S3Client } from '../../clients/Aws/S3Client';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { type S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../config/parseConfig';
import type { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import type { ContentModel } from '../../models/ContentModel/ContentModel';
import type { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { DownloadFileModel } from '../../models/DownloadFileModel';
import type { EmailModel } from '../../models/EmailModel';
import type { GroupsModel } from '../../models/GroupsModel';
import type { JobModel } from '../../models/JobModel/JobModel';
import type { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { projectUuid } from '../../models/ProjectModel/ProjectModel.mock';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel';
import { type ResultsFileModel } from '../../models/ResultsFileModel/ResultsFileModel';
import type { SavedChartModel } from '../../models/SavedChartModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import type { SpaceModel } from '../../models/SpaceModel';
import type { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { TagsModel } from '../../models/TagsModel';
import type { UserAttributesModel } from '../../models/UserAttributesModel';
import type { UserModel } from '../../models/UserModel';
import type { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import type { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { warehouseClientMock } from '../../queryBuilder.mock';
import type { SchedulerClient } from '../../scheduler/SchedulerClient';
import type { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import type { ICacheService } from '../CacheService/ICacheService';
import {
    CacheHitCacheResult,
    MissCacheResult,
    ResultsCacheStatus,
} from '../CacheService/types';
import {
    allExplores,
    expectedApiQueryResultsWith1Row,
    expectedColumns,
    expectedFormattedRow,
    job,
    lightdashConfigWithNoSMTP,
    metricQueryMock,
    projectSummary,
    projectWithSensitiveFields,
    resultsWith1Row,
    spacesWithSavedCharts,
    tablesConfiguration,
    user,
    validExplore,
} from '../ProjectService/ProjectService.mock';
import { AsyncQueryService } from './AsyncQueryService';
import type { ExecuteAsyncQueryReturn } from './types';

const mockSshTunnel = {
    connect: jest.fn(() => warehouseClientMock.credentials),
    disconnect: jest.fn(),
} as unknown as SshTunnel<CreateWarehouseCredentials>;

jest.mock('@lightdash/warehouses', () => ({
    SshTunnel: jest.fn(() => mockSshTunnel),
}));

const projectModel = {
    getWithSensitiveFields: jest.fn(async () => projectWithSensitiveFields),
    get: jest.fn(async () => projectWithSensitiveFields),
    getSummary: jest.fn(async () => projectSummary),
    getTablesConfiguration: jest.fn(async () => tablesConfiguration),
    updateTablesConfiguration: jest.fn(),
    getExploreFromCache: jest.fn(async () => validExplore),
    findExploresFromCache: jest.fn(async () => allExplores),
    lockProcess: jest.fn((_projectUuid, fun) => fun()),
    getWarehouseCredentialsForProject: jest.fn(
        async () => warehouseClientMock.credentials,
    ),
    getWarehouseClientFromCredentials: jest.fn(() => ({
        ...warehouseClientMock,
        runQuery: jest.fn(async () => resultsWith1Row),
    })),
    findExploreByTableName: jest.fn(async () => validExplore),
};
const onboardingModel = {
    getByOrganizationUuid: jest.fn(async () => ({
        ranQueryAt: new Date(),
        shownSuccessAt: new Date(),
    })),
};
const savedChartModel = {
    getAllSpaces: jest.fn(async () => spacesWithSavedCharts),
};
const jobModel = {
    get: jest.fn(async () => job),
};
const spaceModel = {
    getAllSpaces: jest.fn(async () => spacesWithSavedCharts),
};

const userAttributesModel = {
    getAttributeValuesForOrgMember: jest.fn(async () => ({})),
};

const getMockedAsyncQueryService = (lightdashConfig: LightdashConfig) =>
    new AsyncQueryService({
        lightdashConfig,
        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        onboardingModel: onboardingModel as unknown as OnboardingModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        jobModel: jobModel as unknown as JobModel,
        emailClient: new EmailClient({
            lightdashConfig: lightdashConfigWithNoSMTP,
        }),
        spaceModel: spaceModel as unknown as SpaceModel,
        sshKeyPairModel: {} as SshKeyPairModel,
        userAttributesModel:
            userAttributesModel as unknown as UserAttributesModel,
        s3CacheClient: {} as S3CacheClient,
        analyticsModel: {} as AnalyticsModel,
        dashboardModel: {} as DashboardModel,
        userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
        warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
        emailModel: {
            getPrimaryEmailStatus: (userUuid: string) => ({
                isVerified: true,
            }),
        } as unknown as EmailModel,
        schedulerClient: {} as SchedulerClient,
        downloadFileModel: {} as unknown as DownloadFileModel,
        s3Client: {} as S3Client,
        groupsModel: {} as GroupsModel,
        tagsModel: {} as TagsModel,
        catalogModel: {} as CatalogModel,
        contentModel: {} as ContentModel,
        encryptionUtil: {} as EncryptionUtil,
        queryHistoryModel: {
            create: jest.fn(async () => ({ queryUuid: 'queryUuid' })),
            get: jest.fn(async () => undefined),
            update: jest.fn(),
        } as unknown as QueryHistoryModel,
        userModel: {} as UserModel,
        savedSqlModel: {} as SavedSqlModel,
        resultsFileModel: {} as ResultsFileModel,
        storageClient: {} as S3ResultsFileStorageClient,
    });

describe('AsyncQueryService', () => {
    describe('executeAsyncQuery', () => {
        const write = jest.fn();
        const close = jest.fn();
        const serviceWithCache = getMockedAsyncQueryService({
            ...lightdashConfigMock,
            results: {
                ...lightdashConfigMock.results,
                cacheEnabled: true,
            },
        });

        beforeEach(() => {
            // clear in memory cache so new mock is applied
            serviceWithCache.warehouseClients = {};
            serviceWithCache.cacheService = {} as ICacheService;

            jest.clearAllMocks();
            // Mock the resultsCacheModel.createOrGetExistingCache method
            serviceWithCache.createOrGetExistingCache = jest
                .fn()
                .mockImplementation(async () => ({
                    cacheHit: false,
                    cacheKey: 'test-cache-key',
                    write,
                    close,
                }));

            serviceWithCache.deleteCache = jest.fn();
        });

        test('should return queryUuid when cache is hit', async () => {
            // Mock the resultsCacheModel to return a cache hit
            const createdAt = new Date();
            const updatedAt = new Date();
            const expiresAt = new Date(
                createdAt.getTime() + 1000 * 60 * 60 * 24,
            );
            const mockCacheResult: CacheHitCacheResult = {
                cacheHit: true,
                cacheKey: 'test-cache-key',
                totalRowCount: 10,
                createdAt,
                updatedAt,
                expiresAt,
                status: ResultsCacheStatus.READY,
                write: undefined,
                close: undefined,
            };

            (
                serviceWithCache.createOrGetExistingCache as jest.Mock
            ).mockResolvedValueOnce(mockCacheResult);

            // Mock the queryHistoryModel.create to return a queryUuid
            (
                serviceWithCache.queryHistoryModel.create as jest.Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Spy on the warehouse client executeAsyncQuery method
            const warehouseClientExecuteAsyncQuerySpy = jest.spyOn(
                warehouseClientMock,
                'executeAsyncQuery',
            );

            const result = await serviceWithCache.executeAsyncQuery(
                {
                    user,
                    projectUuid,
                    metricQuery: metricQueryMock,
                    context: QueryExecutionContext.EXPLORE,
                    dateZoom: undefined,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    explore: validExplore,
                    invalidateCache: false,
                    sql: 'SELECT * FROM test',
                    fields: {},
                },
                { query: metricQueryMock },
                {
                    warehouseClient: warehouseClientMock,
                    sshTunnel: mockSshTunnel,
                },
            );

            expect(result).toEqual({
                queryUuid: 'test-query-uuid',
                cacheMetadata: {
                    cacheHit: true,
                    cacheUpdatedTime: updatedAt,
                    cacheExpiresAt: expiresAt,
                },
            } satisfies ExecuteAsyncQueryReturn);

            // Verify that the query history was updated with READY status
            expect(
                serviceWithCache.queryHistoryModel.update,
            ).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                user.userUuid,
                {
                    status: QueryHistoryStatus.READY,
                    error: null,
                    total_row_count: 10,
                    warehouse_execution_time_ms: 0,
                },
            );

            // Verify that the warehouse client executeAsyncQuery method was not called
            expect(warehouseClientExecuteAsyncQuerySpy).not.toHaveBeenCalled();
        });

        test('should trigger background query when cache is not hit', async () => {
            // Mock the resultsCacheModel to return a cache miss
            const createdAt = new Date();
            const updatedAt = new Date();
            const expiresAt = new Date(
                createdAt.getTime() + 1000 * 60 * 60 * 24,
            );
            const mockCacheResult: MissCacheResult = {
                cacheHit: false,
                cacheKey: 'test-cache-key',
                write,
                close,
                createdAt,
                updatedAt,
                expiresAt,
                totalRowCount: null,
            };

            (
                serviceWithCache.createOrGetExistingCache as jest.Mock
            ).mockResolvedValueOnce(mockCacheResult);

            // Mock the queryHistoryModel.create to return a queryUuid
            (
                serviceWithCache.queryHistoryModel.create as jest.Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Spy on the warehouse client executeAsyncQuery method
            const warehouseClientExecuteAsyncQuerySpy = jest.spyOn(
                warehouseClientMock,
                'executeAsyncQuery',
            );

            const result = await serviceWithCache.executeAsyncQuery(
                {
                    user,
                    projectUuid,
                    metricQuery: metricQueryMock,
                    context: QueryExecutionContext.EXPLORE,
                    dateZoom: undefined,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    explore: validExplore,
                    invalidateCache: false,
                    sql: 'SELECT * FROM test',
                    fields: {},
                },
                { query: metricQueryMock },
                {
                    warehouseClient: warehouseClientMock,
                    sshTunnel: mockSshTunnel,
                },
            );

            expect(result).toEqual({
                queryUuid: 'test-query-uuid',
                cacheMetadata: {
                    cacheHit: false,
                    cacheUpdatedTime: updatedAt,
                    cacheExpiresAt: expiresAt,
                },
            } satisfies ExecuteAsyncQueryReturn);

            // Verify that the query history was not updated with READY status
            expect(
                serviceWithCache.queryHistoryModel.update,
            ).not.toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                user.userUuid,
                {
                    status: QueryHistoryStatus.READY,
                    error: null,
                    total_row_count: expect.any(Number),
                },
            );

            // Verify that the warehouse client executeAsyncQuery method was not called
            expect(warehouseClientExecuteAsyncQuerySpy).toHaveBeenCalledWith(
                {
                    sql: expect.any(String),
                    tags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                },
                expect.any(Function),
            );
            expect(write).toHaveBeenCalled();
        });

        test('should invalidate cache when invalidateCache is true', async () => {
            // Mock the resultsCacheModel to return a cache miss
            const mockCacheResult = {
                cacheHit: false,
                cacheKey: 'test-cache-key',
                write,
                close,
            };

            (
                serviceWithCache.createOrGetExistingCache as jest.Mock
            ).mockResolvedValueOnce(mockCacheResult);

            // Mock the queryHistoryModel.create to return a queryUuid
            (
                serviceWithCache.queryHistoryModel.create as jest.Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Spy on the warehouse client executeAsyncQuery method
            const warehouseClientExecuteAsyncQuerySpy = jest.spyOn(
                warehouseClientMock,
                'executeAsyncQuery',
            );

            await serviceWithCache.executeAsyncQuery(
                {
                    user,
                    projectUuid,
                    metricQuery: metricQueryMock,
                    context: QueryExecutionContext.EXPLORE,
                    dateZoom: undefined,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    explore: validExplore,
                    invalidateCache: true,
                    sql: 'SELECT * FROM test',
                    fields: {},
                },
                { query: metricQueryMock },
                {
                    warehouseClient: warehouseClientMock,
                    sshTunnel: mockSshTunnel,
                },
            );

            // Verify that createOrGetExistingCache was called with invalidateCache: true
            expect(
                serviceWithCache.createOrGetExistingCache,
            ).toHaveBeenCalledWith(projectUuid, expect.any(Object), true);

            // Verify that the query history was not updated with READY status
            expect(
                serviceWithCache.queryHistoryModel.update,
            ).not.toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                user.userUuid,
                {
                    status: QueryHistoryStatus.READY,
                    error: null,
                    total_row_count: expect.any(Number),
                },
            );

            // Verify that the warehouse client executeAsyncQuery method was called
            expect(warehouseClientExecuteAsyncQuerySpy).toHaveBeenCalledWith(
                {
                    sql: expect.any(String),
                    tags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                },
                expect.any(Function),
            );
            expect(write).toHaveBeenCalled();
        });
    });

    describe('getAsyncQueryResults', () => {
        const serviceWithCache = getMockedAsyncQueryService({
            ...lightdashConfigMock,
            results: {
                ...lightdashConfigMock.results,
                cacheEnabled: true,
            },
        });

        beforeEach(() => {
            // clear in memory cache so new mock is applied
            serviceWithCache.warehouseClients = {};
            serviceWithCache.cacheService = {} as ICacheService;

            jest.clearAllMocks();
        });

        test('should return error when queryHistory has error status', async () => {
            // Mock the queryHistoryModel.get to return a query with ERROR status
            const mockQueryHistory: QueryHistory = {
                createdAt: new Date(),
                organizationUuid: user.organizationUuid!,
                createdByUserUuid: user.userUuid,
                queryUuid: 'test-query-uuid',
                projectUuid,
                status: QueryHistoryStatus.ERROR,
                error: 'Test error message',
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE,
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                totalRowCount: null,
                warehouseExecutionTimeMs: null,
                defaultPageSize: 10,
                cacheKey: 'test-query-key',
                pivotConfiguration: null,
                pivotTotalColumnCount: null,
                pivotValuesColumns: null,
            };

            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.getExplore = jest
                .fn()
                .mockResolvedValue(validExplore);

            const result = await serviceWithCache.getAsyncQueryResults({
                user,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(result).toEqual({
                error: 'Test error message',
                status: QueryHistoryStatus.ERROR,
                queryUuid: 'test-query-uuid',
            });
        });

        test('should return current status when queryHistory has pending status', async () => {
            // Mock the queryHistoryModel.get to return a query with PENDING status
            const mockQueryHistory: QueryHistory = {
                createdAt: new Date(),
                organizationUuid: user.organizationUuid!,
                createdByUserUuid: user.userUuid,
                queryUuid: 'test-query-uuid',
                projectUuid,
                status: QueryHistoryStatus.PENDING,
                error: null,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE,
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                totalRowCount: null,
                warehouseExecutionTimeMs: null,
                defaultPageSize: 10,
                cacheKey: 'test-query-key',
                pivotConfiguration: null,
                pivotTotalColumnCount: null,
                pivotValuesColumns: null,
            };

            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.resultsFileModel.find = jest
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.getExplore = jest
                .fn()
                .mockResolvedValue(validExplore);

            const result = await serviceWithCache.getAsyncQueryResults({
                user,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(result).toEqual({
                status: QueryHistoryStatus.PENDING,
                queryUuid: 'test-query-uuid',
            });
        });

        test('should return current status when queryHistory has cancelled status', async () => {
            // Mock the queryHistoryModel.get to return a query with CANCELLED status
            const mockQueryHistory: QueryHistory = {
                createdAt: new Date(),
                organizationUuid: user.organizationUuid!,
                createdByUserUuid: user.userUuid,
                queryUuid: 'test-query-uuid',
                projectUuid,
                status: QueryHistoryStatus.CANCELLED,
                error: null,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE,
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                totalRowCount: null,
                warehouseExecutionTimeMs: null,
                defaultPageSize: 10,
                cacheKey: 'test-query-key',
                pivotConfiguration: null,
                pivotTotalColumnCount: null,
                pivotValuesColumns: null,
            };

            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.getExplore = jest
                .fn()
                .mockResolvedValue(validExplore);

            const result = await serviceWithCache.getAsyncQueryResults({
                user,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(result).toEqual({
                status: QueryHistoryStatus.CANCELLED,
                queryUuid: 'test-query-uuid',
            });
        });

        test('should fetch results from cache when query is READY and cache exists', async () => {
            // Mock the queryHistoryModel.get to return a READY query with cache key
            const mockQueryHistory: QueryHistory = {
                createdAt: new Date(),
                organizationUuid: user.organizationUuid!,
                createdByUserUuid: user.userUuid,
                queryUuid: 'test-query-uuid',
                projectUuid,
                status: QueryHistoryStatus.READY,
                error: null,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE,
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                totalRowCount: null,
                warehouseExecutionTimeMs: null,
                defaultPageSize: 10,
                cacheKey: 'test-cache-key',
                pivotConfiguration: null,
                pivotTotalColumnCount: null,
                pivotValuesColumns: null,
            };

            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.getExplore = jest
                .fn()
                .mockResolvedValue(validExplore);

            // Mock the resultsCacheModel.getCachedResultsPage to return cached results
            serviceWithCache.getCachedResultsPage = jest
                .fn()
                .mockResolvedValue({
                    rows: [expectedFormattedRow],
                    columns: expectedColumns,
                    totalRowCount: 10,
                });

            const result = await serviceWithCache.getAsyncQueryResults({
                user,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(result).toEqual({
                rows: [expectedFormattedRow],
                totalPageCount: 1,
                totalResults: 10,
                queryUuid: 'test-query-uuid',
                pageSize: 1,
                page: 1,
                nextPage: undefined,
                previousPage: undefined,
                initialQueryExecutionMs: expect.any(Number),
                resultsPageExecutionMs: expect.any(Number),
                status: QueryHistoryStatus.READY,
                pivotDetails: null,
                columns: expectedColumns,
            });

            expect(serviceWithCache.getCachedResultsPage).toHaveBeenCalledWith(
                'test-cache-key',
                projectUuid,
                1,
                10,
                expect.any(Function),
            );
        });

        test('should error when getCachedResultsPage throws an error', async () => {
            // Mock the queryHistoryModel.get to return a READY query with cache key
            const mockQueryHistory: QueryHistory = {
                createdAt: new Date(),
                organizationUuid: user.organizationUuid!,
                createdByUserUuid: user.userUuid,
                queryUuid: 'test-query-uuid',
                projectUuid,
                status: QueryHistoryStatus.READY,
                error: null,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE,
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                totalRowCount: null,
                warehouseExecutionTimeMs: null,
                defaultPageSize: 10,
                cacheKey: 'test-cache-key',
                pivotConfiguration: null,
                pivotTotalColumnCount: null,
                pivotValuesColumns: null,
            };

            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(mockQueryHistory);

            serviceWithCache.getExplore = jest
                .fn()
                .mockResolvedValue(validExplore);

            serviceWithCache.getCachedResultsPage = jest
                .fn()
                .mockRejectedValue(
                    new NotFoundError(
                        `Cache not found for key ${mockQueryHistory.cacheKey} and project ${projectUuid}`,
                    ),
                );

            await expect(
                serviceWithCache.getAsyncQueryResults({
                    user,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                    page: 1,
                    pageSize: 10,
                }),
            ).rejects.toThrow(
                new NotFoundError(
                    `Cache not found for key ${mockQueryHistory.cacheKey} and project ${projectUuid}`,
                ),
            );
        });
    });
});
