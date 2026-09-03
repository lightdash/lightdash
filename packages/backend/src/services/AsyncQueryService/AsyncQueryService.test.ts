import { Ability } from '@casl/ability';
import {
    Account,
    AnyType,
    ChartType,
    CreateWarehouseCredentials,
    DimensionType,
    DownloadFileType,
    ExecuteAsyncQueryRequestParams,
    ExploreType,
    ExternalSourceScope,
    FeatureFlags,
    FieldType,
    FilterOperator,
    ForbiddenError,
    MetricType,
    MissingConfigError,
    NotFoundError,
    OrganizationAccessStatus,
    PersistentDownloadFileAccessMode,
    PossibleAbilities,
    QueryExecutionContext,
    QueryHistory,
    QueryHistoryStatus,
    QueryHistoryWindow,
    QueryTrigger,
    ResultColumns,
    VizAggregationOptions,
    VizIndexType,
    WarehouseClient,
    WarehouseTypes,
    type Explore,
    type ItemsMap,
    type MetricQuery,
    type ParameterDefinitions,
    type ProjectDefaults,
    type UserAccessControls,
} from '@lightdash/common';
import type { SshTunnel } from '@lightdash/warehouses';
import ExecutionContext from 'node-execution-context';
import { Readable } from 'stream';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import type { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import EmailClient from '../../clients/EmailClient/EmailClient';
import type { FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import type { INatsClient } from '../../clients/NatsClient';
import type { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../config/parseConfig';
import type { PreAggregateModel } from '../../ee/models/PreAggregateModel';
import type { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import type { ContentDraftModel } from '../../models/ContentDraftModel';
import type { ContentModel } from '../../models/ContentModel/ContentModel';
import type { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { DownloadAuditModel } from '../../models/DownloadAuditModel';
import type { DownloadFileModel } from '../../models/DownloadFileModel';
import type { EmailModel } from '../../models/EmailModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { GroupsModel } from '../../models/GroupsModel';
import type { JobModel } from '../../models/JobModel/JobModel';
import type { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import type { OrganizationModel } from '../../models/OrganizationModel';
import type { OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import type { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import type { ProjectCompileLogModel } from '../../models/ProjectCompileLogModel';
import type { ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
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
import type { UserOAuthGrantsModel } from '../../models/UserOAuthGrantsModel';
import type { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import type { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import type { SchedulerClient } from '../../scheduler/SchedulerClient';
import type { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import type { QueryComposer } from '../../utils/QueryBuilder/QueryComposer';
import { AdminNotificationService } from '../AdminNotificationService/AdminNotificationService';
import type { ICacheService } from '../CacheService/ICacheService';
import { CacheHitCacheResult, MissCacheResult } from '../CacheService/types';
import { OrganizationAccessService } from '../OrganizationAccessService/OrganizationAccessService';
import { PermissionsService } from '../PermissionsService/PermissionsService';
import { PersistentDownloadFileService } from '../PersistentDownloadFileService/PersistentDownloadFileService';
import { PivotTableService } from '../PivotTableService/PivotTableService';
import {
    allExplores,
    buildAccount,
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
    COMPOSE_ENGINE_INSTANCE_CACHE_KEY,
    ComposeEngineClient,
} from './ComposeEngineClient';
import {
    NoOpPreAggregateStrategy,
    type PreAggregateExecutionResolution,
    type PreAggregateStrategy,
} from './PreAggregateStrategy';
import type {
    DownloadAsyncQueryResultsArgs,
    ExecuteAsyncQueryReturn,
    RunAsyncWarehouseQueryArgs,
} from './types';

const noOpStrategy = new NoOpPreAggregateStrategy();

const makeMockStrategy = (
    resolveResult: PreAggregateExecutionResolution,
): PreAggregateStrategy => ({
    getRoutingDecision: noOpStrategy.getRoutingDecision.bind(noOpStrategy),
    resolveExecution: vi.fn(async () => resolveResult),
    createPreAggregateWarehouseClient: vi.fn(
        () => warehouseClientMock as unknown as WarehouseClient,
    ),
    recordStats: vi.fn(),
    recordExecutionFallback: vi.fn(),
    cleanupStats: vi.fn(async () => 0),
    getStats: noOpStrategy.getStats.bind(noOpStrategy),
    getResultsStorageClient: vi.fn(() => undefined),
    auditDashboard: noOpStrategy.auditDashboard.bind(noOpStrategy),
});

// Import the mocked function
const mockSshTunnel = {
    connect: vi.fn(() => warehouseClientMock.credentials),
    disconnect: vi.fn(),
} as unknown as SshTunnel<CreateWarehouseCredentials>;

vi.mock('@lightdash/warehouses', async () => ({
    ...(await vi.importActual<typeof import('@lightdash/warehouses')>(
        '@lightdash/warehouses',
    )),
    SshTunnel: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockSshTunnel() {
            return mockSshTunnel;
        },
    ),
}));

const warehouseCredentialsMock = {
    ...warehouseClientMock.credentials,
    userWarehouseCredentialsUuid: undefined,
};

// Execute reads query/context data off the composer — mock the getter surface
const createQueryComposerMock = ({
    sql = 'SELECT * FROM test',
    explore = validExplore,
    metricQuery = metricQueryMock,
    fields = {},
    missingParameterReferences = [],
    timezone = undefined,
    displayTimezone = null,
    useTimezoneAwareDateTrunc = false,
    userAccessControls = undefined,
    availableParameterDefinitions = undefined,
}: {
    sql?: string;
    explore?: Explore;
    metricQuery?: MetricQuery;
    fields?: ItemsMap;
    missingParameterReferences?: string[];
    timezone?: string;
    displayTimezone?: string | null;
    useTimezoneAwareDateTrunc?: boolean;
    userAccessControls?: UserAccessControls;
    availableParameterDefinitions?: ParameterDefinitions;
} = {}) =>
    ({
        getSql: () => sql,
        getExplore: () => explore,
        getMetricQuery: () => metricQuery,
        getPivotConfiguration: () => undefined,
        getFields: () => fields,
        getMissingParameterReferences: () => missingParameterReferences,
        getParameterReferences: () => [],
        getWarnings: () => [],
        getUsedParameters: () => ({}),
        getParameters: () => undefined,
        getDateZoom: () => undefined,
        getTimezone: () => timezone,
        getDisplayTimezone: () => displayTimezone,
        getUseTimezoneAwareDateTrunc: () => useTimezoneAwareDateTrunc,
        getUserAccessControls: () => userAccessControls,
        getAvailableParameterDefinitions: () => availableParameterDefinitions,
    }) as unknown as QueryComposer;

const projectModel = {
    getWithSensitiveFields: vi.fn(async () => projectWithSensitiveFields),
    get: vi.fn(async () => projectWithSensitiveFields),
    getSummary: vi.fn(async () => projectSummary),
    getEffectiveResultsCacheTtlSeconds: vi.fn(async () => 86400),
    getTablesConfiguration: vi.fn(async () => tablesConfiguration),
    updateTablesConfiguration: vi.fn(),
    getQueryTimezone: vi.fn(async () => 'UTC'),
    getExploreFromCache: vi.fn(async () => validExplore),
    getProjectWarehouseConfig: vi.fn(async () => ({
        organizationWarehouseCredentialsUuid: null,
        queryTimezone: null,
    })),
    findExploresFromCache: vi.fn(async () => allExplores),
    lockProcess: vi.fn((_projectUuid, fun) => fun()),
    getWarehouseCredentialsForProject: vi.fn(
        async () => warehouseClientMock.credentials,
    ),
    getWarehouseClientFromCredentials: vi.fn(() => ({
        ...warehouseClientMock,
        runQuery: vi.fn(async () => resultsWith1Row),
    })),
    findExploreByTableName: vi.fn(async () => validExplore),
    findProjectDefaults: vi.fn(
        async (): Promise<ProjectDefaults | null> => null,
    ),
};
const onboardingModel = {
    getByOrganizationUuid: vi.fn(async () => ({
        ranQueryAt: new Date(),
        shownSuccessAt: new Date(),
    })),
};
const savedChartModel = {
    getAllSpaces: vi.fn(async () => spacesWithSavedCharts),
};
const jobModel = {
    get: vi.fn(async () => job),
};
const spaceModel = {
    getAllSpaces: vi.fn(async () => spacesWithSavedCharts),
};

const userAttributesModel = {
    getAttributeValuesForOrgMember: vi.fn(async () => ({})),
};

const getMockedAsyncQueryService = (
    lightdashConfig: LightdashConfig,
    overrides: Partial<AsyncQueryService> = {},
) =>
    new AsyncQueryService({
        lightdashConfig,
        analytics: analyticsMock,
        contentDraftModel: {
            findOpenDraft: vi.fn().mockResolvedValue(undefined),
        } as unknown as ContentDraftModel,
        projectModel: projectModel as unknown as ProjectModel,
        projectDbtSourcesModel: {} as unknown as ProjectDbtSourcesModel,
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
            findForProjectWithSecrets: vi.fn(async () => undefined),
        } as unknown as UserWarehouseCredentialsModel,
        warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
        emailModel: {
            getPrimaryEmailStatus: () => ({
                isVerified: true,
            }),
        } as unknown as EmailModel,
        schedulerClient: {
            scheduleTask: vi.fn(),
        } as unknown as SchedulerClient,
        natsClient: {
            enqueueWarehouseQuery: vi.fn(async () => ({
                jobId: 'test-nats-job-id',
            })),
            enqueuePreAggregateQuery: vi.fn(async () => ({
                jobId: 'test-nats-pre-agg-job-id',
            })),
            enqueueMaterializationQuery: vi.fn(async () => ({
                jobId: 'test-nats-materialization-job-id',
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
            logDownload: vi.fn(),
        } as unknown as DownloadAuditModel,
        queryHistoryModel: {
            create: vi.fn(async () => ({ queryUuid: 'queryUuid' })),
            get: vi.fn(async () => undefined),
            getByQueryUuid: vi.fn(async () => undefined),
            update: vi.fn(),
            updateStatusToError: vi.fn(async () => 1),
            updateStatusToQueued: vi.fn(async () => 1),
            updateStatusToExecuting: vi.fn(async () => 1),
            updateStatusToExpired: vi.fn(async () => 1),
        } as unknown as QueryHistoryModel,
        userModel: {} as UserModel,
        savedSqlModel: {} as SavedSqlModel,
        resultsStorageClient: {
            isEnabled: true, // ! Hack for current tests that only check for results saved in S3
            getDownloadStream: vi.fn(() => {
                const readable = new Readable({
                    read() {
                        // Push some mock data and end the stream
                        this.push('{}');
                        this.push(null); // End the stream
                    },
                });
                return readable;
            }),
            getFirstLine: vi.fn(async () => '{}'),
            getFileUrl: vi.fn(async () => 'https://example.com/results.jsonl'),
            createUploadStream: vi.fn(() => ({
                write: vi.fn(),
                close: vi.fn(),
            })),
        } as unknown as S3ResultsFileStorageClient,
        featureFlagModel: {
            // Mirror production behaviour: ResultsCacheEnabled resolves from
            // the env-derived lightdashConfig.results.cacheEnabled when there
            // is no DB row.
            get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => {
                if (featureFlagId === FeatureFlags.ResultsCacheEnabled) {
                    return {
                        id: featureFlagId,
                        enabled: lightdashConfig.results.cacheEnabled,
                    };
                }
                return { id: featureFlagId, enabled: false };
            }),
        } as unknown as FeatureFlagModel,
        projectParametersModel: {
            find: vi.fn(async () => []),
        } as unknown as ProjectParametersModel,
        organizationWarehouseCredentialsModel:
            {} as OrganizationWarehouseCredentialsModel,
        organizationModel: {} as OrganizationModel,
        pivotTableService: new PivotTableService({
            lightdashConfig,
            fileStorageClient: {} as FileStorageClient,
            downloadFileModel: {} as DownloadFileModel,
            persistentDownloadFileService: {} as PersistentDownloadFileService,
            organizationSettingsModel: {
                get: vi.fn(async () => ({
                    queryLimit: null,
                    csvCellsLimit: null,
                })),
            } as unknown as OrganizationSettingsModel,
        }),
        permissionsService: {} as PermissionsService,
        persistentDownloadFileService: {} as PersistentDownloadFileService,
        organizationAccessService: {
            getOrganizationAccess: vi.fn(async () => ({
                status: OrganizationAccessStatus.ACTIVE,
            })),
        } as unknown as OrganizationAccessService,
        preAggregateStrategy: new NoOpPreAggregateStrategy(),
        composeEngineClient: new ComposeEngineClient({
            resolveCaCertFile: () => '/etc/ssl/certs/ca-certificates.crt',
            lightdashConfig,
            createDuckdbWarehouseClient: () => warehouseClientMock,
        }),
        projectCompileLogModel: {} as ProjectCompileLogModel,
        adminNotificationService: {} as AdminNotificationService,
        spacePermissionService: {
            resolveAccess: vi.fn(async () => ({
                organizationUuid: projectSummary.organizationUuid,
                projectUuid,
                inheritsFromOrgOrProject: true,
                access: [],
                admins: [],
                directOnly: false,
            })),
        } as unknown as SpacePermissionService,
        directAccessService: {} as never,
        organizationSettingsModel: {
            get: vi.fn(async () => ({
                queryLimit: null,
                csvCellsLimit: null,
            })),
        } as unknown as OrganizationSettingsModel,
        ...overrides,
        getDataAppCustomSqlProvenance:
            overrides.getDataAppCustomSqlProvenance ??
            (async () => ({
                tableCalculations: new Set(),
                customDimensions: new Set(),
                additionalMetrics: new Set(),
            })),
        userOAuthGrantsModel:
            overrides.userOAuthGrantsModel ?? ({} as UserOAuthGrantsModel),
    });

const getJsonlStream = (rows: Record<string, unknown>[]) =>
    Readable.from(rows.map((row) => `${JSON.stringify(row)}\n`).join(''));

type JwtDashboardQueryContextTestService = {
    getJwtDashboardQueryContext: (
        account: Account,
        projectUuid: string,
        requestDashboardUuid: string | undefined,
    ) => Promise<{ dashboardUuid: string | undefined }>;
};

describe('AsyncQueryService', () => {
    describe('saved SQL chart access', () => {
        test('resolves access through the saved SQL chart target', async () => {
            const resolveAccess = vi.fn(async () => ({
                organizationUuid: 'organizationUuid',
                projectUuid,
                inheritsFromOrgOrProject: false,
                access: [
                    {
                        userUuid: 'userId',
                        role: 'viewer',
                        hasDirectAccess: true,
                        grantedVia: 'sql_chart',
                    },
                ],
                admins: [],
                directOnly: true,
            }));
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                spacePermissionService: {
                    resolveAccess,
                } as unknown as SpacePermissionService,
            } as never);
            const account = buildAccount() as AnyType;
            account.user.ability = new Ability<PossibleAbilities>([
                {
                    subject: 'SavedChart',
                    action: 'view',
                    conditions: {
                        access: { $elemMatch: { userUuid: 'userId' } },
                    },
                },
            ]);

            await (service as AnyType).assertSavedChartAccess(account, 'view', {
                savedSqlUuid: 'savedSqlUuid',
                organization: { organizationUuid: 'organizationUuid' },
                project: { projectUuid },
                space: { uuid: 'spaceUuid' },
            });

            expect(resolveAccess).toHaveBeenCalledWith('userId', {
                type: 'sqlChart',
                savedSqlUuid: 'savedSqlUuid',
                spaceUuid: 'spaceUuid',
            });
        });

        test('keeps JWT access scoped to the containing space', async () => {
            const resolveAccess = vi.fn(async () => ({
                organizationUuid: 'organizationUuid',
                projectUuid,
                inheritsFromOrgOrProject: true,
                access: [],
                admins: [],
                directOnly: false,
            }));
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                spacePermissionService: {
                    resolveAccess,
                } as unknown as SpacePermissionService,
            } as never);
            const account = buildAccount({
                accountType: 'jwt',
                userType: 'anonymous',
            }) as AnyType;
            account.user.ability = new Ability<PossibleAbilities>([
                {
                    subject: 'SavedChart',
                    action: 'view',
                },
            ]);

            await (service as AnyType).assertSavedChartAccess(account, 'view', {
                savedSqlUuid: 'savedSqlUuid',
                organization: { organizationUuid: 'organizationUuid' },
                project: { projectUuid },
                space: { uuid: 'spaceUuid' },
            });

            expect(resolveAccess).toHaveBeenCalledWith('userId', {
                type: 'space',
                spaceUuid: 'spaceUuid',
            });
        });
    });

    describe('executeAsyncExternalSqlQuery', () => {
        const execute = (featureFlags: Record<string, boolean>) => {
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                featureFlagModel: {
                    get: vi.fn(
                        async ({
                            featureFlagId,
                        }: {
                            featureFlagId: string;
                        }) => ({
                            id: featureFlagId,
                            enabled: featureFlags[featureFlagId] ?? false,
                        }),
                    ),
                } as unknown as FeatureFlagModel,
            } as never);

            return service.executeAsyncExternalSqlQuery({
                account: sessionAccount,
                projectUuid,
                context: QueryExecutionContext.AI,
                sql: 'SELECT * FROM attachment',
                tables: { attachment: 'table-uuid' },
            });
        };

        test('requires the external sources flag', async () => {
            await expect(
                execute({
                    [FeatureFlags.ComposeSqlRunner]: true,
                }),
            ).rejects.toThrow('External sources are not enabled');
        });

        test('requires the compose SQL runner flag', async () => {
            await expect(
                execute({
                    [FeatureFlags.ExternalSources]: true,
                }),
            ).rejects.toThrow('Compose SQL queries are not enabled');
        });

        test('rejects attachments created by another user', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                featureFlagModel: {
                    get: vi.fn(async ({ featureFlagId }) => ({
                        id: featureFlagId,
                        enabled: true,
                    })),
                } as unknown as FeatureFlagModel,
                externalSourceTableResolver: vi.fn(async () => ({
                    external_source_scope: ExternalSourceScope.ATTACHMENT,
                    external_source_created_by_user_uuid: 'another-user',
                })),
            } as never);

            await expect(
                service.executeAsyncExternalSqlQuery({
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.AI,
                    sql: 'SELECT * FROM attachment',
                    tables: { attachment: 'table-uuid' },
                }),
            ).rejects.toThrow('This attachment belongs to another user');
        });
    });

    describe('compose engine in every edition', () => {
        const composeFlags = {
            get: vi.fn(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    id: featureFlagId,
                    enabled:
                        featureFlagId === FeatureFlags.ComposeSqlRunner ||
                        featureFlagId === FeatureFlags.MergeOnCompose,
                }),
            ),
        } as unknown as FeatureFlagModel;

        const withoutResultsStorage: LightdashConfig = {
            ...lightdashConfigMock,
            results: { ...lightdashConfigMock.results, s3: undefined },
        };

        const referencedQueryHistory = {
            queryUuid: '0b7c9c62-4b6e-4b1a-9c3e-4f6a0c8d2e11',
            projectUuid,
            organizationUuid: projectSummary.organizationUuid,
            createdByUserUuid: sessionAccount.user.id,
            context: QueryExecutionContext.EXPLORE,
            status: QueryHistoryStatus.READY,
            resultsFileName: 'referenced-results.jsonl',
            resultsExpiresAt: null,
            columns: { one: { reference: 'one', type: DimensionType.NUMBER } },
            metricQuery: { exploreName: 'orders' },
        } as unknown as QueryHistory;

        test('runs a compose SQL query over referenced results without a license', async () => {
            const createDuckdbWarehouseClient = vi.fn(
                () => warehouseClientMock,
            );
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                featureFlagModel: composeFlags,
                composeEngineClient: new ComposeEngineClient({
                    resolveCaCertFile: () =>
                        '/etc/ssl/certs/ca-certificates.crt',
                    lightdashConfig: lightdashConfigMock,
                    createDuckdbWarehouseClient,
                }),
                queryHistoryModel: {
                    create: vi.fn(async () => ({ queryUuid: 'queryUuid' })),
                    get: vi.fn(async () => referencedQueryHistory),
                    pollForQueryCompletion: vi.fn(
                        async () => referencedQueryHistory,
                    ),
                    update: vi.fn(),
                } as unknown as QueryHistoryModel,
                resultsStorageClient: {
                    isEnabled: true,
                    configuration: { bucket: 'mock_bucket' },
                } as unknown as S3ResultsFileStorageClient,
            } as never);
            expect((service as AnyType).preAggregateStrategy).toBeInstanceOf(
                NoOpPreAggregateStrategy,
            );
            const runAsyncWarehouseSpy = vi
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);

            const result = await service.executeAsyncComposeSqlQuery({
                account: sessionAccount,
                projectUuid,
                context: QueryExecutionContext.SQL_RUNNER,
                sql: 'SELECT one FROM orders',
                references: { orders: '0b7c9c62-4b6e-4b1a-9c3e-4f6a0c8d2e11' },
            });

            expect(result.queryUuid).toBe('queryUuid');
            await vi.waitFor(() =>
                expect(runAsyncWarehouseSpy).toHaveBeenCalledTimes(1),
            );
            expect(createDuckdbWarehouseClient).toHaveBeenCalledWith({
                s3Config: {
                    endpoint: 'mock_endpoint',
                    region: 'mock_region',
                    caCertFile: '/etc/ssl/certs/ca-certificates.crt',
                    accessKey: undefined,
                    secretKey: undefined,
                    forcePathStyle: false,
                    useSsl: true,
                },
                sharedResourceLimits: undefined,
                instanceCacheKey: COMPOSE_ENGINE_INSTANCE_CACHE_KEY,
            });
            expect(runAsyncWarehouseSpy.mock.calls[0][0]).toMatchObject({
                warehouseClientOverride: warehouseClientMock,
                query: expect.stringContaining(
                    "read_json('s3://mock_bucket/referenced-results.jsonl'",
                ),
            });
        });

        test('refuses a compose SQL query naming the missing results storage', async () => {
            const service = getMockedAsyncQueryService(withoutResultsStorage, {
                featureFlagModel: composeFlags,
            } as never);

            await expect(
                service.executeAsyncComposeSqlQuery({
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.SQL_RUNNER,
                    sql: 'SELECT 1 AS one',
                }),
            ).rejects.toThrow(
                new MissingConfigError(
                    'The compose engine needs results storage to read referenced query results. Set S3_ENDPOINT, S3_BUCKET and S3_REGION, or the RESULTS_S3_* overrides.',
                ),
            );
            expect(service.queryHistoryModel.create).not.toHaveBeenCalled();
        });

        test('reads external-source files on the pre-aggregate bucket session', async () => {
            const createExecutionWarehouseClient = vi.fn(
                () => warehouseClientMock,
            );
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                featureFlagModel: {
                    get: vi.fn(async ({ featureFlagId }) => ({
                        id: featureFlagId,
                        enabled: true,
                    })),
                } as unknown as FeatureFlagModel,
                composeEngineClient: {
                    createExecutionWarehouseClient,
                } as unknown as ComposeEngineClient,
                externalSourceTableResolver: vi.fn(async () => ({
                    external_source_table_uuid: 'table-uuid',
                    external_source_scope: null,
                    external_source_created_by_user_uuid: null,
                    version: 3,
                    locator: {
                        storage: 's3',
                        format: 'parquet',
                        uri: 's3://mock_preagg_bucket/external-sources/file.parquet',
                    },
                    columns: {
                        one: { reference: 'one', type: DimensionType.NUMBER },
                    },
                })),
            } as never);
            vi.spyOn(service, 'runAsyncWarehouseQuery').mockResolvedValue(
                undefined,
            );

            await service.executeAsyncExternalSqlQuery({
                account: sessionAccount,
                projectUuid,
                context: QueryExecutionContext.AI,
                sql: 'SELECT one FROM attachment',
                tables: { attachment: 'table-uuid' },
            });

            expect(createExecutionWarehouseClient).toHaveBeenCalledWith({
                storage: 'externalSources',
                scope: null,
            });
        });

        test('refuses a merge naming the missing results storage instead of downgrading it', async () => {
            const service = getMockedAsyncQueryService(withoutResultsStorage, {
                featureFlagModel: composeFlags,
            } as never);
            vi.spyOn(service, 'compileMergeQuery').mockResolvedValue({
                coreSql: 'SELECT 1',
                typedColumns: [],
                terminalWrapper: null,
                errors: [],
                parameterReferences: [],
                fieldOrigins: {},
                columns: { valueColumnBySourceColumn: {} },
                fieldIdByColumn: {},
                itemsMap: {},
                usedParametersValues: {},
                requiresCompose: false,
            } as never);

            await expect(
                service.executeAsyncMergeQuery({
                    account: sessionAccount,
                    projectUuid,
                    mergeQuery: {
                        sources: [],
                        joinKey: [],
                        joinType: 'full',
                        tableCalculations: [],
                        limit: 500,
                    } as never,
                    context: QueryExecutionContext.EXPLORE,
                    mode: { type: 'interactive' },
                }),
            ).rejects.toThrow(MissingConfigError);
            expect(service.queryHistoryModel.create).not.toHaveBeenCalled();
        });
    });

    describe('executeAsyncMergeQuery', () => {
        const mergeQuery = {
            sources: [],
            joinKey: [],
            joinType: 'full',
            tableCalculations: [],
            limit: 500,
        } as never;

        test('returns validation errors without starting execution', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            vi.spyOn(service, 'compileMergeQuery').mockResolvedValue({
                coreSql: null,
                typedColumns: null,
                terminalWrapper: null,
                errors: [{ message: 'Fan-out' }],
                parameterReferences: ['date'],
                fieldOrigins: {},
            } as never);
            const result = await service.executeAsyncMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery,
                context: QueryExecutionContext.EXPLORE,
                mode: { type: 'interactive' },
            });

            expect(service.compileMergeQuery).toHaveBeenCalledTimes(1);
            expect(result).toMatchObject({
                outcome: 'refused',
                parameterReferences: ['date'],
                errors: [{ message: 'Fan-out' }],
            });
        });
    });

    describe('getJwtDashboardQueryContext', () => {
        const buildDashboardEmbedAccount = () =>
            ({
                ...buildAccount({
                    accountType: 'jwt',
                    userType: 'anonymous',
                }),
                access: {
                    content: {
                        type: 'dashboard',
                        dashboardUuid: 'embedded-dashboard-uuid',
                    },
                },
                authentication: {
                    type: 'jwt',
                    data: {},
                },
            }) as unknown as Account;

        const buildEmbedWriteAccount = () =>
            ({
                ...buildAccount({
                    accountType: 'jwt',
                    userType: 'anonymous',
                }),
                access: {
                    content: {
                        type: 'dashboard',
                        dashboardUuid: 'embedded-dashboard-uuid',
                    },
                },
                authentication: {
                    type: 'jwt',
                    data: {
                        writeActions: {
                            spaceUuid: 'write-space-uuid',
                        },
                    },
                },
                embedWriteUser: {
                    ...sessionAccount.user,
                    ability: new Ability<PossibleAbilities>([
                        {
                            subject: 'Dashboard',
                            action: 'view',
                            conditions: {
                                projectUuid,
                                inheritsFromOrgOrProject: true,
                            },
                        },
                    ]),
                },
            }) as unknown as Account;

        test('uses the embedded dashboard for non-write JWTs', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                dashboardModel: {
                    getByIdOrSlug: vi.fn(),
                } as unknown as DashboardModel,
            });

            const result = await (
                service as unknown as JwtDashboardQueryContextTestService
            ).getJwtDashboardQueryContext(
                buildDashboardEmbedAccount(),
                projectUuid,
                'request-dashboard-uuid',
            );

            expect(result.dashboardUuid).toBe('embedded-dashboard-uuid');
            expect(service.dashboardModel.getByIdOrSlug).not.toHaveBeenCalled();
        });

        test('uses request dashboard when it belongs to the embed write space', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                dashboardModel: {
                    getByIdOrSlug: vi.fn(async () => ({
                        uuid: 'request-dashboard-uuid',
                        name: 'Request dashboard',
                        organizationUuid: projectSummary.organizationUuid,
                        projectUuid,
                        spaceUuid: 'write-space-uuid',
                    })),
                } as unknown as DashboardModel,
            });

            const result = await (
                service as unknown as JwtDashboardQueryContextTestService
            ).getJwtDashboardQueryContext(
                buildEmbedWriteAccount(),
                projectUuid,
                'request-dashboard-uuid',
            );

            expect(result.dashboardUuid).toBe('request-dashboard-uuid');
        });

        test('falls back to embedded dashboard when request dashboard is outside the embed write space', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                dashboardModel: {
                    getByIdOrSlug: vi.fn(async () => ({
                        uuid: 'request-dashboard-uuid',
                        name: 'Request dashboard',
                        organizationUuid: projectSummary.organizationUuid,
                        projectUuid,
                        spaceUuid: 'other-space-uuid',
                    })),
                } as unknown as DashboardModel,
            });

            const result = await (
                service as unknown as JwtDashboardQueryContextTestService
            ).getJwtDashboardQueryContext(
                buildEmbedWriteAccount(),
                projectUuid,
                'request-dashboard-uuid',
            );

            expect(result.dashboardUuid).toBe('embedded-dashboard-uuid');
        });
    });

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
            serviceWithCache.cacheService = {
                isResultsCacheEnabled: vi.fn(async () => true),
                findCachedResultsFile: vi.fn(async () => null),
            } as unknown as ICacheService;

            vi.clearAllMocks();

            // Mock the resultsCacheModel.createOrGetExistingCache method
            serviceWithCache.findResultsCache = vi.fn().mockImplementation(
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
            };

            (
                serviceWithCache.findResultsCache as import('vitest').Mock
            ).mockResolvedValueOnce(mockCacheResult);

            (
                serviceWithCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Spy on methods to verify they are NOT called
            const runAsyncWarehouseQuerySpy = vi.spyOn(
                serviceWithCache,
                'runAsyncWarehouseQuery',
            );
            const warehouseClientExecuteAsyncQuerySpy = vi.spyOn(
                warehouseClientMock,
                'executeAsyncQuery',
            );

            // WHEN: executeAsyncQuery is called
            const result = await serviceWithCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock(),
                    warehouseCredentials: warehouseCredentialsMock,
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
                serviceWithCache.findResultsCache as import('vitest').Mock
            ).mockResolvedValueOnce(mockCacheResult);

            (
                serviceWithCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Spy on runAsyncWarehouseQuery to verify it IS called
            const runAsyncWarehouseQuerySpy = vi
                .spyOn(serviceWithCache, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);

            // WHEN: executeAsyncQuery is called
            const result = await serviceWithCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock(),
                    warehouseCredentials: warehouseCredentialsMock,
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

        test('marks playground queries for exclusion from the usage event stream', async () => {
            projectModel.getSummary.mockResolvedValueOnce({
                ...projectSummary,
                provisioningSource: 'playground',
            });
            (
                serviceWithCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({ queryUuid: 'test-query-uuid' });
            const runAsyncWarehouseQuerySpy = vi
                .spyOn(serviceWithCache, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);

            await serviceWithCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock(),
                    warehouseCredentials: warehouseCredentialsMock,
                },
                { query: metricQueryMock },
            );

            expect(runAsyncWarehouseQuerySpy).toHaveBeenCalledWith(
                expect.objectContaining({ isPreviewProject: true }),
            );
        });

        // Regression: persisted metric_query.timezone must follow the gated
        // displayTimezone, not the ungated resolvedTimezone — otherwise
        // downstream readers (formatTimestamp, downloads, worker re-exec)
        // apply a +TZ shift on flag-off orgs that have a project timezone.
        test('persists displayTimezone=null when flag is off, even if a resolved timezone exists', async () => {
            (
                serviceWithCache.findResultsCache as import('vitest').Mock
            ).mockResolvedValueOnce({
                cacheHit: false,
                updatedAt: undefined,
                expiresAt: undefined,
            } satisfies MissCacheResult);

            (
                serviceWithCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({ queryUuid: 'test-query-uuid' });

            vi.spyOn(
                serviceWithCache,
                'runAsyncWarehouseQuery',
            ).mockResolvedValue(undefined);

            await serviceWithCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    // Resolved tz is set (project has query_timezone) but
                    // the gating flag is off — SQL was built without a
                    // timezone-aware DATE_TRUNC, so the persisted snapshot
                    // must not carry the resolved value either.
                    queryComposer: createQueryComposerMock({
                        timezone: 'Asia/Tokyo',
                        displayTimezone: null,
                        useTimezoneAwareDateTrunc: false,
                    }),
                    warehouseCredentials: warehouseCredentialsMock,
                },
                { query: metricQueryMock },
            );

            expect(
                serviceWithCache.queryHistoryModel.create,
            ).toHaveBeenCalledWith(
                sessionAccount,
                expect.objectContaining({
                    metricQuery: expect.objectContaining({
                        timezone: undefined,
                    }),
                }),
            );
        });

        test('persists displayTimezone when flag is on', async () => {
            (
                serviceWithCache.findResultsCache as import('vitest').Mock
            ).mockResolvedValueOnce({
                cacheHit: false,
                updatedAt: undefined,
                expiresAt: undefined,
            } satisfies MissCacheResult);

            (
                serviceWithCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({ queryUuid: 'test-query-uuid' });

            vi.spyOn(
                serviceWithCache,
                'runAsyncWarehouseQuery',
            ).mockResolvedValue(undefined);

            await serviceWithCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock({
                        timezone: 'Asia/Tokyo',
                        displayTimezone: 'Asia/Tokyo',
                        useTimezoneAwareDateTrunc: true,
                    }),
                    warehouseCredentials: warehouseCredentialsMock,
                },
                { query: metricQueryMock },
            );

            expect(
                serviceWithCache.queryHistoryModel.create,
            ).toHaveBeenCalledWith(
                sessionAccount,
                expect.objectContaining({
                    metricQuery: expect.objectContaining({
                        timezone: 'Asia/Tokyo',
                    }),
                }),
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
                serviceWithCache.findResultsCache as import('vitest').Mock
            ).mockResolvedValueOnce(mockCacheResult);

            (
                serviceWithCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Spy on runAsyncWarehouseQuery to verify it IS called
            const runAsyncWarehouseQuerySpy = vi
                .spyOn(serviceWithCache, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);

            // WHEN: executeAsyncQuery is called with invalidateCache: true
            const result = await serviceWithCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: true,
                    queryComposer: createQueryComposerMock(),
                    warehouseCredentials: warehouseCredentialsMock,
                },
                { query: metricQueryMock },
            );

            // THEN: findResultsCache called with invalidate flag (last parameter: true)
            expect(serviceWithCache.findResultsCache).toHaveBeenCalledWith(
                projectUuid,
                expect.any(String),
                expect.any(Object), // account
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

        test('prefers requestParameters.invalidateCache over args.invalidateCache', async () => {
            const mockCacheResult: MissCacheResult = {
                cacheHit: false,
                updatedAt: undefined,
                expiresAt: undefined,
            };

            (
                serviceWithCache.findResultsCache as import('vitest').Mock
            ).mockResolvedValueOnce(mockCacheResult);

            (
                serviceWithCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            vi.spyOn(
                serviceWithCache,
                'runAsyncWarehouseQuery',
            ).mockResolvedValue(undefined);

            await serviceWithCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock(),
                    warehouseCredentials: warehouseCredentialsMock,
                },
                { query: metricQueryMock, invalidateCache: true },
            );

            expect(serviceWithCache.findResultsCache).toHaveBeenCalledWith(
                projectUuid,
                expect.any(String),
                expect.any(Object),
                true,
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
                isResultsCacheEnabled: vi.fn(async () => false),
                findCachedResultsFile: vi.fn(),
            } as unknown as ICacheService;

            (
                serviceWithoutCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Spy on cache and warehouse methods
            const findResultsCacheSpy = vi.spyOn(
                serviceWithoutCache,
                'findResultsCache',
            );
            const runAsyncWarehouseQuerySpy = vi
                .spyOn(serviceWithoutCache, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);

            // WHEN: executeAsyncQuery is called
            const result = await serviceWithoutCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock(),
                    warehouseCredentials: warehouseCredentialsMock,
                },
                { query: metricQueryMock },
            );

            // THEN: Cache service is called but always returns miss when disabled
            expect(findResultsCacheSpy).toHaveBeenCalledWith(
                projectUuid,
                expect.any(String), // cache key
                expect.any(Object), // account
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
                serviceWithCache.findResultsCache as import('vitest').Mock
            ).mockResolvedValueOnce(mockCacheResult);

            (
                serviceWithCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            // Spy on runAsyncWarehouseQuery to verify it is NOT called
            const runAsyncWarehouseQuerySpy = vi.spyOn(
                serviceWithCache,
                'runAsyncWarehouseQuery',
            );

            // WHEN: executeAsyncQuery is called with missing parameter references
            const result = await serviceWithCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock({
                        sql: 'SELECT * FROM test WHERE param = {{ missing_param }}',
                        missingParameterReferences: [
                            'missing_param',
                            'another_missing_param',
                        ],
                    }),
                    warehouseCredentials: warehouseCredentialsMock,
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
                serviceWithCache.queryHistoryModel.updateStatusToError,
            ).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                'Missing parameters: missing_param, another_missing_param',
                sessionAccount,
            );

            // THEN: runAsyncWarehouseQuery is NOT called (error prevents execution)
            expect(runAsyncWarehouseQuerySpy).not.toHaveBeenCalled();
        });

        test('does not resolve pre-aggregates when strategy returns not resolved', async () => {
            const mockStrategy = makeMockStrategy({
                resolved: false,
                reason: 'not_available',
                isFatal: false,
            });
            const service = getMockedAsyncQueryService({
                ...lightdashConfigMock,
                preAggregates: {
                    enabled: false,
                    parquetEnabled: false,
                    materializationMaxRows: null,
                    duckdbQueryMemoryLimit: null,
                },
            });
            (service as AnyType).preAggregateStrategy = mockStrategy;

            const runAsyncWarehouseQuerySpy = vi
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);
            const runAsyncPreAggregateQuerySpy = vi
                .spyOn(service, 'runAsyncPreAggregateQuery')
                .mockResolvedValue(undefined);

            await service['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock({
                        userAccessControls: {
                            userAttributes: {},
                            intrinsicUserAttributes: {},
                        },
                        availableParameterDefinitions: {},
                    }),
                    preAggregationRoute: {
                        sourceExploreName: metricQueryMock.exploreName,
                        preAggregateName: 'orders_daily',
                        mode: 'opportunistic',
                    },
                    warehouseCredentials: warehouseCredentialsMock,
                },
                { query: metricQueryMock },
            );

            // Strategy's resolveExecution is called but returns not-resolved,
            // so execution falls back to warehouse
            expect(runAsyncWarehouseQuerySpy).toHaveBeenCalledTimes(1);
            expect(runAsyncPreAggregateQuerySpy).not.toHaveBeenCalled();
        });

        test('required pre-aggregate routes error when resolution fails and NATS is enabled', async () => {
            const mockStrategy = makeMockStrategy({
                resolved: false,
                reason: 'No active materialization found for pre-aggregate explore "__preagg__valid_explore__rollup"',
                isFatal: true,
            });
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
            (service as AnyType).preAggregateStrategy = mockStrategy;

            (
                service.queryHistoryModel.create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            const runAsyncWarehouseSpy = vi.spyOn(
                service,
                'runAsyncWarehouseQuery',
            );
            const runAsyncPreAggSpy = vi.spyOn(
                service,
                'runAsyncPreAggregateQuery',
            );

            await service['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock({
                        explore: preAggregateExplore,
                        metricQuery: {
                            ...metricQueryMock,
                            exploreName: preAggregateExplore.name,
                        },
                        userAccessControls: {
                            userAttributes: {},
                            intrinsicUserAttributes: {},
                        },
                        availableParameterDefinitions: {},
                    }),
                    preAggregationRoute: {
                        ...preAggregateExplore.preAggregateSource!,
                        mode: 'required',
                    },
                    warehouseCredentials: warehouseCredentialsMock,
                },
                {
                    query: {
                        ...metricQueryMock,
                        exploreName: preAggregateExplore.name,
                    },
                },
            );

            expect(mockStrategy.resolveExecution).toHaveBeenCalledTimes(1);
            expect(runAsyncWarehouseSpy).not.toHaveBeenCalled();
            expect(runAsyncPreAggSpy).not.toHaveBeenCalled();
            expect(
                service.queryHistoryModel.updateStatusToError,
            ).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                'No active materialization found for pre-aggregate explore "__preagg__valid_explore__rollup"',
                sessionAccount,
            );
        });

        test('resolved pre-aggregate routes enqueue a pre-aggregate job', async () => {
            const mockStrategy = makeMockStrategy({
                resolved: true,
                query: 'SELECT * FROM duckdb_preagg',
                execution: 'duckdb',
            });
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
            (service as AnyType).preAggregateStrategy = mockStrategy;

            (
                service.queryHistoryModel.create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            const runAsyncWarehouseSpy = vi
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);
            const enqueuePreAggregateSpy = vi.spyOn(
                service.natsClient,
                'enqueuePreAggregateQuery',
            );

            await service['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock({
                        sql: 'SELECT * FROM warehouse',
                        explore: preAggregateExplore,
                        metricQuery: {
                            ...metricQueryMock,
                            exploreName: preAggregateExplore.name,
                        },
                        userAccessControls: {
                            userAttributes: {},
                            intrinsicUserAttributes: {},
                        },
                        availableParameterDefinitions: {},
                    }),
                    preAggregationRoute: {
                        ...preAggregateExplore.preAggregateSource!,
                        mode: 'required',
                    },
                    warehouseCredentials: warehouseCredentialsMock,
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
                queryTags: {
                    query_context: QueryExecutionContext.EXPLORE,
                },
            });
            expect(service.queryHistoryModel.update).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                {
                    pre_aggregate_compiled_sql: 'SELECT * FROM duckdb_preagg',
                    pre_aggregate_execution: 'duckdb',
                },
                sessionAccount,
            );
            expect(runAsyncWarehouseSpy).not.toHaveBeenCalled();
        });

        test('opportunistic pre-aggregate routes enqueue a warehouse job when DuckDB cannot resolve', async () => {
            const mockStrategy = makeMockStrategy({
                resolved: false,
                reason: 'no_active_materialization',
                isFatal: false,
            });
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
            (service as AnyType).preAggregateStrategy = mockStrategy;

            (
                service.queryHistoryModel.create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            const runAsyncSpy = vi
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);
            const enqueueWarehouseSpy = vi.spyOn(
                service.natsClient,
                'enqueueWarehouseQuery',
            );

            await service['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.EXPLORE,
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock({
                        sql: 'SELECT * FROM warehouse',
                        userAccessControls: {
                            userAttributes: {},
                            intrinsicUserAttributes: {},
                        },
                        availableParameterDefinitions: {},
                    }),
                    preAggregationRoute: {
                        sourceExploreName: metricQueryMock.exploreName,
                        preAggregateName: 'orders_daily',
                        mode: 'opportunistic',
                    },
                    warehouseCredentials: warehouseCredentialsMock,
                },
                { query: metricQueryMock },
            );

            expect(mockStrategy.resolveExecution).toHaveBeenCalledTimes(1);
            expect(enqueueWarehouseSpy).toHaveBeenCalledTimes(1);
            expect(enqueueWarehouseSpy).toHaveBeenCalledWith({
                queryUuid: 'test-query-uuid',
                queryTags: {
                    query_context: QueryExecutionContext.EXPLORE,
                },
            });
            expect(runAsyncSpy).not.toHaveBeenCalled();
        });
    });

    describe('executeMetricQueryAndGetResults', () => {
        it('preserves the query UUID with the ready results', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            service.executeAsyncMetricQuery = vi.fn().mockResolvedValue({
                queryUuid: '11111111-1111-4111-8111-111111111111',
                cacheMetadata: { cacheHit: false },
                fields: {},
            });
            service.pollForQueryCompletion = vi.fn().mockResolvedValue({
                status: QueryHistoryStatus.READY,
            } as QueryHistory);
            const getReadyQueryResults = vi.fn().mockResolvedValue({
                rows: [{ a_dim1: 'one', a_met1: 1 }],
                cacheMetadata: { cacheHit: false },
                fields: {},
                pivotDetails: null,
                displayTimezone: null,
            });
            (service as AnyType).getReadyQueryResults = getReadyQueryResults;

            const result = await service.executeMetricQueryAndGetResults({
                account: sessionAccount,
                projectUuid,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.AI,
            });

            expect(result.queryUuid).toBe(
                '11111111-1111-4111-8111-111111111111',
            );
            expect(getReadyQueryResults).toHaveBeenCalledWith(
                expect.objectContaining({
                    queryUuid: '11111111-1111-4111-8111-111111111111',
                }),
            );
        });

        it('extends result availability without shortening longer retention', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const { queryHistoryModel } = service as AnyType;
            const expiresAt = new Date('2026-09-01T00:00:00.000Z');
            queryHistoryModel.get = vi.fn().mockResolvedValue({
                resultsFileName: 'results.jsonl',
                resultsExpiresAt: new Date('2026-08-01T00:00:00.000Z'),
            });
            queryHistoryModel.update = vi.fn().mockResolvedValue(1);

            await service.extendQueryResultsExpiration({
                account: sessionAccount,
                projectUuid,
                queryUuid: '11111111-1111-4111-8111-111111111111',
                expiresAt,
            });

            expect(queryHistoryModel.update).toHaveBeenCalledWith(
                '11111111-1111-4111-8111-111111111111',
                projectUuid,
                { results_expires_at: expiresAt },
                sessionAccount,
            );

            queryHistoryModel.get.mockResolvedValue({
                resultsFileName: 'results.jsonl',
                resultsExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
            });
            queryHistoryModel.update.mockClear();

            await service.extendQueryResultsExpiration({
                account: sessionAccount,
                projectUuid,
                queryUuid: '11111111-1111-4111-8111-111111111111',
                expiresAt,
            });

            expect(queryHistoryModel.update).not.toHaveBeenCalled();
        });
    });

    describe('executeAsyncMetricQuery', () => {
        test('forwards trusted provenance inputs to custom SQL authorization', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const assertCustomSqlAuthorizedForQuery = vi
                .spyOn(service as AnyType, 'assertCustomSqlAuthorizedForQuery')
                .mockResolvedValue(undefined);
            (service as AnyType).runAsyncMetricQueryWithoutPermissionCheck = vi
                .fn()
                .mockResolvedValue({ queryUuid: 'query-uuid' });

            await service.executeAsyncMetricQuery({
                account: sessionAccount,
                projectUuid,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE,
                dataAppPreviewToken: 'signed-preview-token',
                customSqlProvenanceChartUuid: 'chart-uuid',
            });

            expect(assertCustomSqlAuthorizedForQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    dataAppPreviewToken: 'signed-preview-token',
                    customSqlProvenanceChartUuid: 'chart-uuid',
                }),
            );
        });

        test('tags warehouse queries with the originating data app from the request context', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            service.getExploreWithUserAccessControls = vi
                .fn()
                .mockResolvedValue({
                    explore: validExplore,
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                });
            (service as AnyType).getWarehouseCredentials = vi
                .fn()
                .mockResolvedValue(warehouseClientMock.credentials);
            service.combineParameters = vi.fn().mockResolvedValue(undefined);
            (service as AnyType).prepareMetricQueryAsyncQueryArgs = vi
                .fn()
                .mockResolvedValue(
                    createQueryComposerMock({
                        userAccessControls: {
                            userAttributes: {},
                            intrinsicUserAttributes: {},
                        },
                        availableParameterDefinitions: {},
                    }),
                );
            service['executeAsyncQuery'] = vi.fn().mockResolvedValue({
                queryUuid: 'queryUuid',
                cacheMetadata: {
                    cacheHit: false,
                },
            });

            // app_uuid rides in on the request-scoped ExecutionContext (stamped
            // by requestExecutionContextMiddleware from the app header), not a
            // query arg — so exercise the real context the same way.
            await ExecutionContext.run(
                () =>
                    service.executeAsyncMetricQuery({
                        account: sessionAccount,
                        projectUuid,
                        metricQuery: metricQueryMock,
                        context: QueryExecutionContext.EXPLORE,
                        invalidateCache: false,
                        dateZoom: undefined,
                        parameters: undefined,
                        pivotConfiguration: undefined,
                    }),
                { app_uuid: 'app-uuid' },
            );

            expect(service['executeAsyncQuery']).toHaveBeenCalledWith(
                expect.objectContaining({
                    queryTags: expect.objectContaining({
                        app_uuid: 'app-uuid',
                    }),
                }),
                expect.any(Object),
            );
        });

        test('attaches required pre-aggregate routing metadata for direct pre-aggregate explores', async () => {
            const mockStrategy: PreAggregateStrategy = {
                ...makeMockStrategy({
                    resolved: true,
                    query: 'SELECT * FROM duckdb_preagg',
                    execution: 'duckdb',
                }),
                getRoutingDecision: ({ explore }) => {
                    if (
                        explore.type === ExploreType.PRE_AGGREGATE &&
                        explore.preAggregateSource
                    ) {
                        return {
                            target: 'pre_aggregate',
                            preAggregateMetadata: {
                                hit: true,
                                name: explore.preAggregateSource
                                    .preAggregateName,
                            },
                            route: {
                                ...explore.preAggregateSource,
                                mode: 'required',
                            },
                        };
                    }
                    return { target: 'warehouse' };
                },
            };
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
            (service as AnyType).preAggregateStrategy = mockStrategy;
            service.getExploreWithUserAccessControls = vi
                .fn()
                .mockResolvedValue({
                    explore: preAggregateExplore,
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                });
            (service as AnyType).getWarehouseCredentials = vi
                .fn()
                .mockResolvedValue(warehouseClientMock.credentials);
            service.combineParameters = vi.fn().mockResolvedValue(undefined);
            (service as AnyType).prepareMetricQueryAsyncQueryArgs = vi
                .fn()
                .mockResolvedValue(
                    createQueryComposerMock({
                        sql: 'SELECT * FROM duckdb_preagg',
                        explore: preAggregateExplore,
                        metricQuery: {
                            ...metricQueryMock,
                            exploreName: preAggregateExplore.name,
                        },
                        userAccessControls: {
                            userAttributes: {},
                            intrinsicUserAttributes: {},
                        },
                        availableParameterDefinitions: {},
                    }),
                );
            service['executeAsyncQuery'] = vi.fn().mockResolvedValue({
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

            expect(service['executeAsyncQuery']).toHaveBeenCalledWith(
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
            serviceWithCache.cacheService = {
                isResultsCacheEnabled: vi.fn(async () => true),
                findCachedResultsFile: vi.fn(async () => null),
            } as unknown as ICacheService;

            vi.clearAllMocks();
        });

        const buildEmbedAiAccount = (embedWriteUserUuid: string) =>
            ({
                ...buildAccount({
                    accountType: 'jwt',
                    userType: 'anonymous',
                }),
                user: {
                    ...buildAccount({
                        accountType: 'jwt',
                        userType: 'anonymous',
                    }).user,
                    ability: new Ability<PossibleAbilities>([]),
                },
                embedWriteContext: {
                    canCreateSavedChart: true,
                    canUseAiAgent: true,
                },
                embedWriteUser: {
                    ...sessionAccount.user,
                    userUuid: embedWriteUserUuid,
                },
            }) as unknown as Account;

        const buildPendingAiQueryHistory = (
            createdByUserUuid: string,
        ): QueryHistory => ({
            createdAt: new Date(),
            organizationUuid: sessionAccount.organization.organizationUuid!,
            createdByUserUuid,
            createdBy: createdByUserUuid,
            createdByAccount: null,
            createdByActorType: 'session',
            queryUuid: 'test-query-uuid',
            projectUuid,
            status: QueryHistoryStatus.PENDING,
            error: null,
            erroredAt: null,
            metricQuery: metricQueryMock,
            context: QueryExecutionContext.AI,
            fields: validExplore.tables.a.dimensions,
            compiledSql: 'SELECT * FROM test.table',
            warehouseQueryId: 'test-warehouse-query-id',
            warehouseQueryMetadata: null,
            requestParameters: {} as ExecuteAsyncQueryRequestParams,
            usedParameters: null,
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
            preAggregateCompiledSql: null,
            preAggregateExecution: null,
            preAggregateFallbackReason: null,
            processingStartedAt: null,
        });

        test('allows embedded AI agent JWTs to poll AI queries created by the embed write user', async () => {
            const embedWriteUserUuid = 'embed-write-user-uuid';
            const embedAiAccount = buildEmbedAiAccount(embedWriteUserUuid);

            serviceWithCache.queryHistoryModel.get = vi
                .fn()
                .mockResolvedValue(
                    buildPendingAiQueryHistory(embedWriteUserUuid),
                );

            await expect(
                serviceWithCache.getAsyncQueryResults({
                    account: embedAiAccount,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                    page: 1,
                    pageSize: 10,
                }),
            ).resolves.toEqual({
                status: QueryHistoryStatus.PENDING,
                queryUuid: 'test-query-uuid',
            });
        });

        test('rejects embedded AI agent JWTs polling AI queries from another user', async () => {
            const embedAiAccount = buildEmbedAiAccount('embed-write-user-uuid');

            serviceWithCache.queryHistoryModel.get = vi
                .fn()
                .mockResolvedValue(
                    buildPendingAiQueryHistory('other-user-uuid'),
                );

            await expect(
                serviceWithCache.getAsyncQueryResults({
                    account: embedAiAccount,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                    page: 1,
                    pageSize: 10,
                }),
            ).rejects.toThrow(ForbiddenError);
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
                erroredAt: null,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE,
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                usedParameters: null,
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
                preAggregateCompiledSql: null,
                preAggregateExecution: null,
                preAggregateFallbackReason: null,
                processingStartedAt: null,
            });

            serviceWithCache.getExplore = vi
                .fn()
                .mockResolvedValue(validExplore);
            serviceWithCache.queryHistoryModel.findMostRecentByCacheKey = vi
                .fn()
                .mockResolvedValue(null);

            // GIVEN: Different query history statuses
            // WHEN: getAsyncQueryResults is called
            // THEN: ERROR status: Returns error message and ERROR status
            const errorQuery = createMockQueryHistory(
                QueryHistoryStatus.ERROR,
                'Test error message',
            );
            errorQuery.erroredAt = new Date('2026-03-30T09:00:00.000Z');
            serviceWithCache.queryHistoryModel.get = vi
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
                erroredAt: new Date('2026-03-30T09:00:00.000Z'),
                status: QueryHistoryStatus.ERROR,
                queryUuid: 'test-query-uuid',
            });

            const expiredQuery = createMockQueryHistory(
                QueryHistoryStatus.EXPIRED,
                'Query expired in queue',
            );
            serviceWithCache.queryHistoryModel.get = vi
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
                erroredAt: null,
                status: QueryHistoryStatus.EXPIRED,
                queryUuid: 'test-query-uuid',
            });

            // THEN: PENDING status: Returns PENDING status only
            const pendingQuery = createMockQueryHistory(
                QueryHistoryStatus.PENDING,
            );
            serviceWithCache.queryHistoryModel.get = vi
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
            serviceWithCache.queryHistoryModel.get = vi
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
            serviceWithCache.queryHistoryModel.get = vi
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
            serviceWithCache.queryHistoryModel.get = vi
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
            serviceWithCache.queryHistoryModel.get = vi
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
                erroredAt: null,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE,
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                usedParameters: null,
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
                preAggregateCompiledSql: null,
                preAggregateExecution: null,
                preAggregateFallbackReason: null,
                processingStartedAt: null,
            };

            serviceWithCache.queryHistoryModel.get = vi
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.getResultsPageFromS3 = vi.fn().mockResolvedValue({
                rows: [expectedFormattedRow],
            });
            serviceWithCache.getExplore = vi
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

            // THEN: Returns READY status with complete result structure and
            // the persisted display timezone (null when the metric query was
            // built without one)
            expect(result).toMatchObject({
                status: QueryHistoryStatus.READY,
                queryUuid: 'test-query-uuid',
                rows: expect.any(Array),
                resolvedTimezone: metricQueryMock.timezone ?? null,
            });

            // THEN: Includes execution metadata
            expect(result).toEqual(
                expect.objectContaining({
                    totalResults: 10,
                    metadata: expect.objectContaining({
                        performance: expect.objectContaining({
                            initialQueryExecutionMs: 1500,
                        }),
                    }),
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

        test('serves DuckDB compose query columns from the persisted row without adding metadata', async () => {
            // A DuckDB compose query runs arbitrary SQL, so its columns carry
            // only the reference, the probed type, and a label derived from
            // the reference. No label, format, or provenance is inferred from
            // the queries it references, and the results page serves the
            // persisted columns unchanged.
            const composeColumns = {
                revenue: {
                    reference: 'revenue',
                    type: DimensionType.NUMBER,
                    label: 'Revenue',
                },
                order_month: {
                    reference: 'order_month',
                    type: DimensionType.TIMESTAMP,
                    label: 'Order month',
                },
            };
            const composeQueryHistory: QueryHistory = {
                createdAt: new Date(),
                organizationUuid: sessionAccount.organization.organizationUuid!,
                createdByUserUuid: sessionAccount.user.id,
                createdBy: sessionAccount.user.id,
                createdByAccount: null,
                createdByActorType: 'session',
                queryUuid: 'compose-query-uuid',
                projectUuid,
                status: QueryHistoryStatus.READY,
                error: null,
                erroredAt: null,
                // Compose rows persist the placeholder SqlQueryComposer
                // metric query and an empty fields map
                metricQuery: { ...metricQueryMock, timezone: undefined },
                context: QueryExecutionContext.API,
                fields: {},
                compiledSql:
                    'SELECT sum(orders_total_revenue) AS revenue, order_month FROM orders GROUP BY 2',
                warehouseQueryId: null,
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                usedParameters: null,
                totalRowCount: 2,
                warehouseExecutionTimeMs: 5,
                defaultPageSize: 10,
                cacheKey: 'compose-cache-key',
                pivotConfiguration: null,
                pivotTotalColumnCount: null,
                pivotValuesColumns: null,
                resultsFileName: 'compose-results.jsonl',
                resultsCreatedAt: new Date(),
                resultsUpdatedAt: new Date(),
                resultsExpiresAt: new Date(Date.now() + 60_000),
                columns: composeColumns,
                originalColumns: composeColumns,
                preAggregateCompiledSql: null,
                preAggregateExecution: null,
                preAggregateFallbackReason: null,
                processingStartedAt: null,
            };

            serviceWithCache.queryHistoryModel.get = vi
                .fn()
                .mockResolvedValue(composeQueryHistory);
            serviceWithCache.getResultsPageFromS3 = vi
                .fn()
                .mockResolvedValue({ rows: [] });

            const result = await serviceWithCache.getAsyncQueryResults({
                account: sessionAccount,
                projectUuid,
                queryUuid: 'compose-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(result).toMatchObject({
                status: QueryHistoryStatus.READY,
                columns: composeColumns,
                resolvedTimezone: null,
            });
            // No metadata is added at read time either.
            if (result.status === QueryHistoryStatus.READY) {
                Object.values(result.columns).forEach((column) => {
                    expect(column).not.toHaveProperty('format');
                    expect(column).not.toHaveProperty('provenance');
                });
            }
        });

        test('returns SQL Runner value columns in configured y-axis order after JSONB persistence', async () => {
            const valuesColumns = [
                {
                    reference: 'b_actual_new',
                    aggregation: VizAggregationOptions.COUNT,
                },
                {
                    reference: 'c_actual',
                    aggregation: VizAggregationOptions.COUNT,
                },
                {
                    reference: 'a_forecast',
                    aggregation: VizAggregationOptions.COUNT,
                },
            ];
            const makePivotValueColumn = (referenceField: string) => ({
                referenceField,
                pivotColumnName: `${referenceField}_count`,
                aggregation: VizAggregationOptions.COUNT,
                pivotValues: [],
            });
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
                erroredAt: null,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.SQL_RUNNER,
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                usedParameters: null,
                totalRowCount: 1,
                warehouseExecutionTimeMs: 1,
                defaultPageSize: 10,
                cacheKey: 'test-cache-key',
                pivotConfiguration: {
                    indexColumn: {
                        reference: 'x',
                        type: VizIndexType.CATEGORY,
                    },
                    valuesColumns,
                    groupByColumns: undefined,
                    sortBy: [],
                },
                pivotTotalColumnCount: 3,
                // PostgreSQL JSONB does not preserve insertion order. This is
                // the order returned for the ticket's c/a/b column names.
                pivotValuesColumns: {
                    c_actual_count: makePivotValueColumn('c_actual'),
                    a_forecast_count: makePivotValueColumn('a_forecast'),
                    b_actual_new_count: makePivotValueColumn('b_actual_new'),
                },
                resultsFileName: 'results-file-name.json',
                resultsCreatedAt: new Date(),
                resultsUpdatedAt: new Date(),
                resultsExpiresAt: new Date(Date.now() + 60_000),
                columns: expectedColumns,
                originalColumns: {},
                preAggregateCompiledSql: null,
                preAggregateExecution: null,
                preAggregateFallbackReason: null,
                processingStartedAt: null,
            };

            serviceWithCache.queryHistoryModel.get = vi
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.getResultsPageFromS3 = vi.fn().mockResolvedValue({
                rows: [expectedFormattedRow],
            });
            serviceWithCache.getExplore = vi
                .fn()
                .mockResolvedValue(validExplore);

            const result = await serviceWithCache.getAsyncQueryResults({
                account: sessionAccount,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(result).toMatchObject({
                pivotDetails: {
                    valuesColumns: valuesColumns.map(({ reference }) =>
                        makePivotValueColumn(reference),
                    ),
                },
            });
        });

        test('ready results expose pre-aggregate execution and fallback in metadata', async () => {
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
                erroredAt: null,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE,
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                usedParameters: null,
                totalRowCount: 1,
                warehouseExecutionTimeMs: 1,
                defaultPageSize: 10,
                cacheKey: 'test-cache-key',
                pivotConfiguration: null,
                pivotTotalColumnCount: null,
                pivotValuesColumns: null,
                resultsFileName: 'results-file-name.json',
                resultsCreatedAt: new Date(),
                resultsUpdatedAt: new Date(),
                resultsExpiresAt: new Date(Date.now() + 60_000),
                columns: expectedColumns,
                originalColumns: null,
                preAggregateCompiledSql: 'SELECT * FROM duckdb_preagg',
                preAggregateExecution: 'duckdb',
                preAggregateFallbackReason: 'duckdb_execution_error',
                processingStartedAt: null,
            };

            serviceWithCache.queryHistoryModel.get = vi
                .fn()
                .mockResolvedValue(mockQueryHistory);
            serviceWithCache.getResultsPageFromS3 = vi.fn().mockResolvedValue({
                rows: [expectedFormattedRow],
            });
            serviceWithCache.getExplore = vi
                .fn()
                .mockResolvedValue(validExplore);

            const result = await serviceWithCache.getAsyncQueryResults({
                account: sessionAccount,
                projectUuid,
                queryUuid: 'test-query-uuid',
                page: 1,
                pageSize: 10,
            });

            expect(result).toMatchObject({
                metadata: {
                    preAggregate: {
                        execution: 'duckdb',
                        fallbackReason: 'duckdb_execution_error',
                    },
                },
            });
        });
    });

    describe('runAsyncPreAggregateQuery', () => {
        const buildArgs = () => ({
            userUuid: sessionAccount.user.id,
            organizationUuid: sessionAccount.organization.organizationUuid!,
            isPreviewProject: false,
            isRegisteredUser: true,
            onboardingFlow: 'legacy' as const,
            projectUuid,
            queryUuid: 'test-query-uuid',
            queryTags: {
                query_context: QueryExecutionContext.EXPLORE,
                explore_name: 'orders',
                chart_uuid: 'chart-uuid',
                dashboard_uuid: 'dashboard-uuid',
            },
            fieldsMap: {},
            usedParameters: null,
            cacheKey: 'test-cache-key',
            pivotConfiguration: undefined,
            originalColumns: undefined,
            preAggregateQuery: 'SELECT * FROM duckdb_preagg',
            warehouseQuery: 'SELECT * FROM warehouse',
            preAggregateExecution: 'duckdb' as const,
            queryCreatedAt: new Date(),
            displayTimezone: null,
        });

        test('records fallback on query history and stats when execution fails', async () => {
            const mockStrategy = makeMockStrategy({
                resolved: true,
                query: 'SELECT * FROM duckdb_preagg',
                execution: 'duckdb',
            });
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            (service as AnyType).preAggregateStrategy = mockStrategy;

            const runAsyncWarehouseSpy = vi
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockRejectedValueOnce(new Error('HTTP 404: missing parquet'))
                .mockResolvedValueOnce(undefined);

            await service.runAsyncPreAggregateQuery(buildArgs());

            expect(service.queryHistoryModel.update).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                { pre_aggregate_fallback_reason: 'duckdb_execution_error' },
                expect.objectContaining({
                    user: { id: sessionAccount.user.id },
                }),
            );
            expect(mockStrategy.recordExecutionFallback).toHaveBeenCalledWith({
                projectUuid,
                exploreName: 'orders',
                chartUuid: 'chart-uuid',
                dashboardUuid: 'dashboard-uuid',
                queryContext: QueryExecutionContext.EXPLORE,
            });
            expect(runAsyncWarehouseSpy).toHaveBeenCalledTimes(2);
            expect(runAsyncWarehouseSpy.mock.calls[1][0]).toMatchObject({
                query: 'SELECT * FROM warehouse',
            });
        });

        test('does not record fallback when execution succeeds', async () => {
            const mockStrategy = makeMockStrategy({
                resolved: true,
                query: 'SELECT * FROM duckdb_preagg',
                execution: 'duckdb',
            });
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            (service as AnyType).preAggregateStrategy = mockStrategy;

            vi.spyOn(service, 'runAsyncWarehouseQuery').mockResolvedValue(
                undefined,
            );

            await service.runAsyncPreAggregateQuery(buildArgs());

            expect(service.queryHistoryModel.update).not.toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                expect.objectContaining({
                    pre_aggregate_fallback_reason: expect.anything(),
                }),
                expect.anything(),
            );
            expect(mockStrategy.recordExecutionFallback).not.toHaveBeenCalled();
        });

        test('errors instead of falling back when the project disables execution fallback', async () => {
            const mockStrategy = makeMockStrategy({
                resolved: true,
                query: 'SELECT * FROM duckdb_preagg',
                execution: 'duckdb',
            });
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            (service as AnyType).preAggregateStrategy = mockStrategy;
            projectModel.findProjectDefaults.mockResolvedValueOnce({
                pre_aggregate_execution_fallback: false,
            });

            const runAsyncWarehouseSpy = vi
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockRejectedValueOnce(new Error('HTTP 404: missing parquet'));

            await service.runAsyncPreAggregateQuery(buildArgs());

            expect(runAsyncWarehouseSpy).toHaveBeenCalledTimes(1);
            expect(
                service.queryHistoryModel.updateStatusToError,
            ).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                expect.stringContaining('execution fallback is disabled'),
                expect.objectContaining({
                    user: { id: sessionAccount.user.id },
                }),
            );
            expect(
                service.queryHistoryModel.updateStatusToError,
            ).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                expect.stringContaining('HTTP 404: missing parquet'),
                expect.anything(),
            );
            expect(mockStrategy.recordExecutionFallback).not.toHaveBeenCalled();
            expect(service.queryHistoryModel.update).not.toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                expect.objectContaining({
                    pre_aggregate_fallback_reason: expect.anything(),
                }),
                expect.anything(),
            );
        });

        test('still falls back when reading project defaults fails', async () => {
            const mockStrategy = makeMockStrategy({
                resolved: true,
                query: 'SELECT * FROM duckdb_preagg',
                execution: 'duckdb',
            });
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            (service as AnyType).preAggregateStrategy = mockStrategy;
            projectModel.findProjectDefaults.mockRejectedValueOnce(
                new Error('db unavailable'),
            );

            const runAsyncWarehouseSpy = vi
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockRejectedValueOnce(new Error('HTTP 404: missing parquet'))
                .mockResolvedValueOnce(undefined);

            await service.runAsyncPreAggregateQuery(buildArgs());

            expect(runAsyncWarehouseSpy).toHaveBeenCalledTimes(2);
            expect(runAsyncWarehouseSpy.mock.calls[1][0]).toMatchObject({
                query: 'SELECT * FROM warehouse',
            });
        });

        test('still falls back to the warehouse when the fallback write fails', async () => {
            const mockStrategy = makeMockStrategy({
                resolved: true,
                query: 'SELECT * FROM duckdb_preagg',
                execution: 'duckdb',
            });
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            (service as AnyType).preAggregateStrategy = mockStrategy;
            (
                service.queryHistoryModel.update as import('vitest').Mock
            ).mockRejectedValue(new Error('db unavailable'));

            const runAsyncWarehouseSpy = vi
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockRejectedValueOnce(new Error('HTTP 404: missing parquet'))
                .mockResolvedValueOnce(undefined);

            await service.runAsyncPreAggregateQuery(buildArgs());

            expect(runAsyncWarehouseSpy).toHaveBeenCalledTimes(2);
            expect(runAsyncWarehouseSpy.mock.calls[1][0]).toMatchObject({
                query: 'SELECT * FROM warehouse',
            });
        });
    });

    describe('download pivot routing', () => {
        // Typed view onto the private download methods exercised by these tests.
        type DownloadInternals = {
            downloadAsyncQueryResults: (
                args: DownloadAsyncQueryResultsArgs,
            ) => Promise<{ fileUrl: string; truncated: boolean }>;
            downloadAsyncQueryResultsAsFormattedFile: (
                ...args: unknown[]
            ) => Promise<{ fileUrl: string; truncated: boolean }>;
        };
        const asInternals = (service: AsyncQueryService) =>
            service as unknown as DownloadInternals;

        const pivotConfig = {
            pivotDimensions: ['order_date'],
            metricsAsRows: false,
            rowFieldIds: ['user_id', 'amount'],
        };

        const baseReadyQueryHistory = (
            overrides: Partial<QueryHistory>,
        ): QueryHistory =>
            ({
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
                erroredAt: null,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.EXPLORE,
                fields: validExplore.tables.a.dimensions,
                compiledSql: 'SELECT * FROM test.table',
                warehouseQueryId: 'test-warehouse-query-id',
                warehouseQueryMetadata: null,
                requestParameters: {} as ExecuteAsyncQueryRequestParams,
                usedParameters: null,
                totalRowCount: 10,
                warehouseExecutionTimeMs: 1500,
                defaultPageSize: 10,
                cacheKey: 'test-cache-key',
                pivotConfiguration: null,
                pivotTotalColumnCount: null,
                pivotValuesColumns: null,
                resultsFileName: 'results-file-name.json',
                resultsCreatedAt: new Date(),
                resultsUpdatedAt: new Date(),
                resultsExpiresAt: new Date(Date.now() + 60_000),
                columns: expectedColumns,
                originalColumns: {},
                preAggregateCompiledSql: null,
                preAggregateExecution: null,
                preAggregateFallbackReason: null,
                processingStartedAt: null,
                ...overrides,
            }) as QueryHistory;

        it('falls back to a flat CSV export when a pivotConfig is requested but the query stored no pivot details', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const internals = asInternals(service);
            service.queryHistoryModel.get = vi
                .fn()
                .mockResolvedValue(baseReadyQueryHistory({}));

            const pivotSpy = vi
                .spyOn(service.pivotTableService, 'downloadAsyncPivotTableCsv')
                .mockResolvedValue({
                    fileUrl: 'should-not-be-used',
                    truncated: false,
                });
            const flatSpy = vi
                .spyOn(internals, 'downloadAsyncQueryResultsAsFormattedFile')
                .mockResolvedValue({ fileUrl: 'flat-url', truncated: false });

            await expect(
                internals.downloadAsyncQueryResults({
                    account: sessionAccount,
                    accessMode:
                        PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                    type: DownloadFileType.CSV,
                    pivotConfig,
                    exportPivotedData: true,
                }),
            ).resolves.toMatchObject({ fileUrl: 'flat-url' });

            expect(pivotSpy).not.toHaveBeenCalled();
            expect(flatSpy).toHaveBeenCalledTimes(1);
        });

        it('uses the pivot CSV export when the query stored pivot details', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const internals = asInternals(service);
            service.queryHistoryModel.get = vi.fn().mockResolvedValue(
                baseReadyQueryHistory({
                    pivotConfiguration: {
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
                    },
                    pivotTotalColumnCount: 5,
                    pivotValuesColumns: {
                        amount_sum_2021: {
                            referenceField: 'amount',
                            pivotColumnName: 'amount_sum_2021',
                            aggregation: VizAggregationOptions.SUM,
                            pivotValues: [
                                { referenceField: 'order_date', value: '2021' },
                            ],
                        },
                    } as AnyType,
                }),
            );

            const pivotSpy = vi
                .spyOn(service.pivotTableService, 'downloadAsyncPivotTableCsv')
                .mockResolvedValue({ fileUrl: 'pivot-url', truncated: false });
            const flatSpy = vi
                .spyOn(internals, 'downloadAsyncQueryResultsAsFormattedFile')
                .mockResolvedValue({ fileUrl: 'flat-url', truncated: false });

            await expect(
                internals.downloadAsyncQueryResults({
                    account: sessionAccount,
                    accessMode:
                        PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                    type: DownloadFileType.CSV,
                    pivotConfig,
                    exportPivotedData: true,
                }),
            ).resolves.toMatchObject({ fileUrl: 'pivot-url' });

            expect(pivotSpy).toHaveBeenCalledTimes(1);
            expect(pivotSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    options: expect.objectContaining({
                        pivotConfig: expect.objectContaining({
                            rowFieldIds: ['user_id', 'amount'],
                        }),
                    }),
                }),
            );
            expect(flatSpy).not.toHaveBeenCalled();
        });

        it('pivots based on stored pivot details even when the request omits pivotConfig', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const internals = asInternals(service);
            service.queryHistoryModel.get = vi.fn().mockResolvedValue(
                baseReadyQueryHistory({
                    pivotConfiguration: {
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
                        metricsAsRows: false,
                    },
                    pivotTotalColumnCount: 5,
                    pivotValuesColumns: {
                        amount_sum_2021: {
                            referenceField: 'amount',
                            pivotColumnName: 'amount_sum_2021',
                            aggregation: VizAggregationOptions.SUM,
                            pivotValues: [
                                { referenceField: 'order_date', value: '2021' },
                            ],
                        },
                    } as AnyType,
                }),
            );

            const pivotSpy = vi
                .spyOn(service.pivotTableService, 'downloadAsyncPivotTableCsv')
                .mockResolvedValue({ fileUrl: 'pivot-url', truncated: false });
            const flatSpy = vi
                .spyOn(internals, 'downloadAsyncQueryResultsAsFormattedFile')
                .mockResolvedValue({ fileUrl: 'flat-url', truncated: false });

            await expect(
                internals.downloadAsyncQueryResults({
                    account: sessionAccount,
                    accessMode:
                        PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                    type: DownloadFileType.CSV,
                    exportPivotedData: true,
                }),
            ).resolves.toMatchObject({ fileUrl: 'pivot-url' });

            expect(pivotSpy).toHaveBeenCalledTimes(1);
            expect(pivotSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    options: expect.objectContaining({
                        pivotConfig: expect.objectContaining({
                            pivotDimensions: ['order_date'],
                            metricsAsRows: false,
                        }),
                    }),
                }),
            );
            expect(flatSpy).not.toHaveBeenCalled();
        });

        it('does not pivot when the user opts out via exportPivotedData=false', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const internals = asInternals(service);
            service.queryHistoryModel.get = vi.fn().mockResolvedValue(
                baseReadyQueryHistory({
                    pivotConfiguration: {
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
                        metricsAsRows: false,
                    },
                    pivotTotalColumnCount: 5,
                    pivotValuesColumns: {
                        amount_sum_2021: {
                            referenceField: 'amount',
                            pivotColumnName: 'amount_sum_2021',
                            aggregation: VizAggregationOptions.SUM,
                            pivotValues: [
                                { referenceField: 'order_date', value: '2021' },
                            ],
                        },
                    } as AnyType,
                }),
            );

            const pivotSpy = vi
                .spyOn(service.pivotTableService, 'downloadAsyncPivotTableCsv')
                .mockResolvedValue({
                    fileUrl: 'should-not-be-used',
                    truncated: false,
                });
            const flatSpy = vi
                .spyOn(internals, 'downloadAsyncQueryResultsAsFormattedFile')
                .mockResolvedValue({ fileUrl: 'flat-url', truncated: false });

            await expect(
                internals.downloadAsyncQueryResults({
                    account: sessionAccount,
                    accessMode:
                        PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                    type: DownloadFileType.CSV,
                    pivotConfig,
                    exportPivotedData: false,
                }),
            ).resolves.toMatchObject({ fileUrl: 'flat-url' });

            expect(pivotSpy).not.toHaveBeenCalled();
            expect(flatSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('getAsyncQueryHistory', () => {
        const createQueryHistory = (): QueryHistory =>
            ({
                queryUuid: 'test-query-uuid',
                projectUuid,
                organizationUuid: projectSummary.organizationUuid,
                metricQuery: metricQueryMock,
            }) as QueryHistory;

        it('allows caller-owned query history with explore-level access', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const account = buildAccount();
            account.user.ability = new Ability<PossibleAbilities>([
                { action: 'view', subject: 'Explore' },
            ]);
            const queryHistory = createQueryHistory();

            (
                service.queryHistoryModel.get as import('vitest').Mock
            ).mockResolvedValue(queryHistory);

            await expect(
                service.getAsyncQueryHistory({
                    account,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                }),
            ).resolves.toBe(queryHistory);
        });

        it('rejects caller-owned query history without project or explore access', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const account = buildAccount();
            account.user.ability = new Ability<PossibleAbilities>([]);

            (
                service.queryHistoryModel.get as import('vitest').Mock
            ).mockResolvedValue(createQueryHistory());

            await expect(
                service.getAsyncQueryHistory({
                    account,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                }),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('pollQueryHistoryUntilDeadline', () => {
        const createMockQueryHistory = (
            status: QueryHistoryStatus,
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
            error: null,
            erroredAt: null,
            metricQuery: metricQueryMock,
            context: QueryExecutionContext.MCP_RUN_SQL,
            fields: validExplore.tables.a.dimensions,
            compiledSql: 'SELECT * FROM test.table',
            warehouseQueryId: 'test-warehouse-query-id',
            warehouseQueryMetadata: null,
            requestParameters: {} as ExecuteAsyncQueryRequestParams,
            usedParameters: null,
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
            preAggregateCompiledSql: null,
            preAggregateExecution: null,
            preAggregateFallbackReason: null,
            processingStartedAt: null,
        });

        const getPollArgs = (
            overrides: Partial<{
                deadlineMs: number;
                pollIntervalMs: number;
                signal: AbortSignal;
            }> = {},
        ) => ({
            account: sessionAccount,
            projectUuid,
            queryUuid: 'test-query-uuid',
            deadlineMs: Date.now() + 100,
            pollIntervalMs: 1,
            ...overrides,
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns the ready query history when the query completes before the deadline', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const queuedQueryHistory = createMockQueryHistory(
                QueryHistoryStatus.QUEUED,
            );
            const readyQueryHistory = createMockQueryHistory(
                QueryHistoryStatus.READY,
            );
            const getAsyncQueryHistory = vi
                .spyOn(service, 'getAsyncQueryHistory')
                .mockResolvedValueOnce(queuedQueryHistory)
                .mockResolvedValueOnce(readyQueryHistory);

            await expect(
                service.pollQueryHistoryUntilDeadline(getPollArgs()),
            ).resolves.toBe(readyQueryHistory);

            expect(getAsyncQueryHistory).toHaveBeenCalledTimes(2);
        });

        it('returns the latest running query history when the deadline is reached', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const queuedQueryHistory = createMockQueryHistory(
                QueryHistoryStatus.QUEUED,
            );
            const getAsyncQueryHistory = vi
                .spyOn(service, 'getAsyncQueryHistory')
                .mockResolvedValueOnce(queuedQueryHistory);

            await expect(
                service.pollQueryHistoryUntilDeadline(
                    getPollArgs({ deadlineMs: Date.now() - 1 }),
                ),
            ).resolves.toBe(queuedQueryHistory);

            expect(getAsyncQueryHistory).toHaveBeenCalledTimes(1);
        });

        it.each([
            QueryHistoryStatus.CANCELLED,
            QueryHistoryStatus.ERROR,
            QueryHistoryStatus.EXPIRED,
        ])(
            'returns terminal %s query history without waiting',
            async (status) => {
                const service = getMockedAsyncQueryService(lightdashConfigMock);
                const terminalQueryHistory = createMockQueryHistory(status);
                const getAsyncQueryHistory = vi
                    .spyOn(service, 'getAsyncQueryHistory')
                    .mockResolvedValueOnce(terminalQueryHistory);

                await expect(
                    service.pollQueryHistoryUntilDeadline(getPollArgs()),
                ).resolves.toBe(terminalQueryHistory);

                expect(getAsyncQueryHistory).toHaveBeenCalledTimes(1);
            },
        );

        it('stops polling when the request is aborted', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const abortController = new AbortController();
            const queuedQueryHistory = createMockQueryHistory(
                QueryHistoryStatus.QUEUED,
            );
            const getAsyncQueryHistory = vi
                .spyOn(service, 'getAsyncQueryHistory')
                .mockResolvedValue(queuedQueryHistory);

            const pollPromise = service.pollQueryHistoryUntilDeadline(
                getPollArgs({
                    deadlineMs: Date.now() + 10_000,
                    pollIntervalMs: 10_000,
                    signal: abortController.signal,
                }),
            );
            abortController.abort();

            await expect(pollPromise).rejects.toThrow(
                'Query polling request was aborted',
            );
            expect(getAsyncQueryHistory).toHaveBeenCalledTimes(1);
        });
    });

    describe('getRawAsyncQueryResults', () => {
        it('rejects raw query results without project or explore access', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const account = buildAccount();
            account.user.ability = new Ability<PossibleAbilities>([]);

            (
                service.queryHistoryModel.get as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
                projectUuid,
                organizationUuid: projectSummary.organizationUuid,
                metricQuery: metricQueryMock,
            } as QueryHistory);

            await expect(
                service.getRawAsyncQueryResults({
                    account,
                    projectUuid,
                    queryUuid: 'test-query-uuid',
                }),
            ).rejects.toThrow(ForbiddenError);

            // Query history is caller-scoped and needed to evaluate explore
            // access; a forbidden caller must still not reach result storage.
            expect(
                service.resultsStorageClient.getDownloadStream,
            ).not.toHaveBeenCalled();
        });
    });

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
        erroredAt: null,
        metricQuery: metricQueryMock,
        context: QueryExecutionContext.EXPLORE,
        fields: validExplore.tables.a.dimensions,
        compiledSql: 'SELECT * FROM test.table',
        warehouseQueryId: 'test-warehouse-query-id',
        warehouseQueryMetadata: null,
        requestParameters: {} as ExecuteAsyncQueryRequestParams,
        usedParameters: null,
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
        preAggregateCompiledSql: null,
        preAggregateExecution: null,
        preAggregateFallbackReason: null,
        processingStartedAt: null,
    });

    describe('prepareQueuedQueryForExecution', () => {
        test('transitions queued queries to executing', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            (
                service.queryHistoryModel
                    .getByQueryUuid as import('vitest').Mock
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
                service.queryHistoryModel
                    .getByQueryUuid as import('vitest').Mock
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

    describe('runAsyncWarehouseQueryFromHistory', () => {
        test('rebuilds originalColumns from the query history row', async () => {
            const mockOriginalColumns: ResultColumns = {
                user_id: { reference: 'user_id', type: DimensionType.STRING },
                amount: { reference: 'amount', type: DimensionType.NUMBER },
            };
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            (
                service.queryHistoryModel
                    .getByQueryUuid as import('vitest').Mock
            ).mockResolvedValue({
                ...createMockQueryHistory(QueryHistoryStatus.QUEUED),
                originalColumns: mockOriginalColumns,
            });
            const runAsyncWarehouseQuerySpy = vi
                .spyOn(service, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);

            const ran = await service.runAsyncWarehouseQueryFromHistory(
                'test-query-uuid',
                'worker-1',
            );

            expect(ran).toBe(true);
            expect(runAsyncWarehouseQuerySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    originalColumns: mockOriginalColumns,
                }),
            );
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
            serviceWithCache.cacheService = {
                isResultsCacheEnabled: vi.fn(async () => true),
                findCachedResultsFile: vi.fn(async () => null),
            } as unknown as ICacheService;
            vi.clearAllMocks();

            serviceWithCache.findResultsCache = vi
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
                serviceWithCache.findResultsCache as import('vitest').Mock
            ).mockResolvedValueOnce(mockCacheResult);
            (
                serviceWithCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            const runAsyncWarehouseQuerySpy = vi
                .spyOn(serviceWithCache, 'runAsyncWarehouseQuery')
                .mockResolvedValue(undefined);

            await serviceWithCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.SQL_RUNNER,
                    queryTags: {
                        query_context: QueryExecutionContext.SQL_RUNNER,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock(),
                    originalColumns: mockOriginalColumns,
                    warehouseCredentials: warehouseCredentialsMock,
                },
                { query: metricQueryMock },
            );

            // Verify that original columns are passed to runAsyncWarehouseQuery
            expect(runAsyncWarehouseQuerySpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    originalColumns: mockOriginalColumns,
                }),
            );

            // Verify that original columns are persisted at creation time too,
            // so the NATS worker path (which rebuilds args from the history
            // row) doesn't lose them for pivoted charts.
            expect(
                serviceWithCache.queryHistoryModel.create,
            ).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    originalColumns: mockOriginalColumns,
                }),
            );
        });

        test('cache hit against a row with null originalColumns keeps the current originalColumns', async () => {
            const createdAt = new Date();
            const updatedAt = new Date();
            const expiresAt = new Date(
                createdAt.getTime() + 1000 * 60 * 60 * 24,
            );
            // Cached row predates persisting original columns at creation
            const mockCacheResult: CacheHitCacheResult = {
                cacheHit: true,
                cacheKey: 'test-cache-key',
                totalRowCount: 10,
                createdAt,
                updatedAt,
                expiresAt,
                fileName: 'file-name',
                columns: expectedColumns,
                originalColumns: null,
                pivotValuesColumns: null,
                pivotTotalColumnCount: null,
            };

            (
                serviceWithCache.findResultsCache as import('vitest').Mock
            ).mockResolvedValueOnce(mockCacheResult);
            (
                serviceWithCache.queryHistoryModel
                    .create as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
            });

            await serviceWithCache['executeAsyncQuery'](
                {
                    account: sessionAccount,
                    projectUuid,
                    context: QueryExecutionContext.SQL_RUNNER,
                    queryTags: {
                        query_context: QueryExecutionContext.SQL_RUNNER,
                    },
                    invalidateCache: false,
                    queryComposer: createQueryComposerMock(),
                    originalColumns: mockOriginalColumns,
                    warehouseCredentials: warehouseCredentialsMock,
                },
                { query: metricQueryMock },
            );

            expect(
                serviceWithCache.queryHistoryModel.update,
            ).toHaveBeenCalledWith(
                'test-query-uuid',
                projectUuid,
                expect.objectContaining({
                    status: QueryHistoryStatus.READY,
                    original_columns: mockOriginalColumns,
                }),
                sessionAccount,
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
                (
                    mockSshTunnel.connect as import('vitest').Mock
                ).mockReturnValueOnce(Promise.resolve(sshTunnelCredentials));
            });

            test('SSH Tunnel Integration - Complete Flow', async () => {
                // GIVEN: Credentials contain SSH tunnel configuration
                const mockProjectModel = {
                    ...projectModel,
                    getWarehouseCredentialsForProject: vi.fn(() =>
                        Promise.resolve(originalCredentials),
                    ),
                    getWarehouseClientFromCredentials: vi.fn(() => ({
                        ...warehouseClientMock,
                        credentials: sshTunnelCredentials,
                        runQuery: vi.fn(async () => resultsWith1Row),
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
                service.queryHistoryModel.update = vi.fn();

                const getWarehouseClientSpy = vi.spyOn(
                    service,
                    '_getWarehouseClient',
                );

                const runQueryAndTransformRowsSpy = vi.spyOn(
                    AsyncQueryService,
                    'runQueryAndTransformRows',
                );

                const runAsyncArgs: RunAsyncWarehouseQueryArgs = {
                    userUuid: sessionAccount.user.id,
                    organizationUuid:
                        sessionAccount.organization.organizationUuid!,
                    isPreviewProject: false,
                    isRegisteredUser: true,
                    onboardingFlow: 'legacy',
                    projectUuid,
                    query: 'SELECT * FROM test',
                    fieldsMap: {},
                    usedParameters: null,
                    queryTags: { query_context: QueryExecutionContext.EXPLORE },
                    warehouseCredentialsOverrides: undefined,
                    queryUuid: 'test-query-uuid',
                    cacheKey: 'test-cache-key',
                    pivotConfiguration: undefined,
                    originalColumns: undefined,
                    queryCreatedAt: new Date(),
                    displayTimezone: null,
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
                ).toHaveBeenCalledWith(sshTunnelCredentials, {
                    enableInstanceCache: false,
                    projectUuid: 'project uuid',
                    logger: expect.anything(),
                });

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
                getWarehouseCredentialsForProject: vi.fn(() =>
                    Promise.resolve(warehouseClientMock.credentials),
                ),
                getWarehouseClientFromCredentials: vi.fn(() => ({
                    ...warehouseClientMock,
                    runQuery: vi.fn(async () => resultsWith1Row),
                })),
            };

            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                projectModel: mockProjectModel as unknown as ProjectModel,
            });

            // Mock storage client methods
            const mockStorageClient =
                service.resultsStorageClient as unknown as {
                    createUploadStream: import('vitest').Mock;
                };
            mockStorageClient.createUploadStream = vi.fn(() => ({
                write: vi.fn(),
                close: vi.fn(),
            }));

            // Mock query history update
            service.queryHistoryModel.update = vi.fn();

            const runQueryAndTransformRowsSpy = vi.spyOn(
                AsyncQueryService,
                'runQueryAndTransformRows',
            );

            const runAsyncArgs: RunAsyncWarehouseQueryArgs = {
                userUuid: sessionAccount.user.id,
                organizationUuid: sessionAccount.organization.organizationUuid!,
                isPreviewProject: false,
                isRegisteredUser: true,
                onboardingFlow: 'legacy',
                projectUuid,
                query: 'SELECT * FROM test_table',
                fieldsMap: {},
                usedParameters: null,
                queryTags: { query_context: QueryExecutionContext.EXPLORE },
                warehouseCredentialsOverrides: undefined,
                queryUuid: 'test-query-uuid',
                cacheKey: 'test-cache-key',
                pivotConfiguration: undefined,
                originalColumns: undefined,
                queryCreatedAt: new Date(),
                displayTimezone: null,
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
    });

    describe('materializationRole', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('uses materializationRole instead of the triggering user context during materialization execution', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const materializationExplore = {
                ...validExplore,
                tables: {
                    ...validExplore.tables,
                    a: {
                        ...validExplore.tables.a,
                        sqlWhere:
                            "'EMEA' IN (${lightdash.attribute.allowed_regions}) AND ${lightdash.user.email} = 'materialize@acme.com'",
                        uncompiledSqlWhere:
                            "'EMEA' IN (${lightdash.attribute.allowed_regions}) AND ${lightdash.user.email} = 'materialize@acme.com'",
                    },
                },
            };

            service.getUserAttributes = vi.fn(async () => ({
                userAttributes: {
                    allowed_regions: ['viewer-region'],
                },
                intrinsicUserAttributes: {
                    email: 'viewer@example.com',
                },
            }));
            vi.spyOn(projectModel, 'getExploreFromCache').mockResolvedValue(
                materializationExplore,
            );
            service['executeAsyncQuery'] = vi.fn().mockResolvedValue({
                queryUuid: 'queryUuid',
                cacheMetadata: {
                    cacheHit: false,
                },
            });

            await service.executeAsyncMetricQuery({
                account: sessionAccount,
                projectUuid,
                metricQuery: metricQueryMock,
                context: QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
                materializationRole: {
                    userAttributes: {
                        allowed_regions: ['EMEA', 'APAC'],
                    },
                    intrinsicUserAttributes: {
                        email: 'materialize@acme.com',
                    },
                },
            });

            expect(service.getUserAttributes).not.toHaveBeenCalled();
            const executeArgs = (
                service['executeAsyncQuery'] as import('vitest').Mock
            ).mock.calls[0][0];
            const executedSql = executeArgs.queryComposer.getSql({
                columnLimit: lightdashConfigMock.pivotTable.maxColumnLimit,
            });
            expect(executedSql).toContain("'EMEA', 'APAC'");
            expect(executedSql).toContain('materialize@acme.com');
            expect(executedSql).not.toContain('viewer-region');
        });

        it('does not apply model required filters to materialization queries', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const materializationExplore: Explore = {
                ...validExplore,
                tables: {
                    ...validExplore.tables,
                    a: {
                        ...validExplore.tables.a,
                        requiredFilters: [
                            {
                                id: 'required-dimension',
                                target: { fieldRef: 'dim1' },
                                operator: FilterOperator.EQUALS,
                                values: ['restricted'],
                                required: true,
                            },
                        ],
                        dimensions: {
                            ...validExplore.tables.a.dimensions,
                            dim1: {
                                ...validExplore.tables.a.dimensions.dim1,
                                sql: '${TABLE}.dim1',
                                compiledSql: '"a".dim1',
                            },
                        },
                    },
                },
            };

            vi.spyOn(projectModel, 'getExploreFromCache').mockResolvedValue(
                materializationExplore,
            );
            const executeAsyncQuery = vi.fn().mockResolvedValue({
                queryUuid: 'queryUuid',
                cacheMetadata: {
                    cacheHit: false,
                },
            });
            service['executeAsyncQuery'] = executeAsyncQuery;

            await service.executeAsyncMetricQuery({
                account: sessionAccount,
                projectUuid,
                metricQuery: {
                    ...metricQueryMock,
                    tableCalculations: [],
                },
                context: QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
            });

            const [executeArgs] = executeAsyncQuery.mock.calls[0];
            const executedSql = executeArgs.queryComposer.getSql({
                columnLimit: lightdashConfigMock.pivotTable.maxColumnLimit,
            });
            expect(executedSql).not.toContain('restricted');
        });

        it('fails closed when materializationRole is supplied outside materialization context', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);

            await expect(
                service.executeAsyncMetricQuery({
                    account: sessionAccount,
                    projectUuid,
                    metricQuery: metricQueryMock,
                    context: QueryExecutionContext.EXPLORE,
                    materializationRole: {
                        userAttributes: {},
                        intrinsicUserAttributes: {
                            email: 'materialize@acme.com',
                        },
                    },
                }),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('executeAsyncSqlQuery', () => {
        it('throws ForbiddenError when the account lacks manage:SqlRunner', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);

            const viewerAccount = {
                ...sessionAccount,
                user: {
                    ...sessionAccount.user,
                    ability: new Ability<PossibleAbilities>([
                        { subject: 'Project', action: ['view'] },
                    ]),
                },
            } as unknown as Account;

            await expect(
                service.executeAsyncSqlQuery({
                    account: viewerAccount,
                    projectUuid,
                    sql: 'SELECT 1',
                    context: QueryExecutionContext.SQL_RUNNER,
                }),
            ).rejects.toThrow(ForbiddenError);
        });

        it('disconnects the SSH tunnel when column discovery fails', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const disconnect = vi.fn();
            const discoveryError = new Error('Column discovery failed');

            service.getUserAttributes = vi.fn(async () => ({
                userAttributes: {},
                intrinsicUserAttributes: { email: 'test@example.com' },
            }));
            service._getWarehouseClient = vi.fn(async () => ({
                warehouseClient: {
                    ...warehouseClientMock,
                    streamQuery: vi.fn().mockRejectedValue(discoveryError),
                },
                sshTunnel: {
                    disconnect,
                } as unknown as SshTunnel<CreateWarehouseCredentials>,
                tunnelConnectMs: null,
            }));

            await expect(
                service.executeAsyncSqlQuery({
                    account: sessionAccount,
                    projectUuid,
                    sql: 'SELECT 1',
                    context: QueryExecutionContext.SQL_RUNNER,
                }),
            ).rejects.toBe(discoveryError);
            expect(disconnect).toHaveBeenCalledOnce();
        });

        describe('cache invalidation', () => {
            it('skips cache when invalidateCache is true', async () => {
                const service = getMockedAsyncQueryService({
                    ...lightdashConfigMock,
                    results: {
                        ...lightdashConfigMock.results,
                        cacheEnabled: true,
                    },
                });

                service.warehouseClients = {};
                service.cacheService = {
                    isResultsCacheEnabled: vi.fn(async () => true),
                    findCachedResultsFile: vi.fn(async () => null),
                } as unknown as ICacheService;

                service.findResultsCache = vi.fn().mockResolvedValue({
                    cacheHit: false,
                    updatedAt: undefined,
                    expiresAt: undefined,
                } satisfies MissCacheResult);

                (
                    service.queryHistoryModel.create as import('vitest').Mock
                ).mockResolvedValue({
                    queryUuid: 'test-query-uuid',
                });

                vi.spyOn(service, 'runAsyncWarehouseQuery').mockResolvedValue(
                    undefined,
                );

                service.getUserAttributes = vi.fn(async () => ({
                    userAttributes: {},
                    intrinsicUserAttributes: { email: 'test@example.com' },
                }));

                const mockWarehouseClient = {
                    ...warehouseClientMock,
                    streamQuery: vi.fn(async (_sql, callback) => {
                        await callback({
                            fields: {
                                test_col: { type: DimensionType.STRING },
                            },
                            rows: [],
                        });
                    }),
                };

                service._getWarehouseClient = vi.fn(async () => ({
                    warehouseClient: mockWarehouseClient,
                    sshTunnel: mockSshTunnel,
                    tunnelConnectMs: null,
                }));

                await service.executeAsyncSqlQuery({
                    account: sessionAccount,
                    projectUuid,
                    sql: 'SELECT 1',
                    context: QueryExecutionContext.SQL_RUNNER,
                    invalidateCache: true,
                });

                expect(service.findResultsCache).toHaveBeenCalledWith(
                    projectUuid,
                    expect.any(String),
                    sessionAccount,
                    true,
                );
            });
        });

        describe('user attributes replacement', () => {
            it('should replace user attributes in SQL queries', async () => {
                // GIVEN: Service with mocked user attributes
                const mockUserModel = {
                    findSessionUserByUUID: vi.fn(async () => ({
                        email: 'test@example.com',
                    })),
                };

                const mockUserAttributesModel = {
                    getAttributeValuesForOrgMember: vi.fn(async () => ({
                        department: ['engineering'],
                        region: ['us-west'],
                    })),
                };

                const mockEmailModel = {
                    getPrimaryEmailStatus: vi.fn(async () => ({
                        isVerified: true,
                    })),
                };

                const mockProjectParametersModel = {
                    find: vi.fn(async () => []),
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
                service.getUserAttributes = vi.fn(async () => ({
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
                    streamQuery: vi.fn(async (sql, callback) => {
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
                service._getWarehouseClient = vi.fn(async () => ({
                    warehouseClient: mockWarehouseClient,
                    sshTunnel: mockSshTunnel,
                    tunnelConnectMs: null,
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

                const createCall = (
                    service.queryHistoryModel.create as import('vitest').Mock
                ).mock.calls[0][1];
                expect(createCall.requestParameters).toEqual(
                    expect.objectContaining({
                        sql: sqlWithUserAttributes,
                        context: QueryExecutionContext.SQL_RUNNER,
                        invalidateCache: false,
                    }),
                );
            });

            it('should handle missing user attributes gracefully', async () => {
                // GIVEN: Service with no user attributes
                const mockProjectParametersModel = {
                    find: vi.fn(async () => []),
                };

                const service = getMockedAsyncQueryService(
                    lightdashConfigMock,
                    {
                        projectParametersModel:
                            mockProjectParametersModel as unknown as ProjectParametersModel,
                    },
                );

                // Mock getUserAttributes to return empty attributes
                service.getUserAttributes = vi.fn(async () => ({
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
                    find: vi.fn(async () => []),
                };

                const service = getMockedAsyncQueryService(
                    lightdashConfigMock,
                    {
                        projectParametersModel:
                            mockProjectParametersModel as unknown as ProjectParametersModel,
                    },
                );

                // Mock getUserAttributes to return empty intrinsic attributes (unverified email)
                service.getUserAttributes = vi.fn(async () => ({
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

        describe('parameter resolution', () => {
            // Regression for PROD-7497: virtual view "Save" sent the
            // column-discovery query without parameter values. The placeholder
            // ${lightdash.parameters.X} reached Postgres and produced a
            // confusing `syntax error at or near "$"`. The service should
            // detect unbound parameter references before hitting the warehouse
            // and surface a clean ParameterError instead.
            const sqlWithUnboundParam =
                'SELECT * FROM jaffle.orders WHERE status = ${lightdash.parameters.no_default_param} LIMIT 10';

            const buildService = (
                projectParameterConfigs: {
                    name: string;
                    config: AnyType;
                }[] = [],
            ) => {
                const mockProjectParametersModel = {
                    find: vi.fn(async () => projectParameterConfigs),
                };

                const service = getMockedAsyncQueryService(
                    lightdashConfigMock,
                    {
                        projectParametersModel:
                            mockProjectParametersModel as unknown as ProjectParametersModel,
                    },
                );

                service.getUserAttributes = vi.fn(async () => ({
                    userAttributes: {},
                    intrinsicUserAttributes: { email: 'test@example.com' },
                }));

                const streamQuery = vi.fn();

                service._getWarehouseClient = vi.fn(async () => ({
                    warehouseClient: {
                        ...warehouseClientMock,
                        streamQuery,
                    },
                    sshTunnel: mockSshTunnel,
                    tunnelConnectMs: null,
                }));

                return { service, streamQuery };
            };

            it('throws ParameterError when SQL references a parameter that has no value and no default', async () => {
                const { service, streamQuery } = buildService([
                    {
                        name: 'no_default_param',
                        config: {
                            label: 'No Default Param',
                            options: ['completed', 'shipped'],
                        },
                    },
                ]);

                await expect(
                    service.executeAsyncSqlQuery({
                        account: sessionAccount,
                        projectUuid,
                        sql: sqlWithUnboundParam,
                        // parameters intentionally omitted to simulate the
                        // pre-fix frontend Save flow.
                        context: QueryExecutionContext.SQL_RUNNER,
                        invalidateCache: false,
                    }),
                ).rejects.toThrow(
                    expect.objectContaining({
                        name: 'ParameterError',
                        message: expect.stringContaining('no_default_param'),
                    }),
                );

                // Guardrail: we must not have shipped the unsubstituted SQL
                // to the warehouse — that's the buggy behaviour we're fixing.
                expect(streamQuery).not.toHaveBeenCalled();
            });
        });

        describe('legacy total and subtotal flows', () => {
            beforeEach(() => {
                vi.clearAllMocks();
            });

            it('preserves dashboard filters and parameter precedence for saved chart totals', async () => {
                const service = getMockedAsyncQueryService(lightdashConfigMock);
                const account = buildAccount();
                account.user.ability = new Ability<PossibleAbilities>([
                    { subject: 'Project', action: ['view'] },
                    { subject: 'Explore', action: ['manage'] },
                    { subject: 'SavedChart', action: ['view'] },
                ]);

                const warehouseClient = {
                    ...warehouseClientMock,
                    runQuery: vi.fn(),
                    executeAsyncQuery: vi.fn(
                        warehouseClientMock.executeAsyncQuery,
                    ),
                };

                (
                    projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
                ).mockReturnValue(warehouseClient);
                (service as AnyType).savedChartModel = {
                    get: vi.fn().mockResolvedValue({
                        uuid: 'chart-1',
                        organizationUuid: projectSummary.organizationUuid,
                        projectUuid,
                        spaceUuid: 'space-1',
                        tableName: validExplore.name,
                        metricQuery: metricQueryMock,
                        parameters: {
                            saved_only: 'saved',
                            clash: 'saved',
                        },
                    }),
                };
                (service as AnyType).spacePermissionService = {
                    resolveAccess: vi.fn().mockResolvedValue({
                        organizationUuid: projectSummary.organizationUuid,
                        projectUuid,
                        inheritsFromOrgOrProject: true,
                        access: [],
                        admins: [],
                        directOnly: false,
                    }),
                };
                service.pollForQueryCompletion = vi
                    .fn()
                    .mockResolvedValue(undefined);
                (
                    service.queryHistoryModel.get as import('vitest').Mock
                ).mockResolvedValue({
                    context: QueryExecutionContext.CALCULATE_TOTAL,
                    resultsFileName: 'results.jsonl',
                    pivotConfiguration: null,
                    pivotValuesColumns: null,
                    pivotTotalColumnCount: null,
                    originalColumns: null,
                    projectUuid,
                    organizationUuid: projectSummary.organizationUuid,
                    metricQuery: metricQueryMock,
                    createdByActorType: 'session',
                    createdByUserUuid: 'user-uuid',
                } satisfies Partial<QueryHistory>);
                (
                    service.resultsStorageClient
                        .getDownloadStream as import('vitest').Mock
                ).mockReturnValue(getJsonlStream([{ a_met1: '456' }]));

                await service.calculateTotalFromSavedChart(
                    account,
                    'chart-1',
                    {
                        dimensions: [
                            {
                                id: 'filter-1',
                                target: {
                                    fieldId: 'a_dim1',
                                    tableName: 'a',
                                },
                                operator: FilterOperator.EQUALS,
                                values: ['foo'],
                                settings: {},
                            },
                        ],
                        metrics: [],
                        tableCalculations: [],
                    } as AnyType,
                    false,
                    {
                        clash: 'request',
                    },
                );

                const createCall = (
                    service.queryHistoryModel.create as import('vitest').Mock
                ).mock.calls[0][1];

                expect(createCall.metricQuery.filters.dimensions).toEqual(
                    expect.objectContaining({
                        and: [
                            expect.objectContaining({
                                target: expect.objectContaining({
                                    fieldId: 'a_dim1',
                                }),
                            }),
                        ],
                    }),
                );
                expect(createCall.requestParameters.parameters).toEqual(
                    expect.objectContaining({
                        saved_only: 'saved',
                        clash: 'request',
                    }),
                );
            });

            it('returns subtotals in the legacy formatted shape through async execution', async () => {
                const service = getMockedAsyncQueryService(lightdashConfigMock);
                const warehouseClient = {
                    ...warehouseClientMock,
                    runQuery: vi.fn(),
                    executeAsyncQuery: vi.fn(
                        warehouseClientMock.executeAsyncQuery,
                    ),
                };

                (
                    projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
                ).mockReturnValue(warehouseClient);
                service.pollForQueryCompletion = vi
                    .fn()
                    .mockResolvedValue(undefined);
                (
                    service.queryHistoryModel.get as import('vitest').Mock
                ).mockResolvedValue({
                    context: QueryExecutionContext.CALCULATE_SUBTOTAL,
                    resultsFileName: 'results.jsonl',
                    pivotConfiguration: null,
                    pivotValuesColumns: null,
                    pivotTotalColumnCount: null,
                    originalColumns: null,
                    projectUuid,
                    organizationUuid: projectSummary.organizationUuid,
                    metricQuery: metricQueryMock,
                    createdByActorType: 'session',
                    createdByUserUuid: 'user-uuid',
                } satisfies Partial<QueryHistory>);
                (
                    service.resultsStorageClient
                        .getDownloadStream as import('vitest').Mock
                ).mockReturnValue(
                    getJsonlStream([{ a_dim1: 'group-1', a_met1: '123' }]),
                );

                const result = await service.calculateSubtotalsFromQuery(
                    sessionAccount,
                    projectUuid,
                    {
                        explore: validExplore.name,
                        metricQuery: {
                            ...metricQueryMock,
                            dimensions: ['a_dim1', 'b_dim1'],
                            tableCalculations: [],
                        },
                        columnOrder: ['a_dim1', 'b_dim1', 'a_met1'],
                    },
                );

                expect(result).toEqual({
                    a_dim1: [{ a_dim1: 'group-1', a_met1: '123' }],
                });
                expect(service.queryHistoryModel.create).toHaveBeenCalledTimes(
                    1,
                );
                expect(warehouseClient.executeAsyncQuery).toHaveBeenCalled();
                expect(warehouseClient.runQuery).not.toHaveBeenCalled();
            });
        });
    });

    describe('executeAsyncCalculateTotalFromQueryHistory', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('threads the source dateZoom from request_parameters into the totals query', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const account = buildAccount();

            const dateZoom = {
                granularity: 'MONTH',
                xAxisFieldId: 'orders_order_date_day',
            };

            (
                service.queryHistoryModel.get as import('vitest').Mock
            ).mockResolvedValue({
                queryUuid: 'test-query-uuid',
                projectUuid,
                organizationUuid: projectSummary.organizationUuid,
                metricQuery: {
                    ...metricQueryMock,
                    dimensions: ['orders_order_date_day'],
                    metrics: ['payments_total_revenue'],
                },
                pivotConfiguration: {
                    groupByColumns: [{ reference: 'orders_order_date_day' }],
                    indexColumn: undefined,
                    valuesColumns: [],
                },
                requestParameters: {
                    context: QueryExecutionContext.DASHBOARD,
                    chartUuid: 'chart-uuid',
                    tileUuid: 'tile-uuid',
                    dashboardUuid: 'dashboard-uuid',
                    dashboardFilters: {
                        dimensions: [],
                        metrics: [],
                        tableCalculations: [],
                    },
                    dashboardSorts: [],
                    dateZoom,
                },
            } as unknown as QueryHistory);

            const runSpy = vi
                .spyOn(
                    service as unknown as {
                        runAsyncMetricQueryWithoutPermissionCheck: (
                            ...args: unknown[]
                        ) => Promise<unknown>;
                    },
                    'runAsyncMetricQueryWithoutPermissionCheck',
                )
                .mockResolvedValue({} as never);

            await service.executeAsyncCalculateTotalFromQueryHistory({
                account,
                projectUuid,
                queryUuid: 'test-query-uuid',
                kind: 'columnTotal',
            });

            expect(runSpy).toHaveBeenCalledTimes(1);
            expect(runSpy.mock.calls[0][0]).toEqual(
                expect.objectContaining({ dateZoom }),
            );
        });
    });

    describe('executeAsyncUnboundedRerunFromQueryHistory', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        const mockSourceQueryHistory = (sourceLimit: number) =>
            ({
                queryUuid: 'capped-query-uuid',
                projectUuid,
                organizationUuid: projectSummary.organizationUuid,
                metricQuery: {
                    ...metricQueryMock,
                    limit: sourceLimit,
                },
                pivotConfiguration: null,
                requestParameters: {
                    context: QueryExecutionContext.SCHEDULED_DELIVERY,
                    query: metricQueryMock,
                    parameters: { region: 'EU' },
                },
            }) as unknown as QueryHistory;

        // 'all' semantics: the org's cell-based cap, computed the same way
        // for every source limit in this describe block.
        const expectedUnboundedLimit = Math.floor(
            lightdashConfigMock.query.csvCellsLimit /
                (metricQueryMock.dimensions.length +
                    metricQueryMock.metrics.length +
                    metricQueryMock.tableCalculations.length),
        );

        it('re-runs the source metricQuery with the row limit lifted, returning the applied limit', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const account = buildAccount();

            (
                service.queryHistoryModel.get as import('vitest').Mock
            ).mockResolvedValue(mockSourceQueryHistory(500));

            const runSpy = vi
                .spyOn(
                    service as unknown as {
                        runAsyncMetricQueryWithoutPermissionCheck: (
                            ...args: unknown[]
                        ) => Promise<unknown>;
                    },
                    'runAsyncMetricQueryWithoutPermissionCheck',
                )
                .mockResolvedValue({ queryUuid: 'rerun-query-uuid' } as never);

            const result =
                await service.executeAsyncUnboundedRerunFromQueryHistory({
                    account,
                    projectUuid,
                    queryUuid: 'capped-query-uuid',
                    context: QueryExecutionContext.SCHEDULED_DELIVERY,
                });

            expect(service.queryHistoryModel.get).toHaveBeenCalledWith(
                'capped-query-uuid',
                projectUuid,
                account,
            );
            expect(runSpy).toHaveBeenCalledTimes(1);
            const [runArgs] = runSpy.mock.calls[0] as [
                { metricQuery: MetricQuery; context: QueryExecutionContext },
            ];
            // The numeric cap from the capped run (500) is replaced by the
            // org's cell-based cap, not merely "not 500".
            expect(runArgs.metricQuery.limit).toBe(expectedUnboundedLimit);
            expect(runArgs.context).toBe(
                QueryExecutionContext.SCHEDULED_DELIVERY,
            );
            expect(runSpy.mock.calls[0][0]).toEqual(
                expect.objectContaining({
                    parameters: { region: 'EU' },
                    pivotConfiguration: undefined,
                }),
            );
            expect(result).toEqual({
                outcome: 'executed',
                queryUuid: 'rerun-query-uuid',
                appliedLimit: expectedUnboundedLimit,
            });
        });

        // Wide-query case: a source limit already at (or above) the org's
        // cell-based cap means rerunning can't return more rows than the
        // capped result already has — 'All Results' must never deliver less.
        it('skips execution and reports noImprovementPossible when the computed limit would not beat the source limit', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock);
            const account = buildAccount();

            (
                service.queryHistoryModel.get as import('vitest').Mock
            ).mockResolvedValue(mockSourceQueryHistory(expectedUnboundedLimit));

            const runSpy = vi
                .spyOn(
                    service as unknown as {
                        runAsyncMetricQueryWithoutPermissionCheck: (
                            ...args: unknown[]
                        ) => Promise<unknown>;
                    },
                    'runAsyncMetricQueryWithoutPermissionCheck',
                )
                .mockResolvedValue({} as never);

            const result =
                await service.executeAsyncUnboundedRerunFromQueryHistory({
                    account,
                    projectUuid,
                    queryUuid: 'capped-query-uuid',
                    context: QueryExecutionContext.SCHEDULED_DELIVERY,
                });

            expect(runSpy).not.toHaveBeenCalled();
            expect(result).toEqual({ outcome: 'noImprovementPossible' });
        });
    });

    describe('executeAsyncSavedChartQuery pivotDimensions wiring', () => {
        const pivotColumn = 'a_dim1';

        const authorizedAccount = {
            ...sessionAccount,
            user: {
                ...sessionAccount.user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'Project', action: ['view'] },
                    { subject: 'SavedChart', action: ['view'] },
                ]),
            },
        } as unknown as Account;

        const bigNumberChart = {
            uuid: 'savedChartUuid',
            name: 'Big number chart',
            organizationUuid: projectSummary.organizationUuid,
            projectUuid,
            spaceUuid: 'spaceUuid',
            tableName: validExplore.name,
            metricQuery: metricQueryMock,
            parameters: undefined,
            pivotConfig: { columns: [pivotColumn] },
            chartConfig: { type: ChartType.BIG_NUMBER },
        };

        test('passes savedChart.pivotConfig.columns as pivotDimensions to prepareMetricQueryAsyncQueryArgs', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                savedChartModel: {
                    get: vi.fn(async () => bigNumberChart),
                } as unknown as SavedChartModel,
                analyticsModel: {
                    addChartViewEvent: vi.fn(async () => {}),
                } as unknown as AnalyticsModel,
            });

            service.getExploreWithUserAccessControls = vi
                .fn()
                .mockResolvedValue({
                    explore: validExplore,
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                });
            (service as AnyType).getWarehouseCredentials = vi
                .fn()
                .mockResolvedValue(warehouseClientMock.credentials);
            service.combineParameters = vi.fn().mockResolvedValue(undefined);
            (service as AnyType).getMetricQueryFields = vi
                .fn()
                .mockResolvedValue({ fields: {} });

            const prepareSpy = vi.fn().mockResolvedValue(
                createQueryComposerMock({
                    sql: 'SELECT 1',
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                    availableParameterDefinitions: {},
                }),
            );
            (service as AnyType).prepareMetricQueryAsyncQueryArgs = prepareSpy;

            service['executeAsyncQuery'] = vi.fn().mockResolvedValue({
                queryUuid: 'queryUuid',
                cacheMetadata: { cacheHit: false },
            });

            await service.executeAsyncSavedChartQuery({
                account: authorizedAccount,
                projectUuid,
                chartUuid: bigNumberChart.uuid,
                versionUuid: undefined,
                context: QueryExecutionContext.CHART,
                invalidateCache: false,
                limit: undefined,
                parameters: undefined,
                pivotResults: false,
                filterOverrides: undefined,
            });

            expect(prepareSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    pivotDimensions: [pivotColumn],
                }),
            );
        });
    });

    describe('executeAsyncSavedChartQuery filterOverrides wiring', () => {
        const authorizedAccount = {
            ...sessionAccount,
            user: {
                ...sessionAccount.user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'Project', action: ['view'] },
                    { subject: 'SavedChart', action: ['view'] },
                ]),
            },
        } as unknown as Account;

        // metricQueryMock.filters is `{}`, so give the chart its own
        // dimensions filter group here to make the AND-merge assertion
        // meaningful (otherwise there'd be nothing on the chart side to merge).
        const chartFilterGroup = {
            id: 'chart-root',
            and: [
                {
                    id: 'chart-filter-0',
                    target: { fieldId: 'a_dim1' },
                    operator: FilterOperator.EQUALS,
                    values: ['chart-value'],
                },
            ],
        };

        const chart = {
            uuid: 'savedChartUuid',
            name: 'Chart with filters',
            organizationUuid: projectSummary.organizationUuid,
            projectUuid,
            spaceUuid: 'spaceUuid',
            tableName: validExplore.name,
            metricQuery: {
                ...metricQueryMock,
                filters: { dimensions: chartFilterGroup },
            },
            parameters: undefined,
            pivotConfig: undefined,
            chartConfig: { type: ChartType.CARTESIAN },
        };

        test('ANDs filterOverrides onto the chart metricQuery filters', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                savedChartModel: {
                    get: vi.fn(async () => chart),
                } as unknown as SavedChartModel,
                analyticsModel: {
                    addChartViewEvent: vi.fn(async () => {}),
                } as unknown as AnalyticsModel,
            });
            service.getExploreWithUserAccessControls = vi
                .fn()
                .mockResolvedValue({
                    explore: validExplore,
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                });
            (service as AnyType).getWarehouseCredentials = vi
                .fn()
                .mockResolvedValue(warehouseClientMock.credentials);
            service.combineParameters = vi.fn().mockResolvedValue(undefined);
            (service as AnyType).getMetricQueryFields = vi
                .fn()
                .mockResolvedValue({ fields: {} });
            const prepareSpy = vi.fn().mockResolvedValue(
                createQueryComposerMock({
                    sql: 'SELECT 1',
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                    availableParameterDefinitions: {},
                }),
            );
            (service as AnyType).prepareMetricQueryAsyncQueryArgs = prepareSpy;
            service['executeAsyncQuery'] = vi.fn().mockResolvedValue({
                queryUuid: 'queryUuid',
                cacheMetadata: { cacheHit: false },
            });

            const overrideGroup = {
                id: 'app-root',
                and: [
                    {
                        id: 'app-filter-0',
                        target: { fieldId: 'a_dim1' },
                        operator: FilterOperator.EQUALS,
                        values: ['enterprise'],
                    },
                ],
            };
            await service.executeAsyncSavedChartQuery({
                account: authorizedAccount,
                projectUuid,
                chartUuid: chart.uuid,
                versionUuid: undefined,
                context: QueryExecutionContext.CHART,
                invalidateCache: false,
                limit: undefined,
                parameters: undefined,
                pivotResults: false,
                filterOverrides: {
                    dimensions: overrideGroup,
                },
            });

            const merged = prepareSpy.mock.calls[0][0].metricQuery;
            // Chart's own dimensions filter group survives AND the override
            // group is added alongside it (AND semantics, not a replace).
            expect(merged.filters.dimensions.and).toHaveLength(2);
            expect(merged.filters.dimensions.and).toContainEqual(
                chartFilterGroup,
            );
            expect(merged.filters.dimensions.and).toContainEqual(overrideGroup);
        });

        test('merges dashboard filters targeting the explore and silently drops the rest', async () => {
            const service = getMockedAsyncQueryService(lightdashConfigMock, {
                savedChartModel: {
                    get: vi.fn(async () => chart),
                } as unknown as SavedChartModel,
                analyticsModel: {
                    addChartViewEvent: vi.fn(async () => {}),
                } as unknown as AnalyticsModel,
            });
            service.getExploreWithUserAccessControls = vi
                .fn()
                .mockResolvedValue({
                    explore: validExplore,
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                });
            (service as AnyType).getWarehouseCredentials = vi
                .fn()
                .mockResolvedValue(warehouseClientMock.credentials);
            service.combineParameters = vi.fn().mockResolvedValue(undefined);
            (service as AnyType).getMetricQueryFields = vi
                .fn()
                .mockResolvedValue({ fields: {} });
            const prepareSpy = vi.fn().mockResolvedValue(
                createQueryComposerMock({
                    sql: 'SELECT 1',
                    userAccessControls: {
                        userAttributes: {},
                        intrinsicUserAttributes: {},
                    },
                    availableParameterDefinitions: {},
                }),
            );
            (service as AnyType).prepareMetricQueryAsyncQueryArgs = prepareSpy;
            service['executeAsyncQuery'] = vi.fn().mockResolvedValue({
                queryUuid: 'queryUuid',
                cacheMetadata: { cacheHit: false },
            });

            await service.executeAsyncSavedChartQuery({
                account: authorizedAccount,
                projectUuid,
                chartUuid: chart.uuid,
                versionUuid: undefined,
                context: QueryExecutionContext.CHART,
                invalidateCache: false,
                limit: undefined,
                parameters: undefined,
                pivotResults: false,
                filterOverrides: undefined,
                dashboardFilters: {
                    dimensions: [
                        {
                            // Different field than the chart's own filter —
                            // same-field dashboard filters OVERRIDE chart
                            // filters (standard dashboard-tile semantics).
                            id: 'dash-rule-in-explore',
                            target: { fieldId: 'b_dim1', tableName: 'b' },
                            operator: FilterOperator.EQUALS,
                            values: ['dashboard-value'],
                            label: undefined,
                        },
                        {
                            id: 'dash-rule-other-explore',
                            target: {
                                fieldId: 'customers_segment',
                                tableName: 'customers',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['enterprise'],
                            label: undefined,
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            });

            const merged = prepareSpy.mock.calls[0][0].metricQuery;
            const mergedJson = JSON.stringify(merged.filters);
            // The in-explore rule is applied alongside the chart's own filter…
            expect(mergedJson).toContain('dashboard-value');
            expect(mergedJson).toContain('chart-value');
            // …the out-of-explore rule is dropped without failing the run.
            expect(mergedJson).not.toContain('customers_segment');
        });
    });

    describe('runQueryAndTransformRows', () => {
        const buildWarehouseClientStreaming = (
            batches: Record<string, unknown>[][],
        ) =>
            ({
                executeAsyncQuery: vi.fn(
                    async (
                        _args: unknown,
                        streamCallback?: (
                            rows: Record<string, unknown>[],
                            fields: Record<string, { type: DimensionType }>,
                        ) => void | Promise<void>,
                    ) => {
                        for (const batch of batches) {
                            // eslint-disable-next-line no-await-in-loop
                            await streamCallback?.(batch, {
                                dim_a: { type: DimensionType.STRING },
                                metric_x_any: { type: DimensionType.NUMBER },
                            });
                        }
                        return {
                            queryId: 'query-id',
                            queryMetadata: null,
                            totalRows: batches.flat().length,
                            durationMs: 1,
                            phaseTimings: {},
                        };
                    },
                ),
            }) as unknown as WarehouseClient;

        test('counts total rows when the pivot has no groupBy columns (collapsed totals query)', async () => {
            const batches = [
                [
                    { dim_a: 'a', metric_x_any: 1 },
                    { dim_a: 'b', metric_x_any: 2 },
                    { dim_a: 'c', metric_x_any: 3 },
                ],
                [
                    { dim_a: 'd', metric_x_any: 4 },
                    { dim_a: 'e', metric_x_any: 5 },
                ],
            ];
            const write = vi.fn();

            const { pivotDetails } =
                await AsyncQueryService.runQueryAndTransformRows({
                    warehouseClient: buildWarehouseClientStreaming(batches),
                    query: 'SELECT 1',
                    queryTags: {
                        query_context: QueryExecutionContext.EXPLORE,
                    },
                    write,
                    pivotConfiguration: {
                        indexColumn: {
                            reference: 'dim_a',
                            type: VizIndexType.CATEGORY,
                        },
                        valuesColumns: [
                            {
                                reference: 'metric_x',
                                aggregation: VizAggregationOptions.ANY,
                            },
                        ],
                        groupByColumns: [],
                        sortBy: undefined,
                    },
                    itemsMap: {},
                    displayTimezone: null,
                });

            // Rows pass through untransformed…
            expect(write).toHaveBeenCalledTimes(2);
            expect(write).toHaveBeenNthCalledWith(1, batches[0]);
            expect(write).toHaveBeenNthCalledWith(2, batches[1]);
            // …and totalRows must reflect every streamed row, otherwise the
            // query history records total_row_count=0 and paginated reads of
            // the totals result stop after the first page.
            expect(pivotDetails).not.toBeNull();
            expect(pivotDetails?.totalRows).toBe(5);
        });
    });
});

