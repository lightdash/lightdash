import { Ability, subject } from '@casl/ability';
import {
    Account,
    AiAgentMarkerLevel,
    assertUnreachable,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    BigqueryTokenError,
    ConflictError,
    convertExplores,
    createVirtualView,
    CustomDimensionType,
    CustomSqlQueryForbiddenError,
    DatabricksAuthenticationType,
    DatabricksTokenError,
    DbtExposureType,
    DbtProjectType,
    DbtVersionOptionLatest,
    DEFAULT_SPOTLIGHT_CONFIG,
    DefaultSupportedDbtVersion,
    defineUserAbility,
    DimensionType,
    DownloadFileType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    EMPTY_WAREHOUSE_LOCATION,
    ExploreType,
    FeatureFlags,
    FilterOperator,
    ForbiddenError,
    getCompiledModels,
    getCustomSqlFieldKey,
    getDbtManifestVersion,
    getItemId,
    getModelsFromManifest,
    isAiAccessQueryContext,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH,
    MergeJoinType,
    MergeQueryErrorKind,
    MetricQuery,
    MetricType,
    MissingWarehouseCredentialsError,
    NotFoundError,
    NotImplementedError,
    OpenIdIdentityIssuerType,
    OrganizationMemberRole,
    ParameterError,
    PersonSignInProvider,
    PreAggregateMissReason,
    PreviewWarehouseSignInExpiredError,
    ProjectType,
    QueryExecutionContext,
    QuerySurface,
    RedshiftAuthenticationType,
    RequestMethod,
    SessionUser,
    SignInSubjectBasis,
    SnowflakeAuthenticationType,
    SnowflakeTokenError,
    SshTunnelError,
    SupportedDbtAdapter,
    UserWarehouseCredentialPurpose,
    VizAggregationOptions,
    VizIndexType,
    WarehouseConnectionError,
    WarehouseTableType,
    WarehouseTypes,
    WeekDay,
    type AiExecutionPlan,
    type ChartSummary,
    type CopyPreviewContentPayload,
    type CreateAthenaCredentials,
    type CreateBigqueryCredentials,
    type CreateClickhouseCredentials,
    type CreateDatabricksCredentials,
    type CreateDuckdbDucklakeCredentials,
    type CreateDuckdbMotherduckCredentials,
    type CreatePostgresCredentials,
    type CreateProject,
    type CreateRedshiftCredentials,
    type CreateSnowflakeCredentials,
    type CreateTrinoCredentials,
    type CreateWarehouseCredentials,
    type DbtManifest,
    type DownloadFile,
    type EmbedContent,
    type Explore,
    type ExploreError,
    type Job,
    type LightdashProjectConfig,
    type MergeQuery,
    type MergeQueryMetricSource,
    type PossibleAbilities,
    type Project,
    type ProjectDbtSource,
    type RegisteredAccount,
    type UpdateProject,
    type UserWarehouseCredentialsWithSecrets,
    type WarehouseConnection,
    type WarehouseLocation,
    type WarehouseTables,
    type WarehouseTableSchema,
} from '@lightdash/common';
import {
    checkSnowflakeAgentSessionWithToken,
    SshTunnel,
    warehouseClientFromCredentials,
    type WarehouseClient,
} from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import fetch, { Response } from 'node-fetch';
import { Readable } from 'stream';
import { gunzipSync } from 'zlib';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { fromJwt } from '../../auth/account/account';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { getDbtPartialParseBaselinePath } from '../../dbt/dbtPartialParseBaseline';
import { PreAggregateModel } from '../../ee/models/PreAggregateModel';
import type { AiAgentService } from '../../ee/services/AiAgentService/AiAgentService';
import * as winston from '../../logging/winston';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentModel } from '../../models/ContentModel/ContentModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { type DocumentModel } from '../../models/DocumentModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { EmailModel } from '../../models/EmailModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { GroupsModel } from '../../models/GroupsModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import { ProjectCompileLogModel } from '../../models/ProjectCompileLogModel';
import { ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import {
    ProjectModel,
    type PreviewCredentialsPush,
    type PushToPreview,
} from '../../models/ProjectModel/ProjectModel';
import { singleRouteProjectModelMethods } from '../../models/ProjectModel/ProjectModel.mock';
import { ProjectParametersModel } from '../../models/ProjectParametersModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { TagsModel } from '../../models/TagsModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserModel } from '../../models/UserModel';
import { UserOAuthGrantsModel } from '../../models/UserOAuthGrantsModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { type WarehouseConnectionCompileModel } from '../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { type WarehouseConnectionIdentityModel } from '../../models/WarehouseConnectionIdentityModel/WarehouseConnectionIdentityModel';
import { WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { WarehouseConnectionTablesModel } from '../../models/WarehouseConnectionTablesModel/WarehouseConnectionTablesModel';
import { DbtBaseProjectAdapter } from '../../projectAdapters/dbtBaseProjectAdapter';
import { GITHUB_APP_NOT_INSTALLED_MESSAGE } from '../../projectAdapters/githubAuthorization';
import * as projectAdapterModule from '../../projectAdapters/projectAdapter';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import type { DbtManifestFetchTimings, ProjectAdapter } from '../../types';
import { metricQueryWithLimit } from '../../utils/csvLimitUtils';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    METRIC_QUERY,
    warehouseClientMock,
} from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { QueryComposer } from '../../utils/QueryBuilder/QueryComposer';
import { AdminNotificationService } from '../AdminNotificationService/AdminNotificationService';
import { type AiAccessService } from '../AiAccessService/AiAccessService';
import {
    aiExecutionPlanMock,
    aiServiceAccountPlanMock,
} from '../AiAccessService/AiAccessService.mock';
import { PermissionsService } from '../PermissionsService/PermissionsService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UserService } from '../UserService';
import {
    connectionContextFromUser,
    connectionSurfaceFromQuerySurface,
    WarehouseCredentialKind,
} from '../WarehouseClientFactory/ConnectionContext';
import {
    type ScopedWarehouseConnection,
    type WarehouseClientFactory,
    type WarehouseConnectionLease,
} from '../WarehouseClientFactory/WarehouseClientFactory';
import * as analyticsClient from './analyticsProject/analyticsProjectClient';
import { clearSecretsFromCredentials } from './personalWarehouseCredentials';
import { type CheckGoogleRefreshToken } from './previewBigquerySsoCredentials';
import { ProjectService } from './ProjectService';
import {
    allExplores,
    buildAccount,
    defaultProject,
    expectedAllExploreSummary,
    expectedAllExploreSummaryWithoutErrors,
    expectedApiQueryResultsWith1Row,
    expectedApiQueryResultsWith501Rows,
    expectedCatalog,
    expectedExploreSummaryFilteredByName,
    expectedExploreSummaryFilteredByTags,
    exploreToSummaryWithAttributes,
    exploreWithRequiredAttributes,
    exploreWithReservedParameterDimension,
    job,
    lightdashConfigWithNoSMTP,
    metricQueryMock,
    metricQueryReservedParameterDimension,
    preAggregateExplore,
    projectSummary,
    projectWithSensitiveFields,
    resultsWith1Row,
    resultsWith501Rows,
    sessionAccount,
    spacesWithSavedCharts,
    tablesConfiguration,
    tablesConfigurationWithNames,
    tablesConfigurationWithTags,
    user,
    validExplore,
    virtualExplore,
} from './ProjectService.mock';
import { TRAINING_SPACE } from './provisionTrainingProject';

vi.mock('node-fetch', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node-fetch')>()),
    default: vi.fn(),
}));

// Mock worker_threads so the >500 rows test doesn't need a compiled
// dist/services/ProjectService/formatRows.js artifact. In production,
// formatRows runs in a Worker thread for large result sets, but the Worker
// constructor requires the built JS file which only exists after `pnpm build`.
// This mock runs formatRows synchronously in the main thread instead.
vi.mock('@sentry/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/node')>();
    return {
        ...actual,
        captureException: vi.fn(),
    };
});

vi.mock('worker_threads', async () => {
    const { formatRows } =
        await vi.importActual<typeof import('@lightdash/common')>(
            '@lightdash/common',
        );
    return {
        Worker: vi.fn().mockImplementation(
            // eslint-disable-next-line prefer-arrow-callback
            function MockWorker(
                _path: string,
                options: {
                    workerData: { rows: unknown[]; itemMap: unknown };
                },
            ) {
                const { rows, itemMap } = options.workerData;
                const result = formatRows(
                    rows as Record<string, unknown>[],
                    itemMap as Parameters<typeof formatRows>[1],
                );
                return {
                    on: vi.fn(
                        (
                            event: string,
                            callback: (...args: unknown[]) => void,
                        ) => {
                            if (event === 'message') {
                                setTimeout(() => callback(result), 0);
                            }
                        },
                    ),
                    terminate: vi.fn(),
                };
            },
        ),
    };
});

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    canConnectToPostgresDatabaseName: (
        await importOriginal<typeof import('@lightdash/warehouses')>()
    ).canConnectToPostgresDatabaseName,
    unopenablePostgresDatabaseMessage: (
        await importOriginal<typeof import('@lightdash/warehouses')>()
    ).unopenablePostgresDatabaseMessage,
    checkSnowflakeAgentSessionWithToken: vi.fn(),
    SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE: (
        await importOriginal<typeof import('@lightdash/warehouses')>()
    ).SNOWFLAKE_AGENT_SESSION_REQUIRED_MESSAGE,
    // The merge compiler needs the real dialect builder, not a stub
    warehouseSqlBuilderFromType: (
        await importOriginal<typeof import('@lightdash/warehouses')>()
    ).warehouseSqlBuilderFromType,
    SshTunnel: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockSshTunnel() {
            return {
                overrideCredentials: warehouseClientMock.credentials,
                connect: vi.fn(() => warehouseClientMock.credentials),
                disconnect: vi.fn(),
            };
        },
    ),
    exchangeDatabricksOAuthCredentials: vi.fn(),
    refreshDatabricksOAuthToken: vi.fn(),
    DATABRICKS_DEFAULT_OAUTH_CLIENT_ID: 'default-client-id',
    warehouseClientFromCredentials: vi.fn(() => warehouseClientMock),
}));

const projectModel = {
    reconnectSharedSignIn: vi.fn<ProjectModel['reconnectSharedSignIn']>(
        async () => ({ kind: 'skipped' }),
    ),
    duplicateContent: vi.fn(async () => ({ spaceMapping: {} })),
    runInAnalyticsProvisioningLock: vi.fn(
        async (_org: string, callback: () => Promise<unknown>) => callback(),
    ),
    getWithSensitiveFields: vi.fn(async () => projectWithSensitiveFields),
    get: vi.fn(async () => projectWithSensitiveFields),
    getAllByOrganizationUuid: vi.fn<ProjectModel['getAllByOrganizationUuid']>(),
    getSummary: vi.fn(async () => projectSummary),
    getDbtSourceIdentity: vi.fn(async () => ({
        dbtSourceUuid: 'primary-source-uuid',
        dbtSourceName: 'dbt_project',
    })),
    getTablesConfiguration: vi.fn(async () => tablesConfiguration),
    updateTablesConfiguration: vi.fn(),
    getExploreFromCache: vi.fn(async () => validExplore),
    getQueryTimezone: vi.fn(async (): Promise<string | null> => null),
    getProjectWarehouseConfig: vi.fn(async () => ({
        organizationWarehouseCredentialsUuid: null,
        queryTimezone: null,
    })),
    findExploresFromCache: vi.fn(async () => allExplores),
    findExploreTableSummariesFromCache: vi.fn<
        ProjectModel['findExploreTableSummariesFromCache']
    >(async () => ({
        [validExplore.name]: {
            name: validExplore.name,
            type: validExplore.type,
            baseTable: validExplore.baseTable,
            tables: Object.fromEntries(
                Object.entries(validExplore.tables).map(([tableKey, table]) => [
                    tableKey,
                    {
                        name: table.name,
                        originalName: table.originalName,
                        database: table.database,
                        schema: table.schema,
                        description: table.description,
                        sqlTable: table.sqlTable,
                        ymlPath: table.ymlPath,
                        dbtSourceUuid: table.dbtSourceUuid,
                    },
                ]),
            ),
        },
    })),
    findExploreSplitCandidates: vi.fn<
        ProjectModel['findExploreSplitCandidates']
    >(async () => []),
    createVirtualView: vi.fn<ProjectModel['createVirtualView']>(
        async (_projectUuid, payload, builder) =>
            createVirtualView(
                payload.name,
                payload.sql,
                payload.columns,
                builder,
                payload.name,
                payload.parameterValues,
            ),
    ),
    updateVirtualView: vi.fn<ProjectModel['updateVirtualView']>(
        async (_projectUuid, name, payload, builder) =>
            createVirtualView(
                name,
                payload.sql,
                payload.columns,
                builder,
                payload.name,
                payload.parameterValues,
            ),
    ),
    getExploreWarehouseConnectionUuid: vi.fn(
        async (): Promise<string | null> => null,
    ),
    getAllExploreSummaries: vi.fn(async () =>
        allExplores.map(exploreToSummaryWithAttributes),
    ),
    lockProcess: vi.fn((projectUuid, fun) => fun()),
    ...singleRouteProjectModelMethods,
    getWarehouseCredentialsForProject: vi.fn(
        async () => warehouseClientMock.credentials,
    ),
    getWarehouseClientFromCredentials: vi.fn(() => ({
        ...warehouseClientMock,
        runQuery: vi.fn(async () => resultsWith1Row),
    })),
    findExploreByTableName: vi.fn(async () => validExplore),
    getAllExploresFromCache: vi.fn(async () => ({})),
    getTableGroups: vi.fn(async () => ({})),
    getCachedExploreNames: vi.fn(async () => []),
    getWarehouseFromCache: vi.fn(async () => undefined),
    saveWarehouseToCache: vi.fn(async () => undefined),
    saveExploresToCache: vi.fn(async () => ({ cachedExploreUuids: [] })),
    saveExploreStreamToCache: vi.fn<ProjectModel['saveExploreStreamToCache']>(
        async (_projectUuid, explores) => {
            for await (const explore of explores) {
                expect(explore.name).toBeDefined();
            }
            return { cachedExploreUuids: [] };
        },
    ),
    setTableGroups: vi.fn(async () => undefined),
    updateProjectDefaults: vi.fn(async () => undefined),
    updateDefaultUserSpaces: vi.fn(async () => undefined),
    tryAcquireProjectLock: vi.fn(
        async (_projectUuid: string, onLockAcquired: () => Promise<void>) =>
            onLockAcquired(),
    ),
    createWithOptionalCredentials: vi.fn(
        async () => 'created-preview-project-uuid',
    ),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    deleteContentInBatches: vi.fn(async () => undefined),
    getResultsCacheSettings: vi.fn<ProjectModel['getResultsCacheSettings']>(
        async () => ({ cacheTtlSeconds: null }),
    ),
    updateResultsCacheSettings: vi.fn(async () => undefined),
    getEffectiveResultsCacheTtlSeconds: vi.fn(async () => 86400),
    deleteMergedManifest: vi.fn<ProjectModel['deleteMergedManifest']>(
        async () => undefined,
    ),
    upsertMergedManifest: vi.fn<ProjectModel['upsertMergedManifest']>(
        async () => undefined,
    ),
    getMergedManifest: vi.fn(async () => Buffer.from('merged-manifest')),
};
const organizationWarehouseCredentialsModel = {
    getByUuidWithSensitiveData:
        vi.fn<
            OrganizationWarehouseCredentialsModel['getByUuidWithSensitiveData']
        >(),
};
const preAggregateModel = {
    upsertPreAggregateDefinitions: vi.fn(),
    getPreAggregateDefinitionsForProject: vi.fn(async () => []),
    getPreAggregateDefinitionByDefinitionName: vi.fn(async () => undefined),
    getActiveMaterialization: vi.fn(async () => undefined),
};
const onboardingModel = {
    getByOrganizationUuid: vi.fn(async () => ({
        ranQueryAt: new Date(),
        shownSuccessAt: new Date(),
    })),
    update: vi.fn(async () => undefined),
    runInPlaygroundProvisioningLock: vi.fn(
        async (
            _organizationUuid: string,
            callback: (transaction: object) => Promise<unknown>,
        ) => callback({}),
    ),
    runInTrainingCopyLock: vi.fn(
        async (
            _lock: {
                userUuid: string;
                organizationUuid: string;
                maxConcurrentPerOrganization: number;
            },
            callback: () => Promise<unknown>,
        ) => callback(),
    ),
};
const savedChartModel = {
    getInfoForAvailableFilters: vi.fn(),
    getAllSpaces: vi.fn(async () => spacesWithSavedCharts),
    find: vi.fn(async () => [] as ChartSummary[]),
    get: vi.fn(),
    createVersion: vi.fn(),
    getCustomSqlProvenanceForChart: vi.fn(),
    findCustomSqlProvenance: vi.fn(async () => ({
        tableCalculations: [] as { sql: string; spaceUuid: string }[],
        customSqlDimensions: [] as {
            sql: string;
            table: string;
            spaceUuid: string;
        }[],
        additionalMetrics: [] as {
            sql: string;
            table: string;
            spaceUuid: string;
        }[],
    })),
    findInfoForDbtExposures: vi.fn<SavedChartModel['findInfoForDbtExposures']>(
        async () => [],
    ),
};
const dashboardModel = {
    savedChartExistsInDashboard: vi.fn(async () => false),
    findInfoForDbtExposures: vi.fn<DashboardModel['findInfoForDbtExposures']>(
        async () => [],
    ),
};
const jobModel = {
    get: vi.fn(async () => job),
    findActiveCreateProjectJob: vi.fn<JobModel['findActiveCreateProjectJob']>(),
    findStaleCreateProjectJobUuids: vi.fn<
        JobModel['findStaleCreateProjectJobUuids']
    >(async () => []),
    markCreateProjectJobsAsError: vi.fn<
        JobModel['markCreateProjectJobsAsError']
    >(async () => undefined),
    create: vi.fn<JobModel['create']>(async () => job),
    createProjectJobIfNoActive: vi.fn<JobModel['createProjectJobIfNoActive']>(
        async () => ({ isCreated: true, job }),
    ),
    update: vi.fn(async () => undefined),
    updateJobStep: vi.fn(async () => undefined),
    setPendingJobsToSkipped: vi.fn(async () => undefined),
    tryJobStep: vi.fn(
        async <T>(
            _jobUuid: string,
            _stepType: JobStepType,
            callback: () => Promise<T>,
        ) => callback(),
    ),
};
const spaceModel = {
    getDocumentCounts: vi.fn<SpaceModel['getDocumentCounts']>(async () => ({})),
    getAllSpaces: vi.fn(async () => spacesWithSavedCharts),
    find: vi.fn(async () => spacesWithSavedCharts),
};

const documentModel = {
    create: vi.fn(),
    getBySlug: vi.fn(),
};

const userAttributesModel = {
    getAttributeValuesForOrgMember: vi.fn(async () => ({})),
};

const emailModel = {
    getPrimaryEmailStatus: vi.fn(async (_userUuid: string) => ({
        isVerified: true,
    })),
};

const schedulerClient = {
    copyPreviewContent: vi.fn(),
    compileProject: vi.fn(),
    testAndCompileProject: vi.fn(async () => undefined),
    backfillDefaultUserSpaces: vi.fn(async () => ({
        jobId: 'backfill-job-1',
    })),
    createProjectWithCompile:
        vi.fn<SchedulerClient['createProjectWithCompile']>(),
    hasCreateProjectWithCompileJob: vi.fn<
        SchedulerClient['hasCreateProjectWithCompileJob']
    >(async () => false),
    deleteScheduledPreAggregateCronJobsForProject: vi.fn(async () => undefined),
    indexCatalog: vi.fn(async () => ({ jobId: 'catalog-job-1' })),
    materializePreAggregate: vi.fn(async () => ({ jobId: 'job-1' })),
    schedulePreAggregateCronJobs: vi.fn(async () => []),
    generateValidation: vi.fn(async () => undefined),
};

const catalogModel = {
    getCatalogItemsWithTags: vi.fn(async () => []),
    getCatalogItemsWithIcons: vi.fn(async () => []),
    getAllMetricsTreeEdges: vi.fn(async () => []),
    getAllMetricsTreeNodes: vi.fn(async () => []),
};

const tagsModel = {
    replaceYamlTags: vi.fn(async () => ({ yamlTagsToCreateOrUpdate: [] })),
};

const projectCompileLogModel = {
    insert: vi.fn(async () => undefined),
};

const getMockedAiAgentService = () => {
    const provisionDefaultAgent =
        vi.fn<AiAgentService['provisionDefaultAgent']>();
    return {
        provisionDefaultAgent,
        getAiAgentService: () =>
            ({ provisionDefaultAgent }) as unknown as AiAgentService,
    };
};

const getMockedProjectService = (
    lightdashConfig: LightdashConfig,
    overrides: Partial<
        Pick<
            ConstructorParameters<typeof ProjectService>[0],
            | 'jobModel'
            | 'projectModel'
            | 'spacePermissionService'
            | 'spaceModel'
            | 'provisionPlaygroundProject'
            | 'provisionTrainingProject'
            | 'seedTrainingCopyEnterpriseContent'
            | 'downloadFileModel'
            | 'getAiAgentService'
            | 'getAppGenerateService'
            | 'organizationWarehouseCredentialsModel'
            | 'getDataAppCustomSqlProvenance'
            | 'featureFlagModel'
            | 'projectDbtSourcesModel'
            | 'githubAppInstallationsModel'
        >
    > = {},
) =>
    new ProjectService({
        lightdashConfig,
        analytics: analyticsMock,
        projectModel:
            overrides.projectModel ?? (projectModel as unknown as ProjectModel),
        projectDbtSourcesModel:
            overrides.projectDbtSourcesModel ??
            ({
                copySources: vi.fn(async () => undefined),
            } as unknown as ProjectDbtSourcesModel),
        preAggregateModel: preAggregateModel as unknown as PreAggregateModel,
        onboardingModel: onboardingModel as unknown as OnboardingModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        jobModel: overrides.jobModel ?? (jobModel as unknown as JobModel),
        emailClient: new EmailClient({
            lightdashConfig: lightdashConfigWithNoSMTP,
        }),
        spaceModel:
            overrides.spaceModel ?? (spaceModel as unknown as SpaceModel),
        documentModel: documentModel as unknown as DocumentModel,
        sshKeyPairModel: {} as SshKeyPairModel,
        userAttributesModel:
            userAttributesModel as unknown as UserAttributesModel,
        s3CacheClient: {} as S3CacheClient,
        analyticsModel: {} as AnalyticsModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        userWarehouseCredentialsModel: {
            findForProjectWithSecrets: vi.fn(async () => undefined),
        } as unknown as UserWarehouseCredentialsModel,
        warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
        warehouseConnectionModel: {} as WarehouseConnectionModel,
        warehouseConnectionCompileModel: {} as WarehouseConnectionCompileModel,
        warehouseConnectionTablesModel: {} as WarehouseConnectionTablesModel,
        warehouseConnectionIdentityModel:
            {} as WarehouseConnectionIdentityModel,
        emailModel: emailModel as unknown as EmailModel,
        schedulerClient: schedulerClient as unknown as SchedulerClient,
        downloadFileModel:
            overrides.downloadFileModel ?? ({} as unknown as DownloadFileModel),
        fileStorageClient: {} as FileStorageClient,
        groupsModel: {} as GroupsModel,
        tagsModel: tagsModel as unknown as TagsModel,
        catalogModel: catalogModel as unknown as CatalogModel,
        contentModel: {} as ContentModel,
        encryptionUtil: {
            encrypt: vi.fn(() => Buffer.from('encrypted-project-data')),
        } as unknown as EncryptionUtil,
        userModel: {
            invalidateSessionUserCache: vi.fn(),
            findSessionUserByUUID: vi.fn(async () => user),
        } as unknown as UserModel,
        userOAuthGrantsModel: {} as UserOAuthGrantsModel,
        aiAccessService: {
            resolvePlan: vi.fn(async () => null),
        } as unknown as AiAccessService,
        featureFlagModel:
            overrides.featureFlagModel ??
            ({
                // Mirror production behaviour: ResultsCacheEnabled resolves from
                // the env-derived lightdashConfig.results.cacheEnabled when there
                // is no DB row.
                get: vi.fn(
                    async ({ featureFlagId }: { featureFlagId: string }) => {
                        if (
                            featureFlagId === FeatureFlags.ResultsCacheEnabled
                        ) {
                            return {
                                id: featureFlagId,
                                enabled: lightdashConfig.results.cacheEnabled,
                            };
                        }
                        return { id: featureFlagId, enabled: false };
                    },
                ),
            } as unknown as FeatureFlagModel),
        projectParametersModel: {
            find: vi.fn(async () => []),
            replace: vi.fn(async () => undefined),
        } as unknown as ProjectParametersModel,
        organizationWarehouseCredentialsModel:
            overrides.organizationWarehouseCredentialsModel ??
            (organizationWarehouseCredentialsModel as unknown as OrganizationWarehouseCredentialsModel),
        organizationModel: {} as unknown as OrganizationModel,
        githubAppInstallationsModel: overrides.githubAppInstallationsModel,
        projectCompileLogModel:
            projectCompileLogModel as unknown as ProjectCompileLogModel,
        adminNotificationService: {
            notifyConnectionSettingsChange: vi.fn(async () => undefined),
        } as unknown as AdminNotificationService,
        permissionsService: new PermissionsService({
            dashboardModel: dashboardModel as unknown as DashboardModel,
        }),
        spacePermissionService:
            overrides.spacePermissionService ?? ({} as SpacePermissionService),
        directAccessService: {
            findSharedWithMeUuids: vi.fn().mockResolvedValue({
                dashboard: [],
                chart: [],
                sqlChart: [],
                app: [],
            }),
        } as never,
        provisionPlaygroundProject: overrides.provisionPlaygroundProject,
        provisionTrainingProject: overrides.provisionTrainingProject,
        seedTrainingCopyEnterpriseContent:
            overrides.seedTrainingCopyEnterpriseContent,
        getAiAgentService: overrides.getAiAgentService,
        getAppGenerateService: overrides.getAppGenerateService,
        getDataAppCustomSqlProvenance:
            overrides.getDataAppCustomSqlProvenance ??
            (async () => ({
                tableCalculations: new Set(),
                customDimensions: new Set(),
                additionalMetrics: new Set(),
            })),
        organizationSettingsModel: {
            get: vi.fn(async () => ({
                queryLimit: null,
                csvCellsLimit: null,
            })),
        } as unknown as OrganizationSettingsModel,
    });

const account = buildAccount({
    accountType: 'session',
    userType: 'registered',
});
const developerAccount = {
    ...account,
    user: {
        ...account.user,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: ['update', 'view'] },
            { subject: 'Job', action: ['view'] },
            { subject: 'SqlRunner', action: ['manage'] },
            { subject: 'Explore', action: ['manage'] },
            { subject: 'PreAggregation', action: ['manage'] },
        ]),
    },
} as typeof account;
const viewerAccount = {
    ...account,
    user: {
        ...account.user,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: 'view' },
        ]),
    },
} as typeof account;

type RefreshForTest = <T>(
    user: Pick<SessionUser, 'userUuid'>,
    projectUuid: string,
    requestMethod: RequestMethod,
    jobUuid: string | undefined,
    consume: (prepared: {
        exploreStream: AsyncIterable<Explore | ExploreError>;
        lightdashProjectConfig: LightdashProjectConfig;
        projectContext: undefined;
    }) => Promise<T>,
) => Promise<T>;

describe('ProjectService', () => {
    const { projectUuid } = defaultProject;
    const service = getMockedProjectService(lightdashConfigMock);

    describe('Document counts in legacy Space listing', () => {
        it.each([
            { enabled: false, canViewDocument: true, expectedCount: 0 },
            { enabled: true, canViewDocument: false, expectedCount: 0 },
            { enabled: true, canViewDocument: true, expectedCount: 2 },
        ])(
            'flag=$enabled Document permission=$canViewDocument returns $expectedCount',
            async ({ enabled, canViewDocument, expectedCount }) => {
                const countUser = {
                    ...user,
                    ability: defineUserAbility(
                        {
                            userUuid: user.userUuid,
                            organizationUuid: projectSummary.organizationUuid,
                            role: OrganizationMemberRole.MEMBER,
                        },
                        [],
                    ),
                };
                countUser.ability.update([
                    { action: 'view', subject: 'Project' },
                    { action: 'view', subject: 'Space' },
                    ...(canViewDocument
                        ? [
                              {
                                  action: 'view' as const,
                                  subject: 'Document' as const,
                              },
                          ]
                        : []),
                ]);
                const listedSpace = spacesWithSavedCharts[0];
                const getDocumentCounts = vi
                    .spyOn(spaceModel, 'getDocumentCounts')
                    .mockResolvedValueOnce(
                        expectedCount ? { [listedSpace.uuid]: 2 } : {},
                    );
                getDocumentCounts.mockClear();
                const countService = getMockedProjectService(
                    lightdashConfigMock,
                    {
                        featureFlagModel: {
                            get: vi.fn().mockResolvedValue({ enabled }),
                        } as unknown as FeatureFlagModel,
                        spacePermissionService: {
                            resolveAccessBatch: vi.fn().mockResolvedValue([
                                {
                                    target: {
                                        type: 'space',
                                        spaceUuid: listedSpace.uuid,
                                    },
                                    context: {
                                        organizationUuid:
                                            projectSummary.organizationUuid,
                                        projectUuid,
                                        inheritsFromOrgOrProject: true,
                                        access: [],
                                    },
                                },
                            ]),
                            getDirectAccessUserUuids: vi
                                .fn()
                                .mockResolvedValue({}),
                        } as unknown as SpacePermissionService,
                    },
                );
                const result = await countService.getSpaces(
                    countUser,
                    projectUuid,
                );
                expect(result[0].documentCount).toBe(expectedCount);
                if (!enabled) {
                    expect(getDocumentCounts).not.toHaveBeenCalled();
                } else {
                    expect(getDocumentCounts).toHaveBeenCalledWith(
                        canViewDocument ? [listedSpace.uuid] : [],
                    );
                }
                getDocumentCounts.mockReset();
            },
        );
    });

    describe('Learn flag guards', () => {
        const learnUser: SessionUser = {
            ...user,
            organizationUuid: 'organization-uuid',
            organizationName: 'Organization',
            organizationCreatedAt: new Date('2026-09-01'),
        };

        test('provisions training for an org admin when Learn is enabled', async () => {
            const provisionTrainingProject = vi.fn(async () => ({
                projectUuid: 'training-project',
                created: true,
            }));
            const learnService = getMockedProjectService(lightdashConfigMock, {
                featureFlagModel: {
                    get: vi.fn(async () => ({
                        id: FeatureFlags.EnableLearn,
                        enabled: true,
                    })),
                } as unknown as FeatureFlagModel,
                provisionTrainingProject,
            });
            const adminUser = {
                ...learnUser,
                ability: new Ability<PossibleAbilities>([
                    { action: 'manage', subject: 'Organization' },
                    { action: 'view', subject: 'Learn' },
                ]),
            };
            await expect(learnService.enableLearn(adminUser)).resolves.toEqual({
                projectUuid: 'training-project',
                created: true,
            });
            expect(provisionTrainingProject).toHaveBeenCalledExactlyOnceWith({
                user: adminUser,
                projectService: learnService,
            });
        });
        test.each(['enable', 'copy', 'delete'] as const)(
            'blocks %s when the requesting org has Learn disabled',
            async (operation) => {
                const get = vi.fn(async () => ({
                    id: FeatureFlags.EnableLearn,
                    enabled: false,
                }));
                const provisionTrainingProject = vi.fn();
                const learnService = getMockedProjectService(
                    lightdashConfigMock,
                    {
                        featureFlagModel: {
                            get,
                        } as unknown as FeatureFlagModel,
                        provisionTrainingProject,
                    },
                );
                const operations = {
                    enable: () => learnService.enableLearn(learnUser),
                    copy: () =>
                        learnService.createTrainingPreview(
                            learnUser,
                            'training-project',
                        ),
                    delete: () =>
                        learnService.deleteTrainingPreviews(
                            learnUser,
                            'training-project',
                        ),
                };
                await expect(operations[operation]()).rejects.toThrow(
                    'Learn is not enabled for this organization',
                );
                expect(get).toHaveBeenCalledExactlyOnceWith({
                    user: learnUser,
                    featureFlagId: FeatureFlags.EnableLearn,
                });
                expect(provisionTrainingProject).not.toHaveBeenCalled();
            },
        );

        describe('sample documents in a new training copy', () => {
            const withDocumentsFlag = (
                enabled: boolean,
                seedTrainingCopyEnterpriseContent?: NonNullable<
                    Parameters<typeof getMockedProjectService>[1]
                >['seedTrainingCopyEnterpriseContent'],
            ) =>
                getMockedProjectService(lightdashConfigMock, {
                    seedTrainingCopyEnterpriseContent,
                    featureFlagModel: {
                        get: vi.fn(async ({ featureFlagId }) => ({
                            id: featureFlagId,
                            enabled:
                                featureFlagId === FeatureFlags.Documents
                                    ? enabled
                                    : true,
                        })),
                    } as unknown as FeatureFlagModel,
                });
            const seed = (learnService: ProjectService) =>
                // eslint-disable-next-line @typescript-eslint/dot-notation
                learnService['seedSampleDocumentsInCopy'](
                    learnUser,
                    'copy',
                    'creator',
                );

            beforeEach(() => {
                documentModel.create.mockReset();
                documentModel.getBySlug.mockReset();
                documentModel.getBySlug.mockRejectedValue(
                    new NotFoundError('Document not found'),
                );
                spaceModel.find.mockClear();
            });

            test('creates the bundle sample in the copy’s seeded space, credited to whoever enabled Learn', async () => {
                spaceModel.find.mockResolvedValueOnce([
                    { uuid: 'training-space' },
                ] as never);
                await seed(withDocumentsFlag(true));
                expect(spaceModel.find).toHaveBeenCalledWith({
                    projectUuid: 'copy',
                    path: TRAINING_SPACE.path,
                });
                expect(documentModel.create).toHaveBeenCalledExactlyOnceWith(
                    expect.objectContaining({
                        projectUuid: 'copy',
                        spaceUuid: 'training-space',
                        name: 'Monthly orders review',
                        createdByUserUuid: 'creator',
                    }),
                );
            });

            test('adds nothing while documents are off', async () => {
                await seed(withDocumentsFlag(false));
                expect(spaceModel.find).not.toHaveBeenCalled();
                expect(documentModel.create).not.toHaveBeenCalled();
            });

            test('adds nothing when the copy has no seeded space', async () => {
                spaceModel.find.mockResolvedValueOnce([]);
                await seed(withDocumentsFlag(true));
                expect(documentModel.create).not.toHaveBeenCalled();
            });

            describe('with the Enterprise samples', () => {
                const seedAll = (learnService: ProjectService) =>
                    // eslint-disable-next-line @typescript-eslint/dot-notation
                    learnService['seedSamplesInCopy'](
                        learnUser,
                        'organization-uuid',
                        'copy',
                        'creator',
                    );
                const reported = vi.mocked(Sentry.captureException);

                beforeEach(() => {
                    reported.mockClear();
                });

                test('seeds the knowledge document for the copy, credited the same way', async () => {
                    const enterprise = vi.fn(async () => undefined);
                    spaceModel.find.mockResolvedValueOnce([
                        { uuid: 'training-space' },
                    ] as never);
                    await seedAll(withDocumentsFlag(true, enterprise));
                    expect(documentModel.create).toHaveBeenCalledTimes(1);
                    expect(enterprise).toHaveBeenCalledExactlyOnceWith({
                        organizationUuid: 'organization-uuid',
                        projectUuid: 'copy',
                        createdByUserUuid: 'creator',
                    });
                    expect(reported).not.toHaveBeenCalled();
                });

                test('a document sample that fails is reported and does not skip the knowledge document', async () => {
                    const enterprise = vi.fn(async () => undefined);
                    const failure = new Error('no documents table');
                    spaceModel.find.mockRejectedValueOnce(failure);
                    await expect(
                        seedAll(withDocumentsFlag(true, enterprise)),
                    ).resolves.toBeUndefined();
                    expect(enterprise).toHaveBeenCalledTimes(1);
                    expect(reported).toHaveBeenCalledExactlyOnceWith(failure);
                });

                test('a knowledge document that fails is reported and still hands over the copy', async () => {
                    const failure = new Error('quota lookup failed');
                    const enterprise = vi.fn(async () => {
                        throw failure;
                    });
                    await expect(
                        seedAll(withDocumentsFlag(false, enterprise)),
                    ).resolves.toBeUndefined();
                    expect(reported).toHaveBeenCalledExactlyOnceWith(failure);
                });

                test('does nothing more on an instance without the Enterprise seed', async () => {
                    await expect(
                        seedAll(withDocumentsFlag(false)),
                    ).resolves.toBeUndefined();
                    expect(reported).not.toHaveBeenCalled();
                });
            });
        });

        test('forbids creating a training copy without Learn access', async () => {
            const learnService = getMockedProjectService(lightdashConfigMock, {
                featureFlagModel: {
                    get: vi.fn(async () => ({ enabled: true })),
                } as unknown as FeatureFlagModel,
            });
            await expect(
                learnService.createTrainingPreview(
                    {
                        ...learnUser,
                        ability: new Ability<PossibleAbilities>([]),
                    },
                    'training-project',
                ),
            ).rejects.toThrow(
                new ForbiddenError('You do not have access to Learn'),
            );
        });

        test('still requires org admin permissions when Learn is enabled', async () => {
            const provisionTrainingProject = vi.fn();
            const learnService = getMockedProjectService(lightdashConfigMock, {
                featureFlagModel: {
                    get: vi.fn(async () => ({
                        id: FeatureFlags.EnableLearn,
                        enabled: true,
                    })),
                } as unknown as FeatureFlagModel,
                provisionTrainingProject,
            });
            await expect(
                learnService.enableLearn({
                    ...learnUser,
                    ability: new Ability<PossibleAbilities>([
                        { action: 'view', subject: 'Learn' },
                    ]),
                }),
            ).rejects.toThrow('Only an organization admin can enable Learn');
            expect(provisionTrainingProject).not.toHaveBeenCalled();
        });
    });

    describe('ensureAnalyticsProject', () => {
        const testAnalyticsStorage = vi.fn();
        const admin = {
            ...user,
            organizationUuid: 'analytics-org',
            organizationName: 'Organization',
            organizationCreatedAt: new Date(),
            ability: new Ability<PossibleAbilities>([
                {
                    subject: 'Organization',
                    action: 'manage',
                    conditions: { organizationUuid: 'analytics-org' },
                },
            ]),
        };
        beforeEach(() => {
            testAnalyticsStorage.mockResolvedValue(undefined);
            vi.spyOn(
                analyticsClient,
                'createAnalyticsClient',
            ).mockResolvedValue({
                test: testAnalyticsStorage,
            } as unknown as Awaited<
                ReturnType<typeof analyticsClient.createAnalyticsClient>
            >);
            vi.spyOn(
                analyticsClient,
                'assertAnalyticsProjectEnabled',
            ).mockResolvedValue(undefined);
        });
        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllEnvs();
        });

        test('does not create a project when storage authentication fails', async () => {
            testAnalyticsStorage.mockRejectedValueOnce(
                new Error('Storage unavailable'),
            );
            await expect(service.ensureAnalyticsProject(admin)).rejects.toThrow(
                'Storage unavailable',
            );
            expect(
                projectModel.runInAnalyticsProvisioningLock,
            ).not.toHaveBeenCalled();
        });

        test('reuses the backend marker, refreshes both models, and returns the slug', async () => {
            projectModel.getAllByOrganizationUuid.mockResolvedValueOnce([
                {
                    ...defaultProject,
                    projectUuid: 'existing',
                    provisioningSource: 'analytics',
                },
            ]);
            projectModel.getSummary.mockResolvedValueOnce({
                ...projectSummary,
                slug: 'lightdash-analytics-2',
            });
            const result = await service.ensureAnalyticsProject(admin);
            expect(result).toEqual({
                projectUuid: 'existing',
                url: '/projects/lightdash-analytics-2/tables',
                created: false,
            });
            expect(
                projectModel.runInAnalyticsProvisioningLock,
            ).toHaveBeenCalledWith('analytics-org', expect.any(Function));
            expect(projectModel.saveExploresToCache).toHaveBeenCalledWith(
                'existing',
                expect.arrayContaining([
                    expect.objectContaining({ name: 'query_events' }),
                    expect.objectContaining({ name: 'ai_usage' }),
                    expect.objectContaining({ name: 'data_app_events' }),
                ]),
                true,
            );
            expect(
                projectModel.createWithOptionalCredentials,
            ).not.toHaveBeenCalled();
        });

        test('creates a managed analytics project with the standard project type', async () => {
            projectModel.getAllByOrganizationUuid.mockResolvedValueOnce([]);
            const create = vi
                .spyOn(service, 'createWithoutCompile')
                .mockResolvedValueOnce({
                    project: { projectUuid: 'new' },
                } as Awaited<
                    ReturnType<ProjectService['createWithoutCompile']>
                >);
            const result = await service.ensureAnalyticsProject(admin);
            expect(result.created).toBe(true);
            expect(create).toHaveBeenCalledWith(
                admin,
                expect.objectContaining({
                    name: 'Lightdash analytics',
                    type: ProjectType.DEFAULT,
                    warehouseConnection: expect.objectContaining({
                        connectionType: DuckdbConnectionType.ANALYTICS,
                    }),
                }),
                RequestMethod.BACKEND,
                { source: 'analytics' },
            );
        });

        test('rejects non-admins before provisioning', async () => {
            await expect(
                service.ensureAnalyticsProject({
                    ...admin,
                    ability: new Ability<PossibleAbilities>([]),
                }),
            ).rejects.toThrow(/administration/);
            expect(
                projectModel.runInAnalyticsProvisioningLock,
            ).not.toHaveBeenCalled();
        });

        test('rejects another organization even with an unrestricted ability', async () => {
            await expect(
                service.assertAnalyticsProjectAccess(
                    {
                        ...admin,
                        ability: new Ability<PossibleAbilities>([
                            { subject: 'all', action: 'manage' },
                        ]),
                    },
                    {
                        provisioningSource: 'analytics',
                        organizationUuid: 'other-org',
                    },
                ),
            ).rejects.toThrow(/another organization/);
        });

        test('stops before provisioning when the feature gate rejects access', async () => {
            vi.mocked(
                analyticsClient.assertAnalyticsProjectEnabled,
            ).mockImplementation(() => {
                throw new ForbiddenError('disabled');
            });
            await expect(service.ensureAnalyticsProject(admin)).rejects.toThrow(
                'disabled',
            );
            expect(
                projectModel.runInAnalyticsProvisioningLock,
            ).not.toHaveBeenCalled();
        });

        test.each([
            { enabled: false, disabled: false, environment: 'development' },
            { enabled: false, disabled: true, environment: 'development' },
            { enabled: false, disabled: false, environment: 'production' },
            { enabled: false, disabled: true, environment: 'production' },
        ])(
            'blocks creation and refresh in $environment when enabled=$enabled, disabled=$disabled',
            async ({ enabled, disabled, environment }) => {
                vi.mocked(
                    analyticsClient.assertAnalyticsProjectEnabled,
                ).mockRestore();
                vi.stubEnv('NODE_ENV', environment);
                vi.spyOn(
                    lightdashConfigMock.enabledFeatureFlags,
                    'has',
                ).mockReturnValue(enabled);
                vi.spyOn(
                    lightdashConfigMock.disabledFeatureFlags,
                    'has',
                ).mockReturnValue(disabled);

                await expect(
                    service.ensureAnalyticsProject(admin),
                ).rejects.toThrow(/not enabled/);
                await expect(
                    service.assertAnalyticsProjectAccess(admin, {
                        organizationUuid: 'analytics-org',
                        provisioningSource: 'analytics',
                    }),
                ).rejects.toThrow(/not enabled/);

                expect(
                    analyticsClient.createAnalyticsClient,
                ).not.toHaveBeenCalled();
                expect(testAnalyticsStorage).not.toHaveBeenCalled();
                expect(
                    projectModel.runInAnalyticsProvisioningLock,
                ).not.toHaveBeenCalled();
                expect(
                    projectModel.getAllByOrganizationUuid,
                ).not.toHaveBeenCalled();
                expect(
                    projectModel.createWithOptionalCredentials,
                ).not.toHaveBeenCalled();
                expect(projectModel.saveExploresToCache).not.toHaveBeenCalled();
            },
        );

        test('allows an authorized production org enabled through Console without ENV and binds its storage source', async () => {
            projectModel.getAllByOrganizationUuid.mockResolvedValueOnce([
                { ...defaultProject, provisioningSource: 'analytics' },
            ]);
            vi.mocked(
                analyticsClient.assertAnalyticsProjectEnabled,
            ).mockRestore();
            vi.stubEnv('NODE_ENV', 'production');
            vi.spyOn(
                lightdashConfigMock.enabledFeatureFlags,
                'has',
            ).mockReturnValue(false);
            vi.spyOn(
                lightdashConfigMock.disabledFeatureFlags,
                'has',
            ).mockReturnValue(false);
            const flags = {
                get: vi.fn().mockResolvedValue({
                    id: FeatureFlags.AnalyticsProject,
                    enabled: true,
                }),
            } as unknown as FeatureFlagModel;
            const enabledService = getMockedProjectService(
                lightdashConfigMock,
                {
                    featureFlagModel: flags,
                },
            );
            await enabledService.ensureAnalyticsProject(admin);
            expect(flags.get).toHaveBeenCalledWith({
                featureFlagId: FeatureFlags.AnalyticsProject,
                user: { organizationUuid: admin.organizationUuid },
            });
            expect(analyticsClient.createAnalyticsClient).toHaveBeenCalledWith(
                admin.organizationUuid,
                flags,
            );
        });

        test('does not apply the analytics gate to ordinary projects', async () => {
            await expect(
                service.assertAnalyticsProjectAccess(admin, {
                    organizationUuid: 'analytics-org',
                    provisioningSource: null,
                }),
            ).resolves.toBeUndefined();
            expect(
                analyticsClient.assertAnalyticsProjectEnabled,
            ).not.toHaveBeenCalled();
        });
    });

    describe('MotherDuck instance cache enablement', () => {
        test.each([
            {
                name: 'fails closed for a project on Lightdash Cloud when the allowlist is empty',
                lightdashCloudInstance: 'cloud-instance',
                projectUuids: [] as string[],
                targetProjectUuid: projectUuid,
                expected: false,
            },
            {
                name: 'fails closed for every other project on Lightdash Cloud when the allowlist is empty',
                lightdashCloudInstance: 'cloud-instance',
                projectUuids: [] as string[],
                targetProjectUuid: 'another-project',
                expected: false,
            },
            {
                name: 'enables a named project on Lightdash Cloud when the allowlist is populated',
                lightdashCloudInstance: 'cloud-instance',
                projectUuids: [projectUuid],
                targetProjectUuid: projectUuid,
                expected: true,
            },
            {
                name: 'keeps an unnamed project disabled on Lightdash Cloud when the allowlist is populated',
                lightdashCloudInstance: 'cloud-instance',
                projectUuids: [projectUuid],
                targetProjectUuid: 'another-project',
                expected: false,
            },
            {
                name: 'enables a project on self-hosted when the allowlist is empty',
                lightdashCloudInstance: undefined,
                projectUuids: [] as string[],
                targetProjectUuid: projectUuid,
                expected: true,
            },
            {
                name: 'enables every other project on self-hosted when the allowlist is empty',
                lightdashCloudInstance: undefined,
                projectUuids: [] as string[],
                targetProjectUuid: 'another-project',
                expected: true,
            },
            {
                name: 'enables a named project on self-hosted when the allowlist is populated',
                lightdashCloudInstance: undefined,
                projectUuids: [projectUuid],
                targetProjectUuid: projectUuid,
                expected: true,
            },
            {
                name: 'keeps an unnamed project disabled on self-hosted when the allowlist is populated',
                lightdashCloudInstance: undefined,
                projectUuids: [projectUuid],
                targetProjectUuid: 'another-project',
                expected: false,
            },
        ])(
            '$name',
            async ({
                lightdashCloudInstance,
                projectUuids,
                targetProjectUuid,
                expected,
            }) => {
                const configuredService = getMockedProjectService({
                    ...lightdashConfigMock,
                    lightdashCloudInstance,
                    motherduckInstanceCache: {
                        ...lightdashConfigMock.motherduckInstanceCache,
                        enabled: true,
                        projectUuids,
                    },
                });
                vi.mocked(
                    projectModel.getWarehouseClientFromCredentials,
                ).mockClear();

                await configuredService.warehouseClientFactory.acquireUnscoped(
                    targetProjectUuid,
                    warehouseClientMock.credentials,
                );

                expect(
                    vi.mocked(projectModel.getWarehouseClientFromCredentials),
                ).toHaveBeenCalledWith(expect.anything(), {
                    agentSession: false,
                    enableInstanceCache: expected,
                    projectUuid: targetProjectUuid,
                    logger: expect.anything(),
                });
            },
        );

        it('keeps the cache disabled when the feature flag is off', async () => {
            const configuredService = getMockedProjectService({
                ...lightdashConfigMock,
                motherduckInstanceCache: {
                    ...lightdashConfigMock.motherduckInstanceCache,
                    enabled: false,
                    projectUuids: [projectUuid],
                },
            });
            vi.mocked(
                projectModel.getWarehouseClientFromCredentials,
            ).mockClear();

            await configuredService.warehouseClientFactory.acquireUnscoped(
                projectUuid,
                warehouseClientMock.credentials,
            );

            expect(
                vi.mocked(projectModel.getWarehouseClientFromCredentials),
            ).toHaveBeenCalledWith(expect.anything(), {
                agentSession: false,
                enableInstanceCache: false,
                projectUuid,
                logger: expect.anything(),
            });
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getProject', () => {
        const embedAccountFor = (content: EmbedContent) =>
            fromJwt({
                decodedToken: {
                    content:
                        content.type === 'chart'
                            ? {
                                  type: 'chart',
                                  contentId: content.chartUuids[0],
                              }
                            : { type: 'dashboard', dashboardUuid: 'dashboard' },
                },
                content,
                embed: {
                    organization: {
                        organizationUuid:
                            projectWithSensitiveFields.organizationUuid,
                        name: 'Test organization',
                    },
                    projectUuid,
                    encodedSecret: 'test-secret',
                    dashboardUuids: ['dashboard'],
                    allowAllDashboards: false,
                    chartUuids: ['chart'],
                    allowAllCharts: false,
                    appUuids: [],
                    allowAllApps: false,
                    createdAt: '2026-01-01',
                    user: {
                        userUuid: 'user',
                        firstName: 'Test',
                        lastName: 'User',
                    },
                },
                source: 'test-token',
                userAttributes: {
                    userAttributes: {},
                    intrinsicUserAttributes: {},
                },
            });
        const chartAccount = embedAccountFor({
            type: 'chart',
            chartUuids: ['chart'],
            explores: ['orders'],
        });
        const projectWithEnvironment: Project = {
            ...projectWithSensitiveFields,
            dbtConnection: {
                type: DbtProjectType.DBT,
                environment: [
                    { key: 'DBT_ENV_SECRET_PASSWORD', value: 'super-secret' },
                ],
            },
        };

        test('does not expose dbt environment variables to project viewers', async () => {
            projectModel.get.mockResolvedValueOnce(projectWithEnvironment);

            const result = await service.getProject(projectUuid, viewerAccount);

            expect(result.dbtConnection).not.toHaveProperty('environment');
        });

        test('returns dbt environment variables to users who can update the project', async () => {
            projectModel.get.mockResolvedValueOnce(projectWithEnvironment);

            const result = await service.getProject(
                projectUuid,
                developerAccount,
            );

            expect(result.dbtConnection).toHaveProperty('environment', [
                { key: 'DBT_ENV_SECRET_PASSWORD', value: 'super-secret' },
            ]);
        });

        test.each([
            ['chart', chartAccount],
            [
                'dashboard',
                embedAccountFor({
                    type: 'dashboard',
                    dashboardUuid: 'dashboard',
                    chartUuids: [],
                    explores: [],
                }),
            ],
        ])(
            'returns only render settings to %s embed tokens',
            async (_type, embedAccount) => {
                projectModel.get.mockResolvedValueOnce({
                    ...projectWithEnvironment,
                    warehouseConnection: {
                        type: WarehouseTypes.SNOWFLAKE,
                        account: 'acme-prod.eu-west-1',
                        role: 'ANALYTICS_READER',
                        database: 'PROD',
                        warehouse: 'WH_SMALL',
                        schema: 'REPORTING',
                        startOfWeek: WeekDay.SUNDAY,
                    },
                });
                const result = await service.getProject(
                    projectUuid,
                    embedAccount,
                );

                expect(result.warehouseConnection).toEqual({
                    type: WarehouseTypes.SNOWFLAKE,
                    startOfWeek: WeekDay.SUNDAY,
                });
                expect(result.dbtConnection).toEqual({
                    type: DbtProjectType.NONE,
                });
                expect(result.createdByUserUuid).toBeNull();
            },
        );

        test.each([
            { projectUuid: 'another-project' },
            { organizationUuid: 'another-organization' },
        ])(
            'rejects chart embeds outside their target: %j',
            async (overrides) => {
                const project = { ...projectWithEnvironment, ...overrides };
                projectModel.get.mockResolvedValueOnce(project);
                await expect(
                    service.getProject(project.projectUuid, chartAccount),
                ).rejects.toThrow(ForbiddenError);
            },
        );

        test('keeps chart token query permissions restricted to its explore', () => {
            const { ability } = chartAccount.user;
            for (const type of ['Project', 'Explore'] as const) {
                for (const [exploreName, allowed] of [
                    ['orders', true],
                    ['customers', false],
                ] as const) {
                    expect(
                        ability.can(
                            'view',
                            subject(type, {
                                organizationUuid:
                                    projectWithSensitiveFields.organizationUuid,
                                projectUuid,
                                exploreNames: [exploreName],
                            }),
                        ),
                    ).toBe(allowed);
                }
            }
        });

        test('does not grant chart embeds project-wide explore or table listing', async () => {
            await expect(
                service.getAllExploresSummary(chartAccount, projectUuid, false),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.getTablesConfiguration(chartAccount, projectUuid),
            ).rejects.toThrow(ForbiddenError);
        });

        test('does not bypass a missing Project grant', async () => {
            projectModel.get.mockResolvedValueOnce(projectWithEnvironment);
            await expect(
                service.getProject(projectUuid, {
                    ...chartAccount,
                    user: {
                        ...chartAccount.user,
                        ability: new Ability<PossibleAbilities>([]),
                    },
                }),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('updateProjectResultsCacheSettings', () => {
        const cachingService = getMockedProjectService({
            ...lightdashConfigMock,
            results: { ...lightdashConfigMock.results, cacheEnabled: true },
        });

        beforeEach(() => {
            projectModel.updateResultsCacheSettings.mockClear();
        });

        test('rejects updates while results caching is disabled', async () => {
            await expect(
                service.updateProjectResultsCacheSettings(user, projectUuid, {
                    cacheTtlSeconds: 1800,
                }),
            ).rejects.toThrow(ForbiddenError);
            expect(
                projectModel.updateResultsCacheSettings,
            ).not.toHaveBeenCalled();
        });

        test('rejects a TTL below one minute', async () => {
            await expect(
                cachingService.updateProjectResultsCacheSettings(
                    user,
                    projectUuid,
                    {
                        cacheTtlSeconds: 59,
                    },
                ),
            ).rejects.toThrow(ParameterError);
            expect(
                projectModel.updateResultsCacheSettings,
            ).not.toHaveBeenCalled();
        });

        test('rejects a TTL above thirty days', async () => {
            await expect(
                cachingService.updateProjectResultsCacheSettings(
                    user,
                    projectUuid,
                    {
                        cacheTtlSeconds: 30 * 24 * 60 * 60 + 1,
                    },
                ),
            ).rejects.toThrow(ParameterError);
            expect(
                projectModel.updateResultsCacheSettings,
            ).not.toHaveBeenCalled();
        });

        test('rejects a non-integer TTL', async () => {
            await expect(
                cachingService.updateProjectResultsCacheSettings(
                    user,
                    projectUuid,
                    {
                        cacheTtlSeconds: 90.5,
                    },
                ),
            ).rejects.toThrow(ParameterError);
            expect(
                projectModel.updateResultsCacheSettings,
            ).not.toHaveBeenCalled();
        });

        test('persists a TTL within bounds', async () => {
            const result =
                await cachingService.updateProjectResultsCacheSettings(
                    user,
                    projectUuid,
                    { cacheTtlSeconds: 1800 },
                );

            expect(
                projectModel.updateResultsCacheSettings,
            ).toHaveBeenCalledWith(projectUuid, { cacheTtlSeconds: 1800 });
            expect(result).toEqual({
                projectUuid,
                cacheTtlSeconds: 1800,
                instanceDefaultTtlSeconds:
                    lightdashConfigMock.results.cacheStateTimeSeconds,
            });
        });

        test('persists null to fall back to the instance default', async () => {
            const result =
                await cachingService.updateProjectResultsCacheSettings(
                    user,
                    projectUuid,
                    { cacheTtlSeconds: null },
                );

            expect(
                projectModel.updateResultsCacheSettings,
            ).toHaveBeenCalledWith(projectUuid, { cacheTtlSeconds: null });
            expect(result).toEqual({
                projectUuid,
                cacheTtlSeconds: null,
                instanceDefaultTtlSeconds:
                    lightdashConfigMock.results.cacheStateTimeSeconds,
            });
        });
    });

    describe('getMergedManifest', () => {
        const accountWithDeployPermission = {
            ...buildAccount(),
            user: {
                ...buildAccount().user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'DeployProject', action: 'manage' },
                ]),
            },
        } as RegisteredAccount;

        test('returns the stored artifact to an authorized CLI account', async () => {
            const storedManifest = Buffer.from('stored-manifest');
            projectModel.getMergedManifest.mockResolvedValueOnce(
                storedManifest,
            );

            await expect(
                service.getMergedManifest(
                    accountWithDeployPermission,
                    projectWithSensitiveFields.projectUuid,
                ),
            ).resolves.toEqual(storedManifest);
            expect(projectModel.getWithSensitiveFields).not.toHaveBeenCalled();
        });

        test('rejects an account without deploy permission', async () => {
            const forbiddenAccount = {
                ...buildAccount(),
                user: {
                    ...buildAccount().user,
                    ability: new Ability<PossibleAbilities>([]),
                },
            } as RegisteredAccount;

            await expect(
                service.getMergedManifest(
                    forbiddenAccount,
                    projectWithSensitiveFields.projectUuid,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(projectModel.getMergedManifest).not.toHaveBeenCalled();
        });

        test('reports when the project has no persisted manifest', async () => {
            projectModel.getMergedManifest.mockRejectedValueOnce(
                new NotFoundError(
                    'No merged dbt manifest has been persisted for this project',
                ),
            );

            await expect(
                service.getMergedManifest(
                    accountWithDeployPermission,
                    projectWithSensitiveFields.projectUuid,
                ),
            ).rejects.toThrow(
                'No merged dbt manifest has been persisted for this project',
            );
        });
    });

    describe('active create project jobs', () => {
        const organizationUuid = 'organization-uuid';
        const projectCreator: SessionUser = {
            ...user,
            organizationUuid,
            organizationName: 'Organization',
            organizationCreatedAt: new Date('2026-08-03T08:00:00.000Z'),
            ability: new Ability<PossibleAbilities>([
                { subject: 'Project', action: 'create' },
            ]),
        };
        const createProject: CreateProject = {
            name: 'New project',
            type: ProjectType.DEFAULT,
            dbtConnection: { type: DbtProjectType.NONE },
            dbtVersion: DbtVersionOptionLatest.LATEST,
            warehouseConnection: warehouseClientMock.credentials,
        };
        const activeCreateJob: Job = {
            ...job,
            jobUuid: 'active-create-job-uuid',
            projectUuid: undefined,
            userUuid: projectCreator.userUuid,
            jobType: JobType.CREATE_PROJECT,
            jobStatus: JobStatusType.RUNNING,
            jobResults: undefined,
        };
        const otherUserActiveCreateJob: Job = {
            ...activeCreateJob,
            userUuid: 'other-user-uuid',
        };

        test('rejects a second non-preview create with the active job UUID', async () => {
            vi.mocked(
                jobModel.createProjectJobIfNoActive,
            ).mockResolvedValueOnce({
                isCreated: false,
                activeJob: activeCreateJob,
            });

            const error = await service
                .scheduleCreate(
                    projectCreator,
                    createProject,
                    RequestMethod.WEB_APP,
                )
                .catch((caughtError) => caughtError);

            expect(error).toBeInstanceOf(ConflictError);
            expect(error).toMatchObject({
                statusCode: 409,
                data: { jobUuid: activeCreateJob.jobUuid },
            });
            expect(jobModel.create).not.toHaveBeenCalled();
            expect(
                schedulerClient.createProjectWithCompile,
            ).not.toHaveBeenCalled();
        });

        test("rejects another user's active job without exposing its UUID", async () => {
            vi.mocked(
                jobModel.createProjectJobIfNoActive,
            ).mockResolvedValueOnce({
                isCreated: false,
                activeJob: otherUserActiveCreateJob,
            });

            const error = await service
                .scheduleCreate(
                    projectCreator,
                    createProject,
                    RequestMethod.WEB_APP,
                )
                .catch((caughtError) => caughtError);

            expect(error).toBeInstanceOf(ConflictError);
            expect(error).toMatchObject({
                statusCode: 409,
                message:
                    'A project creation is already in progress for the organization',
            });
            expect(error.data).toEqual({});
            expect(
                schedulerClient.createProjectWithCompile,
            ).not.toHaveBeenCalled();
        });

        test('allows a non-preview create when no active job exists', async () => {
            await service.scheduleCreate(
                projectCreator,
                createProject,
                RequestMethod.WEB_APP,
            );

            expect(jobModel.createProjectJobIfNoActive).toHaveBeenCalledWith({
                job: expect.objectContaining({
                    jobType: JobType.CREATE_PROJECT,
                }),
                organizationUuid,
            });
            expect(
                schedulerClient.createProjectWithCompile,
            ).toHaveBeenCalledOnce();
        });

        test('rejects a create when the active job is older than an hour', async () => {
            const oldJob: Job = {
                ...activeCreateJob,
                createdAt: new Date('2026-08-03T07:59:59.999Z'),
            };
            vi.mocked(
                jobModel.createProjectJobIfNoActive,
            ).mockResolvedValueOnce({ isCreated: false, activeJob: oldJob });

            const error = await service
                .scheduleCreate(
                    projectCreator,
                    createProject,
                    RequestMethod.WEB_APP,
                )
                .catch((caughtError) => caughtError);

            expect(error).toMatchObject({
                statusCode: 409,
                data: { jobUuid: oldJob.jobUuid },
            });
            expect(
                schedulerClient.createProjectWithCompile,
            ).not.toHaveBeenCalled();
        });

        test('allows preview creates while a non-preview create is active', async () => {
            await service.scheduleCreate(
                projectCreator,
                { ...createProject, type: ProjectType.PREVIEW },
                RequestMethod.WEB_APP,
            );

            expect(jobModel.findActiveCreateProjectJob).not.toHaveBeenCalled();
            expect(jobModel.createProjectJobIfNoActive).not.toHaveBeenCalled();
            expect(jobModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ jobType: JobType.CREATE_PROJECT }),
                true,
            );
        });

        test('schedules exactly one job for two concurrent create attempts', async () => {
            let createdJob: Job | null = null;
            let simulatedInsertCount = 0;
            vi.mocked(jobModel.createProjectJobIfNoActive).mockImplementation(
                async ({ job: createJob }) => {
                    if (createdJob) {
                        return { isCreated: false, activeJob: createdJob };
                    }
                    createdJob = {
                        ...activeCreateJob,
                        jobUuid: createJob.jobUuid,
                        userUuid: createJob.userUuid,
                        jobStatus: createJob.jobStatus,
                    };
                    simulatedInsertCount += 1;
                    return { isCreated: true, job: createdJob };
                },
            );

            const results = await Promise.allSettled([
                service.scheduleCreate(
                    projectCreator,
                    createProject,
                    RequestMethod.WEB_APP,
                ),
                service.scheduleCreate(
                    projectCreator,
                    createProject,
                    RequestMethod.WEB_APP,
                ),
            ]);

            const fulfilledResults = results.filter(
                (result) => result.status === 'fulfilled',
            );
            expect(fulfilledResults).toHaveLength(1);
            const [rejection] = results.filter(
                ({ status }) => status === 'rejected',
            );
            expect(rejection).toMatchObject({
                reason: {
                    statusCode: 409,
                    data: { jobUuid: fulfilledResults[0].value.jobUuid },
                },
            });
            expect(simulatedInsertCount).toBe(1);
            expect(
                schedulerClient.createProjectWithCompile,
            ).toHaveBeenCalledOnce();
        });

        test('returns the active create job for recovery', async () => {
            vi.mocked(
                jobModel.findActiveCreateProjectJob,
            ).mockResolvedValueOnce(activeCreateJob);

            await expect(
                service.getActiveCreateProjectJob(projectCreator),
            ).resolves.toEqual(activeCreateJob);
            expect(jobModel.findActiveCreateProjectJob).toHaveBeenCalledWith({
                organizationUuid,
                userUuid: projectCreator.userUuid,
            });
        });

        test("returns null for recovery when only another user's job is active", async () => {
            vi.mocked(
                jobModel.findActiveCreateProjectJob,
            ).mockResolvedValueOnce(null);

            await expect(
                service.getActiveCreateProjectJob(projectCreator),
            ).resolves.toBeNull();
            expect(jobModel.findActiveCreateProjectJob).toHaveBeenCalledWith({
                organizationUuid,
                userUuid: projectCreator.userUuid,
            });
        });
    });
    describe('GitHub App connections on save', () => {
        const postgresWarehouseConnection: CreateWarehouseCredentials = {
            type: WarehouseTypes.POSTGRES,
            host: 'localhost',
            port: 5432,
            user: 'postgres',
            password: 'postgres',
            dbname: 'analytics',
            schema: 'public',
        };
        // The PROD-11711 shape: OAuth selected, installation id never filled,
        // previous PAT still stored from an earlier save.
        const savedGithubOAuthProject = {
            ...projectWithSensitiveFields,
            warehouseConnection: postgresWarehouseConnection,
            dbtConnection: {
                type: DbtProjectType.GITHUB,
                authorization_method: 'installation_id',
                installation_id: '',
                personal_access_token: 'ghp_stale',
                repository: 'org/repo',
                branch: 'main',
                project_sub_path: '/',
            },
        } as unknown as typeof projectWithSensitiveFields;
        // What the settings form sends: secrets stripped, id still empty.
        const updateData: UpdateProject = {
            name: savedGithubOAuthProject.name,
            dbtVersion: savedGithubOAuthProject.dbtVersion,
            warehouseConnection: postgresWarehouseConnection,
            dbtConnection: {
                type: DbtProjectType.GITHUB,
                authorization_method: 'installation_id',
                installation_id: '',
                repository: 'org/repo',
                branch: 'main',
                project_sub_path: '/',
            },
        };
        const serviceWithOrgInstallation = (
            installationId: string | undefined,
        ) =>
            getMockedProjectService(lightdashConfigMock, {
                githubAppInstallationsModel: {
                    findInstallationId: vi.fn(async () => installationId),
                } as unknown as GithubAppInstallationsModel,
            });

        beforeEach(() => {
            projectModel.update.mockClear();
            jobModel.create.mockClear();
            projectModel.getWithSensitiveFields.mockResolvedValueOnce(
                savedGithubOAuthProject,
            );
        });

        test('fills the org installation id into an OAuth connection saved with an empty one', async () => {
            await serviceWithOrgInstallation('999').updateAndScheduleAsyncWork(
                projectUuid,
                developerAccount,
                updateData,
                RequestMethod.WEB_APP,
            );

            expect(projectModel.update).toHaveBeenCalledWith(
                projectUuid,
                expect.objectContaining({
                    dbtConnection: expect.objectContaining({
                        authorization_method: 'installation_id',
                        installation_id: '999',
                    }),
                }),
                developerAccount.user.id,
            );
            // The stale PAT is not carried into the OAuth connection.
            expect(projectModel.update).toHaveBeenCalledWith(
                projectUuid,
                expect.objectContaining({
                    dbtConnection: expect.not.objectContaining({
                        personal_access_token: expect.anything(),
                    }),
                }),
                developerAccount.user.id,
            );
        });

        test('refuses to save an OAuth connection when the org has no GitHub App installation', async () => {
            await expect(
                serviceWithOrgInstallation(
                    undefined,
                ).updateAndScheduleAsyncWork(
                    projectUuid,
                    developerAccount,
                    updateData,
                    RequestMethod.WEB_APP,
                ),
            ).rejects.toThrow(GITHUB_APP_NOT_INSTALLED_MESSAGE);
            expect(projectModel.update).not.toHaveBeenCalled();
            expect(jobModel.create).not.toHaveBeenCalled();
        });
    });

    describe('organization warehouse credential authorization', () => {
        const organizationWarehouseCredentialsUuid =
            'organization-warehouse-credentials-uuid';
        const warehouseConnection: CreateWarehouseCredentials = {
            type: WarehouseTypes.SNOWFLAKE,
            account: 'snowflake-account',
            user: 'snowflake-user',
            password: 'snowflake-password',
            database: 'analytics',
            warehouse: 'transforming',
            schema: 'public',
            authenticationType: SnowflakeAuthenticationType.PASSWORD,
            organizationWarehouseCredentialsUuid,
        };
        const createProjectData: CreateProject = {
            name: 'New project',
            type: ProjectType.DEFAULT,
            dbtConnection: { type: DbtProjectType.NONE },
            dbtVersion: DefaultSupportedDbtVersion,
            warehouseConnection: {
                ...warehouseConnection,
                organizationWarehouseCredentialsUuid: undefined,
            },
            organizationWarehouseCredentialsUuid,
        };
        const updateProjectData: UpdateProject = {
            name: projectWithSensitiveFields.name,
            dbtConnection: projectWithSensitiveFields.dbtConnection,
            dbtVersion: projectWithSensitiveFields.dbtVersion,
            warehouseConnection,
        };
        const projectCreationUser: SessionUser = {
            ...user,
            organizationUuid: projectWithSensitiveFields.organizationUuid,
            ability: new Ability<PossibleAbilities>([
                { subject: 'Project', action: 'create' },
            ]),
        };
        const authorizedDeveloperAccount = {
            ...developerAccount,
            user: {
                ...developerAccount.user,
                role: OrganizationMemberRole.DEVELOPER,
                ability: defineUserAbility(
                    {
                        userUuid: developerAccount.user.id,
                        role: OrganizationMemberRole.DEVELOPER,
                        organizationUuid:
                            projectWithSensitiveFields.organizationUuid,
                    },
                    [],
                ),
            },
        } as typeof developerAccount;
        const organizationWarehouseCredentials = {
            organizationWarehouseCredentialsUuid,
            organizationUuid: projectWithSensitiveFields.organizationUuid,
            name: 'Shared Snowflake',
            description: null,
            warehouseType: WarehouseTypes.SNOWFLAKE,
            createdAt: new Date('2026-08-03T00:00:00.000Z'),
            createdByUserUuid: account.user.id,
            credentials: warehouseConnection,
        };

        beforeEach(() => {
            organizationWarehouseCredentialsModel.getByUuidWithSensitiveData.mockResolvedValue(
                organizationWarehouseCredentials,
            );
        });

        test('rejects save-without-compile before resolving organization credentials', async () => {
            await expect(
                service.updateWarehouseCredentials(
                    projectUuid,
                    developerAccount,
                    { warehouseConnection },
                ),
            ).rejects.toThrowError(ForbiddenError);
            expect(
                organizationWarehouseCredentialsModel.getByUuidWithSensitiveData,
            ).not.toHaveBeenCalled();
            expect(projectModel.update).not.toHaveBeenCalled();
        });

        test('rejects create-without-compile before resolving organization credentials', async () => {
            await expect(
                service.createWithoutCompile(
                    projectCreationUser,
                    createProjectData,
                    RequestMethod.WEB_APP,
                ),
            ).rejects.toThrowError(ForbiddenError);
            expect(
                organizationWarehouseCredentialsModel.getByUuidWithSensitiveData,
            ).not.toHaveBeenCalled();
            expect(
                projectModel.createWithOptionalCredentials,
            ).not.toHaveBeenCalled();
        });

        test('rejects scheduled create before creating a job', async () => {
            await expect(
                service.scheduleCreate(
                    projectCreationUser,
                    createProjectData,
                    RequestMethod.WEB_APP,
                ),
            ).rejects.toThrowError(ForbiddenError);
            expect(
                organizationWarehouseCredentialsModel.getByUuidWithSensitiveData,
            ).not.toHaveBeenCalled();
            expect(jobModel.create).not.toHaveBeenCalled();
            expect(
                schedulerClient.createProjectWithCompile,
            ).not.toHaveBeenCalled();
        });

        test('rejects update-and-compile before resolving organization credentials', async () => {
            await expect(
                service.updateAndScheduleAsyncWork(
                    projectUuid,
                    developerAccount,
                    updateProjectData,
                    RequestMethod.WEB_APP,
                ),
            ).rejects.toThrowError(ForbiddenError);
            expect(
                organizationWarehouseCredentialsModel.getByUuidWithSensitiveData,
            ).not.toHaveBeenCalled();
            expect(jobModel.create).not.toHaveBeenCalled();
            expect(projectModel.update).not.toHaveBeenCalled();
        });

        test('allows organization credentials for an organization developer', async () => {
            await expect(
                service.updateWarehouseCredentials(
                    projectUuid,
                    authorizedDeveloperAccount,
                    { warehouseConnection },
                ),
            ).resolves.toBeUndefined();
            expect(
                organizationWarehouseCredentialsModel.getByUuidWithSensitiveData,
            ).toHaveBeenCalledWith(organizationWarehouseCredentialsUuid);
            expect(projectModel.update).toHaveBeenCalledOnce();
        });

        test('rejects organization credentials from another organization after lookup', async () => {
            organizationWarehouseCredentialsModel.getByUuidWithSensitiveData.mockResolvedValueOnce(
                {
                    ...organizationWarehouseCredentials,
                    organizationUuid: 'another-organization-uuid',
                },
            );

            await expect(
                service.updateWarehouseCredentials(
                    projectUuid,
                    authorizedDeveloperAccount,
                    { warehouseConnection },
                ),
            ).rejects.toThrowError(ForbiddenError);
            expect(
                organizationWarehouseCredentialsModel.getByUuidWithSensitiveData,
            ).toHaveBeenCalledWith(organizationWarehouseCredentialsUuid);
            expect(projectModel.update).not.toHaveBeenCalled();
        });
    });

    describe('ensurePlaygroundProject', () => {
        const organizationUuid = 'organization-uuid';
        const ensureAs = async (ability: SessionUser['ability']) => {
            const provisionPlaygroundProject = vi.fn(async () => ({
                projectUuid: 'project-uuid',
                created: true,
            }));
            const serviceWithProvisioner = getMockedProjectService(
                lightdashConfigMock,
                { provisionPlaygroundProject },
            );
            const result = serviceWithProvisioner.ensurePlaygroundProject({
                ...user,
                organizationUuid,
                ability,
            });
            return { result, provisionPlaygroundProject };
        };
        const roleAbility = (role: OrganizationMemberRole) =>
            defineUserAbility(
                { organizationUuid, userUuid: user.userUuid, role },
                [],
            );

        test('allows an organization admin', async () => {
            const { result, provisionPlaygroundProject } = await ensureAs(
                roleAbility(OrganizationMemberRole.ADMIN),
            );
            await expect(result).resolves.toEqual({
                projectUuid: 'project-uuid',
                created: true,
            });
            expect(provisionPlaygroundProject).toHaveBeenCalledOnce();
        });

        test('refuses a viewer with a message about projects', async () => {
            const { result, provisionPlaygroundProject } = await ensureAs(
                roleAbility(OrganizationMemberRole.VIEWER),
            );
            await expect(result).rejects.toThrowError(
                "You don't have permission to create projects in this organization",
            );
            expect(provisionPlaygroundProject).not.toHaveBeenCalled();
        });

        test('records the decision against Project in the audit log', async () => {
            const levelSpy = vi
                .spyOn(winston.winstonLogger, 'isLevelEnabled')
                .mockReturnValue(true);
            const auditLogSpy = vi
                .spyOn(winston, 'logAuditEvent')
                .mockImplementation(() => {});
            try {
                const { result } = await ensureAs(
                    roleAbility(OrganizationMemberRole.VIEWER),
                );
                await expect(result).rejects.toThrowError(ForbiddenError);
                expect(auditLogSpy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        action: 'create',
                        status: 'denied',
                        resource: expect.objectContaining({ type: 'Project' }),
                    }),
                );
            } finally {
                levelSpy.mockRestore();
                auditLogSpy.mockRestore();
            }
        });

        test('follows project creation, not invite link creation', async () => {
            const canCreateProjects = await ensureAs(
                new Ability<PossibleAbilities>([
                    {
                        action: 'create',
                        subject: 'Project',
                        conditions: {
                            organizationUuid,
                            type: ProjectType.DEFAULT,
                        },
                    },
                ]),
            );
            await expect(canCreateProjects.result).resolves.toMatchObject({
                projectUuid: 'project-uuid',
            });

            const canOnlyInvite = await ensureAs(
                new Ability<PossibleAbilities>([
                    {
                        action: 'manage',
                        subject: 'InviteLink',
                        conditions: { organizationUuid },
                    },
                ]),
            );
            await expect(canOnlyInvite.result).rejects.toThrowError(
                ForbiddenError,
            );
            expect(
                canOnlyInvite.provisionPlaygroundProject,
            ).not.toHaveBeenCalled();
        });
    });

    test('includes onboarding flow in project analytics properties', () => {
        expect(
            ProjectService.getAnalyticProperties(
                {
                    name: projectWithSensitiveFields.name,
                    type: projectWithSensitiveFields.type,
                    dbtConnection: projectWithSensitiveFields.dbtConnection,
                    warehouseConnection: warehouseClientMock.credentials,
                },
                projectUuid,
                user,
                RequestMethod.WEB_APP,
                'new',
            ),
        ).toMatchObject({ onboardingFlow: 'new' });
    });

    test.each([
        [RedshiftAuthenticationType.IAM, RedshiftAuthenticationType.IAM],
        [undefined, RedshiftAuthenticationType.PASSWORD],
    ])(
        'includes Redshift authentication type %s in project analytics properties',
        (authenticationType, expectedAuthenticationType) => {
            expect(
                ProjectService.getAnalyticProperties(
                    {
                        name: projectWithSensitiveFields.name,
                        type: projectWithSensitiveFields.type,
                        dbtConnection: projectWithSensitiveFields.dbtConnection,
                        warehouseConnection: {
                            type: WarehouseTypes.REDSHIFT,
                            host: 'localhost',
                            user: 'analytics',
                            password: 'password',
                            port: 5439,
                            dbname: 'analytics',
                            schema: 'public',
                            authenticationType,
                        },
                    },
                    projectUuid,
                    user,
                    RequestMethod.WEB_APP,
                    'new',
                ),
            ).toMatchObject({
                authenticationType: expectedAuthenticationType,
            });
        },
    );

    test('does not compile and removes a preview when copying fails', async () => {
        const previewProjectUuid = 'failed-preview-project-uuid';
        (
            projectModel.getWithSensitiveFields as import('vitest').Mock
        ).mockResolvedValueOnce({
            ...projectWithSensitiveFields,
            warehouseConnection: warehouseClientMock.credentials,
            organizationWarehouseCredentialsUuid:
                'organization-warehouse-credentials-uuid',
        });
        const createWithoutCompileSpy = vi
            .spyOn(service, 'createWithoutCompile')
            .mockResolvedValueOnce({
                project: {
                    ...projectWithSensitiveFields,
                    projectUuid: previewProjectUuid,
                    type: ProjectType.PREVIEW,
                },
                hasContentCopy: false,
                accessCopyError: 'access copy failed',
            });
        const scheduleCompileProjectSpy = vi.spyOn(
            service,
            'scheduleCompileProject',
        );

        await expect(
            service.createPreview(
                user,
                projectUuid,
                { name: 'Failed preview', copyContent: true },
                RequestMethod.WEB_APP,
            ),
        ).rejects.toThrow('Failed to copy preview project');

        expect(projectModel.delete).toHaveBeenCalledWith(previewProjectUuid);
        expect(scheduleCompileProjectSpy).not.toHaveBeenCalled();
        expect(createWithoutCompileSpy.mock.calls[0][1]).not.toHaveProperty(
            'organizationWarehouseCredentialsUuid',
        );
        createWithoutCompileSpy.mockRestore();
        scheduleCompileProjectSpy.mockRestore();
    });

    test.each([RequestMethod.WEB_APP, RequestMethod.CLI])(
        'copies additional dbt sources when creating a preview through %s',
        async (requestMethod) => {
            const upstreamProjectUuid = 'upstream-project-uuid';
            const previewProjectUuid = 'created-preview-project-uuid';
            const primaryDbtConnection = {
                type: DbtProjectType.GITHUB,
                authorization_method: 'installation_id',
                repository: 'lightdash/primary-models',
                branch: 'preview-primary-branch',
                project_sub_path: '/primary',
                installation_id: 'primary-installation-id',
            } as const;
            const copySources = vi.fn(async () => undefined);
            const previewService = getMockedProjectService(
                lightdashConfigMock,
                {
                    projectDbtSourcesModel: {
                        copySources,
                    } as unknown as ProjectDbtSourcesModel,
                },
            );
            const previewUser: SessionUser = {
                ...user,
                organizationUuid: projectWithSensitiveFields.organizationUuid,
                organizationName: 'Test organization',
                organizationCreatedAt: new Date(),
                ability: new Ability<PossibleAbilities>([
                    { subject: 'Project', action: 'create' },
                ]),
            };
            const validateSpy = vi
                .spyOn(
                    previewService as unknown as {
                        validateProjectCreationPermissions: () => Promise<true>;
                    },
                    'validateProjectCreationPermissions',
                )
                .mockResolvedValue(true);
            const expirationSpy = vi
                .spyOn(previewService, 'getPreviewExpiresAt')
                .mockResolvedValue(null);
            const copyAccessSpy = vi
                .spyOn(previewService, 'copyUserAccessOnPreview')
                .mockResolvedValue();
            projectModel.createWithOptionalCredentials.mockResolvedValueOnce(
                previewProjectUuid,
            );
            projectModel.get
                .mockResolvedValueOnce({
                    ...projectWithSensitiveFields,
                    projectUuid: upstreamProjectUuid,
                    dbtConnection: {
                        ...primaryDbtConnection,
                        branch: 'upstream-primary-branch',
                    },
                })
                .mockResolvedValueOnce({
                    ...projectWithSensitiveFields,
                    projectUuid: previewProjectUuid,
                    type: ProjectType.PREVIEW,
                    dbtConnection: primaryDbtConnection,
                });

            try {
                await previewService.createWithoutCompile(
                    previewUser,
                    {
                        name: 'Preview with additional sources',
                        type: ProjectType.PREVIEW,
                        dbtConnection: primaryDbtConnection,
                        upstreamProjectUuid,
                        copyContent: false,
                        dbtVersion: projectWithSensitiveFields.dbtVersion,
                    },
                    requestMethod,
                );

                expect(copySources).toHaveBeenCalledWith(
                    upstreamProjectUuid,
                    previewProjectUuid,
                );
                expect(
                    projectModel.createWithOptionalCredentials,
                ).toHaveBeenCalledWith(
                    previewUser.userUuid,
                    previewUser.organizationUuid,
                    expect.objectContaining({
                        dbtConnection: primaryDbtConnection,
                    }),
                    null,
                    undefined,
                );
            } finally {
                validateSpy.mockRestore();
                expirationSpy.mockRestore();
                copyAccessSpy.mockRestore();
            }
        },
    );

    describe('preview content copy scheduling', () => {
        const upstreamProjectUuid = 'upstream-project-uuid';
        const previewProjectUuid = 'created-preview-project-uuid';
        const previewUser: SessionUser = {
            ...user,
            organizationUuid: projectWithSensitiveFields.organizationUuid,
            organizationName: 'Test organization',
            organizationCreatedAt: new Date(),
            ability: new Ability<PossibleAbilities>([
                { subject: 'Project', action: 'create' },
            ]),
        };

        const setup = () => {
            const validateSpy = vi
                .spyOn(
                    service as unknown as {
                        validateProjectCreationPermissions: () => Promise<true>;
                    },
                    'validateProjectCreationPermissions',
                )
                .mockResolvedValue(true);
            const expirationSpy = vi
                .spyOn(service, 'getPreviewExpiresAt')
                .mockResolvedValue(null);
            const copyAccessSpy = vi
                .spyOn(service, 'copyUserAccessOnPreview')
                .mockResolvedValue();
            const copyContentSpy = vi
                .spyOn(service, 'copyContentOnPreview')
                .mockResolvedValue();
            vi.mocked(projectModel.get)
                .mockResolvedValueOnce({
                    ...projectWithSensitiveFields,
                    projectUuid: upstreamProjectUuid,
                    organizationWarehouseCredentialsUuid:
                        'organization-warehouse-credentials-uuid',
                })
                .mockResolvedValueOnce({
                    ...projectWithSensitiveFields,
                    projectUuid: previewProjectUuid,
                    type: ProjectType.PREVIEW,
                });
            return {
                copyAccessSpy,
                copyContentSpy,
                restore: () => {
                    validateSpy.mockRestore();
                    expirationSpy.mockRestore();
                    copyAccessSpy.mockRestore();
                    copyContentSpy.mockRestore();
                },
            };
        };
        let mocks: ReturnType<typeof setup>;
        beforeEach(() => {
            mocks = setup();
        });
        afterEach(() => {
            mocks.restore();
        });

        const createWithoutCompile = (
            previewCopy?: Parameters<ProjectService['createWithoutCompile']>[4],
        ) =>
            service.createWithoutCompile(
                previewUser,
                {
                    name: 'Preview',
                    type: ProjectType.PREVIEW,
                    dbtConnection: { type: DbtProjectType.NONE },
                    upstreamProjectUuid,
                    copyContent: true,
                    dbtVersion: projectWithSensitiveFields.dbtVersion,
                },
                RequestMethod.WEB_APP,
                undefined,
                previewCopy,
            );
        const createPreview = (asyncCopyContent?: boolean) => {
            vi.mocked(
                projectModel.getWithSensitiveFields,
            ).mockResolvedValueOnce({
                ...projectWithSensitiveFields,
                warehouseConnection: warehouseClientMock.credentials,
            });
            return service.createPreview(
                previewUser,
                upstreamProjectUuid,
                {
                    name: 'Preview',
                    copyContent: true,
                    validateAfterCompile: true,
                },
                RequestMethod.WEB_APP,
                asyncCopyContent,
            );
        };

        test('queues an opted-in org preview without copying in the request', async () => {
            const result = await createWithoutCompile({
                mode: 'async',
                compile: null,
            });
            expect(mocks.copyContentSpy).not.toHaveBeenCalled();
            expect(schedulerClient.compileProject).not.toHaveBeenCalled();
            expect(result).toMatchObject({
                hasContentCopy: false,
                contentCopyJobUuid: expect.any(String),
            });
            expect(schedulerClient.copyPreviewContent).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuid: previewProjectUuid,
                    upstreamProjectUuid,
                    jobUuid: result.contentCopyJobUuid,
                    compile: null,
                }),
            );
            expect(jobModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    jobUuid: result.contentCopyJobUuid,
                    projectUuid: undefined,
                    userUuid: previewUser.userUuid,
                    jobStatus: JobStatusType.STARTED,
                }),
                true,
            );
            expect(
                projectModel.createWithOptionalCredentials,
            ).toHaveBeenCalledWith(
                previewUser.userUuid,
                previewUser.organizationUuid,
                expect.objectContaining({
                    organizationWarehouseCredentialsUuid:
                        'organization-warehouse-credentials-uuid',
                }),
                null,
                undefined,
            );
        });

        test('reserves compilation until the opted-in preview copy finishes', async () => {
            const result = await createPreview(true);
            expect(mocks.copyContentSpy).not.toHaveBeenCalled();
            expect(schedulerClient.compileProject).not.toHaveBeenCalled();
            expect(result).toMatchObject({
                projectUuid: previewProjectUuid,
                compileJobUuid: expect.any(String),
                contentCopyJobUuid: expect.any(String),
            });
            expect(schedulerClient.copyPreviewContent).toHaveBeenCalledWith(
                expect.objectContaining({
                    jobUuid: result.contentCopyJobUuid,
                    compile: {
                        jobUuid: result.compileJobUuid,
                        validateAfterCompile: true,
                    },
                }),
            );
            expect(jobModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    jobUuid: result.compileJobUuid,
                    projectUuid: previewProjectUuid,
                    jobStatus: JobStatusType.STARTED,
                }),
                true,
            );
        });

        test('removes the preview when enqueueing its copy fails', async () => {
            schedulerClient.copyPreviewContent.mockRejectedValueOnce(
                new Error('enqueue failed'),
            );
            await expect(
                createWithoutCompile({ mode: 'async', compile: null }),
            ).rejects.toThrow('enqueue failed');
            expect(projectModel.delete).toHaveBeenCalledWith(
                previewProjectUuid,
            );
            expect(mocks.copyContentSpy).not.toHaveBeenCalled();
            expect(schedulerClient.compileProject).not.toHaveBeenCalled();
        });

        test('removes the preview without enqueueing when copying access fails', async () => {
            mocks.copyAccessSpy.mockRejectedValueOnce(
                new Error('access failed'),
            );
            await expect(
                createWithoutCompile({ mode: 'async', compile: null }),
            ).rejects.toThrow('Failed to copy preview project');
            expect(projectModel.delete).toHaveBeenCalledWith(
                previewProjectUuid,
            );
            expect(mocks.copyContentSpy).not.toHaveBeenCalled();
            expect(schedulerClient.copyPreviewContent).not.toHaveBeenCalled();
            expect(schedulerClient.compileProject).not.toHaveBeenCalled();
        });

        test('waits for content before returning an org preview without opt-in', async () => {
            let finishCopy!: () => void;
            mocks.copyContentSpy.mockImplementationOnce(
                () =>
                    new Promise<void>((resolve) => {
                        finishCopy = resolve;
                    }),
            );
            const finished = vi.fn();
            const creation = createWithoutCompile().then((result) => {
                finished();
                return result;
            });
            await vi.waitFor(() =>
                expect(mocks.copyContentSpy).toHaveBeenCalled(),
            );
            expect(finished).not.toHaveBeenCalled();
            finishCopy();
            const result = await creation;
            expect(result.hasContentCopy).toBe(true);
            expect(result.contentCopyJobUuid).toBeUndefined();
            expect(schedulerClient.copyPreviewContent).not.toHaveBeenCalled();
        });

        test('waits for content before compiling a preview without opt-in', async () => {
            let finishCopy!: () => void;
            mocks.copyContentSpy.mockImplementationOnce(
                () =>
                    new Promise<void>((resolve) => {
                        finishCopy = resolve;
                    }),
            );
            const creation = createPreview();
            await vi.waitFor(() =>
                expect(mocks.copyContentSpy).toHaveBeenCalled(),
            );
            expect(schedulerClient.compileProject).not.toHaveBeenCalled();
            finishCopy();
            const result = await creation;
            expect(result.contentCopyJobUuid).toBeUndefined();
            expect(schedulerClient.copyPreviewContent).not.toHaveBeenCalled();
            expect(schedulerClient.compileProject).toHaveBeenCalledWith(
                expect.objectContaining({ projectUuid: previewProjectUuid }),
            );
        });
    });

    describe('background preview content copy', () => {
        const payload: CopyPreviewContentPayload = {
            jobUuid: 'copy-job',
            projectUuid: 'preview-project',
            upstreamProjectUuid: 'upstream-project',
            organizationUuid: 'organizationUuid',
            userUuid: user.userUuid,
            requestMethod: RequestMethod.WEB_APP,
            compile: { jobUuid: 'compile-job', validateAfterCompile: true },
        };

        test.each([true, false])(
            'finishes copying before scheduling compilation (compile: %s)',
            async (compile) => {
                let finishCopy!: (result: { spaceMapping: {} }) => void;
                projectModel.duplicateContent.mockImplementationOnce(
                    () =>
                        new Promise((resolve) => {
                            finishCopy = resolve;
                        }),
                );
                const run = service.runPreviewContentCopy(user, {
                    ...payload,
                    compile: compile ? payload.compile : null,
                });
                await vi.waitFor(() =>
                    expect(projectModel.duplicateContent).toHaveBeenCalled(),
                );
                expect(schedulerClient.compileProject).not.toHaveBeenCalled();
                expect(jobModel.update).not.toHaveBeenCalledWith(
                    'copy-job',
                    expect.objectContaining({ jobStatus: JobStatusType.DONE }),
                );
                finishCopy({ spaceMapping: {} });
                await run;
                if (compile) {
                    expect(schedulerClient.compileProject).toHaveBeenCalledWith(
                        expect.objectContaining({
                            jobUuid: 'compile-job',
                            projectUuid: 'preview-project',
                            validateAfterCompile: true,
                        }),
                    );
                } else {
                    expect(
                        schedulerClient.compileProject,
                    ).not.toHaveBeenCalled();
                }
                expect(jobModel.update).toHaveBeenCalledWith('copy-job', {
                    jobStatus: JobStatusType.DONE,
                    jobResults: { projectUuid: 'preview-project' },
                });
            },
        );

        test('does not compile or report success when a timed-out copy finishes late', async () => {
            const controller = new AbortController();
            let finishCopy!: (result: { spaceMapping: {} }) => void;
            projectModel.duplicateContent.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finishCopy = resolve;
                    }),
            );
            const run = service.runPreviewContentCopy(
                user,
                payload,
                controller.signal,
            );
            await vi.waitFor(() =>
                expect(projectModel.duplicateContent).toHaveBeenCalled(),
            );
            controller.abort(new Error('Copy timed out'));
            await service.failPreviewContentCopy(
                payload,
                controller.signal.reason,
            );
            finishCopy({ spaceMapping: {} });
            await expect(run).rejects.toThrow('Copy timed out');
            expect(schedulerClient.compileProject).not.toHaveBeenCalled();
            expect(jobModel.update).not.toHaveBeenCalledWith(
                'copy-job',
                expect.objectContaining({ jobStatus: JobStatusType.DONE }),
            );
            expect(jobModel.update).toHaveBeenLastCalledWith('copy-job', {
                jobStatus: JobStatusType.ERROR,
            });
        });

        test.each(['copy', 'compile enqueue', 'cleanup'])(
            'preserves a pollable error and deletes a failed preview (%s failure)',
            async (failure) => {
                if (failure === 'compile enqueue') {
                    schedulerClient.compileProject.mockRejectedValueOnce(
                        new Error('queue unavailable'),
                    );
                } else {
                    projectModel.duplicateContent.mockRejectedValueOnce(
                        new Error('copy failed'),
                    );
                }
                if (failure === 'cleanup') {
                    projectModel.delete.mockRejectedValueOnce(
                        new Error('delete failed'),
                    );
                }
                const message =
                    failure === 'compile enqueue'
                        ? 'queue unavailable'
                        : 'copy failed';
                await expect(
                    service.runPreviewContentCopy(user, payload),
                ).rejects.toThrow(message);
                expect(projectModel.delete).toHaveBeenCalledWith(
                    'preview-project',
                );
                expect(jobModel.updateJobStep).toHaveBeenCalledWith(
                    'copy-job',
                    JobStepStatusType.ERROR,
                    JobStepType.COPYING_PREVIEW_CONTENT,
                    message,
                );
                expect(jobModel.update).toHaveBeenCalledWith('copy-job', {
                    jobStatus: JobStatusType.ERROR,
                });
                if (failure !== 'compile enqueue') {
                    expect(
                        schedulerClient.compileProject,
                    ).not.toHaveBeenCalled();
                }
            },
        );
    });

    describe('expired preview sweep', () => {
        const getExpiredPreviewProjects = vi.fn();
        const deleteProjectAppFiles = vi.fn();
        const expiring = projectModel as typeof projectModel & {
            getExpiredPreviewProjects: typeof getExpiredPreviewProjects;
        };
        const sweepService = () =>
            getMockedProjectService(lightdashConfigMock, {
                getAppGenerateService: () =>
                    ({ deleteProjectAppFiles }) as never,
            });

        beforeEach(() => {
            expiring.getExpiredPreviewProjects = getExpiredPreviewProjects;
            getExpiredPreviewProjects.mockResolvedValue([
                { projectUuid: 'copy-1', organizationUuid: 'org' },
                { projectUuid: 'copy-2', organizationUuid: 'org' },
            ]);
            deleteProjectAppFiles.mockReset();
            deleteProjectAppFiles.mockResolvedValue(1);
            projectModel.delete.mockClear();
        });

        test('removes each expired preview and the app files it copied', async () => {
            await expect(
                sweepService().deleteExpiredPreviewProjects(),
            ).resolves.toBe(2);
            expect(
                deleteProjectAppFiles.mock.calls.map(([uuid]) => uuid),
            ).toEqual(['copy-1', 'copy-2']);
            expect(projectModel.delete).toHaveBeenNthCalledWith(1, 'copy-1');
            expect(projectModel.delete).toHaveBeenNthCalledWith(2, 'copy-2');
        });

        test('still deletes the project when its app files cannot be removed', async () => {
            deleteProjectAppFiles.mockRejectedValueOnce(
                new Error('bucket gone'),
            );
            await expect(
                sweepService().deleteExpiredPreviewProjects(),
            ).resolves.toBe(2);
            expect(projectModel.delete).toHaveBeenCalledTimes(2);
        });
    });

    describe('training project connection lock', () => {
        const trainingProject = {
            ...projectWithSensitiveFields,
            type: ProjectType.TRAINING,
            provisioningSource: 'training',
        };
        const snowflakeConnection: CreateWarehouseCredentials = {
            type: WarehouseTypes.SNOWFLAKE,
            account: 'snowflake-account',
            user: 'snowflake-user',
            password: 'snowflake-password',
            database: 'analytics',
            warehouse: 'transforming',
            schema: 'public',
            authenticationType: SnowflakeAuthenticationType.PASSWORD,
        };
        const embeddedConnection = {
            type: WarehouseTypes.DUCKDB as const,
            connectionType: DuckdbConnectionType.EMBEDDED as const,
            dataset: 'jaffle_shop',
        };
        const learner: SessionUser = {
            ...user,
            role: OrganizationMemberRole.VIEWER,
            organizationUuid: trainingProject.organizationUuid,
            organizationName: 'Organization',
            organizationCreatedAt: new Date(),
            ability: defineUserAbility(
                {
                    userUuid: user.userUuid,
                    organizationUuid: trainingProject.organizationUuid,
                    role: OrganizationMemberRole.VIEWER,
                },
                [],
            ),
        };
        const managedMessage =
            'The training project keeps the sample data it shipped with';

        beforeEach(() => {
            projectModel.update.mockClear();
            jobModel.create.mockClear();
            projectModel.createWithOptionalCredentials.mockClear();
        });

        test('refuses a warehouse credential update on the training project', async () => {
            projectModel.getWithSensitiveFields.mockResolvedValueOnce(
                trainingProject,
            );
            await expect(
                service.updateWarehouseCredentials(
                    trainingProject.projectUuid,
                    developerAccount,
                    { warehouseConnection: snowflakeConnection },
                ),
            ).rejects.toThrow(managedMessage);
            expect(projectModel.update).not.toHaveBeenCalled();
        });

        test('refuses an update-and-compile on the training project', async () => {
            projectModel.getWithSensitiveFields.mockResolvedValueOnce(
                trainingProject,
            );
            await expect(
                service.updateAndScheduleAsyncWork(
                    trainingProject.projectUuid,
                    developerAccount,
                    {
                        name: trainingProject.name,
                        dbtConnection: trainingProject.dbtConnection,
                        dbtVersion: trainingProject.dbtVersion,
                        warehouseConnection: snowflakeConnection,
                    },
                    RequestMethod.WEB_APP,
                ),
            ).rejects.toThrow(managedMessage);
            expect(jobModel.create).not.toHaveBeenCalled();
            expect(projectModel.update).not.toHaveBeenCalled();
        });

        test('refuses a connection write through the shared policy check', () => {
            expect(() =>
                service.assertCanWriteWarehouseConnection(
                    developerAccount,
                    {
                        organizationUuid: trainingProject.organizationUuid,
                        provisioningSource: 'training',
                    },
                    { warehouseConnection: snowflakeConnection },
                ),
            ).toThrow(managedMessage);
        });

        test.each([
            {
                reason: 'the upstream connection is not the shipped sample data',
                credentials: snowflakeConnection,
                organizationWarehouseCredentialsUuid: undefined,
            },
            {
                reason: 'the upstream is bound to organization credentials',
                credentials: embeddedConnection,
                organizationWarehouseCredentialsUuid: 'org-creds-uuid',
            },
        ])(
            'refuses a training copy when $reason',
            async ({ credentials, organizationWarehouseCredentialsUuid }) => {
                const learnService = getMockedProjectService(
                    lightdashConfigMock,
                    {
                        featureFlagModel: {
                            get: vi.fn(async () => ({
                                id: FeatureFlags.EnableLearn,
                                enabled: true,
                            })),
                        } as unknown as FeatureFlagModel,
                    },
                );
                projectModel.get.mockResolvedValueOnce({
                    ...trainingProject,
                    organizationWarehouseCredentialsUuid,
                });
                projectModel.getAllByOrganizationUuid.mockResolvedValueOnce([]);
                projectModel.getWarehouseCredentialsForProject.mockResolvedValueOnce(
                    credentials,
                );
                const deletePreviews = vi
                    .spyOn(learnService, 'deleteTrainingPreviews')
                    .mockResolvedValue({ deleted: 0 });
                try {
                    await expect(
                        learnService.createTrainingPreview(
                            learner,
                            trainingProject.projectUuid,
                        ),
                    ).rejects.toThrow(managedMessage);
                    expect(deletePreviews).not.toHaveBeenCalled();
                    expect(
                        projectModel.createWithOptionalCredentials,
                    ).not.toHaveBeenCalled();
                } finally {
                    deletePreviews.mockRestore();
                }
            },
        );
    });

    test.each(['createWithoutCompile', 'scheduleCreate'] as const)(
        '%s rejects previews of managed analytics before creating or scheduling work',
        async (creationMethod) => {
            const upstream = {
                ...projectWithSensitiveFields,
                type: ProjectType.DEFAULT,
                provisioningSource: 'analytics',
            };
            const getProject = vi
                .spyOn(projectModel, 'get')
                .mockResolvedValue(upstream);
            try {
                await expect(
                    service[creationMethod](
                        {
                            ...user,
                            organizationUuid: upstream.organizationUuid,
                            organizationName: 'Organization',
                            organizationCreatedAt: new Date(),
                            ability: new Ability<PossibleAbilities>([
                                { subject: 'all', action: 'manage' },
                            ]),
                        },
                        {
                            name: 'Analytics preview',
                            warehouseConnection: {
                                type: WarehouseTypes.DUCKDB,
                                connectionType: DuckdbConnectionType.EMBEDDED,
                                dataset: 'jaffle_shop',
                            },
                            type: ProjectType.PREVIEW,
                            upstreamProjectUuid: upstream.projectUuid,
                            dbtConnection: { type: DbtProjectType.NONE },
                            dbtVersion: upstream.dbtVersion,
                        },
                        RequestMethod.WEB_APP,
                    ),
                ).rejects.toThrow(
                    'Cannot create a preview from a managed analytics project',
                );
                expect(
                    projectModel.createWithOptionalCredentials,
                ).not.toHaveBeenCalled();
                expect(
                    schedulerClient.createProjectWithCompile,
                ).not.toHaveBeenCalled();
            } finally {
                getProject.mockRestore();
            }
        },
    );

    describe('training preview creation', () => {
        const training = {
            ...projectWithSensitiveFields,
            type: ProjectType.TRAINING,
        };
        const warehouseConnection = {
            type: WarehouseTypes.DUCKDB as const,
            connectionType: DuckdbConnectionType.EMBEDDED as const,
            dataset: 'jaffle_shop',
        };
        const previewData: CreateProject = {
            name: 'Training preview',
            type: ProjectType.PREVIEW,
            upstreamProjectUuid: training.projectUuid,
            dbtConnection: { type: DbtProjectType.NONE },
            dbtVersion: training.dbtVersion,
            warehouseConnection,
        };
        const trainingUser = (role: OrganizationMemberRole): SessionUser => ({
            ...user,
            role,
            organizationUuid: training.organizationUuid,
            organizationName: 'Organization',
            organizationCreatedAt: new Date(),
            ability: defineUserAbility(
                {
                    userUuid: user.userUuid,
                    organizationUuid: training.organizationUuid,
                    role,
                },
                [],
            ),
        });

        describe.each(['createWithoutCompile', 'scheduleCreate'] as const)(
            '%s',
            (creationMethod) => {
                test.each([
                    OrganizationMemberRole.ADMIN,
                    OrganizationMemberRole.VIEWER,
                ])(
                    'directs %s users with supplied embedded credentials to start a walkthrough',
                    async (role) => {
                        const getProject = vi
                            .spyOn(projectModel, 'get')
                            .mockResolvedValue(training);
                        projectModel.createWithOptionalCredentials.mockClear();
                        jobModel.create.mockClear();
                        schedulerClient.createProjectWithCompile.mockClear();

                        try {
                            await expect(
                                service[creationMethod](
                                    trainingUser(role),
                                    { ...previewData },
                                    RequestMethod.WEB_APP,
                                ),
                            ).rejects.toEqual(
                                new ForbiddenError(
                                    'Previews of the training project are made by starting a walkthrough',
                                ),
                            );
                            expect(
                                projectModel.createWithOptionalCredentials,
                            ).not.toHaveBeenCalled();
                            expect(jobModel.create).not.toHaveBeenCalled();
                            expect(
                                schedulerClient.createProjectWithCompile,
                            ).not.toHaveBeenCalled();
                        } finally {
                            getProject.mockRestore();
                        }
                    },
                );
            },
        );

        test('allows an internal training copy for a viewer without preview creation permission', async () => {
            const preview = {
                ...training,
                projectUuid: 'created-preview-project-uuid',
                type: ProjectType.PREVIEW,
            };
            const getProject = vi
                .spyOn(projectModel, 'get')
                .mockResolvedValueOnce(training)
                .mockResolvedValueOnce(training)
                .mockResolvedValueOnce(preview);
            const getCredentials = vi
                .spyOn(projectModel, 'getWarehouseCredentialsForProject')
                .mockResolvedValueOnce(warehouseConnection);
            const expiration = vi
                .spyOn(service, 'getPreviewExpiresAt')
                .mockResolvedValue(null);
            const copyAccess = vi
                .spyOn(service, 'copyUserAccessOnPreview')
                .mockResolvedValue();
            const copyContent = vi
                .spyOn(service, 'copyContentOnPreview')
                .mockResolvedValue();

            try {
                await expect(
                    service.createWithoutCompile(
                        trainingUser(OrganizationMemberRole.VIEWER),
                        {
                            ...previewData,
                            warehouseConnection: undefined,
                            copyWarehouseConnectionFromUpstreamProject: true,
                            copyContent: true,
                        },
                        RequestMethod.BACKEND,
                        { source: 'training' },
                    ),
                ).resolves.toMatchObject({
                    project: preview,
                    hasContentCopy: true,
                    accessCopyError: undefined,
                    contentCopyError: undefined,
                });
                expect(
                    projectModel.createWithOptionalCredentials,
                ).toHaveBeenCalledWith(
                    user.userUuid,
                    training.organizationUuid,
                    expect.objectContaining({
                        type: ProjectType.PREVIEW,
                        upstreamProjectUuid: training.projectUuid,
                    }),
                    null,
                    'training',
                );
            } finally {
                getProject.mockRestore();
                getCredentials.mockRestore();
                expiration.mockRestore();
                copyAccess.mockRestore();
                copyContent.mockRestore();
            }
        });
    });

    test.each(['createWithoutCompile', 'scheduleCreate'] as const)(
        '%s rejects externally supplied embedded DuckDB credentials for default projects',
        async (creationMethod) => {
            await expect(
                service[creationMethod](
                    {
                        ...user,
                        ability: defineUserAbility(
                            {
                                userUuid: user.userUuid,
                                organizationUuid:
                                    projectWithSensitiveFields.organizationUuid,
                                role: OrganizationMemberRole.ADMIN,
                            },
                            [],
                        ),
                        organizationUuid:
                            projectWithSensitiveFields.organizationUuid,
                        organizationName: 'Organization',
                        organizationCreatedAt: new Date(),
                    },
                    {
                        name: 'Embedded project',
                        type: ProjectType.DEFAULT,
                        dbtConnection: { type: DbtProjectType.NONE },
                        dbtVersion: projectWithSensitiveFields.dbtVersion,
                        warehouseConnection: {
                            type: WarehouseTypes.DUCKDB,
                            connectionType: DuckdbConnectionType.EMBEDDED,
                            dataset: 'jaffle_shop',
                        },
                    },
                    RequestMethod.WEB_APP,
                ),
            ).rejects.toThrow(
                'Embedded DuckDB connections can only be provisioned internally',
            );
        },
    );

    describe('public analytics connection configuration', () => {
        const warehouseConnection = {
            type: WarehouseTypes.DUCKDB as const,
            connectionType: DuckdbConnectionType.ANALYTICS as const,
            database: 'memory' as const,
            schema: 'main' as const,
        };
        const creationUser: SessionUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                { subject: 'Project', action: ['view', 'create'] },
            ]),
            organizationUuid: projectWithSensitiveFields.organizationUuid,
            organizationName: 'Organization',
            organizationCreatedAt: new Date(),
        };
        const createProjectData = {
            name: 'Internal analytics',
            type: ProjectType.DEFAULT,
            dbtConnection: { type: DbtProjectType.NONE as const },
            dbtVersion: projectWithSensitiveFields.dbtVersion,
            warehouseConnection,
        };

        beforeEach(() => {
            vi.clearAllMocks();
        });

        test.each([ProjectType.DEFAULT, ProjectType.PREVIEW])(
            'rejects public analytics provisioning on %s projects',
            async (type) => {
                await expect(
                    service.createWithoutCompile(
                        creationUser,
                        { ...createProjectData, type },
                        RequestMethod.WEB_APP,
                    ),
                ).rejects.toThrow(
                    'Analytics connections can only be provisioned internally',
                );
                expect(
                    projectModel.createWithOptionalCredentials,
                ).not.toHaveBeenCalled();
            },
        );

        test('rejects scheduled creation before creating a job', async () => {
            await expect(
                service.scheduleCreate(
                    creationUser,
                    createProjectData,
                    RequestMethod.WEB_APP,
                ),
            ).rejects.toThrow(
                'Analytics connections can only be provisioned internally',
            );
            expect(jobModel.create).not.toHaveBeenCalled();
            expect(
                schedulerClient.createProjectWithCompile,
            ).not.toHaveBeenCalled();
        });

        test('rejects analytics credentials inherited from an upstream preview', async () => {
            projectModel.getWarehouseCredentialsForProject.mockResolvedValueOnce(
                warehouseConnection,
            );
            await expect(
                service.createWithoutCompile(
                    creationUser,
                    {
                        ...createProjectData,
                        type: ProjectType.PREVIEW,
                        warehouseConnection: undefined,
                        upstreamProjectUuid: projectUuid,
                        copyWarehouseConnectionFromUpstreamProject: true,
                    },
                    RequestMethod.WEB_APP,
                ),
            ).rejects.toThrow(
                'Analytics connections can only be provisioned internally',
            );
            expect(
                projectModel.createWithOptionalCredentials,
            ).not.toHaveBeenCalled();
        });

        test('rejects warehouse credential updates before persistence', async () => {
            await expect(
                service.updateWarehouseCredentials(
                    projectUuid,
                    developerAccount,
                    {
                        warehouseConnection,
                    },
                ),
            ).rejects.toThrow(
                'Analytics connections can only be provisioned internally',
            );
            expect(projectModel.update).not.toHaveBeenCalled();
        });

        test('rejects update-and-compile before persistence or scheduling', async () => {
            await expect(
                service.updateAndScheduleAsyncWork(
                    projectUuid,
                    developerAccount,
                    { ...createProjectData, warehouseConnection },
                    RequestMethod.WEB_APP,
                ),
            ).rejects.toThrow(
                'Analytics connections can only be provisioned internally',
            );
            expect(projectModel.update).not.toHaveBeenCalled();
            expect(jobModel.create).not.toHaveBeenCalled();
        });

        test('rejects warehouse connection tests before accessing the warehouse', async () => {
            await expect(
                service.testWarehouseConnection(
                    developerAccount as RegisteredAccount,
                    projectUuid,
                    warehouseConnection,
                ),
            ).rejects.toThrow(
                'Analytics connections can only be provisioned internally',
            );
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).not.toHaveBeenCalled();
        });
    });

    describe('default AI agent provisioning', () => {
        test('provisions a default AI agent for a playground when the organization already has another project', async () => {
            const createdProjectUuid = 'created-playground-project-uuid';
            const { provisionDefaultAgent, getAiAgentService } =
                getMockedAiAgentService();
            const serviceWithAiAgent = getMockedProjectService(
                lightdashConfigMock,
                { getAiAgentService },
            );
            const creationUser: SessionUser = {
                ...user,
                organizationUuid: projectWithSensitiveFields.organizationUuid,
                organizationName: 'Organization',
                organizationCreatedAt: new Date(),
            };
            const organizationProjects = [
                {
                    ...defaultProject,
                    projectUuid: createdProjectUuid,
                },
                {
                    ...defaultProject,
                    projectUuid: 'existing-project-uuid',
                },
            ];
            projectModel.createWithOptionalCredentials.mockResolvedValueOnce(
                createdProjectUuid,
            );
            projectModel.getAllByOrganizationUuid.mockResolvedValueOnce(
                organizationProjects,
            );
            const validateSpy = vi
                .spyOn(
                    serviceWithAiAgent as unknown as {
                        validateProjectCreationPermissions: () => Promise<true>;
                    },
                    'validateProjectCreationPermissions',
                )
                .mockResolvedValue(true);

            try {
                await serviceWithAiAgent.createWithoutCompile(
                    creationUser,
                    {
                        name: 'Playground',
                        type: ProjectType.DEFAULT,
                        dbtConnection: { type: DbtProjectType.NONE },
                        dbtVersion: projectWithSensitiveFields.dbtVersion,
                        warehouseConnection: {
                            type: WarehouseTypes.DUCKDB,
                            connectionType: DuckdbConnectionType.EMBEDDED,
                            dataset: 'jaffle_shop',
                        },
                    },
                    RequestMethod.WEB_APP,
                    { source: 'playground' },
                );

                expect(provisionDefaultAgent).toHaveBeenCalledWith(
                    creationUser,
                    createdProjectUuid,
                );
            } finally {
                validateSpy.mockRestore();
                projectModel.getAllByOrganizationUuid.mockReset();
            }
        });

        test('does not provision a default AI agent for normal creation when the organization already has multiple projects', async () => {
            const createdProjectUuid = 'created-project-uuid';
            const { provisionDefaultAgent, getAiAgentService } =
                getMockedAiAgentService();
            const serviceWithAiAgent = getMockedProjectService(
                lightdashConfigMock,
                { getAiAgentService },
            );
            const creationUser: SessionUser = {
                ...user,
                organizationUuid: projectWithSensitiveFields.organizationUuid,
                organizationName: 'Organization',
                organizationCreatedAt: new Date(),
            };
            const organizationProjects = [
                {
                    ...defaultProject,
                    projectUuid: createdProjectUuid,
                },
                {
                    ...defaultProject,
                    projectUuid: 'existing-project-uuid-1',
                },
                {
                    ...defaultProject,
                    projectUuid: 'existing-project-uuid-2',
                },
            ];
            projectModel.createWithOptionalCredentials.mockResolvedValueOnce(
                createdProjectUuid,
            );
            projectModel.getAllByOrganizationUuid.mockResolvedValueOnce(
                organizationProjects,
            );
            const validateSpy = vi
                .spyOn(
                    serviceWithAiAgent as unknown as {
                        validateProjectCreationPermissions: () => Promise<true>;
                    },
                    'validateProjectCreationPermissions',
                )
                .mockResolvedValue(true);

            try {
                await serviceWithAiAgent.createWithoutCompile(
                    creationUser,
                    {
                        name: 'Project',
                        type: ProjectType.DEFAULT,
                        dbtConnection: { type: DbtProjectType.NONE },
                        dbtVersion: projectWithSensitiveFields.dbtVersion,
                    },
                    RequestMethod.WEB_APP,
                );

                expect(provisionDefaultAgent).not.toHaveBeenCalled();
            } finally {
                validateSpy.mockRestore();
                projectModel.getAllByOrganizationUuid.mockReset();
            }
        });
    });

    test('rejects embedded DuckDB credentials inherited from an upstream preview', async () => {
        projectModel.getWarehouseCredentialsForProject.mockResolvedValueOnce({
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.EMBEDDED,
            dataset: 'jaffle_shop',
        });

        await expect(
            service.createWithoutCompile(
                {
                    ...user,
                    ability: new Ability<PossibleAbilities>([
                        { subject: 'Project', action: ['view', 'create'] },
                    ]),
                    organizationUuid:
                        projectWithSensitiveFields.organizationUuid,
                    organizationName: 'Organization',
                    organizationCreatedAt: new Date(),
                },
                {
                    name: 'Preview of the playground',
                    type: ProjectType.PREVIEW,
                    upstreamProjectUuid: projectUuid,
                    copyWarehouseConnectionFromUpstreamProject: true,
                    dbtConnection: { type: DbtProjectType.NONE },
                    dbtVersion: projectWithSensitiveFields.dbtVersion,
                },
                RequestMethod.WEB_APP,
            ),
        ).rejects.toThrow(
            'Embedded DuckDB connections can only be provisioned internally',
        );
    });

    test('deletes a playground and records its tombstone in the provisioning lock transaction', async () => {
        const transaction = {};
        const deletingUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                { subject: 'Project', action: 'delete' },
            ]),
        };
        projectModel.getWithSensitiveFields.mockResolvedValueOnce({
            ...projectWithSensitiveFields,
            provisioningSource: 'playground',
        });
        onboardingModel.runInPlaygroundProvisioningLock.mockImplementationOnce(
            async (_organizationUuid, callback) => callback(transaction),
        );

        await service.delete(projectUuid, deletingUser);

        expect(
            onboardingModel.runInPlaygroundProvisioningLock,
        ).toHaveBeenCalledWith(
            projectWithSensitiveFields.organizationUuid,
            expect.any(Function),
        );
        expect(onboardingModel.update).toHaveBeenCalledWith(
            projectWithSensitiveFields.organizationUuid,
            { playgroundProjectDeletedAt: expect.any(Date) },
            transaction,
        );
        expect(projectModel.delete).toHaveBeenCalledWith(
            projectUuid,
            transaction,
        );
        expect(onboardingModel.update.mock.invocationCallOrder[0]).toBeLessThan(
            projectModel.delete.mock.invocationCallOrder[0],
        );
        expect(projectModel.deleteContentInBatches).toHaveBeenCalledWith(
            projectUuid,
        );
        expect(
            projectModel.deleteContentInBatches.mock.invocationCallOrder[0],
        ).toBeLessThan(
            onboardingModel.runInPlaygroundProvisioningLock.mock
                .invocationCallOrder[0],
        );
    });

    describe('refreshTablesAndProjectConfig for a CLI/NONE preview', () => {
        const upstreamProjectUuid = 'upstream-project-uuid';
        const previewProjectUuid = 'preview-project-uuid';
        const upstreamParameter = {
            name: 'status',
            config: { label: 'Status', type: 'string' as const },
        };
        const upstreamTableGroups = { sales: { label: 'Sales' } };
        const upstreamDefaults = { showUnderlyingValues: ['a'] };

        const nonePreviewProject = {
            ...projectWithSensitiveFields,
            projectUuid: previewProjectUuid,
            type: ProjectType.PREVIEW,
            dbtConnection: { type: DbtProjectType.NONE },
            upstreamProjectUuid,
        };
        const upstreamProject = {
            ...projectWithSensitiveFields,
            projectUuid: upstreamProjectUuid,
            dbtConnection: { type: DbtProjectType.NONE },
            projectDefaults: upstreamDefaults,
        };

        const callRefresh = () =>
            (
                service as unknown as {
                    refreshTablesAndProjectConfig: RefreshForTest;
                }
            ).refreshTablesAndProjectConfig(
                { userUuid: user.userUuid },
                previewProjectUuid,
                RequestMethod.WEB_APP,
                undefined,
                async ({ exploreStream, lightdashProjectConfig }) => {
                    const explores = [];
                    for await (const explore of exploreStream) {
                        explores.push(explore);
                    }
                    return { explores, lightdashProjectConfig };
                },
            );

        test('reuses the upstream explores and config instead of compiling from dbt', async () => {
            const buildAdapterSpy = vi.spyOn(
                service as unknown as { prepareCompileAdapter: () => unknown },
                'prepareCompileAdapter',
            );

            (projectModel.get as import('vitest').Mock)
                .mockResolvedValueOnce(nonePreviewProject) // preview
                .mockResolvedValueOnce(upstreamProject); // upstream
            (
                projectModel.getAllExploresFromCache as import('vitest').Mock
            ).mockResolvedValueOnce({ 'explore-uuid': validExplore });
            (
                projectModel.getTableGroups as import('vitest').Mock
            ).mockResolvedValueOnce(upstreamTableGroups);
            (
                service as unknown as {
                    projectParametersModel: { find: import('vitest').Mock };
                }
            ).projectParametersModel.find.mockResolvedValueOnce([
                upstreamParameter,
            ]);

            const result = await callRefresh();

            // Explores + config come from the upstream cache, never a dbt compile
            expect(buildAdapterSpy).not.toHaveBeenCalled();
            expect(projectModel.getAllExploresFromCache).toHaveBeenCalledWith(
                upstreamProjectUuid,
            );
            expect(result.explores).toEqual([validExplore]);
            expect(result.lightdashProjectConfig.parameters).toEqual({
                status: upstreamParameter.config,
            });
            expect(result.lightdashProjectConfig.table_groups).toEqual(
                upstreamTableGroups,
            );
            expect(result.lightdashProjectConfig.defaults).toEqual(
                upstreamDefaults,
            );

            buildAdapterSpy.mockRestore();
        });
    });

    describe('compile-only warehouse work', () => {
        test.each(['create', 'update'] as const)(
            '%s virtual views without credentials or an SSH tunnel',
            async (operation) => {
                const configured = getMockedProjectService(lightdashConfigMock);
                const virtualViewAccount = buildAccount();
                virtualViewAccount.user.ability =
                    new Ability<PossibleAbilities>([
                        { subject: 'Project', action: 'view' },
                        { subject: 'VirtualView', action: 'create' },
                    ]);
                const payload = {
                    name: 'orders_view',
                    sql: 'select order_id from orders',
                    columns: [
                        { reference: 'order_id', type: DimensionType.NUMBER },
                    ],
                };
                projectModel.findExploresFromCache.mockResolvedValueOnce(
                    operation === 'create'
                        ? []
                        : [
                              {
                                  ...validExplore,
                                  name: payload.name,
                                  type: ExploreType.VIRTUAL,
                              },
                          ],
                );
                projectModel.getWarehouseCredentialsForProject.mockResolvedValueOnce(
                    {
                        ...(warehouseClientMock.credentials as CreatePostgresCredentials),
                        startOfWeek: WeekDay.SUNDAY,
                        useSshTunnel: true,
                        requireUserCredentials: true,
                    },
                );
                const settings = vi.spyOn(
                    configured,
                    'getWarehouseSqlBuilderSettings',
                );
                const resolve = vi.spyOn(
                    configured.warehouseClientFactory,
                    'resolveLoadedCredentials',
                );
                const result =
                    operation === 'create'
                        ? await configured.createVirtualView(
                              virtualViewAccount,
                              projectUuid,
                              payload,
                              false,
                          )
                        : await configured.updateVirtualView(
                              virtualViewAccount,
                              projectUuid,
                              payload.name,
                              payload,
                              false,
                          );
                expect(result).toEqual({ name: payload.name });
                expect(settings).toHaveBeenCalledExactlyOnceWith(projectUuid, {
                    kind: 'connection',
                    warehouseConnectionUuid: null,
                });
                const builder =
                    operation === 'create'
                        ? projectModel.createVirtualView.mock.calls.at(-1)?.[2]
                        : projectModel.updateVirtualView.mock.calls.at(-1)?.[3];
                expect(builder?.getStartOfWeek()).toBe(WeekDay.SUNDAY);
                expect(builder?.getAdapterType()).toBe(
                    SupportedDbtAdapter.POSTGRES,
                );
                expect(resolve).not.toHaveBeenCalled();
                expect(
                    configured.userWarehouseCredentialsModel
                        .findForProjectWithSecrets,
                ).not.toHaveBeenCalled();
                expect(SshTunnel).not.toHaveBeenCalled();
                expect(
                    projectModel.getWarehouseClientFromCredentials,
                ).not.toHaveBeenCalled();
            },
        );
    });

    describe('scoped query tunnel lifecycle', () => {
        const fileUrl = 'https://example.test/results';
        const adminAccount = {
            ...account,
            user: {
                ...account.user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'all', action: 'manage' },
                ]),
            },
        } as typeof account;
        const indexColumn = {
            reference: 'a_dim1',
            type: VizIndexType.CATEGORY,
        };
        const valuesColumns = [
            {
                reference: 'tc',
                aggregation: VizAggregationOptions.SUM,
            },
        ];
        const payload = {
            userUuid: user.userUuid,
            organizationUuid: projectSummary.organizationUuid,
            projectUuid,
            sql: 'SELECT a_dim1, tc FROM events',
            limit: 10,
            context: QueryExecutionContext.SQL_RUNNER,
        };
        const warehouseTables = [
            {
                database: 'catalog_database',
                schema: 'public',
                table: 'orders',
                tableType: WarehouseTableType.TABLE,
            },
        ];
        const warehouseCatalog = {
            catalog_database: {
                public: {
                    orders: { tableType: WarehouseTableType.TABLE },
                },
            },
        };
        const fields = { order_id: DimensionType.NUMBER };
        const cases = [
            {
                name: 'populateWarehouseTablesCache',
                run: (configured: ProjectService) =>
                    configured.populateWarehouseTablesCache(user, projectUuid),
                expected: warehouseCatalog,
                method: 'getAllTables' as const,
                queryContext: null,
                binding: { kind: 'connection', warehouseConnectionUuid: null },
                userUuid: user.userUuid,
            },
            ...[
                QueryExecutionContext.AI,
                QueryExecutionContext.MCP_RUN_SQL,
            ].map((queryContext) => ({
                name: `getWarehouseTables ${queryContext}`,
                run: (configured: ProjectService) =>
                    configured.getWarehouseTables(
                        user,
                        projectUuid,
                        queryContext,
                    ),
                expected: warehouseCatalog,
                method: 'getAllTables' as const,
                queryContext,
                binding: { kind: 'connection', warehouseConnectionUuid: null },
                userUuid: user.userUuid,
            })),
            {
                name: 'getWarehouseFields',
                run: (configured: ProjectService) =>
                    configured.getWarehouseFields(
                        user,
                        projectUuid,
                        QueryExecutionContext.AI,
                        'orders',
                        'public',
                        'catalog_database',
                    ),
                expected: fields,
                method: 'getFields' as const,
                queryContext: QueryExecutionContext.AI,
                binding: { kind: 'connection', warehouseConnectionUuid: null },
                userUuid: user.userUuid,
            },

            {
                name: 'runMetricQuery',
                run: (configured: ProjectService) =>
                    configured.runMetricQuery({
                        account,
                        projectUuid,
                        metricQuery: metricQueryMock,
                        exploreName: validExplore.name,
                        explore: validExplore,
                        csvLimit: undefined,
                        context: QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                        queryTags: {},
                        chartUuid: undefined,
                    }),
                expected: {
                    rows: resultsWith1Row.rows,
                    cacheMetadata: { cacheHit: false },
                    warehouseType: WarehouseTypes.POSTGRES,
                },
                method: 'runQuery' as const,
                queryContext: QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                binding: { kind: 'explore', exploreName: validExplore.name },
                userUuid: account.user.id,
            },
            {
                name: 'runAgentMarkerProbe',
                run: (configured: ProjectService) =>
                    configured.runAgentMarkerProbe(
                        adminAccount,
                        projectUuid,
                        null,
                        'SELECT 1',
                    ),
                expected: resultsWith1Row.rows,
                method: 'runQuery' as const,
                queryContext: QueryExecutionContext.AI,
                binding: { kind: 'connection', warehouseConnectionUuid: null },
                userUuid: account.user.id,
            },
            {
                name: 'runSqlQuery',
                run: (configured: ProjectService) =>
                    configured.runSqlQuery(user, projectUuid, 'SELECT 1', {
                        kind: 'connection',
                        warehouseConnectionUuid: null,
                    }),
                expected: resultsWith1Row,
                method: 'runQuery' as const,
                queryContext: null,
                binding: { kind: 'connection', warehouseConnectionUuid: null },
                userUuid: user.userUuid,
            },
            {
                name: 'streamSqlQueryIntoFile',
                run: (configured: ProjectService) =>
                    configured.streamSqlQueryIntoFile(payload),
                expected: {
                    fileUrl,
                    columns: Object.entries(resultsWith1Row.fields).map(
                        ([reference, field]) => ({
                            reference,
                            type: field.type,
                        }),
                    ),
                },
                method: 'streamQuery' as const,
                queryContext: payload.context,
                binding: { kind: 'connection', warehouseConnectionUuid: null },
                userUuid: user.userUuid,
            },
            ...[undefined, 'saved-sql-chart'].map((sqlChartUuid) => ({
                name: sqlChartUuid
                    ? 'pivotQueryWorkerTask saved chart'
                    : 'pivotQueryWorkerTask',
                run: (configured: ProjectService) =>
                    configured.pivotQueryWorkerTask({
                        ...payload,
                        sqlChartUuid,
                        indexColumn,
                        valuesColumns,
                        groupByColumns: undefined,
                        sortBy: undefined,
                    }),
                expected: {
                    fileUrl,
                    indexColumn: [indexColumn],
                    valuesColumns: [
                        {
                            referenceField: 'tc',
                            pivotColumnName: 'tc_sum',
                            aggregation: VizAggregationOptions.SUM,
                            pivotValues: [],
                        },
                    ],
                },
                method: 'streamQuery' as const,
                queryContext: payload.context,
                binding: sqlChartUuid
                    ? { kind: 'sqlChart', savedSqlUuid: sqlChartUuid }
                    : { kind: 'connection', warehouseConnectionUuid: null },
                userUuid: user.userUuid,
            })),
            {
                name: 'searchFieldUniqueValues',
                run: (configured: ProjectService) =>
                    configured.searchFieldUniqueValues(
                        user,
                        projectUuid,
                        'a',
                        'a_dim1',
                        '',
                        10,
                        undefined,
                        false,
                        undefined,
                        undefined,
                        QueryExecutionContext.MCP_SEARCH_FIELD_VALUES,
                    ),
                expected: { results: ['val1'], search: '', cached: false },
                method: 'runQuery' as const,
                queryContext: QueryExecutionContext.MCP_SEARCH_FIELD_VALUES,
                binding: { kind: 'explore', exploreName: validExplore.name },
                userUuid: user.userUuid,
            },
        ];

        const setup = () => {
            const writer = vi.fn();
            const streamFunction = vi.fn<DownloadFileModel['streamFunction']>(
                () => async (_url, callback) => {
                    await callback(writer);
                    expect(
                        vi.mocked(SshTunnel).mock.results.at(-1)?.value
                            .disconnect,
                    ).not.toHaveBeenCalled();
                    return fileUrl;
                },
            );
            const configured = getMockedProjectService(
                {
                    ...lightdashConfigMock,
                    results: {
                        ...lightdashConfigMock.results,
                        cacheEnabled: false,
                        autocompleteEnabled: false,
                    },
                },
                {
                    downloadFileModel: {
                        streamFunction,
                    } as unknown as DownloadFileModel,
                },
            );
            Object.assign(configured.warehouseAvailableTablesModel, {
                createAvailableTablesForProjectWarehouseCredentials: vi.fn(
                    async () => undefined,
                ),
                createAvailableTablesForUserWarehouseCredentials: vi.fn(
                    async () => undefined,
                ),
            });
            const client = {
                ...warehouseClientMock,
                getAllTables: vi.fn<WarehouseClient['getAllTables']>(
                    async () => warehouseTables,
                ),
                getFields: vi.fn<WarehouseClient['getFields']>(async () => ({
                    catalog_database: { public: { orders: fields } },
                })),

                runQuery: vi.fn(async () => resultsWith1Row),
                streamQuery: vi.fn<WarehouseClient['streamQuery']>(
                    async (_sql, callback) => {
                        await callback(resultsWith1Row);
                    },
                ),
            };
            projectModel.getWarehouseClientFromCredentials.mockReturnValueOnce(
                client,
            );
            const scoped = vi.spyOn(
                configured.warehouseClientFactory,
                'withWarehouseClient',
            );
            const resolve = vi.spyOn(
                configured.warehouseClientFactory,
                'resolveLoadedCredentials',
            );
            return { configured, client, writer, scoped, resolve };
        };

        test.each(cases)(
            '$name releases once after success and preserves the result',
            async (site) => {
                const { configured, client, writer, scoped, resolve } = setup();
                await expect(site.run(configured)).resolves.toMatchObject(
                    site.expected,
                );
                expect(resolve).toHaveBeenCalledOnce();
                expect(client[site.method]).toHaveBeenCalledOnce();
                expect(
                    vi.mocked(SshTunnel).mock.results.at(-1)?.value.disconnect,
                ).toHaveBeenCalledOnce();
                expect(scoped).toHaveBeenCalledExactlyOnceWith(
                    expect.objectContaining({
                        kind: 'binding',
                        projectUuid,
                        binding: site.binding,
                    }),
                    expect.objectContaining({
                        organizationUuid: projectSummary.organizationUuid,
                        queryContext: site.queryContext,
                        aiAccess:
                            site.name === 'runAgentMarkerProbe'
                                ? 'diagnostic'
                                : 'enforce',
                        actor: expect.objectContaining({
                            person: {
                                userUuid: site.userUuid,
                                isRegisteredUser: true,
                                isServiceAccount: false,
                            },
                        }),
                    }),
                    expect.any(Function),
                );
                expect(
                    projectModel.getWarehouseClientFromCredentials,
                ).toHaveBeenLastCalledWith(
                    warehouseClientMock.credentials,
                    expect.objectContaining({
                        agentSession:
                            site.queryContext !== null &&
                            isAiAccessQueryContext(site.queryContext),
                    }),
                );
                if (site.method === 'streamQuery') {
                    expect(writer).toHaveBeenCalledOnce();
                    expect(writer.mock.calls[0][0]).toEqual(
                        resultsWith1Row.rows[0],
                    );
                }
            },
        );

        test.each(cases)(
            '$name releases once and preserves the warehouse error',
            async (site) => {
                const { configured, client } = setup();
                const error = new WarehouseConnectionError(
                    'warehouse query failed',
                );
                client[site.method].mockRejectedValueOnce(error);
                await expect(site.run(configured)).rejects.toBe(error);
                expect(client[site.method]).toHaveBeenCalledOnce();
                expect(
                    vi.mocked(SshTunnel).mock.results.at(-1)?.value.disconnect,
                ).toHaveBeenCalledOnce();
            },
        );

        test.each([
            undefined,
            QueryExecutionContext.SQL_RUNNER,
            QueryExecutionContext.API,
        ])(
            'catalog cache reads resolve once without acquiring a client for %s',
            async (context) => {
                const configured = getMockedProjectService(lightdashConfigMock);
                const getTables = vi.fn(async () => warehouseCatalog);
                Object.assign(configured.warehouseAvailableTablesModel, {
                    getTablesForProjectWarehouseCredentials: getTables,
                });
                const acquire = vi.spyOn(
                    configured.warehouseClientFactory,
                    'acquireUnscoped',
                );
                const resolve = vi.spyOn(
                    configured.warehouseClientFactory,
                    'resolveLoadedCredentials',
                );
                await expect(
                    configured.getWarehouseTables(user, projectUuid, context),
                ).resolves.toEqual(warehouseCatalog);
                expect(getTables).toHaveBeenCalledExactlyOnceWith(projectUuid);
                expect(resolve).toHaveBeenCalledOnce();
                expect(acquire).not.toHaveBeenCalled();
                expect(SshTunnel).not.toHaveBeenCalled();
            },
        );

        test('catalog cache reads use the personal credential cache without acquiring a client', async () => {
            const configured = getMockedProjectService(lightdashConfigMock);
            const getTables = vi.fn(async () => warehouseCatalog);
            Object.assign(configured.warehouseAvailableTablesModel, {
                getTablesForUserWarehouseCredentials: getTables,
            });
            projectModel.getWarehouseCredentialsForProject.mockResolvedValueOnce(
                {
                    ...(warehouseClientMock.credentials as CreatePostgresCredentials),
                    requireUserCredentials: true,
                },
            );
            vi.spyOn(
                configured.userWarehouseCredentialsModel,
                'findForProjectWithSecrets',
            ).mockResolvedValue({
                uuid: 'personal-catalog-credentials',
                credentials:
                    warehouseClientMock.credentials as CreatePostgresCredentials,
                expiresAt: null,
            });
            const acquire = vi.spyOn(
                configured.warehouseClientFactory,
                'acquireUnscoped',
            );
            await expect(
                configured.getWarehouseTables(user, projectUuid),
            ).resolves.toEqual(warehouseCatalog);
            expect(getTables).toHaveBeenCalledExactlyOnceWith(
                'personal-catalog-credentials',
            );
            expect(acquire).not.toHaveBeenCalled();
            expect(SshTunnel).not.toHaveBeenCalled();
        });

        test('catalog cache writes release the tunnel after a failure', async () => {
            const { configured } = setup();
            const error = new Error('cache write failed');
            vi.mocked(
                configured.warehouseAvailableTablesModel
                    .createAvailableTablesForProjectWarehouseCredentials,
            ).mockRejectedValueOnce(error);
            await expect(
                configured.populateWarehouseTablesCache(user, projectUuid),
            ).rejects.toBe(error);
            expect(
                vi.mocked(SshTunnel).mock.results.at(-1)?.value.disconnect,
            ).toHaveBeenCalledOnce();
        });

        test('catalog population writes to the personal credential cache', async () => {
            const { configured } = setup();
            projectModel.getWarehouseCredentialsForProject.mockResolvedValueOnce(
                {
                    ...(warehouseClientMock.credentials as CreatePostgresCredentials),
                    requireUserCredentials: true,
                },
            );
            vi.spyOn(
                configured.userWarehouseCredentialsModel,
                'findForProjectWithSecrets',
            ).mockResolvedValue({
                uuid: 'personal-catalog-credentials',
                credentials:
                    warehouseClientMock.credentials as CreatePostgresCredentials,
                expiresAt: null,
            });
            await expect(
                configured.populateWarehouseTablesCache(user, projectUuid),
            ).resolves.toEqual(warehouseCatalog);
            expect(
                configured.warehouseAvailableTablesModel
                    .createAvailableTablesForUserWarehouseCredentials,
            ).toHaveBeenCalledExactlyOnceWith(
                'personal-catalog-credentials',
                warehouseTables,
            );
            expect(
                configured.warehouseAvailableTablesModel
                    .createAvailableTablesForProjectWarehouseCredentials,
            ).not.toHaveBeenCalled();
            expect(
                vi.mocked(SshTunnel).mock.results.at(-1)?.value.disconnect,
            ).toHaveBeenCalledOnce();
        });

        test('field validation releases the tunnel before a missing schema error', async () => {
            const { configured, client } = setup();
            await expect(
                configured.getWarehouseFields(
                    user,
                    projectUuid,
                    QueryExecutionContext.SQL_RUNNER,
                    'orders',
                    undefined,
                    'catalog_database',
                ),
            ).rejects.toThrow('Schema name is required');
            expect(client.getFields).not.toHaveBeenCalled();
            expect(
                vi.mocked(SshTunnel).mock.results.at(-1)?.value.disconnect,
            ).toHaveBeenCalledOnce();
        });

        test('field lookup keeps the not-found translation and releases the tunnel', async () => {
            const { configured, client } = setup();
            client.getFields.mockRejectedValueOnce(
                new Error('warehouse failure'),
            );
            await expect(
                configured.getWarehouseFields(
                    user,
                    projectUuid,
                    QueryExecutionContext.SQL_RUNNER,
                    'orders',
                    'public',
                    'catalog_database',
                ),
            ).rejects.toThrow(
                'Could not find table "orders" in schema "public" of database "catalog_database". Please verify the table exists and you have access to it.',
            );
            expect(
                vi.mocked(SshTunnel).mock.results.at(-1)?.value.disconnect,
            ).toHaveBeenCalledOnce();
        });

        test.each([
            [
                'cache hit',
                JSON.stringify({ results: ['cached'], cached: true }),
                ['cached'],
                0,
            ],
            ['invalid cache', '{', ['val1'], 1],
        ] as const)(
            'autocomplete releases once after %s',
            async (_name, cached, results, queryCount) => {
                const { configured, client } = setup();
                Object.assign(configured, {
                    lightdashConfig: {
                        ...lightdashConfigMock,
                        results: {
                            ...lightdashConfigMock.results,
                            autocompleteEnabled: true,
                        },
                    },
                    s3CacheClient: {
                        getIfFresh: vi.fn(async () => cached),
                        uploadResults: vi.fn(async () => undefined),
                    },
                });
                await expect(
                    configured.searchFieldUniqueValues(
                        user,
                        projectUuid,
                        'a',
                        'a_dim1',
                        '',
                        10,
                        undefined,
                    ),
                ).resolves.toMatchObject({ results });
                expect(client.runQuery).toHaveBeenCalledTimes(queryCount);
                expect(
                    vi.mocked(SshTunnel).mock.results.at(-1)?.value.disconnect,
                ).toHaveBeenCalledOnce();
            },
        );
    });

    describe('connection SQL runner scoped clients', () => {
        const registeredAccount = account as RegisteredAccount;
        const connectionUuid = 'sql-runner-extra-uuid';
        const credentials: CreatePostgresCredentials = {
            type: WarehouseTypes.POSTGRES,
            host: 'warehouse.internal',
            port: 5432,
            user: 'warehouse-user',
            password: 'password',
            dbname: 'default_database',
            schema: 'public',
        };
        const tables: WarehouseTables = [
            {
                database: 'listed_database',
                schema: 'public',
                table: 'orders',
                tableType: WarehouseTableType.TABLE,
            },
        ];
        const fields: WarehouseTableSchema = { order_id: DimensionType.NUMBER };
        const catalog = {
            listed_database: {
                public: {
                    orders: {
                        partitionColumn: undefined,
                        tableType: WarehouseTableType.TABLE,
                    },
                },
            },
        };
        const scope = {
            projectUuid,
            warehouseConnectionUuid: connectionUuid,
            userWarehouseCredentialsUuid: null,
        };
        const setup = () => {
            const configured = getMockedProjectService(lightdashConfigMock);
            const connection: WarehouseConnection = {
                warehouseConnectionUuid: connectionUuid,
                projectUuid,
                name: 'SQL runner connection',
                isOriginal: false,
                warehouseType: WarehouseTypes.POSTGRES,
                organizationWarehouseCredentialsUuid: null,
                listAllDatabases: false,
                additionalDatabases: ['listed_database'],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            vi.spyOn(
                configured.projectModel,
                'getConnectionRoute',
            ).mockResolvedValueOnce('multi');
            vi.spyOn(
                configured.projectModel,
                'resolveWarehouseCredentialReadWithRoute',
            ).mockResolvedValueOnce({
                route: 'multi',
                target: {
                    kind: 'extra',
                    warehouseConnectionUuid: connectionUuid,
                },
                originalWarehouseConnectionUuid: 'original-uuid',
            });
            const project = {
                projectUuid,
                organizationUuid: projectSummary.organizationUuid,
                connectionMode: 'multi' as const,
                originalWarehouseType: WarehouseTypes.POSTGRES,
            };
            Object.assign(configured.warehouseConnectionModel, {
                getProject: vi
                    .fn<WarehouseConnectionModel['getProject']>()
                    .mockResolvedValue(project),
                get: vi
                    .fn<WarehouseConnectionModel['get']>()
                    .mockResolvedValue(connection),
                getExtraCredentialSource: vi
                    .fn<WarehouseConnectionModel['getExtraCredentialSource']>()
                    .mockResolvedValue({
                        credentials,
                        organizationWarehouseCredentialsUuid: null,
                    }),
                list: vi
                    .fn<WarehouseConnectionModel['list']>()
                    .mockResolvedValue([connection]),
            });
            const getTables = vi
                .fn<WarehouseConnectionTablesModel['getTables']>()
                .mockResolvedValue(null);
            const replaceTables = vi
                .fn<WarehouseConnectionTablesModel['replaceTables']>()
                .mockResolvedValue(undefined);
            const clearTables = vi
                .fn<WarehouseConnectionTablesModel['clearTables']>()
                .mockResolvedValue(undefined);
            Object.assign(configured.warehouseConnectionTablesModel, {
                getTables,
                replaceTables,
                clearTables,
            });
            const client = {
                ...warehouseClientMock,
                getTablesForDatabase: vi
                    .fn<WarehouseClient['getTablesForDatabase']>()
                    .mockResolvedValue(tables),
                getFields: vi
                    .fn<WarehouseClient['getFields']>()
                    .mockResolvedValue({
                        listed_database: { public: { orders: fields } },
                    }),
            };
            const disconnect = vi
                .fn<() => Promise<void>>()
                .mockResolvedValue(undefined);
            const acquire = vi
                .spyOn(configured.warehouseClientFactory, 'acquireUnscoped')
                .mockResolvedValue({
                    warehouseClient: client,
                    sshTunnel: {
                        disconnect,
                    } as unknown as SshTunnel<CreateWarehouseCredentials>,
                    tunnelConnectMs: null,
                });
            const resolve = vi.spyOn(
                configured.warehouseClientFactory,
                'resolveWarehouseCredentials',
            );
            return {
                configured,
                connection,
                client,
                acquire,
                resolve,
                disconnect,
                getTables,
                replaceTables,
                clearTables,
            };
        };

        test('a connection table cache hit resolves credentials and builds no client', async () => {
            const { configured, getTables, acquire, resolve, disconnect } =
                setup();
            getTables.mockResolvedValue(catalog);
            await expect(
                configured.getConnectionTables(
                    registeredAccount,
                    projectUuid,
                    connectionUuid,
                    'listed_database',
                ),
            ).resolves.toEqual(catalog);
            expect(resolve).toHaveBeenCalledExactlyOnceWith(
                {
                    kind: 'binding',
                    projectUuid,
                    binding: {
                        kind: 'connection',
                        warehouseConnectionUuid: connectionUuid,
                    },
                },
                connectionContextFromUser(
                    {
                        userUuid: registeredAccount.user.userUuid,
                        isRegisteredUser: true,
                    },
                    {
                        organizationUuid: projectSummary.organizationUuid,
                        queryContext: null,
                    },
                ),
            );
            expect(getTables).toHaveBeenCalledExactlyOnceWith(
                scope,
                'listed_database',
            );
            expect(acquire).not.toHaveBeenCalled();
            expect(disconnect).not.toHaveBeenCalled();
        });

        test('a connection table cache miss builds one client and releases once', async () => {
            const {
                configured,
                getTables,
                replaceTables,
                client,
                acquire,
                resolve,
                disconnect,
            } = setup();
            await expect(
                configured.getConnectionTables(
                    registeredAccount,
                    projectUuid,
                    connectionUuid,
                    'listed_database',
                ),
            ).resolves.toEqual(catalog);
            expect(getTables).toHaveBeenCalledExactlyOnceWith(
                scope,
                'listed_database',
            );
            expect(resolve).toHaveBeenCalledOnce();
            expect(acquire).toHaveBeenCalledExactlyOnceWith(
                projectUuid,
                expect.objectContaining(credentials),
                { aiPlan: null, agentSession: false },
                undefined,
                projectSummary.organizationUuid,
                expect.objectContaining({
                    cacheEnabled: true,
                    wrapConstructionErrors: false,
                }),
            );
            expect(client.getTablesForDatabase).toHaveBeenCalledExactlyOnceWith(
                {
                    name: 'listed_database',
                    database: 'listed_database',
                    schema: null,
                    isDefault: false,
                },
                { query_context: QueryExecutionContext.SQL_RUNNER },
            );
            expect(replaceTables).toHaveBeenCalledExactlyOnceWith(
                scope,
                'listed_database',
                tables,
            );
            expect(disconnect).toHaveBeenCalledOnce();
        });

        test.each(['success', 'warehouse failure', 'other failure'] as const)(
            'connection fields use listed-database credentials and release once on %s',
            async (outcome) => {
                const { configured, client, acquire, resolve, disconnect } =
                    setup();
                const error =
                    outcome === 'warehouse failure'
                        ? new WarehouseConnectionError('field read failed')
                        : new Error('field read failed');
                if (outcome !== 'success')
                    client.getFields.mockRejectedValueOnce(error);
                const result = configured.getConnectionTableFields(
                    registeredAccount,
                    projectUuid,
                    connectionUuid,
                    {
                        databaseName: 'listed_database',
                        schemaName: 'public',
                        tableName: 'orders',
                    },
                );
                if (outcome === 'success')
                    await expect(result).resolves.toEqual(fields);
                else if (outcome === 'warehouse failure')
                    await expect(result).rejects.toBe(error);
                else
                    await expect(result).rejects.toThrow(
                        'Could not find table "orders" in schema "public" of database "listed_database". Please verify the table exists and you have access to it.',
                    );
                expect(resolve).toHaveBeenCalledOnce();
                expect(acquire).toHaveBeenCalledExactlyOnceWith(
                    projectUuid,
                    expect.objectContaining({
                        ...credentials,
                        dbname: 'listed_database',
                    }),
                    { aiPlan: null, agentSession: false },
                    undefined,
                    projectSummary.organizationUuid,
                    expect.objectContaining({
                        cacheEnabled: true,
                        wrapConstructionErrors: false,
                    }),
                );
                expect(client.getFields).toHaveBeenCalledExactlyOnceWith(
                    'orders',
                    'public',
                    'listed_database',
                    {
                        organization_uuid:
                            registeredAccount.organization.organizationUuid,
                        project_uuid: projectUuid,
                        user_uuid: registeredAccount.user.userUuid,
                        query_context: QueryExecutionContext.SQL_RUNNER,
                    },
                );
                expect(disconnect).toHaveBeenCalledOnce();
            },
        );

        test('refreshing connection tables clears the cache without building a client', async () => {
            const {
                configured,
                connection,
                clearTables,
                acquire,
                resolve,
                disconnect,
            } = setup();
            connection.listAllDatabases = true;
            await expect(
                configured.refreshConnectionTables(
                    registeredAccount,
                    projectUuid,
                    connectionUuid,
                ),
            ).resolves.toBeUndefined();
            expect(clearTables).toHaveBeenCalledExactlyOnceWith(scope);
            expect(resolve).toHaveBeenCalledOnce();
            expect(acquire).not.toHaveBeenCalled();
            expect(disconnect).not.toHaveBeenCalled();
        });

        test('a static database listing builds no client', async () => {
            const { configured, acquire, resolve } = setup();
            vi.spyOn(
                configured.projectModel,
                'getConnectionRoute',
            ).mockResolvedValueOnce('multi');
            await expect(
                configured.getConnectionDatabases(
                    registeredAccount,
                    projectUuid,
                    connectionUuid,
                ),
            ).resolves.toMatchObject({
                databases: [
                    {
                        name: 'default_database',
                        database: 'default_database',
                        schema: null,
                        isDefault: true,
                    },
                    {
                        name: 'listed_database',
                        database: 'listed_database',
                        schema: null,
                        isDefault: false,
                    },
                ],
                truncated: false,
            });
            expect(resolve).toHaveBeenCalledOnce();
            expect(acquire).not.toHaveBeenCalled();
        });

        test('connection agent reads keep discarding the resolved AI plan at construction', async () => {
            const { configured, acquire, resolve, disconnect } = setup();
            const plan: AiExecutionPlan = {
                identity: 'connected_person',
                identityUuid: 'ai-identity',
                credentials,
                assurances: [],
                audit: {
                    actorKind: 'person',
                    personUuid: registeredAccount.user.userUuid,
                    principalRef: 'agent',
                    queryTags: {},
                },
            };
            const resolvePlan = vi
                .spyOn(configured.aiAccessService, 'resolvePlan')
                .mockResolvedValue(plan);
            await configured.getConnectionTables(
                registeredAccount,
                projectUuid,
                connectionUuid,
                'listed_database',
                QueryExecutionContext.AI,
            );
            expect(resolve).toHaveBeenCalledOnce();
            expect(resolvePlan).toHaveBeenCalledOnce();
            expect(acquire).toHaveBeenCalledExactlyOnceWith(
                projectUuid,
                expect.objectContaining(credentials),
                { aiPlan: null, agentSession: true },
                undefined,
                projectSummary.organizationUuid,
                expect.objectContaining({
                    cacheEnabled: true,
                    wrapConstructionErrors: false,
                }),
            );
            expect(disconnect).toHaveBeenCalledOnce();
        });
    });

    test('rejects SQL Runner on managed analytics before executing a query', async () => {
        vi.spyOn(analyticsMock, 'track');
        projectModel.getSummary.mockResolvedValueOnce({
            ...projectSummary,
            provisioningSource: 'analytics',
        });
        await expect(
            service.runSqlQuery(user, projectUuid, 'SELECT 1', {
                kind: 'connection',
                warehouseConnectionUuid: null,
            }),
        ).rejects.toThrow(
            'SQL Runner is unavailable for managed analytics projects',
        );
        expect(analyticsMock.track).not.toHaveBeenCalled();
    });

    test('should run sql query', async () => {
        const track = vi.spyOn(analyticsMock, 'track');
        vi.mocked(track).mockClear();
        const getConnectionRoute = vi.spyOn(projectModel, 'getConnectionRoute');
        vi.mocked(getConnectionRoute).mockClear();
        const result = await service.runSqlQuery(
            user,
            projectUuid,
            'fake sql',
            {
                kind: 'connection',
                warehouseConnectionUuid: null,
            },
        );

        expect(result).toEqual(resultsWith1Row);
        expect(getConnectionRoute).not.toHaveBeenCalled();
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'query.executed',
                properties: expect.objectContaining({
                    organizationId: projectSummary.organizationUuid,
                    projectId: projectUuid,
                    warehouseConnectionId: null,
                    connectionKind: null,
                    warehouseType: WarehouseTypes.POSTGRES,
                    connectionCount: null,
                    context: QueryExecutionContext.SQL_RUNNER,
                }),
            }),
        );
        getConnectionRoute.mockRestore();
        track.mockRestore();
    });

    test('tracks a multi route primary query without analytics registry reads', async () => {
        const resolve = vi
            .spyOn(projectModel, 'resolveWarehouseCredentialReadWithRoute')
            .mockResolvedValueOnce({
                route: 'multi',
                target: { kind: 'original' },
                originalWarehouseConnectionUuid: 'original-connection-uuid',
            });
        const getConnectionRoute = vi.spyOn(projectModel, 'getConnectionRoute');
        vi.mocked(getConnectionRoute).mockClear();
        const warehouseConnectionModel = Reflect.get(
            service,
            'warehouseConnectionModel',
        ) as unknown as Record<string, unknown>;
        const getProject = vi.fn();
        const list = vi.fn();
        Object.assign(warehouseConnectionModel, { getProject, list });
        const track = vi.spyOn(analyticsMock, 'track');
        vi.mocked(track).mockClear();
        try {
            await service.runSqlQuery(user, projectUuid, 'fake sql', {
                kind: 'connection',
                warehouseConnectionUuid: null,
            });
            expect(resolve).toHaveBeenCalledExactlyOnceWith(projectUuid, {
                kind: 'connection',
                warehouseConnectionUuid: null,
            });
            expect(getConnectionRoute).not.toHaveBeenCalled();
            expect(getProject).not.toHaveBeenCalled();
            expect(list).not.toHaveBeenCalled();
            expect(track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'query.executed',
                    properties: expect.objectContaining({
                        warehouseConnectionId: 'original-connection-uuid',
                        connectionKind: 'primary',
                        connectionCount: null,
                    }),
                }),
            );
        } finally {
            resolve.mockRestore();
            getConnectionRoute.mockRestore();
            delete warehouseConnectionModel.getProject;
            delete warehouseConnectionModel.list;
            track.mockRestore();
        }
    });

    test('tracks a capped sidebar database list without names', async () => {
        const connection = {
            warehouseConnectionUuid: 'connection-uuid',
            listAllDatabases: false,
            additionalDatabases: Array.from(
                { length: 100 },
                (_, index) => `database_${index}`,
            ),
        };
        const credentials: CreatePostgresCredentials = {
            type: WarehouseTypes.POSTGRES,
            host: 'warehouse.internal',
            user: 'user',
            password: 'password',
            port: 5432,
            dbname: 'analytics',
            schema: 'public',
        };
        const context = vi.fn(async () => ({
            connection,
            credentials,
            resolution: {
                warehouseCredentials: credentials,
                aiPlan: null,
                warehouseConnectionUuid: connection.warehouseConnectionUuid,
                connectionRoute: null,
                credentialKind: WarehouseCredentialKind.SHARED,
            },
            connectionContext: connectionContextFromUser(
                { userUuid: user.userUuid },
                {
                    organizationUuid: projectSummary.organizationUuid,
                    queryContext: null,
                },
            ),
            organizationUuid: projectSummary.organizationUuid,
        }));
        Object.assign(service, { getConnectionSqlRunnerContext: context });
        const route = vi
            .spyOn(
                projectModel as unknown as Pick<
                    ProjectModel,
                    'getConnectionRoute'
                >,
                'getConnectionRoute',
            )
            .mockResolvedValue('multi');
        const warehouseConnectionModel = Reflect.get(
            service,
            'warehouseConnectionModel',
        ) as unknown as Record<string, unknown>;
        Object.assign(warehouseConnectionModel, {
            getProject: vi.fn(async () => ({
                projectUuid,
                organizationUuid: projectSummary.organizationUuid,
                originalWarehouseType: WarehouseTypes.POSTGRES,
            })),
            list: vi.fn(async () => [
                {
                    warehouseConnectionUuid: 'primary-uuid',
                    isOriginal: true,
                    warehouseType: WarehouseTypes.POSTGRES,
                },
                {
                    warehouseConnectionUuid: connection.warehouseConnectionUuid,
                    isOriginal: false,
                    warehouseType: WarehouseTypes.POSTGRES,
                },
            ]),
        });
        const track = vi.spyOn(analyticsMock, 'trackAccount');
        vi.mocked(track).mockClear();
        try {
            const listing = await service.getConnectionDatabases(
                account as RegisteredAccount,
                projectUuid,
                connection.warehouseConnectionUuid,
            );
            expect(listing.databases).toHaveLength(100);
            expect(track).toHaveBeenCalledWith(
                account,
                expect.objectContaining({
                    event: 'sql_runner.database_list_succeeded',
                    properties: expect.objectContaining({
                        organizationId: projectSummary.organizationUuid,
                        projectId: projectUuid,
                        warehouseConnectionId:
                            connection.warehouseConnectionUuid,
                        connectionKind: 'extra',
                        warehouseType: WarehouseTypes.POSTGRES,
                        connectionCount: 2,
                        databaseCount: 100,
                        truncated: true,
                        limit: 100,
                    }),
                }),
            );
        } finally {
            delete (service as unknown as Record<string, unknown>)
                .getConnectionSqlRunnerContext;
            delete warehouseConnectionModel.getProject;
            delete warehouseConnectionModel.list;
            route.mockRestore();
            track.mockRestore();
        }
    });

    test('preserves a database list result when analytics throws', async () => {
        const connection = {
            warehouseConnectionUuid: 'connection-uuid',
            listAllDatabases: false,
            additionalDatabases: [],
        };
        const credentials: CreatePostgresCredentials = {
            type: WarehouseTypes.POSTGRES,
            host: 'warehouse.internal',
            user: 'user',
            password: 'password',
            port: 5432,
            dbname: 'analytics',
            schema: 'public',
        };
        Object.assign(service, {
            getConnectionSqlRunnerContext: vi.fn(async () => ({
                connection,
                credentials,
                resolution: {
                    warehouseCredentials: credentials,
                    aiPlan: null,
                    warehouseConnectionUuid: connection.warehouseConnectionUuid,
                    connectionRoute: null,
                    credentialKind: WarehouseCredentialKind.SHARED,
                },
                connectionContext: connectionContextFromUser(
                    { userUuid: user.userUuid },
                    {
                        organizationUuid: projectSummary.organizationUuid,
                        queryContext: null,
                    },
                ),
                organizationUuid: projectSummary.organizationUuid,
            })),
        });
        const track = vi
            .spyOn(analyticsMock, 'trackAccount')
            .mockImplementationOnce(() => {
                throw new Error('analytics sink failed');
            });
        try {
            await expect(
                service.getConnectionDatabases(
                    account as RegisteredAccount,
                    projectUuid,
                    connection.warehouseConnectionUuid,
                ),
            ).resolves.toMatchObject({
                databases: [{ name: 'analytics' }],
            });
            expect(vi.mocked(track)).toHaveBeenCalledOnce();
        } finally {
            delete (service as unknown as Record<string, unknown>)
                .getConnectionSqlRunnerContext;
            track.mockRestore();
        }
    });

    test('tracks an Athena Glue database-list denial with a safe reason', async () => {
        const connection = {
            warehouseConnectionUuid: 'connection-uuid',
            listAllDatabases: true,
            additionalDatabases: [],
        };
        const credentials: CreateAthenaCredentials = {
            type: WarehouseTypes.ATHENA,
            region: 'eu-west-1',
            database: 'AwsDataCatalog',
            schema: 'analytics',
            s3StagingDir: 's3://staging/',
            authenticationType: AthenaAuthenticationType.ACCESS_KEY,
            accessKeyId: 'key',
            secretAccessKey: 'secret',
        };
        Object.assign(service, {
            getConnectionSqlRunnerContext: vi.fn(async () => ({
                connection,
                credentials,
                resolution: {
                    warehouseCredentials: credentials,
                    aiPlan: null,
                    warehouseConnectionUuid: connection.warehouseConnectionUuid,
                    connectionRoute: null,
                    credentialKind: WarehouseCredentialKind.SHARED,
                },
                connectionContext: connectionContextFromUser(
                    { userUuid: user.userUuid },
                    {
                        organizationUuid: projectSummary.organizationUuid,
                        queryContext: null,
                    },
                ),
                organizationUuid: projectSummary.organizationUuid,
            })),
        });
        Object.assign(service, {
            withConnectionWarehouseClient: vi.fn(async () => {
                throw new Error(
                    'AccessDeniedException: not authorized for glue:GetDatabases on private catalog',
                );
            }),
        });
        const track = vi.spyOn(analyticsMock, 'trackAccount');
        vi.mocked(track).mockClear();
        try {
            await expect(
                service.getConnectionDatabases(
                    account as RegisteredAccount,
                    projectUuid,
                    connection.warehouseConnectionUuid,
                ),
            ).rejects.toThrow('AccessDeniedException');
            expect(track).toHaveBeenCalledWith(
                account,
                expect.objectContaining({
                    event: 'sql_runner.database_list_failed',
                    properties: expect.objectContaining({
                        reason: 'athena_glue_list_databases_denied',
                    }),
                }),
            );
        } finally {
            delete (service as unknown as Record<string, unknown>)
                .getConnectionSqlRunnerContext;
            delete (service as unknown as Record<string, unknown>)
                .withConnectionWarehouseClient;
            track.mockRestore();
        }
    });

    test('tracks a blocked service account on an extra personal-credential connection', async () => {
        const warehouseConnectionModel = Reflect.get(
            service,
            'warehouseConnectionModel',
        ) as unknown as Record<string, unknown>;
        const credentials: CreatePostgresCredentials = {
            type: WarehouseTypes.POSTGRES,
            host: 'warehouse.internal',
            user: 'user',
            password: 'password',
            port: 5432,
            dbname: 'analytics',
            schema: 'public',
            requireUserCredentials: true,
        };
        Object.assign(warehouseConnectionModel, {
            getProject: vi.fn(async () => ({
                projectUuid,
                organizationUuid: projectSummary.organizationUuid,
                originalWarehouseType: WarehouseTypes.POSTGRES,
            })),
            getExtraCredentialSource: vi.fn(async () => ({
                credentials,
                organizationWarehouseCredentialsUuid: null,
            })),
            list: vi.fn(async () => [
                {
                    warehouseConnectionUuid: 'primary-uuid',
                    isOriginal: true,
                    warehouseType: WarehouseTypes.POSTGRES,
                },
                {
                    warehouseConnectionUuid: 'extra-uuid',
                    isOriginal: false,
                    warehouseType: WarehouseTypes.POSTGRES,
                },
            ]),
        });
        const route = vi
            .spyOn(
                projectModel as unknown as Pick<
                    ProjectModel,
                    'getConnectionRoute'
                >,
                'getConnectionRoute',
            )
            .mockResolvedValue('multi');
        const projectCredentials = vi
            .spyOn(projectModel, 'getWarehouseCredentialsForProject')
            .mockResolvedValue(credentials);
        const track = vi.spyOn(analyticsMock, 'track');
        vi.mocked(track).mockClear();
        try {
            await expect(
                (
                    service as unknown as {
                        getExtraConnectionWarehouseCredentials: (
                            args: Record<string, unknown>,
                        ) => Promise<unknown>;
                    }
                ).getExtraConnectionWarehouseCredentials({
                    projectUuid,
                    warehouseConnectionUuid: 'extra-uuid',
                    userId: user.userUuid,
                    isRegisteredUser: true,
                    isServiceAccount: true,
                }),
            ).rejects.toThrow(ForbiddenError);
            expect(track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'warehouse_connection.credentials_required',
                    properties: expect.objectContaining({
                        organizationId: projectSummary.organizationUuid,
                        projectId: projectUuid,
                        warehouseConnectionId: 'extra-uuid',
                        connectionKind: 'extra',
                        warehouseType: WarehouseTypes.POSTGRES,
                        connectionCount: null,
                        reason: 'service_account_requires_personal_credentials',
                    }),
                }),
            );
        } finally {
            delete warehouseConnectionModel.getProject;
            delete warehouseConnectionModel.getExtraCredentialSource;
            delete warehouseConnectionModel.list;
            route.mockRestore();
            projectCredentials.mockRestore();
            track.mockRestore();
        }
    });
    test('should get project catalog', async () => {
        const results = await service.getCatalog(user, projectUuid);

        expect(results).toEqual(expectedCatalog);
        expect(
            projectModel.findExploreTableSummariesFromCache,
        ).toHaveBeenCalledWith(projectUuid, undefined, expect.any(Object));
        expect(projectModel.findExploresFromCache).not.toHaveBeenCalled();
    });
    test('keeps catalog error skipping and last-write-wins behavior', async () => {
        vi.mocked(
            projectModel.findExploreTableSummariesFromCache,
        ).mockResolvedValueOnce({
            first: {
                name: 'first',
                type: ExploreType.DEFAULT,
                baseTable: 'first',
                tables: {
                    first: {
                        name: 'shared',
                        database: 'database',
                        schema: 'schema',
                        description: 'first description',
                        sqlTable: 'first.table',
                    },
                },
            },
            second: {
                name: 'second',
                type: ExploreType.DEFAULT,
                baseTable: 'second',
                tables: {
                    second: {
                        name: 'shared',
                        database: 'database',
                        schema: 'schema',
                        description: 'second description',
                        sqlTable: 'second.table',
                    },
                },
            },
            broken: {
                name: 'broken',
                type: undefined,
                baseTable: '',
                errors: true,
                tables: {
                    broken: {
                        name: 'shared',
                        database: 'database',
                        schema: 'schema',
                        description: 'broken description',
                        sqlTable: 'broken.table',
                    },
                },
            },
        });

        await expect(service.getCatalog(user, projectUuid)).resolves.toEqual({
            database: {
                schema: {
                    shared: {
                        description: 'second description',
                        sqlTable: 'second.table',
                    },
                },
            },
        });
    });
    test('loads only chart explores for dbt exposures', async () => {
        const manager = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'Project' },
            ]),
        };
        vi.mocked(
            savedChartModel.findInfoForDbtExposures,
        ).mockResolvedValueOnce([
            {
                uuid: 'default-chart',
                name: 'Default chart',
                description: undefined,
                tableName: 'default_explore',
                firstName: 'First',
                lastName: 'Owner',
            },
            {
                uuid: 'default-chart-copy',
                name: 'Default chart copy',
                description: undefined,
                tableName: 'default_explore',
                firstName: 'First',
                lastName: 'Owner',
            },
            {
                uuid: 'virtual-chart',
                name: 'Virtual chart',
                description: undefined,
                tableName: 'virtual_explore',
                firstName: 'First',
                lastName: 'Owner',
            },
            {
                uuid: 'pre-aggregate-chart',
                name: 'Pre-aggregate chart',
                description: undefined,
                tableName: 'pre_aggregate_explore',
                firstName: 'First',
                lastName: 'Owner',
            },
            {
                uuid: 'external-source-chart',
                name: 'External source chart',
                description: undefined,
                tableName: 'external_source_explore',
                firstName: 'First',
                lastName: 'Owner',
            },
            {
                uuid: 'broken-chart',
                name: 'Broken chart',
                description: undefined,
                tableName: 'broken_explore',
                firstName: 'First',
                lastName: 'Owner',
            },
        ]);
        vi.mocked(
            projectModel.findExploreTableSummariesFromCache,
        ).mockResolvedValueOnce({
            default_explore: {
                name: 'default_explore',
                type: ExploreType.DEFAULT,
                baseTable: 'orders',
                tables: {
                    orders: {
                        name: 'orders_alias',
                        originalName: 'orders',
                        database: 'database',
                        schema: 'schema',
                        sqlTable: 'database.schema.orders',
                    },
                    payments: {
                        name: 'payments',
                        originalName: 'payments',
                        database: 'database',
                        schema: 'schema',
                        sqlTable: 'database.schema.payments',
                    },
                },
            },
            virtual_explore: {
                name: 'virtual_explore',
                type: ExploreType.VIRTUAL,
                baseTable: 'virtual',
                tables: {
                    virtual: {
                        name: 'virtual',
                        database: 'database',
                        schema: 'schema',
                        sqlTable: 'database.schema.virtual',
                    },
                },
            },
            pre_aggregate_explore: {
                name: 'pre_aggregate_explore',
                type: ExploreType.PRE_AGGREGATE,
                baseTable: 'pre_aggregate',
                tables: {
                    pre_aggregate: {
                        name: 'pre_aggregate',
                        database: 'database',
                        schema: 'schema',
                        sqlTable: 'database.schema.pre_aggregate',
                    },
                },
            },
            external_source_explore: {
                name: 'external_source_explore',
                type: ExploreType.EXTERNAL_SOURCE,
                baseTable: 'external_source',
                tables: {
                    external_source: {
                        name: 'external_source',
                        database: 'database',
                        schema: 'schema',
                        sqlTable: 'database.schema.external_source',
                    },
                },
            },
            broken_explore: {
                name: 'broken_explore',
                type: undefined,
                baseTable: '',
                errors: true,
                tables: {},
            },
        });

        const results = await service.getDbtExposures(manager, projectUuid);

        expect(
            projectModel.findExploreTableSummariesFromCache,
        ).toHaveBeenCalledWith(
            projectUuid,
            [
                'default_explore',
                'virtual_explore',
                'pre_aggregate_explore',
                'external_source_explore',
                'broken_explore',
            ],
            expect.any(Object),
        );
        expect(results.ld_chart_default_chart.dependsOn).toEqual([
            "ref('orders')",
            "ref('payments')",
        ]);
        expect(results.ld_chart_default_chart_copy.dependsOn).toEqual([
            "ref('orders')",
            "ref('payments')",
        ]);
        expect(results.ld_chart_virtual_chart).toBeUndefined();
        expect(results.ld_chart_pre_aggregate_chart).toBeUndefined();
        expect(results.ld_chart_external_source_chart).toBeUndefined();
        expect(results.ld_chart_broken_chart).toBeUndefined();
        expect(projectModel.findExploresFromCache).not.toHaveBeenCalled();
    });
    test('returns only the project exposure when a populated project has no charts', async () => {
        const manager = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'Project' },
            ]),
        };
        vi.mocked(
            savedChartModel.findInfoForDbtExposures,
        ).mockResolvedValueOnce([]);
        vi.mocked(
            projectModel.findExploreTableSummariesFromCache,
        ).mockResolvedValueOnce({});
        vi.mocked(dashboardModel.findInfoForDbtExposures).mockResolvedValueOnce(
            [],
        );

        const results = await service.getDbtExposures(manager, projectUuid);

        expect(
            projectModel.findExploreTableSummariesFromCache,
        ).toHaveBeenCalledWith(projectUuid, [], expect.any(Object));
        expect(Object.values(results)).toHaveLength(1);
        expect(Object.values(results)[0]).toMatchObject({
            type: DbtExposureType.APPLICATION,
            dependsOn: [],
        });
    });
    test('should get tables configuration', async () => {
        const result = await service.getTablesConfiguration(
            account,
            projectUuid,
        );
        expect(result).toEqual(tablesConfiguration);
    });
    test('should update tables configuration', async () => {
        vi.spyOn(analyticsMock, 'track');
        await service.updateTablesConfiguration(
            user,
            projectUuid,
            tablesConfigurationWithNames,
        );
        expect(projectModel.updateTablesConfiguration).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'project_tables_configuration.updated',
            }),
        );
    });
    describe('runExploreQuery', () => {
        test('should get results with 1 row', async () => {
            const result = await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );
            expect(result).toEqual(expectedApiQueryResultsWith1Row);
        });
        test('should get results with 501 rows', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClientFactory.warehouseClients = {};
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: vi.fn(async () => resultsWith501Rows),
            }));

            const result = await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );
            expect(result).toEqual(expectedApiQueryResultsWith501Rows);
        });

        test('should use user warehouse credentials when available for databricks', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClientFactory.warehouseClients = {};

            // Mock project credentials to be Databricks type
            // (user credentials are only fetched for Databricks or when requireUserCredentials is true)
            const databricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                serverHostName: 'test.databricks.com',
                httpPath: '/sql/test',
                database: 'test_db',
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => databricksCredentials);

            // Reset mock to return 1 row results (previous test may have changed it)
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                credentials: databricksCredentials,
                runQuery: vi.fn(async () => resultsWith1Row),
            }));

            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.DATABRICKS,
                    token: 'custom-token',
                },
            };

            // Mock findForProjectWithSecrets to return user credentials
            const findForProjectWithSecretsMock = vi.fn(
                async () => userCredentials,
            );
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            const result = await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );

            // Verify findForProjectWithSecrets was called with correct arguments
            expect(findForProjectWithSecretsMock).toHaveBeenCalledWith(
                projectUuid,
                sessionAccount.user.id,
                WarehouseTypes.DATABRICKS,
            );

            // Query should still execute successfully with user credentials
            expect(result).toEqual(expectedApiQueryResultsWith1Row);
        });
    });

    describe('user warehouse credentials override', () => {
        test("should not let user credentials clear the project's requireUserCredentials setting", async () => {
            service.warehouseClientFactory.warehouseClients = {};

            vi.mocked(
                projectModel.getWarehouseCredentialsForProject,
            ).mockResolvedValueOnce({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.MOTHERDUCK,
                database: 'analytics',
                schema: 'main',
                token: 'project-token',
                requireUserCredentials: true,
            });
            const findForProjectWithSecretsMock = vi.fn(async () => ({
                uuid: 'user-motherduck-creds-uuid',
                credentials: {
                    type: WarehouseTypes.DUCKDB,
                    connectionType: DuckdbConnectionType.MOTHERDUCK,
                    database: 'analytics',
                    schema: 'main',
                    token: 'user-token',
                    requireUserCredentials: false,
                },
            }));
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            const mergedCredentials = await (
                service as unknown as {
                    getWarehouseCredentials: (args: {
                        projectUuid: string;
                        userId: string;
                        isRegisteredUser: boolean;
                        binding: { kind: 'original' };
                    }) => Promise<CreateWarehouseCredentials>;
                }
            ).getWarehouseCredentials({
                projectUuid,
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
                binding: { kind: 'original' },
            });

            expect(mergedCredentials).toEqual(
                expect.objectContaining({
                    token: 'user-token',
                    requireUserCredentials: true,
                }),
            );
        });

        describe('optional BigQuery user credentials', () => {
            const projectCredentials: CreateBigqueryCredentials = {
                type: WarehouseTypes.BIGQUERY,
                authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
                project: 'shared-project',
                dataset: 'analytics',
                executionProject: 'billing-project',
                location: 'EU',
                timeoutSeconds: undefined,
                priority: undefined,
                retries: undefined,
                maximumBytesBilled: undefined,
                keyfileContents: {
                    type: 'service_account',
                    client_email: 'shared@example.com',
                    private_key: 'project-private-key',
                },
                requireUserCredentials: false,
                allowUserCredentials: true,
            };
            const personalCredentials = {
                uuid: 'personal-bigquery-credentials',
                expiresAt: null,
                credentials: {
                    type: WarehouseTypes.BIGQUERY,
                    authenticationType: BigqueryAuthenticationType.SSO,
                    keyfileContents: {
                        type: 'authorized_user',
                        client_id: 'oauth-client',
                        client_secret: 'oauth-secret',
                        refresh_token: 'personal-refresh-token',
                    },
                },
            } satisfies UserWarehouseCredentialsWithSecrets;
            const findPersonalCredentials =
                vi.fn<
                    UserWarehouseCredentialsModel['findForProjectWithSecrets']
                >();
            const getCredentials = (
                isRegisteredUser = true,
                preloadedOrgWarehouseCredentialsUuid?: string,
            ) =>
                (
                    service as unknown as {
                        getWarehouseCredentials: (args: {
                            projectUuid: string;
                            userId: string;
                            isRegisteredUser: boolean;
                            preloadedOrgWarehouseCredentialsUuid?: string;
                            binding: { kind: 'original' };
                        }) => Promise<CreateWarehouseCredentials>;
                    }
                ).getWarehouseCredentials({
                    projectUuid,
                    userId: sessionAccount.user.id,
                    isRegisteredUser,
                    preloadedOrgWarehouseCredentialsUuid,
                    binding: { kind: 'original' },
                });

            beforeEach(() => {
                findPersonalCredentials.mockReset();
                findPersonalCredentials.mockResolvedValue(undefined);
                vi.mocked(
                    projectModel.getWarehouseCredentialsForProject,
                ).mockResolvedValue(projectCredentials);
                (
                    service as unknown as {
                        userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
                    }
                ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                    findPersonalCredentials;
            });

            test.each([undefined, false])(
                'uses the shared connection when personal credentials are not enabled (%s)',
                async (allowUserCredentials) => {
                    const sharedCredentials = {
                        ...projectCredentials,
                        allowUserCredentials,
                    };
                    vi.mocked(
                        projectModel.getWarehouseCredentialsForProject,
                    ).mockResolvedValueOnce(sharedCredentials);
                    findPersonalCredentials.mockResolvedValue(
                        personalCredentials,
                    );

                    expect(await getCredentials()).toEqual({
                        ...sharedCredentials,
                        userWarehouseCredentialsUuid: undefined,
                    });
                    expect(findPersonalCredentials).not.toHaveBeenCalled();
                },
            );

            test.each([
                BigqueryAuthenticationType.PRIVATE_KEY,
                BigqueryAuthenticationType.SSO,
                BigqueryAuthenticationType.ADC,
            ])(
                'uses personal OAuth with a %s project connection',
                async (authenticationType) => {
                    vi.mocked(
                        projectModel.getWarehouseCredentialsForProject,
                    ).mockResolvedValueOnce({
                        ...projectCredentials,
                        authenticationType,
                    });
                    findPersonalCredentials.mockResolvedValue(
                        personalCredentials,
                    );

                    const credentials = await getCredentials();

                    expect(findPersonalCredentials).toHaveBeenCalledWith(
                        projectUuid,
                        sessionAccount.user.id,
                        WarehouseTypes.BIGQUERY,
                    );
                    expect(credentials).toEqual(
                        expect.objectContaining({
                            project: 'shared-project',
                            dataset: 'analytics',
                            executionProject: 'billing-project',
                            location: 'EU',
                            authenticationType: BigqueryAuthenticationType.SSO,
                            keyfileContents:
                                personalCredentials.credentials.keyfileContents,
                            userWarehouseCredentialsUuid:
                                personalCredentials.uuid,
                        }),
                    );
                },
            );

            test('uses the shared connection when no personal credentials exist', async () => {
                expect(await getCredentials()).toEqual({
                    ...projectCredentials,
                    userWarehouseCredentialsUuid: undefined,
                });
            });

            test('uses personal credentials with an organization connection', async () => {
                findPersonalCredentials.mockResolvedValue(personalCredentials);

                expect(await getCredentials(true, 'org-credentials')).toEqual(
                    expect.objectContaining({
                        keyfileContents:
                            personalCredentials.credentials.keyfileContents,
                        userWarehouseCredentialsUuid: personalCredentials.uuid,
                    }),
                );
            });

            test('requires personal credentials when the project requires them', async () => {
                vi.mocked(
                    projectModel.getWarehouseCredentialsForProject,
                ).mockResolvedValueOnce({
                    ...projectCredentials,
                    requireUserCredentials: true,
                    allowUserCredentials: false,
                });

                await expect(getCredentials()).rejects.toThrow(
                    MissingWarehouseCredentialsError,
                );
            });

            test('keeps required mode when personal credentials are available', async () => {
                vi.mocked(
                    projectModel.getWarehouseCredentialsForProject,
                ).mockResolvedValueOnce({
                    ...projectCredentials,
                    requireUserCredentials: true,
                    allowUserCredentials: false,
                });
                findPersonalCredentials.mockResolvedValue(personalCredentials);

                expect(await getCredentials()).toEqual(
                    expect.objectContaining({
                        requireUserCredentials: true,
                        userWarehouseCredentialsUuid: personalCredentials.uuid,
                    }),
                );
            });

            test('does not silently fall back when personal credentials are invalid', async () => {
                findPersonalCredentials.mockRejectedValue(
                    new BigqueryTokenError('Please reauthenticate'),
                );

                await expect(getCredentials()).rejects.toThrow(
                    BigqueryTokenError,
                );
            });

            test('uses the shared connection for embedded users', async () => {
                expect(await getCredentials(false)).toEqual({
                    ...projectCredentials,
                    userWarehouseCredentialsUuid: undefined,
                });
                expect(findPersonalCredentials).not.toHaveBeenCalled();
            });
        });

        describe('optional Trino user credentials', () => {
            const projectTrinoCredentials = {
                type: WarehouseTypes.TRINO,
                host: 'trino.example.com',
                user: 'project_user',
                password: 'project-password',
                port: 443,
                dbname: 'analytics',
                schema: 'public',
                http_scheme: 'https',
                requireUserCredentials: false,
            };

            const getCredentials = () =>
                (
                    service as unknown as {
                        getWarehouseCredentials: (args: {
                            projectUuid: string;
                            userId: string;
                            isRegisteredUser: boolean;
                            binding: { kind: 'original' };
                        }) => Promise<CreateWarehouseCredentials>;
                    }
                ).getWarehouseCredentials({
                    projectUuid,
                    userId: sessionAccount.user.id,
                    isRegisteredUser: true,
                    binding: { kind: 'original' },
                });

            const mockUserCredentials = (
                credentials: UserWarehouseCredentialsWithSecrets | undefined,
            ) => {
                const findForProjectWithSecretsMock = vi.fn(
                    async () => credentials,
                );
                (
                    service as unknown as {
                        userWarehouseCredentialsModel: {
                            findForProjectWithSecrets: import('vitest').Mock;
                        };
                    }
                ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                    findForProjectWithSecretsMock;
                return findForProjectWithSecretsMock;
            };

            beforeEach(() => {
                service.warehouseClientFactory.warehouseClients = {};
                (
                    projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
                ).mockImplementation(async () => projectTrinoCredentials);
            });

            test('should use user credentials when available and not required', async () => {
                const findForProjectWithSecretsMock = mockUserCredentials({
                    uuid: 'user-trino-creds-uuid',
                    expiresAt: null,
                    credentials: {
                        type: WarehouseTypes.TRINO,
                        user: 'personal_user',
                        password: 'personal-password',
                    },
                });

                const credentials = await getCredentials();

                expect(findForProjectWithSecretsMock).toHaveBeenCalledWith(
                    projectUuid,
                    sessionAccount.user.id,
                    WarehouseTypes.TRINO,
                );
                expect(credentials).toEqual(
                    expect.objectContaining({
                        host: 'trino.example.com',
                        user: 'personal_user',
                        password: 'personal-password',
                        userWarehouseCredentialsUuid: 'user-trino-creds-uuid',
                    }),
                );
            });

            test('should fall back to project credentials when user has none', async () => {
                mockUserCredentials(undefined);

                const credentials = await getCredentials();

                expect(credentials).toEqual(
                    expect.objectContaining({
                        user: 'project_user',
                        password: 'project-password',
                        userWarehouseCredentialsUuid: undefined,
                    }),
                );
            });
        });

        test('should not leak project Snowflake secrets into a user private key credential', async () => {
            service.warehouseClientFactory.warehouseClients = {};

            const projectSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                warehouse: 'test-warehouse',
                database: 'test-db',
                schema: 'test-schema',
                user: 'project_user',
                password: 'project-password',
                privateKey: 'project-private-key',
                privateKeyPass: 'project-passphrase',
                authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectSnowflakeCredentials);

            // No passphrase: the user's key is not encrypted with one.
            const userCredentials = {
                uuid: 'user-snowflake-creds-uuid',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    user: 'analyst',
                    privateKey: 'user-private-key',
                    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                },
            };
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets = vi.fn(
                async () => userCredentials,
            );

            const mergedCredentials = await (
                service as unknown as {
                    getWarehouseCredentials: (args: {
                        projectUuid: string;
                        userId: string;
                        isRegisteredUser: boolean;
                        binding: { kind: 'original' };
                    }) => Promise<Record<string, unknown>>;
                }
            ).getWarehouseCredentials({
                projectUuid,
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
                binding: { kind: 'original' },
            });

            expect(mergedCredentials).toEqual(
                expect.objectContaining({
                    type: WarehouseTypes.SNOWFLAKE,
                    user: 'analyst',
                    privateKey: 'user-private-key',
                    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                }),
            );
            expect(mergedCredentials.privateKeyPass).toBeUndefined();
            expect(mergedCredentials.password).toBeUndefined();
        });

        test('should not give a legacy Snowflake password credential the project SSO mode', async () => {
            service.warehouseClientFactory.warehouseClients = {};

            const projectSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                warehouse: 'test-warehouse',
                database: 'test-db',
                schema: 'test-schema',
                user: 'project_user',
                authenticationType: SnowflakeAuthenticationType.SSO,
                refreshToken: 'project-refresh-token',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectSnowflakeCredentials);

            // Stored before authenticationType was persisted: no auth type.
            const userCredentials = {
                uuid: 'legacy-snowflake-creds-uuid',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    user: 'analyst',
                    password: 'analyst-password',
                },
            };
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets = vi.fn(
                async () => userCredentials,
            );

            const mergedCredentials = await (
                service as unknown as {
                    getWarehouseCredentials: (args: {
                        projectUuid: string;
                        userId: string;
                        isRegisteredUser: boolean;
                        binding: { kind: 'original' };
                    }) => Promise<Record<string, unknown>>;
                }
            ).getWarehouseCredentials({
                projectUuid,
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
                binding: { kind: 'original' },
            });

            // Absent, not 'sso': the client then falls back to password auth.
            expect(mergedCredentials.authenticationType).toBeUndefined();
            expect(mergedCredentials).toEqual(
                expect.objectContaining({
                    user: 'analyst',
                    password: 'analyst-password',
                }),
            );
            expect(mergedCredentials.refreshToken).toBeUndefined();
        });

        test('should use user Redshift IAM identity when requireUserCredentials is true', async () => {
            service.warehouseClientFactory.warehouseClients = {};

            const projectRedshiftCredentials = {
                type: WarehouseTypes.REDSHIFT,
                host: 'cluster.redshift.amazonaws.com',
                user: 'shared_project_user',
                password: 'shared-project-password',
                port: 5439,
                dbname: 'dev',
                schema: 'public',
                authenticationType: RedshiftAuthenticationType.IAM,
                region: 'us-east-1',
                clusterIdentifier: 'analytics-cluster',
                accessKeyId: 'PROJECT_KEY',
                secretAccessKey: 'PROJECT_SECRET',
                assumeRoleArn: 'arn:aws:iam::111:role/project-role',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectRedshiftCredentials);

            const userCredentials = {
                uuid: 'user-redshift-creds-uuid',
                credentials: {
                    type: WarehouseTypes.REDSHIFT,
                    authenticationType: RedshiftAuthenticationType.IAM,
                    user: '',
                    assumeRoleArn: 'arn:aws:iam::222:role/viewer-role',
                    assumeRoleExternalId: 'viewer-external-id',
                },
            };

            const findForProjectWithSecretsMock = vi.fn(
                async () => userCredentials,
            );
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            const mergedCredentials = await (
                service as unknown as {
                    getWarehouseCredentials: (args: {
                        projectUuid: string;
                        userId: string;
                        isRegisteredUser: boolean;
                        binding: { kind: 'original' };
                    }) => Promise<Record<string, unknown>>;
                }
            ).getWarehouseCredentials({
                projectUuid,
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
                binding: { kind: 'original' },
            });

            expect(findForProjectWithSecretsMock).toHaveBeenCalledWith(
                projectUuid,
                sessionAccount.user.id,
                WarehouseTypes.REDSHIFT,
            );
            expect(mergedCredentials).toEqual(
                expect.objectContaining({
                    type: WarehouseTypes.REDSHIFT,
                    user: '',
                    authenticationType: RedshiftAuthenticationType.IAM,
                    region: 'us-east-1',
                    clusterIdentifier: 'analytics-cluster',
                    assumeRoleArn: 'arn:aws:iam::222:role/viewer-role',
                    assumeRoleExternalId: 'viewer-external-id',
                    userWarehouseCredentialsUuid: 'user-redshift-creds-uuid',
                }),
            );
            expect(mergedCredentials).not.toEqual(
                expect.objectContaining({
                    password: 'shared-project-password',
                    accessKeyId: 'PROJECT_KEY',
                    secretAccessKey: 'PROJECT_SECRET',
                    assumeRoleArn: 'arn:aws:iam::111:role/project-role',
                }),
            );
        });

        test('should not give a legacy Redshift password credential the project IAM mode', async () => {
            service.warehouseClientFactory.warehouseClients = {};

            const projectRedshiftCredentials = {
                type: WarehouseTypes.REDSHIFT,
                host: 'cluster.redshift.amazonaws.com',
                user: 'shared_project_user',
                password: 'shared-project-password',
                port: 5439,
                dbname: 'dev',
                schema: 'public',
                authenticationType: RedshiftAuthenticationType.IAM,
                region: 'us-east-1',
                clusterIdentifier: 'analytics-cluster',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectRedshiftCredentials);

            // Stored before authenticationType was persisted: no auth type.
            const userCredentials = {
                uuid: 'legacy-redshift-creds-uuid',
                credentials: {
                    type: WarehouseTypes.REDSHIFT,
                    user: 'analyst',
                    password: 'analyst-password',
                },
            };
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets = vi.fn(
                async () => userCredentials,
            );

            const mergedCredentials = await (
                service as unknown as {
                    getWarehouseCredentials: (args: {
                        projectUuid: string;
                        userId: string;
                        isRegisteredUser: boolean;
                        binding: { kind: 'original' };
                    }) => Promise<Record<string, unknown>>;
                }
            ).getWarehouseCredentials({
                projectUuid,
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
                binding: { kind: 'original' },
            });

            // Absent, not 'iam': the client then falls back to password auth
            // instead of minting IAM credentials for a user identity that
            // was never configured for IAM.
            expect(mergedCredentials.authenticationType).toBeUndefined();
            expect(mergedCredentials).toEqual(
                expect.objectContaining({
                    user: 'analyst',
                    password: 'analyst-password',
                }),
            );
        });

        test('should use user refreshToken instead of project refreshToken when requireUserCredentials is true', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClientFactory.warehouseClients = {};

            // Mock the token generation to avoid actual Snowflake API calls
            vi.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue({
                accessToken: 'mocked-access-token',
                refreshToken: 'mocked-refresh-token',
            });

            // Project credentials with Snowflake SSO that has a refreshToken
            // The project's refreshToken should be cleared and NOT used
            const projectSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                warehouse: 'test-warehouse',
                database: 'test-db',
                schema: 'test-schema',
                authenticationType: 'sso',
                refreshToken: 'project-refresh-token-should-not-be-used',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectSnowflakeCredentials);

            // User credentials with refreshToken (correct field)
            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: 'sso',
                    refreshToken: 'user-refresh-token',
                },
            };

            const findForProjectWithSecretsMock = vi.fn(
                async () => userCredentials,
            );
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation((creds: Record<string, unknown>) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery: vi.fn(async () => resultsWith1Row),
            }));

            await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );

            // Verify generateSnowflakeAccessToken was called with user's refreshToken
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledWith('user-refresh-token');
            // Project's refreshToken should NOT have been used
            expect(
                UserService.generateSnowflakeAccessToken,
            ).not.toHaveBeenCalledWith(
                'project-refresh-token-should-not-be-used',
            );
        });

        test('should throw error when user credentials have token instead of refreshToken', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClientFactory.warehouseClients = {};

            // Mock the token generation to avoid actual Snowflake API calls
            vi.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue({
                accessToken: 'mocked-access-token',
                refreshToken: 'mocked-refresh-token',
            });

            // Project credentials with Snowflake SSO
            const projectSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                warehouse: 'test-warehouse',
                database: 'test-db',
                schema: 'test-schema',
                authenticationType: 'sso',
                refreshToken: 'project-refresh-token',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectSnowflakeCredentials);

            // User credentials with token instead of refreshToken (the bug scenario)
            // Older code stored refreshToken in the token field by mistake
            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: 'sso',
                    token: 'user-token-stored-incorrectly', // Bug: stored in wrong field
                },
            };

            const findForProjectWithSecretsMock = vi.fn(
                async () => userCredentials,
            );
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation((creds: Record<string, unknown>) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery: vi.fn(async () => resultsWith1Row),
            }));

            // Should throw an error because user credentials have token instead of refreshToken
            await expect(
                service.runExploreQuery(
                    sessionAccount,
                    metricQueryMock,
                    projectUuid,
                    'valid_explore',
                    null,
                ),
            ).rejects.toThrow('Error refreshing snowflake token');
        });

        test('should use project refreshToken when requireUserCredentials is false for Snowflake', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClientFactory.warehouseClients = {};

            // Mock the token generation to avoid actual Snowflake API calls
            vi.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue({
                accessToken: 'mocked-access-token',
                refreshToken: 'mocked-refresh-token',
            });

            // Mock project credentials with Snowflake SSO - requireUserCredentials is false
            // so the project's credentials should be used directly
            const projectSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                warehouse: 'test-warehouse',
                database: 'test-db',
                schema: 'test-schema',
                authenticationType: 'sso',
                refreshToken: 'project-refresh-token',
                requireUserCredentials: false,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectSnowflakeCredentials);

            // User credentials should NOT be fetched when requireUserCredentials is false
            const findForProjectWithSecretsMock = vi.fn(async () => undefined);
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation((creds: Record<string, unknown>) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery: vi.fn(async () => resultsWith1Row),
            }));

            await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );

            // Verify generateSnowflakeAccessToken was called with project's refreshToken
            expect(
                UserService.generateSnowflakeAccessToken,
            ).toHaveBeenCalledWith('project-refresh-token');

            // User credentials should NOT have been fetched
            expect(findForProjectWithSecretsMock).not.toHaveBeenCalled();
        });

        test('should persist rotated Snowflake refresh token to user_warehouse_credentials when Snowflake rotates it', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClientFactory.warehouseClients = {};

            vi.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue({
                accessToken: 'mocked-access-token',
                refreshToken: 'rotated-refresh-token',
            });

            const projectSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                warehouse: 'test-warehouse',
                database: 'test-db',
                schema: 'test-schema',
                authenticationType: 'sso',
                refreshToken: 'project-refresh-token',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectSnowflakeCredentials);

            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: 'sso',
                    refreshToken: 'user-refresh-token',
                },
            };

            const findForProjectWithSecretsMock = vi.fn(
                async () => userCredentials,
            );
            const rotateRefreshTokenMock = vi.fn(async () => true);
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                        rotateRefreshToken: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                        rotateRefreshToken: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.rotateRefreshToken =
                rotateRefreshTokenMock;

            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation((creds: Record<string, unknown>) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery: vi.fn(async () => resultsWith1Row),
            }));

            await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );

            expect(rotateRefreshTokenMock).toHaveBeenCalledTimes(1);
            expect(rotateRefreshTokenMock).toHaveBeenCalledWith(
                'user-creds-uuid',
                'user-refresh-token',
                'rotated-refresh-token',
            );
        });

        test('should not call rotateRefreshToken when Snowflake returns the same refresh token', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClientFactory.warehouseClients = {};

            vi.spyOn(
                UserService,
                'generateSnowflakeAccessToken',
            ).mockResolvedValue({
                accessToken: 'mocked-access-token',
                refreshToken: 'user-refresh-token',
            });

            const projectSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                warehouse: 'test-warehouse',
                database: 'test-db',
                schema: 'test-schema',
                authenticationType: 'sso',
                refreshToken: 'project-refresh-token',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectSnowflakeCredentials);

            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: 'sso',
                    refreshToken: 'user-refresh-token',
                },
            };

            const findForProjectWithSecretsMock = vi.fn(
                async () => userCredentials,
            );
            const rotateRefreshTokenMock = vi.fn(async () => true);
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                        rotateRefreshToken: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                        rotateRefreshToken: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.rotateRefreshToken =
                rotateRefreshTokenMock;

            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation((creds: Record<string, unknown>) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery: vi.fn(async () => resultsWith1Row),
            }));

            await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );

            expect(rotateRefreshTokenMock).not.toHaveBeenCalled();
        });

        test('should persist rotated Databricks OAuth U2M refresh token to user_warehouse_credentials when Databricks rotates it', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClientFactory.warehouseClients = {};

            const { refreshDatabricksOAuthToken } =
                await import('@lightdash/warehouses');
            (
                refreshDatabricksOAuthToken as import('vitest').Mock
            ).mockResolvedValue({
                accessToken: 'fresh-u2m-access-token',
                refreshToken: 'rotated-u2m-refresh-token',
            });

            const projectDatabricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                serverHostName: 'test.databricks.com',
                httpPath: '/sql/test',
                database: 'test_db',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectDatabricksCredentials);

            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.DATABRICKS,
                    authenticationType: 'oauth_u2m',
                    serverHostName: 'test.databricks.com',
                    refreshToken: 'user-u2m-refresh-token',
                    oauthClientId: 'user-client-id',
                },
            };

            const findForProjectWithSecretsMock = vi.fn(
                async () => userCredentials,
            );
            const rotateRefreshTokenMock = vi.fn(async () => true);
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                        rotateRefreshToken: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                        rotateRefreshToken: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.rotateRefreshToken =
                rotateRefreshTokenMock;

            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation((creds: Record<string, unknown>) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery: vi.fn(async () => resultsWith1Row),
            }));

            await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );

            expect(rotateRefreshTokenMock).toHaveBeenCalledTimes(1);
            expect(rotateRefreshTokenMock).toHaveBeenCalledWith(
                'user-creds-uuid',
                'user-u2m-refresh-token',
                'rotated-u2m-refresh-token',
            );
        });

        test('should not call rotateRefreshToken when Databricks returns the same refresh token', async () => {
            // clear in memory cache so new mock is applied
            service.warehouseClientFactory.warehouseClients = {};

            const { refreshDatabricksOAuthToken } =
                await import('@lightdash/warehouses');
            (
                refreshDatabricksOAuthToken as import('vitest').Mock
            ).mockResolvedValue({
                accessToken: 'fresh-u2m-access-token',
                refreshToken: 'user-u2m-refresh-token',
            });

            const projectDatabricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                serverHostName: 'test.databricks.com',
                httpPath: '/sql/test',
                database: 'test_db',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockImplementation(async () => projectDatabricksCredentials);

            const userCredentials = {
                uuid: 'user-creds-uuid',
                credentials: {
                    type: WarehouseTypes.DATABRICKS,
                    authenticationType: 'oauth_u2m',
                    serverHostName: 'test.databricks.com',
                    refreshToken: 'user-u2m-refresh-token',
                    oauthClientId: 'user-client-id',
                },
            };

            const findForProjectWithSecretsMock = vi.fn(
                async () => userCredentials,
            );
            const rotateRefreshTokenMock = vi.fn(async () => true);
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                        rotateRefreshToken: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                        rotateRefreshToken: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.rotateRefreshToken =
                rotateRefreshTokenMock;

            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation((creds: Record<string, unknown>) => ({
                ...warehouseClientMock,
                credentials: creds,
                runQuery: vi.fn(async () => resultsWith1Row),
            }));

            await service.runExploreQuery(
                sessionAccount,
                metricQueryMock,
                projectUuid,
                'valid_explore',
                null,
            );

            expect(rotateRefreshTokenMock).not.toHaveBeenCalled();
        });
    });

    describe('getWarehouseCredentialsWithConnection for embedded users', () => {
        test('refuses a project that routes multi before loading credentials', async () => {
            const binding = {
                kind: 'explore' as const,
                exploreName: 'orders',
            };
            const resolveWarehouseCredentialRead = vi
                .spyOn(projectModel, 'resolveWarehouseCredentialReadWithRoute')
                .mockRejectedValueOnce(
                    new NotImplementedError(
                        'Multiple connections are not available',
                    ),
                );
            const loadCredentials = vi.spyOn(
                projectModel,
                'getWarehouseCredentialsForProject',
            );
            loadCredentials.mockClear();

            await expect(
                service['getWarehouseCredentialsWithConnection']({
                    projectUuid,
                    userId: buildAccount({
                        accountType: 'jwt',
                        userType: 'anonymous',
                    }).user.id,
                    isRegisteredUser: false,
                    binding,
                }),
            ).rejects.toThrow('Multiple connections are not available');
            expect(resolveWarehouseCredentialRead).toHaveBeenCalledWith(
                projectUuid,
                binding,
            );
            expect(loadCredentials).not.toHaveBeenCalled();
        });

        test('should refresh Databricks oauth_m2m credentials so the access token is populated', async () => {
            const { exchangeDatabricksOAuthCredentials } =
                await import('@lightdash/warehouses');

            // Project credentials as stored in DB: m2m client id/secret but no token yet.
            const projectCredentials = {
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_m2m',
                serverHostName: 'test.databricks.com',
                httpPath: '/sql/test',
                database: 'test_db',
                catalog: 'test_catalog',
                oauthClientId: 'client-id',
                oauthClientSecret: 'client-secret',
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockResolvedValueOnce(projectCredentials);

            (
                exchangeDatabricksOAuthCredentials as import('vitest').Mock
            ).mockResolvedValueOnce({
                accessToken: 'fresh-m2m-access-token',
                refreshToken: 'fresh-m2m-refresh-token',
            });

            const embedAccount = buildAccount({
                accountType: 'jwt',
                userType: 'anonymous',
            });

            const { warehouseCredentials: credentials } = await service[
                'getWarehouseCredentialsWithConnection'
            ]({
                projectUuid,
                userId: embedAccount.user.id,
                isRegisteredUser: false,
                binding: { kind: 'explore', exploreName: 'orders' },
            });

            expect(exchangeDatabricksOAuthCredentials).toHaveBeenCalledWith(
                'test.databricks.com',
                'client-id',
                'client-secret',
            );
            // Token must be present, otherwise DatabricksWarehouseClient throws
            // "Databricks OAuth access token is required for OAuth oauth_m2m authentication"
            expect(credentials).toMatchObject({
                token: 'fresh-m2m-access-token',
                authenticationType: 'oauth_m2m',
            });
        });

        test('should throw when project requires user credentials', async () => {
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockResolvedValueOnce({
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                serverHostName: 'test.databricks.com',
                httpPath: '/sql/test',
                database: 'test_db',
                requireUserCredentials: true,
            });

            const embedAccount = buildAccount({
                accountType: 'jwt',
                userType: 'anonymous',
            });

            await expect(
                service['getWarehouseCredentialsWithConnection']({
                    projectUuid,
                    userId: embedAccount.user.id,
                    isRegisteredUser: false,
                    binding: { kind: 'explore', exploreName: 'orders' },
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('getAllExploresSummary', () => {
        test('should get all explores summary without filtering', async () => {
            projectModel.getSummary.mockClear();
            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                false,
            );
            expect(result).toEqual(expectedAllExploreSummary);
            expect(projectModel.getSummary).toHaveBeenCalledTimes(1);
        });
        test('should get all explores summary with filtering', async () => {
            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                true,
            );
            expect(result).toEqual(expectedAllExploreSummary);
        });
        test('should get explores summary filtered by tag', async () => {
            (
                projectModel.getTablesConfiguration as import('vitest').Mock
            ).mockImplementationOnce(async () => tablesConfigurationWithTags);
            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                true,
            );
            expect(result).toEqual(expectedExploreSummaryFilteredByTags);
        });
        test('should get explores summary filtered by name', async () => {
            (
                projectModel.getTablesConfiguration as import('vitest').Mock
            ).mockImplementationOnce(async () => tablesConfigurationWithNames);
            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                true,
            );
            expect(result).toEqual(expectedExploreSummaryFilteredByName);
        });
        test('should get all explores summary that do not have errors', async () => {
            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                false,
                false,
            );
            expect(result).toEqual(expectedAllExploreSummaryWithoutErrors);
        });

        test('should include virtual explores when filtered by tags even if they do not match', async () => {
            const exploresWithVirtual = [...allExplores, virtualExplore];
            (
                projectModel.getAllExploreSummaries as import('vitest').Mock
            ).mockImplementationOnce(async () =>
                exploresWithVirtual.map(exploreToSummaryWithAttributes),
            );
            (
                projectModel.getTablesConfiguration as import('vitest').Mock
            ).mockImplementationOnce(async () => ({
                tableSelection: {
                    type: 'WITH_TAGS',
                    value: ['non_existent_tag'], // Tag that doesn't match any explore
                },
            }));

            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                true,
            );

            // Should only include virtual explore since no other explores have the tag
            expect(result).toHaveLength(1);
            expect(result[0].name).toEqual('virtual_explore');
            expect(result[0].type).toEqual('virtual');
        });

        test('should include virtual explores when filtered by names even if they do not match', async () => {
            const exploresWithVirtual = [...allExplores, virtualExplore];
            (
                projectModel.getAllExploreSummaries as import('vitest').Mock
            ).mockImplementationOnce(async () =>
                exploresWithVirtual.map(exploreToSummaryWithAttributes),
            );
            (
                projectModel.getTablesConfiguration as import('vitest').Mock
            ).mockImplementationOnce(async () => ({
                tableSelection: {
                    type: 'WITH_NAMES',
                    value: ['non_existent_explore'], // Name that doesn't match any explore
                },
            }));

            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                true,
            );

            // Should only include virtual explore since no other explores match the name
            expect(result).toHaveLength(1);
            expect(result[0].name).toEqual('virtual_explore');
            expect(result[0].type).toEqual('virtual');
        });

        test('should include pre-aggregate explores for developer users when requested', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            const exploresWithPreAggregates = [
                ...allExplores,
                preAggregateExplore,
            ];
            (
                projectModel.getAllExploreSummaries as import('vitest').Mock
            ).mockImplementationOnce(async () =>
                exploresWithPreAggregates.map(exploreToSummaryWithAttributes),
            );

            const result =
                await serviceWithPreAggregatesEnabled.getAllExploresSummary(
                    developerAccount,
                    projectUuid,
                    true,
                    true,
                    true,
                );

            expect(result.map((explore) => explore.name)).toContain(
                preAggregateExplore.name,
            );
        });

        test('should exclude pre-aggregate explores for non-developer users even when requested', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            const exploresWithPreAggregates = [
                ...allExplores,
                preAggregateExplore,
            ];
            (
                projectModel.getAllExploreSummaries as import('vitest').Mock
            ).mockImplementationOnce(async () =>
                exploresWithPreAggregates.map(exploreToSummaryWithAttributes),
            );

            const result =
                await serviceWithPreAggregatesEnabled.getAllExploresSummary(
                    account,
                    projectUuid,
                    true,
                    true,
                    true,
                );

            expect(result.map((explore) => explore.name)).not.toContain(
                preAggregateExplore.name,
            );
        });

        test('should exclude explores when user does not have required attributes', async () => {
            const exploresWithRequiredAttrs = [
                validExplore,
                exploreWithRequiredAttributes,
            ];
            (
                projectModel.getAllExploreSummaries as import('vitest').Mock
            ).mockImplementationOnce(async () =>
                exploresWithRequiredAttrs.map(exploreToSummaryWithAttributes),
            );

            // Mock user attributes to NOT have is_admin: 'true'
            (
                userAttributesModel.getAttributeValuesForOrgMember as import('vitest').Mock
            ).mockImplementationOnce(async () => ({
                is_admin: 'false',
            }));

            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                false,
            );

            // Should only include validExplore, not exploreWithRequiredAttributes
            expect(result).toHaveLength(1);
            expect(result[0].name).toEqual('valid_explore');
            expect(
                result.find(
                    (e) => e.name === 'explore_with_required_attributes',
                ),
            ).toBeUndefined();
        });

        test('should include explores when user has required attributes', async () => {
            const exploresWithRequiredAttrs = [
                validExplore,
                exploreWithRequiredAttributes,
            ];
            (
                projectModel.getAllExploreSummaries as import('vitest').Mock
            ).mockImplementationOnce(async () =>
                exploresWithRequiredAttrs.map(exploreToSummaryWithAttributes),
            );

            // Mock user attributes to have is_admin: 'true'
            (
                userAttributesModel.getAttributeValuesForOrgMember as import('vitest').Mock
            ).mockImplementationOnce(async () => ({
                is_admin: 'true',
            }));

            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                false,
            );

            // Should include both explores
            expect(result).toHaveLength(2);
            expect(result.map((e) => e.name)).toContain('valid_explore');
            expect(result.map((e) => e.name)).toContain(
                'explore_with_required_attributes',
            );
        });
    });

    describe('getExploreResponse', () => {
        test('adds the binding of the explore to the explore', async () => {
            vi.mocked(projectModel.findExploresFromCache).mockResolvedValueOnce(
                [validExplore],
            );
            const getBinding = vi
                .spyOn(projectModel, 'getExploreWarehouseConnectionUuid')
                .mockResolvedValueOnce('finance-connection-uuid');

            const result = await service.getExploreResponse(
                account,
                projectUuid,
                validExplore.name,
            );

            expect(result).toEqual(
                expect.objectContaining({
                    name: validExplore.name,
                    baseTable: validExplore.baseTable,
                    warehouseConnectionUuid: 'finance-connection-uuid',
                }),
            );
            expect(
                (result as { unfilteredTables?: unknown }).unfilteredTables,
            ).toBeUndefined();
            expect(getBinding).toHaveBeenCalledWith(
                projectUuid,
                validExplore.name,
            );
        });
    });

    describe('getExplore', () => {
        test('returns split candidates when the requested explore name was qualified', async () => {
            vi.mocked(projectModel.findExploresFromCache).mockResolvedValueOnce(
                [],
            );
            vi.mocked(
                projectModel.findExploreSplitCandidates,
            ).mockResolvedValueOnce(['sourceA__orders', 'sourceB__orders']);

            await expect(
                service.getExplore(account, projectUuid, 'orders'),
            ).rejects.toMatchObject({
                name: 'NotFoundError',
                data: {
                    exploreName: 'orders',
                    candidateExploreNames: [
                        'sourceA__orders',
                        'sourceB__orders',
                    ],
                },
            });
        });

        test('keeps the plain not found error when the explore was not split', async () => {
            vi.mocked(projectModel.findExploresFromCache).mockResolvedValueOnce(
                [],
            );
            vi.mocked(
                projectModel.findExploreSplitCandidates,
            ).mockResolvedValueOnce([]);

            await expect(
                service.getExplore(account, projectUuid, 'orders'),
            ).rejects.toEqual(
                new NotFoundError('Explore "orders" does not exist.'),
            );
        });

        test('should allow developer users to get a pre-aggregate explore', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            (
                projectModel.findExploresFromCache as import('vitest').Mock
            ).mockImplementationOnce(async () => [preAggregateExplore]);

            const result = await serviceWithPreAggregatesEnabled.getExplore(
                developerAccount,
                projectUuid,
                preAggregateExplore.name,
            );

            expect(result.name).toEqual(preAggregateExplore.name);
        });

        test('should not allow non-developer users to get a pre-aggregate explore', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            (
                projectModel.findExploresFromCache as import('vitest').Mock
            ).mockImplementationOnce(async () => [preAggregateExplore]);

            await expect(
                serviceWithPreAggregatesEnabled.getExplore(
                    account,
                    projectUuid,
                    preAggregateExplore.name,
                ),
            ).rejects.toThrow(
                `Explore "${preAggregateExplore.name}" does not exist.`,
            );
        });
    });
    describe('getJobStatus', () => {
        test('allows only the creator to poll a failed preview copy without Job permissions', async () => {
            const copyJob: Job = {
                ...job,
                jobResults: undefined,
                jobType: JobType.CREATE_PROJECT,
                jobStatus: JobStatusType.ERROR,
                projectUuid: undefined,
                userUuid: user.userUuid,
                steps: [
                    {
                        ...job.steps[0],
                        stepType: JobStepType.COPYING_PREVIEW_CONTENT,
                    },
                ],
            };
            const previewCreator: SessionUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'Project', action: ['create', 'view'] },
                ]),
            };
            vi.mocked(jobModel.get)
                .mockResolvedValueOnce(copyJob)
                .mockResolvedValueOnce(copyJob);
            await expect(
                service.getJobStatus('jobUuid', previewCreator),
            ).resolves.toEqual(copyJob);
            await expect(
                service.getJobStatus('jobUuid', {
                    ...previewCreator,
                    userUuid: 'another-user',
                }),
            ).rejects.toThrow(NotFoundError);
        });

        test('should get job with projectUuid if user belongs to org', async () => {
            const result = await service.getJobStatus('jobUuid', user);
            expect(result).toEqual(job);
        });
        test('should get job without projectUuid if user created the job', async () => {
            const jobWithoutProjectUuid = { ...job, projectUuid: undefined };
            (jobModel.get as import('vitest').Mock).mockImplementationOnce(
                async () => jobWithoutProjectUuid,
            );

            const result = await service.getJobStatus('jobUuid', user);
            expect(result).toEqual(jobWithoutProjectUuid);
        });

        test('should not get job without projectUuid if user is different', async () => {
            const jobWithoutProjectUuid = { ...job, projectUuid: undefined };
            (jobModel.get as import('vitest').Mock).mockImplementationOnce(
                async () => jobWithoutProjectUuid,
            );
            const anotherUser: SessionUser = {
                ...user,
                userUuid: 'another-user-uuid',
                role: OrganizationMemberRole.VIEWER,

                ability: defineUserAbility(
                    {
                        ...user,
                        role: OrganizationMemberRole.VIEWER,
                        userUuid: 'another-user-uuid',
                    },
                    [],
                ),
            };
            await expect(
                service.getJobStatus('jobUuid', anotherUser),
            ).rejects.toThrowError(NotFoundError);
        });
        test('should limit CSV results', async () => {
            const csvCellsLimit = 100000;
            const maxLimit = 5000;

            expect(
                metricQueryWithLimit(
                    METRIC_QUERY,
                    undefined,
                    csvCellsLimit,
                    maxLimit,
                ),
            ).toEqual(METRIC_QUERY); // Returns same metricquery

            expect(
                metricQueryWithLimit(METRIC_QUERY, 5, csvCellsLimit, maxLimit)
                    .limit,
            ).toEqual(5);
            expect(
                metricQueryWithLimit(
                    METRIC_QUERY,
                    null,
                    csvCellsLimit,
                    maxLimit,
                ).limit,
            ).toEqual(33333);
            expect(
                metricQueryWithLimit(
                    METRIC_QUERY,
                    9999,
                    csvCellsLimit,
                    maxLimit,
                ).limit,
            ).toEqual(9999);
            expect(
                metricQueryWithLimit(
                    METRIC_QUERY,
                    9999999,
                    csvCellsLimit,
                    maxLimit,
                ).limit,
            ).toEqual(33333);

            const metricWithoutRows = {
                ...METRIC_QUERY,
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };
            expect(() =>
                metricQueryWithLimit(
                    metricWithoutRows,
                    null,
                    csvCellsLimit,
                    maxLimit,
                ),
            ).toThrowError(ParameterError);

            const metricWithDimension = { ...METRIC_QUERY, metrics: [] };
            expect(
                metricQueryWithLimit(
                    metricWithDimension,
                    null,
                    csvCellsLimit,
                    maxLimit,
                ).limit,
            ).toEqual(50000);
        });
    });

    describe('compileProject', () => {
        test('marks the job as failed when the user cannot compile', async () => {
            const compileJobUuid = 'compile-job-uuid';
            const noCompileUser: SessionUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'Project', action: ['view'] },
                ]),
            };

            await expect(
                service.compileProject(
                    noCompileUser,
                    projectUuid,
                    RequestMethod.WEB_APP,
                    compileJobUuid,
                ),
            ).rejects.toThrowError(ForbiddenError);

            expect(jobModel.setPendingJobsToSkipped).toHaveBeenCalledWith(
                compileJobUuid,
            );
            expect(jobModel.update).toHaveBeenCalledWith(compileJobUuid, {
                jobStatus: JobStatusType.ERROR,
            });
            expect(projectModel.tryAcquireProjectLock).not.toHaveBeenCalled();
        });

        const failureLogUser: SessionUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                { subject: 'Job', action: ['create'] },
                { subject: 'CompileProject', action: ['manage'] },
                { subject: 'Project', action: ['update', 'view'] },
            ]),
        };

        test('logs a compile that fails inside the compiling step as failed', async () => {
            const compileJobUuid = 'compile-job-uuid';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { logger } = service as any;
            const errorSpy = vi
                .spyOn(logger, 'error')
                .mockImplementation(() => undefined);
            const infoSpy = vi
                .spyOn(logger, 'info')
                .mockImplementation(() => undefined);
            (
                jobModel.tryJobStep as import('vitest').Mock
            ).mockRejectedValueOnce(
                new ParameterError(
                    'Cannot compile explores as this project was created via CLI and has no dbt connection configured',
                ),
            );

            await service.compileProject(
                failureLogUser,
                projectUuid,
                RequestMethod.WEB_APP,
                compileJobUuid,
            );

            // the inner catch still marks the job, and no longer swallows the failure silently
            expect(jobModel.update).toHaveBeenCalledWith(compileJobUuid, {
                jobStatus: JobStatusType.ERROR,
            });
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('dbt.compile.failed'),
                expect.objectContaining({ event: 'dbt.compile.failed' }),
            );
            const endCall = infoSpy.mock.calls.find(([, meta]) =>
                String((meta as { event?: string })?.event ?? '').startsWith(
                    'dbt.compile.end',
                ),
            );
            expect(endCall?.[1]).toEqual(
                expect.objectContaining({ event: 'dbt.compile.end.failed' }),
            );
            expect(endCall?.[0]).toEqual(
                expect.stringContaining('compileProject failed after'),
            );

            errorSpy.mockRestore();
            infoSpy.mockRestore();
        });

        test('logs a compile blocked by lock contention as failed', async () => {
            const compileJobUuid = 'compile-job-uuid';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { logger } = service as any;
            const errorSpy = vi
                .spyOn(logger, 'error')
                .mockImplementation(() => undefined);
            const infoSpy = vi
                .spyOn(logger, 'info')
                .mockImplementation(() => undefined);
            (
                projectModel.tryAcquireProjectLock as import('vitest').Mock
            ).mockRejectedValueOnce(
                new ParameterError('Compilation is already in progress'),
            );

            await service.compileProject(
                failureLogUser,
                projectUuid,
                RequestMethod.WEB_APP,
                compileJobUuid,
            );

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('dbt.compile.failed'),
                expect.objectContaining({ event: 'dbt.compile.failed' }),
            );
            const endCall = infoSpy.mock.calls.find(([, meta]) =>
                String((meta as { event?: string })?.event ?? '').startsWith(
                    'dbt.compile.end',
                ),
            );
            expect(endCall?.[1]).toEqual(
                expect.objectContaining({ event: 'dbt.compile.end.failed' }),
            );

            errorSpy.mockRestore();
            infoSpy.mockRestore();
        });

        test('syncs YAML tags during compilation without manage tag permissions', async () => {
            const compileJobUuid = 'compile-job-uuid';
            const previewProjectUuid = 'preview-project-uuid';
            const previewCompileUser: SessionUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'Job', action: ['create'] },
                    { subject: 'CompileProject', action: ['manage'] },
                    { subject: 'Project', action: ['update', 'view'] },
                ]),
            };

            vi.spyOn(
                service as unknown as {
                    refreshTablesAndProjectConfig: RefreshForTest;
                },
                'refreshTablesAndProjectConfig',
            ).mockImplementationOnce(
                async (_user, _projectUuid, _method, _jobUuid, consume) =>
                    consume({
                        exploreStream: (async function* stream() {
                            yield* [
                                validExplore,
                                {
                                    name: 'invalid_orders',
                                    label: 'Invalid orders',
                                    errors: [],
                                },
                            ];
                        })(),
                        lightdashProjectConfig: {
                            spotlight: {
                                ...DEFAULT_SPOTLIGHT_CONFIG,
                                categories: {
                                    finance: {
                                        label: 'Finance',
                                        color: 'blue',
                                    },
                                },
                            },
                            parameters: {},
                            table_groups: {},
                        },
                        projectContext: undefined,
                    }),
            );
            (projectModel.getSummary as import('vitest').Mock)
                .mockResolvedValueOnce({
                    ...projectSummary,
                    projectUuid: previewProjectUuid,
                    type: ProjectType.PREVIEW,
                })
                .mockResolvedValueOnce({
                    ...projectSummary,
                    projectUuid: previewProjectUuid,
                    type: ProjectType.PREVIEW,
                })
                .mockResolvedValueOnce({
                    ...projectSummary,
                    projectUuid: previewProjectUuid,
                    type: ProjectType.PREVIEW,
                });
            (projectModel.get as import('vitest').Mock).mockResolvedValueOnce({
                ...projectWithSensitiveFields,
                projectUuid: previewProjectUuid,
                type: ProjectType.PREVIEW,
            });

            await service.compileProject(
                previewCompileUser,
                previewProjectUuid,
                RequestMethod.WEB_APP,
                compileJobUuid,
            );

            expect(tagsModel.replaceYamlTags).toHaveBeenCalledWith(
                previewProjectUuid,
                expect.arrayContaining([
                    expect.objectContaining({
                        project_uuid: previewProjectUuid,
                        yaml_reference: 'finance',
                    }),
                ]),
            );
            expect(jobModel.update).toHaveBeenCalledWith(compileJobUuid, {
                jobStatus: JobStatusType.DONE,
                jobResults: {
                    indexCatalogJobUuid: { jobId: 'catalog-job-1' },
                    errorCount: 1,
                    total: 2,
                },
            });
        });

        const compileUser: SessionUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                { subject: 'Job', action: ['create'] },
                { subject: 'CompileProject', action: ['manage'] },
                { subject: 'Project', action: ['update', 'view'] },
                { subject: 'Tags', action: ['manage'] },
            ]),
        };

        const stubCompile = () =>
            vi
                .spyOn(
                    service as unknown as {
                        refreshTablesAndProjectConfig: RefreshForTest;
                    },
                    'refreshTablesAndProjectConfig',
                )
                .mockImplementationOnce(
                    async (_user, _projectUuid, _method, _jobUuid, consume) =>
                        consume({
                            exploreStream: (async function* stream() {
                                yield validExplore;
                            })(),
                            lightdashProjectConfig: {
                                spotlight: {
                                    ...DEFAULT_SPOTLIGHT_CONFIG,
                                    categories: {},
                                },
                                parameters: {},
                                table_groups: {},
                            },
                            projectContext: undefined,
                        }),
                );

        test('runs the afterCompile step after compiling and before the job is done', async () => {
            const compileJobUuid = 'compile-job-uuid';
            stubCompile();
            const run = vi.fn(async () => undefined);

            await service.compileProject(
                compileUser,
                projectUuid,
                RequestMethod.WEB_APP,
                compileJobUuid,
                { stepType: JobStepType.SYNCING_CONTENT, run },
            );

            expect(jobModel.tryJobStep).toHaveBeenCalledWith(
                compileJobUuid,
                JobStepType.SYNCING_CONTENT,
                run,
            );
            expect(run).toHaveBeenCalledTimes(1);
            const doneCall = (
                jobModel.update as import('vitest').Mock
            ).mock.calls.findIndex(
                ([uuid, update]) =>
                    uuid === compileJobUuid &&
                    update.jobStatus === JobStatusType.DONE,
            );
            expect(doneCall).toBeGreaterThan(-1);
            expect(run.mock.invocationCallOrder[0]).toBeLessThan(
                (jobModel.update as import('vitest').Mock).mock
                    .invocationCallOrder[doneCall],
            );
        });

        test('a failing afterCompile step leaves the job in error instead of done', async () => {
            const compileJobUuid = 'compile-job-uuid';
            stubCompile();
            const run = vi.fn(async () => {
                throw new Error('2 files could not be applied');
            });

            await service.compileProject(
                compileUser,
                projectUuid,
                RequestMethod.WEB_APP,
                compileJobUuid,
                { stepType: JobStepType.SYNCING_CONTENT, run },
            );

            expect(jobModel.update).toHaveBeenCalledWith(compileJobUuid, {
                jobStatus: JobStatusType.ERROR,
            });
            expect(jobModel.update).not.toHaveBeenCalledWith(
                compileJobUuid,
                expect.objectContaining({ jobStatus: JobStatusType.DONE }),
            );
        });

        test('requires manage tag permissions for direct YAML tag sync', async () => {
            const noTagUser: SessionUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'Project', action: ['update', 'view'] },
                ]),
            };
            (
                projectModel.getSummary as import('vitest').Mock
            ).mockResolvedValueOnce({
                ...projectSummary,
                type: ProjectType.DEFAULT,
            });

            await expect(
                service.replaceYamlTags(noTagUser, projectUuid, [
                    {
                        yamlReference: 'finance',
                        name: 'Finance',
                        color: 'blue',
                    },
                ]),
            ).rejects.toThrowError(ForbiddenError);

            expect(tagsModel.replaceYamlTags).not.toHaveBeenCalled();
        });
    });

    describe('replaceCustomFields', () => {
        test('replaces eligible metrics without changing charts edited after the task started', async () => {
            const taskStartedAt = new Date('2026-09-02T10:00:00.000Z');
            const customMetric = {
                name: 'revenue',
                table: 'orders',
                label: 'Revenue',
                type: MetricType.SUM,
                sql: '${TABLE}.revenue',
            };
            const chartVersion = {
                name: 'Revenue chart',
                metricQuery: {
                    ...metricQueryMock,
                    additionalMetrics: [customMetric],
                },
            };
            savedChartModel.get.mockReset();
            savedChartModel.createVersion.mockReset();
            savedChartModel.get.mockImplementation(async (chartUuid) => ({
                ...chartVersion,
                uuid: chartUuid,
                updatedAt:
                    chartUuid === 'recent-chart'
                        ? new Date('2026-09-02T10:01:00.000Z')
                        : new Date('2026-09-02T09:59:00.000Z'),
            }));

            const result = await service.replaceCustomFields({
                userUuid: user.userUuid,
                organizationUuid: 'organization-uuid',
                projectUuid,
                replaceFields: {
                    'older-chart': {
                        customMetrics: {
                            orders_revenue: {
                                replaceWithFieldId: 'orders_revenue',
                            },
                        },
                    },
                    'recent-chart': {
                        customMetrics: {
                            orders_revenue: {
                                replaceWithFieldId: 'orders_revenue',
                            },
                        },
                    },
                },
                skipChartsUpdatedAfter: taskStartedAt,
            });

            expect(
                savedChartModel.createVersion,
            ).toHaveBeenCalledExactlyOnceWith(
                'older-chart',
                expect.objectContaining({
                    metricQuery: expect.objectContaining({
                        additionalMetrics: [],
                    }),
                }),
                undefined,
            );
            expect(result).toEqual([
                { uuid: 'older-chart', name: 'Revenue chart' },
            ]);
        });
    });

    describe.each(['_create', 'testAndCompileProject'] as const)(
        '%s compile lease bookkeeping',
        (method) => {
            test.each([
                'testing done',
                'compiling start',
                'compile callback',
                'success',
                'no compile success',
                'no compile done',
                'fallback destroy',
                'inner destroy',
                'inner release',
            ])('cleans up exactly once after %s', async (failure) => {
                const error = new Error(failure);
                const destroyError = new Error('adapter cleanup failed');
                const noCompile = failure.startsWith('no compile');
                const failedStep =
                    failure === 'testing done' || failure === 'fallback destroy'
                        ? JobStepType.TESTING_ADAPTOR
                        : JobStepType.COMPILING;
                const stepJobModel = {
                    ...jobModel,
                    startJobStep: vi.fn<JobModel['startJobStep']>(
                        async (_uuid, step) => {
                            if (
                                failure === 'compiling start' &&
                                step === JobStepType.COMPILING
                            ) {
                                throw error;
                            }
                        },
                    ),
                    updateJobStep: vi.fn<JobModel['updateJobStep']>(
                        async (_uuid, status, step) => {
                            if (
                                (failure === 'testing done' ||
                                    failure === 'fallback destroy') &&
                                step === JobStepType.TESTING_ADAPTOR &&
                                status === JobStepStatusType.DONE
                            ) {
                                throw error;
                            }
                        },
                    ),
                    update: vi.fn<JobModel['update']>(async (_uuid, update) => {
                        if (
                            failure === 'no compile done' &&
                            update.jobStatus === JobStatusType.DONE
                        ) {
                            throw error;
                        }
                    }),
                    tryJobStep: JobModel.prototype.tryJobStep,
                };
                const compile = vi.fn(async () => {
                    if (failure === 'compile callback') throw error;
                    return [];
                });
                const adapter = {
                    compileAllExplores: compile,
                    prepareExploreStream: vi.fn(async () => {
                        const compiled = await compile();
                        return (async function* explores() {
                            yield* compiled;
                        })();
                    }),
                    getLightdashProjectConfig: vi.fn(async () => ({})),
                    destroy: vi.fn(async () => {
                        if (failure === 'fallback destroy') throw destroyError;
                        if (failure === 'inner destroy') throw error;
                    }),
                } as unknown as ProjectAdapter;
                const lease = {
                    release: vi.fn(async () => {
                        if (failure === 'inner release') throw error;
                    }),
                };
                const project = {
                    ...projectWithSensitiveFields,
                    warehouseConnection: warehouseClientMock.credentials,
                    dbtConnection: noCompile
                        ? { type: DbtProjectType.NONE as const }
                        : projectWithSensitiveFields.dbtConnection,
                };
                const boundaryService = getMockedProjectService(
                    lightdashConfigMock,
                    {
                        jobModel: stepJobModel as unknown as JobModel,
                        projectModel: {
                            ...projectModel,
                            getWithSensitiveFields: vi.fn(async () => project),
                            create: vi.fn(async () => projectUuid),
                            createProjectAccess: vi.fn(async () => undefined),
                        } as unknown as ProjectModel,
                    },
                );
                const internals = boundaryService as unknown as {
                    testProjectAdapter: () => Promise<unknown>;
                    getProjectContextFromAdapter: () => Promise<[]>;
                    resolveCompileAdapter: () => Promise<{
                        adapter: ProjectAdapter;
                    }>;
                    runPostProjectCreationProvisioning: () => Promise<void>;
                    logger: { warn: (...args: unknown[]) => void };
                };
                vi.spyOn(internals, 'testProjectAdapter').mockResolvedValue({
                    adapter,
                    lease,
                    warehouseCredentials: warehouseClientMock.credentials,
                    cachedWarehouse: {},
                    dbtVersionOption: DefaultSupportedDbtVersion,
                    dbtPartialParse: false,
                });
                vi.spyOn(
                    internals,
                    'getProjectContextFromAdapter',
                ).mockResolvedValue([]);
                vi.spyOn(internals, 'resolveCompileAdapter').mockResolvedValue({
                    adapter,
                });
                vi.spyOn(
                    internals,
                    'runPostProjectCreationProvisioning',
                ).mockResolvedValue();
                const warn = vi.spyOn(internals.logger, 'warn');
                const caller = {
                    ...user,
                    organizationUuid: 'organizationUuid',
                    organizationName: 'Organization',
                    organizationCreatedAt: new Date(),
                };
                const jobUuid = 'lease-bookkeeping-job';
                const result =
                    method === '_create'
                        ? boundaryService._create(
                              caller,
                              project,
                              jobUuid,
                              RequestMethod.WEB_APP,
                          )
                        : boundaryService.testAndCompileProject(
                              caller,
                              projectUuid,
                              RequestMethod.WEB_APP,
                              jobUuid,
                          );

                if (failure.endsWith('success')) {
                    await result;
                    expect(stepJobModel.update).toHaveBeenCalledWith(
                        jobUuid,
                        expect.objectContaining({
                            jobStatus: JobStatusType.DONE,
                        }),
                    );
                } else {
                    await expect(result).rejects.toThrow(error);
                    expect(stepJobModel.update).toHaveBeenCalledWith(jobUuid, {
                        jobStatus: JobStatusType.ERROR,
                    });
                    if (!noCompile) {
                        expect(stepJobModel.updateJobStep).toHaveBeenCalledWith(
                            jobUuid,
                            JobStepStatusType.ERROR,
                            failedStep,
                            error.message,
                            [],
                        );
                    }
                }
                expect(lease.release).toHaveBeenCalledTimes(1);
                expect(adapter.destroy).toHaveBeenCalledTimes(1);
                expect(
                    vi.mocked(adapter.destroy).mock.invocationCallOrder[0],
                ).toBeLessThan(lease.release.mock.invocationCallOrder[0]);
                if (failure === 'fallback destroy') {
                    expect(warn).toHaveBeenCalledWith(
                        'Failed to destroy a project adapter after job step failure',
                        { error: destroyError },
                    );
                }
            });
        },
    );

    describe('testAndCompileProject', () => {
        test('records explore errors for settings-page deploys', async () => {
            const compileJobUuid = 'settings-compile-job-uuid';
            const invalidExplore = {
                name: 'invalid_orders',
                label: 'Invalid orders',
                errors: [],
            };
            const adapter = {
                prepareExploreStream: vi.fn(async () =>
                    (async function* explores() {
                        yield validExplore;
                        yield invalidExplore;
                    })(),
                ),
                getLightdashProjectConfig: vi.fn(async () => ({
                    spotlight: { ...DEFAULT_SPOTLIGHT_CONFIG, categories: {} },
                    parameters: {},
                    table_groups: {},
                })),
                destroy: vi.fn(async () => undefined),
            } as unknown as ProjectAdapter;
            const lease = {
                release: vi.fn(async () => undefined),
            };

            projectModel.getWithSensitiveFields.mockResolvedValueOnce({
                ...projectWithSensitiveFields,
                warehouseConnection: warehouseClientMock.credentials,
            });

            vi.spyOn(
                service as unknown as {
                    testProjectAdapter: () => Promise<unknown>;
                },
                'testProjectAdapter',
            ).mockResolvedValueOnce({
                adapter,
                lease,
                warehouseCredentials: warehouseClientMock.credentials,
                cachedWarehouse: {
                    warehouseCatalog: undefined,
                    onWarehouseCatalogChange: vi.fn(),
                },
                dbtVersionOption: DefaultSupportedDbtVersion,
            });
            vi.spyOn(
                service as unknown as {
                    getProjectContextFromAdapter: () => Promise<undefined>;
                },
                'getProjectContextFromAdapter',
            ).mockResolvedValueOnce(undefined);
            vi.mocked(schedulerClient.indexCatalog).mockResolvedValueOnce({
                jobId: 'catalog-job-1',
            });

            await service.testAndCompileProject(
                {
                    ...user,
                    organizationUuid: 'organizationUuid',
                    organizationName: 'Organization',
                    organizationCreatedAt: new Date(),
                },
                projectUuid,
                RequestMethod.WEB_APP,
                compileJobUuid,
                'project_connection_form',
            );

            expect(jobModel.update).toHaveBeenCalledWith(compileJobUuid, {
                jobStatus: JobStatusType.DONE,
                jobResults: {
                    indexCatalogJobUuid: { jobId: 'catalog-job-1' },
                    errorCount: 1,
                    total: 2,
                },
            });
        });
    });

    describe('searchFieldUniqueValues', () => {
        test.each([
            [QueryExecutionContext.AI, true, false, null],
            [QueryExecutionContext.AI, false, true, null],
            [QueryExecutionContext.FILTER_AUTOCOMPLETE, true, true, null],
            [QueryExecutionContext.AI, false, false, aiExecutionPlanMock],
            [QueryExecutionContext.AI, false, false, aiServiceAccountPlanMock],
        ])(
            'autocomplete cache for %s with flag %s',
            async (context, enabled, usesCache, aiPlan) => {
                const flaggedService = getMockedProjectService({
                    ...lightdashConfigMock,
                    results: {
                        ...lightdashConfigMock.results,
                        autocompleteEnabled: true,
                    },
                });
                flaggedService.warehouseClientFactory.warehouseClients = {};
                vi.mocked(
                    flaggedService.featureFlagModel.get,
                ).mockResolvedValue({
                    id: FeatureFlags.AiAccessSkipResultsCache,
                    enabled,
                });
                const getIfFresh = vi.fn(async () => undefined);
                const uploadResults = vi.fn(async () => undefined);
                Object.assign(flaggedService, {
                    s3CacheClient: { getIfFresh, uploadResults },
                });
                vi.spyOn(
                    flaggedService.warehouseClientFactory,
                    'resolveLoadedCredentials',
                ).mockResolvedValue({
                    ...warehouseClientMock.credentials,
                    userWarehouseCredentialsUuid: undefined,
                    aiPlan: aiPlan ?? undefined,
                });
                vi.mocked(
                    projectModel.getWarehouseClientFromCredentials,
                ).mockImplementation(() => ({
                    ...warehouseClientMock,
                    runQuery: vi.fn(async () => resultsWith1Row),
                }));

                await flaggedService.searchFieldUniqueValues(
                    user,
                    projectUuid,
                    'a',
                    'a_dim1',
                    'test',
                    10,
                    undefined,
                    false,
                    undefined,
                    undefined,
                    context,
                );

                expect(getIfFresh).toHaveBeenCalledTimes(usesCache ? 1 : 0);
                expect(uploadResults).toHaveBeenCalledTimes(usesCache ? 1 : 0);
            },
        );

        const replaceWhitespace = (str: string) =>
            str.replace(/\s+/g, ' ').trim();

        const buildS3CacheMock = (
            lookups: string[],
            store: Map<string, string>,
        ) => ({
            getIfFresh: vi.fn(async (key: string) => {
                lookups.push(key);
                return store.get(key);
            }),
            uploadResults: vi.fn(async (key: string, buffer: Buffer) => {
                store.set(key, buffer.toString());
            }),
        });

        beforeEach(() => {
            // Clear the warehouse clients cache
            service.warehouseClientFactory.warehouseClients = {};
        });

        afterEach(() => {
            vi.clearAllMocks();
        });
        test('should query unique values', async () => {
            const runQueryMock = vi.fn(async (_sql: string) => resultsWith1Row);
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));
            await service.searchFieldUniqueValues(
                user,
                projectUuid,
                'a',
                'a_dim1',
                '',
                10,
                undefined,
            );
            expect(runQueryMock).toHaveBeenCalledTimes(1);
            expect(replaceWhitespace(runQueryMock.mock.calls[0][0])).toEqual(
                replaceWhitespace(`SELECT AS "a_dim1"
                                   FROM test.table AS "a"
                                   WHERE (( true ) AND ( () IS NOT NULL ))
                                   GROUP BY 1
                                   ORDER BY "a_dim1"
                                   LIMIT 10`),
            );
        });
        test('resolves credentials with the AI context for an AI field search', async () => {
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: vi.fn(async (_sql: string) => resultsWith1Row),
            }));
            const credentialsSpy = vi.spyOn(
                service.warehouseClientFactory,
                'withWarehouseClient',
            );
            await service.searchFieldUniqueValues(
                user,
                projectUuid,
                'a',
                'a_dim1',
                '',
                10,
                undefined,
                false,
                undefined,
                undefined,
                QueryExecutionContext.AI,
            );
            expect(credentialsSpy).toHaveBeenCalledWith(
                expect.objectContaining({ kind: 'binding', projectUuid }),
                expect.objectContaining({
                    queryContext: QueryExecutionContext.AI,
                }),
                expect.any(Function),
            );
            credentialsSpy.mockRestore();
        });
        test('returns resultsWithLabels deduped by value for a label dimension', async () => {
            const exploreWithLabelDimension: Explore = {
                ...validExplore,
                tables: {
                    ...validExplore.tables,
                    a: {
                        ...validExplore.tables.a,
                        dimensions: {
                            ...validExplore.tables.a.dimensions,
                            dim1: {
                                ...validExplore.tables.a.dimensions.dim1,
                                filterAutocomplete: {
                                    fetchFromWarehouse: true,
                                    labelDimension: 'label_dim',
                                },
                            },
                            label_dim: {
                                ...validExplore.tables.a.dimensions.dim1,
                                name: 'label_dim',
                                label: 'label_dim',
                            },
                        },
                    },
                },
            };
            (
                projectModel.findExploreByTableName as import('vitest').Mock
            ).mockResolvedValueOnce(exploreWithLabelDimension);

            const runQueryMock = vi.fn(async () => ({
                fields: {
                    a_dim1: { type: DimensionType.STRING },
                    a_label_dim: { type: DimensionType.STRING },
                },
                rows: [
                    { a_dim1: 'u1', a_label_dim: 'Alice' },
                    { a_dim1: 'u1', a_label_dim: 'Alice dup' },
                    { a_dim1: 'u2', a_label_dim: null },
                ],
            }));
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));

            const result = await service.searchFieldUniqueValues(
                user,
                projectUuid,
                'a',
                'a_dim1',
                '',
                10,
                undefined,
            );

            expect(result.results).toEqual(['u1', 'u2']);
            expect(result.resultsWithLabels).toEqual([
                { value: 'u1', label: 'Alice' },
                { value: 'u2', label: 'u2' },
            ]);
        });
        test('should query unique values with valid filters', async () => {
            const runQueryMock = vi.fn(async (_sql: string) => resultsWith1Row);
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));
            await service.searchFieldUniqueValues(
                user,
                projectUuid,
                'a',
                'a_dim1',
                '',
                10,
                {
                    id: '1',
                    and: [
                        {
                            id: 'valid',
                            operator: FilterOperator.EQUALS,
                            values: ['test'],
                            target: {
                                fieldId: 'a_dim1',
                            },
                        },
                        {
                            id: 'valid_joined',
                            operator: FilterOperator.EQUALS,
                            values: ['test'],
                            target: {
                                fieldId: 'b_dim1',
                            },
                        },
                        {
                            id: 'invalid',
                            operator: FilterOperator.EQUALS,
                            values: ['test'],
                            target: {
                                fieldId: 'c_dim1',
                            },
                        },
                    ],
                },
            );
            expect(runQueryMock).toHaveBeenCalledTimes(1);
            expect(replaceWhitespace(runQueryMock.mock.calls[0][0])).toEqual(
                replaceWhitespace(`SELECT AS "a_dim1"
                                        FROM test.table AS "a"
                                        LEFT OUTER JOIN public.b AS "b" ON ("a".dim1) = ("b".dim1)
                                        WHERE (( true ) AND ( () IS NOT NULL ) AND ( () IN ('test') ) AND ( () IN ('test') ))
                                        GROUP BY 1
                                        ORDER BY "a_dim1"
                                        LIMIT 10`),
            );
        });

        test('should use different cache keys for users with per-user warehouse credentials', async () => {
            const userA: SessionUser = {
                ...user,
                userUuid: 'user-aaaa-1111',
            };

            const userB: SessionUser = {
                ...user,
                userUuid: 'user-bbbb-2222',
            };

            // Enable autocomplete caching
            const serviceWithCache = getMockedProjectService({
                ...lightdashConfigMock,
                results: {
                    ...lightdashConfigMock.results,
                    autocompleteEnabled: true,
                    cacheStateTimeSeconds: 86400,
                },
            });
            serviceWithCache.warehouseClientFactory.warehouseClients = {};

            const runQueryMock = vi.fn(async (_sql: string) => resultsWith1Row);
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));

            // Mock getWarehouseCredentials to simulate per-user credentials
            vi.spyOn(
                serviceWithCache.warehouseClientFactory,
                'resolveLoadedCredentials',
            ).mockImplementation(async (_base, context) => ({
                ...warehouseClientMock.credentials,
                userWarehouseCredentialsUuid: `cred-${context.actor.person?.userUuid}`,
            }));

            // Mock S3 cache: track all cache key lookups
            const cacheKeyLookups: string[] = [];
            const cachedResults = new Map<string, string>();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (serviceWithCache as any).s3CacheClient = buildS3CacheMock(
                cacheKeyLookups,
                cachedResults,
            );

            // User A queries — populates the cache
            await serviceWithCache.searchFieldUniqueValues(
                userA,
                projectUuid,
                'a',
                'a_dim1',
                'test',
                10,
                undefined,
                false,
            );

            // User B queries the same field
            await serviceWithCache.searchFieldUniqueValues(
                userB,
                projectUuid,
                'a',
                'a_dim1',
                'test',
                10,
                undefined,
                false,
            );

            // Cache keys must differ when users have per-user warehouse credentials
            expect(cacheKeyLookups[0]).not.toEqual(cacheKeyLookups[1]);

            // Each user should query the warehouse independently
            expect(runQueryMock).toHaveBeenCalledTimes(2);
        });

        test('should share cache key when users have shared warehouse credentials', async () => {
            const userA: SessionUser = {
                ...user,
                userUuid: 'user-aaaa-1111',
            };

            const userB: SessionUser = {
                ...user,
                userUuid: 'user-bbbb-2222',
            };

            const serviceWithCache = getMockedProjectService({
                ...lightdashConfigMock,
                results: {
                    ...lightdashConfigMock.results,
                    autocompleteEnabled: true,
                    cacheStateTimeSeconds: 86400,
                },
            });
            serviceWithCache.warehouseClientFactory.warehouseClients = {};

            const runQueryMock = vi.fn(async (_sql: string) => resultsWith1Row);
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));

            // No userWarehouseCredentialsUuid — shared project credentials
            vi.spyOn(
                serviceWithCache.warehouseClientFactory,
                'resolveLoadedCredentials',
            ).mockResolvedValue({
                ...warehouseClientMock.credentials,
                userWarehouseCredentialsUuid: undefined,
            });

            const cacheKeyLookups: string[] = [];
            const cachedResults = new Map<string, string>();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (serviceWithCache as any).s3CacheClient = buildS3CacheMock(
                cacheKeyLookups,
                cachedResults,
            );

            await serviceWithCache.searchFieldUniqueValues(
                userA,
                projectUuid,
                'a',
                'a_dim1',
                'test',
                10,
                undefined,
                false,
            );

            await serviceWithCache.searchFieldUniqueValues(
                userB,
                projectUuid,
                'a',
                'a_dim1',
                'test',
                10,
                undefined,
                false,
            );

            // Cache keys must be the same — shared credentials, no per-user scoping
            expect(cacheKeyLookups[0]).toEqual(cacheKeyLookups[1]);

            // Warehouse should only be queried once — second call hits the cache
            expect(runQueryMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('updateDefaultUserSpaces', () => {
        test('should throw ForbiddenError when user cannot manage the project', async () => {
            const viewerUser: SessionUser = {
                ...user,
                userUuid: 'viewer-uuid',
                role: OrganizationMemberRole.VIEWER,
                ability: defineUserAbility(
                    {
                        userUuid: 'viewer-uuid',
                        role: OrganizationMemberRole.VIEWER,
                        organizationUuid: 'organizationUuid',
                    },
                    [],
                ),
            };

            await expect(
                service.updateDefaultUserSpaces(viewerUser, projectUuid, {
                    hasDefaultUserSpaces: true,
                }),
            ).rejects.toThrowError(ForbiddenError);
        });

        test.each([
            { hasDefaultUserSpaces: true, queuesBackfill: true },
            { hasDefaultUserSpaces: false, queuesBackfill: false },
        ])(
            'admin sets hasDefaultUserSpaces=$hasDefaultUserSpaces (backfill queued: $queuesBackfill)',
            async ({ hasDefaultUserSpaces, queuesBackfill }) => {
                const track = vi.spyOn(analyticsMock, 'track');
                const adminUser: SessionUser = {
                    ...user,
                    role: OrganizationMemberRole.ADMIN,
                    ability: defineUserAbility(
                        {
                            userUuid: user.userUuid,
                            role: OrganizationMemberRole.ADMIN,
                            organizationUuid: 'organizationUuid',
                        },
                        [],
                    ),
                };

                await service.updateDefaultUserSpaces(adminUser, projectUuid, {
                    hasDefaultUserSpaces,
                });

                expect(
                    projectModel.updateDefaultUserSpaces,
                ).toHaveBeenCalledExactlyOnceWith(
                    projectUuid,
                    hasDefaultUserSpaces,
                );
                expect(
                    vi.mocked(schedulerClient.backfillDefaultUserSpaces).mock
                        .calls,
                ).toEqual(
                    queuesBackfill
                        ? [
                              [
                                  {
                                      organizationUuid:
                                          projectSummary.organizationUuid,
                                      projectUuid,
                                      userUuid: adminUser.userUuid,
                                  },
                              ],
                          ]
                        : [],
                );
                expect(track).toHaveBeenCalledWith(
                    expect.objectContaining({
                        event: 'default_user_spaces.updated',
                        properties: {
                            organizationId: projectSummary.organizationUuid,
                            projectId: projectUuid,
                            hasDefaultUserSpaces,
                        },
                    }),
                );
            },
        );
    });

    describe('selective deploy model inventory', () => {
        test('tracks a selected source deploy after validation succeeds', async () => {
            const deployService = getMockedProjectService(lightdashConfigMock);
            const warehouseConnectionModel = Reflect.get(
                deployService,
                'warehouseConnectionModel',
            ) as unknown as Record<string, unknown>;
            Object.assign(warehouseConnectionModel, {
                getProject: vi.fn(async () => ({
                    projectUuid,
                    organizationUuid: projectSummary.organizationUuid,
                    originalWarehouseType: WarehouseTypes.POSTGRES,
                })),
            });
            const save = vi
                .spyOn(deployService, 'saveDeployExplores')
                .mockResolvedValue('catalog-job');
            const track = vi.spyOn(analyticsMock, 'track');
            vi.mocked(track).mockClear();
            const validation = vi
                .spyOn(schedulerClient, 'generateValidation')
                .mockImplementation(async () => {
                    expect(track).not.toHaveBeenCalledWith(
                        expect.objectContaining({
                            event: 'project.deployment_succeeded',
                        }),
                    );
                });
            const deployUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'DeployProject', action: 'manage' },
                ]),
            };
            try {
                await expect(
                    deployService.setExplores(
                        deployUser,
                        projectUuid,
                        [validExplore],
                        undefined,
                        undefined,
                        undefined,
                        {
                            sourceUuid: 'primary-source-uuid',
                            target: null,
                        },
                    ),
                ).resolves.toEqual({
                    exploreCount: 1,
                    warnings: {
                        exploresWithWarnings: [],
                        warningCount: 0,
                        warningExploreCount: 0,
                    },
                });
                expect(save).toHaveBeenCalledOnce();
                expect(validation).toHaveBeenCalledOnce();
                expect(track).toHaveBeenCalledWith(
                    expect.objectContaining({
                        event: 'project.deployment_succeeded',
                        properties: expect.objectContaining({
                            organizationId: projectSummary.organizationUuid,
                            projectId: projectUuid,
                            warehouseConnectionId: null,
                            connectionKind: null,
                            warehouseType: WarehouseTypes.POSTGRES,
                            connectionCount: 1,
                            entryPoint: 'cli_source',
                            reason: null,
                        }),
                    }),
                );
            } finally {
                save.mockRestore();
                validation.mockRestore();
                delete warehouseConnectionModel.getProject;
                track.mockRestore();
            }
        });

        test('tracks a failed selected source deploy when validation fails', async () => {
            const deployService = getMockedProjectService(lightdashConfigMock);
            const warehouseConnectionModel = Reflect.get(
                deployService,
                'warehouseConnectionModel',
            ) as unknown as Record<string, unknown>;
            Object.assign(warehouseConnectionModel, {
                getProject: vi.fn(async () => ({
                    projectUuid,
                    organizationUuid: projectSummary.organizationUuid,
                    originalWarehouseType: WarehouseTypes.POSTGRES,
                })),
            });
            const failure = new Error('validation unavailable');
            const save = vi
                .spyOn(deployService, 'saveDeployExplores')
                .mockResolvedValue('catalog-job');
            const validation = vi
                .spyOn(schedulerClient, 'generateValidation')
                .mockRejectedValue(failure);
            const track = vi.spyOn(analyticsMock, 'track');
            vi.mocked(track).mockClear();
            const deployUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'DeployProject', action: 'manage' },
                ]),
            };
            try {
                await expect(
                    deployService.setExplores(
                        deployUser,
                        projectUuid,
                        [validExplore],
                        undefined,
                        undefined,
                        undefined,
                        { sourceUuid: 'primary-source-uuid', target: null },
                    ),
                ).rejects.toBe(failure);
                expect(save).toHaveBeenCalledOnce();
                expect(track).toHaveBeenCalledWith(
                    expect.objectContaining({
                        event: 'project.deployment_failed',
                        properties: expect.objectContaining({
                            entryPoint: 'cli_source',
                            reason: 'other',
                        }),
                    }),
                );
                expect(track).not.toHaveBeenCalledWith(
                    expect.objectContaining({
                        event: 'project.deployment_succeeded',
                    }),
                );
            } finally {
                save.mockRestore();
                validation.mockRestore();
                delete warehouseConnectionModel.getProject;
                track.mockRestore();
            }
        });

        test.each([
            {
                name: 'single-source',
                hasAdditionalSources: false,
                expected: ['orders'],
            },
            {
                name: 'combined',
                hasAdditionalSources: true,
                expected: undefined,
            },
        ])(
            'only prunes deleted models for $name projects',
            async ({ hasAdditionalSources, expected }) => {
                const hasSources = vi
                    .fn()
                    .mockResolvedValue(hasAdditionalSources);
                const deployService = getMockedProjectService(
                    lightdashConfigMock,
                    {
                        projectDbtSourcesModel: {
                            hasSources,
                        } as unknown as ProjectDbtSourcesModel,
                    },
                );

                await deployService.saveExploresToCacheAndIndexCatalog({
                    userUuid: user.userUuid,
                    projectUuid,
                    explores: [validExplore],
                    compilationSource: 'cli_deploy',
                    complete: false,
                    dbtModelNames: ['orders'],
                });

                expect(hasSources).toHaveBeenCalledWith(projectUuid);
                expect(projectModel.saveExploresToCache).toHaveBeenCalledWith(
                    projectUuid,
                    [validExplore],
                    false,
                    expected,
                );
            },
        );

        test('preserves legacy selective deploys without querying source ownership', async () => {
            const hasSources = vi.fn();
            const deployService = getMockedProjectService(lightdashConfigMock, {
                projectDbtSourcesModel: {
                    hasSources,
                } as unknown as ProjectDbtSourcesModel,
            });

            await deployService.saveExploresToCacheAndIndexCatalog({
                userUuid: user.userUuid,
                projectUuid,
                explores: [validExplore],
                compilationSource: 'cli_deploy',
                complete: false,
            });

            expect(hasSources).not.toHaveBeenCalled();
            expect(projectModel.saveExploresToCache).toHaveBeenCalledWith(
                projectUuid,
                [validExplore],
                false,
                undefined,
            );
        });
    });

    describe('pre-aggregate refreshes', () => {
        const adminUser: SessionUser = {
            ...user,
            role: OrganizationMemberRole.ADMIN,
            ability: defineUserAbility(
                {
                    userUuid: user.userUuid,
                    role: OrganizationMemberRole.ADMIN,
                    organizationUuid: 'organizationUuid',
                },
                [],
            ),
        };

        test('saveExploresToCacheAndIndexCatalog skips preview project materialization jobs', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });

            (projectModel.get as import('vitest').Mock).mockResolvedValueOnce({
                ...projectWithSensitiveFields,
                type: ProjectType.PREVIEW,
            });

            await serviceWithPreAggregatesEnabled.saveExploresToCacheAndIndexCatalog(
                {
                    userUuid: user.userUuid,
                    projectUuid,
                    explores: [validExplore],
                    compilationSource: 'cli_deploy',
                },
            );

            expect(
                preAggregateModel.upsertPreAggregateDefinitions,
            ).toHaveBeenCalledTimes(1);
            expect(
                preAggregateModel.getPreAggregateDefinitionsForProject,
            ).not.toHaveBeenCalled();
            expect(
                schedulerClient.materializePreAggregate,
            ).not.toHaveBeenCalled();
            expect(
                schedulerClient.schedulePreAggregateCronJobs,
            ).not.toHaveBeenCalled();
        });

        test('syncs external pre-aggregate definitions with null materialization query and null cron', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });

            const externalSourceExplore = {
                ...validExplore,
                preAggregates: [
                    {
                        name: 'rollup',
                        dimensions: ['dim1'],
                        metrics: ['met1'],
                        table: '"analytics"."rollup_mv"',
                        // Materialization-only key, ignored for external defs
                        refresh: { cron: '0 3 * * *' },
                    },
                ],
            } as Explore;

            (
                projectModel.getAllExploresFromCache as import('vitest').Mock
            ).mockResolvedValue({
                'source-uuid': externalSourceExplore,
                'preagg-uuid': preAggregateExplore,
            });

            await serviceWithPreAggregatesEnabled.saveExploresToCacheAndIndexCatalog(
                {
                    userUuid: user.userUuid,
                    projectUuid,
                    explores: [externalSourceExplore],
                    compilationSource: 'cli_deploy',
                },
            );

            expect(
                preAggregateModel.upsertPreAggregateDefinitions,
            ).toHaveBeenCalledWith([
                expect.objectContaining({
                    pre_agg_cached_explore_uuid: 'preagg-uuid',
                    materialization_metric_query: null,
                    materialization_query_error: null,
                    refresh_cron: null,
                }),
            ]);
            expect(
                schedulerClient.materializePreAggregate,
            ).not.toHaveBeenCalled();
            expect(
                schedulerClient.schedulePreAggregateCronJobs,
            ).not.toHaveBeenCalled();
        });

        test('checkPreAggregateMatch returns a hit for external pre-aggregates without a materialization', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            const sourceExplore = {
                ...validExplore,
                tables: {
                    ...validExplore.tables,
                    a: {
                        ...validExplore.tables.a,
                        metrics: {
                            ...validExplore.tables.a.metrics,
                            met1: {
                                ...validExplore.tables.a.metrics.met1,
                                type: MetricType.COUNT,
                            },
                        },
                    },
                },
                preAggregates: [
                    {
                        name: 'rollup',
                        dimensions: ['dim1'],
                        metrics: ['met1'],
                        table: '"analytics"."rollup_mv"',
                    },
                ],
            } as Explore;

            (
                projectModel.findExploresFromCache as import('vitest').Mock
            ).mockImplementation(
                async (
                    _projectUuid: string,
                    _field: string,
                    exploreNames: string[],
                ) =>
                    Object.fromEntries(
                        exploreNames
                            .map((exploreName) => [
                                exploreName,
                                {
                                    [sourceExplore.name]: sourceExplore,
                                    [preAggregateExplore.name]:
                                        preAggregateExplore,
                                }[exploreName],
                            ])
                            .filter(([, explore]) => explore !== undefined),
                    ),
            );

            const result =
                await serviceWithPreAggregatesEnabled.checkPreAggregateMatch({
                    account: developerAccount,
                    projectUuid,
                    exploreName: sourceExplore.name,
                    metricQuery: {
                        ...metricQueryMock,
                        tableCalculations: [],
                    },
                    usePreAggregateCache: true,
                });

            expect(result).toEqual({
                hit: true,
                preAggregateName: 'rollup',
                preAggregateExploreName: preAggregateExplore.name,
            });
            expect(
                preAggregateModel.getActiveMaterialization,
            ).not.toHaveBeenCalled();
        });

        test('checkPreAggregateMatch returns a miss when the pre-aggregate is not materialized', async () => {
            const serviceWithPreAggregatesEnabled = getMockedProjectService({
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled: true,
                },
            });
            const sourceExplore = {
                ...validExplore,
                tables: {
                    ...validExplore.tables,
                    a: {
                        ...validExplore.tables.a,
                        metrics: {
                            ...validExplore.tables.a.metrics,
                            met1: {
                                ...validExplore.tables.a.metrics.met1,
                                type: MetricType.COUNT,
                            },
                        },
                    },
                },
                preAggregates: [
                    {
                        name: 'rollup',
                        dimensions: ['dim1'],
                        metrics: ['met1'],
                    },
                ],
            } as Explore;

            (
                projectModel.findExploresFromCache as import('vitest').Mock
            ).mockImplementation(
                async (
                    _projectUuid: string,
                    _field: string,
                    exploreNames: string[],
                ) =>
                    Object.fromEntries(
                        exploreNames
                            .map((exploreName) => [
                                exploreName,
                                {
                                    [sourceExplore.name]: sourceExplore,
                                    [preAggregateExplore.name]:
                                        preAggregateExplore,
                                }[exploreName],
                            ])
                            .filter(([, explore]) => explore !== undefined),
                    ),
            );
            (
                preAggregateModel.getActiveMaterialization as import('vitest').Mock
            ).mockResolvedValueOnce(undefined);

            const result =
                await serviceWithPreAggregatesEnabled.checkPreAggregateMatch({
                    account: developerAccount,
                    projectUuid,
                    exploreName: sourceExplore.name,
                    metricQuery: {
                        ...metricQueryMock,
                        tableCalculations: [],
                    },
                    usePreAggregateCache: true,
                });

            expect(result).toEqual({
                hit: false,
                reason: {
                    reason: PreAggregateMissReason.NO_ACTIVE_MATERIALIZATION,
                },
            });
            expect(
                preAggregateModel.getActiveMaterialization,
            ).toHaveBeenCalledWith(projectUuid, preAggregateExplore.name);
        });

        test('refreshPreAggregates schedules only materializable definitions', async () => {
            (
                preAggregateModel.getPreAggregateDefinitionsForProject as import('vitest').Mock
            ).mockResolvedValue([
                {
                    preAggregateDefinitionUuid: 'def-valid',
                    projectUuid,
                    sourceCachedExploreUuid: 'source-1',
                    preAggCachedExploreUuid: 'preagg-1',
                    preAggregateDefinition: {
                        name: 'valid',
                        dimensions: ['orders.status'],
                        metrics: ['orders.count'],
                    },
                    materializationMetricQuery: {
                        metricQuery: METRIC_QUERY,
                        metricComponents: {},
                        timeDimensionFieldId: null,
                        resolvedMaxRows: null,
                    },
                    materializationQueryError: null,
                    refreshCron: null,
                    createdAt: new Date('2024-01-01'),
                    updatedAt: new Date('2024-01-01'),
                },
                {
                    preAggregateDefinitionUuid: 'def-invalid',
                    projectUuid,
                    sourceCachedExploreUuid: 'source-1',
                    preAggCachedExploreUuid: 'preagg-2',
                    preAggregateDefinition: {
                        name: 'invalid',
                        dimensions: ['orders.status'],
                        metrics: ['orders.count'],
                    },
                    materializationMetricQuery: null,
                    materializationQueryError: 'Unknown metric "orders.count"',
                    refreshCron: null,
                    createdAt: new Date('2024-01-01'),
                    updatedAt: new Date('2024-01-01'),
                },
            ]);
            (
                schedulerClient.materializePreAggregate as import('vitest').Mock
            ).mockResolvedValueOnce({ jobId: 'job-valid' });

            const result = await service.refreshPreAggregates(
                adminUser,
                projectUuid,
            );

            expect(result).toEqual({ jobIds: ['job-valid'] });
            expect(
                schedulerClient.materializePreAggregate,
            ).toHaveBeenCalledTimes(1);
            expect(
                schedulerClient.materializePreAggregate,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    preAggregateDefinitionUuid: 'def-valid',
                    trigger: 'manual',
                }),
            );
        });

        test('refreshPreAggregateByDefinitionName throws actionable error when definition is invalid', async () => {
            (
                preAggregateModel.getPreAggregateDefinitionByDefinitionName as import('vitest').Mock
            ).mockResolvedValue({
                preAggregateDefinitionUuid: 'def-invalid',
                projectUuid,
                sourceCachedExploreUuid: 'source-1',
                preAggCachedExploreUuid: 'preagg-2',
                preAggregateDefinition: {
                    name: 'invalid',
                    dimensions: ['orders.status'],
                    metrics: ['orders.count'],
                },
                materializationMetricQuery: null,
                materializationQueryError: 'Unknown metric "orders.count"',
                refreshCron: null,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
                preAggExploreName: 'orders__invalid',
            });

            await expect(
                service.refreshPreAggregateByDefinitionName(
                    adminUser,
                    projectUuid,
                    'invalid',
                ),
            ).rejects.toThrowError(
                'Pre-aggregate definition "invalid" cannot be materialized: Unknown metric "orders.count"',
            );
        });
    });

    describe('combineParameters', () => {
        test('should include savedParameterValues from explore', async () => {
            const explore = {
                name: 'my_virtual_view',
                baseTable: 'my_virtual_view',
                tables: {},
                savedParameterValues: {
                    order_status: 'completed',
                },
            } as Pick<
                Explore,
                'name' | 'baseTable' | 'tables' | 'savedParameterValues'
            >;

            const result = await service.combineParameters(
                projectUuid,
                explore as Explore,
            );

            expect(result).toEqual(
                expect.objectContaining({
                    order_status: 'completed',
                }),
            );
        });

        test('savedParameterValues should be overridden by request parameters', async () => {
            const explore = {
                name: 'my_virtual_view',
                baseTable: 'my_virtual_view',
                tables: {},
                savedParameterValues: {
                    order_status: 'completed',
                    region: 'US',
                },
            } as Pick<
                Explore,
                'name' | 'baseTable' | 'tables' | 'savedParameterValues'
            >;

            const result = await service.combineParameters(
                projectUuid,
                explore as Explore,
                { order_status: 'pending' }, // request parameters override
            );

            // Request param overrides saved value
            expect(result.order_status).toBe('pending');
            // Saved param without request override is still included
            expect(result.region).toBe('US');
        });

        describe('parameter with fixed options', () => {
            const mockFixedOptionsParameter = () =>
                (
                    service as unknown as {
                        projectParametersModel: {
                            find: import('vitest').Mock;
                        };
                    }
                ).projectParametersModel.find.mockResolvedValueOnce([
                    {
                        name: 'time_zoom',
                        config: {
                            label: 'Time zoom',
                            default: 'monthly',
                            options: ['weekly', 'monthly', 'quarterly'],
                        },
                    },
                ]);

            test('falls back to the default when request and saved values are outside the options', async () => {
                mockFixedOptionsParameter();

                const result = await service.combineParameters(
                    projectUuid,
                    undefined,
                    { time_zoom: 'bogus' },
                    { time_zoom: 'true' },
                );

                expect(result.time_zoom).toBe('monthly');
            });

            test('falls through to a valid saved value when the request value is outside the options', async () => {
                mockFixedOptionsParameter();

                const result = await service.combineParameters(
                    projectUuid,
                    undefined,
                    { time_zoom: 'bogus' },
                    { time_zoom: 'weekly' },
                );

                expect(result.time_zoom).toBe('weekly');
            });

            test('applies a request value listed in the options', async () => {
                mockFixedOptionsParameter();

                const result = await service.combineParameters(
                    projectUuid,
                    undefined,
                    { time_zoom: 'quarterly' },
                );

                expect(result.time_zoom).toBe('quarterly');
            });
        });

        describe('date parameter with a `today` default', () => {
            beforeEach(() => {
                vi.useFakeTimers().setSystemTime(
                    new Date('2026-09-17T12:00:00Z'),
                );
                projectModel.getQueryTimezone.mockResolvedValue('UTC');
            });
            afterEach(() => {
                vi.useRealTimers();
                projectModel.getQueryTimezone.mockReset();
                projectModel.getQueryTimezone.mockResolvedValue(null);
            });

            test('takes the date in the project query timezone', async () => {
                // 23:30 UTC on 17 Sep is already 18 Sep in Auckland
                vi.setSystemTime(new Date('2026-09-17T23:30:00Z'));
                projectModel.getQueryTimezone.mockResolvedValue(
                    'Pacific/Auckland',
                );
                (
                    service as unknown as {
                        projectParametersModel: {
                            find: import('vitest').Mock;
                        };
                    }
                ).projectParametersModel.find.mockResolvedValueOnce([
                    {
                        name: 'period_to',
                        config: {
                            label: 'Period to',
                            type: 'date',
                            default: 'today',
                        },
                    },
                ]);

                const result = await service.combineParameters(projectUuid);

                expect(result.period_to).toBe('2026-09-18');
                expect(projectModel.getQueryTimezone).toHaveBeenCalledWith(
                    projectUuid,
                );
            });

            test('does not look up the timezone when no default is `today`', async () => {
                (
                    service as unknown as {
                        projectParametersModel: {
                            find: import('vitest').Mock;
                        };
                    }
                ).projectParametersModel.find.mockResolvedValueOnce([
                    {
                        name: 'fixed',
                        config: {
                            label: 'Fixed',
                            type: 'date',
                            default: '2026-07-31',
                        },
                    },
                ]);

                const result = await service.combineParameters(projectUuid);

                expect(result.fixed).toBe('2026-07-31');
                expect(projectModel.getQueryTimezone).not.toHaveBeenCalled();
            });

            test('resolves project and model level defaults to the current date', async () => {
                (
                    service as unknown as {
                        projectParametersModel: {
                            find: import('vitest').Mock;
                        };
                    }
                ).projectParametersModel.find.mockResolvedValueOnce([
                    {
                        name: 'period_to',
                        config: {
                            label: 'Period to',
                            type: 'date',
                            default: 'today',
                        },
                    },
                ]);
                const explore = {
                    name: 'orders',
                    baseTable: 'orders',
                    tables: {
                        orders: {
                            name: 'orders',
                            parameters: {
                                as_of: {
                                    label: 'As of',
                                    type: 'date',
                                    default: 'today',
                                },
                                fixed: {
                                    label: 'Fixed',
                                    type: 'date',
                                    default: '2026-07-31',
                                },
                            },
                        },
                    },
                } as unknown as Explore;

                const result = await service.combineParameters(
                    projectUuid,
                    explore,
                );

                expect(result).toEqual({
                    period_to: '2026-09-17',
                    'orders.as_of': '2026-09-17',
                    'orders.fixed': '2026-07-31',
                });
            });

            test('an explicit value still wins over the resolved default', async () => {
                (
                    service as unknown as {
                        projectParametersModel: {
                            find: import('vitest').Mock;
                        };
                    }
                ).projectParametersModel.find.mockResolvedValueOnce([
                    {
                        name: 'period_to',
                        config: {
                            label: 'Period to',
                            type: 'date',
                            default: 'today',
                        },
                    },
                ]);

                const result = await service.combineParameters(
                    projectUuid,
                    undefined,
                    { period_to: '2026-07-31' },
                );

                expect(result.period_to).toBe('2026-07-31');
            });
        });
    });

    describe('dashboard tile parameters', () => {
        const statusExplore = (withDefault: boolean) =>
            ({
                name: 'orders',
                baseTable: 'orders',
                tables: {
                    orders: {
                        name: 'orders',
                        parameters: {
                            status: withDefault
                                ? { label: 'Status', default: 'all' }
                                : { label: 'Status' },
                        },
                    },
                },
            }) as unknown as Explore;
        const cancelledChart = { 'orders.status': 'Cancelled' };
        const expiredChart = { 'orders.status': 'Expired' };

        const resolveTile = (
            explore: Explore,
            chartSavedValues: Record<string, string>,
            dashboardValues: Record<string, string> = {},
        ) =>
            service.resolveDashboardTileParameters({
                projectUuid,
                explore,
                dashboardValues,
                chartSavedValues,
                isTargeted: true,
                preloadedProjectParameters: [],
            });

        test('tiles resolve the definition default over their saved values', async () => {
            const explore = statusExplore(true);
            await expect(resolveTile(explore, cancelledChart)).resolves.toEqual(
                { 'orders.status': 'all' },
            );
            await expect(resolveTile(explore, expiredChart)).resolves.toEqual({
                'orders.status': 'all',
            });
        });

        test('tiles keep their own saved values without a definition default', async () => {
            const explore = statusExplore(false);
            await expect(resolveTile(explore, cancelledChart)).resolves.toEqual(
                { 'orders.status': 'Cancelled' },
            );
            await expect(resolveTile(explore, expiredChart)).resolves.toEqual({
                'orders.status': 'Expired',
            });
        });

        test('standalone charts keep their saved values over the definition default', async () => {
            await expect(
                service.combineParameters(
                    projectUuid,
                    statusExplore(true),
                    {},
                    cancelledChart,
                    [],
                ),
            ).resolves.toEqual({ 'orders.status': 'Cancelled' });
        });

        test('an explicit dashboard value overrides every tile', async () => {
            const dashboardValues = { 'orders.status': 'Shipped' };
            await Promise.all(
                [true, false].flatMap((withDefault) =>
                    [cancelledChart, expiredChart].map(async (chart) => {
                        await expect(
                            resolveTile(
                                statusExplore(withDefault),
                                chart,
                                dashboardValues,
                            ),
                        ).resolves.toEqual({ 'orders.status': 'Shipped' });
                    }),
                ),
            );
        });

        test('a project default counts as the definition default', async () => {
            (
                service as unknown as {
                    projectParametersModel: { find: import('vitest').Mock };
                }
            ).projectParametersModel.find.mockResolvedValueOnce([
                { name: 'region', config: { label: 'Region', default: 'EU' } },
            ]);
            await expect(
                service.resolveDashboardTileParameters({
                    projectUuid,
                    explore: statusExplore(false),
                    dashboardValues: {},
                    chartSavedValues: { region: 'US' },
                    isTargeted: true,
                    preloadedProjectParameters: null,
                }),
            ).resolves.toEqual({ region: 'EU' });
        });

        test('merge overrides carry only the values above the fallback chain', async () => {
            await expect(
                service.getDashboardTileParameterOverrides({
                    projectUuid,
                    explores: [statusExplore(true)],
                    dashboardValues: { tier: 'gold' },
                    chartSavedValues: {
                        ...cancelledChart,
                        year: '2024',
                    },
                    isTargeted: true,
                }),
            ).resolves.toEqual({ tier: 'gold', year: '2024' });
        });
    });

    describe('getChartsByExploreName', () => {
        const exploreName = 'orders';
        const spaceUuid = 'uuid';
        const chartSummaryMock: ChartSummary = {
            uuid: 'chart-uuid',
            name: 'Orders chart',
            description: undefined,
            spaceUuid,
            spaceName: 'space',
            projectUuid: defaultProject.projectUuid,
            organizationUuid: projectSummary.organizationUuid,
            pinnedListUuid: null,
            chartKind: undefined,
            dashboardUuid: null,
            dashboardName: null,
            slug: 'orders-chart',
        };

        beforeEach(() => {
            vi.clearAllMocks();
        });

        test('returns charts from accessible spaces for a valid explore name', async () => {
            const spacePermissionService = {
                getAccessibleSpaceUuids: vi.fn(async () => [spaceUuid]),
            } as unknown as SpacePermissionService;
            const serviceWithPermissions = getMockedProjectService(
                lightdashConfigMock,
                { spacePermissionService },
            );
            (
                savedChartModel.find as import('vitest').Mock
            ).mockResolvedValueOnce([chartSummaryMock]);

            const result = await serviceWithPermissions.getChartsByExploreName(
                user,
                defaultProject.projectUuid,
                exploreName,
            );

            expect(savedChartModel.find).toHaveBeenCalledWith({
                projectUuid: defaultProject.projectUuid,
                spaceUuids: [spaceUuid],
                exploreName,
            });
            expect(result).toEqual([chartSummaryMock]);
        });

        test('returns empty array when no charts use the given explore', async () => {
            const spacePermissionService = {
                getAccessibleSpaceUuids: vi.fn(async () => [spaceUuid]),
            } as unknown as SpacePermissionService;
            const serviceWithPermissions = getMockedProjectService(
                lightdashConfigMock,
                { spacePermissionService },
            );
            (
                savedChartModel.find as import('vitest').Mock
            ).mockResolvedValueOnce([]);

            const result = await serviceWithPermissions.getChartsByExploreName(
                user,
                defaultProject.projectUuid,
                'nonexistent_explore',
            );

            expect(result).toEqual([]);
        });

        test('throws ForbiddenError when user cannot view the project', async () => {
            const restrictedUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([]),
            } as unknown as SessionUser;

            await expect(
                service.getChartsByExploreName(
                    restrictedUser,
                    defaultProject.projectUuid,
                    exploreName,
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('getCustomMetrics', () => {
        test('returns custom metrics when the user can view the project', async () => {
            (
                savedChartModel.find as import('vitest').Mock
            ).mockResolvedValueOnce([]);

            const result = await service.getCustomMetrics(
                user,
                defaultProject.projectUuid,
            );

            expect(result).toEqual([]);
            expect(savedChartModel.find).toHaveBeenCalledWith({
                projectUuid: defaultProject.projectUuid,
            });
        });

        test('throws ForbiddenError without querying charts when the user cannot view the project', async () => {
            const restrictedUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([]),
            } as unknown as SessionUser;

            await expect(
                service.getCustomMetrics(
                    restrictedUser,
                    defaultProject.projectUuid,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(savedChartModel.find).not.toHaveBeenCalled();
        });
    });

    describe('getUserAttributes', () => {
        // vi.clearAllMocks() in the outer afterEach does not drain
        // mockImplementationOnce queues — reset the email mock per test so
        // queued rejections don't leak between cases.
        beforeEach(() => {
            emailModel.getPrimaryEmailStatus.mockReset();
            emailModel.getPrimaryEmailStatus.mockResolvedValue({
                isVerified: true,
            });
        });

        test('skips email lookup for service accounts and returns empty intrinsic attributes', async () => {
            // Real service-account principals have no row in `emails`, so
            // getPrimaryEmailStatus throws NotFoundError. Simulate that to
            // prove the bypass runs before the lookup.
            emailModel.getPrimaryEmailStatus.mockImplementation(() => {
                throw new NotFoundError(
                    "Cannot find matching verification status for user's email",
                );
            });

            const serviceAccount = buildAccount({
                accountType: 'service-account',
            });

            const result = await service.getUserAttributes({
                account: serviceAccount,
            });

            expect(result.intrinsicUserAttributes).toEqual({});
            expect(emailModel.getPrimaryEmailStatus).not.toHaveBeenCalled();
        });

        test('skips email lookup for embedded service-account write users and returns empty intrinsic attributes', async () => {
            emailModel.getPrimaryEmailStatus.mockImplementation(() => {
                throw new NotFoundError(
                    "Cannot find matching verification status for user's email",
                );
            });

            const result = await service.getUserAttributes({
                user: {
                    ...user,
                    email: undefined,
                    serviceAccount: {
                        uuid: 'service-account-uuid',
                        description: 'Embed write actor',
                    },
                },
            });

            expect(result.intrinsicUserAttributes).toEqual({});
            expect(emailModel.getPrimaryEmailStatus).not.toHaveBeenCalled();
        });

        test('still attaches intrinsic email attributes for session users', async () => {
            const result = await service.getUserAttributes({ account });

            expect(emailModel.getPrimaryEmailStatus).toHaveBeenCalledWith(
                account.user.id,
            );
            expect(result.intrinsicUserAttributes).not.toEqual({});
        });

        test('still attaches intrinsic email attributes when session user has no service account identity', async () => {
            const result = await service.getUserAttributes({
                user: {
                    ...user,
                    serviceAccount: undefined,
                },
            });

            expect(emailModel.getPrimaryEmailStatus).toHaveBeenCalledWith(
                user.userUuid,
            );
            expect(result.intrinsicUserAttributes).not.toEqual({});
        });
    });

    describe('dbt Cloud webhook scoped client', () => {
        it.each([false, true])(
            'releases before saving or after validation failure: %s',
            async (fails) => {
                const configured = getMockedProjectService(lightdashConfigMock);
                const { credentials } = warehouseClientMock;
                projectModel.getWithSensitiveFields.mockResolvedValueOnce({
                    ...projectWithSensitiveFields,
                    warehouseConnection: credentials,
                });
                vi.mocked(fetch).mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            metadata: {
                                env: {
                                    DBT_CLOUD_PR_ID: '12',
                                    DBT_CLOUD_JOB_ID: '34',
                                },
                            },
                            nodes: {},
                        }),
                    ),
                );
                const validate = vi.spyOn(
                    DbtBaseProjectAdapter,
                    '_validateDbtModel',
                );
                const error = new Error('invalid manifest');
                if (fails)
                    validate.mockImplementationOnce(() => {
                        throw error;
                    });
                const save = vi
                    .spyOn(configured, 'saveExploresToCacheAndIndexCatalog')
                    .mockResolvedValueOnce('projectUuid');
                projectModel.getAllByOrganizationUuid.mockImplementationOnce(
                    async () => {
                        expect(
                            vi.mocked(SshTunnel).mock.results.at(-1)?.value
                                .disconnect,
                        ).toHaveBeenCalledOnce();
                        return [
                            {
                                ...projectWithSensitiveFields,
                                createdByUserName: 'Test User',
                                createdAt: new Date(),
                                upstreamProjectUuid: null,
                                name: 'preview_34_12',
                                type: ProjectType.PREVIEW,
                            },
                        ];
                    },
                );
                const scope = vi.spyOn(
                    configured.warehouseClientFactory,
                    'withWarehouseClient',
                );
                try {
                    const result = configured.createPreviewFromDbtCloudWebhook(
                        'projectUuid',
                        1,
                        2,
                        { rawBody: null, signature: null },
                    );
                    if (fails) {
                        await expect(result).rejects.toBe(error);
                        expect(save).not.toHaveBeenCalled();
                    } else {
                        await expect(result).resolves.toBe('projectUuid');
                        expect(save).toHaveBeenCalledWith(
                            expect.objectContaining({ explores: [] }),
                        );
                    }
                    expect(scope).toHaveBeenCalledWith(
                        {
                            kind: 'bypass',
                            mode: 'dbt_cloud_preview_webhook',
                            projectUuid: 'projectUuid',
                            credentials,
                        },
                        expect.objectContaining({
                            organizationUuid:
                                projectWithSensitiveFields.organizationUuid,
                            queryContext: null,
                            purpose: 'compile',
                        }),
                        expect.any(Function),
                    );
                    expect(
                        vi.mocked(SshTunnel).mock.results.at(-1)?.value
                            .disconnect,
                    ).toHaveBeenCalledOnce();
                    expect(
                        configured.warehouseClientFactory.warehouseClients,
                    ).toEqual({});
                } finally {
                    validate.mockRestore();
                    save.mockRestore();
                    projectModel.getAllByOrganizationUuid.mockReset();
                }
            },
        );
    });

    describe('connection test scoped clients', () => {
        const credentials: CreatePostgresCredentials = {
            type: WarehouseTypes.POSTGRES,
            host: 'warehouse.internal',
            port: 5432,
            dbname: 'analytics',
            schema: 'public',
            user: 'warehouse-user',
            password: 'password',
        };
        it.each([
            'success',
            'database',
            'construction',
            'tunnel',
            'other',
        ] as const)(
            'preserves the %s result and releases once',
            async (failure) => {
                const configured = getMockedProjectService(lightdashConfigMock);
                const disconnect = vi.fn();
                const error =
                    failure === 'tunnel'
                        ? new SshTunnelError('key rejected', { stage: 'auth' })
                        : new Error('connection failed');
                const connect =
                    failure === 'tunnel' || failure === 'other'
                        ? vi.fn().mockRejectedValue(error)
                        : vi.fn().mockResolvedValue(credentials);
                vi.mocked(SshTunnel).mockImplementationOnce(
                    function MockTestTunnel(
                        this: SshTunnel<CreateWarehouseCredentials>,
                    ) {
                        this.connect = connect;
                        this.disconnect = disconnect;
                        return this;
                    },
                );
                const test =
                    failure === 'database'
                        ? vi.fn().mockRejectedValue(error)
                        : vi.fn().mockResolvedValue(undefined);
                if (failure === 'construction') {
                    projectModel.getWarehouseClientFromCredentials.mockImplementationOnce(
                        () => {
                            throw error;
                        },
                    );
                } else if (failure !== 'tunnel' && failure !== 'other') {
                    projectModel.getWarehouseClientFromCredentials.mockReturnValueOnce(
                        {
                            ...warehouseClientMock,
                            runQuery: vi.fn(async () => resultsWith1Row),
                            test,
                        },
                    );
                }
                const result = configured.testWarehouseConnectionCredentials(
                    developerAccount as RegisteredAccount,
                    projectSummary.organizationUuid,
                    credentials,
                );
                if (failure === 'other') {
                    await expect(result).rejects.toBe(error);
                } else if (failure === 'tunnel') {
                    await expect(result).resolves.toEqual({
                        ok: false,
                        hops: [
                            { stage: 'resolve', status: 'ok', message: null },
                            { stage: 'tcp', status: 'ok', message: null },
                            { stage: 'handshake', status: 'ok', message: null },
                            {
                                stage: 'auth',
                                status: 'failed',
                                message: 'key rejected',
                            },
                            {
                                stage: 'forward',
                                status: 'skipped',
                                message: null,
                            },
                            {
                                stage: 'database',
                                status: 'skipped',
                                message: null,
                            },
                        ],
                    });
                } else {
                    await expect(result).resolves.toEqual({
                        ok: failure === 'success',
                        hops: [
                            {
                                stage: 'database',
                                status: failure === 'success' ? 'ok' : 'failed',
                                message:
                                    failure === 'success'
                                        ? null
                                        : 'connection failed',
                            },
                        ],
                    });
                }
                expect(disconnect).toHaveBeenCalledOnce();
                expect(
                    configured.warehouseClientFactory.warehouseClients,
                ).toEqual({});
            },
        );
    });

    describe('previewDataTimezone', () => {
        const previewAccount = developerAccount as RegisteredAccount;
        const noAccessAccount = {
            ...developerAccount,
            user: {
                ...developerAccount.user,
                ability: new Ability<PossibleAbilities>([]),
            },
        } as RegisteredAccount;
        const credentials = {
            type: WarehouseTypes.POSTGRES,
            dataTimezone: 'America/New_York',
        } as CreateWarehouseCredentials;

        // The aware case derives from currentUtcWallClock(); pin the clock so
        // the rendered instants are deterministic.
        beforeEach(() => {
            vi.useFakeTimers().setSystemTime(
                new Date('2026-06-08T14:30:00.000Z'),
            );
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it('throws ForbiddenError when timezone support is disabled', async () => {
            await expect(
                service.previewDataTimezone(previewAccount, {
                    mode: 'create',
                    credentials,
                }),
            ).rejects.toThrowError(ForbiddenError);
        });

        it('splits the preview into affected naive and unaffected aware groups (edit flow)', async () => {
            vi.spyOn(service, 'isTimezoneSupportEnabled').mockResolvedValueOnce(
                true,
            );
            (
                projectModel.getWithSensitiveFields as import('vitest').Mock
            ).mockResolvedValueOnce({
                ...projectWithSensitiveFields,
                warehouseConnection: {
                    type: WarehouseTypes.POSTGRES,
                } as CreateWarehouseCredentials,
            });
            vi.mocked(SshTunnel).mockImplementationOnce(
                function MockTimezoneTunnel(
                    this: SshTunnel<CreateWarehouseCredentials>,
                    suppliedCredentials: CreateWarehouseCredentials,
                ) {
                    this.connect = vi.fn(async () => suppliedCredentials);
                    this.disconnect = vi.fn(async () => undefined);
                    return this;
                },
            );
            const runQuery = vi.fn(async () => ({
                fields: {},
                rows: [{ naive_instant: '2026-06-08 18:30:00' }],
            }));
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockReturnValueOnce({
                getAdapterType: () => SupportedDbtAdapter.POSTGRES,
                runQuery,
            });

            const result = await service.previewDataTimezone(previewAccount, {
                mode: 'edit',
                projectUuid: 'projectUuid',
                warehouseType: WarehouseTypes.POSTGRES,
                dataTimezone: 'America/New_York',
            });

            expect(
                vi.mocked(SshTunnel).mock.results.at(-1)?.value.disconnect,
            ).toHaveBeenCalledOnce();
            expect(
                projectModel.getWarehouseClientFromCredentials,
            ).toHaveBeenLastCalledWith(
                {
                    type: WarehouseTypes.POSTGRES,
                    dataTimezone: 'America/New_York',
                },
                expect.any(Object),
            );
            expect(runQuery).toHaveBeenCalledExactlyOnceWith(
                expect.any(String),
                expect.objectContaining({
                    organization_uuid:
                        previewAccount.organization.organizationUuid,
                    user_uuid: previewAccount.user.userUuid,
                    query_context: QueryExecutionContext.API,
                }),
                'America/New_York',
            );
            expect(result.projectTimezone).toBe('UTC');
            expect(result.dataTimezoneApplies).toBe(true);
            expect(result.naive.interpretedAs).toBe('America/New_York');
            expect(result.naive.readAs).toBe('2026-06-08, 14:30:00 (-04:00)');
            expect(result.naive.rendered).toBe('2026-06-08, 18:30:00 (+00:00)');
            expect(result.aware.raw).toBe('2026-06-08, 14:30:00 (+00:00)');
            expect(result.aware.rendered).toBe('2026-06-08, 14:30:00 (+00:00)');
        });

        it('releases the tunnel when the preview query fails', async () => {
            vi.spyOn(service, 'isTimezoneSupportEnabled').mockResolvedValueOnce(
                true,
            );
            projectModel.getWithSensitiveFields.mockResolvedValueOnce({
                ...projectWithSensitiveFields,
                warehouseConnection: credentials,
            });
            const error = new Error('preview query failed');
            projectModel.getWarehouseClientFromCredentials.mockReturnValueOnce({
                ...warehouseClientMock,
                getAdapterType: () => SupportedDbtAdapter.POSTGRES,
                runQuery: vi.fn().mockRejectedValue(error),
            });
            await expect(
                service.previewDataTimezone(previewAccount, {
                    mode: 'edit',
                    projectUuid: 'projectUuid',
                    warehouseType: WarehouseTypes.POSTGRES,
                    dataTimezone: credentials.dataTimezone ?? null,
                }),
            ).rejects.toBe(error);
            expect(
                vi.mocked(SshTunnel).mock.results.at(-1)?.value.disconnect,
            ).toHaveBeenCalledOnce();
        });

        it('rejects an edit preview when the warehouse type was switched but not saved', async () => {
            vi.spyOn(service, 'isTimezoneSupportEnabled').mockResolvedValueOnce(
                true,
            );
            (
                projectModel.getWithSensitiveFields as import('vitest').Mock
            ).mockResolvedValueOnce({
                ...projectWithSensitiveFields,
                warehouseConnection: {
                    type: WarehouseTypes.SNOWFLAKE,
                } as CreateWarehouseCredentials,
            });

            await expect(
                service.previewDataTimezone(previewAccount, {
                    mode: 'edit',
                    projectUuid: 'projectUuid',
                    warehouseType: WarehouseTypes.POSTGRES,
                    dataTimezone: 'America/New_York',
                }),
            ).rejects.toThrowError(ParameterError);
        });

        it('throws ForbiddenError when the user cannot update the project (edit flow)', async () => {
            vi.spyOn(service, 'isTimezoneSupportEnabled').mockResolvedValueOnce(
                true,
            );
            (
                projectModel.getWithSensitiveFields as import('vitest').Mock
            ).mockResolvedValueOnce({
                ...projectWithSensitiveFields,
                warehouseConnection: {
                    type: WarehouseTypes.POSTGRES,
                } as CreateWarehouseCredentials,
            });

            await expect(
                service.previewDataTimezone(noAccessAccount, {
                    mode: 'edit',
                    projectUuid: 'projectUuid',
                    warehouseType: WarehouseTypes.POSTGRES,
                    dataTimezone: 'America/New_York',
                }),
            ).rejects.toThrowError(ForbiddenError);
        });

        it('throws ForbiddenError when the user cannot create projects (create flow)', async () => {
            vi.spyOn(service, 'isTimezoneSupportEnabled').mockResolvedValueOnce(
                true,
            );

            await expect(
                service.previewDataTimezone(noAccessAccount, {
                    mode: 'create',
                    credentials,
                }),
            ).rejects.toThrowError(ForbiddenError);
        });
    });

    describe('getFileStream', () => {
        const getServiceWithDownloadFile = (downloadFile: DownloadFile) =>
            getMockedProjectService(lightdashConfigMock, {
                downloadFileModel: {
                    getDownloadFile: vi.fn(async () => downloadFile),
                } as unknown as DownloadFileModel,
            });

        it('returns a stream when the file belongs to the requested project', async () => {
            const serviceWithFile = getServiceWithDownloadFile({
                nanoid: 'file-id',
                path: __filename,
                createdAt: new Date(),
                type: DownloadFileType.JSONL,
                projectUuid: projectSummary.projectUuid,
            });

            const stream = await serviceWithFile.getFileStream(
                user,
                projectSummary.projectUuid,
                'file-id',
            );

            expect(stream).toBeInstanceOf(Readable);
        });

        it('throws NotFoundError when the file belongs to a different project', async () => {
            const serviceWithFile = getServiceWithDownloadFile({
                nanoid: 'file-id',
                path: '/tmp/file-id.jsonl',
                createdAt: new Date(),
                type: DownloadFileType.JSONL,
                projectUuid: 'another-project-uuid',
            });

            await expect(
                serviceWithFile.getFileStream(
                    user,
                    projectSummary.projectUuid,
                    'file-id',
                ),
            ).rejects.toThrowError(NotFoundError);
        });

        it('throws NotFoundError when the file has no owning project', async () => {
            const serviceWithFile = getServiceWithDownloadFile({
                nanoid: 'file-id',
                path: '/tmp/file-id.jsonl',
                createdAt: new Date(),
                type: DownloadFileType.JSONL,
                projectUuid: null,
            });

            await expect(
                serviceWithFile.getFileStream(
                    user,
                    projectSummary.projectUuid,
                    'file-id',
                ),
            ).rejects.toThrowError(NotFoundError);
        });
    });

    describe('validateConfigSecrets', () => {
        const projectWithSnowflakeAuth = (
            authenticationType: SnowflakeAuthenticationType,
            requireUserCredentials?: boolean,
        ): UpdateProject => ({
            name: 'test-project',
            dbtConnection: { type: DbtProjectType.NONE },
            dbtVersion: DefaultSupportedDbtVersion,
            warehouseConnection: {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'test-account',
                user: 'test-user',
                database: 'test-db',
                warehouse: 'test-warehouse',
                schema: 'test-schema',
                authenticationType,
                requireUserCredentials,
            },
        });

        it('rejects Snowflake OAuth authorization code authentication', () => {
            expect(() =>
                service.validateConfigSecrets(
                    projectWithSnowflakeAuth(
                        SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
                    ),
                ),
            ).toThrowError(ParameterError);
        });

        it('rejects Snowflake external browser authentication without user credentials', () => {
            expect(() =>
                service.validateConfigSecrets(
                    projectWithSnowflakeAuth(
                        SnowflakeAuthenticationType.EXTERNAL_BROWSER,
                    ),
                ),
            ).toThrowError(ParameterError);
        });

        it('allows Snowflake external browser authentication when user credentials are required', () => {
            expect(() =>
                service.validateConfigSecrets(
                    projectWithSnowflakeAuth(
                        SnowflakeAuthenticationType.EXTERNAL_BROWSER,
                        true,
                    ),
                ),
            ).not.toThrowError();
        });

        it.each([
            SnowflakeAuthenticationType.PASSWORD,
            SnowflakeAuthenticationType.PRIVATE_KEY,
            SnowflakeAuthenticationType.SSO,
            SnowflakeAuthenticationType.NONE,
        ])('allows Snowflake %s authentication', (authenticationType) => {
            expect(() =>
                service.validateConfigSecrets(
                    projectWithSnowflakeAuth(authenticationType),
                ),
            ).not.toThrowError();
        });

        const projectWithBigqueryKeyfile = (
            keyfileContents: { [key: string]: string },
            authenticationType?: BigqueryAuthenticationType,
        ): UpdateProject => ({
            name: 'test-project',
            dbtConnection: { type: DbtProjectType.NONE },
            dbtVersion: DefaultSupportedDbtVersion,
            warehouseConnection: {
                type: WarehouseTypes.BIGQUERY,
                project: 'test-gcp-project',
                dataset: 'test-dataset',
                timeoutSeconds: undefined,
                priority: undefined,
                retries: undefined,
                location: undefined,
                maximumBytesBilled: undefined,
                keyfileContents,
                authenticationType,
            },
        });

        const serviceAccountKeyfile = {
            type: 'service_account',
            client_email: 'sa@example.com',
            private_key: 'test-private-key',
        };
        // What the CLI sends for a dbt `method: oauth` gcloud user login
        const authorizedUserKeyfile = {
            type: 'authorized_user',
            client_id: 'oauth-client',
            client_secret: 'oauth-secret',
            refresh_token: 'user-refresh-token',
        };

        it.each([undefined, BigqueryAuthenticationType.PRIVATE_KEY])(
            'allows a service account keyfile with %s authentication type',
            (authenticationType) => {
                expect(() =>
                    service.validateConfigSecrets(
                        projectWithBigqueryKeyfile(
                            serviceAccountKeyfile,
                            authenticationType,
                        ),
                    ),
                ).not.toThrowError();
            },
        );

        it.each([undefined, BigqueryAuthenticationType.PRIVATE_KEY])(
            'allows an authorized_user keyfile with %s authentication type',
            (authenticationType) => {
                expect(() =>
                    service.validateConfigSecrets(
                        projectWithBigqueryKeyfile(
                            authorizedUserKeyfile,
                            authenticationType,
                        ),
                    ),
                ).not.toThrowError();
            },
        );

        it.each<{ [key: string]: string }>([
            {},
            { type: 'service_account', client_email: 'sa@example.com' },
            { type: 'authorized_user', client_id: 'oauth-client' },
            { refresh_token: 'user-refresh-token' },
        ])(
            'rejects a keyfile without a private key or user refresh token: %o',
            (keyfileContents) => {
                expect(() =>
                    service.validateConfigSecrets(
                        projectWithBigqueryKeyfile(keyfileContents),
                    ),
                ).toThrowError(
                    'Bigquery key file is required for private key authentication',
                );
            },
        );

        it('still requires a refresh token for SSO authentication', () => {
            expect(() =>
                service.validateConfigSecrets(
                    projectWithBigqueryKeyfile(
                        serviceAccountKeyfile,
                        BigqueryAuthenticationType.SSO,
                    ),
                ),
            ).toThrowError(
                'Bigquery refresh token is required for SSO authentication',
            );
        });

        it('allows a user credentials keyfile for SSO authentication', () => {
            expect(() =>
                service.validateConfigSecrets(
                    projectWithBigqueryKeyfile(
                        authorizedUserKeyfile,
                        BigqueryAuthenticationType.SSO,
                    ),
                ),
            ).not.toThrowError();
        });

        it.each([
            'external_account',
            'external_account_authorized_user',
            'impersonated_service_account',
        ])('rejects unsupported key file types: %s', (type) => {
            expect(() =>
                service.validateConfigSecrets(
                    projectWithBigqueryKeyfile({
                        ...serviceAccountKeyfile,
                        type,
                    }),
                ),
            ).toThrowError('BigQuery key file must be a service account key');
        });

        it('rejects an SSO keyfile that is not user credentials', () => {
            expect(() =>
                service.validateConfigSecrets(
                    projectWithBigqueryKeyfile(
                        {
                            ...authorizedUserKeyfile,
                            type: 'external_account_authorized_user',
                        },
                        BigqueryAuthenticationType.SSO,
                    ),
                ),
            ).toThrowError('BigQuery key file must be a service account key');
        });

        it('rejects a service account keyfile without a client email', () => {
            expect(() =>
                service.validateConfigSecrets(
                    projectWithBigqueryKeyfile({
                        type: 'service_account',
                        private_key: 'test-private-key',
                    }),
                ),
            ).toThrowError('BigQuery key file is missing "client_email"');
        });

        it('rejects unsupported key file types when a connection is written', () => {
            expect(() =>
                service.assertCanWriteWarehouseConnection(
                    developerAccount,
                    {
                        organizationUuid: 'organization-uuid',
                        provisioningSource: null,
                    },
                    {
                        warehouseConnection: projectWithBigqueryKeyfile({
                            ...serviceAccountKeyfile,
                            type: 'external_account',
                        }).warehouseConnection,
                    },
                ),
            ).toThrowError('BigQuery key file must be a service account key');
        });

        it('leaves empty key files to be filled from saved secrets when a connection is written', () => {
            expect(() =>
                service.assertCanWriteWarehouseConnection(
                    developerAccount,
                    {
                        organizationUuid: 'organization-uuid',
                        provisioningSource: null,
                    },
                    {
                        warehouseConnection: projectWithBigqueryKeyfile({})
                            .warehouseConnection,
                    },
                ),
            ).not.toThrowError();
        });

        it('rejects keyfiles with nested values', () => {
            expect(() =>
                service.validateConfigSecrets(
                    projectWithBigqueryKeyfile({
                        ...serviceAccountKeyfile,
                        credential_source: {
                            url: 'https://example.com',
                        },
                    } as unknown as { [key: string]: string }),
                ),
            ).toThrowError(ParameterError);
        });
    });

    describe('compileMergeQuery', () => {
        const source = (
            id: string,
            tableCalculations: MergeQuery['tableCalculations'] = [],
        ): MergeQueryMetricSource => ({
            id,
            metricQuery: {
                exploreName: validExplore.name,
                dimensions: ['a_dim1'],
                metrics: ['a_met1'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations,
            },
        });

        const mergeQuery = (
            overrides: Partial<MergeQuery> = {},
        ): MergeQuery => ({
            sources: [source('a'), source('b')],
            joinKey: [
                {
                    name: 'dim1',
                    fieldIdBySourceId: { a: 'a_dim1', b: 'a_dim1' },
                },
            ],
            joinType: MergeJoinType.FULL,
            tableCalculations: [],
            limit: 500,
            ...overrides,
        });

        test('refuses a source calculation that depends on its own row set', async () => {
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery({
                    sources: [
                        source('a', [
                            {
                                name: 'running_total',
                                displayName: 'Running total',
                                sql: 'SUM(${a.met1}) OVER (ORDER BY ${a.dim1})',
                            },
                        ]),
                        source('b'),
                    ],
                }),
            });

            expect(result.sql).toBeNull();
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    kind: MergeQueryErrorKind.UNSUPPORTED_TABLE_CALCULATION,
                    sourceId: 'a',
                    fieldIds: ['running_total'],
                }),
            );
        });

        test('refuses a merge calculation referencing a column the merged result does not have', async () => {
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery({
                    tableCalculations: [
                        {
                            name: 'ghost',
                            displayName: 'Ghost',
                            sql: '${a.a_met1} + ${b.ghost_metric}',
                        },
                    ],
                }),
            });

            expect(result.sql).toBeNull();
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    kind: MergeQueryErrorKind.UNRESOLVED_CALCULATION_REFERENCE,
                    fieldIds: ['b.ghost_metric'],
                }),
            );
        });

        test('compiles a formula over fields from both sources after the join', async () => {
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery({
                    tableCalculations: [
                        {
                            name: 'cross_source_ratio',
                            displayName: 'Cross-source ratio',
                            sql: '',
                            formula: '=a_a_met1 / b_a_met1',
                        },
                    ],
                }),
            });

            expect(result.errors).toEqual([]);
            expect(result.coreSql).toContain(
                '("c0_0" / NULLIF("c1_0", 0)) AS "cross_source_ratio"',
            );
        });

        test('refuses an oversized merge formula before parsing it', async () => {
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery({
                    tableCalculations: [
                        {
                            name: 'too_large',
                            displayName: 'Too large',
                            sql: '',
                            formula: `=${'1'.repeat(
                                MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH,
                            )}`,
                        },
                    ],
                }),
            });

            expect(result.sql).toBeNull();
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    kind: MergeQueryErrorKind.CALCULATION_FORMULA_TOO_LONG,
                    fieldIds: ['too_large'],
                }),
            );
        });

        test('refuses a merge formula referencing a field outside the merged result', async () => {
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery({
                    tableCalculations: [
                        {
                            name: 'ghost',
                            displayName: 'Ghost',
                            sql: '',
                            formula: '=a_a_met1 / b_ghost_metric',
                        },
                    ],
                }),
            });

            expect(result.sql).toBeNull();
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    kind: MergeQueryErrorKind.UNRESOLVED_CALCULATION_REFERENCE,
                    fieldIds: ['b_ghost_metric'],
                }),
            );
        });

        // Sorts name merged fields: a second-source value column and the join
        // key column here. A sort the Explorer left behind on a primary field
        // id is not a merged field and is dropped, never refused.
        test('orders the merged result by merged fields and drops sorts it cannot honour', async () => {
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery({
                    sorts: [
                        { fieldId: 'b_a_met1', descending: true },
                        { fieldId: 'merge_dim1', descending: false },
                        { fieldId: 'a_met1', descending: true },
                    ],
                }),
            });

            expect(result.errors).toEqual([]);
            // The mocked project is Postgres, where nulls sort as the largest
            // value: first on DESC, last on ASC. Stated on the compose engine.
            expect(result.sorts).toEqual([
                { fieldId: 'b_a_met1', descending: true, nullsFirst: true },
                { fieldId: 'merge_dim1', descending: false, nullsFirst: false },
            ]);
            expect(result.terminalWrapper?.orderBy).toEqual([
                '"b_a_met1" DESC NULLS FIRST',
                '"merge_dim1" NULLS LAST',
            ]);
            expect(result.sql).toContain(
                'ORDER BY "b_a_met1" DESC NULLS FIRST, "merge_dim1" NULLS LAST',
            );
        });

        test('keeps a null placement the sort states over the warehouse default', async () => {
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery({
                    sorts: [
                        {
                            fieldId: 'b_a_met1',
                            descending: true,
                            nullsFirst: false,
                        },
                    ],
                }),
            });

            expect(result.terminalWrapper?.orderBy).toEqual([
                '"b_a_met1" DESC NULLS LAST',
            ]);
        });

        test('orders by the join key when the merge carries no sort', async () => {
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery(),
            });

            expect(result.terminalWrapper?.orderBy).toEqual(['"merge_dim1"']);
        });

        // The key is a dimension of the explore, so the leg groups by it and
        // the join has its column; the merged result shows it once, as the key.
        test('groups a leg by a join key dimension its query does not select', async () => {
            const unselected = source('b');
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery({
                    sources: [
                        source('a'),
                        {
                            ...unselected,
                            metricQuery: {
                                ...unselected.metricQuery,
                                dimensions: [],
                            },
                        },
                    ],
                }),
            });

            expect(result.errors).toEqual([]);
            expect(result.legs[1].sql).toContain('AS `a_dim1`');
            expect(result.legs[1].sql).toContain('GROUP BY');
            // The leg the run submits is the widened query, not the request
            expect(result.legs[1].metricQuery?.dimensions).toEqual(['a_dim1']);
            expect(result.legs[0].metricQuery?.dimensions).toEqual(['a_dim1']);
            expect(result.fields.map((field) => field.sourceFieldId)).toEqual([
                null,
                'a_met1',
                'a_met1',
            ]);
        });

        test('keeps a dimension the other source repeats across as a value column', async () => {
            const dim2 = {
                ...validExplore.tables.a.dimensions.dim1,
                name: 'dim2',
                label: 'dim2',
            };
            const getExplore = vi
                .spyOn(service, 'getExplore')
                .mockResolvedValue({
                    ...validExplore,
                    tables: {
                        ...validExplore.tables,
                        a: {
                            ...validExplore.tables.a,
                            dimensions: {
                                ...validExplore.tables.a.dimensions,
                                dim2,
                            },
                        },
                    },
                });
            const split = source('a');
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery({
                    sources: [
                        {
                            ...split,
                            metricQuery: {
                                ...split.metricQuery,
                                dimensions: ['a_dim1', 'a_dim2'],
                            },
                        },
                        { ...source('b'), repeatValues: true },
                    ],
                }),
            });
            getExplore.mockRestore();

            expect(result.errors).toEqual([]);
            expect(
                result.fields.map((field) => [field.sourceFieldId, field.kind]),
            ).toEqual([
                [null, 'dimension'],
                ['a_dim2', 'dimension'],
                ['a_met1', 'metric'],
                ['a_met1', 'metric'],
            ]);
            expect(result.legs[0].sql).toContain('AS `a_dim2`');
        });

        test('refuses a join key the source explore has no dimension for', async () => {
            const result = await service.compileMergeQuery({
                account: sessionAccount,
                projectUuid,
                mergeQuery: mergeQuery({
                    joinKey: [
                        {
                            name: 'dim1',
                            fieldIdBySourceId: { a: 'a_dim1', b: 'a_ghost' },
                        },
                    ],
                }),
            });

            expect(result.sql).toBeNull();
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    kind: MergeQueryErrorKind.JOIN_KEY_NOT_SELECTED,
                    sourceId: 'b',
                    fieldIds: ['a_ghost'],
                }),
            );
        });

        describe('merge calculation SQL authorization', () => {
            const withAbility = (
                rules: ConstructorParameters<
                    typeof Ability<PossibleAbilities>
                >[0],
            ) =>
                ({
                    ...sessionAccount,
                    user: {
                        ...sessionAccount.user,
                        ability: new Ability<PossibleAbilities>(rules),
                    },
                }) as typeof sessionAccount;
            const viewer = withAbility([
                { subject: 'Project', action: 'view' },
                { subject: 'Explore', action: 'view' },
                { subject: 'Space', action: 'view' },
            ]);
            const author = withAbility([
                { subject: 'Project', action: 'view' },
                { subject: 'Explore', action: 'view' },
                { subject: 'Space', action: 'view' },
                { subject: 'CustomSqlTableCalculations', action: 'manage' },
            ]);
            const subqueryCalculation = {
                name: 'leak',
                displayName: 'Leak',
                sql: '${a.a_met1} + (SELECT count(*) FROM information_schema.tables)',
            };

            test('refuses a viewer merge calculation with the custom SQL gate error', async () => {
                await expect(
                    service.compileMergeQuery({
                        account: viewer,
                        projectUuid,
                        mergeQuery: mergeQuery({
                            tableCalculations: [subqueryCalculation],
                        }),
                    }),
                ).rejects.toThrow(ForbiddenError);
            });

            test('compiles the same calculation for an account allowed to author custom SQL', async () => {
                const result = await service.compileMergeQuery({
                    account: author,
                    projectUuid,
                    mergeQuery: mergeQuery({
                        tableCalculations: [subqueryCalculation],
                    }),
                });

                expect(result.errors).toEqual([]);
                expect(result.sql).toContain('information_schema.tables');
            });

            test('a viewer merge without calculations still compiles', async () => {
                const result = await service.compileMergeQuery({
                    account: viewer,
                    projectUuid,
                    mergeQuery: mergeQuery(),
                });

                expect(result.errors).toEqual([]);
                expect(result.sql).not.toBeNull();
            });

            test('gates only the merge-level calculations; source calculations are gated by their own compile', async () => {
                const gate = vi.spyOn(
                    service as unknown as {
                        assertCustomSqlAuthorizedForQuery: (args: {
                            metricQuery: {
                                tableCalculations: { name: string }[];
                            };
                        }) => Promise<void>;
                    },
                    'assertCustomSqlAuthorizedForQuery',
                );
                const sourceCalculation = {
                    name: 'ratio',
                    displayName: 'Ratio',
                    sql: '${a.met1} * 2',
                };

                await service.compileMergeQuery({
                    account: author,
                    projectUuid,
                    mergeQuery: mergeQuery({
                        sources: [
                            source('a', [sourceCalculation]),
                            source('b'),
                        ],
                        tableCalculations: [subqueryCalculation],
                    }),
                });

                const gatedCalculations = gate.mock.calls.map(([args]) =>
                    args.metricQuery.tableCalculations.map((tc) => tc.name),
                );
                expect(gatedCalculations).toContainEqual(['leak']);
                expect(gatedCalculations).toContainEqual(['ratio']);
                expect(gatedCalculations).not.toContainEqual(['ratio', 'leak']);
                expect(gatedCalculations).not.toContainEqual(['leak', 'ratio']);
                gate.mockRestore();
            });
        });
    });
});

describe('QueryComposer reserved parameters', () => {
    it('resolves date_zoom to the else branch when no date zoom is applied', async () => {
        const compiled = new QueryComposer(
            { metricQuery: metricQueryReservedParameterDimension },
            {
                explore: exploreWithReservedParameterDimension,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: {},
                userAttributes: {},
                timezone: 'UTC',
                parameters: {},
                availableParameterDefinitions: {},
            },
        ).compile();

        expect(compiled.query).toContain("'other'");
        expect(compiled.query).not.toContain("'weekly'");
        expect(compiled.query).not.toContain('ld.parameters.date_zoom');
        expect(compiled.query).not.toContain('{% if');
    });

    it('lets a user parameter named date_zoom win over the reserved value', async () => {
        // With no date zoom the reserved value is ''; a user date_zoom of 'week' must win.
        const compiled = new QueryComposer(
            { metricQuery: metricQueryReservedParameterDimension },
            {
                explore: exploreWithReservedParameterDimension,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: {},
                userAttributes: {},
                timezone: 'UTC',
                parameters: { date_zoom: 'week' },
                availableParameterDefinitions: {
                    date_zoom: { label: 'My date zoom' },
                },
            },
        ).compile();

        expect(compiled.query).toContain("'weekly'");
        expect(compiled.query).not.toContain("'other'");
        expect(compiled.query).not.toContain('ld.parameters.date_zoom');
    });
});

type ResolveCompileAdapterArgs = {
    projectUuid: string;
    organizationUuid: string | undefined;
    userUuid: string;
    primary: {
        adapter: ProjectAdapter;
        connection: ScopedWarehouseConnection;
        warehouseCredentials: CreateWarehouseCredentials;
        cachedWarehouse: { warehouseCatalog: {}; warehouseTables: {} };
        dbtVersionOption: DbtVersionOptionLatest;
        dbtPartialParse: boolean;
    };
    manifestFetchAdapters: ProjectAdapter[];
};

type BuildMergedManifestAdapterArgs = {
    projectUuid: string;
    organizationUuid: string | undefined;
    primary: ResolveCompileAdapterArgs['primary'];
    sources: ProjectDbtSource[];
    manifestFetchAdapters: ProjectAdapter[];
};

type ResolvedCompileAdapter = {
    adapter: ProjectAdapter;
    stagedMergedManifest?: Buffer;
};

// resolveCompileAdapter/buildMergedManifestAdapter/featureFlagModel/
// projectDbtSourcesModel are private members; this narrow view exposes only
// what these tests need to call/override, avoiding `any`.
type ProjectServiceInternals = {
    featureFlagModel: { get: (args: unknown) => Promise<unknown> };
    projectDbtSourcesModel: { getSources: (projectUuid: string) => unknown };
    resolveCompileAdapter: (
        args: ResolveCompileAdapterArgs,
    ) => Promise<ResolvedCompileAdapter>;
    buildMergedManifestAdapter: (
        args: BuildMergedManifestAdapterArgs,
    ) => Promise<ResolvedCompileAdapter>;
    stageMergedManifest: (
        projectUuid: string,
        manifest: DbtManifest,
    ) => Promise<Buffer | undefined>;
    buildSourceAdapter: (...args: unknown[]) => Promise<ProjectAdapter>;
    logger: {
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
    };
};

const NO_FETCH_TIMINGS: DbtManifestFetchTimings = {
    gitRefreshMs: null,
    depsMs: null,
    manifestMs: 0,
};

describe('ProjectService.resolveCompileAdapter (MultiDbtSources regression firewall)', () => {
    beforeEach(() => {
        projectModel.deleteMergedManifest
            .mockReset()
            .mockResolvedValue(undefined);
        projectModel.upsertMergedManifest
            .mockReset()
            .mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const primaryAdapter = {
        id: 'primary-adapter',
    } as unknown as ProjectAdapter;
    const primary = {
        adapter: primaryAdapter,
        connection: {
            warehouseClient: warehouseClientMock,
            connectionCredentials: warehouseClientMock.credentials,
            warehouseCredentials: warehouseClientMock.credentials,
            aiPlan: null,
            warehouseConnectionUuid: null,
            connectionRoute: null,
            credentialKind: WarehouseCredentialKind.COMPILE,
            tunnelConnectMs: null,
            deriveClient: (credentials: CreateWarehouseCredentials) =>
                warehouseClientFromCredentials(credentials, undefined),
        } satisfies ScopedWarehouseConnection,
        warehouseCredentials: warehouseClientMock.credentials,
        cachedWarehouse: { warehouseCatalog: {}, warehouseTables: {} },
        dbtVersionOption: DbtVersionOptionLatest.LATEST,
        dbtPartialParse: false,
    };
    const baseArgs: ResolveCompileAdapterArgs = {
        projectUuid: 'project-uuid',
        organizationUuid: 'org-uuid',
        userUuid: 'user-uuid',
        primary,
        manifestFetchAdapters: [],
    };

    const buildServiceWithMocks = (
        flagEnabled: boolean,
        sources: unknown[],
    ) => {
        const getSources = vi.fn(async () => sources);
        const projectService = getMockedProjectService(
            lightdashConfigMock,
        ) as unknown as ProjectServiceInternals;
        // featureFlagModel and projectDbtSourcesModel are private fields set in
        // the constructor; override them post-construction for this test only.
        projectService.featureFlagModel = {
            get: vi.fn(async (args: unknown) => {
                const { featureFlagId } = args as { featureFlagId: string };
                return {
                    id: featureFlagId,
                    enabled:
                        featureFlagId === FeatureFlags.MultiDbtSources
                            ? flagEnabled
                            : false,
                };
            }),
        };
        projectService.projectDbtSourcesModel = { getSources };
        return { projectService, getSources };
    };

    const buildManifest = (
        models: Array<{
            uniqueId: string;
            name: string;
            packageName: string;
            compiled?: boolean;
            materialized?: string;
        }>,
    ): DbtManifest => {
        const seedPackageName = models[0]?.packageName ?? 'fixtures';
        return {
            nodes: Object.fromEntries([
                ...models.map((model) => {
                    const {
                        uniqueId,
                        name,
                        packageName,
                        materialized = 'table',
                    } = model;
                    return [
                        uniqueId,
                        {
                            unique_id: uniqueId,
                            name,
                            package_name: packageName,
                            resource_type: 'model',
                            ...('compiled' in model
                                ? { compiled: model.compiled }
                                : { compiled: true }),
                            database: 'analytics',
                            schema: 'public',
                            alias: name,
                            checksum: { name: '', checksum: '' },
                            fqn: [packageName, name],
                            language: 'sql',
                            path: `models/${name}.sql`,
                            raw_code: `select * from ${name}`,
                            description: '',
                            tags: [],
                            depends_on: { nodes: [] },
                            patch_path: null,
                            original_file_path: `models/${name}.sql`,
                            relation_name: `analytics.public.${name}`,
                            config: {
                                materialized,
                                snowflake_warehouse: '',
                            },
                            meta: {},
                            columns: {
                                id: {
                                    name: 'id',
                                    data_type: DimensionType.NUMBER,
                                    meta: {},
                                },
                            },
                        },
                    ];
                }),
                [
                    `seed.${seedPackageName}.country_codes`,
                    {
                        unique_id: `seed.${seedPackageName}.country_codes`,
                        name: `country_codes_${seedPackageName}`,
                        package_name: seedPackageName,
                        resource_type: 'seed',
                        compiled: true,
                        database: 'analytics',
                        schema: 'public',
                        config: {
                            materialized: 'seed',
                            snowflake_warehouse: '',
                        },
                        meta: {},
                        columns: {},
                    },
                ],
            ]),
            metadata: {
                dbt_schema_version:
                    'https://schemas.getdbt.com/dbt/manifest/v11.json',
                generated_at: '2026-08-16T00:00:00.000Z',
                adapter_type: 'postgres',
            },
            metrics: {},
            docs: {},
        };
    };

    const buildAdapterWithManifest = (
        manifest: DbtManifest,
        selectedModelIds?: string[],
        timings: DbtManifestFetchTimings = NO_FETCH_TIMINGS,
    ) =>
        ({
            getDbtManifest: vi.fn(async () => ({
                manifest,
                ...(selectedModelIds ? { selectedModelIds } : {}),
                timings,
            })),
        }) as unknown as ProjectAdapter;

    const buildSource = (
        name: string,
        warehouseLocation: WarehouseLocation = EMPTY_WAREHOUSE_LOCATION,
    ): ProjectDbtSource => ({
        projectDbtSourceUuid: `${name}-uuid`,
        projectUuid: 'project-uuid',
        name,
        isPrimary: false,
        precedence: 1,
        dbtConnection: { type: DbtProjectType.NONE },
        warehouseLocation,
        hasCredentialError: false,
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
        updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    });

    const buildMergedAdapterWithService = (
        primaryManifest: DbtManifest,
        sourceManifest: DbtManifest,
        selectedModelIds: {
            primary?: string[];
            source?: string[];
        } = {},
    ) => {
        const projectService = getMockedProjectService(
            lightdashConfigMock,
        ) as unknown as ProjectServiceInternals;
        vi.spyOn(projectService, 'buildSourceAdapter').mockResolvedValue(
            buildAdapterWithManifest(sourceManifest, selectedModelIds.source),
        );

        const adapter = projectService.buildMergedManifestAdapter({
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            primary: {
                ...primary,
                adapter: buildAdapterWithManifest(
                    primaryManifest,
                    selectedModelIds.primary,
                ),
            },
            sources: [buildSource('source-b')],
            manifestFetchAdapters: [],
        });
        return { projectService, adapter };
    };

    const buildMergedAdapter = async (
        primaryManifest: DbtManifest,
        sourceManifest: DbtManifest,
        selectedModelIds: {
            primary?: string[];
            source?: string[];
        } = {},
    ) => {
        const { adapter } = buildMergedAdapterWithService(
            primaryManifest,
            sourceManifest,
            selectedModelIds,
        );
        return (await adapter).adapter;
    };

    it('returns the deduplicated union when both sources select models', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
            },
        ]);

        const adapter = await buildMergedAdapter(
            primaryManifest,
            sourceManifest,
            {
                primary: ['model.pkg_a.orders', 'model.pkg_a.orders'],
                source: ['model.pkg_b.customers', 'model.pkg_b.customers'],
            },
        );

        await expect(adapter.getDbtManifest()).resolves.toMatchObject({
            selectedModelIds: ['model.pkg_a.orders', 'model.pkg_b.customers'],
        });
    });

    it('omits selected model ids when neither source has a selector', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
            },
        ]);

        const adapter = await buildMergedAdapter(
            primaryManifest,
            sourceManifest,
        );
        const result = await adapter.getDbtManifest();

        expect(result).not.toHaveProperty('selectedModelIds');
    });

    it('passes the staged merged manifest to the adapter by reference', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
            },
        ]);
        const { projectService, adapter: adapterPromise } =
            buildMergedAdapterWithService(primaryManifest, sourceManifest);
        const stageManifest = vi.spyOn(projectService, 'stageMergedManifest');

        const { adapter } = await adapterPromise;
        const result = await adapter.getDbtManifest();

        expect(stageManifest).toHaveBeenCalledOnce();
        expect(result.manifest).toBe(stageManifest.mock.calls[0][1]);
    });

    it.each([
        { dbtPartialParse: true, expected: 'source baseline' },
        { dbtPartialParse: false, expected: null },
    ])(
        'passes each additional source its own partial parse baseline when enabled is $dbtPartialParse',
        async ({ dbtPartialParse, expected }) => {
            const projectService = getMockedProjectService(
                lightdashConfigMock,
            ) as unknown as ProjectServiceInternals;
            const buildSourceAdapter = vi
                .spyOn(projectService, 'buildSourceAdapter')
                .mockResolvedValue(
                    buildAdapterWithManifest(
                        buildManifest([
                            {
                                uniqueId: 'model.pkg_b.customers',
                                name: 'customers',
                                packageName: 'pkg_b',
                            },
                        ]),
                    ),
                );

            await projectService.buildMergedManifestAdapter({
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
                primary: {
                    ...primary,
                    dbtPartialParse,
                    adapter: buildAdapterWithManifest(
                        buildManifest([
                            {
                                uniqueId: 'model.pkg_a.orders',
                                name: 'orders',
                                packageName: 'pkg_a',
                            },
                        ]),
                    ),
                },
                sources: [buildSource('source-b')],
                manifestFetchAdapters: [],
            });

            expect(buildSourceAdapter).toHaveBeenCalledOnce();
            expect(buildSourceAdapter.mock.calls[0][4]).toBe(
                expected === null
                    ? null
                    : getDbtPartialParseBaselinePath({
                          projectUuid: 'project-uuid',
                          dbtSourceUuid: 'source-b-uuid',
                      }),
            );
        },
    );

    describe('primary source fetch', () => {
        const primaryManifest = () =>
            buildManifest([
                {
                    uniqueId: 'model.pkg_a.orders',
                    name: 'orders',
                    packageName: 'pkg_a',
                },
            ]);
        const sourceManifest = () =>
            buildManifest([
                {
                    uniqueId: 'model.pkg_b.customers',
                    name: 'customers',
                    packageName: 'pkg_b',
                },
            ]);

        const buildRecordingAdapter = (
            name: string,
            manifest: DbtManifest,
            events: string[],
            waitFor: Promise<void> = Promise.resolve(),
        ) =>
            ({
                getDbtManifest: vi.fn(async () => {
                    events.push(`${name} started`);
                    await waitFor;
                    events.push(`${name} finished`);
                    return { manifest, timings: NO_FETCH_TIMINGS };
                }),
            }) as unknown as ProjectAdapter;

        const buildService = (sourceFetchConcurrency: number | undefined) =>
            getMockedProjectService({
                ...lightdashConfigMock,
                dbt: { ...lightdashConfigMock.dbt, sourceFetchConcurrency },
            }) as unknown as ProjectServiceInternals;

        it('fetches the primary at the same time as the additional sources', async () => {
            const events: string[] = [];
            let sourceStarted: () => void = () => {};
            const sourceHasStarted = new Promise<void>((resolve) => {
                sourceStarted = resolve;
            });
            const projectService = buildService(2);
            vi.spyOn(projectService, 'buildSourceAdapter').mockImplementation(
                async () =>
                    ({
                        getDbtManifest: vi.fn(async () => {
                            events.push('source-b started');
                            sourceStarted();
                            events.push('source-b finished');
                            return {
                                manifest: sourceManifest(),
                                timings: NO_FETCH_TIMINGS,
                            };
                        }),
                    }) as unknown as ProjectAdapter,
            );

            const { adapter } = await projectService.buildMergedManifestAdapter(
                {
                    projectUuid: 'project-uuid',
                    organizationUuid: 'org-uuid',
                    primary: {
                        ...primary,
                        adapter: buildRecordingAdapter(
                            'primary',
                            primaryManifest(),
                            events,
                            sourceHasStarted,
                        ),
                    },
                    sources: [buildSource('source-b')],
                    manifestFetchAdapters: [],
                },
            );

            expect(events).toEqual([
                'primary started',
                'source-b started',
                'source-b finished',
                'primary finished',
            ]);
            const { manifest } = await adapter.getDbtManifest();
            expect(Object.keys(manifest.nodes)).toEqual(
                expect.arrayContaining([
                    'model.pkg_a.orders',
                    'model.pkg_b.customers',
                ]),
            );
        });

        it('starts the primary first when only one fetch may run at a time', async () => {
            const events: string[] = [];
            const projectService = buildService(1);
            vi.spyOn(projectService, 'buildSourceAdapter').mockResolvedValue(
                buildRecordingAdapter('source-b', sourceManifest(), events),
            );

            await projectService.buildMergedManifestAdapter({
                projectUuid: 'project-uuid',
                organizationUuid: 'org-uuid',
                primary: {
                    ...primary,
                    adapter: buildRecordingAdapter(
                        'primary',
                        primaryManifest(),
                        events,
                    ),
                },
                sources: [buildSource('source-b')],
                manifestFetchAdapters: [],
            });

            expect(events).toEqual([
                'primary started',
                'primary finished',
                'source-b started',
                'source-b finished',
            ]);
        });

        it('fails on a source with broken credentials before fetching anything', async () => {
            const events: string[] = [];
            const projectService = buildService(2);
            const buildSourceAdapter = vi.spyOn(
                projectService,
                'buildSourceAdapter',
            );

            await expect(
                projectService.buildMergedManifestAdapter({
                    projectUuid: 'project-uuid',
                    organizationUuid: 'org-uuid',
                    primary: {
                        ...primary,
                        adapter: buildRecordingAdapter(
                            'primary',
                            primaryManifest(),
                            events,
                        ),
                    },
                    sources: [
                        {
                            ...buildSource('source-b'),
                            hasCredentialError: true,
                        },
                    ],
                    manifestFetchAdapters: [],
                }),
            ).rejects.toThrow(
                'Failed to load dbt source "source-b": its connection credentials could not be decrypted',
            );
            expect(events).toEqual([]);
            expect(buildSourceAdapter).not.toHaveBeenCalled();
        });

        it('fails the merge with the primary error when the primary fetch fails', async () => {
            const projectService = buildService(2);
            vi.spyOn(projectService, 'buildSourceAdapter').mockResolvedValue(
                buildAdapterWithManifest(sourceManifest()),
            );
            const manifestFetchAdapters: ProjectAdapter[] = [];
            const failingPrimaryAdapter = {
                getDbtManifest: vi.fn(async () => {
                    throw new Error('dbt ls failed in the primary');
                }),
            } as unknown as ProjectAdapter;

            await expect(
                projectService.buildMergedManifestAdapter({
                    projectUuid: 'project-uuid',
                    organizationUuid: 'org-uuid',
                    primary: { ...primary, adapter: failingPrimaryAdapter },
                    sources: [buildSource('source-b')],
                    manifestFetchAdapters,
                }),
            ).rejects.toThrow('dbt ls failed in the primary');
            expect(manifestFetchAdapters).toContain(failingPrimaryAdapter);
        });
    });

    it('logs the git, dependency and manifest time of the primary and each source', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
            },
        ]);
        const projectService = getMockedProjectService(
            lightdashConfigMock,
        ) as unknown as ProjectServiceInternals;
        const info = vi.spyOn(projectService.logger, 'info');
        vi.spyOn(projectService, 'buildSourceAdapter').mockResolvedValue(
            buildAdapterWithManifest(sourceManifest, undefined, {
                gitRefreshMs: 4100,
                depsMs: 2300,
                manifestMs: 15300,
            }),
        );

        await projectService.buildMergedManifestAdapter({
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            primary: {
                ...primary,
                adapter: buildAdapterWithManifest(primaryManifest, undefined, {
                    gitRefreshMs: 12500,
                    depsMs: null,
                    manifestMs: 1200,
                }),
            },
            sources: [buildSource('source-b')],
            manifestFetchAdapters: [],
        });

        expect(info).toHaveBeenCalledWith(
            expect.stringMatching(
                /^dbt\.compile\.primarySourceFetched projectUuid=project-uuid sourceName=dbt_project durationMs=\d+ models=1 gitRefreshMs=12500 depsMs=none manifestMs=1200$/,
            ),
            expect.objectContaining({
                event: 'dbt.compile.primarySourceFetched',
                sourceName: 'dbt_project',
                modelCount: 1,
                gitRefreshMs: 12500,
                depsMs: null,
                manifestMs: 1200,
            }),
        );
        expect(info).toHaveBeenCalledWith(
            expect.stringMatching(
                /^dbt\.compile\.sourceFetched projectUuid=project-uuid sourceName=source-b durationMs=\d+ models=1 gitRefreshMs=4100 depsMs=2300 manifestMs=15300$/,
            ),
            expect.objectContaining({
                event: 'dbt.compile.sourceFetched',
                sourceName: 'source-b',
                modelCount: 1,
                gitRefreshMs: 4100,
                depsMs: 2300,
                manifestMs: 15300,
            }),
        );
    });

    it('preserves an empty selection when every selector matches nothing', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
            },
        ]);

        const adapter = await buildMergedAdapter(
            primaryManifest,
            sourceManifest,
            { primary: [], source: [] },
        );
        const result = await adapter.getDbtManifest();

        expect(result).toHaveProperty('selectedModelIds', []);
    });

    it('includes every model from the selector-less source', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
            {
                uniqueId: 'model.pkg_a.payments',
                name: 'payments',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
            },
            {
                uniqueId: 'model.pkg_b.products',
                name: 'products',
                packageName: 'pkg_b',
            },
        ]);

        const primarySelectedAdapter = await buildMergedAdapter(
            primaryManifest,
            sourceManifest,
            { primary: ['model.pkg_a.orders'] },
        );
        const sourceSelectedAdapter = await buildMergedAdapter(
            primaryManifest,
            sourceManifest,
            { source: ['model.pkg_b.customers'] },
        );

        await expect(
            primarySelectedAdapter.getDbtManifest(),
        ).resolves.toMatchObject({
            selectedModelIds: [
                'model.pkg_a.orders',
                'model.pkg_b.customers',
                'model.pkg_b.products',
            ],
        });
        await expect(
            sourceSelectedAdapter.getDbtManifest(),
        ).resolves.toMatchObject({
            selectedModelIds: [
                'model.pkg_a.orders',
                'model.pkg_a.payments',
                'model.pkg_b.customers',
            ],
        });
    });

    it('keeps unselected models in the merged manifest', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
            {
                uniqueId: 'model.pkg_a.staging_orders',
                name: 'staging_orders',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
            },
        ]);

        const adapter = await buildMergedAdapter(
            primaryManifest,
            sourceManifest,
            { primary: ['model.pkg_a.orders'] },
        );
        const result = await adapter.getDbtManifest();

        expect(result.manifest.nodes).toHaveProperty(
            'model.pkg_a.staging_orders',
        );
        expect(result.selectedModelIds).not.toContain(
            'model.pkg_a.staging_orders',
        );
    });

    it('deploys cross-source bare model name collisions as qualified explores', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.orders',
                name: 'orders',
                packageName: 'pkg_b',
            },
            {
                uniqueId: 'model.pkg_b.orders_with_custom_dims',
                name: 'orders_with_custom_dims',
                packageName: 'pkg_b',
            },
        ]);

        const adapter = await buildMergedAdapter(
            primaryManifest,
            sourceManifest,
        );
        const { manifest } = await adapter.getDbtManifest();
        const [validModels, validationErrors] =
            DbtBaseProjectAdapter._validateDbtModel(
                SupportedDbtAdapter.POSTGRES,
                getModelsFromManifest(manifest),
                getDbtManifestVersion(manifest),
            );
        expect(validationErrors).toEqual([]);
        const explores = await convertExplores(
            validModels,
            false,
            SupportedDbtAdapter.POSTGRES,
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );

        expect(explores.map(({ name }) => name).sort()).toEqual([
            'dbt_project__orders',
            'orders_with_custom_dims',
            'source-b__orders',
        ]);
    });

    it('still rejects the same model unique_id from two sources', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.customers',
                name: 'customers',
                packageName: 'pkg_a',
            },
            {
                uniqueId: 'model.shared.orders',
                name: 'orders',
                packageName: 'shared',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.payments',
                name: 'payments',
                packageName: 'pkg_b',
            },
            {
                uniqueId: 'model.shared.orders',
                name: 'orders',
                packageName: 'shared',
            },
        ]);

        await expect(
            buildMergedAdapter(primaryManifest, sourceManifest),
        ).rejects.toThrow(
            'The dbt sources "dbt_project" and "source-b" use the same dbt project name "shared". Change the name: value in one repository\'s dbt_project.yml and deploy again. Model "model.shared.orders" is defined in both "dbt_project" and "source-b".',
        );
    });

    it('identifies a shared dbt project name when models and seeds collide', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.shared.orders',
                name: 'orders',
                packageName: 'shared',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.shared.orders',
                name: 'orders',
                packageName: 'shared',
            },
        ]);

        await expect(
            buildMergedAdapter(primaryManifest, sourceManifest),
        ).rejects.toThrow(
            'The dbt sources "dbt_project" and "source-b" use the same dbt project name "shared". Change the name: value in one repository\'s dbt_project.yml and deploy again.',
        );
    });

    it('allows duplicate bare model names from different packages within one source', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
            {
                uniqueId: 'model.pkg_b.orders',
                name: 'orders',
                packageName: 'pkg_b',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_c.customers',
                name: 'customers',
                packageName: 'pkg_c',
            },
        ]);

        await expect(
            buildMergedAdapter(primaryManifest, sourceManifest),
        ).resolves.toBeDefined();
    });

    it('allows multiple sources with distinct bare model names', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
            },
        ]);

        await expect(
            buildMergedAdapter(primaryManifest, sourceManifest),
        ).resolves.toBeDefined();
    });

    it('compiles a source with its own warehouse location', async () => {
        const projectService = getMockedProjectService(
            lightdashConfigMock,
        ) as unknown as ProjectServiceInternals;
        const buildSourceAdapter = vi
            .spyOn(projectService, 'buildSourceAdapter')
            .mockResolvedValue(
                buildAdapterWithManifest(
                    buildManifest([
                        {
                            uniqueId: 'model.pkg_b.customers',
                            name: 'customers',
                            packageName: 'pkg_b',
                        },
                    ]),
                ),
            );
        const warehouseLocation: WarehouseLocation = {
            database: 'source-database',
            schema: 'source_schema',
        };

        await projectService.buildMergedManifestAdapter({
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            primary: {
                ...primary,
                adapter: buildAdapterWithManifest(
                    buildManifest([
                        {
                            uniqueId: 'model.pkg_a.orders',
                            name: 'orders',
                            packageName: 'pkg_a',
                        },
                    ]),
                ),
            },
            sources: [buildSource('source-b', warehouseLocation)],
            manifestFetchAdapters: [],
        });

        expect(buildSourceAdapter).toHaveBeenCalledWith(
            { type: DbtProjectType.NONE },
            warehouseLocation,
            'org-uuid',
            expect.objectContaining({
                warehouseCredentials: primary.warehouseCredentials,
            }),
            null,
        );
    });

    it("builds the source's adapter with the source's location applied to the project credentials", async () => {
        const projectService = getMockedProjectService(
            lightdashConfigMock,
        ) as unknown as ProjectServiceInternals;
        vi.mocked(warehouseClientFromCredentials).mockClear();

        await projectService.buildSourceAdapter(
            { type: DbtProjectType.NONE },
            { database: null, schema: 'source_schema' },
            'org-uuid',
            primary,
            null,
        );

        expect(warehouseClientFromCredentials).toHaveBeenCalledWith(
            expect.objectContaining({ schema: 'source_schema' }),
            undefined,
        );
    });

    it('BC-7: stages the projected merged manifest without publishing it during adapter construction', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
            },
        ]);

        const { adapter: buildMergedAdapterResult } =
            buildMergedAdapterWithService(primaryManifest, sourceManifest);
        const { stagedMergedManifest } = await buildMergedAdapterResult;

        expect(projectModel.upsertMergedManifest).not.toHaveBeenCalled();
        if (!stagedMergedManifest) {
            throw new Error('Expected a staged merged manifest');
        }
        const persisted = JSON.parse(
            gunzipSync(stagedMergedManifest).toString('utf8'),
        ) as DbtManifest;
        expect(Object.keys(persisted.nodes)).toEqual([
            'model.pkg_a.orders',
            'seed.pkg_a.country_codes',
            'model.pkg_b.customers',
            'seed.pkg_b.country_codes',
        ]);
    });

    it('persists exactly the model selection compiled by the merged adapter', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
                compiled: undefined,
            },
            {
                uniqueId: 'model.pkg_a.helper',
                name: 'helper',
                packageName: 'pkg_a',
                compiled: undefined,
            },
            {
                uniqueId: 'model.pkg_a.ephemeral',
                name: 'ephemeral',
                packageName: 'pkg_a',
                compiled: undefined,
                materialized: 'ephemeral',
            },
        ]);
        primaryManifest.nodes['seed.pkg_a.countries'] = {
            unique_id: 'seed.pkg_a.countries',
            name: 'countries',
            package_name: 'pkg_a',
            resource_type: 'seed',
            database: 'analytics',
            schema: 'public',
            config: { materialized: 'seed' },
            meta: {},
            columns: {},
        } as unknown as DbtManifest['nodes'][string];
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
                compiled: undefined,
            },
            {
                uniqueId: 'model.pkg_b.helper',
                name: 'source_helper',
                packageName: 'pkg_b',
                compiled: undefined,
            },
        ]);

        const { stagedMergedManifest } = await buildMergedAdapterWithService(
            primaryManifest,
            sourceManifest,
            {
                primary: ['model.pkg_a.orders'],
                source: ['model.pkg_b.customers'],
            },
        ).adapter;
        expect(projectModel.upsertMergedManifest).not.toHaveBeenCalled();
        if (!stagedMergedManifest) {
            throw new Error('Expected a staged merged manifest');
        }
        const persisted = JSON.parse(
            gunzipSync(stagedMergedManifest).toString('utf8'),
        ) as DbtManifest;
        const compiledNodes = getCompiledModels(
            getModelsFromManifest(persisted),
        ).map((node) => node.unique_id);

        expect(compiledNodes).toEqual([
            'model.pkg_a.orders',
            'seed.pkg_a.country_codes',
            'seed.pkg_a.countries',
            'model.pkg_b.customers',
            'seed.pkg_b.country_codes',
        ]);
        expect(persisted.nodes['model.pkg_a.helper']).toHaveProperty(
            'compiled',
            false,
        );
        expect(persisted.nodes['model.pkg_a.ephemeral']).toHaveProperty(
            'compiled',
            false,
        );
        expect(persisted.nodes['model.pkg_b.helper']).toHaveProperty(
            'compiled',
            false,
        );
        expect(persisted.nodes['seed.pkg_a.countries']).not.toHaveProperty(
            'compiled',
        );
    });

    it('preserves an explicitly empty model selection in the merged adapter', async () => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
                compiled: undefined,
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
                compiled: undefined,
            },
        ]);

        const { adapter: mergedAdapter } = await buildMergedAdapterWithService(
            primaryManifest,
            sourceManifest,
            { primary: [], source: [] },
        ).adapter;
        const mergedManifestResult = await mergedAdapter.getDbtManifest();

        expect(mergedManifestResult.selectedModelIds).toEqual([]);
        expect(
            mergedManifestResult.manifest.nodes['model.pkg_a.orders'],
        ).toHaveProperty('compiled', false);
        expect(
            mergedManifestResult.manifest.nodes['model.pkg_b.customers'],
        ).toHaveProperty('compiled', false);
    });

    it('flag OFF returns the primary adapter by identity and never queries getSources', async () => {
        const { projectService, getSources } = buildServiceWithMocks(false, [
            { name: 'jaffle-2' },
        ]);

        const result = await projectService.resolveCompileAdapter(baseArgs);

        expect(result.adapter).toBe(primaryAdapter);
        expect(getSources).not.toHaveBeenCalled();
        expect(projectModel.deleteMergedManifest).toHaveBeenCalledWith(
            'project-uuid',
        );
    });

    it('flag ON with zero sources (N=0) returns the primary adapter by identity', async () => {
        const { projectService, getSources } = buildServiceWithMocks(true, []);

        const result = await projectService.resolveCompileAdapter(baseArgs);

        expect(result.adapter).toBe(primaryAdapter);
        expect(getSources).toHaveBeenCalledTimes(1);
        expect(projectModel.deleteMergedManifest).toHaveBeenCalledWith(
            'project-uuid',
        );
        expect(projectModel.upsertMergedManifest).not.toHaveBeenCalled();
    });

    it.each([
        { path: 'feature flag off', flagEnabled: false, sources: [] },
        { path: 'zero additional sources', flagEnabled: true, sources: [] },
    ])(
        'BC-6: $path returns the primary adapter when stale manifest deletion fails',
        async ({ flagEnabled, sources }) => {
            const { projectService } = buildServiceWithMocks(
                flagEnabled,
                sources,
            );
            const warn = vi.spyOn(projectService.logger, 'warn');
            projectModel.deleteMergedManifest.mockRejectedValueOnce(
                new Error('database unavailable'),
            );

            const result = await projectService.resolveCompileAdapter(baseArgs);

            expect(result.adapter).toBe(primaryAdapter);
            expect(warn).toHaveBeenCalledWith(
                'Failed to delete merged dbt manifest for project project-uuid: database unavailable',
            );
        },
    );

    it('BC-7: carries the staged merged manifest through adapter resolution', async () => {
        const mergedAdapter = {
            id: 'merged-adapter',
        } as unknown as ProjectAdapter;
        const stagedMergedManifest = Buffer.from('staged-manifest');
        const { projectService } = buildServiceWithMocks(true, [
            { name: 'jaffle-2' },
        ]);
        const buildMergedManifestAdapterSpy = vi
            .spyOn(projectService, 'buildMergedManifestAdapter')
            .mockResolvedValue({
                adapter: mergedAdapter,
                stagedMergedManifest,
            });

        const result = await projectService.resolveCompileAdapter(baseArgs);

        expect(result).toEqual({
            adapter: mergedAdapter,
            stagedMergedManifest,
        });
        expect(result.adapter).not.toBe(primaryAdapter);
        expect(buildMergedManifestAdapterSpy).toHaveBeenCalledTimes(1);
    });

    const compileUser: SessionUser = {
        ...user,
        organizationUuid: 'organizationUuid',
        organizationName: 'organizationName',
        organizationCreatedAt: new Date('2026-08-16T00:00:00.000Z'),
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: ['update', 'view'] },
            { subject: 'Job', action: ['create'] },
            { subject: 'CompileProject', action: ['manage'] },
        ]),
    };

    const buildCompilationBoundaryService = (
        compileAllExplores: ProjectAdapter['compileAllExplores'] = vi.fn(
            async () => [validExplore],
        ),
        primaryDestroy: ProjectAdapter['destroy'] = vi.fn(
            async () => undefined,
        ),
    ) => {
        const primaryManifest = buildManifest([
            {
                uniqueId: 'model.pkg_a.orders',
                name: 'orders',
                packageName: 'pkg_a',
            },
        ]);
        const sourceManifest = buildManifest([
            {
                uniqueId: 'model.pkg_b.customers',
                name: 'customers',
                packageName: 'pkg_b',
            },
        ]);
        const primaryCompileAdapter = {
            test: vi.fn(async () => undefined),
            getDbtManifest: vi.fn(async () => ({
                manifest: primaryManifest,
                timings: NO_FETCH_TIMINGS,
            })),
            destroy: primaryDestroy,
            dbtProjectDir: '/tmp/primary-dbt-project',
        } as unknown as ProjectAdapter;
        const sourceAdapter = {
            getDbtManifest: vi.fn(async () => ({
                manifest: sourceManifest,
                timings: NO_FETCH_TIMINGS,
            })),
            destroy: vi.fn(async () => undefined),
        } as unknown as ProjectAdapter;
        const mergedAdapter = {
            prepareExploreStream: vi.fn(
                async (
                    ...args: Parameters<ProjectAdapter['compileAllExplores']>
                ) => {
                    const explores = await compileAllExplores(...args);
                    return (async function* stream() {
                        yield* explores;
                    })();
                },
            ),
            getDbtPackages: vi.fn(async () => ({})),
            getLightdashProjectConfig: vi.fn(async () => ({
                spotlight: {},
                parameters: {},
                table_groups: {},
            })),
            destroy: vi.fn(async () => undefined),
        } as unknown as ProjectAdapter;
        vi.spyOn(projectAdapterModule, 'projectAdapterFromConfig')
            .mockResolvedValueOnce(primaryCompileAdapter)
            .mockResolvedValueOnce(sourceAdapter)
            .mockResolvedValueOnce(mergedAdapter);

        const compiledProject: Project = {
            ...projectWithSensitiveFields,
            dbtConnection: {
                type: DbtProjectType.MANIFEST,
                manifest: JSON.stringify(primaryManifest),
                hideRefreshButton: true,
            },
            warehouseConnection: warehouseClientMock.credentials,
        };
        projectModel.getWithSensitiveFields
            .mockReset()
            .mockResolvedValue(compiledProject);
        projectModel.get.mockReset().mockResolvedValue(compiledProject);
        projectModel.getWarehouseCredentialsForProject
            .mockReset()
            .mockResolvedValue(warehouseClientMock.credentials);
        projectModel.getProjectWarehouseConfig.mockResolvedValue({
            organizationWarehouseCredentialsUuid: null,
            queryTimezone: null,
        });
        projectModel.getSummary.mockReset().mockResolvedValue(projectSummary);
        projectModel.getWarehouseFromCache
            .mockReset()
            .mockResolvedValue(undefined);
        projectModel.upsertMergedManifest
            .mockReset()
            .mockResolvedValue(undefined);

        const featureFlagModel = {
            get: vi.fn(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    id: featureFlagId,
                    enabled: featureFlagId === FeatureFlags.MultiDbtSources,
                }),
            ),
        } as unknown as FeatureFlagModel;
        const projectDbtSourcesModel = {
            getSources: vi.fn(async () => [buildSource('source-b')]),
        } as unknown as ProjectDbtSourcesModel;

        return getMockedProjectService(lightdashConfigMock, {
            featureFlagModel,
            projectDbtSourcesModel,
        });
    };

    it.each([false, true])(
        'the compile job releases its tunnel after adapter cleanup when compile fails %s',
        async (fails) => {
            const compileExplores = vi.fn<ProjectAdapter['compileAllExplores']>(
                async () => {
                    if (fails) throw new Error('compile failed');
                    return [validExplore];
                },
            );
            const projectService =
                buildCompilationBoundaryService(compileExplores);
            const adapterBuilder = vi.mocked(
                projectAdapterModule.projectAdapterFromConfig,
            );
            const firstResult = adapterBuilder.mock.results.length;
            projectModel.saveExploreStreamToCache
                .mockReset()
                .mockImplementationOnce(async (_uuid, explores) => {
                    for await (const explore of explores)
                        expect(explore.name).toBeDefined();
                    return { cachedExploreUuids: [] };
                });
            await projectService.compileProject(
                compileUser,
                'projectUuid',
                RequestMethod.WEB_APP,
                'compile-job-uuid',
            );
            const primaryCompileAdapter =
                await adapterBuilder.mock.results[firstResult].value;
            const source =
                await adapterBuilder.mock.results[firstResult + 1].value;
            const merged =
                await adapterBuilder.mock.results[firstResult + 2].value;
            const tunnel = vi.mocked(SshTunnel).mock.results.at(-1)?.value;
            expect(tunnel.disconnect).toHaveBeenCalledOnce();
            expect(primaryCompileAdapter.destroy).toHaveBeenCalledOnce();
            expect(merged.destroy).toHaveBeenCalledOnce();
            expect(
                vi.mocked(primaryCompileAdapter.destroy).mock
                    .invocationCallOrder[0],
            ).toBeLessThan(tunnel.disconnect.mock.invocationCallOrder[0]);
            expect(
                vi.mocked(merged.destroy).mock.invocationCallOrder[0],
            ).toBeLessThan(tunnel.disconnect.mock.invocationCallOrder[0]);
            expect(
                vi.mocked(source.destroy).mock.invocationCallOrder[0],
            ).toBeGreaterThan(tunnel.disconnect.mock.invocationCallOrder[0]);
            expect(jobModel.update).toHaveBeenCalledWith(
                'compile-job-uuid',
                expect.objectContaining({
                    jobStatus: fails ? JobStatusType.ERROR : JobStatusType.DONE,
                }),
            );
        },
    );

    it('a manifest-only primary cleanup failure remains a warning and releases the tunnel', async () => {
        const cleanupError = new Error('clone cleanup failed');
        const primaryDestroy = vi.fn(async () => {
            throw cleanupError;
        });
        const projectService = buildCompilationBoundaryService(
            undefined,
            primaryDestroy,
        );
        const logger = vi.spyOn(
            (projectService as unknown as ProjectServiceInternals).logger,
            'warn',
        );
        projectModel.saveExploreStreamToCache
            .mockReset()
            .mockImplementationOnce(async (_uuid, explores) => {
                for await (const explore of explores)
                    expect(explore.name).toBeDefined();
                return { cachedExploreUuids: [] };
            });
        await projectService.compileProject(
            compileUser,
            'projectUuid',
            RequestMethod.WEB_APP,
            'cleanup-job-uuid',
        );
        expect(primaryDestroy).toHaveBeenCalledOnce();
        expect(
            vi.mocked(SshTunnel).mock.results.at(-1)?.value.disconnect,
        ).toHaveBeenCalledOnce();
        expect(logger).toHaveBeenCalledWith(
            'Failed to destroy a dbt source adapter after manifest merge',
            { error: cleanupError },
        );
        expect(jobModel.update).toHaveBeenCalledWith(
            'cleanup-job-uuid',
            expect.objectContaining({ jobStatus: JobStatusType.DONE }),
        );
    });

    it('a failed adapter test destroys the adapter and releases the lease', async () => {
        const adapter = {
            test: vi.fn(async () => {
                throw new Error('adapter test failed');
            }),
            destroy: vi.fn(async () => undefined),
        } as unknown as ProjectAdapter;
        vi.spyOn(
            projectAdapterModule,
            'projectAdapterFromConfig',
        ).mockResolvedValueOnce(adapter);
        const projectService = getMockedProjectService(lightdashConfigMock);
        const internals = projectService as unknown as {
            testProjectAdapter: (
                data: UpdateProject,
                caller: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
                context: 'project_create' | 'project_update',
                method: RequestMethod,
                projectUuid: string | null,
            ) => Promise<unknown>;
        };
        await expect(
            internals.testProjectAdapter(
                {
                    ...projectWithSensitiveFields,
                    warehouseConnection: warehouseClientMock.credentials,
                    dbtConnection: { type: DbtProjectType.NONE },
                },
                compileUser,
                'project_create',
                RequestMethod.WEB_APP,
                null,
            ),
        ).rejects.toThrow('adapter test failed');
        const tunnel = vi.mocked(SshTunnel).mock.results.at(-1)?.value;
        expect(tunnel.disconnect).toHaveBeenCalledOnce();
        expect(adapter.destroy).toHaveBeenCalledOnce();
        expect(
            vi.mocked(adapter.destroy).mock.invocationCallOrder[0],
        ).toBeLessThan(tunnel.disconnect.mock.invocationCallOrder[0]);
    });

    it('test and deploy with no dbt connection releases its tested adapter and tunnel', async () => {
        const projectService = getMockedProjectService(lightdashConfigMock);
        projectModel.getWithSensitiveFields.mockResolvedValueOnce({
            ...projectWithSensitiveFields,
            warehouseConnection: warehouseClientMock.credentials,
            dbtConnection: { type: DbtProjectType.NONE },
        });
        const adapter = {
            test: vi.fn(async () => undefined),
            destroy: vi.fn(async () => undefined),
        } as unknown as ProjectAdapter;
        vi.spyOn(
            projectAdapterModule,
            'projectAdapterFromConfig',
        ).mockResolvedValueOnce(adapter);
        await projectService.testAndCompileProject(
            compileUser,
            'projectUuid',
            RequestMethod.WEB_APP,
            'none-job-uuid',
        );
        const tunnel = vi.mocked(SshTunnel).mock.results.at(-1)?.value;
        expect(adapter.destroy).toHaveBeenCalledOnce();
        expect(tunnel.disconnect).toHaveBeenCalledOnce();
        expect(
            vi.mocked(adapter.destroy).mock.invocationCallOrder[0],
        ).toBeLessThan(tunnel.disconnect.mock.invocationCallOrder[0]);
    });

    it('BC-7: distinguishes manifest staging failures from persistence failures', async () => {
        const projectService = buildCompilationBoundaryService();
        const internals = projectService as unknown as ProjectServiceInternals;
        const warn = vi.spyOn(internals.logger, 'warn');
        const circularMetadata: Record<string, unknown> = {};
        circularMetadata.self = circularMetadata;

        await expect(
            internals.stageMergedManifest('project-uuid', {
                metadata: circularMetadata,
                nodes: {},
            } as unknown as DbtManifest),
        ).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            expect.stringMatching(
                /^Failed to serialize merged dbt manifest for project project-uuid:/,
            ),
        );
    });

    it('BC-7: test and deploy publishes the staged manifest only after cache completion', async () => {
        let cacheCompleted = false;
        let persistedManifest: Buffer | undefined;
        const projectService = buildCompilationBoundaryService();
        projectModel.saveExploreStreamToCache
            .mockReset()
            .mockImplementationOnce(async (_projectUuid, explores) => {
                for await (const explore of explores) {
                    expect(explore.name).toBeDefined();
                }
                await Promise.resolve();
                cacheCompleted = true;
                return { cachedExploreUuids: [] };
            });
        projectModel.upsertMergedManifest.mockImplementationOnce(
            async (_projectUuid, manifest) => {
                if (!cacheCompleted) {
                    throw new Error(
                        'cache did not complete before publication',
                    );
                }
                persistedManifest = manifest;
            },
        );

        await projectService.testAndCompileProject(
            compileUser,
            'projectUuid',
            RequestMethod.WEB_APP,
            'compile-job-uuid',
        );

        expect(projectModel.saveExploreStreamToCache).toHaveBeenCalledTimes(1);
        expect(projectModel.upsertMergedManifest).toHaveBeenCalledTimes(1);
        expect(
            vi.mocked(projectModel.saveExploreStreamToCache).mock
                .invocationCallOrder[0],
        ).toBeLessThan(
            vi.mocked(projectModel.upsertMergedManifest).mock
                .invocationCallOrder[0],
        );
        expect(persistedManifest).toBeDefined();
    });

    it('BC-7: refresh publishes the staged manifest only after cache completion', async () => {
        let cacheCompleted = false;
        let persistedManifest: Buffer | undefined;
        const projectService = buildCompilationBoundaryService();
        projectModel.saveExploreStreamToCache
            .mockReset()
            .mockImplementationOnce(async (_projectUuid, explores) => {
                for await (const explore of explores) {
                    expect(explore.name).toBeDefined();
                }
                await Promise.resolve();
                cacheCompleted = true;
                return { cachedExploreUuids: [] };
            });
        projectModel.upsertMergedManifest.mockImplementationOnce(
            async (_projectUuid, manifest) => {
                if (!cacheCompleted) {
                    throw new Error(
                        'cache did not complete before publication',
                    );
                }
                persistedManifest = manifest;
            },
        );

        await projectService.compileProject(
            compileUser,
            'projectUuid',
            RequestMethod.WEB_APP,
            'compile-job-uuid',
        );

        expect(projectModel.saveExploreStreamToCache).toHaveBeenCalledTimes(1);
        expect(projectModel.upsertMergedManifest).toHaveBeenCalledTimes(1);
        expect(
            vi.mocked(projectModel.saveExploreStreamToCache).mock
                .invocationCallOrder[0],
        ).toBeLessThan(
            vi.mocked(projectModel.upsertMergedManifest).mock
                .invocationCallOrder[0],
        );
        expect(persistedManifest).toBeDefined();
    });

    it('BC-7: test and deploy remains successful and warns when manifest publication fails', async () => {
        const projectService = buildCompilationBoundaryService();
        const warn = vi.spyOn(
            (projectService as unknown as ProjectServiceInternals).logger,
            'warn',
        );
        projectModel.saveExploreStreamToCache
            .mockReset()
            .mockResolvedValueOnce({ cachedExploreUuids: [] });
        projectModel.upsertMergedManifest.mockRejectedValueOnce(
            new Error('database unavailable'),
        );

        await expect(
            projectService.testAndCompileProject(
                compileUser,
                'projectUuid',
                RequestMethod.WEB_APP,
                'compile-job-uuid',
            ),
        ).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            'Failed to persist merged dbt manifest for project projectUuid: database unavailable',
        );
    });

    it('BC-7: a failed test and deploy compile preserves the previously served manifest bytes', async () => {
        const previousManifest = Buffer.from('previous-manifest');
        let persistedManifest = previousManifest;
        const compileAllExplores = vi.fn<ProjectAdapter['compileAllExplores']>(
            async () => {
                throw new Error('compile failed');
            },
        );
        const projectService =
            buildCompilationBoundaryService(compileAllExplores);
        projectModel.getMergedManifest
            .mockReset()
            .mockImplementation(async () => persistedManifest);
        projectModel.upsertMergedManifest.mockImplementation(
            async (_projectUuid, manifest) => {
                persistedManifest = Buffer.from(manifest);
            },
        );
        const deployAccount = {
            ...buildAccount(),
            user: {
                ...buildAccount().user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'DeployProject', action: ['manage'] },
                ]),
            },
        } as RegisteredAccount;

        await expect(
            projectService.testAndCompileProject(
                compileUser,
                'projectUuid',
                RequestMethod.WEB_APP,
                'compile-job-uuid',
            ),
        ).rejects.toThrow('compile failed');

        await expect(
            projectService.getMergedManifest(deployAccount, 'projectUuid'),
        ).resolves.toBe(previousManifest);
        expect(projectModel.upsertMergedManifest).not.toHaveBeenCalled();
    });

    it('propagates a ParameterError from buildMergedManifestAdapter when sources collide', async () => {
        const { projectService } = buildServiceWithMocks(true, [
            { name: 'jaffle-2' },
        ]);
        vi.spyOn(
            projectService,
            'buildMergedManifestAdapter',
        ).mockRejectedValue(
            new ParameterError(
                'The dbt sources "dbt_project" and "jaffle-2" use the same dbt project name "shared". Change the name: value in one repository\'s dbt_project.yml and deploy again.',
            ),
        );

        await expect(
            projectService.resolveCompileAdapter(baseArgs),
        ).rejects.toThrow(ParameterError);
    });
});

describe('assertCustomSqlAuthorizedForQuery', () => {
    const { projectUuid } = defaultProject;
    const organizationUuid = 'organizationUuid';
    const exploreName = 'valid_explore';
    const spaceUuid = 'space-1';

    const sqlTableCalculation = {
        name: 'tc',
        displayName: 'tc',
        sql: '(SELECT count(*) FROM information_schema.tables)',
    };
    const sqlCustomDimension = {
        id: 'cd',
        name: 'cd',
        table: 'a',
        type: CustomDimensionType.SQL,
        sql: '(SELECT count(*) FROM information_schema.columns)',
        dimensionType: DimensionType.NUMBER,
    };
    const sqlAdditionalMetric = {
        name: 'custom_metric',
        table: 'a',
        type: MetricType.SUM,
        sql: '(SELECT count(*) FROM information_schema.schemata)',
    };

    type CustomSqlAuthArgs = {
        account: ReturnType<typeof buildAccount>;
        projectUuid: string;
        organizationUuid: string;
        exploreName: string;
        dataAppPreviewToken?: string;
        customSqlProvenanceChartUuid?: string;
        metricQuery: {
            tableCalculations?: (typeof sqlTableCalculation)[];
            customDimensions?: (typeof sqlCustomDimension)[];
            additionalMetrics?: {
                name: string;
                table: string;
                type: MetricType;
                sql: string;
                baseDimensionName?: string;
            }[];
        };
    };
    const assertCustomSql = (svc: ProjectService, args: CustomSqlAuthArgs) =>
        (
            svc as unknown as {
                assertCustomSqlAuthorizedForQuery: (
                    a: CustomSqlAuthArgs,
                ) => Promise<void>;
            }
        ).assertCustomSqlAuthorizedForQuery(args);

    const accountWithAbility = (
        rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0],
        {
            accountType = 'session',
            userType = 'registered',
        }: Parameters<typeof buildAccount>[0] = {},
    ) => {
        const base = buildAccount({ accountType, userType });
        return {
            ...base,
            user: {
                ...base.user,
                ability: new Ability<PossibleAbilities>(rules),
            },
        } as ReturnType<typeof buildAccount>;
    };

    const authorAccount = accountWithAbility([
        { subject: 'Project', action: 'view' },
        { subject: 'Space', action: 'view' },
        { subject: 'CustomSqlTableCalculations', action: 'manage' },
        { subject: 'CustomFields', action: 'manage' },
    ]);
    const noScopeAccount = accountWithAbility([
        { subject: 'Project', action: 'view' },
        { subject: 'Space', action: 'view' },
    ]);
    const dataAppViewerAccount = accountWithAbility([
        { subject: 'Project', action: 'view' },
        { subject: 'Space', action: 'view' },
        { subject: 'DataApp', action: 'view' },
    ]);
    const restrictedAccount = accountWithAbility([
        { subject: 'Project', action: 'view' },
        {
            subject: 'Space',
            action: 'view',
            conditions: { projectUuid: 'different-project' },
        },
    ]);
    const jwtAccount = accountWithAbility(
        [
            { subject: 'Project', action: 'view' },
            { subject: 'Space', action: 'view' },
        ],
        { accountType: 'jwt', userType: 'anonymous' },
    );
    const dashboardUuid = 'embedded-dashboard-uuid';
    const chartUuid = 'embedded-chart-uuid';
    const dashboardEmbed = {
        projectUuid,
        allowAllDashboards: false,
        dashboardUuids: [dashboardUuid],
        allowAllCharts: false,
        chartUuids: [],
    };
    const dashboardJwtAccount = {
        ...jwtAccount,
        access: {
            content: {
                type: 'dashboard',
                dashboardUuid,
                chartUuids: [],
                explores: [exploreName],
            },
        },
        embed: dashboardEmbed,
    } as unknown as ReturnType<typeof buildAccount>;

    const spacePermissionService = {
        resolveAccess: vi.fn(async () => ({
            organizationUuid,
            projectUuid,
            inheritsFromOrgOrProject: true,
            access: [],
        })),
        resolveAccessBatch: vi.fn(
            async (_userUuid: string, targets: { spaceUuid: string }[]) =>
                targets.map((target) => ({
                    target,
                    context: {
                        organizationUuid,
                        projectUuid,
                        inheritsFromOrgOrProject: true,
                        access: [],
                        admins: [],
                        directOnly: false,
                    },
                })),
        ),
    } as unknown as SpacePermissionService;

    const service = getMockedProjectService(lightdashConfigMock, {
        spacePermissionService,
    });

    const baseArgs = {
        projectUuid,
        organizationUuid,
        exploreName,
    };

    beforeEach(() => {
        savedChartModel.findCustomSqlProvenance.mockReset();
        savedChartModel.findCustomSqlProvenance.mockResolvedValue({
            tableCalculations: [],
            customSqlDimensions: [],
            additionalMetrics: [],
        });
        savedChartModel.getCustomSqlProvenanceForChart.mockReset();
        dashboardModel.savedChartExistsInDashboard.mockReset();
        dashboardModel.savedChartExistsInDashboard.mockResolvedValue(false);
    });

    it('resolves and skips the provenance lookup when there is no custom SQL', async () => {
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: {},
            }),
        ).resolves.toBeUndefined();
        expect(savedChartModel.findCustomSqlProvenance).not.toHaveBeenCalled();
    });

    it('allows a user with the authoring scopes without a provenance lookup', async () => {
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: authorAccount,
                metricQuery: {
                    tableCalculations: [sqlTableCalculation],
                    customDimensions: [sqlCustomDimension],
                },
            }),
        ).resolves.toBeUndefined();
        expect(savedChartModel.findCustomSqlProvenance).not.toHaveBeenCalled();
    });

    it('rejects a SQL table calculation with no matching saved chart', async () => {
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: { tableCalculations: [sqlTableCalculation] },
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('allows a SQL table calculation persisted in a viewable data app', async () => {
        const getCustomSqlProvenance = vi.fn(async () => ({
            tableCalculations: new Set([sqlTableCalculation.sql]),
            customDimensions: new Set([
                getCustomSqlFieldKey(sqlCustomDimension),
            ]),
            additionalMetrics: new Set([
                getCustomSqlFieldKey(sqlAdditionalMetric),
            ]),
        }));
        const dataAppService = getMockedProjectService(lightdashConfigMock, {
            getDataAppCustomSqlProvenance: getCustomSqlProvenance,
        });

        await expect(
            assertCustomSql(dataAppService, {
                ...baseArgs,
                dataAppPreviewToken: 'signed-preview-token',
                account: dataAppViewerAccount,
                metricQuery: {
                    tableCalculations: [sqlTableCalculation],
                    customDimensions: [sqlCustomDimension],
                    additionalMetrics: [sqlAdditionalMetric],
                },
            }),
        ).resolves.toBeUndefined();
        expect(getCustomSqlProvenance).toHaveBeenCalledWith({
            account: dataAppViewerAccount,
            projectUuid,
            organizationUuid,
            exploreName,
            previewToken: 'signed-preview-token',
        });
    });

    it('rejects substituted SQL even when its field name matches a viewable data app', async () => {
        const getCustomSqlProvenance = vi.fn(async () => ({
            tableCalculations: new Set(['SUM(${orders.amount})']),
            customDimensions: new Set<string>(),
            additionalMetrics: new Set<string>(),
        }));
        const dataAppService = getMockedProjectService(lightdashConfigMock, {
            getDataAppCustomSqlProvenance: getCustomSqlProvenance,
        });

        await expect(
            assertCustomSql(dataAppService, {
                ...baseArgs,
                dataAppPreviewToken: 'signed-preview-token',
                account: dataAppViewerAccount,
                metricQuery: { tableCalculations: [sqlTableCalculation] },
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('rejects data app custom SQL provenance bound to another table', async () => {
        const getCustomSqlProvenance = vi.fn(async () => ({
            tableCalculations: new Set<string>(),
            customDimensions: new Set([
                getCustomSqlFieldKey({
                    table: 'other',
                    sql: sqlCustomDimension.sql,
                }),
            ]),
            additionalMetrics: new Set<string>(),
        }));
        const dataAppService = getMockedProjectService(lightdashConfigMock, {
            getDataAppCustomSqlProvenance: getCustomSqlProvenance,
        });

        await expect(
            assertCustomSql(dataAppService, {
                ...baseArgs,
                dataAppPreviewToken: 'signed-preview-token',
                account: dataAppViewerAccount,
                metricQuery: { customDimensions: [sqlCustomDimension] },
            }),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
    });

    it('allows a SQL table calculation that matches a viewable saved chart', async () => {
        savedChartModel.findCustomSqlProvenance.mockResolvedValue({
            tableCalculations: [{ sql: sqlTableCalculation.sql, spaceUuid }],
            customSqlDimensions: [],
            additionalMetrics: [],
        });
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: { tableCalculations: [sqlTableCalculation] },
            }),
        ).resolves.toBeUndefined();
    });

    it('rejects a SQL table calculation whose only matching chart is not viewable', async () => {
        savedChartModel.findCustomSqlProvenance.mockResolvedValue({
            tableCalculations: [{ sql: sqlTableCalculation.sql, spaceUuid }],
            customSqlDimensions: [],
            additionalMetrics: [],
        });
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: restrictedAccount,
                metricQuery: { tableCalculations: [sqlTableCalculation] },
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('rejects a custom SQL dimension with no matching saved chart', async () => {
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: { customDimensions: [sqlCustomDimension] },
            }),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
    });

    it('allows a custom SQL dimension that matches a viewable saved chart', async () => {
        savedChartModel.findCustomSqlProvenance.mockResolvedValue({
            tableCalculations: [],
            customSqlDimensions: [
                {
                    sql: sqlCustomDimension.sql,
                    table: sqlCustomDimension.table,
                    spaceUuid,
                },
            ],
            additionalMetrics: [],
        });
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: { customDimensions: [sqlCustomDimension] },
            }),
        ).resolves.toBeUndefined();
    });

    it('rejects a custom SQL dimension when only the SQL matches but the table binding differs', async () => {
        savedChartModel.findCustomSqlProvenance.mockResolvedValue({
            tableCalculations: [],
            customSqlDimensions: [
                {
                    sql: sqlCustomDimension.sql,
                    table: 'a_different_table',
                    spaceUuid,
                },
            ],
            additionalMetrics: [],
        });
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: { customDimensions: [sqlCustomDimension] },
            }),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
    });

    it('never grants the provenance exemption to JWT/embed callers', async () => {
        savedChartModel.findCustomSqlProvenance.mockResolvedValue({
            tableCalculations: [{ sql: sqlTableCalculation.sql, spaceUuid }],
            customSqlDimensions: [],
            additionalMetrics: [],
        });
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: jwtAccount,
                metricQuery: { tableCalculations: [sqlTableCalculation] },
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(savedChartModel.findCustomSqlProvenance).not.toHaveBeenCalled();
    });

    it('allows current custom SQL from a chart on the embedded dashboard', async () => {
        dashboardModel.savedChartExistsInDashboard.mockResolvedValue(true);
        savedChartModel.getCustomSqlProvenanceForChart.mockResolvedValue({
            exploreName,
            tableCalculations: [sqlTableCalculation],
            customSqlDimensions: [sqlCustomDimension],
            additionalMetrics: [sqlAdditionalMetric],
        });

        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: dashboardJwtAccount,
                customSqlProvenanceChartUuid: chartUuid,
                metricQuery: {
                    tableCalculations: [sqlTableCalculation],
                    customDimensions: [sqlCustomDimension],
                    additionalMetrics: [sqlAdditionalMetric],
                },
            }),
        ).resolves.toBeUndefined();
        expect(dashboardModel.savedChartExistsInDashboard).toHaveBeenCalledWith(
            projectUuid,
            dashboardUuid,
            chartUuid,
        );
        expect(
            savedChartModel.getCustomSqlProvenanceForChart,
        ).toHaveBeenCalledWith({
            projectUuid,
            savedChartUuid: chartUuid,
        });
    });

    it('rejects substituted SQL from an otherwise authorized embedded chart', async () => {
        dashboardModel.savedChartExistsInDashboard.mockResolvedValue(true);
        savedChartModel.getCustomSqlProvenanceForChart.mockResolvedValue({
            exploreName,
            tableCalculations: [],
            customSqlDimensions: [
                { ...sqlCustomDimension, sql: 'persisted SQL' },
            ],
            additionalMetrics: [],
        });

        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: dashboardJwtAccount,
                customSqlProvenanceChartUuid: chartUuid,
                metricQuery: { customDimensions: [sqlCustomDimension] },
            }),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
    });

    it('rejects custom SQL from a chart outside the embedded dashboard', async () => {
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: dashboardJwtAccount,
                customSqlProvenanceChartUuid: chartUuid,
                metricQuery: { customDimensions: [sqlCustomDimension] },
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(
            savedChartModel.getCustomSqlProvenanceForChart,
        ).not.toHaveBeenCalled();
    });

    it('rejects provenance when the dashboard is not on the embed allowlist', async () => {
        const dashboardNotAllowlistedAccount = {
            ...dashboardJwtAccount,
            embed: {
                ...dashboardEmbed,
                dashboardUuids: [],
            },
        } as unknown as typeof dashboardJwtAccount;

        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: dashboardNotAllowlistedAccount,
                customSqlProvenanceChartUuid: chartUuid,
                metricQuery: { customDimensions: [sqlCustomDimension] },
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(
            dashboardModel.savedChartExistsInDashboard,
        ).not.toHaveBeenCalled();
        expect(
            savedChartModel.getCustomSqlProvenanceForChart,
        ).not.toHaveBeenCalled();
    });

    it('rejects provenance from a chart on a different explore', async () => {
        dashboardModel.savedChartExistsInDashboard.mockResolvedValue(true);
        savedChartModel.getCustomSqlProvenanceForChart.mockResolvedValue({
            exploreName: 'another_explore',
            tableCalculations: [],
            customSqlDimensions: [sqlCustomDimension],
            additionalMetrics: [],
        });

        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: dashboardJwtAccount,
                customSqlProvenanceChartUuid: chartUuid,
                metricQuery: { customDimensions: [sqlCustomDimension] },
            }),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
    });

    it('allows current custom SQL from a chart-scoped embed token', async () => {
        const chartJwtAccount = {
            ...jwtAccount,
            access: {
                content: {
                    type: 'chart',
                    chartUuids: [chartUuid],
                    explores: [exploreName],
                },
            },
            embed: {
                ...dashboardEmbed,
                dashboardUuids: [],
                chartUuids: [chartUuid],
            },
        } as unknown as ReturnType<typeof buildAccount>;
        savedChartModel.getCustomSqlProvenanceForChart.mockResolvedValue({
            exploreName,
            tableCalculations: [],
            customSqlDimensions: [sqlCustomDimension],
            additionalMetrics: [],
        });

        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: chartJwtAccount,
                customSqlProvenanceChartUuid: chartUuid,
                metricQuery: { customDimensions: [sqlCustomDimension] },
            }),
        ).resolves.toBeUndefined();
    });

    it('rejects a globally embedded chart not authorized by the chart token', async () => {
        const otherChartUuid = 'another-embedded-chart-uuid';
        const chartJwtAccount = {
            ...jwtAccount,
            access: {
                content: {
                    type: 'chart',
                    chartUuids: [chartUuid],
                    explores: [exploreName],
                },
            },
            embed: {
                ...dashboardEmbed,
                dashboardUuids: [],
                chartUuids: [chartUuid, otherChartUuid],
            },
        } as unknown as ReturnType<typeof buildAccount>;

        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: chartJwtAccount,
                customSqlProvenanceChartUuid: otherChartUuid,
                metricQuery: { customDimensions: [sqlCustomDimension] },
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(
            savedChartModel.getCustomSqlProvenanceForChart,
        ).not.toHaveBeenCalled();
    });

    // --- additional metrics (PR2) ---

    const fieldRefSql = '${TABLE}.amount';
    const metricSubquerySql =
        '(SELECT count(*) FROM information_schema.tables)';
    const exploreWithFieldSql = {
        ...validExplore,
        tables: {
            ...validExplore.tables,
            a: {
                ...validExplore.tables.a,
                dimensions: {
                    ...validExplore.tables.a.dimensions,
                    dim1: {
                        ...validExplore.tables.a.dimensions.dim1,
                        sql: fieldRefSql,
                    },
                },
            },
        },
    };
    const additionalMetric = (sql: string, table = 'a', name = 'am1') => [
        { name, table, type: MetricType.NUMBER, sql },
    ];
    const spyExplore = () =>
        vi
            .spyOn(service, 'getExplore')
            .mockClear()
            .mockResolvedValue(exploreWithFieldSql as unknown as Explore);

    it('allows a custom metric whose SQL is a modelled field, without scope or provenance', async () => {
        spyExplore();
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: {
                    additionalMetrics: additionalMetric(fieldRefSql),
                },
            }),
        ).resolves.toBeUndefined();
        expect(savedChartModel.findCustomSqlProvenance).not.toHaveBeenCalled();
    });

    it('allows a SQL-less custom metric that references a modelled dimension', async () => {
        spyExplore();
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: {
                    additionalMetrics: [
                        {
                            ...additionalMetric('')[0],
                            baseDimensionName: 'dim1',
                        },
                    ],
                },
            }),
        ).resolves.toBeUndefined();
        expect(savedChartModel.findCustomSqlProvenance).not.toHaveBeenCalled();
    });

    it('allows a model dimension reference without custom SQL scope or provenance', async () => {
        spyExplore();
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: {
                    additionalMetrics: additionalMetric('${a.dim1}'),
                },
            }),
        ).resolves.toBeUndefined();
        expect(savedChartModel.findCustomSqlProvenance).not.toHaveBeenCalled();
    });

    it.each(['${a.missing}', '${a.dim1} + 1', '${a.dim1}; SELECT 1'])(
        'does not grant custom SQL access for %s',
        async (sql) => {
            spyExplore();
            await expect(
                assertCustomSql(service, {
                    ...baseArgs,
                    account: noScopeAccount,
                    metricQuery: { additionalMetrics: additionalMetric(sql) },
                }),
            ).rejects.toThrow(CustomSqlQueryForbiddenError);
        },
    );

    it('rejects a SQL-less custom metric that references an unknown dimension', async () => {
        spyExplore();
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: {
                    additionalMetrics: [
                        {
                            ...additionalMetric('')[0],
                            baseDimensionName: 'missing',
                        },
                    ],
                },
            }),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
    });

    it('rejects modelled-field SQL rebound to another table', async () => {
        spyExplore();
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: {
                    additionalMetrics: additionalMetric(fieldRefSql, 'b'),
                },
            }),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
    });

    it('allows any custom metric SQL for a user with manage:CustomFields, without loading the explore', async () => {
        const exploreSpy = spyExplore();
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: authorAccount,
                metricQuery: {
                    additionalMetrics: additionalMetric(metricSubquerySql),
                },
            }),
        ).resolves.toBeUndefined();
        expect(exploreSpy).not.toHaveBeenCalled();
        expect(savedChartModel.findCustomSqlProvenance).not.toHaveBeenCalled();
    });

    it('rejects hand-authored custom metric SQL with no scope and no provenance', async () => {
        spyExplore();
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: {
                    additionalMetrics: additionalMetric(metricSubquerySql),
                },
            }),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
    });

    it('allows hand-authored custom metric SQL that matches a viewable saved chart', async () => {
        spyExplore();
        savedChartModel.findCustomSqlProvenance.mockResolvedValue({
            tableCalculations: [],
            customSqlDimensions: [],
            additionalMetrics: [
                { sql: metricSubquerySql, table: 'a', spaceUuid },
            ],
        });
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: {
                    additionalMetrics: additionalMetric(metricSubquerySql),
                },
            }),
        ).resolves.toBeUndefined();
    });

    it('rejects a custom metric matching persisted SQL under a different table binding', async () => {
        spyExplore();
        savedChartModel.findCustomSqlProvenance.mockResolvedValue({
            tableCalculations: [],
            customSqlDimensions: [],
            additionalMetrics: [
                { sql: metricSubquerySql, table: 'b', spaceUuid },
            ],
        });
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: noScopeAccount,
                metricQuery: {
                    additionalMetrics: additionalMetric(metricSubquerySql, 'a'),
                },
            }),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
    });

    it('rejects a custom metric whose matching chart is not viewable', async () => {
        spyExplore();
        savedChartModel.findCustomSqlProvenance.mockResolvedValue({
            tableCalculations: [],
            customSqlDimensions: [],
            additionalMetrics: [
                { sql: metricSubquerySql, table: 'a', spaceUuid },
            ],
        });
        await expect(
            assertCustomSql(service, {
                ...baseArgs,
                account: restrictedAccount,
                metricQuery: {
                    additionalMetrics: additionalMetric(metricSubquerySql),
                },
            }),
        ).rejects.toThrow(CustomSqlQueryForbiddenError);
    });
});

describe('dashboard available filters', () => {
    test('keeps a field per distinct label set and shares indexes across explores that agree', async () => {
        const filterAccount = {
            ...account,
            user: {
                ...account.user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'Project', action: 'view' },
                    { subject: 'SavedChart', action: 'view' },
                ]),
            },
        } as typeof account;
        // event_c reuses the team alias with event_a's labels
        const explores = [
            ['event_a', 'A'],
            ['event_b', 'B'],
            ['event_c', 'A'],
        ].map(([name, event]) => ({
            ...validExplore,
            name,
            tables: {
                team: {
                    ...validExplore.tables.a,
                    name: 'team',
                    dimensions: {
                        name: {
                            ...validExplore.tables.a.dimensions.dim1,
                            table: 'team',
                            name: 'name',
                            tableLabel: `Team at Event ${event}`,
                            label: `Name at Event ${event}`,
                        },
                    },
                    metrics: {
                        total: {
                            ...validExplore.tables.a.metrics.met1,
                            table: 'team',
                            name: 'total',
                            label: `Total at Event ${event}`,
                        },
                    },
                },
            },
        }));
        const charts = ['event_a', 'event_b', 'event_c'].map(
            (tableName, index) => ({
                uuid: `chart-${index}`,
                name: `Chart ${index}`,
                tableName,
                projectUuid: projectSummary.projectUuid,
                spaceUuid: 'space',
                dashboardUuid: null,
            }),
        );
        savedChartModel.getInfoForAvailableFilters.mockResolvedValueOnce(
            charts,
        );
        vi.mocked(projectModel.findExploresFromCache).mockResolvedValueOnce(
            explores,
        );
        const service = getMockedProjectService(lightdashConfigMock, {
            spacePermissionService: {
                resolveAccessBatch: vi.fn().mockResolvedValue(
                    charts.map((chart) => ({
                        target: { type: 'chart', chartUuid: chart.uuid },
                        context: {
                            organizationUuid:
                                account.organization.organizationUuid,
                            projectUuid: projectSummary.projectUuid,
                            inheritsFromOrgOrProject: true,
                            access: [],
                        },
                    })),
                ),
            } as unknown as SpacePermissionService,
        });
        const result = await service.getAvailableFiltersForSavedQueries(
            filterAccount,
            charts.map((chart, index) => ({
                savedChartUuid: chart.uuid,
                tileUuid: `tile-${index}`,
            })),
        );
        expect(
            result.allFilterableFields.map(({ tableLabel, label }) => ({
                tableLabel,
                label,
            })),
        ).toEqual([
            { tableLabel: 'Team at Event A', label: 'Name at Event A' },
            { tableLabel: 'Team at Event B', label: 'Name at Event B' },
        ]);
        expect(result.allFilterableMetrics.map(({ label }) => label)).toEqual([
            'Total at Event A',
            'Total at Event B',
        ]);
        expect(result.savedQueryFilters).toEqual({
            'tile-0': [0],
            'tile-1': [1],
            'tile-2': [0],
        });
        expect(result.savedQueryMetricFilters).toEqual({
            'tile-0': [0],
            'tile-1': [1],
            'tile-2': [0],
        });
    });
});

describe('dashboard available filters hidden fields', () => {
    test('returns hidden filterable field ids only from charts the user can view', async () => {
        const filterAccount = {
            ...account,
            user: {
                ...account.user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'Project', action: 'view' },
                    { subject: 'SavedChart', action: 'view' },
                ]),
            },
        } as typeof account;
        const exploreWithHidden = (name: string, table: string) => ({
            ...validExplore,
            name,
            tables: {
                [table]: {
                    ...validExplore.tables.a,
                    name: table,
                    dimensions: {
                        shown: {
                            ...validExplore.tables.a.dimensions.dim1,
                            table,
                            name: 'shown',
                        },
                        secret_dim: {
                            ...validExplore.tables.a.dimensions.dim1,
                            table,
                            name: 'secret_dim',
                            hidden: true,
                        },
                    },
                    metrics: {
                        secret_metric: {
                            ...validExplore.tables.a.metrics.met1,
                            table,
                            name: 'secret_metric',
                            hidden: true,
                        },
                    },
                },
            },
        });
        const charts = [
            ['chart-viewable', 'orders'],
            ['chart-private', 'payments'],
        ].map(([uuid, tableName]) => ({
            uuid,
            name: uuid,
            tableName,
            projectUuid: projectSummary.projectUuid,
            spaceUuid: 'space',
            dashboardUuid: null,
        }));
        savedChartModel.getInfoForAvailableFilters.mockResolvedValueOnce(
            charts,
        );
        vi.mocked(projectModel.findExploresFromCache).mockResolvedValueOnce([
            exploreWithHidden('orders', 'orders'),
            exploreWithHidden('payments', 'payments'),
        ]);
        const service = getMockedProjectService(lightdashConfigMock, {
            spacePermissionService: {
                resolveAccessBatch: vi.fn().mockResolvedValue(
                    charts.map((chart) => ({
                        target: { type: 'chart', chartUuid: chart.uuid },
                        context:
                            chart.uuid === 'chart-viewable'
                                ? {
                                      organizationUuid:
                                          account.organization.organizationUuid,
                                      projectUuid: projectSummary.projectUuid,
                                      inheritsFromOrgOrProject: true,
                                      access: [],
                                  }
                                : null,
                    })),
                ),
            } as unknown as SpacePermissionService,
        });

        const result = await service.getAvailableFiltersForSavedQueries(
            filterAccount,
            charts.map((chart) => ({
                savedChartUuid: chart.uuid,
                tileUuid: `tile-${chart.uuid}`,
            })),
        );

        expect(result.hiddenFilterableFieldIds).toEqual([
            'orders_secret_dim',
            'orders_secret_metric',
        ]);
        expect(result.allFilterableFields.map(getItemId)).toEqual([
            'orders_shown',
        ]);
    });
});

describe('Snowflake credential pins (SPK-2336)', () => {
    const pinsService = getMockedProjectService(lightdashConfigMock);
    const { projectUuid: pinsProjectUuid } = defaultProject;

    const baseSnowflakeCredentials: CreateSnowflakeCredentials = {
        type: WarehouseTypes.SNOWFLAKE,
        account: 'acct',
        user: 'project-user',
        database: 'db',
        warehouse: 'wh',
        schema: 'schema',
    };

    describe('clearSecretsFromCredentials', () => {
        const callClearSecrets = (
            credentials: CreateWarehouseCredentials,
        ): CreateWarehouseCredentials =>
            clearSecretsFromCredentials(credentials);

        test.each([
            SnowflakeAuthenticationType.PASSWORD,
            SnowflakeAuthenticationType.PRIVATE_KEY,
            SnowflakeAuthenticationType.SSO,
        ])(
            'strips every secret field and authenticationType for %s',
            (authenticationType) => {
                const credentials: CreateSnowflakeCredentials = {
                    ...baseSnowflakeCredentials,
                    authenticationType,
                    password: 'secret-password',
                    privateKey: 'secret-key',
                    privateKeyPass: 'secret-passphrase',
                    token: 'secret-token',
                    refreshToken: 'secret-refresh',
                };

                const result = callClearSecrets(credentials);

                expect(result).toEqual(baseSnowflakeCredentials);
                expect(result).not.toHaveProperty('password');
                expect(result).not.toHaveProperty('privateKey');
                expect(result).not.toHaveProperty('privateKeyPass');
                expect(result).not.toHaveProperty('token');
                expect(result).not.toHaveProperty('refreshToken');
                expect(result).not.toHaveProperty('authenticationType');
            },
        );

        test('strips the key-pair passphrase together with the key', () => {
            const credentials: CreateSnowflakeCredentials = {
                ...baseSnowflakeCredentials,
                authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                privateKey: 'secret-key',
                privateKeyPass: 'secret-passphrase',
            };

            const result = callClearSecrets(credentials);

            expect(result).not.toHaveProperty('privateKey');
            expect(result).not.toHaveProperty('privateKeyPass');
        });
    });

    describe('refreshCredentialsAndPersistRotation for Snowflake SSO', () => {
        const callRefreshAndPersist = (
            credentials: CreateSnowflakeCredentials,
            source: { kind: 'project'; projectUuid: string },
        ): Promise<CreateSnowflakeCredentials> =>
            (
                pinsService as unknown as {
                    refreshCredentialsAndPersistRotation: (
                        args: CreateSnowflakeCredentials,
                        userUuid: string,
                        s: { kind: 'project'; projectUuid: string },
                    ) => Promise<CreateSnowflakeCredentials>;
                }
            ).refreshCredentialsAndPersistRotation(
                credentials,
                'pin-user-uuid',
                source,
            );

        test('returns a fresh access token and refresh token, and persists the rotation', async () => {
            const generateSpy = vi
                .spyOn(UserService, 'generateSnowflakeAccessToken')
                .mockResolvedValueOnce({
                    accessToken: 'fresh-access-token',
                    refreshToken: 'fresh-refresh-token',
                });
            const rotateRefreshTokenMock = vi.fn(async () => true);
            (
                projectModel as unknown as {
                    rotateRefreshToken: import('vitest').Mock;
                }
            ).rotateRefreshToken = rotateRefreshTokenMock;

            const credentials: CreateSnowflakeCredentials = {
                ...baseSnowflakeCredentials,
                authenticationType: SnowflakeAuthenticationType.SSO,
                refreshToken: 'stale-refresh-token',
            };

            const result = await callRefreshAndPersist(credentials, {
                kind: 'project',
                projectUuid: pinsProjectUuid,
            });

            expect(generateSpy).toHaveBeenCalledWith('stale-refresh-token');
            expect(result).toEqual({
                ...credentials,
                authenticationType: SnowflakeAuthenticationType.SSO,
                token: 'fresh-access-token',
                refreshToken: 'fresh-refresh-token',
            });
            expect(rotateRefreshTokenMock).toHaveBeenCalledWith(
                pinsProjectUuid,
                'stale-refresh-token',
                'fresh-refresh-token',
            );

            generateSpy.mockRestore();
        });

        test('does not persist a rotation when the refresh token is unchanged', async () => {
            const generateSpy = vi
                .spyOn(UserService, 'generateSnowflakeAccessToken')
                .mockResolvedValueOnce({
                    accessToken: 'fresh-access-token',
                    refreshToken: 'same-refresh-token',
                });
            const rotateRefreshTokenMock = vi.fn(async () => true);
            (
                projectModel as unknown as {
                    rotateRefreshToken: import('vitest').Mock;
                }
            ).rotateRefreshToken = rotateRefreshTokenMock;

            const credentials: CreateSnowflakeCredentials = {
                ...baseSnowflakeCredentials,
                authenticationType: SnowflakeAuthenticationType.SSO,
                refreshToken: 'same-refresh-token',
            };

            await callRefreshAndPersist(credentials, {
                kind: 'project',
                projectUuid: pinsProjectUuid,
            });

            expect(rotateRefreshTokenMock).not.toHaveBeenCalled();

            generateSpy.mockRestore();
        });
    });

    describe('prepareCompileAdapter Snowflake SSO refresh', () => {
        test('persists token rotation before returning compile credentials', async () => {
            const projectSnowflakeCredentials: CreateSnowflakeCredentials = {
                ...baseSnowflakeCredentials,
                authenticationType: SnowflakeAuthenticationType.SSO,
                refreshToken: 'old-refresh-token',
            };
            const snowflakeProject = {
                ...projectWithSensitiveFields,
                projectUuid: pinsProjectUuid,
                dbtConnection: { type: DbtProjectType.NONE },
                warehouseConnection: projectSnowflakeCredentials,
            };
            (
                projectModel.getWithSensitiveFields as import('vitest').Mock
            ).mockResolvedValueOnce(snowflakeProject);
            projectModel.getWarehouseCredentialsForProject.mockResolvedValueOnce(
                projectSnowflakeCredentials,
            );
            (
                projectModel.getWarehouseFromCache as import('vitest').Mock
            ).mockResolvedValueOnce(undefined);

            const generateSpy = vi
                .spyOn(UserService, 'generateSnowflakeAccessToken')
                .mockResolvedValueOnce({
                    accessToken: 'new-access-token',
                    refreshToken: 'new-refresh-token',
                });
            const rotateRefreshTokenMock = vi.fn(async () => true);
            (
                projectModel as unknown as {
                    rotateRefreshToken: import('vitest').Mock;
                }
            ).rotateRefreshToken = rotateRefreshTokenMock;
            const result = await (
                pinsService as unknown as {
                    prepareCompileAdapter: (
                        uuid: string,
                        u: { userUuid: string; organizationUuid: string },
                    ) => Promise<{
                        warehouseCredentials: CreateWarehouseCredentials;
                    }>;
                }
            ).prepareCompileAdapter(pinsProjectUuid, {
                userUuid: 'pin-user-uuid',
                organizationUuid: 'pin-org-uuid',
            });

            expect(generateSpy).toHaveBeenCalledWith('old-refresh-token');
            expect(rotateRefreshTokenMock).toHaveBeenCalledWith(
                pinsProjectUuid,
                'old-refresh-token',
                'new-refresh-token',
            );
            expect(result.warehouseCredentials).toMatchObject({
                token: 'new-access-token',
                refreshToken: 'new-refresh-token',
            });

            generateSpy.mockRestore();
        });
    });

    describe('personal credential merge for Snowflake in getWarehouseCredentials', () => {
        const callGetWarehouseCredentials = () =>
            (
                pinsService as unknown as {
                    getWarehouseCredentials: (args: {
                        projectUuid: string;
                        userId: string;
                        isRegisteredUser: boolean;
                        binding: { kind: 'original' };
                    }) => Promise<CreateWarehouseCredentials>;
                }
            ).getWarehouseCredentials({
                projectUuid: pinsProjectUuid,
                userId: 'pin-user-uuid',
                isRegisteredUser: true,
                binding: { kind: 'original' },
            });

        test.each([
            SnowflakeAuthenticationType.PASSWORD,
            SnowflakeAuthenticationType.PRIVATE_KEY,
        ])(
            'a personal %s credential overrides the project credential, with no project secret leaking through',
            async (personalAuthType) => {
                const projectCredentials: CreateSnowflakeCredentials = {
                    ...baseSnowflakeCredentials,
                    authenticationType: SnowflakeAuthenticationType.PASSWORD,
                    password: 'project-secret-password',
                    requireUserCredentials: true,
                };
                (
                    projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
                ).mockResolvedValueOnce(projectCredentials);
                (
                    projectModel.getProjectWarehouseConfig as import('vitest').Mock
                ).mockResolvedValueOnce({
                    organizationWarehouseCredentialsUuid: null,
                    queryTimezone: null,
                });

                const personalCredentials = {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: personalAuthType,
                    user: 'personal-user',
                    ...(personalAuthType ===
                    SnowflakeAuthenticationType.PASSWORD
                        ? { password: 'personal-secret-password' }
                        : { privateKey: 'personal-secret-key' }),
                };
                (
                    pinsService as unknown as {
                        userWarehouseCredentialsModel: {
                            findForProjectWithSecrets: import('vitest').Mock;
                        };
                    }
                ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                    vi.fn(async () => ({
                        uuid: 'personal-creds-uuid',
                        credentials: personalCredentials,
                    }));

                const result = await callGetWarehouseCredentials();

                expect(result).toMatchObject({
                    authenticationType: personalAuthType,
                    user: 'personal-user',
                });
                expect(JSON.stringify(result)).not.toContain(
                    'project-secret-password',
                );
            },
        );

        test('a personal SSO credential overrides the project credential and is itself refreshed', async () => {
            const projectCredentials: CreateSnowflakeCredentials = {
                ...baseSnowflakeCredentials,
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
                password: 'project-secret-password',
                requireUserCredentials: true,
            };
            (
                projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
            ).mockResolvedValueOnce(projectCredentials);
            (
                projectModel.getProjectWarehouseConfig as import('vitest').Mock
            ).mockResolvedValueOnce({
                organizationWarehouseCredentialsUuid: null,
                queryTimezone: null,
            });

            const personalCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                authenticationType: SnowflakeAuthenticationType.SSO,
                user: 'personal-user',
                refreshToken: 'personal-stale-refresh-token',
            };
            (
                pinsService as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets = vi.fn(
                async () => ({
                    uuid: 'personal-creds-uuid',
                    credentials: personalCredentials,
                }),
            );
            const rotateRefreshTokenMock = vi.fn(async () => true);
            (
                pinsService as unknown as {
                    userWarehouseCredentialsModel: {
                        rotateRefreshToken: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.rotateRefreshToken =
                rotateRefreshTokenMock;
            const generateSpy = vi
                .spyOn(UserService, 'generateSnowflakeAccessToken')
                .mockResolvedValueOnce({
                    accessToken: 'personal-fresh-access-token',
                    refreshToken: 'personal-fresh-refresh-token',
                });

            const result = await callGetWarehouseCredentials();

            expect(generateSpy).toHaveBeenCalledWith(
                'personal-stale-refresh-token',
            );
            expect(result).toMatchObject({
                authenticationType: SnowflakeAuthenticationType.SSO,
                user: 'personal-user',
                token: 'personal-fresh-access-token',
                refreshToken: 'personal-fresh-refresh-token',
            });
            expect(rotateRefreshTokenMock).toHaveBeenCalledWith(
                'personal-creds-uuid',
                'personal-stale-refresh-token',
                'personal-fresh-refresh-token',
            );
            expect(JSON.stringify(result)).not.toContain(
                'project-secret-password',
            );

            generateSpy.mockRestore();
        });
    });
});

describe('Personal-credential merge pins across warehouse types (SPK-2338)', () => {
    const pinsService = getMockedProjectService(lightdashConfigMock);
    const { projectUuid: pinsProjectUuid } = defaultProject;

    const setupProjectCredentials = (
        credentials: CreateWarehouseCredentials,
    ) => {
        (
            projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
        ).mockResolvedValueOnce(credentials);
        (
            projectModel.getProjectWarehouseConfig as import('vitest').Mock
        ).mockResolvedValueOnce({
            organizationWarehouseCredentialsUuid: null,
            queryTimezone: null,
        });
    };

    const setupPersonalCredentials = (personalCredentials: unknown) => {
        (
            pinsService as unknown as {
                userWarehouseCredentialsModel: {
                    findForProjectWithSecrets: import('vitest').Mock;
                };
            }
        ).userWarehouseCredentialsModel.findForProjectWithSecrets = vi.fn(
            async () => ({
                uuid: 'personal-creds-uuid',
                credentials: personalCredentials,
            }),
        );
    };

    const callGetWarehouseCredentials =
        (): Promise<CreateWarehouseCredentials> =>
            (
                pinsService as unknown as {
                    getWarehouseCredentials: (args: {
                        projectUuid: string;
                        userId: string;
                        isRegisteredUser: boolean;
                        binding: { kind: 'original' };
                    }) => Promise<CreateWarehouseCredentials>;
                }
            ).getWarehouseCredentials({
                projectUuid: pinsProjectUuid,
                userId: 'pin-user-uuid',
                isRegisteredUser: true,
                binding: { kind: 'original' },
            });

    describe('Postgres', () => {
        test('a personal credential overrides the project user and password; non-secret project fields survive; no project secret leaks', async () => {
            const projectCredentials: CreatePostgresCredentials = {
                type: WarehouseTypes.POSTGRES,
                host: 'project-host',
                user: 'project-user',
                password: 'project-secret-password',
                port: 5432,
                dbname: 'project-db',
                schema: 'public',
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials({
                type: WarehouseTypes.POSTGRES,
                user: 'personal-user',
                password: 'personal-secret-password',
            });

            const result = await callGetWarehouseCredentials();

            expect(result).toMatchObject({
                user: 'personal-user',
                password: 'personal-secret-password',
                host: 'project-host',
                dbname: 'project-db',
            });
            expect(JSON.stringify(result)).not.toContain(
                'project-secret-password',
            );
        });
    });

    describe('Trino', () => {
        test('a personal credential overrides the project user and password; non-secret project fields survive; no project secret leaks', async () => {
            const projectCredentials: CreateTrinoCredentials = {
                type: WarehouseTypes.TRINO,
                host: 'project-host',
                user: 'project-user',
                password: 'project-secret-password',
                port: 8080,
                dbname: 'project-db',
                schema: 'public',
                http_scheme: 'https',
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials({
                type: WarehouseTypes.TRINO,
                user: 'personal-user',
                password: 'personal-secret-password',
            });

            const result = await callGetWarehouseCredentials();

            expect(result).toMatchObject({
                user: 'personal-user',
                password: 'personal-secret-password',
                host: 'project-host',
                dbname: 'project-db',
            });
            expect(JSON.stringify(result)).not.toContain(
                'project-secret-password',
            );
        });
    });

    describe('ClickHouse', () => {
        test('a personal credential overrides the project user and password; non-secret project fields survive; no project secret leaks', async () => {
            const projectCredentials: CreateClickhouseCredentials = {
                type: WarehouseTypes.CLICKHOUSE,
                host: 'project-host',
                user: 'project-user',
                password: 'project-secret-password',
                port: 8123,
                schema: 'default',
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials({
                type: WarehouseTypes.CLICKHOUSE,
                user: 'personal-user',
                password: 'personal-secret-password',
            });

            const result = await callGetWarehouseCredentials();

            expect(result).toMatchObject({
                user: 'personal-user',
                password: 'personal-secret-password',
                host: 'project-host',
            });
            expect(JSON.stringify(result)).not.toContain(
                'project-secret-password',
            );
        });
    });

    describe('Snowflake', () => {
        test.each([
            SnowflakeAuthenticationType.PASSWORD,
            SnowflakeAuthenticationType.PRIVATE_KEY,
        ])(
            'a personal %s credential overrides the project credential; no project secret leaks',
            async (personalAuthType) => {
                const projectCredentials: CreateSnowflakeCredentials = {
                    type: WarehouseTypes.SNOWFLAKE,
                    account: 'acct',
                    user: 'project-user',
                    database: 'db',
                    warehouse: 'wh',
                    schema: 'schema',
                    authenticationType: SnowflakeAuthenticationType.PASSWORD,
                    password: 'project-secret-password',
                    privateKey: 'project-secret-private-key',
                    privateKeyPass: 'project-secret-private-key-pass',
                    token: 'project-secret-token',
                    refreshToken: 'project-secret-refresh-token',
                    requireUserCredentials: true,
                };
                setupProjectCredentials(projectCredentials);
                setupPersonalCredentials({
                    type: WarehouseTypes.SNOWFLAKE,
                    user: 'personal-user',
                    authenticationType: personalAuthType,
                    ...(personalAuthType ===
                    SnowflakeAuthenticationType.PASSWORD
                        ? { password: 'personal-secret-password' }
                        : { privateKey: 'personal-secret-key' }),
                });

                const result = await callGetWarehouseCredentials();

                expect(result).toMatchObject({
                    user: 'personal-user',
                    authenticationType: personalAuthType,
                });
                const serialized = JSON.stringify(result);
                expect(serialized).not.toContain('project-secret-password');
                expect(serialized).not.toContain('project-secret-private-key');
                expect(serialized).not.toContain('project-secret-token');
                expect(serialized).not.toContain(
                    'project-secret-refresh-token',
                );
            },
        );
    });

    describe('BigQuery', () => {
        test.each([
            BigqueryAuthenticationType.PRIVATE_KEY,
            BigqueryAuthenticationType.SSO,
        ])(
            'a personal %s keyfile overrides the project keyfile; the project keyfile never leaks',
            async (personalAuthType) => {
                const projectCredentials: CreateBigqueryCredentials = {
                    type: WarehouseTypes.BIGQUERY,
                    project: 'project-gcp-project',
                    dataset: 'project-dataset',
                    timeoutSeconds: undefined,
                    priority: undefined,
                    keyfileContents: {
                        private_key: 'project-secret-key',
                    },
                    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
                    requireUserCredentials: true,
                    retries: undefined,
                    location: undefined,
                    maximumBytesBilled: undefined,
                };
                setupProjectCredentials(projectCredentials);
                setupPersonalCredentials({
                    type: WarehouseTypes.BIGQUERY,
                    authenticationType: personalAuthType,
                    keyfileContents: {
                        client_email: 'personal-secret-email',
                    },
                });

                const result = await callGetWarehouseCredentials();

                expect(result).toMatchObject({
                    authenticationType: personalAuthType,
                    keyfileContents: {
                        client_email: 'personal-secret-email',
                    },
                });
                expect(JSON.stringify(result)).not.toContain(
                    'project-secret-key',
                );
            },
        );
    });

    describe('Databricks', () => {
        test('a personal access token overrides project OAuth credentials; project connection details survive', async () => {
            const projectCredentials: CreateDatabricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                database: 'project-schema',
                serverHostName: 'project-host.cloud.databricks.com',
                httpPath: '/sql/1.0/warehouses/project',
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                oauthClientId: 'project-oauth-client',
                oauthClientSecret: 'project-oauth-secret',
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials({
                type: WarehouseTypes.DATABRICKS,
                authenticationType:
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                personalAccessToken: 'personal-secret-token',
            });

            const result = await callGetWarehouseCredentials();

            expect(result).toMatchObject({
                authenticationType:
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                personalAccessToken: 'personal-secret-token',
                serverHostName: 'project-host.cloud.databricks.com',
                httpPath: '/sql/1.0/warehouses/project',
                database: 'project-schema',
            });
        });

        test('clearSecretsFromCredentials never strips oauthClientId/oauthClientSecret, so a project OAuth secret survives untouched when a personal access-token credential does not set those fields', async () => {
            const projectCredentials: CreateDatabricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                database: 'project-schema',
                serverHostName: 'project-host.cloud.databricks.com',
                httpPath: '/sql/1.0/warehouses/project',
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                oauthClientId: 'project-oauth-client',
                oauthClientSecret: 'project-oauth-secret',
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials({
                type: WarehouseTypes.DATABRICKS,
                authenticationType:
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                personalAccessToken: 'personal-secret-token',
            });

            const result = await callGetWarehouseCredentials();

            expect(result).toMatchObject({
                oauthClientId: 'project-oauth-client',
                oauthClientSecret: 'project-oauth-secret',
            });
        });
    });

    describe('Redshift (F4 shape: assumeRoleArn)', () => {
        test('clears the project assumeRoleArn, and a password-only personal credential does not restore it', async () => {
            const projectCredentials: CreateRedshiftCredentials = {
                type: WarehouseTypes.REDSHIFT,
                host: 'project-host',
                user: 'project-user',
                password: 'project-secret-password',
                port: 5439,
                dbname: 'project-db',
                schema: 'public',
                authenticationType: RedshiftAuthenticationType.PASSWORD,
                assumeRoleArn: 'arn:aws:iam::111111111111:role/project-role',
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials({
                type: WarehouseTypes.REDSHIFT,
                user: 'personal-user',
                password: 'personal-secret-password',
            });

            const result = await callGetWarehouseCredentials();

            expect(result).toMatchObject({
                user: 'personal-user',
                password: 'personal-secret-password',
                assumeRoleArn: '',
            });
            expect(JSON.stringify(result)).not.toContain(
                'project-secret-password',
            );
        });

        test('an IAM-role personal credential supplies its own assumeRoleArn', async () => {
            const projectCredentials: CreateRedshiftCredentials = {
                type: WarehouseTypes.REDSHIFT,
                host: 'project-host',
                user: 'project-user',
                password: 'project-secret-password',
                port: 5439,
                dbname: 'project-db',
                schema: 'public',
                authenticationType: RedshiftAuthenticationType.PASSWORD,
                assumeRoleArn: 'arn:aws:iam::111111111111:role/project-role',
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials({
                type: WarehouseTypes.REDSHIFT,
                user: 'personal-user',
                authenticationType: RedshiftAuthenticationType.IAM,
                accessKeyId: 'personal-access-key-id',
                secretAccessKey: 'personal-secret-access-key',
                sessionToken: 'personal-session-token',
                assumeRoleArn: 'arn:aws:iam::222222222222:role/personal-role',
            });

            const result = await callGetWarehouseCredentials();

            expect(result).toMatchObject({
                user: 'personal-user',
                authenticationType: RedshiftAuthenticationType.IAM,
                assumeRoleArn: 'arn:aws:iam::222222222222:role/personal-role',
            });
            expect(JSON.stringify(result)).not.toContain(
                'project-secret-password',
            );
        });
    });

    describe('Athena (F4 shape: assumeRoleArn)', () => {
        test("keeps the project's assumeRoleArn when the personal credential only supplies access keys", async () => {
            const projectCredentials: CreateAthenaCredentials = {
                type: WarehouseTypes.ATHENA,
                region: 'us-east-1',
                database: 'AwsDataCatalog',
                schema: 'project-schema',
                s3StagingDir: 's3://bucket/staging/',
                authenticationType: AthenaAuthenticationType.ACCESS_KEY,
                accessKeyId: 'project-access-key-id',
                secretAccessKey: 'project-secret-access-key',
                assumeRoleArn: 'arn:aws:iam::111111111111:role/project-role',
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials({
                type: WarehouseTypes.ATHENA,
                accessKeyId: 'personal-access-key-id',
                secretAccessKey: 'personal-secret-access-key',
            });

            const result = await callGetWarehouseCredentials();

            expect(result).toMatchObject({
                accessKeyId: 'personal-access-key-id',
                secretAccessKey: 'personal-secret-access-key',
                assumeRoleArn: 'arn:aws:iam::111111111111:role/project-role',
            });
            expect(JSON.stringify(result)).not.toContain(
                'project-secret-access-key',
            );
        });
    });

    describe('MotherDuck', () => {
        test('a personal token overrides the project token; non-secret project fields survive; no project secret leaks', async () => {
            const projectCredentials: CreateDuckdbMotherduckCredentials = {
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.MOTHERDUCK,
                database: 'project-database',
                schema: 'project-schema',
                token: 'project-secret-token',
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials({
                type: WarehouseTypes.DUCKDB,
                token: 'personal-secret-token',
            });

            const result = await callGetWarehouseCredentials();

            expect(result).toMatchObject({
                token: 'personal-secret-token',
                database: 'project-database',
                schema: 'project-schema',
            });
            expect(JSON.stringify(result)).not.toContain(
                'project-secret-token',
            );
        });
    });

    describe('requireUserCredentials and optional personal credentials', () => {
        test('requireUserCredentials false, and the warehouse does not support optional credentials: the personal credential model is never queried', async () => {
            const projectCredentials: CreatePostgresCredentials = {
                type: WarehouseTypes.POSTGRES,
                host: 'project-host',
                user: 'project-user',
                password: 'project-secret-password',
                port: 5432,
                dbname: 'project-db',
                schema: 'public',
                requireUserCredentials: false,
            };
            setupProjectCredentials(projectCredentials);
            const findForProjectWithSecretsMock = vi.fn(async () => undefined);
            (
                pinsService as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets =
                findForProjectWithSecretsMock;

            const result = await callGetWarehouseCredentials();

            expect(findForProjectWithSecretsMock).not.toHaveBeenCalled();
            expect(result).toMatchObject({ user: 'project-user' });
        });

        test('requireUserCredentials false, but the warehouse supports optional credentials: a personal credential is still merged in', async () => {
            const projectCredentials: CreateDatabricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                database: 'project-schema',
                serverHostName: 'project-host.cloud.databricks.com',
                httpPath: '/sql/1.0/warehouses/project',
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                oauthClientId: 'project-oauth-client',
                oauthClientSecret: 'project-oauth-secret',
                requireUserCredentials: false,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials({
                type: WarehouseTypes.DATABRICKS,
                authenticationType:
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                personalAccessToken: 'personal-secret-token',
            });

            const result = await callGetWarehouseCredentials();

            expect(result).toMatchObject({
                authenticationType:
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                personalAccessToken: 'personal-secret-token',
            });
        });

        test('requireUserCredentials true with no personal credential found throws for a non-Databricks type', async () => {
            const projectCredentials: CreatePostgresCredentials = {
                type: WarehouseTypes.POSTGRES,
                host: 'project-host',
                user: 'project-user',
                password: 'project-secret-password',
                port: 5432,
                dbname: 'project-db',
                schema: 'public',
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            setupPersonalCredentials(undefined);
            (
                pinsService as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets = vi.fn(
                async () => undefined,
            );

            await expect(callGetWarehouseCredentials()).rejects.toBeInstanceOf(
                MissingWarehouseCredentialsError,
            );
        });

        test('requireUserCredentials true with no personal credential found throws DatabricksTokenError for Databricks', async () => {
            const projectCredentials: CreateDatabricksCredentials = {
                type: WarehouseTypes.DATABRICKS,
                database: 'project-schema',
                serverHostName: 'project-host.cloud.databricks.com',
                httpPath: '/sql/1.0/warehouses/project',
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                requireUserCredentials: true,
            };
            setupProjectCredentials(projectCredentials);
            (
                pinsService as unknown as {
                    userWarehouseCredentialsModel: {
                        findForProjectWithSecrets: import('vitest').Mock;
                    };
                }
            ).userWarehouseCredentialsModel.findForProjectWithSecrets = vi.fn(
                async () => undefined,
            );

            await expect(callGetWarehouseCredentials()).rejects.toBeInstanceOf(
                DatabricksTokenError,
            );
        });
    });
});

describe('preview BigQuery SSO credentials', () => {
    const upstreamProjectUuid = 'upstream-project-uuid';
    const previewProjectUuid = 'preview-project-uuid';
    const bigquerySso = (refreshToken: string): CreateBigqueryCredentials => ({
        type: WarehouseTypes.BIGQUERY,
        authenticationType: BigqueryAuthenticationType.SSO,
        project: 'analytics',
        dataset: 'prod',
        timeoutSeconds: undefined,
        priority: undefined,
        retries: undefined,
        location: undefined,
        maximumBytesBilled: undefined,
        keyfileContents: {
            type: 'authorized_user',
            client_id: 'lightdash-client',
            client_secret: 'secret',
            refresh_token: refreshToken,
        },
    });
    const refreshTokenOf = (credentials: CreateWarehouseCredentials | null) =>
        credentials?.type === WarehouseTypes.BIGQUERY
            ? credentials.keyfileContents.refresh_token
            : undefined;

    let syncEnabled = true;
    const stored = new Map<string, CreateWarehouseCredentials>();
    const previewOwns = new Map<string, boolean>();
    const tokenStatus = new Map<string, 'valid' | 'rejected'>();
    const checkRefreshToken = vi.fn<CheckGoogleRefreshToken>(
        async (keyfile) => tokenStatus.get(keyfile.refresh_token) ?? 'valid',
    );
    const updateIf = (
        projectUuid: string,
        update: (
            credentials: CreateWarehouseCredentials,
        ) => CreateWarehouseCredentials | null,
    ) => {
        const current = stored.get(projectUuid);
        const next = current ? update(current) : null;
        if (next) stored.set(projectUuid, next);
        return next !== null;
    };
    const model = {
        ...singleRouteProjectModelMethods,
        getProjectWarehouseConfig: vi.fn(async () => ({
            organizationWarehouseCredentialsUuid: null,
        })),
        getWarehouseCredentialsForProject: vi.fn(async (projectUuid: string) =>
            stored.get(projectUuid),
        ),
        getSummary: vi.fn(async (projectUuid: string) =>
            projectUuid === previewProjectUuid
                ? {
                      ...projectSummary,
                      projectUuid,
                      name: 'My preview',
                      type: ProjectType.PREVIEW,
                      upstreamProjectUuid,
                  }
                : { ...projectSummary, projectUuid, name: 'Production' },
        ),
        updateWarehouseCredentialsIf: vi.fn(async (projectUuid, update) =>
            updateIf(projectUuid, update),
        ),
        updateAndPushToPreviews: vi.fn(
            async (
                projectUuid: string,
                data: UpdateProject,
                pushToPreview: PushToPreview,
            ): Promise<PreviewCredentialsPush> => {
                const previousUpstreamCredentials = stored.get(projectUuid);
                stored.set(projectUuid, data.warehouseConnection);
                if (
                    !previousUpstreamCredentials ||
                    projectUuid !== upstreamProjectUuid
                ) {
                    return { kind: 'skipped' };
                }
                const pushed = updateIf(
                    previewProjectUuid,
                    (previewCredentials) =>
                        pushToPreview({
                            previewCredentials,
                            previousUpstreamCredentials,
                        }),
                );
                return {
                    kind: 'pushed',
                    previewProjectUuids: pushed ? [previewProjectUuid] : [],
                };
            },
        ),
        getWithSensitiveFields: vi.fn(async (projectUuid: string) => ({
            ...projectWithSensitiveFields,
            projectUuid,
            ...(projectUuid === previewProjectUuid
                ? { type: ProjectType.PREVIEW, upstreamProjectUuid }
                : {}),
            warehouseConnection: stored.get(projectUuid),
        })),
        getPreviewOwnsCredentials: vi.fn(
            async (projectUuid: string) => previewOwns.get(projectUuid) ?? null,
        ),
        setPreviewOwnsCredentials: vi.fn(
            async (projectUuid: string, owns: boolean) => {
                previewOwns.set(projectUuid, owns);
            },
        ),
        update: vi.fn(async (projectUuid: string, data: UpdateProject) => {
            stored.set(projectUuid, data.warehouseConnection);
        }),
    };
    const readProjectWithSensitiveFields =
        model.getWithSensitiveFields.getMockImplementation()!;
    const service = getMockedProjectService(lightdashConfigMock, {
        featureFlagModel: {
            get: vi.fn(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled:
                    featureFlagId === FeatureFlags.PreviewSsoCredentialSync &&
                    syncEnabled,
            })),
        } as unknown as FeatureFlagModel,
    });
    Object.assign(service, {
        projectModel: model,
        checkGoogleRefreshToken: checkRefreshToken,
    });
    const getPreviewCredentials = () =>
        (
            service as unknown as {
                getWarehouseCredentials: (args: {
                    projectUuid: string;
                    userId: string;
                    isRegisteredUser: boolean;
                    binding: { kind: 'original' };
                }) => Promise<CreateWarehouseCredentials>;
            }
        ).getWarehouseCredentials({
            projectUuid: previewProjectUuid,
            userId: sessionAccount.user.id,
            isRegisteredUser: true,
            binding: { kind: 'original' },
        });
    const reconnectUpstream = (refreshToken: string) =>
        service.updateWarehouseCredentials(upstreamProjectUuid, account, {
            warehouseConnection: bigquerySso(refreshToken),
        });

    beforeEach(() => {
        vi.clearAllMocks();
        model.getWithSensitiveFields.mockImplementation(
            readProjectWithSensitiveFields,
        );
        syncEnabled = true;
        stored.clear();
        previewOwns.clear();
        tokenStatus.clear();
        stored.set(upstreamProjectUuid, bigquerySso('token-a'));
        stored.set(previewProjectUuid, bigquerySso('token-a'));
    });

    test('a preview created with token A still works after the parent reconnects with token B', async () => {
        await reconnectUpstream('token-b');
        tokenStatus.set('token-a', 'rejected');

        expect(refreshTokenOf(stored.get(previewProjectUuid)!)).toBe('token-b');
        expect(refreshTokenOf(await getPreviewCredentials())).toBe('token-b');
        expect(model.updateWarehouseCredentialsIf).not.toHaveBeenCalled();
    });

    test('save and test on the parent pushes the new token too', async () => {
        Object.assign(service, {
            schedulerClient: {
                testAndCompileProject: vi.fn(async () => undefined),
            },
        });

        await service.updateAndScheduleAsyncWork(
            upstreamProjectUuid,
            account,
            {
                name: 'Production',
                dbtConnection: { type: DbtProjectType.NONE },
                dbtVersion: DefaultSupportedDbtVersion,
                warehouseConnection: bigquerySso('token-b'),
            },
            RequestMethod.WEB_APP,
        );

        expect(refreshTokenOf(stored.get(previewProjectUuid)!)).toBe('token-b');
    });

    test('two saves that both started from token A leave the preview on the parent token', async () => {
        let releaseReads = () => {};
        const bothSavesRead = new Promise<void>((resolve) => {
            releaseReads = resolve;
        });
        let reads = 0;
        model.getWithSensitiveFields.mockImplementation(
            async (projectUuid: string) => {
                const project =
                    await readProjectWithSensitiveFields(projectUuid);
                reads += 1;
                if (reads === 2) releaseReads();
                await bothSavesRead;
                return project;
            },
        );

        await Promise.all([
            reconnectUpstream('token-b'),
            reconnectUpstream('token-c'),
        ]);

        const parentToken = refreshTokenOf(stored.get(upstreamProjectUuid)!);
        expect(['token-b', 'token-c']).toContain(parentToken);
        expect(refreshTokenOf(stored.get(previewProjectUuid)!)).toBe(
            parentToken,
        );
    });

    test('a failed push to previews keeps the parent save', async () => {
        model.updateAndPushToPreviews.mockImplementationOnce(
            async (projectUuid: string, data: UpdateProject) => {
                stored.set(projectUuid, data.warehouseConnection);
                return { kind: 'failed', error: new Error('preview locked') };
            },
        );

        await expect(reconnectUpstream('token-b')).resolves.not.toThrow();

        expect(refreshTokenOf(stored.get(upstreamProjectUuid)!)).toBe(
            'token-b',
        );
        expect(refreshTokenOf(stored.get(previewProjectUuid)!)).toBe('token-a');
    });

    test('a preview with its own different credential is untouched', async () => {
        stored.set(previewProjectUuid, bigquerySso('own-token'));

        await reconnectUpstream('token-b');

        expect(refreshTokenOf(stored.get(previewProjectUuid)!)).toBe(
            'own-token',
        );
        expect(refreshTokenOf(await getPreviewCredentials())).toBe('own-token');
        expect(model.updateWarehouseCredentialsIf).not.toHaveBeenCalled();
    });

    test('the retry repairs a stale preview once and does not loop', async () => {
        stored.set(upstreamProjectUuid, bigquerySso('token-b'));
        tokenStatus.set('token-a', 'rejected');

        expect(refreshTokenOf(await getPreviewCredentials())).toBe('token-b');
        expect(refreshTokenOf(stored.get(previewProjectUuid)!)).toBe('token-b');
        expect(checkRefreshToken).toHaveBeenCalledTimes(2);
        expect(model.updateWarehouseCredentialsIf).toHaveBeenCalledTimes(1);

        checkRefreshToken.mockClear();
        expect(refreshTokenOf(await getPreviewCredentials())).toBe('token-b');
        expect(checkRefreshToken).toHaveBeenCalledTimes(1);
        expect(model.updateWarehouseCredentialsIf).toHaveBeenCalledTimes(1);
    });

    test('a preview that shares an expired token with its parent names the parent project', async () => {
        tokenStatus.set('token-a', 'rejected');

        await expect(getPreviewCredentials()).rejects.toThrow(
            "This preview's warehouse sign-in expired. Reconnect the warehouse on Production.",
        );
        expect(checkRefreshToken).toHaveBeenCalledTimes(1);
    });

    test('a concurrent change to the preview credential wins over the repair', async () => {
        stored.set(upstreamProjectUuid, bigquerySso('token-b'));
        tokenStatus.set('token-a', 'rejected');
        model.updateWarehouseCredentialsIf.mockImplementationOnce(
            async (projectUuid, update) => {
                stored.set(projectUuid, bigquerySso('token-c'));
                return updateIf(projectUuid, update);
            },
        );

        expect(refreshTokenOf(await getPreviewCredentials())).toBe('token-c');
        expect(refreshTokenOf(stored.get(previewProjectUuid)!)).toBe('token-c');
    });

    test('the repair skips a preview that owns its credential', async () => {
        stored.set(upstreamProjectUuid, bigquerySso('token-b'));
        previewOwns.set(previewProjectUuid, true);
        tokenStatus.set('token-a', 'rejected');

        expect(refreshTokenOf(await getPreviewCredentials())).toBe('token-a');
        expect(checkRefreshToken).not.toHaveBeenCalled();
        expect(model.updateWarehouseCredentialsIf).not.toHaveBeenCalled();
    });

    test('saving a credential on the preview records whether the preview owns it', async () => {
        const saveOnPreview = (refreshToken: string) =>
            service.updateWarehouseCredentials(previewProjectUuid, account, {
                warehouseConnection: bigquerySso(refreshToken),
            });

        await saveOnPreview('own-token');
        expect(previewOwns.get(previewProjectUuid)).toBe(true);

        await saveOnPreview('token-a');
        expect(previewOwns.get(previewProjectUuid)).toBe(false);
    });

    test('a stale preview whose parent sign-in expired too names the parent project', async () => {
        stored.set(upstreamProjectUuid, bigquerySso('token-b'));
        tokenStatus.set('token-a', 'rejected');
        tokenStatus.set('token-b', 'rejected');

        const error = await getPreviewCredentials().catch((e) => e);

        expect(error).toBeInstanceOf(PreviewWarehouseSignInExpiredError);
        expect(error.message).toBe(
            "This preview's warehouse sign-in expired. Reconnect the warehouse on Production.",
        );
        expect(error.data).toEqual({
            upstreamProjectUuid,
            upstreamProjectName: 'Production',
        });
        expect(checkRefreshToken).toHaveBeenCalledTimes(2);
        expect(model.updateWarehouseCredentialsIf).not.toHaveBeenCalled();
    });

    test('the kill switch turns off both the push and the repair', async () => {
        syncEnabled = false;
        tokenStatus.set('token-a', 'rejected');

        await reconnectUpstream('token-b');

        expect(refreshTokenOf(await getPreviewCredentials())).toBe('token-a');
        expect(model.updateAndPushToPreviews).not.toHaveBeenCalled();
        expect(model.update).toHaveBeenCalledTimes(1);
        expect(checkRefreshToken).not.toHaveBeenCalled();
    });
});

describe('ProjectService expired shared sign-in', () => {
    const { projectUuid } = projectSummary;
    const credentials = {
        type: WarehouseTypes.BIGQUERY,
        project: 'analytics',
        dataset: 'marts',
        authenticationType: BigqueryAuthenticationType.SSO,
        keyfileContents: {
            type: 'authorized_user',
            refresh_token: 'shared-token',
        },
    } as unknown as CreateWarehouseCredentials;
    const stored = {
        provider: PersonSignInProvider.GOOGLE,
        subject: { userUuid: 'subject-uuid', name: 'Sam Rivera' },
        basis: SignInSubjectBasis.RECORDED,
    };
    const flagged = (enabled: boolean) =>
        ({
            get: vi.fn(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    id: featureFlagId,
                    enabled,
                }),
            ),
        }) as unknown as FeatureFlagModel;
    const model = projectModel as unknown as {
        getSharedSignInSubjectForToken: ReturnType<typeof vi.fn>;
        getWarehouseClientFromCredentials: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        model.getSharedSignInSubjectForToken = vi.fn(async () => stored);
        model.getWarehouseClientFromCredentials.mockImplementation(() => ({
            credentials,
            runQuery: vi.fn(async () => {
                throw new BigqueryTokenError('Google rejected the token');
            }),
        }));
    });

    const queryWith = async (enabled: boolean) => {
        const service = getMockedProjectService(lightdashConfigMock, {
            featureFlagModel: flagged(enabled),
        });
        const { warehouseClient } =
            await service.warehouseClientFactory.acquireUnscoped(
                `${projectUuid}-${Math.random()}`,
                credentials,
            );
        return (warehouseClient.runQuery as (sql: string) => Promise<unknown>)(
            'select 1',
        );
    };

    test('keeps attribution for a rejected token until the viewer is known', async () => {
        await expect(queryWith(true)).rejects.toMatchObject({
            name: 'BigqueryTokenError',
            message:
                "This project's connection uses a Google sign-in that has expired. Ask a project admin to reconnect it in Project settings → Connection settings.",
            data: {
                sharedSignIn: {
                    provider: PersonSignInProvider.GOOGLE,
                    subjectUserUuid: 'subject-uuid',
                    subjectName: 'Sam Rivera',
                    subjectBasis: SignInSubjectBasis.RECORDED,
                },
            },
        });
    });

    test('leaves the original error when the kill switch is off', async () => {
        await expect(queryWith(false)).rejects.toThrow(
            'Google rejected the token',
        );
    });

    test('does not attribute a personal credential', async () => {
        model.getSharedSignInSubjectForToken.mockResolvedValueOnce(null);
        await expect(queryWith(true)).rejects.toThrow(
            'Google rejected the token',
        );
    });

    test('attributes a rejected refresh from the project credential', async () => {
        const refreshCredentials = {
            type: WarehouseTypes.SNOWFLAKE,
            authenticationType: SnowflakeAuthenticationType.SSO,
            refreshToken: 'shared-token',
        } as CreateWarehouseCredentials;
        model.getSharedSignInSubjectForToken.mockResolvedValueOnce({
            provider: PersonSignInProvider.SNOWFLAKE,
            subject: stored.subject,
            basis: SignInSubjectBasis.RECORDED,
        });
        const service = getMockedProjectService(lightdashConfigMock, {
            featureFlagModel: flagged(true),
        });
        vi.spyOn(
            UserService,
            'generateSnowflakeAccessToken',
        ).mockRejectedValueOnce(
            new SnowflakeTokenError('Snowflake rejected the token'),
        );
        const refresh = service as unknown as {
            refreshCredentialsAndPersistRotation: (
                args: CreateWarehouseCredentials,
                userUuid: string,
                source: { kind: 'project'; projectUuid: string },
            ) => Promise<CreateWarehouseCredentials>;
        };
        await expect(
            refresh.refreshCredentialsAndPersistRotation(
                refreshCredentials,
                'viewer',
                { kind: 'project', projectUuid },
            ),
        ).rejects.toMatchObject({
            name: 'SnowflakeTokenError',
            data: { sharedSignIn: { subjectUserUuid: 'subject-uuid' } },
        });
    });
});

describe('ProjectService.reconnectSharedSignIn', () => {
    const adminAccount = {
        ...developerAccount,
        user: {
            ...developerAccount.user,
            id: 'project-admin',
        },
    } as typeof developerAccount;
    const credentials = {
        type: WarehouseTypes.BIGQUERY,
        project: 'analytics',
        dataset: 'marts',
        authenticationType: BigqueryAuthenticationType.SSO,
        timeoutSeconds: 300,
        priority: 'interactive',
        retries: 3,
        location: undefined,
        maximumBytesBilled: undefined,
        keyfileContents: {
            type: 'authorized_user',
            client_id: 'original-client',
            client_secret: 'original-secret',
            refresh_token: 'expired-token',
        },
    } as CreateBigqueryCredentials;
    const model = projectModel as unknown as {
        getSharedSignInSubjectForToken: ReturnType<typeof vi.fn>;
    };
    const grant = { getRefreshToken: vi.fn(async () => 'new-token') };
    const flag = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled: featureFlagId === FeatureFlags.SharedSignInReconnect,
        })),
    };
    const service = getMockedProjectService(lightdashConfigMock, {
        featureFlagModel: flag as unknown as FeatureFlagModel,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(service, { userOAuthGrantsModel: grant });
        grant.getRefreshToken.mockResolvedValue('new-token');
        projectModel.getWithSensitiveFields.mockResolvedValue({
            ...projectWithSensitiveFields,
            warehouseConnection: credentials,
            organizationWarehouseCredentialsUuid: undefined,
        } as never);
        model.getSharedSignInSubjectForToken = vi.fn(async () => ({
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: developerAccount.user.id, name: 'Owner' },
            basis: SignInSubjectBasis.RECORDED,
        }));
        vi.spyOn(UserService, 'generateGoogleAccessToken').mockResolvedValue(
            'access-token',
        );
    });

    test('resolves the keyfile and leaves other project fields to the locked write', async () => {
        await service.reconnectSharedSignIn(
            developerAccount,
            projectSummary.projectUuid,
        );
        expect(projectModel.reconnectSharedSignIn).toHaveBeenCalledWith(
            projectSummary.projectUuid,
            'expired-token',
            developerAccount.user.id,
            {
                type: 'authorized_user',
                client_id: lightdashConfigMock.auth.google.oauth2ClientId,
                client_secret:
                    lightdashConfigMock.auth.google.oauth2ClientSecret,
                refresh_token: 'new-token',
            },
            developerAccount.user.id,
            null,
        );
        expect(projectModel.update).not.toHaveBeenCalled();
        expect(grant.getRefreshToken).toHaveBeenCalledWith(
            developerAccount.user.id,
            OpenIdIdentityIssuerType.GOOGLE,
        );
        expect(UserService.generateGoogleAccessToken).toHaveBeenCalledWith(
            'new-token',
            'bigquery',
        );
    });

    test('writes a CLI authorized-user keyfile through the SSO save path', async () => {
        const cliCredentials = {
            ...credentials,
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
        };
        projectModel.getWithSensitiveFields.mockResolvedValue({
            ...projectWithSensitiveFields,
            warehouseConnection: cliCredentials,
            organizationWarehouseCredentialsUuid: undefined,
        } as never);

        await service.reconnectSharedSignIn(
            developerAccount,
            projectSummary.projectUuid,
        );

        expect(projectModel.reconnectSharedSignIn).toHaveBeenCalledWith(
            projectSummary.projectUuid,
            'expired-token',
            developerAccount.user.id,
            expect.objectContaining({ refresh_token: 'new-token' }),
            developerAccount.user.id,
            null,
        );
    });

    test('refuses to write when the stored token changes during sign-in', async () => {
        projectModel.reconnectSharedSignIn.mockRejectedValueOnce(
            new ParameterError(
                'This connection changed while you were signing in. Reload the page and try again.',
            ),
        );

        await expect(
            service.reconnectSharedSignIn(
                developerAccount,
                projectSummary.projectUuid,
            ),
        ).rejects.toThrow(
            'This connection changed while you were signing in. Reload the page and try again.',
        );
        expect(projectModel.update).not.toHaveBeenCalled();
    });

    test('refuses to write when the recorded subject changes during sign-in', async () => {
        projectModel.reconnectSharedSignIn.mockRejectedValueOnce(
            new ParameterError(
                'This connection changed while you were signing in. Reload the page and try again.',
            ),
        );

        await expect(
            service.reconnectSharedSignIn(
                developerAccount,
                projectSummary.projectUuid,
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(projectModel.update).not.toHaveBeenCalled();
    });

    test('allows an admin when nobody is known', async () => {
        model.getSharedSignInSubjectForToken.mockResolvedValue(null);
        await service.reconnectSharedSignIn(
            adminAccount,
            projectSummary.projectUuid,
        );
        expect(projectModel.reconnectSharedSignIn).toHaveBeenCalledOnce();
    });

    test('allows the recorded person but refuses an admin by name', async () => {
        await service.reconnectSharedSignIn(
            developerAccount,
            projectSummary.projectUuid,
        );
        await expect(
            service.reconnectSharedSignIn(
                adminAccount,
                projectSummary.projectUuid,
            ),
        ).rejects.toThrow("Only Owner can reconnect this project's sign-in");
        expect(projectModel.reconnectSharedSignIn).toHaveBeenCalledOnce();
    });

    test('allows the creator and an admin for a guessed creator, but refuses a viewer', async () => {
        model.getSharedSignInSubjectForToken.mockResolvedValue({
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: developerAccount.user.id, name: 'Owner' },
            basis: SignInSubjectBasis.PROJECT_CREATOR,
        });
        await service.reconnectSharedSignIn(
            developerAccount,
            projectSummary.projectUuid,
        );
        await service.reconnectSharedSignIn(
            adminAccount,
            projectSummary.projectUuid,
        );
        await expect(
            service.reconnectSharedSignIn(
                viewerAccount,
                projectSummary.projectUuid,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(projectModel.reconnectSharedSignIn).toHaveBeenCalledTimes(2);
    });

    test('refuses a viewer and a disabled flag', async () => {
        await expect(
            service.reconnectSharedSignIn(
                viewerAccount,
                projectSummary.projectUuid,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        flag.get.mockResolvedValueOnce({
            id: FeatureFlags.SharedSignInReconnect,
            enabled: false,
        });
        await expect(
            service.reconnectSharedSignIn(
                developerAccount,
                projectSummary.projectUuid,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(projectModel.getWithSensitiveFields).toHaveBeenCalledTimes(1);
        expect(projectModel.update).not.toHaveBeenCalled();
    });

    test('refuses a non-person credential', async () => {
        projectModel.getWithSensitiveFields.mockResolvedValueOnce({
            ...projectWithSensitiveFields,
            warehouseConnection: {
                ...credentials,
                keyfileContents: { type: 'service_account' },
            },
        } as never);
        await expect(
            service.reconnectSharedSignIn(
                developerAccount,
                projectSummary.projectUuid,
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(projectModel.update).not.toHaveBeenCalled();
    });

    test('refuses a non-BigQuery credential', async () => {
        projectModel.getWithSensitiveFields.mockResolvedValueOnce({
            ...projectWithSensitiveFields,
            warehouseConnection: {
                type: WarehouseTypes.SNOWFLAKE,
                authenticationType: SnowflakeAuthenticationType.SSO,
                refreshToken: 'expired-token',
            },
        } as never);
        await expect(
            service.reconnectSharedSignIn(
                developerAccount,
                projectSummary.projectUuid,
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(projectModel.update).not.toHaveBeenCalled();
    });

    test.each(['expired-token', ''])(
        'refuses an unchanged or missing token',
        async (token) => {
            grant.getRefreshToken.mockResolvedValueOnce(token);
            await expect(
                service.reconnectSharedSignIn(
                    developerAccount,
                    projectSummary.projectUuid,
                ),
            ).rejects.toThrow('Sign in with Google did not finish. Try again.');
            expect(projectModel.update).not.toHaveBeenCalled();
        },
    );
});

describe('ProjectService.getSharedSignInStatus', () => {
    const adminAccount = {
        ...developerAccount,
        user: { ...developerAccount.user, id: 'project-admin' },
    } as typeof developerAccount;
    const credentials = {
        type: WarehouseTypes.BIGQUERY,
        project: 'analytics',
        dataset: 'marts',
        authenticationType: BigqueryAuthenticationType.SSO,
        timeoutSeconds: 300,
        priority: 'interactive',
        retries: 3,
        location: undefined,
        maximumBytesBilled: undefined,
        keyfileContents: {
            type: 'authorized_user',
            refresh_token: 'expired-token',
        },
    } as CreateBigqueryCredentials;
    const model = projectModel as unknown as {
        getSharedSignInSubjectForToken: ReturnType<typeof vi.fn>;
    };
    const flag = {
        get: vi.fn(async () => ({
            id: FeatureFlags.SharedSignInReconnect,
            enabled: true,
        })),
    };
    const service = getMockedProjectService(lightdashConfigMock, {
        featureFlagModel: flag as unknown as FeatureFlagModel,
    });
    const owner = { userUuid: developerAccount.user.id, name: 'Owner' };

    beforeEach(() => {
        vi.clearAllMocks();
        projectModel.getWithSensitiveFields.mockResolvedValue({
            ...projectWithSensitiveFields,
            warehouseConnection: credentials,
            organizationWarehouseCredentialsUuid: undefined,
        } as never);
        model.getSharedSignInSubjectForToken = vi.fn(async () => ({
            provider: PersonSignInProvider.GOOGLE,
            subject: owner,
            basis: SignInSubjectBasis.RECORDED,
        }));
        Object.assign(service, {
            isGoogleSharedSignInExpired: vi.fn(async () => true),
        });
    });

    test('allows the recorded person but not an admin', async () => {
        await expect(
            service.getSharedSignInStatus(
                developerAccount,
                projectSummary.projectUuid,
            ),
        ).resolves.toMatchObject({
            expired: true,
            canReconnect: true,
            subject: owner,
            subjectBasis: SignInSubjectBasis.RECORDED,
        });
        await expect(
            service.getSharedSignInStatus(
                adminAccount,
                projectSummary.projectUuid,
            ),
        ).resolves.toMatchObject({ canReconnect: false });
    });

    test('allows the creator and an admin for a guessed creator, but not a viewer', async () => {
        model.getSharedSignInSubjectForToken.mockResolvedValue({
            provider: PersonSignInProvider.GOOGLE,
            subject: owner,
            basis: SignInSubjectBasis.PROJECT_CREATOR,
        });
        await Promise.all(
            (
                [
                    [developerAccount, true],
                    [adminAccount, true],
                    [viewerAccount, false],
                ] as const
            ).map(([accountForTest, canReconnect]) =>
                expect(
                    service.getSharedSignInStatus(
                        accountForTest,
                        projectSummary.projectUuid,
                    ),
                ).resolves.toMatchObject({
                    canReconnect,
                    subjectBasis: SignInSubjectBasis.PROJECT_CREATOR,
                }),
            ),
        );
    });

    test('allows an admin when nobody is known', async () => {
        model.getSharedSignInSubjectForToken.mockResolvedValue(null);
        await expect(
            service.getSharedSignInStatus(
                adminAccount,
                projectSummary.projectUuid,
            ),
        ).resolves.toMatchObject({
            canReconnect: true,
            subject: null,
            subjectBasis: null,
        });
    });

    test('does not allow another subject or a viewer', async () => {
        model.getSharedSignInSubjectForToken.mockResolvedValue({
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: 'someone-else', name: 'Other' },
            basis: SignInSubjectBasis.RECORDED,
        });
        await expect(
            service.getSharedSignInStatus(
                developerAccount,
                projectSummary.projectUuid,
            ),
        ).resolves.toMatchObject({ canReconnect: false });
        model.getSharedSignInSubjectForToken.mockResolvedValue({
            provider: PersonSignInProvider.GOOGLE,
            subject: null,
            basis: null,
        });
        await expect(
            service.getSharedSignInStatus(
                viewerAccount,
                projectSummary.projectUuid,
            ),
        ).resolves.toMatchObject({ canReconnect: false });
    });

    test('returns null for a non-person credential and when disabled', async () => {
        projectModel.getWithSensitiveFields.mockResolvedValueOnce({
            ...projectWithSensitiveFields,
            warehouseConnection: {
                ...credentials,
                keyfileContents: { type: 'service_account' },
            },
        } as never);
        await expect(
            service.getSharedSignInStatus(
                developerAccount,
                projectSummary.projectUuid,
            ),
        ).resolves.toBeNull();
        flag.get.mockResolvedValueOnce({
            id: FeatureFlags.SharedSignInReconnect,
            enabled: false,
        });
        await expect(
            service.getSharedSignInStatus(
                developerAccount,
                projectSummary.projectUuid,
            ),
        ).resolves.toBeNull();
    });
});

describe('ProjectService.compileQueryForResponse', () => {
    const { projectUuid } = defaultProject;
    const { organizationUuid } = projectSummary;
    const service = getMockedProjectService(lightdashConfigMock);

    const buildAiAgentAccount = ({
        sqlScopeProjectUuid,
    }: {
        sqlScopeProjectUuid: string | null;
    }) =>
        fromJwt({
            decodedToken: {
                content: { type: 'aiAgent', agentUuid: 'agent-uuid' },
                writeActions: {
                    userUuid: 'write-actor-uuid',
                    spaceUuid: 'space-uuid',
                },
            },
            content: {
                type: 'aiAgent',
                agentUuid: 'agent-uuid',
                chartUuids: [],
                explores: [],
            },
            embed: {
                organization: {
                    organizationUuid,
                    name: 'Test organization',
                },
                projectUuid,
                encodedSecret: 'test-secret',
                dashboardUuids: [],
                allowAllDashboards: false,
                chartUuids: [],
                allowAllCharts: false,
                appUuids: [],
                allowAllApps: false,
                createdAt: '2026-01-01',
                user: null,
            },
            source: 'test-token',
            userAttributes: { userAttributes: {}, intrinsicUserAttributes: {} },
            embedWriteUser: {
                ...user,
                ability: new Ability<PossibleAbilities>([
                    {
                        subject: 'EmbedAiAgent',
                        action: 'view',
                        conditions: { organizationUuid, projectUuid },
                    },
                    ...(sqlScopeProjectUuid
                        ? [
                              {
                                  subject: 'EmbedCompiledSql' as const,
                                  action: 'view' as const,
                                  conditions: {
                                      organizationUuid,
                                      projectUuid: sqlScopeProjectUuid,
                                  },
                              },
                          ]
                        : []),
                ]),
            },
            embedWriteContext: {
                canUpdateDashboard: false,
                canUpdateSavedChart: false,
                canCreateSavedChart: false,
                canUseAiAgent: true,
            },
        });

    const compileArgs = (caller: Account) => ({
        account: caller,
        body: {} as MetricQuery,
        projectUuid,
        exploreName: 'orders',
    });

    const buildDashboardAccount = () =>
        fromJwt({
            decodedToken: {
                content: { type: 'dashboard', dashboardUuid: 'dashboard-uuid' },
            },
            content: {
                type: 'dashboard',
                dashboardUuid: 'dashboard-uuid',
                chartUuids: [],
                explores: [],
            },
            embed: buildAiAgentAccount({ sqlScopeProjectUuid: null }).embed,
            source: 'test-token',
            userAttributes: { userAttributes: {}, intrinsicUserAttributes: {} },
        });

    beforeEach(() => {
        vi.spyOn(service, 'compileQuery').mockResolvedValue({
            query: 'select 1',
            pivotQuery: 'select 2',
            parameterReferences: ['p'],
        } as never);
    });

    it('redacts compiled SQL when the AI agent embed lacks the SQL scope', async () => {
        const result = await service.compileQueryForResponse(
            compileArgs(buildAiAgentAccount({ sqlScopeProjectUuid: null })),
        );

        expect(result).toStrictEqual({
            query: '',
            parameterReferences: ['p'],
        });
        expect(result).not.toHaveProperty('pivotQuery');
    });

    it('redacts compiled SQL when the SQL scope is granted for a different project', async () => {
        const result = await service.compileQueryForResponse(
            compileArgs(
                buildAiAgentAccount({ sqlScopeProjectUuid: 'other-project' }),
            ),
        );

        expect(result).toStrictEqual({
            query: '',
            parameterReferences: ['p'],
        });
    });

    it('returns the full payload when the AI agent embed has the SQL scope', async () => {
        await expect(
            service.compileQueryForResponse(
                compileArgs(
                    buildAiAgentAccount({ sqlScopeProjectUuid: projectUuid }),
                ),
            ),
        ).resolves.toStrictEqual({
            query: 'select 1',
            pivotQuery: 'select 2',
            parameterReferences: ['p'],
        });
    });

    it('redacts compiled SQL for dashboard embeds that cannot import the SQL scope', async () => {
        await expect(
            service.compileQueryForResponse(
                compileArgs(buildDashboardAccount()),
            ),
        ).resolves.toStrictEqual({
            query: '',
            parameterReferences: ['p'],
        });
    });

    it('returns the full payload for session accounts', async () => {
        await expect(
            service.compileQueryForResponse(compileArgs(developerAccount)),
        ).resolves.toStrictEqual({
            query: 'select 1',
            pivotQuery: 'select 2',
            parameterReferences: ['p'],
        });
    });
});

describe('ProjectService.getExploreResponse', () => {
    const { projectUuid } = defaultProject;
    const service = getMockedProjectService(lightdashConfigMock);
    const embedAccount = fromJwt({
        decodedToken: {
            content: { type: 'metricsCatalog', canExplore: true },
        },
        content: {
            type: 'metricsCatalog',
            chartUuids: [],
            explores: [],
        },
        embed: {
            organization: {
                organizationUuid: projectSummary.organizationUuid,
                name: 'Test organization',
            },
            projectUuid,
            encodedSecret: 'test-secret',
            dashboardUuids: [],
            allowAllDashboards: false,
            chartUuids: [],
            allowAllCharts: false,
            appUuids: [],
            allowAllApps: false,
            createdAt: '2026-01-01',
            user: null,
        },
        source: 'test-token',
        userAttributes: { userAttributes: {}, intrinsicUserAttributes: {} },
    });

    const exploreWithSql: Explore = {
        ...validExplore,
        tables: {
            ...validExplore.tables,
            a: {
                ...validExplore.tables.a,
                dimensions: {
                    dim1: {
                        ...validExplore.tables.a.dimensions.dim1,
                        sql: '${TABLE}.dim1',
                        compiledSql: '"a".dim1',
                    },
                },
            },
        },
    };

    beforeEach(() => {
        vi.spyOn(service, 'getExplore').mockResolvedValue(exploreWithSql);
    });

    it('strips semantic-layer SQL for embeds without the SQL scope', async () => {
        const result = await service.getExploreResponse(
            embedAccount,
            projectUuid,
            exploreWithSql.name,
        );

        const dimension = result.tables.a.dimensions.dim1;
        expect(dimension.sql).toBe('');
        expect(dimension.compiledSql).toBe('');
        expect(dimension.label).toBe('dim1');
        expect(result.tables.a.sqlTable).toBe('');
        expect(result.joinedTables[0].compiledSqlOn).toBe('');
    });

    it('strips field SQL from single-chart available filters for embeds without the SQL scope', async () => {
        savedChartModel.getInfoForAvailableFilters.mockResolvedValueOnce([
            {
                uuid: 'chart-uuid',
                name: 'Chart',
                tableName: exploreWithSql.name,
                projectUuid,
                spaceUuid: 'space-uuid',
                dashboardUuid: null,
            },
        ]);
        const filtersService = getMockedProjectService(lightdashConfigMock, {
            spacePermissionService: {
                resolveAccess: vi.fn().mockResolvedValue({
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                    inheritsFromOrgOrProject: true,
                    access: [],
                }),
            } as unknown as SpacePermissionService,
        });
        vi.spyOn(filtersService, 'getExplore').mockResolvedValue(
            exploreWithSql,
        );
        const chartViewerAccount = {
            ...embedAccount,
            user: {
                ...embedAccount.user,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'SavedChart', action: 'view' },
                ]),
            },
        } as typeof embedAccount;

        const filters = await filtersService.getAvailableFiltersForSavedQuery(
            chartViewerAccount,
            'chart-uuid',
        );

        expect(filters.length).toBeGreaterThan(0);
        filters.forEach((filter) => {
            expect(filter.sql).toBe('');
            expect(filter).toHaveProperty('compiledSql', '');
        });
    });

    it('keeps SQL for session accounts', async () => {
        const result = await service.getExploreResponse(
            developerAccount,
            projectUuid,
            exploreWithSql.name,
        );

        expect(result.tables.a.dimensions.dim1.compiledSql).toBe('"a".dim1');
        expect(result.joinedTables[0].compiledSqlOn).toBe(
            '("a".dim1) = ("b".dim1)',
        );
    });
});

describe('homepage popularity', () => {
    it('ranks apps with charts and dashboards before the shared limit, without changing recently updated', async () => {
        const chart = { uuid: 'chart', views: 20, updatedAt: new Date() };
        const dashboard = {
            uuid: 'dashboard',
            views: 10,
            updatedAt: new Date(),
        };
        const app = { uuid: 'app', contentType: 'data_app', views: 15 };
        const getMostPopularApps = vi.fn().mockResolvedValue([app]);
        const model = {
            find: vi
                .fn()
                .mockResolvedValue([{ uuid: 'visible' }, { uuid: 'hidden' }]),
            getSpaceQueries: vi.fn().mockResolvedValue([chart]),
            getSpaceSqlCharts: vi.fn().mockResolvedValue([]),
            getSpaceDashboards: vi.fn().mockResolvedValue([dashboard]),
            getMostPopularApps,
            MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT: 2,
        };
        const service = getMockedProjectService(lightdashConfigMock, {
            spaceModel: model as unknown as SpaceModel,
            spacePermissionService: {
                getAccessibleSpaceUuids: vi.fn().mockResolvedValue(['visible']),
            } as unknown as SpacePermissionService,
        });
        const result = await service.getMostPopularAndRecentlyUpdated(
            { ...user, organizationUuid: projectSummary.organizationUuid },
            projectSummary.projectUuid,
        );
        expect(result.mostPopular.map((item) => item.uuid)).toEqual([
            'chart',
            'app',
        ]);
        expect(result.recentlyUpdated.map((item) => item.uuid)).toEqual([
            'chart',
            'dashboard',
        ]);
        expect(getMostPopularApps).toHaveBeenCalledWith(
            projectSummary.projectUuid,
            ['visible'],
            [],
        );
    });
});

describe('AI principal credential routing', () => {
    const projectUuid = 'projectUuid';
    const credentials: CreateWarehouseCredentials = {
        type: WarehouseTypes.POSTGRES,
        host: 'localhost',
        port: 5432,
        dbname: 'test',
        schema: 'public',
        user: 'ai',
        password: 'test',
    };
    const plan: Extract<AiExecutionPlan, { identity: 'connected_person' }> = {
        identity: 'connected_person',
        identityUuid: 'ai-one',
        credentials,
        assurances: [],
        audit: {
            actorKind: 'person',
            personUuid: 'user',
            principalRef: 'ai',
            queryTags: { ai_principal: 'ai' },
        },
    };
    const resolveCredentials = (
        configured: ProjectService,
        querySurface?: QuerySurface,
    ) =>
        (
            configured as unknown as {
                getWarehouseCredentialsWithConnection: (args: {
                    projectUuid: string;
                    userId: string;
                    isRegisteredUser: boolean;
                    context: QueryExecutionContext;
                    querySurface?: QuerySurface;
                    binding: { kind: 'original' };
                }) => Promise<{
                    warehouseCredentials: CreateWarehouseCredentials;
                    aiPlan: AiExecutionPlan | null;
                }>;
            }
        ).getWarehouseCredentialsWithConnection({
            projectUuid,
            userId: user.userUuid,
            isRegisteredUser: true,
            context: QueryExecutionContext.AI,
            querySurface,
            binding: { kind: 'original' },
        });

    test.each([
        { identity: 'connected_person', querySurface: QuerySurface.SLACK },
        { identity: 'marked_person', querySurface: QuerySurface.API },
        { identity: null, querySurface: QuerySurface.APP },
    ] as const)(
        'the scoped original path matches the legacy result for $identity on $querySurface',
        async ({ identity, querySurface }) => {
            const configured = getMockedProjectService(lightdashConfigMock);
            let aiPlan: AiExecutionPlan | null = null;
            if (identity === 'connected_person') {
                aiPlan = plan;
            } else if (identity === 'marked_person') {
                aiPlan = {
                    identity,
                    assurances: [
                        {
                            kind: 'agent_marker',
                            level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                        },
                    ],
                    audit: { ...plan.audit, userUuid: user.userUuid },
                };
            }
            const resolve = vi
                .spyOn(configured.aiAccessService, 'resolvePlan')
                .mockResolvedValue(aiPlan);
            vi.mocked(projectModel.getWarehouseCredentialsForProject)
                .mockResolvedValueOnce({
                    ...credentials,
                    requireUserCredentials: true,
                })
                .mockResolvedValueOnce({
                    ...credentials,
                    requireUserCredentials: true,
                });
            vi.spyOn(
                configured.userWarehouseCredentialsModel,
                'findForProjectWithSecrets',
            ).mockResolvedValue({
                uuid: 'personal-uuid',
                credentials: { ...credentials, user: 'personal-user' },
                expiresAt: null,
            });
            const legacy = await resolveCredentials(configured, querySurface);
            const scoped =
                await configured.warehouseClientFactory.withWarehouseClient(
                    {
                        kind: 'binding',
                        projectUuid,
                        binding: { kind: 'original' },
                    },
                    connectionContextFromUser(
                        { userUuid: user.userUuid, isRegisteredUser: true },
                        {
                            organizationUuid: projectSummary.organizationUuid,
                            queryContext: QueryExecutionContext.AI,
                            surface: connectionSurfaceFromQuerySurface(
                                querySurface,
                                QueryExecutionContext.AI,
                            ),
                        },
                    ),
                    async ({
                        warehouseCredentials,
                        aiPlan: resolvedPlan,
                        warehouseConnectionUuid,
                        connectionRoute,
                    }) => ({
                        warehouseCredentials,
                        aiPlan: resolvedPlan,
                        warehouseConnectionUuid,
                        connectionRoute,
                    }),
                );
            expect(scoped).toStrictEqual(legacy);
            expect(resolve.mock.calls.map(([args]) => args.evaluation)).toEqual(
                [
                    { kind: 'query', surface: querySurface },
                    { kind: 'query', surface: querySurface },
                ],
            );
        },
    );

    test.each([QuerySurface.SLACK, QuerySurface.API])(
        'the scoped extra path matches the legacy route and AI credentials for %s',
        async (querySurface) => {
            const configured = getMockedProjectService(lightdashConfigMock);
            const resolve = vi
                .spyOn(configured.aiAccessService, 'resolvePlan')
                .mockResolvedValue(plan);
            vi.mocked(projectModel.getWarehouseCredentialsForProject)
                .mockResolvedValueOnce(credentials)
                .mockResolvedValueOnce(credentials);
            vi.spyOn(
                configured.projectModel,
                'resolveWarehouseCredentialReadWithRoute',
            )
                .mockResolvedValueOnce({
                    route: 'multi',
                    target: {
                        kind: 'extra',
                        warehouseConnectionUuid: 'extra-uuid',
                    },
                    originalWarehouseConnectionUuid: 'original-uuid',
                })
                .mockResolvedValueOnce({
                    route: 'multi',
                    target: {
                        kind: 'extra',
                        warehouseConnectionUuid: 'extra-uuid',
                    },
                    originalWarehouseConnectionUuid: 'original-uuid',
                });
            Object.assign(configured.warehouseConnectionModel, {
                getProject: vi.fn(async () => ({
                    projectUuid,
                    organizationUuid: projectSummary.organizationUuid,
                    connectionMode: 'multi',
                    originalWarehouseType: WarehouseTypes.POSTGRES,
                })),
                getExtraCredentialSource: vi.fn(async () => ({
                    credentials,
                    organizationWarehouseCredentialsUuid: null,
                })),
            });
            const legacy = await resolveCredentials(configured, querySurface);
            const scoped =
                await configured.warehouseClientFactory.withWarehouseClient(
                    {
                        kind: 'binding',
                        projectUuid,
                        binding: { kind: 'original' },
                    },
                    connectionContextFromUser(
                        { userUuid: user.userUuid, isRegisteredUser: true },
                        {
                            organizationUuid: projectSummary.organizationUuid,
                            queryContext: QueryExecutionContext.AI,
                            surface: connectionSurfaceFromQuerySurface(
                                querySurface,
                                QueryExecutionContext.AI,
                            ),
                        },
                    ),
                    async ({
                        warehouseCredentials,
                        aiPlan,
                        warehouseConnectionUuid,
                        connectionRoute,
                    }) => ({
                        warehouseCredentials,
                        aiPlan,
                        warehouseConnectionUuid,
                        connectionRoute,
                    }),
                );
            expect(scoped).toStrictEqual(legacy);
            expect(resolve.mock.calls.map(([args]) => args.evaluation)).toEqual(
                [
                    { kind: 'query', surface: querySurface },
                    { kind: 'query', surface: querySurface },
                ],
            );
        },
    );

    test('the scoped original path keeps preloaded organization configuration and avoids a new summary read for an ordinary query', async () => {
        const configured = getMockedProjectService(lightdashConfigMock);
        vi.mocked(
            projectModel.getWarehouseCredentialsForProject,
        ).mockResolvedValueOnce(credentials);
        const summary = vi.spyOn(projectModel, 'getSummary');
        const config = vi.spyOn(projectModel, 'getProjectWarehouseConfig');
        summary.mockClear();
        config.mockClear();
        await configured.warehouseClientFactory.withWarehouseClient(
            {
                kind: 'binding',
                projectUuid,
                binding: { kind: 'original' },
                preloadedOrgWarehouseCredentialsUuid: null,
            },
            connectionContextFromUser(
                { userUuid: user.userUuid, isRegisteredUser: true },
                {
                    organizationUuid: projectSummary.organizationUuid,
                    queryContext: QueryExecutionContext.EXPLORE,
                },
            ),
            async () => undefined,
        );
        expect(summary).not.toHaveBeenCalled();
        expect(config).not.toHaveBeenCalled();
    });

    test.each([
        { site: 'field search', querySurface: QuerySurface.SLACK },
        { site: 'field search', querySurface: QuerySurface.API },
        { site: 'catalog list', querySurface: QuerySurface.SLACK },
        { site: 'catalog list', querySurface: QuerySurface.API },
        { site: 'catalog describe', querySurface: QuerySurface.SLACK },
        { site: 'catalog describe', querySurface: QuerySurface.API },
    ] as const)(
        '$site preserves $querySurface through the factory',
        async ({ site, querySurface }) => {
            const configured = getMockedProjectService(lightdashConfigMock);
            vi.mocked(
                projectModel.getWarehouseCredentialsForProject,
            ).mockResolvedValueOnce(credentials);
            const refusal = new Error('refused before warehouse access');
            const resolve = vi
                .spyOn(configured.aiAccessService, 'resolvePlan')
                .mockRejectedValue(refusal);
            const acquire = vi.spyOn(
                configured.warehouseClientFactory,
                'acquireUnscoped',
            );
            const run = () => {
                switch (site) {
                    case 'field search':
                        return configured.searchFieldUniqueValues(
                            user,
                            projectUuid,
                            'a',
                            'a_dim1',
                            '',
                            10,
                            undefined,
                            true,
                            undefined,
                            undefined,
                            QueryExecutionContext.AI,
                            querySurface,
                        );
                    case 'catalog list':
                        return configured.getWarehouseTables(
                            user,
                            projectUuid,
                            QueryExecutionContext.AI,
                            querySurface,
                        );
                    case 'catalog describe':
                        return configured.getWarehouseFields(
                            user,
                            projectUuid,
                            QueryExecutionContext.AI,
                            'orders',
                            'public',
                            'catalog_database',
                            querySurface,
                        );
                    default:
                        return assertUnreachable(site, 'Unknown test site');
                }
            };
            await expect(run()).rejects.toBe(refusal);
            expect(resolve).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    context: QueryExecutionContext.AI,
                    evaluation: { kind: 'query', surface: querySurface },
                }),
            );
            expect(acquire).not.toHaveBeenCalled();
        },
    );

    test('passes the AI context to table discovery and avoids the person catalog cache', async () => {
        const configured = getMockedProjectService(lightdashConfigMock);
        vi.mocked(
            projectModel.getWarehouseCredentialsForProject,
        ).mockResolvedValueOnce(credentials);
        const resolve = vi
            .spyOn(configured.aiAccessService, 'resolvePlan')
            .mockResolvedValue(plan);
        const getAllTables = vi.fn().mockResolvedValue([]);
        const disconnect = vi.fn();
        vi.spyOn(
            configured.warehouseClientFactory,
            'acquireUnscoped',
        ).mockResolvedValue({
            warehouseClient: { getAllTables } as unknown as WarehouseClient,
            sshTunnel: {
                disconnect,
            } as unknown as SshTunnel<CreateWarehouseCredentials>,
            tunnelConnectMs: null,
        });
        await expect(
            configured.getWarehouseTables(
                user,
                projectUuid,
                QueryExecutionContext.AI,
            ),
        ).resolves.toEqual({});
        expect(resolve).toHaveBeenCalledWith(
            expect.objectContaining({ context: QueryExecutionContext.AI }),
        );
        expect(getAllTables).toHaveBeenCalledOnce();
        expect(disconnect).toHaveBeenCalledOnce();
    });
    test('uses the AI credentials before looking up personal credentials', async () => {
        const configured = getMockedProjectService(lightdashConfigMock);
        vi.mocked(
            projectModel.getWarehouseCredentialsForProject,
        ).mockResolvedValueOnce({
            ...credentials,
            user: 'base',
            requireUserCredentials: true,
        });
        vi.spyOn(configured.aiAccessService, 'resolvePlan').mockResolvedValue(
            plan,
        );
        const personal = vi.spyOn(
            configured.userWarehouseCredentialsModel,
            'findForProjectWithSecrets',
        );
        const result = await resolveCredentials(configured);
        expect(result.warehouseCredentials).toEqual({
            ...credentials,
            userWarehouseCredentialsUuid: undefined,
        });
        expect(result.aiPlan).toBe(plan);
        expect(personal).not.toHaveBeenCalled();
    });
    test.each([false, true])(
        'slot resolution skips organization and personal refresh on extra=%s',
        async (extra) => {
            const configured = getMockedProjectService(lightdashConfigMock);
            vi.spyOn(
                configured.aiAccessService,
                'resolvePlan',
            ).mockResolvedValue(aiServiceAccountPlanMock);
            const baseCredentials = {
                ...aiServiceAccountPlanMock.credentials,
                requireUserCredentials: false as const,
            };
            vi.mocked(
                projectModel.getWarehouseCredentialsForProject,
            ).mockResolvedValueOnce(baseCredentials);
            if (!extra)
                vi.spyOn(
                    configured.projectModel,
                    'getProjectWarehouseConfig',
                ).mockResolvedValueOnce({
                    organizationWarehouseCredentialsUuid: 'organization-creds',
                } as Awaited<
                    ReturnType<ProjectModel['getProjectWarehouseConfig']>
                >);
            const refresh = vi
                .spyOn(
                    configured as unknown as {
                        refreshCredentialsAndPersistRotation: (
                            ...args: unknown[]
                        ) => Promise<CreateWarehouseCredentials>;
                    },
                    'refreshCredentialsAndPersistRotation',
                )
                .mockRejectedValue(new Error('ordinary sign-in expired'));
            const personal = vi.spyOn(
                configured.userWarehouseCredentialsModel,
                'findForProjectWithSecrets',
            );
            if (extra) {
                vi.spyOn(
                    projectModel,
                    'resolveWarehouseCredentialReadWithRoute',
                ).mockResolvedValueOnce({
                    route: 'multi',
                    target: {
                        kind: 'extra',
                        warehouseConnectionUuid: 'extra-uuid',
                    },
                    originalWarehouseConnectionUuid: 'original-uuid',
                });
                Object.assign(configured.warehouseConnectionModel, {
                    getProject: vi.fn(async () => ({
                        projectUuid,
                        organizationUuid: projectSummary.organizationUuid,
                        connectionMode: 'multi',
                        originalWarehouseType: WarehouseTypes.BIGQUERY,
                    })),
                    getExtraCredentialSource: vi.fn(async () => ({
                        credentials: baseCredentials,
                        organizationWarehouseCredentialsUuid:
                            'organization-creds',
                    })),
                });
            }
            const result = await resolveCredentials(configured);
            expect(result.aiPlan).toBe(aiServiceAccountPlanMock);
            expect(result.warehouseCredentials).toEqual({
                ...aiServiceAccountPlanMock.credentials,
                userWarehouseCredentialsUuid: undefined,
            });
            expect(refresh).not.toHaveBeenCalled();
            expect(personal).not.toHaveBeenCalled();
        },
    );
    test('keeps personal credentials and the audit plan for marked person', async () => {
        const configured = getMockedProjectService(lightdashConfigMock);
        const marked: AiExecutionPlan = {
            identity: 'marked_person',
            assurances: [
                {
                    kind: 'agent_marker',
                    level: AiAgentMarkerLevel.IDENTIFY_ONLY,
                },
            ],
            audit: {
                actorKind: 'person',
                personUuid: user.userUuid,
                userUuid: user.userUuid,
                principalRef: 'person@example.test',
                queryTags: { agent: 'true' },
            },
        };
        vi.mocked(
            projectModel.getWarehouseCredentialsForProject,
        ).mockResolvedValueOnce({
            ...credentials,
            user: 'base',
            requireUserCredentials: true,
        });
        vi.spyOn(configured.aiAccessService, 'resolvePlan').mockResolvedValue(
            marked,
        );
        const personal = vi
            .spyOn(
                configured.userWarehouseCredentialsModel,
                'findForProjectWithSecrets',
            )
            .mockResolvedValue({
                uuid: 'personal',
                expiresAt: null,
                credentials: { ...credentials, user: 'person' },
            });
        const result = await resolveCredentials(configured);
        expect(result.warehouseCredentials).toMatchObject({
            user: 'person',
            userWarehouseCredentialsUuid: 'personal',
        });
        expect(result.aiPlan).toBe(marked);
        expect(personal).toHaveBeenCalledOnce();
    });
    test('uses personal credentials when the resolver returns null', async () => {
        const configured = getMockedProjectService(lightdashConfigMock);
        vi.mocked(
            projectModel.getWarehouseCredentialsForProject,
        ).mockResolvedValueOnce({
            ...credentials,
            user: 'base',
            requireUserCredentials: true,
        });
        const personal = vi
            .spyOn(
                configured.userWarehouseCredentialsModel,
                'findForProjectWithSecrets',
            )
            .mockResolvedValue({
                uuid: 'personal',
                expiresAt: null,
                credentials: { ...credentials, user: 'person' },
            });
        const result = await resolveCredentials(configured);
        expect(result.warehouseCredentials).toMatchObject({
            user: 'person',
            userWarehouseCredentialsUuid: 'personal',
        });
        expect(result.aiPlan).toBeNull();
        expect(personal).toHaveBeenCalledOnce();
    });
    test('caches AI and explore clients separately without a policy', async () => {
        const configured = getMockedProjectService(lightdashConfigMock);
        vi.mocked(
            projectModel.getWarehouseClientFromCredentials,
        ).mockImplementation(() => ({ ...warehouseClientMock }));
        vi.mocked(projectModel.getWarehouseClientFromCredentials).mockClear();
        const getClient = (context: QueryExecutionContext) =>
            configured.warehouseClientFactory.acquireUnscoped(
                projectUuid,
                credentials,
                {
                    agentSession: isAiAccessQueryContext(context),
                },
            );
        const first = await getClient(QueryExecutionContext.AI);
        const second = await getClient(QueryExecutionContext.EXPLORE);
        const again = await getClient(QueryExecutionContext.AI);
        const clients = [first, second, again];
        expect(clients[0].warehouseClient).not.toBe(clients[1].warehouseClient);
        expect(clients[0].warehouseClient).toBe(clients[2].warehouseClient);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenNthCalledWith(
            1,
            warehouseClientMock.credentials,
            expect.objectContaining({ agentSession: true }),
        );
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenNthCalledWith(
            2,
            warehouseClientMock.credentials,
            expect.objectContaining({ agentSession: false }),
        );
        await Promise.all(
            clients.map((client) => client.sshTunnel.disconnect()),
        );
    });

    test('caches clients separately for different principals with the same credentials', async () => {
        const configured = getMockedProjectService(lightdashConfigMock);
        vi.mocked(
            projectModel.getWarehouseClientFromCredentials,
        ).mockImplementation(() => ({ ...warehouseClientMock }));
        vi.mocked(projectModel.getWarehouseClientFromCredentials).mockClear();
        const first = await configured.warehouseClientFactory.acquireUnscoped(
            projectUuid,
            credentials,
            { aiPlan: plan },
        );
        const second = await configured.warehouseClientFactory.acquireUnscoped(
            projectUuid,
            credentials,
            {
                aiPlan: {
                    ...plan,
                    identityUuid: 'ai-two',
                },
            },
        );
        const again = await configured.warehouseClientFactory.acquireUnscoped(
            projectUuid,
            credentials,
            { aiPlan: plan },
        );
        expect(first.warehouseClient).not.toBe(second.warehouseClient);
        expect(
            Object.keys(configured.warehouseClientFactory.warehouseClients),
        ).toHaveLength(2);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledTimes(2);
        expect(
            projectModel.getWarehouseClientFromCredentials,
        ).toHaveBeenCalledWith(
            warehouseClientMock.credentials,
            expect.objectContaining({ agentSession: true }),
        );
        await first.sshTunnel.disconnect();
        await second.sshTunnel.disconnect();
        await again.sshTunnel.disconnect();
    });
});

describe('Snowflake AI query credentials', () => {
    beforeEach(() => {
        vi.mocked(checkSnowflakeAgentSessionWithToken)
            .mockReset()
            .mockResolvedValue({
                agentActivated: true,
                currentRole: 'ANALYST',
                activeRestrictedSessionScopes: null,
            });
    });
    it.each([true, false, 'error'] as const)(
        'checks a refreshed AI token before persistence when activation is %s',
        async (activation) => {
            const check = vi.mocked(checkSnowflakeAgentSessionWithToken);
            if (activation === 'error') {
                check.mockRejectedValueOnce(new Error('session check failed'));
            } else {
                check.mockResolvedValueOnce({
                    agentActivated: activation,
                    currentRole: null,
                    activeRestrictedSessionScopes: null,
                });
            }
            const service = getMockedProjectService(lightdashConfigMock);
            const rotateRefreshToken = vi.fn(async () => true);
            (
                service as unknown as {
                    userWarehouseCredentialsModel: {
                        rotateRefreshToken: typeof rotateRefreshToken;
                    };
                }
            ).userWarehouseCredentialsModel = { rotateRefreshToken };
            const generateToken = vi
                .spyOn(UserService, 'generateSnowflakeAccessToken')
                .mockResolvedValue({
                    accessToken: 'access-token',
                    refreshToken: 'rotated-token',
                });
            try {
                const refreshed = (
                    service as unknown as {
                        refreshCredentialsAndPersistRotation: (
                            credentials: CreateWarehouseCredentials,
                            userUuid: string,
                            source: {
                                kind: 'user';
                                userWarehouseCredentialsUuid: string;
                                purpose: UserWarehouseCredentialPurpose.AI;
                            },
                        ) => Promise<CreateWarehouseCredentials>;
                    }
                ).refreshCredentialsAndPersistRotation(
                    {
                        type: WarehouseTypes.SNOWFLAKE,
                        authenticationType: SnowflakeAuthenticationType.SSO,
                        refreshToken: 'old-token',
                        account: 'test-account',
                    } as CreateWarehouseCredentials,
                    'user-uuid',
                    {
                        kind: 'user',
                        userWarehouseCredentialsUuid: 'ai-credential',
                        purpose: UserWarehouseCredentialPurpose.AI,
                    },
                );
                if (activation !== true) {
                    await expect(refreshed).rejects.toBeInstanceOf(
                        ForbiddenError,
                    );
                    expect(rotateRefreshToken).not.toHaveBeenCalled();
                    return;
                }
                await expect(refreshed).resolves.toMatchObject({
                    token: 'access-token',
                });
                expect(check).toHaveBeenCalledWith(
                    'test-account',
                    'access-token',
                );
                expect(check.mock.invocationCallOrder.at(-1)).toBeLessThan(
                    rotateRefreshToken.mock.invocationCallOrder[0]!,
                );
                expect(generateToken).toHaveBeenCalledWith('old-token', 'ai');
                expect(rotateRefreshToken).toHaveBeenCalledWith(
                    'ai-credential',
                    'old-token',
                    'rotated-token',
                );
            } finally {
                generateToken.mockRestore();
            }
        },
    );
});

describe('compile adapter connection credentials', () => {
    const ducklakeCredentials: CreateDuckdbDucklakeCredentials = {
        type: WarehouseTypes.DUCKDB,
        connectionType: DuckdbConnectionType.DUCKLAKE,
        catalogAlias: 'lake',
        schema: 'public',
        catalog: {
            type: DucklakeCatalogType.POSTGRES,
            host: 'catalog.internal',
            port: 5432,
            database: 'catalog',
            user: 'catalog-user',
            password: 'catalog-password',
        },
        dataPath: {
            type: DucklakeDataPathType.S3,
            url: 's3://test-lake/data',
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
        },
    };
    const caller = { userUuid: 'user-uuid', organizationUuid: 'org-uuid' };
    const adapter = {
        test: vi.fn(async () => undefined),
        destroy: vi.fn(async () => undefined),
    } as unknown as ProjectAdapter;
    type CompilePrimary = ResolveCompileAdapterArgs['primary'];
    type CompileInternals = ProjectServiceInternals & {
        warehouseClientFactory: WarehouseClientFactory;
        prepareCompileAdapter: () => Promise<unknown>;
        withCompileAdapter: <T>(
            projectUuid: string,
            user: typeof caller,
            fn: (primary: CompilePrimary) => Promise<T>,
            adapters: ProjectAdapter[],
        ) => Promise<T>;
        testProjectAdapter: (
            data: UpdateProject,
            user: typeof caller,
            context: 'project_create',
            method: RequestMethod,
            projectUuid: null,
        ) => Promise<{ lease: WarehouseConnectionLease }>;
    };

    beforeEach(async () => {
        const realWarehouses = await vi.importActual<
            typeof import('@lightdash/warehouses')
        >('@lightdash/warehouses');
        vi.spyOn(
            projectModel as unknown as ProjectModel,
            'getWarehouseClientFromCredentials',
        ).mockImplementation(realWarehouses.warehouseClientFromCredentials);
        vi.mocked(SshTunnel).mockImplementation(
            class CompileSshTunnel {
                overrideCredentials: CreateWarehouseCredentials;

                constructor(
                    private readonly credentials: CreateWarehouseCredentials,
                ) {
                    this.overrideCredentials = credentials;
                }

                connect = vi.fn(async () => {
                    this.overrideCredentials =
                        'useSshTunnel' in this.credentials &&
                        this.credentials.useSshTunnel
                            ? {
                                  ...this.credentials,
                                  host: '127.0.0.1',
                                  port: 43210,
                              }
                            : this.credentials;
                    return this.overrideCredentials;
                });

                disconnect = vi.fn(async () => undefined);
            } as unknown as typeof SshTunnel,
        );
        vi.spyOn(
            projectAdapterModule,
            'projectAdapterFromConfig',
        ).mockResolvedValue(adapter);
    });

    afterEach(() => vi.restoreAllMocks());

    it.each([
        ducklakeCredentials,
        {
            ...warehouseClientMock.credentials,
            type: WarehouseTypes.POSTGRES,
            useSshTunnel: true,
        } as CreatePostgresCredentials,
    ])(
        'withCompileAdapter passes original tunnel-adjusted $type credentials to dbt and its callback',
        async (credentials) => {
            const service = getMockedProjectService(
                lightdashConfigMock,
            ) as unknown as CompileInternals;
            vi.spyOn(service, 'prepareCompileAdapter').mockResolvedValue({
                project: { organizationUuid: 'org-uuid' },
                dbtConnection: { type: DbtProjectType.NONE },
                warehouseCredentials: credentials,
                cachedWarehouse: {},
                dbtVersionOption: DbtVersionOptionLatest.LATEST,
                dbtPartialParse: false,
            });
            const expected =
                credentials.type === WarehouseTypes.POSTGRES
                    ? { ...credentials, host: '127.0.0.1', port: 43210 }
                    : credentials;
            let passedCredentials: CreateWarehouseCredentials | undefined;
            await service.withCompileAdapter(
                'project-uuid',
                caller,
                async (primary) => {
                    passedCredentials = primary.warehouseCredentials;
                },
                [],
            );
            expect(
                vi
                    .mocked(projectAdapterModule.projectAdapterFromConfig)
                    .mock.calls.at(-1)?.[2],
            ).toEqual(expected);
            expect(passedCredentials).toEqual(expected);
        },
    );

    it('testProjectAdapter passes original DuckLake credentials to dbt', async () => {
        const service = getMockedProjectService(
            lightdashConfigMock,
        ) as unknown as CompileInternals;
        const tested = await service.testProjectAdapter(
            {
                ...projectWithSensitiveFields,
                warehouseConnection: ducklakeCredentials,
                dbtConnection: { type: DbtProjectType.NONE },
            },
            caller,
            'project_create',
            RequestMethod.WEB_APP,
            null,
        );
        try {
            expect(
                vi
                    .mocked(projectAdapterModule.projectAdapterFromConfig)
                    .mock.calls.at(-1)?.[2],
            ).toEqual(ducklakeCredentials);
        } finally {
            await tested.lease.release();
        }
    });

    it('buildSourceAdapter derives from original DuckLake credentials with the source location', async () => {
        const service = getMockedProjectService(
            lightdashConfigMock,
        ) as unknown as CompileInternals;
        await service.warehouseClientFactory.withWarehouseClient(
            {
                kind: 'compile',
                projectUuid: 'project-uuid',
                credentials: ducklakeCredentials,
            },
            connectionContextFromUser(caller, {
                organizationUuid: 'org-uuid',
                queryContext: null,
                purpose: 'compile',
            }),
            async (connection) => {
                const derive = vi.spyOn(connection, 'deriveClient');
                await service.buildSourceAdapter(
                    { type: DbtProjectType.NONE },
                    { database: null, schema: 'source_schema' },
                    'org-uuid',
                    {
                        connection,
                        warehouseCredentials: ducklakeCredentials,
                        cachedWarehouse: {},
                        dbtVersionOption: DbtVersionOptionLatest.LATEST,
                    },
                    null,
                );
                const expected = {
                    ...ducklakeCredentials,
                    schema: 'source_schema',
                };
                expect(derive).toHaveBeenCalledWith(expected);
                expect(
                    vi
                        .mocked(projectAdapterModule.projectAdapterFromConfig)
                        .mock.calls.at(-1)?.[2],
                ).toEqual(expected);
            },
        );
    });
    it('buildMergedManifestAdapter derives its sibling from original DuckLake credentials', async () => {
        const service = getMockedProjectService(
            lightdashConfigMock,
        ) as unknown as CompileInternals;
        const manifest: DbtManifest = {
            nodes: {},
            metrics: {},
            docs: {},
            metadata: {
                adapter_type: 'duckdb',
                generated_at: '2026-10-08T00:00:00Z',
                dbt_schema_version:
                    'https://schemas.getdbt.com/dbt/manifest/v11.json',
            },
        };
        const primaryAdapter = {
            ...adapter,
            getDbtManifest: vi.fn(async () => ({
                manifest,
                timings: NO_FETCH_TIMINGS,
            })),
        } as unknown as ProjectAdapter;
        await service.warehouseClientFactory.withWarehouseClient(
            {
                kind: 'compile',
                projectUuid: 'project-uuid',
                credentials: ducklakeCredentials,
            },
            connectionContextFromUser(caller, {
                organizationUuid: 'org-uuid',
                queryContext: null,
                purpose: 'compile',
            }),
            async (connection) => {
                const derive = vi.spyOn(connection, 'deriveClient');
                await service.buildMergedManifestAdapter({
                    projectUuid: 'project-uuid',
                    organizationUuid: 'org-uuid',
                    sources: [],
                    manifestFetchAdapters: [],
                    primary: {
                        adapter: primaryAdapter,
                        connection,
                        warehouseCredentials: ducklakeCredentials,
                        cachedWarehouse: {
                            warehouseCatalog: {},
                            warehouseTables: {},
                        },
                        dbtVersionOption: DbtVersionOptionLatest.LATEST,
                        dbtPartialParse: false,
                    },
                });
                expect(derive).toHaveBeenCalledWith(ducklakeCredentials);
                expect(
                    vi
                        .mocked(projectAdapterModule.projectAdapterFromConfig)
                        .mock.calls.at(-1)?.[2],
                ).toEqual(ducklakeCredentials);
            },
        );
    });
});
