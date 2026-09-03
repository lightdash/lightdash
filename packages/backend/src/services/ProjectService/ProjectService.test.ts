import { Ability } from '@casl/ability';
import {
    ConflictError,
    convertExplores,
    CustomDimensionType,
    CustomSqlQueryForbiddenError,
    DbtProjectType,
    DbtVersionOptionLatest,
    DEFAULT_SPOTLIGHT_CONFIG,
    DefaultSupportedDbtVersion,
    defineUserAbility,
    DimensionType,
    DownloadFileType,
    DuckdbConnectionType,
    EMPTY_WAREHOUSE_LOCATION,
    FeatureFlags,
    FilterOperator,
    ForbiddenError,
    getCompiledModels,
    getCustomSqlFieldKey,
    getDbtManifestVersion,
    getModelsFromManifest,
    JobStatusType,
    JobStepType,
    JobType,
    MetricType,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    PreAggregateMissReason,
    ProjectType,
    RedshiftAuthenticationType,
    RequestMethod,
    SessionUser,
    SnowflakeAuthenticationType,
    SupportedDbtAdapter,
    WarehouseTypes,
    WeekDay,
    type ChartSummary,
    type CreateProject,
    type CreateWarehouseCredentials,
    type DbtManifest,
    type DownloadFile,
    type Explore,
    type Job,
    type PossibleAbilities,
    type Project,
    type ProjectDbtSource,
    type RegisteredAccount,
    type UpdateProject,
    type UserWarehouseCredentialsWithSecrets,
    type WarehouseLocation,
} from '@lightdash/common';
import { warehouseClientFromCredentials } from '@lightdash/warehouses';
import { Readable } from 'stream';
import { gunzipSync } from 'zlib';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { PreAggregateModel } from '../../ee/models/PreAggregateModel';
import type { AiAgentService } from '../../ee/services/AiAgentService/AiAgentService';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentModel } from '../../models/ContentModel/ContentModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { EmailModel } from '../../models/EmailModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../models/GroupsModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import { ProjectCompileLogModel } from '../../models/ProjectCompileLogModel';
import { ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
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
import { DbtBaseProjectAdapter } from '../../projectAdapters/dbtBaseProjectAdapter';
import * as projectAdapterModule from '../../projectAdapters/projectAdapter';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import type { ProjectAdapter } from '../../types';
import { metricQueryWithLimit } from '../../utils/csvLimitUtils';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    METRIC_QUERY,
    warehouseClientMock,
} from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { QueryComposer } from '../../utils/QueryBuilder/QueryComposer';
import { AdminNotificationService } from '../AdminNotificationService/AdminNotificationService';
import { PermissionsService } from '../PermissionsService/PermissionsService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UserService } from '../UserService';
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

// Mock worker_threads so the >500 rows test doesn't need a compiled
// dist/services/ProjectService/formatRows.js artifact. In production,
// formatRows runs in a Worker thread for large result sets, but the Worker
// constructor requires the built JS file which only exists after `pnpm build`.
// This mock runs formatRows synchronously in the main thread instead.
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

