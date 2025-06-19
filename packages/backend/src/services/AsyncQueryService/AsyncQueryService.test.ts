import {
    DimensionType,
    NotFoundError,
    QueryExecutionContext,
    QueryHistoryStatus,
    VizAggregationOptions,
    VizIndexType,
    type CreateWarehouseCredentials,
    type ExecuteAsyncQueryRequestParams,
    type QueryHistory,
    type ResultColumns,
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
import type { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type { SavedChartModel } from '../../models/SavedChartModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import type { SpaceModel } from '../../models/SpaceModel';
import type { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { TagsModel } from '../../models/TagsModel';
import type { UserAttributesModel } from '../../models/UserAttributesModel';
import type { UserModel } from '../../models/UserModel';
import type { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import type { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import type { SchedulerClient } from '../../scheduler/SchedulerClient';
import type { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { warehouseClientMock } from '../../utils/QueryBuilder/queryBuilder.mock';
import type { ICacheService } from '../CacheService/ICacheService';
import { CacheHitCacheResult, MissCacheResult } from '../CacheService/types';
import type { CsvService } from '../CsvService/CsvService';
import {
    allExplores,
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
        storageClient: {} as S3ResultsFileStorageClient,
        csvService: {} as CsvService,
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
            serviceWithCache.findResultsCache = jest.fn().mockImplementation(
                async () =>
                    ({
                        cacheHit: false,
                        updatedAt: undefined,
                        expiresAt: undefined,
                    } satisfies MissCacheResult),
            );
            serviceWithCache.storageClient.createUploadStream = jest
                .fn()
                .mockImplementation(() => ({ write, close }));
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
                fileName: 'file-name',
                columns: {},
                originalColumns: {},
                pivotValuesColumns: null,
                pivotTotalColumnCount: null,
            };

            (
                serviceWithCache.findResultsCache as jest.Mock
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
                    results_file_name: 'file-name',
                    columns: {},
                    original_columns: {},
                    results_created_at: expect.any(Date),
                    results_updated_at: expect.any(Date),
                    results_expires_at: expect.any(Date),
                    pivot_total_column_count: null,
                    pivot_values_columns: null,
                },
            );

            // Verify that the warehouse client executeAsyncQuery method was not called
            expect(warehouseClientExecuteAsyncQuerySpy).not.toHaveBeenCalled();
        });

        test('should trigger background query when cache is not hit', async () => {
            // Mock the resultsCacheModel to return a cache miss
            const mockCacheResult: MissCacheResult = {
                cacheHit: false,
                updatedAt: undefined,
                expiresAt: undefined,
            };

            (
                serviceWithCache.findResultsCache as jest.Mock
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
                    cacheUpdatedTime: undefined,
                    cacheExpiresAt: undefined,
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
                    results_file_name: 'file-name',
                    columns: {},
                    original_columns: {},
                    results_created_at: expect.any(Date),
                    results_updated_at: expect.any(Date),
                    results_expires_at: expect.any(Date),
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
            expect(serviceWithCache.findResultsCache).toHaveBeenCalledWith(
                projectUuid,
                expect.any(String),
                true,
            );

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
                    results_file_name: 'file-name',
                    columns: {},
                    original_columns: {},
                    results_created_at: expect.any(Date),
                    results_updated_at: expect.any(Date),
                    results_expires_at: expect.any(Date),
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
                resultsFileName: null,
                resultsCreatedAt: null,
                resultsUpdatedAt: null,
                resultsExpiresAt: null,
                columns: null,
                originalColumns: null,
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
                resultsFileName: null,
                resultsCreatedAt: null,
                resultsUpdatedAt: null,
                resultsExpiresAt: null,
                columns: null,
                originalColumns: null,
            };

            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.queryHistoryModel.findMostRecentByCacheKey = jest
                .fn()
                .mockResolvedValue(null);
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
                resultsFileName: null,
                resultsCreatedAt: null,
                resultsUpdatedAt: null,
                resultsExpiresAt: null,
                columns: null,
                originalColumns: null,
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

        test('should throws an error when query is READY but resultsFileName is null', async () => {
            // Mock the queryHistoryModel.get to return a READY query with null resultsFileName
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
                resultsFileName: null,
                resultsCreatedAt: null,
                resultsUpdatedAt: null,
                resultsExpiresAt: null,
                columns: null,
                originalColumns: null,
            };

            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(mockQueryHistory);

            serviceWithCache.getExplore = jest
                .fn()
                .mockResolvedValue(validExplore);

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
                    `Result file not found for query test-query-uuid`,
                ),
            );
        });

        test('should include original columns in pivotDetails for pivoted queries', async () => {
            const mockOriginalColumns: ResultColumns = {
                user_id: { reference: 'user_id', type: DimensionType.STRING },
                order_date: {
                    reference: 'order_date',
                    type: DimensionType.DATE,
                },
                amount: { reference: 'amount', type: DimensionType.NUMBER },
            };

            const mockPivotConfiguration = {
                indexColumn: {
                    reference: 'user_id',
                    type: VizIndexType.CATEGORY,
                },
                valuesColumns: [
                    {
                        reference: 'amount',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'order_date' }],
                sortBy: [],
            };

            const mockPivotValuesColumns = [
                {
                    referenceField: 'amount',
                    pivotColumnName: 'amount_sum_2021',
                    aggregation: VizAggregationOptions.SUM,
                    pivotValues: [
                        { referenceField: 'order_date', value: '2021' },
                    ],
                },
            ];

            const mockQueryHistory: QueryHistory = {
                createdAt: new Date(),
                organizationUuid: user.organizationUuid!,
                createdByUserUuid: user.userUuid,
                queryUuid: 'test-query-uuid',
                projectUuid,
                status: QueryHistoryStatus.READY,
                error: null,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE, // Any context works now
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                totalRowCount: 10,
                warehouseExecutionTimeMs: null,
                defaultPageSize: 10,
                cacheKey: 'test-cache-key',
                pivotConfiguration: mockPivotConfiguration,
                pivotTotalColumnCount: 5,
                pivotValuesColumns: mockPivotValuesColumns,
                resultsFileName: 'file-name',
                resultsCreatedAt: new Date(),
                resultsUpdatedAt: new Date(),
                resultsExpiresAt: new Date(Date.now() + 60_000), // so it doesn't get stuck on resultsExpiresAt < new Date()
                columns: expectedColumns,
                originalColumns: mockOriginalColumns,
            };

            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.getResultsPage = jest.fn().mockResolvedValue({
                rows: [expectedFormattedRow],
            });

            const result = await serviceWithCache.getAsyncQueryResults({
                user,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(result).toMatchObject({
                status: QueryHistoryStatus.READY,
                pivotDetails: {
                    totalColumnCount: 5,
                    valuesColumns: mockPivotValuesColumns,
                    indexColumn: mockPivotConfiguration.indexColumn,
                    groupByColumns: mockPivotConfiguration.groupByColumns,
                    sortBy: mockPivotConfiguration.sortBy,
                    originalColumns: mockOriginalColumns,
                },
            });
        });
    });

    describe('executeAsyncQuery with originalColumns', () => {
        const write = jest.fn();
        const close = jest.fn();
        const serviceWithCache = getMockedAsyncQueryService({
            ...lightdashConfigMock,
            results: {
                ...lightdashConfigMock.results,
                cacheEnabled: true,
            },
        });

        const mockOriginalColumns: ResultColumns = {
            user_id: { reference: 'user_id', type: DimensionType.STRING },
            order_date: { reference: 'order_date', type: DimensionType.DATE },
            amount: { reference: 'amount', type: DimensionType.NUMBER },
        };

        beforeEach(() => {
            serviceWithCache.warehouseClients = {};
            serviceWithCache.cacheService = {} as ICacheService;
            jest.clearAllMocks();

            serviceWithCache.findResultsCache = jest
                .fn()
                .mockImplementation(async () => ({
                    cacheHit: false,
                    updatedAt: undefined,
                    expiresAt: undefined,
                }));
        });

        test('should store original columns when provided', async () => {
            const mockCacheResult: MissCacheResult = {
                cacheHit: false,
                updatedAt: undefined,
                expiresAt: undefined,
            };

            (
                serviceWithCache.findResultsCache as jest.Mock
            ).mockResolvedValueOnce(mockCacheResult);
            (
                serviceWithCache.queryHistoryModel.create as jest.Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Mock the private method using bracket notation (common Jest pattern)
            const mockRunAsyncWarehouseQuery = jest
                .fn()
                .mockResolvedValue(undefined);
            // eslint-disable-next-line @typescript-eslint/dot-notation
            serviceWithCache['runAsyncWarehouseQuery'] =
                mockRunAsyncWarehouseQuery;

            await serviceWithCache.executeAsyncQuery(
                {
                    user,
                    projectUuid,
                    metricQuery: metricQueryMock,
                    context: QueryExecutionContext.SQL_RUNNER,
                    dateZoom: undefined,
                    queryTags: {
                        query_context: QueryExecutionContext.SQL_RUNNER,
                    },
                    explore: validExplore,
                    invalidateCache: false,
                    sql: 'SELECT * FROM test',
                    fields: {},
                    originalColumns: mockOriginalColumns,
                },
                { query: metricQueryMock },
                {
                    warehouseClient: warehouseClientMock,
                    sshTunnel: mockSshTunnel,
                },
            );

            // Verify that original columns are passed to runAsyncWarehouseQuery
            expect(mockRunAsyncWarehouseQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    originalColumns: mockOriginalColumns,
                }),
            );
        });
    });
});
