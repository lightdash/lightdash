import {
    DimensionType,
    ForbiddenError,
    NotFoundError,
    QueryExecutionContext,
    QueryHistoryStatus,
    VizAggregationOptions,
    VizIndexType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type ExecuteAsyncQueryRequestParams,
    type QueryHistory,
    type ResultColumns,
} from '@lightdash/common';
import { type SshTunnel } from '@lightdash/warehouses';
import { Readable } from 'stream';
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
import type { DownloadAuditModel } from '../../models/DownloadAuditModel';
import type { DownloadFileModel } from '../../models/DownloadFileModel';
import type { EmailModel } from '../../models/EmailModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { GroupsModel } from '../../models/GroupsModel';
import type { JobModel } from '../../models/JobModel/JobModel';
import type { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import type { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import type { ProjectCompileLogModel } from '../../models/ProjectCompileLogModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { projectUuid } from '../../models/ProjectModel/ProjectModel.mock';
import { ProjectParametersModel } from '../../models/ProjectParametersModel';
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
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import type { ICacheService } from '../CacheService/ICacheService';
import { CacheHitCacheResult, MissCacheResult } from '../CacheService/types';
import { PermissionsService } from '../PermissionsService/PermissionsService';
import { PivotTableService } from '../PivotTableService/PivotTableService';
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
    sessionAccount,
    spacesWithSavedCharts,
    tablesConfiguration,
    validExplore,
} from '../ProjectService/ProjectService.mock';
import { AsyncQueryService } from './AsyncQueryService';
import type {
    ExecuteAsyncQueryReturn,
    RunAsyncWarehouseQueryArgs,
} from './types';

// Import the mocked function
const mockSshTunnel = {
    connect: jest.fn(() => warehouseClientMock.credentials),
    disconnect: jest.fn(),
} as unknown as SshTunnel<CreateWarehouseCredentials>;

jest.mock('@lightdash/warehouses', () => ({
    ...jest.requireActual('@lightdash/warehouses'),
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

const getMockedAsyncQueryService = (
    lightdashConfig: LightdashConfig,
    overrides: Partial<AsyncQueryService> = {},
) =>
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
            getPrimaryEmailStatus: () => ({
                isVerified: true,
            }),
        } as unknown as EmailModel,
        schedulerClient: {
            scheduleTask: jest.fn(),
        } as unknown as SchedulerClient,
        downloadFileModel: {} as unknown as DownloadFileModel,
        s3Client: {} as S3Client,
        groupsModel: {} as GroupsModel,
        tagsModel: {} as TagsModel,
        catalogModel: {} as CatalogModel,
        contentModel: {} as ContentModel,
        encryptionUtil: {} as EncryptionUtil,
        downloadAuditModel: {
            logDownload: jest.fn(),
        } as unknown as DownloadAuditModel,
        queryHistoryModel: {
            create: jest.fn(async () => ({ queryUuid: 'queryUuid' })),
            get: jest.fn(async () => undefined),
            update: jest.fn(),
        } as unknown as QueryHistoryModel,
        userModel: {} as UserModel,
        savedSqlModel: {} as SavedSqlModel,
        resultsStorageClient: {
            isEnabled: true, // ! Hack for current tests that only check for results saved in S3
            getDownloadStream: jest.fn(() => {
                const readable = new Readable({
                    read() {
                        // Push some mock data and end the stream
                        this.push('{}');
                        this.push(null); // End the stream
                    },
                });
                return readable;
            }),
            createUploadStream: jest.fn(() => ({
                write: jest.fn(),
                close: jest.fn(),
            })),
        } as unknown as S3ResultsFileStorageClient,
        featureFlagModel: {} as FeatureFlagModel,
        projectParametersModel: {} as ProjectParametersModel,
        organizationWarehouseCredentialsModel:
            {} as OrganizationWarehouseCredentialsModel,
        pivotTableService: new PivotTableService({
            lightdashConfig,
            s3Client: {} as S3Client,
            downloadFileModel: {} as DownloadFileModel,
        }),
        permissionsService: {} as PermissionsService,
        projectCompileLogModel: {} as ProjectCompileLogModel,
        ...overrides,
    });

describe('AsyncQueryService', () => {
    describe('executeAsyncQuery', () => {
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
        });

        test('Cache Hit - Complete Flow', async () => {
            // GIVEN: Cache returns a hit with metadata
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
                columns: expectedColumns,
                originalColumns: expectedColumns,
                pivotValuesColumns: null,
                pivotTotalColumnCount: null,
            };

            (
                serviceWithCache.findResultsCache as jest.Mock
            ).mockResolvedValueOnce(mockCacheResult);

            (
                serviceWithCache.queryHistoryModel.create as jest.Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Spy on methods to verify they are NOT called
            const runAsyncWarehouseQuerySpy = jest.spyOn(
                serviceWithCache,
                'runAsyncWarehouseQuery',
            );
            const warehouseClientExecuteAsyncQuerySpy = jest.spyOn(
                warehouseClientMock,
                'executeAsyncQuery',
            );

            // WHEN: executeAsyncQuery is called
            const result = await serviceWithCache.executeAsyncQuery(
                {
                    account: sessionAccount,
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
                    missingParameterReferences: [],
                },
                { query: metricQueryMock },
            );

            // THEN: Returns immediately with queryUuid and cache metadata
            expect(result).toEqual({
                queryUuid: 'test-query-uuid',
                cacheMetadata: {
                    cacheHit: true,
                    cacheUpdatedTime: updatedAt,
                    cacheExpiresAt: expiresAt,
                },
            } satisfies ExecuteAsyncQueryReturn);

            // THEN: Query history updated with READY status and all cache data
            expect(
                serviceWithCache.queryHistoryModel.update,
            ).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                {
                    status: QueryHistoryStatus.READY,
                    error: null,
                    total_row_count: 10,
                    warehouse_execution_time_ms: 0,
                    results_file_name: 'file-name',
                    columns: expectedColumns,
                    original_columns: expectedColumns,
                    results_created_at: createdAt,
                    results_updated_at: updatedAt,
                    results_expires_at: expiresAt,
                    pivot_total_column_count: null,
                    pivot_values_columns: null,
                },
                sessionAccount,
            );

            // THEN: runAsyncWarehouseQuery is NOT called
            expect(runAsyncWarehouseQuerySpy).not.toHaveBeenCalled();

            // THEN: Warehouse client methods are NOT called
            expect(warehouseClientExecuteAsyncQuerySpy).not.toHaveBeenCalled();
        });

        test('Cache Miss - Complete Flow', async () => {
            // GIVEN: Cache returns a miss
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

            // Spy on runAsyncWarehouseQuery to verify it IS called
            const runAsyncWarehouseQuerySpy = jest.spyOn(
                serviceWithCache,
                'runAsyncWarehouseQuery',
            );

            // WHEN: executeAsyncQuery is called
            const result = await serviceWithCache.executeAsyncQuery(
                {
                    account: sessionAccount,
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
                    missingParameterReferences: [],
                },
                { query: metricQueryMock },
            );

            // THEN: Returns immediately with queryUuid and cache miss metadata
            expect(result).toEqual({
                queryUuid: 'test-query-uuid',
                cacheMetadata: {
                    cacheHit: false,
                    cacheUpdatedTime: undefined,
                    cacheExpiresAt: undefined,
                },
            } satisfies ExecuteAsyncQueryReturn);

            // THEN: Query history created with proper parameters
            expect(
                serviceWithCache.queryHistoryModel.create,
            ).toHaveBeenCalledWith(
                sessionAccount,
                expect.objectContaining({
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    organizationUuid:
                        sessionAccount.organization.organizationUuid,
                }),
            );

            // THEN: runAsyncWarehouseQuery IS called with correct parameters
            expect(runAsyncWarehouseQuerySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: sessionAccount.user.id,
                    isRegisteredUser: sessionAccount.isRegisteredUser(),
                    projectUuid,
                    query: 'SELECT * FROM test',
                    queryHistoryUuid: 'test-query-uuid',
                    fieldsMap: {},
                    queryTags: { query_context: QueryExecutionContext.EXPLORE },
                } satisfies Partial<RunAsyncWarehouseQueryArgs>),
            );

            // THEN: Query history is NOT immediately updated to READY (async behavior)
            expect(
                serviceWithCache.queryHistoryModel.update,
            ).not.toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                expect.objectContaining({
                    status: QueryHistoryStatus.READY,
                }),
                sessionAccount,
            );
        });

        test('Cache Invalidation - Complete Flow', async () => {
            // GIVEN: invalidateCache: true is set
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

            // Spy on runAsyncWarehouseQuery to verify it IS called
            const runAsyncWarehouseQuerySpy = jest.spyOn(
                serviceWithCache,
                'runAsyncWarehouseQuery',
            );

            // WHEN: executeAsyncQuery is called with invalidateCache: true
            const result = await serviceWithCache.executeAsyncQuery(
                {
                    account: sessionAccount,
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
                    missingParameterReferences: [],
                },
                { query: metricQueryMock },
            );

            // THEN: findResultsCache called with invalidate flag (third parameter: true)
            expect(serviceWithCache.findResultsCache).toHaveBeenCalledWith(
                projectUuid,
                expect.any(String),
                true,
            );

            // THEN: runAsyncWarehouseQuery IS called with correct parameters
            expect(runAsyncWarehouseQuerySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: sessionAccount.user.id,
                    isRegisteredUser: sessionAccount.isRegisteredUser(),
                    projectUuid,
                    query: 'SELECT * FROM test',
                    queryHistoryUuid: 'test-query-uuid',
                    fieldsMap: {},
                    queryTags: { query_context: QueryExecutionContext.EXPLORE },
                } satisfies Partial<RunAsyncWarehouseQueryArgs>),
            );

            // THEN: Returns with cache miss metadata
            expect(result).toEqual({
                queryUuid: 'test-query-uuid',
                cacheMetadata: {
                    cacheHit: false,
                    cacheUpdatedTime: undefined,
                    cacheExpiresAt: undefined,
                },
            } satisfies ExecuteAsyncQueryReturn);

            // THEN: Query history created with proper parameters
            expect(
                serviceWithCache.queryHistoryModel.create,
            ).toHaveBeenCalledWith(
                sessionAccount,
                expect.objectContaining({
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    organizationUuid:
                        sessionAccount.organization.organizationUuid,
                }),
            );
        });

        test('Cache Disabled - Complete Flow', async () => {
            // GIVEN: Service configured with cacheEnabled: false
            const serviceWithoutCache = getMockedAsyncQueryService({
                ...lightdashConfigMock,
                results: {
                    ...lightdashConfigMock.results,
                    cacheEnabled: false,
                },
            });

            // Clear cache and mocks for this service
            serviceWithoutCache.warehouseClients = {};
            serviceWithoutCache.cacheService = {
                findCachedResultsFile: jest.fn(),
            } as unknown as ICacheService;

            (
                serviceWithoutCache.queryHistoryModel.create as jest.Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Spy on cache and warehouse methods
            const findResultsCacheSpy = jest.spyOn(
                serviceWithoutCache,
                'findResultsCache',
            );
            const runAsyncWarehouseQuerySpy = jest.spyOn(
                serviceWithoutCache,
                'runAsyncWarehouseQuery',
            );

            // WHEN: executeAsyncQuery is called
            const result = await serviceWithoutCache.executeAsyncQuery(
                {
                    account: sessionAccount,
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
                    missingParameterReferences: [],
                },
                { query: metricQueryMock },
            );

            // THEN: Cache service is called but always returns miss when disabled
            expect(findResultsCacheSpy).toHaveBeenCalledWith(
                projectUuid,
                expect.any(String), // cache key
                false, // invalidateCache
            );

            // THEN: runAsyncWarehouseQuery IS always called with correct parameters
            expect(runAsyncWarehouseQuerySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: sessionAccount.user.id,
                    isRegisteredUser: sessionAccount.isRegisteredUser(),
                    projectUuid,
                    query: 'SELECT * FROM test',
                    queryHistoryUuid: 'test-query-uuid',
                    fieldsMap: {},
                    queryTags: { query_context: QueryExecutionContext.EXPLORE },
                } satisfies Partial<RunAsyncWarehouseQueryArgs>),
            );

            // THEN: Returns with no cache metadata (always miss when disabled)
            expect(result).toEqual({
                queryUuid: 'test-query-uuid',
                cacheMetadata: {
                    cacheHit: false,
                    cacheUpdatedTime: undefined,
                    cacheExpiresAt: undefined,
                },
            } satisfies ExecuteAsyncQueryReturn);

            // THEN: Query history created with proper parameters
            expect(
                serviceWithoutCache.queryHistoryModel.create,
            ).toHaveBeenCalledWith(
                sessionAccount,
                expect.objectContaining({
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    organizationUuid:
                        sessionAccount.organization.organizationUuid,
                }),
            );
        });

        test('Missing Parameter References - Error Scenario', async () => {
            // GIVEN: Query with missing parameter references
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

            // Spy on runAsyncWarehouseQuery to verify it is NOT called
            const runAsyncWarehouseQuerySpy = jest.spyOn(
                serviceWithCache,
                'runAsyncWarehouseQuery',
            );

            // WHEN: executeAsyncQuery is called with missing parameter references
            const result = await serviceWithCache.executeAsyncQuery(
                {
                    account: sessionAccount,
                    projectUuid,
                    metricQuery: metricQueryMock,
                    context: QueryExecutionContext.EXPLORE,
                    dateZoom: undefined,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    explore: validExplore,
                    invalidateCache: false,
                    sql: 'SELECT * FROM test WHERE param = {{ missing_param }}',
                    fields: {},
                    missingParameterReferences: [
                        'missing_param',
                        'another_missing_param',
                    ],
                },
                { query: metricQueryMock },
            );

            // THEN: Returns immediately with cache miss metadata
            expect(result).toEqual({
                queryUuid: 'test-query-uuid',
                cacheMetadata: {
                    cacheHit: false,
                    cacheUpdatedTime: undefined,
                    cacheExpiresAt: undefined,
                },
            } satisfies ExecuteAsyncQueryReturn);

            // THEN: Query history updated with ERROR status and missing parameters message
            expect(
                serviceWithCache.queryHistoryModel.update,
            ).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                {
                    status: QueryHistoryStatus.ERROR,
                    error: 'Missing parameters: missing_param, another_missing_param',
                },
                sessionAccount,
            );

            // THEN: runAsyncWarehouseQuery is NOT called (error prevents execution)
            expect(runAsyncWarehouseQuerySpy).not.toHaveBeenCalled();
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

        test('Error and Status Scenarios - Combined', async () => {
            // Helper function to create mock query history
            const createMockQueryHistory = (
                status: QueryHistoryStatus,
                error: string | null = null,
                resultsFileName: string | null = null,
            ): QueryHistory => ({
                createdAt: new Date(),
                organizationUuid: sessionAccount.organization.organizationUuid!,
                createdByUserUuid: sessionAccount.user.id,
                createdBy: sessionAccount.user.id,
                createdByAccount: null,
                queryUuid: 'test-query-uuid',
                projectUuid,
                status,
                error,
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
                resultsFileName,
                resultsCreatedAt: null,
                resultsUpdatedAt: null,
                resultsExpiresAt: null,
                columns: null,
                originalColumns: null,
            });

            serviceWithCache.getExplore = jest
                .fn()
                .mockResolvedValue(validExplore);
            serviceWithCache.queryHistoryModel.findMostRecentByCacheKey = jest
                .fn()
                .mockResolvedValue(null);

            // GIVEN: Different query history statuses
            // WHEN: getAsyncQueryResults is called
            // THEN: ERROR status: Returns error message and ERROR status
            const errorQuery = createMockQueryHistory(
                QueryHistoryStatus.ERROR,
                'Test error message',
            );
            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(errorQuery);

            const errorResult = await serviceWithCache.getAsyncQueryResults({
                account: sessionAccount,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(errorResult).toEqual({
                error: 'Test error message',
                status: QueryHistoryStatus.ERROR,
                queryUuid: 'test-query-uuid',
            });

            // THEN: PENDING status: Returns PENDING status only
            const pendingQuery = createMockQueryHistory(
                QueryHistoryStatus.PENDING,
            );
            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(pendingQuery);

            const pendingResult = await serviceWithCache.getAsyncQueryResults({
                account: sessionAccount,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(pendingResult).toEqual({
                status: QueryHistoryStatus.PENDING,
                queryUuid: 'test-query-uuid',
            });

            // THEN: CANCELLED status: Returns CANCELLED status only
            const cancelledQuery = createMockQueryHistory(
                QueryHistoryStatus.CANCELLED,
            );
            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(cancelledQuery);

            const cancelledResult = await serviceWithCache.getAsyncQueryResults(
                {
                    account: sessionAccount,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                    page: 1,
                    pageSize: 10,
                },
            );

            expect(cancelledResult).toEqual({
                status: QueryHistoryStatus.CANCELLED,
                queryUuid: 'test-query-uuid',
            });

            // THEN: READY with null resultsFileName: Throws NotFoundError
            const readyQueryWithoutFile = createMockQueryHistory(
                QueryHistoryStatus.READY,
                null,
                null,
            );
            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(readyQueryWithoutFile);

            await expect(
                serviceWithCache.getAsyncQueryResults({
                    account: sessionAccount,
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

        test('Successful Results with Pivot Data - Complete Flow', async () => {
            // GIVEN: Query history with READY status, valid results file, and pivot configuration
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

            const mockPivotValuesColumns = {
                amount_sum_2021: {
                    referenceField: 'amount',
                    pivotColumnName: 'amount_sum_2021',
                    aggregation: VizAggregationOptions.SUM,
                    pivotValues: [
                        { referenceField: 'order_date', value: '2021' },
                    ],
                },
            };

            const mockQueryHistory: QueryHistory = {
                createdAt: new Date(),
                organizationUuid: sessionAccount.organization.organizationUuid!,
                createdByUserUuid: sessionAccount.user.id,
                createdBy: sessionAccount.user.id,
                createdByAccount: null,
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
                totalRowCount: 10,
                warehouseExecutionTimeMs: 1500,
                defaultPageSize: 10,
                cacheKey: 'test-cache-key',
                pivotConfiguration: mockPivotConfiguration,
                pivotTotalColumnCount: 5,
                pivotValuesColumns: mockPivotValuesColumns,
                resultsFileName: 'results-file-name.json',
                resultsCreatedAt: new Date(),
                resultsUpdatedAt: new Date(),
                resultsExpiresAt: new Date(Date.now() + 60_000),
                columns: expectedColumns,
                originalColumns: mockOriginalColumns,
            };

            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.getResultsPageFromWarehouse = jest
                .fn()
                .mockResolvedValue({
                    rows: [expectedFormattedRow],
                });
            serviceWithCache.getExplore = jest
                .fn()
                .mockResolvedValue(validExplore);

            // WHEN: getAsyncQueryResults is called
            const result = await serviceWithCache.getAsyncQueryResults({
                account: sessionAccount,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            // THEN: Returns READY status with complete result structure
            expect(result).toMatchObject({
                status: QueryHistoryStatus.READY,
                queryUuid: 'test-query-uuid',
                rows: expect.any(Array),
            });

            // THEN: Includes execution metadata
            expect(result).toEqual(
                expect.objectContaining({
                    totalResults: 10,
                    initialQueryExecutionMs: 1500,
                }),
            );

            // THEN: Includes pivot details with all required components
            expect(result).toMatchObject({
                pivotDetails: {
                    totalColumnCount: 5,
                    valuesColumns: Object.values(mockPivotValuesColumns),
                    indexColumn: mockPivotConfiguration.indexColumn,
                    groupByColumns: mockPivotConfiguration.groupByColumns,
                    sortBy: mockPivotConfiguration.sortBy,
                    originalColumns: mockOriginalColumns,
                },
            });

            // THEN: Query history retrieval was called with correct parameters
            expect(serviceWithCache.queryHistoryModel.get).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                sessionAccount,
            );

            // THEN: Test completed successfully - all critical behaviors verified
        });
    });

    describe('executeAsyncQuery with originalColumns', () => {
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

            serviceWithCache.runAsyncWarehouseQuery = jest
                .fn()
                .mockResolvedValue(undefined);

            await serviceWithCache.executeAsyncQuery(
                {
                    account: sessionAccount,
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
                    missingParameterReferences: [],
                },
                { query: metricQueryMock },
            );

            // Verify that original columns are passed to runAsyncWarehouseQuery
            expect(
                serviceWithCache.runAsyncWarehouseQuery,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    originalColumns: mockOriginalColumns,
                }),
            );
        });
    });

    describe('runAsyncWarehouseQuery', () => {
        describe('when credentials have sshTunnel config', () => {
            const originalCredentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.POSTGRES,
                host: 'localhost',
                user: 'testuser',
                password: 'testpass',
                port: 5432,
                dbname: 'testdb',
                schema: 'public',
                sshTunnelHost: 'ssh.example.com',
                sshTunnelPort: 22,
                sshTunnelUser: 'sshuser',
                sshTunnelPrivateKey: 'private-key-content',
            };
            const sshTunnelCredentials = {
                type: 'postgres',
                host: '127.0.0.1',
                port: 12345,
                user: 'testuser',
                password: 'testpass',
                dbname: 'testdb',
                schema: 'public',
            };

            beforeEach(() => {
                (mockSshTunnel.connect as jest.Mock).mockReturnValueOnce(
                    Promise.resolve(sshTunnelCredentials),
                );
            });

            test('SSH Tunnel Integration - Complete Flow', async () => {
                // GIVEN: Credentials contain SSH tunnel configuration
                const mockProjectModel = {
                    ...projectModel,
                    getWarehouseCredentialsForProject: jest.fn(() =>
                        Promise.resolve(originalCredentials),
                    ),
                    getWarehouseClientFromCredentials: jest.fn(() => ({
                        ...warehouseClientMock,
                        credentials: sshTunnelCredentials,
                        runQuery: jest.fn(async () => resultsWith1Row),
                    })),
                };

                const service = getMockedAsyncQueryService(
                    lightdashConfigMock,
                    {
                        projectModel:
                            mockProjectModel as unknown as ProjectModel,
                    },
                );

                // Mock query history update
                service.queryHistoryModel.update = jest.fn();

                const getWarehouseClientSpy = jest.spyOn(
                    service,
                    '_getWarehouseClient',
                );

                const runQueryAndTransformRowsSpy = jest.spyOn(
                    AsyncQueryService,
                    'runQueryAndTransformRows',
                );

                const runAsyncArgs: RunAsyncWarehouseQueryArgs = {
                    userId: sessionAccount.user.id,
                    isRegisteredUser: true,
                    projectUuid,
                    query: 'SELECT * FROM test',
                    fieldsMap: {},
                    queryTags: { query_context: QueryExecutionContext.EXPLORE },
                    warehouseCredentialsOverrides: undefined,
                    queryHistoryUuid: 'test-query-uuid',
                    cacheKey: 'test-cache-key',
                    pivotConfiguration: undefined,
                    originalColumns: undefined,
                };

                // WHEN: runAsyncWarehouseQuery is called
                await service.runAsyncWarehouseQuery(runAsyncArgs);

                // THEN: SSH tunnel connection established with tunnel credentials
                expect(mockSshTunnel.connect).toHaveBeenCalledWith();

                // THEN: _getWarehouseClient called with original credentials
                expect(getWarehouseClientSpy).toHaveBeenCalledWith(
                    projectUuid,
                    originalCredentials,
                    undefined,
                );

                // THEN: Warehouse client created with tunneled credentials
                expect(
                    mockProjectModel.getWarehouseClientFromCredentials,
                ).toHaveBeenCalledWith(sshTunnelCredentials);

                // THEN: Query executed through tunneled connection
                expect(runQueryAndTransformRowsSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        warehouseClient: expect.objectContaining({
                            credentials: sshTunnelCredentials,
                        }),
                        query: 'SELECT * FROM test',
                        queryTags: {
                            query_context: QueryExecutionContext.EXPLORE,
                        },
                    }),
                );

                // THEN: Results stored and query history updated with READY status
                expect(service.queryHistoryModel.update).toHaveBeenCalledWith(
                    'test-query-uuid',
                    projectUuid,
                    expect.objectContaining({
                        status: QueryHistoryStatus.READY,
                        error: null,
                    }),
                    expect.any(Object), // session account
                );
            });
        });

        test('Query Execution and Storage - Complete Flow', async () => {
            // GIVEN: Valid warehouse credentials and query
            const mockProjectModel = {
                ...projectModel,
                getWarehouseCredentialsForProject: jest.fn(() =>
                    Promise.resolve(warehouseClientMock.credentials),
                ),
                getWarehouseClientFromCredentials: jest.fn(() => ({
                    ...warehouseClientMock,
                    runQuery: jest.fn(async () => resultsWith1Row),
                })),
            };

            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                projectModel: mockProjectModel as unknown as ProjectModel,
            });

            // Mock storage client methods
            const mockStorageClient =
                service.resultsStorageClient as unknown as {
                    createUploadStream: jest.Mock;
                };
            mockStorageClient.createUploadStream = jest.fn(() => ({
                write: jest.fn(),
                close: jest.fn(),
            }));

            // Mock query history update
            service.queryHistoryModel.update = jest.fn();

            const runQueryAndTransformRowsSpy = jest.spyOn(
                AsyncQueryService,
                'runQueryAndTransformRows',
            );

            const runAsyncArgs: RunAsyncWarehouseQueryArgs = {
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
                projectUuid,
                query: 'SELECT * FROM test_table',
                fieldsMap: {},
                queryTags: { query_context: QueryExecutionContext.EXPLORE },
                warehouseCredentialsOverrides: undefined,
                queryHistoryUuid: 'test-query-uuid',
                cacheKey: 'test-cache-key',
                pivotConfiguration: undefined,
                originalColumns: undefined,
            };

            // WHEN: runAsyncWarehouseQuery is called
            await service.runAsyncWarehouseQuery(runAsyncArgs);

            // THEN: Warehouse query executed with warehouse client
            expect(runQueryAndTransformRowsSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    warehouseClient: expect.objectContaining({
                        credentials: expect.any(Object),
                    }),
                    queryTags: { query_context: QueryExecutionContext.EXPLORE },
                }),
            );

            // THEN: Results stored in storage client
            expect(mockStorageClient.createUploadStream).toHaveBeenCalledWith(
                expect.stringMatching(/\.jsonl$/), // results file name
                expect.objectContaining({
                    contentType: 'application/jsonl',
                }),
            );

            // THEN: Query history updated with READY status and execution details
            expect(service.queryHistoryModel.update).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                expect.objectContaining({
                    status: QueryHistoryStatus.READY,
                    error: null,
                    total_row_count: expect.any(Number),
                    warehouse_execution_time_ms: expect.any(Number),
                    results_file_name: expect.any(String),
                }),
                expect.any(Object), // session account
            );
        });
    });

    describe('executeAsyncSqlQuery', () => {
        describe('user attributes replacement', () => {
            it('should replace user attributes in SQL queries', async () => {
                // GIVEN: Service with mocked user attributes
                const mockUserModel = {
                    findSessionUserByUUID: jest.fn(async () => ({
                        email: 'test@example.com',
                    })),
                };

                const mockUserAttributesModel = {
                    getAttributeValuesForOrgMember: jest.fn(async () => ({
                        department: ['engineering'],
                        region: ['us-west'],
                    })),
                };

                const mockEmailModel = {
                    getPrimaryEmailStatus: jest.fn(async () => ({
                        isVerified: true,
                    })),
                };

                const mockProjectParametersModel = {
                    find: jest.fn(async () => []),
                };

                const service = getMockedAsyncQueryService(
                    lightdashConfigMock,
                    {
                        userModel: mockUserModel as unknown as UserModel,
                        userAttributesModel:
                            mockUserAttributesModel as unknown as UserAttributesModel,
                        emailModel: mockEmailModel as unknown as EmailModel,
                        projectParametersModel:
                            mockProjectParametersModel as unknown as ProjectParametersModel,
                    },
                );

                // Mock getUserAttributes method to return the expected attributes
                service.getUserAttributes = jest.fn(async () => ({
                    userAttributes: {
                        department: ['engineering'],
                        region: ['us-west'],
                    },
                    intrinsicUserAttributes: {
                        email: 'test@example.com',
                    },
                }));

                // Mock the warehouse client to capture the executed SQL
                let capturedSql = '';
                const mockWarehouseClient = {
                    ...warehouseClientMock,
                    streamQuery: jest.fn(async (sql, callback) => {
                        capturedSql = sql;
                        // Simulate empty results for column discovery
                        await callback({
                            fields: {
                                test_col: { type: DimensionType.STRING },
                            },
                            rows: [],
                        });
                    }),
                };

                // Override the _getWarehouseClient method to return our mock
                service._getWarehouseClient = jest.fn(async () => ({
                    warehouseClient: mockWarehouseClient,
                    sshTunnel: mockSshTunnel,
                }));

                // WHEN: executeAsyncSqlQuery is called with SQL containing user attributes
                const sqlWithUserAttributes =
                    'SELECT * FROM users WHERE email = ${lightdash.user.email} AND department IN (${lightdash.attribute.department})';

                await service.executeAsyncSqlQuery({
                    account: sessionAccount,
                    projectUuid,
                    sql: sqlWithUserAttributes,
                    context: QueryExecutionContext.SQL_RUNNER,
                    invalidateCache: false,
                });

                // THEN: User attributes should be replaced in the executed SQL
                expect(capturedSql).toContain("email = 'test@example.com'");
                expect(capturedSql).toContain("department IN ('engineering')");

                // THEN: getUserAttributes should be called with the account
                expect(service.getUserAttributes).toHaveBeenCalledWith({
                    account: sessionAccount,
                });
            });

            it('should handle missing user attributes gracefully', async () => {
                // GIVEN: Service with no user attributes
                const mockProjectParametersModel = {
                    find: jest.fn(async () => []),
                };

                const service = getMockedAsyncQueryService(
                    lightdashConfigMock,
                    {
                        projectParametersModel:
                            mockProjectParametersModel as unknown as ProjectParametersModel,
                    },
                );

                // Mock getUserAttributes to return empty attributes
                service.getUserAttributes = jest.fn(async () => ({
                    userAttributes: {},
                    intrinsicUserAttributes: { email: 'test@example.com' },
                }));

                // WHEN: executeAsyncSqlQuery is called with SQL containing missing user attributes
                const sqlWithMissingAttributes =
                    'SELECT * FROM users WHERE department = ${lightdash.attribute.missing_attribute}';

                // THEN: Should throw ForbiddenError for missing attributes
                await expect(
                    service.executeAsyncSqlQuery({
                        account: sessionAccount,
                        projectUuid,
                        sql: sqlWithMissingAttributes,
                        context: QueryExecutionContext.SQL_RUNNER,
                        invalidateCache: false,
                    }),
                ).rejects.toThrow();
            });

            it('should handle unverified email by not replacing intrinsic attributes', async () => {
                // GIVEN: Service with unverified email (empty intrinsic attributes)
                const mockProjectParametersModel = {
                    find: jest.fn(async () => []),
                };

                const service = getMockedAsyncQueryService(
                    lightdashConfigMock,
                    {
                        projectParametersModel:
                            mockProjectParametersModel as unknown as ProjectParametersModel,
                    },
                );

                // Mock getUserAttributes to return empty intrinsic attributes (unverified email)
                service.getUserAttributes = jest.fn(async () => ({
                    userAttributes: {},
                    intrinsicUserAttributes: {}, // Empty because email is not verified
                }));

                // WHEN: executeAsyncSqlQuery is called with SQL containing user email
                const sqlWithUserEmail =
                    'SELECT * FROM users WHERE email = ${lightdash.user.email}';

                // THEN: Should throw ForbiddenError for unverified email
                await expect(
                    service.executeAsyncSqlQuery({
                        account: sessionAccount,
                        projectUuid,
                        sql: sqlWithUserEmail,
                        context: QueryExecutionContext.SQL_RUNNER,
                        invalidateCache: false,
                    }),
                ).rejects.toThrow();
            });
        });
    });
});