vi.mock('@lightdash/warehouses', () => ({
    SshTunnel: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockSshTunnel() {
            return {
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
    getQueryTimezone: vi.fn(async () => null),
    getProjectWarehouseConfig: vi.fn(async () => ({
        organizationWarehouseCredentialsUuid: null,
        queryTimezone: null,
    })),
    findExploresFromCache: vi.fn(async () => allExplores),
    findExploreSplitCandidates: vi.fn<
        ProjectModel['findExploreSplitCandidates']
    >(async () => []),
    getAllExploreSummaries: vi.fn(async () =>
        allExplores.map(exploreToSummaryWithAttributes),
    ),
    lockProcess: vi.fn((projectUuid, fun) => fun()),
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
};
const savedChartModel = {
    getAllSpaces: vi.fn(async () => spacesWithSavedCharts),
    find: vi.fn(async () => [] as ChartSummary[]),
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
};
const dashboardModel = {
    savedChartExistsInDashboard: vi.fn(async () => false),
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
    getAllSpaces: vi.fn(async () => spacesWithSavedCharts),
    find: vi.fn(async () => spacesWithSavedCharts),
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
            | 'spacePermissionService'
            | 'provisionPlaygroundProject'
            | 'downloadFileModel'
            | 'getAiAgentService'
            | 'organizationWarehouseCredentialsModel'
            | 'getDataAppCustomSqlProvenance'
            | 'featureFlagModel'
            | 'projectDbtSourcesModel'
        >
    > = {},
) =>
    new ProjectService({
        lightdashConfig,
        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        projectDbtSourcesModel:
            overrides.projectDbtSourcesModel ??
            ({
                copySources: vi.fn(async () => undefined),
            } as unknown as ProjectDbtSourcesModel),
        preAggregateModel: preAggregateModel as unknown as PreAggregateModel,
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
        dashboardModel: dashboardModel as unknown as DashboardModel,
        userWarehouseCredentialsModel: {
            findForProjectWithSecrets: vi.fn(async () => undefined),
        } as unknown as UserWarehouseCredentialsModel,
        warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
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
        userModel: {} as UserModel,
        userOAuthGrantsModel: {} as UserOAuthGrantsModel,
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
        getAiAgentService: overrides.getAiAgentService,
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

describe('ProjectService', () => {
    const { projectUuid } = defaultProject;
    const service = getMockedProjectService(lightdashConfigMock);

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

                await configuredService._getWarehouseClient(
                    targetProjectUuid,
                    warehouseClientMock.credentials,
                );

                expect(
                    vi.mocked(projectModel.getWarehouseClientFromCredentials),
                ).toHaveBeenCalledWith(expect.anything(), {
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

            await configuredService._getWarehouseClient(
                projectUuid,
                warehouseClientMock.credentials,
            );

            expect(
                vi.mocked(projectModel.getWarehouseClientFromCredentials),
            ).toHaveBeenCalledWith(expect.anything(), {
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

        test('returns only render settings to embed tokens', async () => {
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
            const jwtAccount = buildAccount({ accountType: 'jwt' });
            const embedAccount = {
                ...jwtAccount,
                user: {
                    ...jwtAccount.user,
                    ability: new Ability<PossibleAbilities>([
                        { subject: 'Project', action: ['update', 'view'] },
                    ]),
                },
            } as typeof jwtAccount;

            const result = await service.getProject(projectUuid, embedAccount);

            expect(result.warehouseConnection).toEqual({
                type: WarehouseTypes.SNOWFLAKE,
                startOfWeek: WeekDay.SUNDAY,
            });
            expect(result.dbtConnection).toEqual({
                type: DbtProjectType.NONE,
            });
            expect(result.createdByUserUuid).toBeNull();
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
        test('throws ForbiddenError without invoking the provisioner when the user cannot create invite links', async () => {
            const provisionPlaygroundProject = vi.fn(async () => ({
                projectUuid: 'project-uuid',
                created: true,
            }));
            const serviceWithProvisioner = getMockedProjectService(
                lightdashConfigMock,
                { provisionPlaygroundProject },
            );
            const userWithoutInviteLinkPermission: SessionUser = {
                ...user,
                organizationUuid: 'organization-uuid',
                ability: new Ability<PossibleAbilities>([]),
            };

            await expect(
                serviceWithProvisioner.ensurePlaygroundProject(
                    userWithoutInviteLinkPermission,
                ),
            ).rejects.toThrowError(ForbiddenError);

            expect(provisionPlaygroundProject).not.toHaveBeenCalled();
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

    test('attempts content copying when preview access copying fails', async () => {
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
            .mockRejectedValue(new Error('access copy failed'));
        const copyContentSpy = vi
            .spyOn(service, 'copyContentOnPreview')
            .mockResolvedValue();
        (projectModel.get as import('vitest').Mock)
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

        try {
            const result = await service.createWithoutCompile(
                previewUser,
                {
                    name: 'Preview with failed access copy',
                    type: ProjectType.PREVIEW,
                    dbtConnection: { type: DbtProjectType.NONE },
                    upstreamProjectUuid,
                    copyContent: true,
                    dbtVersion: projectWithSensitiveFields.dbtVersion,
                },
                RequestMethod.WEB_APP,
            );

            expect(copyContentSpy).toHaveBeenCalledWith(
                upstreamProjectUuid,
                previewProjectUuid,
                previewUser,
            );
            expect(result).toMatchObject({
                hasContentCopy: true,
                accessCopyError: 'access copy failed',
                contentCopyError: undefined,
            });
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
        } finally {
            validateSpy.mockRestore();
            expirationSpy.mockRestore();
            copyAccessSpy.mockRestore();
            copyContentSpy.mockRestore();
        }
    });

    test('rejects externally supplied embedded DuckDB credentials', async () => {
        await expect(
            service.createWithoutCompile(
                {
                    ...user,
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
                    refreshTablesAndProjectConfig: (
                        user: { userUuid: string },
                        projectUuid: string,
                        requestMethod: RequestMethod,
                    ) => Promise<{
                        explores: unknown[];
                        lightdashProjectConfig: {
                            parameters?: Record<string, unknown>;
                            table_groups?: Record<string, unknown>;
                            defaults?: unknown;
                        };
                    }>;
                }
            ).refreshTablesAndProjectConfig(
                { userUuid: user.userUuid },
                previewProjectUuid,
                RequestMethod.WEB_APP,
            );

        test('reuses the upstream explores and config instead of compiling from dbt', async () => {
            const buildAdapterSpy = vi.spyOn(
                service as unknown as { buildAdapter: () => unknown },
                'buildAdapter',
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

    test('should run sql query', async () => {
        vi.spyOn(analyticsMock, 'track');
        const result = await service.runSqlQuery(user, projectUuid, 'fake sql');

        expect(result).toEqual(resultsWith1Row);
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'query.executed',
            }),
        );
    });
    test('should get project catalog', async () => {
        const results = await service.getCatalog(user, projectUuid);

        expect(results).toEqual(expectedCatalog);
    });
    test('should get tables configuration', async () => {
        const result = await service.getTablesConfiguration(
            account,
            projectUuid,
        );
        expect(result).toEqual(tablesConfiguration);
    });
    test('should update tables configuration', async () => {
        await service.updateTablesConfiguration(
            user,
            projectUuid,
            tablesConfigurationWithNames,
        );
        vi.spyOn(analyticsMock, 'track');
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
            service.warehouseClients = {};
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
            service.warehouseClients = {};

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
            service.warehouseClients = {};

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
                    }) => Promise<CreateWarehouseCredentials>;
                }
            ).getWarehouseCredentials({
                projectUuid,
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
            });

            expect(mergedCredentials).toEqual(
                expect.objectContaining({
                    token: 'user-token',
                    requireUserCredentials: true,
                }),
            );
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
                        }) => Promise<CreateWarehouseCredentials>;
                    }
                ).getWarehouseCredentials({
                    projectUuid,
                    userId: sessionAccount.user.id,
                    isRegisteredUser: true,
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
                service.warehouseClients = {};
                (
                    projectModel.getWarehouseCredentialsForProject as import('vitest').Mock
                ).mockImplementation(async () => projectTrinoCredentials);
            });

            test('should use user credentials when available and not required', async () => {
                const findForProjectWithSecretsMock = mockUserCredentials({
                    uuid: 'user-trino-creds-uuid',
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
            service.warehouseClients = {};

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
                    }) => Promise<Record<string, unknown>>;
                }
            ).getWarehouseCredentials({
                projectUuid,
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
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
            service.warehouseClients = {};

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
                    }) => Promise<Record<string, unknown>>;
                }
            ).getWarehouseCredentials({
                projectUuid,
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
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
            service.warehouseClients = {};

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
                    }) => Promise<Record<string, unknown>>;
                }
            ).getWarehouseCredentials({
                projectUuid,
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
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
            service.warehouseClients = {};

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
                    }) => Promise<Record<string, unknown>>;
                }
            ).getWarehouseCredentials({
                projectUuid,
                userId: sessionAccount.user.id,
                isRegisteredUser: true,
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
            service.warehouseClients = {};

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
            service.warehouseClients = {};

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
            service.warehouseClients = {};

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
            service.warehouseClients = {};

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
            service.warehouseClients = {};

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
            service.warehouseClients = {};

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
            service.warehouseClients = {};

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

    describe('getWarehouseCredentialsForEmbed', () => {
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

            const credentials = await service.getWarehouseCredentialsForEmbed({
                projectUuid,
                // The mock buildAccount returns Account; AnonymousAccount is structurally compatible.
                account: embedAccount as never,
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
                service.getWarehouseCredentialsForEmbed({
                    projectUuid,
                    account: embedAccount as never,
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('getAllExploresSummary', () => {
        test('should get all explores summary without filtering', async () => {
            const result = await service.getAllExploresSummary(
                account,
                projectUuid,
                false,
            );
            expect(result).toEqual(expectedAllExploreSummary);
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
                    refreshTablesAndProjectConfig: () => Promise<unknown>;
                },
                'refreshTablesAndProjectConfig',
            ).mockResolvedValueOnce({
                explores: [
                    validExplore,
                    {
                        name: 'invalid_orders',
                        label: 'Invalid orders',
                        errors: [],
                    },
                ],
                lightdashProjectConfig: {
                    spotlight: {
                        categories: {
                            finance: { label: 'Finance', color: 'blue' },
                        },
                    },
                    parameters: {},
                    table_groups: {},
                },
                projectContext: undefined,
            });
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
                        refreshTablesAndProjectConfig: () => Promise<unknown>;
                    },
                    'refreshTablesAndProjectConfig',
                )
                .mockResolvedValueOnce({
                    explores: [validExplore],
                    lightdashProjectConfig: {
                        spotlight: { categories: {} },
                        parameters: {},
                        table_groups: {},
                    },
                    projectContext: undefined,
                });

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

    describe('testAndCompileProject', () => {
        test('records explore errors for settings-page deploys', async () => {
            const compileJobUuid = 'settings-compile-job-uuid';
            const invalidExplore = {
                name: 'invalid_orders',
                label: 'Invalid orders',
                errors: [],
            };
            const adapter = {
                compileAllExplores: vi.fn(async () => [
                    validExplore,
                    invalidExplore,
                ]),
                getLightdashProjectConfig: vi.fn(async () => ({
                    spotlight: { categories: {} },
                    parameters: {},
                    table_groups: {},
                })),
                destroy: vi.fn(async () => undefined),
            } as unknown as ProjectAdapter;
            const sshTunnel = {
                disconnect: vi.fn(async () => undefined),
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
                sshTunnel,
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
            vi.spyOn(
                service,
                'saveExploresToCacheAndIndexCatalog',
            ).mockResolvedValueOnce('catalog-job-1');

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
                    indexCatalogJobUuid: 'catalog-job-1',
                    errorCount: 1,
                    total: 2,
                },
            });
        });
    });

    describe('searchFieldUniqueValues', () => {
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
            service.warehouseClients = {};
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
            serviceWithCache.warehouseClients = {};

            const runQueryMock = vi.fn(async (_sql: string) => resultsWith1Row);
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));

            // Mock getWarehouseCredentials to simulate per-user credentials
            vi.spyOn(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                serviceWithCache as any,
                'getWarehouseCredentials',
            ).mockImplementation(async (...args: unknown[]) => {
                const { userId } = args[0] as { userId: string };
                return {
                    ...warehouseClientMock.credentials,
                    userWarehouseCredentialsUuid: `cred-${userId}`,
                };
            });

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
            serviceWithCache.warehouseClients = {};

            const runQueryMock = vi.fn(async (_sql: string) => resultsWith1Row);
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockImplementation(() => ({
                ...warehouseClientMock,
                runQuery: runQueryMock,
            }));

            // No userWarehouseCredentialsUuid — shared project credentials
            vi.spyOn(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                serviceWithCache as any,
                'getWarehouseCredentials',
            ).mockImplementation(async () => ({
                ...warehouseClientMock.credentials,
            }));

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

        test('should delegate to projectModel when admin enables the feature', async () => {
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
                hasDefaultUserSpaces: true,
            });

            expect(projectModel.updateDefaultUserSpaces).toHaveBeenCalledTimes(
                1,
            );
            expect(projectModel.updateDefaultUserSpaces).toHaveBeenCalledWith(
                projectUuid,
                true,
            );
        });

        test('should delegate to projectModel when admin disables the feature', async () => {
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
                hasDefaultUserSpaces: false,
            });

            expect(projectModel.updateDefaultUserSpaces).toHaveBeenCalledTimes(
                1,
            );
            expect(projectModel.updateDefaultUserSpaces).toHaveBeenCalledWith(
                projectUuid,
                false,
            );
        });

        test('should queue backfill job when enabling the feature', async () => {
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
                hasDefaultUserSpaces: true,
            });

            expect(
                schedulerClient.backfillDefaultUserSpaces,
            ).toHaveBeenCalledWith({
                organizationUuid: projectSummary.organizationUuid,
                projectUuid,
                userUuid: adminUser.userUuid,
            });
        });

        test('should not queue backfill job when disabling the feature', async () => {
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
                hasDefaultUserSpaces: false,
            });

            expect(
                schedulerClient.backfillDefaultUserSpaces,
            ).not.toHaveBeenCalled();
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
            (
                projectModel.getWarehouseClientFromCredentials as import('vitest').Mock
            ).mockReturnValueOnce({
                getAdapterType: () => SupportedDbtAdapter.POSTGRES,
                runQuery: vi.fn(async () => ({
                    fields: {},
                    rows: [{ naive_instant: '2026-06-08 18:30:00' }],
                })),
            });

            const result = await service.previewDataTimezone(previewAccount, {
                mode: 'edit',
                projectUuid: 'projectUuid',
                warehouseType: WarehouseTypes.POSTGRES,
                dataTimezone: 'America/New_York',
            });

            expect(result.projectTimezone).toBe('UTC');
            expect(result.dataTimezoneApplies).toBe(true);
            expect(result.naive.interpretedAs).toBe('America/New_York');
            expect(result.naive.readAs).toBe('2026-06-08, 14:30:00 (-04:00)');
            expect(result.naive.rendered).toBe('2026-06-08, 18:30:00 (+00:00)');
            expect(result.aware.raw).toBe('2026-06-08, 14:30:00 (+00:00)');
            expect(result.aware.rendered).toBe('2026-06-08, 14:30:00 (+00:00)');
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
        warehouseCredentials: CreateWarehouseCredentials;
        cachedWarehouse: { warehouseCatalog: {}; warehouseTables: {} };
        dbtVersionOption: DbtVersionOptionLatest;
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
    logger: { warn: (...args: unknown[]) => void };
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
        warehouseCredentials: warehouseClientMock.credentials,
        cachedWarehouse: { warehouseCatalog: {}, warehouseTables: {} },
        dbtVersionOption: DbtVersionOptionLatest.LATEST,
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
    ) =>
        ({
            getDbtManifest: vi.fn(async () => ({
                manifest,
                ...(selectedModelIds ? { selectedModelIds } : {}),
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
        );

        expect(warehouseClientFromCredentials).toHaveBeenCalledWith(
            expect.objectContaining({ schema: 'source_schema' }),
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
            })),
            destroy: vi.fn(async () => undefined),
            dbtProjectDir: '/tmp/primary-dbt-project',
        } as unknown as ProjectAdapter;
        const sourceAdapter = {
            getDbtManifest: vi.fn(async () => ({ manifest: sourceManifest })),
            destroy: vi.fn(async () => undefined),
        } as unknown as ProjectAdapter;
        const mergedAdapter = {
            compileAllExplores,
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
        projectModel.saveExploresToCache
            .mockReset()
            .mockImplementationOnce(async () => {
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

        expect(projectModel.saveExploresToCache).toHaveBeenCalledTimes(1);
        expect(projectModel.upsertMergedManifest).toHaveBeenCalledTimes(1);
        expect(
            vi.mocked(projectModel.saveExploresToCache).mock
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
        projectModel.saveExploresToCache
            .mockReset()
            .mockImplementationOnce(async () => {
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

        expect(projectModel.saveExploresToCache).toHaveBeenCalledTimes(1);
        expect(projectModel.upsertMergedManifest).toHaveBeenCalledTimes(1);
        expect(
            vi.mocked(projectModel.saveExploresToCache).mock
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
        projectModel.saveExploresToCache
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
