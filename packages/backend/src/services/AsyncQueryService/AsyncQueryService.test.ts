import {
    AnyType,
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
    type WarehouseClient,
} from '@lightdash/common';
import { type SshTunnel } from '@lightdash/warehouses';
import { Readable } from 'stream';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import type { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import type { INatsClient } from '../../clients/NatsClient';
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
import type { PreAggregateModel } from '../../models/PreAggregateModel';
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
import { AdminNotificationService } from '../AdminNotificationService/AdminNotificationService';
import type { ICacheService } from '../CacheService/ICacheService';
import { CacheHitCacheResult, MissCacheResult } from '../CacheService/types';
import { PermissionsService } from '../PermissionsService/PermissionsService';
import { PersistentDownloadFileService } from '../PersistentDownloadFileService/PersistentDownloadFileService';
import { NULL_PIVOT_COLUMN_VALUE_KEY } from '../pivotColumnReference';
import { PivotTableService } from '../PivotTableService/PivotTableService';
import {
    allExplores,
    expectedColumns,
    expectedFormattedRow,
    job,
    lightdashConfigWithNoSMTP,
    metricQueryMock,
    preAggregateExplore,
    projectSummary,
    projectWithSensitiveFields,
    resultsWith1Row,
    sessionAccount,
    spacesWithSavedCharts,
    tablesConfiguration,
    validExplore,
} from '../ProjectService/ProjectService.mock';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import {
    AsyncQueryService,
    QUEUED_QUERY_EXPIRED_MESSAGE,
} from './AsyncQueryService';
import {
    PreAggregationDuckDbResolveReason,
    type PreAggregationDuckDbClient,
} from './PreAggregationDuckDbClient';
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
        preAggregateModel: {} as PreAggregateModel,
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
        userWarehouseCredentialsModel: {
            findForProjectWithSecrets: jest.fn(async () => undefined),
        } as unknown as UserWarehouseCredentialsModel,
        warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
        emailModel: {
            getPrimaryEmailStatus: () => ({
                isVerified: true,
            }),
        } as unknown as EmailModel,
        schedulerClient: {
            scheduleTask: jest.fn(),
        } as unknown as SchedulerClient,
        natsClient: {
            enqueueWarehouseQuery: jest.fn(async () => ({
                jobId: 'test-nats-job-id',
            })),
            enqueuePreAggregateQuery: jest.fn(async () => ({
                jobId: 'test-nats-pre-agg-job-id',
            })),
        } as unknown as INatsClient,
        downloadFileModel: {} as unknown as DownloadFileModel,
        fileStorageClient: {} as FileStorageClient,
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
            getByQueryUuid: jest.fn(async () => undefined),
            update: jest.fn(),
            updateStatusToQueued: jest.fn(async () => 1),
            updateStatusToExecuting: jest.fn(async () => 1),
            updateStatusToExpired: jest.fn(async () => 1),
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
            getFirstLine: jest.fn(async () => '{}'),
            getFileUrl: jest.fn(
                async () => 'https://example.com/results.jsonl',
            ),
            createUploadStream: jest.fn(() => ({
                write: jest.fn(),
                close: jest.fn(),
            })),
        } as unknown as S3ResultsFileStorageClient,
        preAggregateResultsStorageClient: {
            isEnabled: true,
            getDownloadStream: jest.fn(() => {
                const readable = new Readable({
                    read() {
                        this.push('{}');
                        this.push(null);
                    },
                });
                return readable;
            }),
            getFirstLine: jest.fn(async () => '{}'),
            getFileUrl: jest.fn(
                async () => 'https://example.com/preagg-results.jsonl',
            ),
            createUploadStream: jest.fn(() => ({
                write: jest.fn(),
                close: jest.fn(),
            })),
        } as unknown as S3ResultsFileStorageClient,
        featureFlagModel: {} as FeatureFlagModel,
        projectParametersModel: {
            find: jest.fn(async () => []),
        } as unknown as ProjectParametersModel,
        organizationWarehouseCredentialsModel:
            {} as OrganizationWarehouseCredentialsModel,
        pivotTableService: new PivotTableService({
            lightdashConfig,
            fileStorageClient: {} as FileStorageClient,
            downloadFileModel: {} as DownloadFileModel,
            persistentDownloadFileService: {} as PersistentDownloadFileService,
        }),
        permissionsService: {} as PermissionsService,
        persistentDownloadFileService: {} as PersistentDownloadFileService,
        preAggregationDuckDbClient: {
            resolve: jest.fn(async () => ({
                resolved: false as const,
                reason: PreAggregationDuckDbResolveReason.RESOLVE_ERROR,
            })),
        } as unknown as PreAggregationDuckDbClient,
        projectCompileLogModel: {} as ProjectCompileLogModel,
        adminNotificationService: {} as AdminNotificationService,
        spacePermissionService: {} as SpacePermissionService,
        preAggregateDailyStatsModel: {
            upsert: jest.fn(),
        } as unknown as import('../../models/PreAggregateDailyStatsModel').PreAggregateDailyStatsModel,
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
                    }) satisfies MissCacheResult,
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
                pivotTotalGroupCount: null,
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
                    pivot_total_group_count: null,
                    pivot_values_columns: null,
                },
                sessionAccount,
            );

            // NATS is disabled, so lifecycle statuses are skipped
            expect(
                serviceWithCache.queryHistoryModel.updateStatusToExecuting,
            ).not.toHaveBeenCalled();
            expect(
                serviceWithCache.queryHistoryModel.updateStatusToQueued,
            ).not.toHaveBeenCalled();

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
            const runAsyncWarehouseQuerySpy = jest
                .spyOn(serviceWithCache, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);

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
                    userUuid: sessionAccount.user.id,
                    isRegisteredUser: sessionAccount.isRegisteredUser(),
                    projectUuid,
                    query: 'SELECT * FROM test',
                    queryUuid: 'test-query-uuid',
                    fieldsMap: {},
                    queryTags: { query_context: QueryExecutionContext.EXPLORE },
                } satisfies Partial<RunAsyncWarehouseQueryArgs>),
            );

            // NATS is disabled, so lifecycle statuses are skipped
            expect(
                serviceWithCache.queryHistoryModel.updateStatusToExecuting,
            ).not.toHaveBeenCalled();
            expect(
                serviceWithCache.queryHistoryModel.updateStatusToQueued,
            ).not.toHaveBeenCalled();

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
            const runAsyncWarehouseQuerySpy = jest
                .spyOn(serviceWithCache, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);

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
                    userUuid: sessionAccount.user.id,
                    isRegisteredUser: sessionAccount.isRegisteredUser(),
                    projectUuid,
                    query: 'SELECT * FROM test',
                    queryUuid: 'test-query-uuid',
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
            const runAsyncWarehouseQuerySpy = jest
                .spyOn(serviceWithoutCache, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);

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
                    userUuid: sessionAccount.user.id,
                    isRegisteredUser: sessionAccount.isRegisteredUser(),
                    projectUuid,
                    query: 'SELECT * FROM test',
                    queryUuid: 'test-query-uuid',
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

        test('does not resolve pre-aggregates when flag is disabled', async () => {
            const resolveSpy = jest.fn(async () => ({
                resolved: false as const,
                reason: PreAggregationDuckDbResolveReason.RESOLVE_ERROR,
            }));
            const service = getMockedAsyncQueryService({
                ...lightdashConfigMock,
                preAggregates: {
                    enabled: false,
                    parquetEnabled: false,
                },
            });
            (service as AnyType).preAggregationDuckDbClient = {
                resolve: resolveSpy,
            } as unknown as PreAggregationDuckDbClient;

            const runAsyncWarehouseQuerySpy = jest
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);
            const runAsyncPreAggregateQuerySpy = jest
                .spyOn(service, 'runAsyncPreAggregateQuery')
                .mockResolvedValue(undefined);

            await service.executeAsyncQuery(
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
                    preAggregationRoute: {
                        sourceExploreName: metricQueryMock.exploreName,
                        preAggregateName: 'orders_daily',
                        mode: 'opportunistic',
                    },
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                    availableParameterDefinitions: {},
                },
                { query: metricQueryMock },
            );

            expect(resolveSpy).not.toHaveBeenCalled();
            expect(runAsyncWarehouseQuerySpy).toHaveBeenCalledTimes(1);
            expect(runAsyncPreAggregateQuerySpy).not.toHaveBeenCalled();
        });

        test('required pre-aggregate routes error when resolution fails and NATS is enabled', async () => {
            const resolveSpy = jest.fn(async () => ({
                resolved: false as const,
                reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
            }));
            const service = getMockedAsyncQueryService({
                ...lightdashConfigMock,
                natsWorker: {
                    ...lightdashConfigMock.natsWorker,
                    enabled: true,
                },
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            (service as AnyType).preAggregationDuckDbClient = {
                resolve: resolveSpy,
            } as unknown as PreAggregationDuckDbClient;

            (service.queryHistoryModel.create as jest.Mock).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            const runAsyncWarehouseSpy = jest.spyOn(
                service,
                'runAsyncWarehouseQuery',
            );
            const runAsyncPreAggSpy = jest.spyOn(
                service,
                'runAsyncPreAggregateQuery',
            );

            await service.executeAsyncQuery(
                {
                    account: sessionAccount,
                    projectUuid,
                    metricQuery: {
                        ...metricQueryMock,
                        exploreName: preAggregateExplore.name,
                    },
                    context: QueryExecutionContext.EXPLORE,
                    dateZoom: undefined,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    explore: preAggregateExplore,
                    invalidateCache: false,
                    sql: 'SELECT * FROM test',
                    fields: {},
                    missingParameterReferences: [],
                    preAggregationRoute: {
                        ...preAggregateExplore.preAggregateSource!,
                        mode: 'required',
                    },
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                    availableParameterDefinitions: {},
                },
                {
                    query: {
                        ...metricQueryMock,
                        exploreName: preAggregateExplore.name,
                    },
                },
            );

            expect(resolveSpy).toHaveBeenCalledTimes(1);
            expect(runAsyncWarehouseSpy).not.toHaveBeenCalled();
            expect(runAsyncPreAggSpy).not.toHaveBeenCalled();
            expect(service.queryHistoryModel.update).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                {
                    status: QueryHistoryStatus.ERROR,
                    error: 'No active materialization found for pre-aggregate explore "__preagg__valid_explore__rollup"',
                },
                sessionAccount,
            );
        });

        test('resolved pre-aggregate routes enqueue a pre-aggregate job', async () => {
            const service = getMockedAsyncQueryService({
                ...lightdashConfigMock,
                natsWorker: {
                    ...lightdashConfigMock.natsWorker,
                    enabled: true,
                },
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            (service as AnyType).preAggregationDuckDbClient = {
                resolve: jest.fn(async () => ({
                    resolved: true as const,
                    query: 'SELECT * FROM duckdb_preagg',
                    warehouseClient: warehouseClientMock,
                })),
            } as unknown as PreAggregationDuckDbClient;

            (service.queryHistoryModel.create as jest.Mock).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            const runAsyncWarehouseSpy = jest
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);
            const enqueuePreAggregateSpy = jest.spyOn(
                service.natsClient,
                'enqueuePreAggregateQuery',
            );

            await service.executeAsyncQuery(
                {
                    account: sessionAccount,
                    projectUuid,
                    metricQuery: {
                        ...metricQueryMock,
                        exploreName: preAggregateExplore.name,
                    },
                    context: QueryExecutionContext.EXPLORE,
                    dateZoom: undefined,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    explore: preAggregateExplore,
                    invalidateCache: false,
                    sql: 'SELECT * FROM warehouse',
                    fields: {},
                    missingParameterReferences: [],
                    preAggregationRoute: {
                        ...preAggregateExplore.preAggregateSource!,
                        mode: 'required',
                    },
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                    availableParameterDefinitions: {},
                },
                {
                    query: {
                        ...metricQueryMock,
                        exploreName: preAggregateExplore.name,
                    },
                },
            );

            expect(enqueuePreAggregateSpy).toHaveBeenCalledTimes(1);
            expect(enqueuePreAggregateSpy).toHaveBeenCalledWith({
                queryUuid: 'test-query-uuid',
            });
            expect(service.queryHistoryModel.update).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                {
                    pre_aggregate_compiled_sql: 'SELECT * FROM duckdb_preagg',
                },
                sessionAccount,
            );
            expect(runAsyncWarehouseSpy).not.toHaveBeenCalled();
        });

        test('opportunistic pre-aggregate routes enqueue a warehouse job when DuckDB cannot resolve', async () => {
            const resolveSpy = jest.fn(async () => ({
                resolved: false as const,
                reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
            }));
            const service = getMockedAsyncQueryService({
                ...lightdashConfigMock,
                natsWorker: {
                    ...lightdashConfigMock.natsWorker,
                    enabled: true,
                },
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            (service as AnyType).preAggregationDuckDbClient = {
                resolve: resolveSpy,
            } as unknown as PreAggregationDuckDbClient;

            (service.queryHistoryModel.create as jest.Mock).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            const runAsyncSpy = jest
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);
            const enqueueWarehouseSpy = jest.spyOn(
                service.natsClient,
                'enqueueWarehouseQuery',
            );

            await service.executeAsyncQuery(
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
                    sql: 'SELECT * FROM warehouse',
                    fields: {},
                    missingParameterReferences: [],
                    preAggregationRoute: {
                        sourceExploreName: metricQueryMock.exploreName,
                        preAggregateName: 'orders_daily',
                        mode: 'opportunistic',
                    },
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                    availableParameterDefinitions: {},
                },
                { query: metricQueryMock },
            );

            expect(resolveSpy).toHaveBeenCalledTimes(1);
            expect(enqueueWarehouseSpy).toHaveBeenCalledTimes(1);
            expect(enqueueWarehouseSpy).toHaveBeenCalledWith({
                queryUuid: 'test-query-uuid',
            });
            expect(runAsyncSpy).not.toHaveBeenCalled();
        });
    });

    describe('executeAsyncMetricQuery', () => {
        test('attaches required pre-aggregate routing metadata for direct pre-aggregate explores', async () => {
            const service = getMockedAsyncQueryService({
                ...lightdashConfigMock,
                natsWorker: {
                    ...lightdashConfigMock.natsWorker,
                    enabled: true,
                },
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            service.getExplore = jest
                .fn()
                .mockResolvedValue(preAggregateExplore);
            (service as AnyType).getWarehouseCredentials = jest
                .fn()
                .mockResolvedValue(warehouseClientMock.credentials);
            service.combineParameters = jest.fn().mockResolvedValue(undefined);
            (service as AnyType).prepareMetricQueryAsyncQueryArgs = jest
                .fn()
                .mockResolvedValue({
                    sql: 'SELECT * FROM duckdb_preagg',
                    fields: {},
                    warnings: [],
                    parameterReferences: [],
                    missingParameterReferences: [],
                    usedParameters: {},
                    responseMetricQuery: {
                        ...metricQueryMock,
                        exploreName: preAggregateExplore.name,
                    },
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                    availableParameterDefinitions: {},
                });
            service.executeAsyncQuery = jest.fn().mockResolvedValue({
                queryUuid: 'queryUuid',
                cacheMetadata: {
                    cacheHit: false,
                },
            });

            const result = await service.executeAsyncMetricQuery({
                account: sessionAccount,
                projectUuid,
                metricQuery: {
                    ...metricQueryMock,
                    exploreName: preAggregateExplore.name,
                },
                context: QueryExecutionContext.EXPLORE,
                invalidateCache: false,
                dateZoom: undefined,
                parameters: undefined,
                pivotConfiguration: undefined,
            });

            expect(service.executeAsyncQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    preAggregationRoute: {
                        sourceExploreName: 'valid_explore',
                        preAggregateName: 'rollup',
                        mode: 'required',
                    },
                }),
                expect.any(Object),
            );
            expect(result.cacheMetadata.preAggregate).toEqual({
                hit: true,
                name: 'rollup',
            });
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
                createdByActorType: 'session',
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
                pivotTotalGroupCount: null,
                pivotValuesColumns: null,
                resultsFileName,
                resultsCreatedAt: null,
                resultsUpdatedAt: null,
                resultsExpiresAt: null,
                columns: null,
                originalColumns: null,
                preAggregateCompiledSql: null,
                processingStartedAt: null,
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

            const expiredQuery = createMockQueryHistory(
                QueryHistoryStatus.EXPIRED,
                'Query expired in queue',
            );
            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(expiredQuery);

            const expiredResult = await serviceWithCache.getAsyncQueryResults({
                account: sessionAccount,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(expiredResult).toEqual({
                error: 'Query expired in queue',
                status: QueryHistoryStatus.EXPIRED,
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

            const queuedQuery = createMockQueryHistory(
                QueryHistoryStatus.QUEUED,
            );
            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(queuedQuery);

            const queuedResult = await serviceWithCache.getAsyncQueryResults({
                account: sessionAccount,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(queuedResult).toEqual({
                status: QueryHistoryStatus.QUEUED,
                queryUuid: 'test-query-uuid',
            });

            const executingQuery = createMockQueryHistory(
                QueryHistoryStatus.EXECUTING,
            );
            serviceWithCache.queryHistoryModel.get = jest
                .fn()
                .mockResolvedValue(executingQuery);

            const executingResult = await serviceWithCache.getAsyncQueryResults(
                {
                    account: sessionAccount,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                    page: 1,
                    pageSize: 10,
                },
            );

            expect(executingResult).toEqual({
                status: QueryHistoryStatus.EXECUTING,
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
                createdByActorType: 'session',
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
                pivotTotalGroupCount: 5,
                pivotValuesColumns: mockPivotValuesColumns,
                resultsFileName: 'results-file-name.json',
                resultsCreatedAt: new Date(),
                resultsUpdatedAt: new Date(),
                resultsExpiresAt: new Date(Date.now() + 60_000),
                columns: expectedColumns,
                originalColumns: mockOriginalColumns,
                preAggregateCompiledSql: null,
                processingStartedAt: null,
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
                    totalGroupCount: 5,
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

    describe('prepareQueuedQueryForExecution', () => {
        const createMockQueryHistory = (
            status: QueryHistoryStatus,
            createdAt: Date = new Date(),
        ): QueryHistory => ({
            createdAt,
            organizationUuid: sessionAccount.organization.organizationUuid!,
            createdByUserUuid: sessionAccount.user.id,
            createdBy: sessionAccount.user.id,
            createdByAccount: null,
            createdByActorType: 'session',
            queryUuid: 'test-query-uuid',
            projectUuid,
            status,
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
            pivotTotalGroupCount: null,
            pivotValuesColumns: null,
            resultsFileName: null,
            resultsCreatedAt: null,
            resultsUpdatedAt: null,
            resultsExpiresAt: null,
            columns: null,
            originalColumns: null,
            preAggregateCompiledSql: null,
            processingStartedAt: null,
        });

        test('transitions queued queries to executing', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            (
                service.queryHistoryModel.getByQueryUuid as jest.Mock
            ).mockResolvedValue(
                createMockQueryHistory(QueryHistoryStatus.QUEUED),
            );

            const canRun = await service.prepareQueuedQueryForExecution(
                'test-query-uuid',
                'worker-1',
            );

            expect(canRun).toBe(true);
            expect(
                service.queryHistoryModel.updateStatusToExecuting,
            ).toHaveBeenCalledWith('test-query-uuid');
            expect(
                service.queryHistoryModel.updateStatusToExpired,
            ).not.toHaveBeenCalled();
        });

        test('expires stale queued queries', async () => {
            const service = getMockedAsyncQueryService({
                ...lightdashConfigMock,
                natsWorker: {
                    ...lightdashConfigMock.natsWorker,
                    queueTimeoutMs: 1000,
                },
            });
            (
                service.queryHistoryModel.getByQueryUuid as jest.Mock
            ).mockResolvedValue(
                createMockQueryHistory(
                    QueryHistoryStatus.QUEUED,
                    new Date(Date.now() - 2000),
                ),
            );

            const canRun = await service.prepareQueuedQueryForExecution(
                'test-query-uuid',
                'worker-1',
            );

            expect(canRun).toBe(false);
            expect(
                service.queryHistoryModel.updateStatusToExpired,
            ).toHaveBeenCalledWith(
                'test-query-uuid',
                QUEUED_QUERY_EXPIRED_MESSAGE,
            );
            expect(
                service.queryHistoryModel.updateStatusToExecuting,
            ).not.toHaveBeenCalled();
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

            const runAsyncWarehouseQuerySpy = jest
                .spyOn(serviceWithCache, 'runAsyncWarehouseQuery')
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
            expect(runAsyncWarehouseQuerySpy).toHaveBeenCalledWith(
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
                    userUuid: sessionAccount.user.id,
                    isRegisteredUser: true,
                    projectUuid,
                    query: 'SELECT * FROM test',
                    fieldsMap: {},
                    queryTags: { query_context: QueryExecutionContext.EXPLORE },
                    warehouseCredentialsOverrides: undefined,
                    queryUuid: 'test-query-uuid',
                    cacheKey: 'test-cache-key',
                    pivotConfiguration: undefined,
                    originalColumns: undefined,
                    queryCreatedAt: new Date(),
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
                        queryTags: expect.objectContaining({
                            query_context: QueryExecutionContext.EXPLORE,
                            query_uuid: 'test-query-uuid',
                        }),
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
                userUuid: sessionAccount.user.id,
                isRegisteredUser: true,
                projectUuid,
                query: 'SELECT * FROM test_table',
                fieldsMap: {},
                queryTags: { query_context: QueryExecutionContext.EXPLORE },
                warehouseCredentialsOverrides: undefined,
                queryUuid: 'test-query-uuid',
                cacheKey: 'test-cache-key',
                pivotConfiguration: undefined,
                originalColumns: undefined,
                queryCreatedAt: new Date(),
            };

            // WHEN: runAsyncWarehouseQuery is called
            await service.runAsyncWarehouseQuery(runAsyncArgs);

            // THEN: Warehouse query executed with warehouse client
            expect(runQueryAndTransformRowsSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    warehouseClient: expect.objectContaining({
                        credentials: expect.any(Object),
                    }),
                    queryTags: expect.objectContaining({
                        query_context: QueryExecutionContext.EXPLORE,
                        query_uuid: 'test-query-uuid',
                    }),
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

        test('Preserves null pivot groups as distinct pivot columns', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                projectModel: projectModel as unknown as ProjectModel,
            });

            const mockStorageClient =
                service.resultsStorageClient as unknown as {
                    createUploadStream: jest.Mock;
                };
            mockStorageClient.createUploadStream = jest.fn(() => ({
                write: jest.fn(),
                close: jest.fn(),
            }));

            service.queryHistoryModel.update = jest.fn();

            const mockWarehouseClient = {
                ...warehouseClientMock,
                executeAsyncQuery: jest.fn(async (_query, callback) => {
                    await callback?.(
                        [
                            {
                                payments_payment_method: 'credit_card',
                                orders_promo_code: null,
                                orders_unique_order_count_any_sum: 79,
                                row_index: 1,
                                column_index: 1,
                                total_columns: 3,
                                total_groups: 3,
                            },
                            {
                                payments_payment_method: 'credit_card',
                                orders_promo_code: 'FLASH',
                                orders_unique_order_count_any_sum: 1,
                                row_index: 1,
                                column_index: 2,
                                total_columns: 3,
                                total_groups: 3,
                            },
                            {
                                payments_payment_method: 'credit_card',
                                orders_promo_code: 'Other',
                                orders_unique_order_count_any_sum: 5,
                                row_index: 1,
                                column_index: 3,
                                total_columns: 3,
                                total_groups: 3,
                            },
                        ],
                        {
                            payments_payment_method: {
                                type: DimensionType.STRING,
                            },
                            orders_promo_code: {
                                type: DimensionType.STRING,
                            },
                            orders_unique_order_count_any_sum: {
                                type: DimensionType.NUMBER,
                            },
                            row_index: {
                                type: DimensionType.NUMBER,
                            },
                            column_index: {
                                type: DimensionType.NUMBER,
                            },
                            total_columns: {
                                type: DimensionType.NUMBER,
                            },
                            total_groups: {
                                type: DimensionType.NUMBER,
                            },
                        },
                    );
                    return {
                        queryId: null,
                        queryMetadata: null,
                        totalRows: 3,
                        durationMs: 10,
                    };
                }),
            } satisfies WarehouseClient;

            await service.runAsyncWarehouseQuery({
                userUuid: sessionAccount.user.id,
                isRegisteredUser: true,
                projectUuid,
                query: 'SELECT * FROM test_table',
                fieldsMap: {},
                queryTags: { query_context: QueryExecutionContext.EXPLORE },
                warehouseCredentialsOverrides: undefined,
                queryUuid: 'test-query-uuid',
                cacheKey: 'test-cache-key',
                pivotConfiguration: {
                    indexColumn: {
                        reference: 'payments_payment_method',
                        type: VizIndexType.CATEGORY,
                    },
                    valuesColumns: [
                        {
                            reference: 'orders_unique_order_count_any',
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                    groupByColumns: [{ reference: 'orders_promo_code' }],
                    sortBy: [],
                },
                originalColumns: undefined,
                queryCreatedAt: new Date(),
                warehouseClientOverride: mockWarehouseClient,
            });

            expect(service.queryHistoryModel.update).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                expect.objectContaining({
                    pivot_total_column_count: 3,
                    pivot_total_group_count: 3,
                    pivot_values_columns: expect.objectContaining({
                        [`orders_unique_order_count_any_sum_${NULL_PIVOT_COLUMN_VALUE_KEY}`]:
                            expect.objectContaining({
                                pivotColumnName: `orders_unique_order_count_any_sum_${NULL_PIVOT_COLUMN_VALUE_KEY}`,
                                pivotValues: [
                                    expect.objectContaining({
                                        referenceField: 'orders_promo_code',
                                        value: null,
                                    }),
                                ],
                                columnIndex: 1,
                            }),
                        orders_unique_order_count_any_sum_FLASH:
                            expect.objectContaining({
                                columnIndex: 2,
                            }),
                        orders_unique_order_count_any_sum_Other:
                            expect.objectContaining({
                                columnIndex: 3,
                            }),
                    }),
                }),
                expect.any(Object),
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