describe('checkDashboardChartQueryPermissions', () => {
    const owningDashboardUuid = 'owned-dashboard-uuid';
    const chartSpace = {
        uuid: 'space-1',
        organizationUuid: projectSummary.organizationUuid,
    } as AnyType;

    const buildGrantOnlyAccount = () => {
        const account = buildAccount();
        account.user.ability = new Ability<PossibleAbilities>([
            {
                subject: 'SavedChart',
                action: ['view'],
                conditions: {
                    organizationUuid: projectSummary.organizationUuid,
                    access: {
                        $elemMatch: { userUuid: account.user.id },
                    },
                },
            },
            {
                subject: 'Project',
                action: ['view'],
                conditions: {
                    organizationUuid: projectSummary.organizationUuid,
                },
            },
        ]);
        return account;
    };

    const buildSpacePermissionService = (
        dashboardAccess: { userUuid: string }[],
    ) => ({
        resolveAccess: vi.fn(async (_userUuid, target) =>
            target.type === 'space'
                ? {
                      organizationUuid: projectSummary.organizationUuid,
                      projectUuid: projectSummary.projectUuid,
                      inheritsFromOrgOrProject: false,
                      access: [],
                      admins: [],
                      directOnly: false,
                  }
                : {
                      organizationUuid: projectSummary.organizationUuid,
                      projectUuid: projectSummary.projectUuid,
                      inheritsFromOrgOrProject: false,
                      access: dashboardAccess.map(({ userUuid }) => ({
                          userUuid,
                          role: 'viewer',
                          hasDirectAccess: true,
                      })),
                      admins: [],
                      directOnly: true,
                  },
        ),
    });

    it('authorizes a dashboard-owned chart through the dashboard grant', async () => {
        const account = buildGrantOnlyAccount();
        const service = getMockedAsyncQueryService(lightdashConfigMock);
        const spacePermissionService = buildSpacePermissionService([
            { userUuid: account.user.id },
        ]);
        (service as AnyType).spacePermissionService = spacePermissionService;

        await expect(
            (service as AnyType).checkDashboardChartQueryPermissions(
                account,
                projectSummary.projectUuid,
                'chart-uuid',
                chartSpace,
                owningDashboardUuid,
            ),
        ).resolves.toBeUndefined();
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            account.user.id,
            {
                type: 'chart',
                chartUuid: 'chart-uuid',
                dashboardUuid: owningDashboardUuid,
                spaceUuid: chartSpace.uuid,
            },
        );
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledTimes(1);
    });

    it('denies a dashboard-owned chart without a grant or space access', async () => {
        const account = buildGrantOnlyAccount();
        const service = getMockedAsyncQueryService(lightdashConfigMock);
        (service as AnyType).spacePermissionService =
            buildSpacePermissionService([]);

        await expect(
            (service as AnyType).checkDashboardChartQueryPermissions(
                account,
                projectSummary.projectUuid,
                'chart-uuid',
                chartSpace,
                owningDashboardUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('routes a reusable chart through its own chart context and denies without a grant', async () => {
        const account = buildGrantOnlyAccount();
        const service = getMockedAsyncQueryService(lightdashConfigMock);
        const spacePermissionService = buildSpacePermissionService([]);
        (service as AnyType).spacePermissionService = spacePermissionService;

        await expect(
            (service as AnyType).checkDashboardChartQueryPermissions(
                account,
                projectSummary.projectUuid,
                'chart-uuid',
                chartSpace,
                null,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            account.user.id,
            {
                type: 'chart',
                chartUuid: 'chart-uuid',
                dashboardUuid: null,
                spaceUuid: chartSpace.uuid,
            },
        );
    });
});

describe('getQueryHistoryList', () => {
    const buildService = (
        counts: Awaited<ReturnType<QueryHistoryModel['getUserHistoryCounts']>>,
    ) =>
        getMockedAsyncQueryService(lightdashConfigMock, {
            featureFlagModel: {
                get: vi.fn(async ({ featureFlagId }: AnyType) => ({
                    id: featureFlagId,
                    enabled: featureFlagId === FeatureFlags.QueryHistory,
                })),
            } as unknown as FeatureFlagModel,
            queryHistoryModel: {
                findUserHistory: vi.fn(async () => ({
                    data: [],
                    pagination: {
                        page: 1,
                        pageSize: 10,
                        totalPageCount: 0,
                        totalResults: 0,
                    },
                })),
                getUserHistoryCounts: vi.fn(async () => counts),
            } as unknown as QueryHistoryModel,
        } as never);

    it('totals across every trigger, not just the filtered one', async () => {
        const service = buildService({
            triggers: {
                [QueryTrigger.INTERACTIVE]: 218,
                [QueryTrigger.APPS]: 129,
                [QueryTrigger.SCHEDULED]: 0,
            },
            // Windows keep the trigger filter, so they only cover interactive.
            windows: {
                [QueryHistoryWindow.LAST_FEW_MINUTES]: 0,
                [QueryHistoryWindow.LAST_HOUR]: 8,
                [QueryHistoryWindow.LAST_24_HOURS]: 20,
                [QueryHistoryWindow.LAST_7_DAYS]: 28,
                [QueryHistoryWindow.LAST_30_DAYS]: 162,
            },
            warehouseTimeMsLast7Days: 13331,
        });

        const { counts } = await service.getQueryHistoryList({
            account: buildAccount(),
            projectUuid: projectSummary.projectUuid,
            filters: { trigger: QueryTrigger.INTERACTIVE },
            paginateArgs: { page: 1, pageSize: 10 },
        });

        expect(counts.total).toBe(347);
    });
});

describe('runComposeMergeQuery row cap refusal', () => {
    const SOURCE_ROW_CAP = 3;

    // Lowered through config rather than by seeding cap-many rows: the run
    // path reads the cap from the same config the legs were submitted with.
    const cappedConfig = {
        ...lightdashConfigMock,
        query: { ...lightdashConfigMock.query, maxLimit: SOURCE_ROW_CAP },
    };

    const legHistory = (totalRowCount: number | null) =>
        ({
            queryUuid: 'leg-uuid',
            projectUuid,
            status: QueryHistoryStatus.READY,
            totalRowCount,
            resultsFileName: 'leg-results.jsonl',
            resultsExpiresAt: null,
            columns: {},
            context: QueryExecutionContext.EXPLORE,
        }) as unknown as QueryHistory;

    const runRefusalCase = async (totalRowCount: number | null) => {
        const service = getMockedAsyncQueryService(cappedConfig);
        const storageClient = service.resultsStorageClient as unknown as {
            configuration: { bucket: string };
        };
        storageClient.configuration = { bucket: 'results-bucket' };

        (
            service.queryHistoryModel as unknown as {
                pollForQueryCompletion: import('vitest').Mock;
            }
        ).pollForQueryCompletion = vi.fn(async () => legHistory(totalRowCount));

        const runWarehouseQuery = vi
            .spyOn(
                service as unknown as {
                    runAsyncWarehouseQuery: (
                        ...args: unknown[]
                    ) => Promise<void>;
                },
                'runAsyncWarehouseQuery',
            )
            .mockResolvedValue(undefined);

        await (
            service as unknown as {
                runComposeMergeQuery: (
                    args: Record<string, unknown>,
                ) => Promise<void>;
            }
        ).runComposeMergeQuery({
            account: buildAccount(),
            projectUuid,
            organizationUuid: projectSummary.organizationUuid,
            isPreviewProject: false,
            onboardingFlow: 'default' as AnyType,
            queryUuid: 'merge-query-uuid',
            sql: 'SELECT 1',
            references: { merge_source_0: 'leg-uuid' },
            legLabelByReferenceTable: { merge_source_0: 'Orders' },
            warehouseClient: warehouseClientMock,
            queryTags: {} as AnyType,
            queryCreatedAt: new Date(),
            cacheKey: 'cache-key',
            context: QueryExecutionContext.EXPLORE,
            fieldsMap: {} as ItemsMap,
            usedParameters: {},
            pivotConfiguration: undefined,
            originalColumns: {} as ResultColumns,
        });

        return {
            runWarehouseQuery,
            update: service.queryHistoryModel.update as import('vitest').Mock,
        };
    };

    it('refuses before the join when a leg reached the row cap, naming the source', async () => {
        const { runWarehouseQuery, update } =
            await runRefusalCase(SOURCE_ROW_CAP);

        expect(runWarehouseQuery).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith(
            'merge-query-uuid',
            projectUuid,
            expect.objectContaining({
                status: QueryHistoryStatus.ERROR,
                error: `Orders returned the maximum of ${SOURCE_ROW_CAP} rows, so the merged results would be missing data. Add a filter to Orders, then merge again.`,
            }),
            expect.anything(),
        );
    });

    it('runs the join when every leg is under the row cap', async () => {
        const { runWarehouseQuery, update } = await runRefusalCase(
            SOURCE_ROW_CAP - 1,
        );

        expect(runWarehouseQuery).toHaveBeenCalledTimes(1);
        expect(update).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ status: QueryHistoryStatus.ERROR }),
            expect.anything(),
        );
    });
});
