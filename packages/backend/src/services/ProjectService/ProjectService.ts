import { subject } from '@casl/ability';
import {
    addDashboardFiltersToMetricQuery,
    AdditionalMetric,
    AlreadyExistsError,
    AlreadyProcessingError,
    AndFilterGroup,
    ApiChartAndResults,
    ApiQueryResults,
    ApiSqlQueryResults,
    CacheMetadata,
    CalculateTotalFromQuery,
    ChartSummary,
    CompiledDimension,
    CompiledMetricQuery,
    CompiledTableCalculation,
    convertCustomMetricToDbt,
    countCustomDimensionsInMetricQuery,
    countTotalFilterRules,
    CreateDbtCloudIntegration,
    createDimensionWithGranularity,
    CreateJob,
    CreateProject,
    CreateProjectMember,
    CreateSavedChart,
    CreateWarehouseCredentials,
    CustomFormatType,
    DashboardAvailableFilters,
    DashboardBasicDetails,
    DashboardFilters,
    DateGranularity,
    DbtExposure,
    DbtExposureType,
    DbtProjectType,
    deepEqual,
    DefaultSupportedDbtVersion,
    DimensionType,
    Explore,
    ExploreError,
    FeatureFlags,
    fieldId as getFieldId,
    FilterableDimension,
    FilterableField,
    FilterGroup,
    FilterGroupItem,
    FilterOperator,
    findFieldByIdInExplore,
    ForbiddenError,
    formatRows,
    getDashboardFilterRulesForTables,
    getDateDimension,
    getDimensions,
    getFields,
    getFilterRulesFromGroup,
    getIntrinsicUserAttributes,
    getItemId,
    getMetrics,
    hasIntersection,
    IntrinsicUserAttributes,
    isCustomSqlDimension,
    isDateItem,
    isExploreError,
    isFilterableDimension,
    isUserWithOrg,
    ItemsMap,
    Job,
    JobStatusType,
    JobStepType,
    JobType,
    Metric,
    MetricQuery,
    MetricType,
    MissingWarehouseCredentialsError,
    MostPopularAndRecentlyUpdated,
    NotExistsError,
    NotFoundError,
    ParameterError,
    Project,
    ProjectCatalog,
    ProjectGroupAccess,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectType,
    renderTableCalculationFilterRuleSql,
    replaceDimensionInExplore,
    RequestMethod,
    ResultRow,
    SavedChartsInfoForDashboardAvailableFilters,
    SessionUser,
    snakeCaseName,
    SortField,
    Space,
    SpaceQuery,
    SpaceSummary,
    SummaryExplore,
    TableCalculation,
    TablesConfiguration,
    TableSelectionType,
    UnexpectedServerError,
    UpdatedByUser,
    UpdateMetadata,
    UpdateProject,
    UpdateProjectMember,
    UserAttributeValueMap,
    UserWarehouseCredentials,
    WarehouseClient,
    WarehouseTypes,
    type ApiCreateProjectResults,
} from '@lightdash/common';
import { SshTunnel } from '@lightdash/warehouses';
import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import { uniq } from 'lodash';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { Worker } from 'worker_threads';
import {
    LightdashAnalytics,
    QueryExecutionContext,
} from '../../analytics/LightdashAnalytics';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../../config/parseConfig';
import { errorHandler } from '../../errors';
import { runQueryInMemoryDatabaseContext } from '../../inMemoryTableCalculations';
import Logger from '../../logging/logger';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { EmailModel } from '../../models/EmailModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { isFeatureFlagEnabled } from '../../postHog';
import { projectAdapterFromConfig } from '../../projectAdapters/projectAdapter';
import { buildQuery, CompiledQuery } from '../../queryBuilder';
import { compileMetricQuery } from '../../queryCompiler';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { ProjectAdapter } from '../../types';
import {
    runWorkerThread,
    wrapOtelSpan,
    wrapSentryTransaction,
} from '../../utils';
import { BaseService } from '../BaseService';
import {
    hasDirectAccessToSpace,
    hasViewAccessToSpace,
} from '../SpaceService/SpaceService';
import {
    doesExploreMatchRequiredAttributes,
    exploreHasFilteredAttribute,
    getFilteredExplore,
} from '../UserAttributesService/UserAttributeUtils';

type RunQueryTags = {
    project_uuid?: string;
    user_uuid?: string;
    organization_uuid?: string;
    chart_uuid?: string;
    dashboard_uuid?: string;
};

type ProjectServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    onboardingModel: OnboardingModel;
    savedChartModel: SavedChartModel;
    jobModel: JobModel;
    emailClient: EmailClient;
    spaceModel: SpaceModel;
    sshKeyPairModel: SshKeyPairModel;
    userAttributesModel: UserAttributesModel;
    s3CacheClient: S3CacheClient;
    analyticsModel: AnalyticsModel;
    dashboardModel: DashboardModel;
    emailModel: EmailModel;
    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
    schedulerClient: SchedulerClient;
};

export class ProjectService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    onboardingModel: OnboardingModel;

    warehouseClients: Record<string, WarehouseClient>;

    savedChartModel: SavedChartModel;

    jobModel: JobModel;

    emailClient: EmailClient;

    spaceModel: SpaceModel;

    sshKeyPairModel: SshKeyPairModel;

    userAttributesModel: UserAttributesModel;

    s3CacheClient: S3CacheClient;

    analyticsModel: AnalyticsModel;

    dashboardModel: DashboardModel;

    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;

    emailModel: EmailModel;

    schedulerClient: SchedulerClient;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        onboardingModel,
        savedChartModel,
        jobModel,
        emailClient,
        spaceModel,
        sshKeyPairModel,
        userAttributesModel,
        s3CacheClient,
        analyticsModel,
        dashboardModel,
        userWarehouseCredentialsModel,
        emailModel,
        schedulerClient,
    }: ProjectServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.onboardingModel = onboardingModel;
        this.warehouseClients = {};
        this.savedChartModel = savedChartModel;
        this.jobModel = jobModel;
        this.emailClient = emailClient;
        this.spaceModel = spaceModel;
        this.sshKeyPairModel = sshKeyPairModel;
        this.userAttributesModel = userAttributesModel;
        this.s3CacheClient = s3CacheClient;
        this.analyticsModel = analyticsModel;
        this.dashboardModel = dashboardModel;
        this.userWarehouseCredentialsModel = userWarehouseCredentialsModel;
        this.emailModel = emailModel;
        this.schedulerClient = schedulerClient;
    }

    private async _resolveWarehouseClientSshKeys<
        T extends { warehouseConnection: CreateWarehouseCredentials },
    >(args: T): Promise<T> {
        if (
            (args.warehouseConnection.type === WarehouseTypes.REDSHIFT ||
                args.warehouseConnection.type === WarehouseTypes.POSTGRES) &&
            args.warehouseConnection.useSshTunnel
        ) {
            const publicKey = args.warehouseConnection.sshTunnelPublicKey || '';
            const { privateKey } = await this.sshKeyPairModel.get(publicKey);
            return {
                ...args,
                warehouseConnection: {
                    ...args.warehouseConnection,
                    sshTunnelPrivateKey: privateKey,
                },
            };
        }
        return args;
    }

    private async getWarehouseCredentials(
        projectUuid: string,
        userUuid: string,
    ) {
        let credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        if (credentials.requireUserCredentials) {
            const userWarehouseCredentials =
                await this.userWarehouseCredentialsModel.findForProjectWithSecrets(
                    projectUuid,
                    userUuid,
                    credentials.type,
                );
            if (userWarehouseCredentials === undefined) {
                throw new NotFoundError('User warehouse credentials not found');
            }

            if (
                credentials.type === userWarehouseCredentials.credentials.type
            ) {
                credentials = {
                    ...credentials,
                    ...userWarehouseCredentials.credentials,
                } as CreateWarehouseCredentials; // force type as typescript doesn't know the types match
            } else {
                throw new UnexpectedServerError(
                    'User warehouse credentials are not compatible',
                );
            }
        }
        return credentials;
    }

    private async _getWarehouseClient(
        projectUuid: string,
        credentials: CreateWarehouseCredentials,
        snowflakeVirtualWarehouse?: string,
    ): Promise<{
        warehouseClient: WarehouseClient;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
    }> {
        // Setup SSH tunnel for client (user needs to close this)
        const sshTunnel = new SshTunnel(credentials);
        const warehouseSshCredentials = await sshTunnel.connect();

        const cacheKey = `${projectUuid}${snowflakeVirtualWarehouse || ''}`;
        // Check cache for existing client (always false if ssh tunnel was connected)
        const existingClient = this.warehouseClients[cacheKey] as
            | typeof this.warehouseClients[string]
            | undefined;
        if (
            existingClient &&
            deepEqual(existingClient.credentials, warehouseSshCredentials)
        ) {
            // if existing client uses identical credentials, use it
            return { warehouseClient: existingClient, sshTunnel };
        }
        // otherwise create a new client and cache for future use
        const credentialsWithWarehouse =
            credentials.type === WarehouseTypes.SNOWFLAKE
                ? {
                      ...warehouseSshCredentials,
                      warehouse:
                          snowflakeVirtualWarehouse || credentials.warehouse,
                  }
                : warehouseSshCredentials;
        const client = this.projectModel.getWarehouseClientFromCredentials(
            credentialsWithWarehouse,
        );
        this.warehouseClients[cacheKey] = client;
        return { warehouseClient: client, sshTunnel };
    }

    async getProject(projectUuid: string, user: SessionUser): Promise<Project> {
        const project = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return project;
    }

    async createWithoutCompile(
        user: SessionUser,
        data: CreateProject,
        method: RequestMethod,
    ): Promise<ApiCreateProjectResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (
            user.ability.cannot('create', 'Job') ||
            user.ability.cannot('create', 'Project')
        ) {
            throw new ForbiddenError();
        }
        const createProject = await this._resolveWarehouseClientSshKeys(data);
        const projectUuid = await this.projectModel.create(
            user.organizationUuid,
            createProject,
        );

        // Give admin user permissions to user who created this project even if he is an admin
        // TODO do not do this if we are copying data from another project
        if (user.email) {
            await this.projectModel.createProjectAccess(
                projectUuid,
                user.email,
                ProjectMemberRole.ADMIN,
            );
        }

        this.analytics.track({
            event: 'project.created',
            userId: user.userUuid,
            properties: {
                projectName: createProject.name,
                projectId: projectUuid,
                projectType: createProject.dbtConnection.type,
                warehouseConnectionType: createProject.warehouseConnection.type,
                organizationId: user.organizationUuid,
                dbtConnectionType: createProject.dbtConnection.type,
                isPreview: createProject.type === ProjectType.PREVIEW,
                method,
                copiedFromProjectUuid: data.upstreamProjectUuid,
            },
        });

        let hasContentCopy = false;

        if (data.upstreamProjectUuid) {
            try {
                const { organizationUuid } = await this.projectModel.getSummary(
                    data.upstreamProjectUuid,
                );
                // We only allow copying from projects if the user is an admin until we remove the `createProjectAccess` call above
                if (
                    user.ability.cannot(
                        'create',
                        subject('Project', {
                            organizationUuid,
                            projectUuid: data.upstreamProjectUuid,
                        }),
                    )
                ) {
                    throw new ForbiddenError();
                }
                await this.copyContentOnPreview(
                    data.upstreamProjectUuid,
                    projectUuid,
                    user,
                );

                hasContentCopy = true;
            } catch (e) {
                Sentry.captureException(e);
                this.logger.error(`Unable to copy content on preview ${e}`);
            }
        }

        const project = await this.projectModel.get(projectUuid);

        return {
            hasContentCopy,
            project,
        };
    }

    async create(
        user: SessionUser,
        data: CreateProject,
        method: RequestMethod,
    ): Promise<{ jobUuid: string }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (
            user.ability.cannot('create', 'Job') ||
            user.ability.cannot('create', 'Project')
        ) {
            throw new ForbiddenError();
        }

        const createProject = await this._resolveWarehouseClientSshKeys(data);

        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.CREATE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            projectUuid: undefined,
            userUuid: user.userUuid,
            steps: [
                { stepType: JobStepType.TESTING_ADAPTOR },
                { stepType: JobStepType.COMPILING },
                { stepType: JobStepType.CREATING_PROJECT },
            ],
        };

        const doAsyncWork = async () => {
            try {
                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.RUNNING,
                });
                const { adapter, sshTunnel } = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.TESTING_ADAPTOR,
                    async () =>
                        ProjectService.testProjectAdapter(createProject, user),
                );

                const explores = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.COMPILING,
                    async () => {
                        try {
                            return await adapter.compileAllExplores();
                        } finally {
                            await adapter.destroy();
                            await sshTunnel.disconnect();
                        }
                    },
                );

                const projectUuid = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.CREATING_PROJECT,
                    async () =>
                        this.projectModel.create(
                            user.organizationUuid,
                            createProject,
                        ),
                );

                // Give admin user permissions to user who created this project even if he is an admin
                if (user.email) {
                    await this.projectModel.createProjectAccess(
                        projectUuid,
                        user.email,
                        ProjectMemberRole.ADMIN,
                    );
                }

                await this.projectModel.saveExploresToCache(
                    projectUuid,
                    explores,
                );

                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.DONE,
                    jobResults: {
                        projectUuid,
                    },
                });
                this.analytics.track({
                    event: 'project.created',
                    userId: user.userUuid,
                    properties: {
                        projectName: createProject.name,
                        projectId: projectUuid,
                        projectType: createProject.dbtConnection.type,
                        warehouseConnectionType:
                            createProject.warehouseConnection.type,
                        organizationId: user.organizationUuid,
                        dbtConnectionType: createProject.dbtConnection.type,
                        isPreview: createProject.type === ProjectType.PREVIEW,
                        method,
                    },
                });
            } catch (error) {
                await this.jobModel.setPendingJobsToSkipped(job.jobUuid);
                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.ERROR,
                });
                throw error;
            }
        };

        await this.jobModel.create(job);
        doAsyncWork().catch((e) =>
            this.logger.error(`Error running background job: ${e}`),
        );
        return {
            jobUuid: job.jobUuid,
        };
    }

    async setExplores(
        user: SessionUser,
        projectUuid: string,
        explores: (Explore | ExploreError)[],
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'update',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.projectModel.saveExploresToCache(projectUuid, explores);

        await this.schedulerClient.generateValidation({
            userUuid: user.userUuid,
            projectUuid,
            context: 'cli',
            organizationUuid: user.organizationUuid,
        });
    }

    async updateAndScheduleAsyncWork(
        projectUuid: string,
        user: SessionUser,
        data: UpdateProject,
        method: RequestMethod,
    ): Promise<{ jobUuid: string }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const savedProject = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid: savedProject.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            projectUuid: undefined,
            userUuid: user.userUuid,
            steps: [
                { stepType: JobStepType.TESTING_ADAPTOR },
                ...(savedProject.dbtConnection.type === DbtProjectType.NONE
                    ? []
                    : [{ stepType: JobStepType.COMPILING }]),
            ],
        };
        const createProject = await this._resolveWarehouseClientSshKeys(data);
        const updatedProject = ProjectModel.mergeMissingProjectConfigSecrets(
            createProject,
            savedProject,
        );

        await this.projectModel.update(projectUuid, updatedProject);
        await this.jobModel.create(job);

        if (updatedProject.dbtConnection.type !== DbtProjectType.NONE) {
            await this.schedulerClient.testAndCompileProject({
                organizationUuid: user.organizationUuid,
                createdByUserUuid: user.userUuid,
                projectUuid,
                requestMethod: method,
                jobUuid: job.jobUuid,
                isPreview: savedProject.type === ProjectType.PREVIEW,
            });
        } else {
            // Nothing to test and compile, just update the job status
            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.DONE,
                jobResults: {
                    projectUuid,
                },
            });
        }
        return {
            jobUuid: job.jobUuid,
        };
    }

    async testAndCompileProject(
        user: SessionUser,
        projectUuid: string,
        method: RequestMethod,
        jobUuid: string,
    ) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const updatedProject = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );

        if (user.ability.cannot('update', subject('Project', updatedProject))) {
            throw new ForbiddenError();
        }

        if (updatedProject.warehouseConnection === undefined) {
            throw new Error(
                `Missing warehouseConnection details on project ${projectUuid}'}`,
            );
        }

        // This job is the job model we use to compile projects
        // This is not the graphile Job id we use on scheduler
        // TODO: remove this old job method and replace with scheduler log details
        const job: CreateJob = {
            jobUuid,
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            projectUuid: undefined,
            userUuid: user.userUuid,
            steps: [
                { stepType: JobStepType.TESTING_ADAPTOR },
                ...(updatedProject.dbtConnection.type === DbtProjectType.NONE
                    ? []
                    : [{ stepType: JobStepType.COMPILING }]),
            ],
        };

        try {
            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.RUNNING,
            });
            const { adapter, sshTunnel } = await this.jobModel.tryJobStep(
                job.jobUuid,
                JobStepType.TESTING_ADAPTOR,
                async () =>
                    ProjectService.testProjectAdapter(
                        updatedProject as UpdateProject,
                        user,
                    ),
            );
            if (updatedProject.dbtConnection.type !== DbtProjectType.NONE) {
                const explores = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.COMPILING,
                    async () => {
                        try {
                            return await adapter.compileAllExplores();
                        } finally {
                            await adapter.destroy();
                            await sshTunnel.disconnect();
                        }
                    },
                );
                await this.projectModel.saveExploresToCache(
                    projectUuid,
                    explores,
                );
            }

            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.DONE,
                jobResults: {
                    projectUuid,
                },
            });
            this.analytics.track({
                event: 'project.updated',
                userId: user.userUuid,
                properties: {
                    projectName: updatedProject.name,
                    projectId: projectUuid,
                    projectType: updatedProject.dbtConnection.type,
                    warehouseConnectionType:
                        updatedProject.warehouseConnection!.type,
                    organizationId: user.organizationUuid,
                    dbtConnectionType: updatedProject.dbtConnection.type,
                    isPreview: updatedProject.type === ProjectType.PREVIEW,
                    method,
                },
            });
        } catch (error) {
            await this.jobModel.setPendingJobsToSkipped(job.jobUuid);
            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.ERROR,
            });
            throw error;
        }
    }

    private static async testProjectAdapter(
        data: UpdateProject,
        _user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<{
        adapter: ProjectAdapter;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
    }> {
        const sshTunnel = new SshTunnel(data.warehouseConnection);
        await sshTunnel.connect();
        const adapter = await projectAdapterFromConfig(
            data.dbtConnection,
            sshTunnel.overrideCredentials,
            {
                warehouseCatalog: undefined,
                onWarehouseCatalogChange: () => {},
            },
            data.dbtVersion || DefaultSupportedDbtVersion,
        );
        try {
            await adapter.test();
        } catch (e) {
            Logger.error(`Error testing project adapter: ${e}`);
            await adapter.destroy();
            await sshTunnel.disconnect();
            throw e;
        }
        return { adapter, sshTunnel };
    }

    async delete(projectUuid: string, user: SessionUser): Promise<void> {
        const { organizationUuid, type } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'delete',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.delete(projectUuid);

        this.analytics.track({
            event: 'project.deleted',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                isPreview: type === ProjectType.PREVIEW,
            },
        });
    }

    private async buildAdapter(
        projectUuid: string,
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<{
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
        adapter: ProjectAdapter;
    }> {
        const project = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );
        if (!project.warehouseConnection) {
            throw new MissingWarehouseCredentialsError(
                'Warehouse credentials must be provided to connect to your dbt project',
            );
        }
        const cachedWarehouseCatalog =
            await this.projectModel.getWarehouseFromCache(projectUuid);
        const sshTunnel = new SshTunnel(project.warehouseConnection);
        await sshTunnel.connect();

        const adapter = await projectAdapterFromConfig(
            project.dbtConnection,
            sshTunnel.overrideCredentials,
            {
                warehouseCatalog: cachedWarehouseCatalog,
                onWarehouseCatalogChange: async (warehouseCatalog) => {
                    await this.projectModel.saveWarehouseToCache(
                        projectUuid,
                        warehouseCatalog,
                    );
                },
            },
            project.dbtVersion || DefaultSupportedDbtVersion,
        );
        return { adapter, sshTunnel };
    }

    static updateExploreWithGranularity(
        explore: Explore,
        metricQuery: MetricQuery,
        warehouseClient: WarehouseClient,
        granularity?: DateGranularity,
    ): Explore {
        if (granularity) {
            const timeDimensionsMap: Record<string, CompiledDimension> =
                Object.values(explore.tables).reduce<
                    Record<string, CompiledDimension>
                >((acc, t) => {
                    Object.values(t.dimensions).forEach((dim) => {
                        if (
                            dim.type === DimensionType.TIMESTAMP ||
                            dim.type === DimensionType.DATE
                        ) {
                            acc[getItemId(dim)] = dim;
                        }
                    });
                    return acc;
                }, {});

            const firstTimeDimensionIdInMetricQuery =
                metricQuery.dimensions.find(
                    (dimension) => !!timeDimensionsMap[dimension],
                );
            if (firstTimeDimensionIdInMetricQuery) {
                const dimToOverride =
                    timeDimensionsMap[firstTimeDimensionIdInMetricQuery];
                const { baseDimensionId } = getDateDimension(
                    firstTimeDimensionIdInMetricQuery,
                );
                const baseTimeDimension =
                    dimToOverride.timeInterval && baseDimensionId
                        ? timeDimensionsMap[baseDimensionId]
                        : dimToOverride;
                const dimWithGranularityOverride =
                    createDimensionWithGranularity(
                        dimToOverride.name,
                        baseTimeDimension,
                        explore,
                        warehouseClient,
                        granularity,
                    );
                return replaceDimensionInExplore(
                    explore,
                    dimWithGranularityOverride,
                );
            }
        }
        return explore;
    }

    /**
     * Based on _compileQuery, this -temporary- method handles isolating and generating
     * a separate query for table calculations on DuckDB.
     *
     * Once the feature is proven and ready to be rolled out, _compileQuery and the query builder
     * will be expanded to support this behavior natively.
     */
    private static async _compileMetricQueryWithNewTableCalculationsEngine(
        metricQuery: MetricQuery,
        explore: Explore,
        warehouseClient: WarehouseClient,
        intrinsicUserAttributes: IntrinsicUserAttributes,
        userAttributes: UserAttributeValueMap,
        granularity?: DateGranularity,
    ): Promise<[CompiledQuery, CompiledQuery]> {
        const exploreWithOverride = ProjectService.updateExploreWithGranularity(
            explore,
            metricQuery,
            warehouseClient,
            granularity,
        );

        const {
            compiledMetricQuery: originalCompiledMetricQuery,
            compiledMetricQueryWithoutTableCalculations,
            compiledTableCalculations,
            tableCalculationFilters,
            tableCalculations,
        } = ProjectService.isolateTableCalculationsFromCompiledMetricsQuery(
            compileMetricQuery({
                explore: exploreWithOverride,
                metricQuery,
                warehouseClient,
            }),
        );

        /**
         * Generate a new SELECT statement with all of our original columns, as well as
         * table calculation columns/aggregates:
         */
        const selectFrom = [
            '*',
            ...compiledTableCalculations.map(
                ({ name, compiledSql }) => `${compiledSql} AS ${name}`,
            ),
        ];

        /**
         * Render table calculation filter rules for compatibility with DuckDB.
         */
        const filterRules = getFilterRulesFromGroup(
            tableCalculationFilters as FilterGroup,
        );

        const renderedFilters = filterRules.map((filterRule) => {
            const field = compiledTableCalculations.find(
                ({ name }) =>
                    `table_calculation_${name}` === filterRule.target.fieldId,
            );

            /**
             * If a matching field cannot be found, we insert a placeholder expression.
             */
            if (!field) {
                return '1=1';
            }

            return renderTableCalculationFilterRuleSql(
                filterRule,
                field,
                '"',
                "'",
                '\\',
                warehouseClient.getAdapterType(),
                warehouseClient.getStartOfWeek(),
            );
        });

        const whereClause =
            renderedFilters.length > 0
                ? `WHERE ${renderedFilters.join('\nAND ')}`
                : '';

        /**
         * We apply sorting at this stage, so we need to access sort data from the
         * original compiled query.
         */
        const sorts = originalCompiledMetricQuery.sorts.map(
            ({ descending, fieldId }) =>
                `${fieldId} ${descending ? 'DESC' : 'ASC'}`,
        );

        const orderByClause =
            sorts.length > 0 ? `ORDER BY ${sorts.join(', ')}` : '';

        const primaryQuery = buildQuery({
            explore: exploreWithOverride,
            compiledMetricQuery: compiledMetricQueryWithoutTableCalculations,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
        });

        const tableCalculationsSubQuery: CompiledQuery = {
            fields: tableCalculations.reduce((acc, tableCalculation) => {
                acc[tableCalculation.name] = tableCalculation;

                return acc;
            }, {} as ItemsMap),
            query: `
                WITH results AS (
                    SELECT ${selectFrom.join(',\n')}
                    FROM _
                )

                SELECT * FROM results
                ${whereClause}
                ${orderByClause}
            ;`,
            hasExampleMetric: false,
        };

        return [primaryQuery, tableCalculationsSubQuery];
    }

    private static async _compileQuery(
        metricQuery: MetricQuery,
        explore: Explore,
        warehouseClient: WarehouseClient,
        intrinsicUserAttributes: IntrinsicUserAttributes,
        userAttributes: UserAttributeValueMap,
        granularity?: DateGranularity,
    ): Promise<CompiledQuery> {
        const exploreWithOverride = ProjectService.updateExploreWithGranularity(
            explore,
            metricQuery,
            warehouseClient,
            granularity,
        );

        const compiledMetricQuery = compileMetricQuery({
            explore: exploreWithOverride,
            metricQuery,
            warehouseClient,
        });

        const buildQueryResult = buildQuery({
            explore: exploreWithOverride,
            compiledMetricQuery,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
        });

        return buildQueryResult;
    }

    /**
     * Modifies a compiled metric query to remove any references to table calculations, and
     * returns the isolated portions separately.
     *
     * This is a temporary approach to avoid poluting the query compiler while rolling-out
     * improvements to table calculations handling.
     */
    private static isolateTableCalculationsFromCompiledMetricsQuery(
        compiledMetricQuery: CompiledMetricQuery,
    ): {
        compiledMetricQuery: CompiledMetricQuery;
        compiledMetricQueryWithoutTableCalculations: CompiledMetricQuery;
        tableCalculationFilters?: FilterGroupItem;
        tableCalculations: TableCalculation[];
        compiledTableCalculations: CompiledTableCalculation[];
    } {
        const {
            filters,
            tableCalculations,
            compiledTableCalculations,
            sorts,
            ...otherProps
        } = compiledMetricQuery;

        return {
            compiledMetricQuery,
            compiledMetricQueryWithoutTableCalculations: {
                ...otherProps,
                tableCalculations: [],
                compiledTableCalculations: [],
                filters: {
                    ...filters,
                    tableCalculations: undefined,
                },
                sorts: [],
            },

            tableCalculationFilters: filters.tableCalculations,
            tableCalculations,
            compiledTableCalculations,
        };
    }

    async compileQuery(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
    ) {
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        const explore = await this.getExplore(user, projectUuid, exploreName);

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            explore.warehouse,
        );
        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        const isTimezoneEnabled = await isFeatureFlagEnabled(
            FeatureFlags.EnableUserTimezones,
            {
                userUuid: user.userUuid,
                organizationUuid,
            },
        );
        const timezoneMetricQuery = {
            ...metricQuery,
            timezone: isTimezoneEnabled ? metricQuery.timezone : undefined,
        };

        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
            user.userUuid,
        );
        const intrinsicUserAttributes = emailStatus.isVerified
            ? getIntrinsicUserAttributes(user)
            : {};

        const compiledQuery = await ProjectService._compileQuery(
            timezoneMetricQuery,
            explore,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
        );
        await sshTunnel.disconnect();
        return compiledQuery;
    }

    private metricQueryWithLimit(
        metricQuery: MetricQuery,
        csvLimit: number | null | undefined,
    ): MetricQuery {
        if (csvLimit === undefined) {
            if (metricQuery.limit > this.lightdashConfig.query?.maxLimit) {
                throw new ParameterError(
                    `Query limit can not exceed ${this.lightdashConfig.query.maxLimit}`,
                );
            }
            return metricQuery;
        }

        const numberColumns =
            metricQuery.dimensions.length +
            metricQuery.metrics.length +
            metricQuery.tableCalculations.length;
        if (numberColumns === 0)
            throw new ParameterError(
                'Query must have at least one dimension or metric',
            );

        const cellsLimit = this.lightdashConfig.query?.csvCellsLimit || 100000;
        const maxRows = Math.floor(cellsLimit / numberColumns);
        const csvRowLimit =
            csvLimit === null ? maxRows : Math.min(csvLimit, maxRows);

        return {
            ...metricQuery,
            limit: csvRowLimit,
        };
    }

    async runUnderlyingDataQuery(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
        csvLimit: number | null | undefined,
    ): Promise<ApiQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'view',
                subject('UnderlyingData', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        const queryTags: RunQueryTags = {
            organization_uuid: projectUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
        };

        return this.runQueryAndFormatRows({
            user,
            metricQuery,
            projectUuid,
            exploreName,
            csvLimit,
            context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
            queryTags,
        });
    }

    async runViewChartQuery({
        user,
        chartUuid,
        versionUuid,
        invalidateCache,
    }: {
        user: SessionUser;
        chartUuid: string;
        versionUuid?: string;
        invalidateCache?: boolean;
    }): Promise<ApiQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const savedChart = await this.savedChartModel.get(
            chartUuid,
            versionUuid,
        );
        const { organizationUuid, projectUuid } = savedChart;

        const [space, explore] = await Promise.all([
            this.spaceModel.getSpaceSummary(savedChart.spaceUuid),
            this.getExplore(
                user,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { metricQuery } = savedChart;

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            chart_uuid: chartUuid,
        };

        const { cacheMetadata, rows, fields } =
            await this.runQueryAndFormatRows({
                user,
                metricQuery,
                projectUuid,
                exploreName: savedChart.tableName,
                csvLimit: undefined,
                context: QueryExecutionContext.CHART,
                queryTags,
                invalidateCache,
                explore,
            });

        return {
            metricQuery,
            cacheMetadata,
            rows,
            fields,
        };
    }

    async getChartAndResults({
        user,
        chartUuid,
        dashboardFilters,
        invalidateCache,
        dashboardSorts,
        granularity,
        dashboardUuid,
    }: {
        user: SessionUser;
        chartUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        invalidateCache?: boolean;
        dashboardSorts: SortField[];
        granularity?: DateGranularity;
    }): Promise<ApiChartAndResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const savedChart = await this.savedChartModel.get(chartUuid);
        const { organizationUuid, projectUuid } = savedChart;

        const [space, explore] = await Promise.all([
            this.spaceModel.getSpaceSummary(savedChart.spaceUuid),
            this.getExplore(
                user,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.analyticsModel.addChartViewEvent(
            savedChart.uuid,
            user.userUuid,
        );

        const tables = Object.keys(explore.tables);
        const appliedDashboardFilters = {
            dimensions: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.dimensions,
            ),
            metrics: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.metrics,
            ),
            tableCalculations: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.tableCalculations,
            ),
        };

        const metricQueryWithDashboardOverrides: MetricQuery = {
            ...addDashboardFiltersToMetricQuery(
                savedChart.metricQuery,
                appliedDashboardFilters,
            ),
            sorts:
                dashboardSorts && dashboardSorts.length > 0
                    ? dashboardSorts
                    : savedChart.metricQuery.sorts,
        };

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            chart_uuid: chartUuid,
            dashboard_uuid: dashboardUuid,
        };

        const exploreDimensions = getDimensions(explore);

        const { cacheMetadata, rows, fields } =
            await this.runQueryAndFormatRows({
                user,
                metricQuery: metricQueryWithDashboardOverrides,
                projectUuid,
                exploreName: savedChart.tableName,
                csvLimit: undefined,
                context: QueryExecutionContext.DASHBOARD,
                queryTags,
                invalidateCache,
                explore,
                granularity,
            });

        const metricQueryDimensions = [
            ...metricQueryWithDashboardOverrides.dimensions,
            ...(metricQueryWithDashboardOverrides.customDimensions ?? []),
        ];
        const hasADateDimension = exploreDimensions.find(
            (c) =>
                metricQueryDimensions.includes(getFieldId(c)) && isDateItem(c),
        );

        if (hasADateDimension) {
            metricQueryWithDashboardOverrides.metadata = {
                hasADateDimension: {
                    name: hasADateDimension.name,
                    label: hasADateDimension.label,
                },
            };
        }

        return {
            chart: { ...savedChart, isPrivate: space.isPrivate, access },
            explore,
            metricQuery: metricQueryWithDashboardOverrides,
            cacheMetadata,
            rows,
            appliedDashboardFilters,
            fields,
        };
    }

    async runExploreQuery(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
        csvLimit: number | null | undefined,
        dateZoomGranularity?: DateGranularity,
    ): Promise<ApiQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
        };

        const explore = await this.getExplore(
            user,
            projectUuid,
            exploreName,
            organizationUuid,
        );

        return this.runQueryAndFormatRows({
            user,
            metricQuery,
            projectUuid,
            exploreName,
            explore,
            csvLimit,
            context: QueryExecutionContext.EXPLORE,
            queryTags,
            granularity: dateZoomGranularity,
        });
    }

    private async runQueryAndFormatRows({
        user,
        metricQuery,
        projectUuid,
        exploreName,
        csvLimit,
        context,
        queryTags,
        invalidateCache,
        explore: validExplore,
        granularity,
    }: {
        user: SessionUser;
        metricQuery: MetricQuery;
        projectUuid: string;
        exploreName: string;
        csvLimit: number | null | undefined;
        context: QueryExecutionContext;
        queryTags?: RunQueryTags;
        invalidateCache?: boolean;
        explore?: Explore;
        granularity?: DateGranularity;
    }): Promise<ApiQueryResults> {
        return wrapOtelSpan(
            'ProjectService.runQueryAndFormatRows',
            {},
            async (span) => {
                const explore =
                    validExplore ??
                    (await this.getExplore(user, projectUuid, exploreName));

                const { rows, cacheMetadata, fields } =
                    await this.runMetricQuery({
                        user,
                        metricQuery,
                        projectUuid,
                        exploreName,
                        csvLimit,
                        context,
                        queryTags,
                        invalidateCache,
                        explore,
                        granularity,
                    });
                span.setAttribute('rows', rows.length);

                const { warehouseConnection } =
                    await this.projectModel.getWithSensitiveFields(projectUuid);
                if (warehouseConnection) {
                    span.setAttribute('warehouse', warehouseConnection?.type);
                }

                // If there are more than 500 rows, we need to format them in a background job
                const formattedRows = await wrapOtelSpan(
                    'ProjectService.runQueryAndFormatRows.formatRows',
                    {
                        rows: rows.length,
                        warehouse: warehouseConnection?.type,
                    },
                    async (formatRowsSpan) =>
                        wrapSentryTransaction<ResultRow[]>(
                            'ProjectService.runQueryAndFormatRows.formatRows',
                            {
                                rows: rows.length,
                                warehouse: warehouseConnection?.type,
                            },
                            async () => {
                                const useWorker = rows.length > 500;
                                formatRowsSpan.setAttribute(
                                    'useWorker',
                                    useWorker,
                                );

                                return useWorker
                                    ? runWorkerThread<ResultRow[]>(
                                          new Worker(
                                              './dist/services/ProjectService/formatRows.js',
                                              {
                                                  workerData: {
                                                      rows,
                                                      itemMap: fields,
                                                  },
                                              },
                                          ),
                                      )
                                    : formatRows(rows, fields);
                            },
                        ),
                );

                return {
                    rows: formattedRows,
                    metricQuery,
                    cacheMetadata,
                    fields,
                };
            },
        );
    }

    async getResultsForChart(
        user: SessionUser,
        chartUuid: string,
    ): Promise<{ rows: Record<string, any>[]; cacheMetadata: CacheMetadata }> {
        return wrapSentryTransaction(
            'getResultsForChartWithWarehouseQuery',
            {
                userUuid: user.userUuid,
                chartUuid,
            },
            async () => {
                const chart = await this.savedChartModel.get(chartUuid);
                const { metricQuery } = chart;
                const exploreId = chart.tableName;

                return this.runMetricQuery({
                    user,
                    metricQuery,
                    projectUuid: chart.projectUuid,
                    exploreName: exploreId,
                    csvLimit: undefined,
                    context: QueryExecutionContext.GSHEETS,
                });
            },
        );
    }

    private async getResultsFromCacheOrWarehouse({
        projectUuid,
        context,
        warehouseClient,
        query,
        metricQuery,
        queryTags,
        invalidateCache,
        tableCalculationsSubQuery,
    }: {
        projectUuid: string;
        context: QueryExecutionContext;
        warehouseClient: WarehouseClient;
        query: any;
        metricQuery: MetricQuery;
        queryTags?: RunQueryTags;
        invalidateCache?: boolean;
        tableCalculationsSubQuery?: CompiledQuery;
    }): Promise<{
        rows: Record<string, any>[];
        cacheMetadata: CacheMetadata;
    }> {
        return wrapOtelSpan(
            'ProjectService.getResultsFromCacheOrWarehouse',
            {},
            async (span) => {
                // TODO: put this hash function in a util somewhere
                const queryHashKey = metricQuery.timezone
                    ? `${projectUuid}.${query}.${metricQuery.timezone}`
                    : `${projectUuid}.${query}`;
                const queryHash = crypto
                    .createHash('sha256')
                    .update(queryHashKey)
                    .digest('hex');

                span.setAttribute('queryHash', queryHash);
                span.setAttribute('cacheHit', false);

                if (
                    this.lightdashConfig.resultsCache?.enabled &&
                    !invalidateCache
                ) {
                    const cacheEntryMetadata = await this.s3CacheClient
                        .getResultsMetadata(queryHash)
                        .catch((e) => undefined); // ignore since error is tracked in s3Client

                    if (
                        cacheEntryMetadata?.LastModified &&
                        new Date().getTime() -
                            cacheEntryMetadata.LastModified.getTime() <
                            this.lightdashConfig.resultsCache
                                .cacheStateTimeSeconds *
                                1000
                    ) {
                        this.logger.debug(
                            `Getting data from cache, key: ${queryHash}`,
                        );
                        const cacheEntry = await this.s3CacheClient.getResults(
                            queryHash,
                        );
                        const stringResults =
                            await cacheEntry.Body?.transformToString();
                        if (stringResults) {
                            try {
                                span.setAttribute('cacheHit', true);
                                return {
                                    rows: JSON.parse(stringResults).rows,
                                    cacheMetadata: {
                                        cacheHit: true,
                                        cacheUpdatedTime:
                                            cacheEntryMetadata?.LastModified,
                                    },
                                };
                            } catch (e) {
                                this.logger.error(
                                    'Error parsing cache results:',
                                    e,
                                );
                            }
                        }
                    }
                }

                this.logger.debug(
                    `Run query against warehouse warehouse with timezone ${metricQuery.timezone}`,
                );
                const warehouseResults = await wrapOtelSpan(
                    'runWarehouseQuery',
                    {
                        query,
                        queryTags: JSON.stringify(queryTags),
                        context,
                        metricQuery: JSON.stringify(metricQuery),
                        type: warehouseClient.credentials.type,
                    },
                    async () =>
                        warehouseClient.runQuery(
                            query,
                            queryTags,
                            metricQuery.timezone,
                        ),
                );

                /**
                 * If we have a table calculations sub-query, we run it against the in-memory
                 * database, essentially generating a new result set based on the upstream
                 * warehouse results.
                 *
                 * At this point, we also merge the two sets of fields - the field set used for
                 * the warehouse query, and the follow-up table calculation fields.
                 */
                const warehouseResultsWithTableCalculations =
                    tableCalculationsSubQuery
                        ? {
                              rows: await runQueryInMemoryDatabaseContext({
                                  query: tableCalculationsSubQuery.query,
                                  tables: {
                                      _: warehouseResults,
                                  },
                              }),

                              /**
                               *
                               */
                              fields: {
                                  ...warehouseResults.fields,
                                  ...tableCalculationsSubQuery.fields,
                              },
                          }
                        : warehouseResults;

                if (this.lightdashConfig.resultsCache?.enabled) {
                    this.logger.debug(
                        `Writing data to cache with key ${queryHash}`,
                    );
                    const buffer = Buffer.from(
                        JSON.stringify(warehouseResultsWithTableCalculations),
                    );
                    // fire and forget
                    this.s3CacheClient
                        .uploadResults(queryHash, buffer, queryTags)
                        .catch((e) => undefined); // ignore since error is tracked in s3Client
                }

                return {
                    rows: warehouseResultsWithTableCalculations.rows,
                    cacheMetadata: { cacheHit: false },
                };
            },
        );
    }

    async runMetricQuery({
        user,
        metricQuery,
        projectUuid,
        exploreName,
        csvLimit,
        context,
        queryTags,
        invalidateCache,
        explore: loadedExplore,
        granularity,
    }: {
        user: SessionUser;
        metricQuery: MetricQuery;
        projectUuid: string;
        exploreName: string;
        csvLimit: number | null | undefined;
        context: QueryExecutionContext;
        queryTags?: RunQueryTags;
        invalidateCache?: boolean;
        explore?: Explore;
        granularity?: DateGranularity;
    }): Promise<{
        rows: Record<string, any>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
    }> {
        const tracer = opentelemetry.trace.getTracer('default');
        return tracer.startActiveSpan(
            'ProjectService.runMetricQuery',
            async (span) => {
                try {
                    if (!isUserWithOrg(user)) {
                        throw new ForbiddenError(
                            'User is not part of an organization',
                        );
                    }

                    /**
                     * If the feature flag is enabled, and we actually have any table calculations
                     * to process, we use the new in-memory table calculations engine. This avoid us
                     * spinning-up a new DuckDB database pointlessly.
                     *
                     * In a follow-up after initial testing, this check should be done somewhere further
                     * down the stack.
                     */
                    const newTableCalculationsFeatureFlagEnabled =
                        await isFeatureFlagEnabled(
                            FeatureFlags.UseInMemoryTableCalculations,
                            user,
                        );

                    const useNewTableCalculationsEngine =
                        newTableCalculationsFeatureFlagEnabled &&
                        metricQuery.tableCalculations.length > 0;

                    const { organizationUuid } =
                        await this.projectModel.getSummary(projectUuid);

                    if (
                        user.ability.cannot(
                            'view',
                            subject('Project', {
                                organizationUuid,
                                projectUuid,
                            }),
                        )
                    ) {
                        throw new ForbiddenError();
                    }

                    const metricQueryWithLimit = this.metricQueryWithLimit(
                        metricQuery,
                        csvLimit,
                    );

                    const explore =
                        loadedExplore ??
                        (await this.getExplore(user, projectUuid, exploreName));

                    const { warehouseClient, sshTunnel } =
                        await this._getWarehouseClient(
                            projectUuid,
                            await this.getWarehouseCredentials(
                                projectUuid,
                                user.userUuid,
                            ),
                            explore.warehouse,
                        );

                    const userAttributes =
                        await this.userAttributesModel.getAttributeValuesForOrgMember(
                            {
                                organizationUuid,
                                userUuid: user.userUuid,
                            },
                        );

                    const emailStatus =
                        await this.emailModel.getPrimaryEmailStatus(
                            user.userUuid,
                        );
                    const intrinsicUserAttributes = emailStatus.isVerified
                        ? getIntrinsicUserAttributes(user)
                        : {};

                    /**
                     * Note: most of this is temporary while testing out in-memory table calculations,
                     * so that we can more cleanly handle the feature-flagged behavior fork below.
                     */
                    let fields: ItemsMap;
                    let query: string;
                    let hasExampleMetric: boolean;
                    let tableCalculationsCompiledQuery:
                        | undefined
                        | CompiledQuery;
                    const isTimezoneEnabled = await isFeatureFlagEnabled(
                        FeatureFlags.EnableUserTimezones,
                        {
                            userUuid: user.userUuid,
                            organizationUuid,
                        },
                    );
                    const timezoneMetricQuery = {
                        ...metricQueryWithLimit,
                        timezone: isTimezoneEnabled
                            ? metricQueryWithLimit.timezone
                            : undefined,
                    };
                    const compileQueryArgs = [
                        timezoneMetricQuery,
                        explore,
                        warehouseClient,
                        intrinsicUserAttributes,
                        userAttributes,
                        granularity,
                    ] as const;

                    /**
                     * If we're using the new table calculations engine, we're actually going to be
                     * doing two separate queries - the parent query which excludes table calculations,
                     * and a separate query that runs against the result of the parent query, exclusively
                     * to generate table calculation values, and apply table calculation filters.
                     */
                    if (useNewTableCalculationsEngine) {
                        const [parentQuery, tableCalculationsSubQuery] =
                            await ProjectService._compileMetricQueryWithNewTableCalculationsEngine(
                                ...compileQueryArgs,
                            );

                        /**
                         * Merge field sets coming from the parent warehouse query, as well as the
                         * table calculations sub-query:
                         */
                        fields = {
                            ...parentQuery.fields,
                            ...tableCalculationsSubQuery.fields,
                        };

                        query = parentQuery.query;
                        hasExampleMetric = parentQuery.hasExampleMetric;

                        tableCalculationsCompiledQuery =
                            tableCalculationsSubQuery;
                    } else {
                        const fullQuery = await ProjectService._compileQuery(
                            ...compileQueryArgs,
                        );

                        fields = fullQuery.fields;
                        query = fullQuery.query;
                        hasExampleMetric = fullQuery.hasExampleMetric;
                    }

                    const onboardingRecord =
                        await this.onboardingModel.getByOrganizationUuid(
                            user.organizationUuid,
                        );
                    if (!onboardingRecord.ranQueryAt) {
                        await this.onboardingModel.update(
                            user.organizationUuid,
                            {
                                ranQueryAt: new Date(),
                            },
                        );
                    }

                    await this.analytics.track({
                        userId: user.userUuid,
                        event: 'query.executed',
                        properties: {
                            projectId: projectUuid,
                            hasExampleMetric,
                            dimensionsCount: metricQuery.dimensions.length,
                            metricsCount: metricQuery.metrics.length,
                            filtersCount: countTotalFilterRules(
                                metricQuery.filters,
                            ),
                            sortsCount: metricQuery.sorts.length,
                            tableCalculationsCount:
                                metricQuery.tableCalculations.length,
                            tableCalculationsPercentFormatCount:
                                metricQuery.tableCalculations.filter(
                                    (tableCalculation) =>
                                        tableCalculation.format?.type ===
                                        CustomFormatType.PERCENT,
                                ).length,
                            tableCalculationsCurrencyFormatCount:
                                metricQuery.tableCalculations.filter(
                                    (tableCalculation) =>
                                        tableCalculation.format?.type ===
                                        CustomFormatType.CURRENCY,
                                ).length,
                            tableCalculationsNumberFormatCount:
                                metricQuery.tableCalculations.filter(
                                    (tableCalculation) =>
                                        tableCalculation.format?.type ===
                                        CustomFormatType.NUMBER,
                                ).length,
                            additionalMetricsCount: (
                                metricQuery.additionalMetrics || []
                            ).filter((metric) =>
                                metricQuery.metrics.includes(
                                    getFieldId(metric),
                                ),
                            ).length,
                            additionalMetricsFilterCount: (
                                metricQuery.additionalMetrics || []
                            ).filter(
                                (metric) =>
                                    metricQuery.metrics.includes(
                                        getFieldId(metric),
                                    ) &&
                                    metric.filters &&
                                    metric.filters.length > 0,
                            ).length,
                            additionalMetricsPercentFormatCount: (
                                metricQuery.additionalMetrics || []
                            ).filter(
                                (metric) =>
                                    metricQuery.metrics.includes(
                                        getFieldId(metric),
                                    ) &&
                                    metric.formatOptions &&
                                    metric.formatOptions.type ===
                                        CustomFormatType.PERCENT,
                            ).length,
                            additionalMetricsCurrencyFormatCount: (
                                metricQuery.additionalMetrics || []
                            ).filter(
                                (metric) =>
                                    metricQuery.metrics.includes(
                                        getFieldId(metric),
                                    ) &&
                                    metric.formatOptions &&
                                    metric.formatOptions.type ===
                                        CustomFormatType.CURRENCY,
                            ).length,
                            additionalMetricsNumberFormatCount: (
                                metricQuery.additionalMetrics || []
                            ).filter(
                                (metric) =>
                                    metricQuery.metrics.includes(
                                        getFieldId(metric),
                                    ) &&
                                    metric.formatOptions &&
                                    metric.formatOptions.type ===
                                        CustomFormatType.NUMBER,
                            ).length,
                            context,
                            ...countCustomDimensionsInMetricQuery(metricQuery),
                            dateZoomGranularity: granularity || null,
                            timezone: metricQuery.timezone,
                        },
                    });

                    this.logger.debug(
                        `Fetch query results from cache or warehouse`,
                    );
                    span.setAttribute('generatedSql', query);

                    /**
                     * If enabled, we include additional attributes for this span allowing us to measure
                     * the impact of upcoming table calculation handling changes.
                     */
                    if (useNewTableCalculationsEngine) {
                        span.setAttributes({
                            tableCalculationsNum:
                                metricQuery.tableCalculations.length,
                            newTableCalculations: useNewTableCalculationsEngine,
                        });
                    }
                    span.setAttribute('lightdash.projectUuid', projectUuid);
                    span.setAttribute(
                        'warehouse.type',
                        warehouseClient.credentials.type,
                    );

                    const metricQueryWithTimezone = {
                        ...metricQuery,
                        timezone: isTimezoneEnabled
                            ? metricQuery.timezone
                            : undefined,
                    };

                    const { rows, cacheMetadata } =
                        await this.getResultsFromCacheOrWarehouse({
                            projectUuid,
                            context,
                            warehouseClient,
                            metricQuery: metricQueryWithTimezone,
                            query,
                            queryTags,
                            invalidateCache,
                            tableCalculationsSubQuery:
                                tableCalculationsCompiledQuery,
                        });
                    await sshTunnel.disconnect();
                    return { rows, cacheMetadata, fields };
                } catch (e) {
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: e.message,
                    });
                    throw e;
                } finally {
                    span.end();
                }
            },
        );
    }

    async runSqlQuery(
        user: SessionUser,
        projectUuid: string,
        sql: string,
    ): Promise<ApiSqlQueryResults> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                subject('SqlRunner', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.analytics.track({
            userId: user.userUuid,
            event: 'sql.executed',
            properties: {
                projectId: projectUuid,
            },
        });
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
        );
        this.logger.debug(`Run query against warehouse`);
        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            user_uuid: user.userUuid,
        };
        const results = await warehouseClient.runQuery(sql, queryTags);
        await sshTunnel.disconnect();
        return results;
    }

    async searchFieldUniqueValues(
        user: SessionUser,
        projectUuid: string,
        table: string,
        fieldId: string,
        search: string,
        limit: number,
        filters: AndFilterGroup | undefined,
    ): Promise<Array<unknown>> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (limit > this.lightdashConfig.query.maxLimit) {
            throw new ParameterError(
                `Query limit can not exceed ${this.lightdashConfig.query.maxLimit}`,
            );
        }

        const explore = await this.projectModel.findExploreByTableName(
            projectUuid,
            table,
        );

        if (!explore || isExploreError(explore)) {
            throw new NotExistsError(`Explore does not exist or has errors`);
        }

        const field = findFieldByIdInExplore(explore, fieldId);

        if (!field) {
            throw new NotExistsError(`Can't dimension with id: ${fieldId}`);
        }

        const distinctMetric: AdditionalMetric = {
            name: `${field.name}_distinct`,
            label: `Distinct of ${field.label}`,
            table: field.table,
            sql: `DISTINCT ${field.sql}`,
            type: MetricType.STRING,
        };

        const autocompleteDimensionFilters: FilterGroupItem[] = [
            {
                id: uuidv4(),
                target: {
                    fieldId,
                },
                operator: FilterOperator.INCLUDE,
                values: [search],
            },
        ];
        if (filters) {
            autocompleteDimensionFilters.push(filters);
        }
        const metricQuery: MetricQuery = {
            exploreName: explore.name,
            dimensions: [],
            metrics: [getItemId(distinctMetric)],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: autocompleteDimensionFilters,
                },
            },
            additionalMetrics: [distinctMetric],
            tableCalculations: [],
            sorts: [
                {
                    fieldId: getItemId(distinctMetric),
                    descending: false,
                },
            ],
            limit,
        };

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            explore.warehouse,
        );
        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
            user.userUuid,
        );
        const intrinsicUserAttributes = emailStatus.isVerified
            ? getIntrinsicUserAttributes(user)
            : {};

        const { query } = await ProjectService._compileQuery(
            metricQuery,
            explore,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
        );

        this.logger.debug(`Run query against warehouse`);
        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            user_uuid: user.userUuid,
            project_uuid: projectUuid,
        };
        const { rows } = await warehouseClient.runQuery(query, queryTags);
        await sshTunnel.disconnect();

        this.analytics.track({
            event: 'field_value.search',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                fieldId,
                searchCharCount: search.length,
                resultsCount: rows.length,
                searchLimit: limit,
            },
        });

        return rows.map((row) => row[getItemId(distinctMetric)]);
    }

    async refreshAllTables(
        user: Pick<SessionUser, 'userUuid'>,
        projectUuid: string,
        requestMethod: RequestMethod,
    ): Promise<(Explore | ExploreError)[]> {
        // Checks that project exists
        const project = await this.projectModel.get(projectUuid);

        // Force refresh adapter (refetch git repos, check for changed credentials, etc.)
        // Might want to cache parts of this in future if slow
        const { adapter, sshTunnel } = await this.buildAdapter(
            projectUuid,
            user,
        );
        const packages = await adapter.getDbtPackages();
        try {
            const explores = await adapter.compileAllExplores();
            this.analytics.track({
                event: 'project.compiled',
                userId: user.userUuid,
                properties: {
                    requestMethod,
                    projectId: projectUuid,
                    projectName: project.name,
                    projectType: project.dbtConnection.type,
                    warehouseType: project.warehouseConnection?.type,
                    modelsCount: explores.length,
                    modelsWithErrorsCount:
                        explores.filter(isExploreError).length,
                    modelsWithGroupLabelCount: explores.filter(
                        ({ groupLabel }) => !!groupLabel,
                    ).length,
                    metricsCount: explores.reduce<number>((acc, explore) => {
                        if (!isExploreError(explore)) {
                            return (
                                acc +
                                getMetrics(explore).filter(
                                    ({ isAutoGenerated }) => !isAutoGenerated,
                                ).length
                            );
                        }
                        return acc;
                    }, 0),
                    packagesCount: packages
                        ? Object.keys(packages).length
                        : undefined,
                    roundCount: explores.reduce<number>((acc, explore) => {
                        if (!isExploreError(explore)) {
                            return (
                                acc +
                                getMetrics(explore).filter(
                                    ({ round }) => round !== undefined,
                                ).length +
                                getDimensions(explore).filter(
                                    ({ round }) => round !== undefined,
                                ).length
                            );
                        }
                        return acc;
                    }, 0),
                    urlsCount: explores.reduce<number>((acc, explore) => {
                        if (!isExploreError(explore)) {
                            return (
                                acc +
                                getFields(explore)
                                    .map((field) => (field.urls || []).length)
                                    .reduce((a, b) => a + b, 0)
                            );
                        }
                        return acc;
                    }, 0),
                    formattedFieldsCount: explores.reduce<number>(
                        (acc, explore) => {
                            try {
                                if (!isExploreError(explore)) {
                                    const filteredExplore = {
                                        ...explore,
                                        tables: {
                                            [explore.baseTable]:
                                                explore.tables[
                                                    explore.baseTable
                                                ],
                                        },
                                    };

                                    return (
                                        acc +
                                        getFields(filteredExplore).filter(
                                            ({ format }) =>
                                                format !== undefined,
                                        ).length
                                    );
                                }
                            } catch (e) {
                                this.logger.error(
                                    `Unable to reduce formattedFieldsCount. ${e}`,
                                );
                            }
                            return acc;
                        },
                        0,
                    ),
                    modelsWithSqlFiltersCount: explores.reduce<number>(
                        (acc, explore) => {
                            if (
                                explore.tables &&
                                explore.baseTable &&
                                explore.tables[explore.baseTable].sqlWhere !==
                                    undefined
                            )
                                return acc + 1;
                            return acc;
                        },
                        0,
                    ),
                    columnAccessFiltersCount: explores.reduce<number>(
                        (acc, explore) => {
                            if (!isExploreError(explore)) {
                                return (
                                    acc +
                                    getDimensions(explore).filter(
                                        ({ requiredAttributes }) =>
                                            requiredAttributes !== undefined,
                                    ).length
                                );
                            }
                            return acc;
                        },
                        0,
                    ),
                    additionalDimensionsCount: explores.reduce<number>(
                        (acc, explore) => {
                            if (!isExploreError(explore)) {
                                return (
                                    acc +
                                    Object.values(
                                        explore.tables[explore.baseTable]
                                            .dimensions,
                                    ).filter(
                                        (field) => field.isAdditionalDimension,
                                    ).length
                                );
                            }
                            return acc;
                        },
                        0,
                    ),
                },
            });
            return explores;
        } catch (e) {
            const errorResponse = errorHandler(e);
            this.analytics.track({
                event: 'project.error',
                userId: user.userUuid,
                properties: {
                    requestMethod,
                    projectId: projectUuid,
                    name: errorResponse.name,
                    statusCode: errorResponse.statusCode,
                    projectType: project.dbtConnection.type,
                    warehouseType: project.warehouseConnection?.type,
                },
            });
            throw errorResponse;
        } finally {
            await adapter.destroy();
            await sshTunnel.disconnect();
        }
    }

    async getJobStatus(jobUuid: string, user: SessionUser): Promise<Job> {
        const job = await this.jobModel.get(jobUuid);

        if (job.projectUuid) {
            const { organizationUuid } = await this.projectModel.getSummary(
                job.projectUuid,
            );
            if (
                user.ability.cannot(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid: job.projectUuid,
                    }),
                )
            ) {
                throw new NotFoundError(`Cannot find job`);
            }
        } else if (user.ability.cannot('view', subject('Job', job))) {
            throw new NotFoundError(`Cannot find job`);
        }

        return job;
    }

    async scheduleCompileProject(
        user: SessionUser,
        projectUuid: string,
        requestMethod: RequestMethod,
    ): Promise<{ jobUuid: string }> {
        const { organizationUuid, type } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot('create', 'Job') ||
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // This job is the job model we use to compile projects
        // This is not the graphile Job id we use on scheduler
        // TODO: remove this old job method and replace with scheduler log details
        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            userUuid: user.userUuid,
            projectUuid,
            steps: [{ stepType: JobStepType.COMPILING }],
        };

        await this.jobModel.create(job);

        await this.schedulerClient.compileProject({
            createdByUserUuid: user.userUuid,
            organizationUuid,
            projectUuid,
            requestMethod,
            jobUuid: job.jobUuid,
            isPreview: type === ProjectType.PREVIEW,
        });

        return { jobUuid: job.jobUuid };
    }

    async compileProject(
        user: SessionUser,
        projectUuid: string,
        requestMethod: RequestMethod,
        jobUuid: string,
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot('create', 'Job') ||
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const job: CreateJob = {
            jobUuid,
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            userUuid: user.userUuid,
            projectUuid,
            steps: [{ stepType: JobStepType.COMPILING }],
        };

        const onLockFailed = async () => {
            throw new AlreadyProcessingError('Project is already compiling');
        };
        const onLockAcquired = async () => {
            try {
                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.RUNNING,
                });
                const explores = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.COMPILING,
                    async () =>
                        this.refreshAllTables(user, projectUuid, requestMethod),
                );
                await this.projectModel.saveExploresToCache(
                    projectUuid,
                    explores,
                );
                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.DONE,
                });
            } catch (e) {
                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.ERROR,
                });
            }
        };
        await this.projectModel
            .tryAcquireProjectLock(projectUuid, onLockAcquired, onLockFailed)
            .catch((e) => this.logger.error(`Background job failed: ${e}`));
    }

    async getAllExploresSummary(
        user: SessionUser,
        projectUuid: string,
        filtered: boolean,
    ): Promise<SummaryExplore[]> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const explores = await this.projectModel.getExploresFromCache(
            projectUuid,
        );
        if (!explores) {
            return [];
        }
        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        const allExploreSummaries = explores.reduce<SummaryExplore[]>(
            (acc, explore) => {
                if (isExploreError(explore)) {
                    return [
                        ...acc,
                        {
                            name: explore.name,
                            label: explore.label,
                            tags: explore.tags,
                            groupLabel: explore.groupLabel,
                            errors: explore.errors,
                            databaseName:
                                explore.baseTable &&
                                explore.tables?.[explore.baseTable]?.database,
                            schemaName:
                                explore.baseTable &&
                                explore.tables?.[explore.baseTable]?.schema,
                            description:
                                explore.baseTable &&
                                explore.tables?.[explore.baseTable]
                                    ?.description,
                        },
                    ];
                }
                if (
                    doesExploreMatchRequiredAttributes(explore, userAttributes)
                ) {
                    return [
                        ...acc,
                        {
                            name: explore.name,
                            label: explore.label,
                            tags: explore.tags,
                            groupLabel: explore.groupLabel,
                            databaseName:
                                explore.tables[explore.baseTable].database,
                            schemaName:
                                explore.tables[explore.baseTable].schema,
                            description:
                                explore.tables[explore.baseTable].description,
                        },
                    ];
                }
                return acc;
            },
            [],
        );

        if (filtered) {
            const {
                tableSelection: { type, value },
            } = await this.getTablesConfiguration(user, projectUuid);
            if (type === TableSelectionType.WITH_TAGS) {
                return allExploreSummaries.filter((explore) =>
                    hasIntersection(explore.tags || [], value || []),
                );
            }
            if (type === TableSelectionType.WITH_NAMES) {
                return allExploreSummaries.filter((explore) =>
                    (value || []).includes(explore.name),
                );
            }
        }

        return allExploreSummaries;
    }

    async getExplore(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        organizationUuid?: string,
    ): Promise<Explore> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'ProjectService.getExplore',
            description: 'Gets a single explore from the cache',
        });
        try {
            return await wrapOtelSpan(
                'ProjectService.getExplore',
                {},
                async () => {
                    const project = organizationUuid
                        ? { organizationUuid }
                        : await this.projectModel.getSummary(projectUuid);
                    if (
                        user.ability.cannot(
                            'view',
                            subject('Project', {
                                organizationUuid: project.organizationUuid,
                                projectUuid,
                            }),
                        )
                    ) {
                        throw new ForbiddenError();
                    }
                    const explore = await this.projectModel.getExploreFromCache(
                        projectUuid,
                        exploreName,
                    );

                    if (isExploreError(explore)) {
                        throw new NotExistsError(
                            `Explore "${exploreName}" does not exist.`,
                        );
                    }

                    const shouldFilterExplore = await wrapOtelSpan(
                        'ProjectService.getExplore.shouldFilterExplore',
                        {},
                        async () => exploreHasFilteredAttribute(explore),
                    );

                    if (!shouldFilterExplore) {
                        return explore;
                    }
                    const userAttributes =
                        await this.userAttributesModel.getAttributeValuesForOrgMember(
                            {
                                organizationUuid: project.organizationUuid,
                                userUuid: user.userUuid,
                            },
                        );

                    return wrapOtelSpan(
                        'ProjectService.getExplore.getFilteredExplore',
                        {},
                        async () => getFilteredExplore(explore, userAttributes),
                    );
                },
            );
        } finally {
            span?.finish();
        }
    }

    async getCatalog(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectCatalog> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const explores = await this.projectModel.getExploresFromCache(
            projectUuid,
        );

        return (explores || []).reduce<ProjectCatalog>((acc, explore) => {
            if (!isExploreError(explore)) {
                Object.values(explore.tables).forEach(
                    ({ database, schema, name, description, sqlTable }) => {
                        acc[database] = acc[database] || {};
                        acc[database][schema] = acc[database][schema] || {};
                        acc[database][schema][name] = {
                            description,
                            sqlTable,
                        };
                    },
                );
            }
            return acc;
        }, {});
    }

    async getTablesConfiguration(
        user: SessionUser,
        projectUuid: string,
    ): Promise<TablesConfiguration> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.projectModel.getTablesConfiguration(projectUuid);
    }

    async updateTablesConfiguration(
        user: SessionUser,
        projectUuid: string,
        data: TablesConfiguration,
    ): Promise<TablesConfiguration> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.projectModel.updateTablesConfiguration(projectUuid, data);
        this.analytics.track({
            event: 'project_tables_configuration.updated',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                project_table_selection_type: data.tableSelection.type,
            },
        });
        return this.projectModel.getTablesConfiguration(projectUuid);
    }

    async getAvailableFiltersForSavedQuery(
        user: SessionUser,
        savedChartUuid: string,
    ): Promise<FilterableDimension[]> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'projectService.getAvailableFiltersForSavedQuery',
            description: 'Gets all filters available for a single query',
        });
        try {
            const [savedChart] =
                await this.savedChartModel.getInfoForAvailableFilters([
                    savedChartUuid,
                ]);

            const space = await this.spaceModel.getSpaceSummary(
                savedChart.spaceUuid,
            );

            const access = await this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                space.uuid,
            );

            if (
                user.ability.cannot(
                    'view',
                    subject('SavedChart', {
                        ...savedChart,
                        isPrivate: space.isPrivate,
                        access,
                    }),
                )
            ) {
                throw new ForbiddenError();
            }

            const explore = await this.getExplore(
                user,
                savedChart.projectUuid,
                savedChart.tableName,
            );

            return getDimensions(explore).filter(
                (field) => isFilterableDimension(field) && !field.hidden,
            );
        } finally {
            span?.finish();
        }
    }

    async getAvailableFiltersForSavedQueries(
        user: SessionUser,
        savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
    ): Promise<DashboardAvailableFilters> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'projectService.getAvailableFiltersForSavedQueries',
            description: 'Gets all filters available for several queries',
        });

        let allFilters: {
            uuid: string;
            filters: CompiledDimension[];
        }[] = [];

        const savedQueryUuids = savedChartUuidsAndTileUuids.map(
            ({ savedChartUuid }) => savedChartUuid,
        );

        try {
            const savedCharts =
                await this.savedChartModel.getInfoForAvailableFilters(
                    savedQueryUuids,
                );
            const uniqueSpaceUuids = [
                ...new Set(savedCharts.map((chart) => chart.spaceUuid)),
            ];
            const exploreCacheKeys: Record<string, boolean> = {};
            const exploreCache: Record<string, Explore> = {};

            const explorePromises = savedCharts.reduce<
                Promise<{ key: string; explore: Explore }>[]
            >((acc, chart) => {
                const key = chart.tableName;
                if (!exploreCacheKeys[key]) {
                    acc.push(
                        this.getExplore(user, chart.projectUuid, key).then(
                            (explore) => ({ key, explore }),
                        ),
                    );
                    exploreCacheKeys[key] = true;
                }
                return acc;
            }, []);

            const [spaceAccessMap, resolvedExplores] = await Promise.all([
                this.spaceModel.getSpacesForAccessCheck(uniqueSpaceUuids),
                Promise.all(explorePromises),
            ]);

            resolvedExplores.forEach(({ key, explore }) => {
                exploreCache[key] = explore;
            });

            const filterPromises = savedCharts.map(async (savedChart) => {
                const spaceAccess = spaceAccessMap.get(savedChart.spaceUuid);
                const access = await this.spaceModel.getUserSpaceAccess(
                    user.userUuid,
                    savedChart.spaceUuid,
                );

                if (
                    user.ability.cannot(
                        'view',
                        subject('SavedChart', {
                            ...savedChart,
                            isPrivate: spaceAccess?.isPrivate,
                            access,
                        }),
                    )
                ) {
                    return { uuid: savedChart.uuid, filters: [] };
                }

                const explore = exploreCache[savedChart.tableName];

                const filters = getDimensions(explore).filter(
                    (field) => isFilterableDimension(field) && !field.hidden,
                );

                return { uuid: savedChart.uuid, filters };
            });

            allFilters = await Promise.all(filterPromises);
        } finally {
            span?.finish();
        }

        const allFilterableFields: FilterableDimension[] = [];
        const filterIndexMap: Record<string, number> = {};

        allFilters.forEach((filterSet) => {
            filterSet.filters.forEach((filter) => {
                const fieldId = getFieldId(filter);
                if (!(fieldId in filterIndexMap)) {
                    filterIndexMap[fieldId] = allFilterableFields.length;
                    allFilterableFields.push(filter);
                }
            });
        });

        const savedQueryFilters = savedChartUuidsAndTileUuids.reduce<
            DashboardAvailableFilters['savedQueryFilters']
        >((acc, savedChartUuidAndTileUuid) => {
            const filterResult = allFilters.find(
                (result) =>
                    result.uuid === savedChartUuidAndTileUuid.savedChartUuid,
            );
            if (!filterResult || !filterResult.filters.length) return acc;

            const filterIndexes = filterResult.filters.map(
                (filter) => filterIndexMap[getFieldId(filter)],
            );
            return {
                ...acc,
                [savedChartUuidAndTileUuid.tileUuid]: filterIndexes,
            };
        }, {});

        return {
            savedQueryFilters,
            allFilterableFields,
        };
    }

    async hasSavedCharts(
        user: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        try {
            const charts = await this.savedChartModel.find({ projectUuid });
            return charts.length > 0;
        } catch (e: any) {
            return false;
        }
    }

    async getProjectMemberAccess(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
    ): Promise<ProjectMemberProfile> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const projectMemberProfile =
            await this.projectModel.getProjectMemberAccess(
                projectUuid,
                userUuid,
            );
        if (projectMemberProfile !== undefined) {
            return projectMemberProfile;
        }
        throw new NotFoundError(
            `User UUID ${userUuid} is not found in project ${projectUuid}`,
        );
    }

    async getProjectAccess(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectMemberProfile[]> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.projectModel.getProjectAccess(projectUuid);
    }

    async createProjectAccess(
        user: SessionUser,
        projectUuid: string,
        data: CreateProjectMember,
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.createProjectAccess(
            projectUuid,
            data.email,
            data.role,
        );
        const project = await this.projectModel.getSummary(projectUuid);
        const projectUrl = new URL(
            `/projects/${projectUuid}/home`,
            this.lightdashConfig.siteUrl,
        ).href;

        if (data.sendEmail)
            await this.emailClient.sendProjectAccessEmail(
                user,
                data,
                project.name,
                projectUrl,
            );
    }

    async updateProjectAccess(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
        data: UpdateProjectMember,
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.updateProjectAccess(
            projectUuid,
            userUuid,
            data.role,
        );
    }

    async updateMetadata(
        user: SessionUser,
        projectUuid: string,
        data: UpdateMetadata,
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.updateMetadata(projectUuid, data);
    }

    async deleteProjectAccess(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.deleteProjectAccess(projectUuid, userUuid);
    }

    async getProjectGroupAccesses(
        actor: SessionUser,
        projectUuid: string,
    ): Promise<ProjectGroupAccess[]> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            actor.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.projectModel.getProjectGroupAccesses(projectUuid);
    }

    async upsertDbtCloudIntegration(
        user: SessionUser,
        projectUuid: string,
        integration: CreateDbtCloudIntegration,
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.projectModel.upsertDbtCloudIntegration(
            projectUuid,
            integration,
        );
        this.analytics.track({
            event: 'dbt_cloud_integration.updated',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
            },
        });
        return this.findDbtCloudIntegration(user, projectUuid);
    }

    async deleteDbtCloudIntegration(user: SessionUser, projectUuid: string) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.projectModel.deleteDbtCloudIntegration(projectUuid);
        this.analytics.track({
            event: 'dbt_cloud_integration.deleted',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
            },
        });
    }

    async findDbtCloudIntegration(user: SessionUser, projectUuid: string) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.projectModel.findDbtCloudIntegration(projectUuid);
    }

    async getCharts(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SpaceQuery[]> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });

        const allowedSpacesBooleans = await Promise.all(
            spaces.map(
                async (space) =>
                    space.projectUuid === projectUuid &&
                    hasViewAccessToSpace(
                        user,
                        space,
                        await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            space.uuid,
                        ),
                    ),
            ),
        );

        const allowedSpaces = spaces.filter(
            (_, index) => allowedSpacesBooleans[index],
        );

        return this.spaceModel.getSpaceQueries(
            allowedSpaces.map((s) => s.uuid),
        );
    }

    async getChartSummaries(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ChartSummary[]> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });

        const allowedSpacesBooleans = await Promise.all(
            spaces.map(
                async (space) =>
                    space.projectUuid === projectUuid &&
                    hasViewAccessToSpace(
                        user,
                        space,
                        await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            space.uuid,
                        ),
                    ),
            ),
        );

        const allowedSpaces = spaces.filter(
            (_, index) => allowedSpacesBooleans[index],
        );

        return this.savedChartModel.find({
            projectUuid,
            spaceUuids: allowedSpaces.map((s) => s.uuid),
        });
    }

    async getMostPopularAndRecentlyUpdated(
        user: SessionUser,
        projectUuid: string,
    ): Promise<MostPopularAndRecentlyUpdated> {
        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const allowedSpaces = spaces.filter(
            (space) =>
                space.projectUuid === projectUuid &&
                hasDirectAccessToSpace(user, space), // NOTE: We don't check for admin access to the space - exclude private spaces from this panel if admin
        );

        const mostPopular = await this.getMostPopular(allowedSpaces);
        const recentlyUpdated = await this.getRecentlyUpdated(allowedSpaces);

        return {
            mostPopular: mostPopular
                .sort((a, b) => b.views - a.views)
                .slice(
                    0,
                    this.spaceModel.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT,
                ),
            recentlyUpdated: recentlyUpdated
                .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
                .slice(
                    0,
                    this.spaceModel.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT,
                ),
        };
    }

    async getMostPopular(
        allowedSpaces: Pick<SpaceSummary, 'uuid'>[],
    ): Promise<(SpaceQuery | DashboardBasicDetails)[]> {
        const mostPopularCharts = await this.spaceModel.getSpaceQueries(
            allowedSpaces.map(({ uuid }) => uuid),
            {
                mostPopular: true,
            },
        );

        const mostPopularDashboards = await this.spaceModel.getSpaceDashboards(
            allowedSpaces.map(({ uuid }) => uuid),
            {
                mostPopular: true,
            },
        );

        return [...mostPopularCharts, ...mostPopularDashboards];
    }

    async getRecentlyUpdated(
        allowedSpaces: Pick<SpaceSummary, 'uuid'>[],
    ): Promise<(SpaceQuery | DashboardBasicDetails)[]> {
        const recentlyUpdatedCharts = await this.spaceModel.getSpaceQueries(
            allowedSpaces.map(({ uuid }) => uuid),
            {
                recentlyUpdated: true,
            },
        );

        const recentlyUpdatedDashboards =
            await this.spaceModel.getSpaceDashboards(
                allowedSpaces.map(({ uuid }) => uuid),
                {
                    recentlyUpdated: true,
                },
            );

        return [...recentlyUpdatedCharts, ...recentlyUpdatedDashboards];
    }

    async getSpaces(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SpaceSummary[]> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });

        const spacesWithUserAccess = await Promise.all(
            spaces.map(async (spaceSummary) => {
                const [userAccess] = await this.spaceModel.getUserSpaceAccess(
                    user.userUuid,
                    spaceSummary.uuid,
                );
                return {
                    ...spaceSummary,
                    userAccess,
                };
            }),
        );

        const allowedSpaces = spacesWithUserAccess.filter((space) =>
            hasViewAccessToSpace(
                user,
                space,
                space.userAccess ? [space.userAccess] : [],
            ),
        );

        return allowedSpaces;
    }

    async copyContentOnPreview(
        projectUuid: string,
        previewProjectUuid: string,
        user: SessionUser,
    ): Promise<void> {
        this.logger.info(
            `Copying content from project ${projectUuid} to preview project ${previewProjectUuid}`,
        );
        await wrapSentryTransaction<void>(
            'duplicateContent',
            {
                projectUuid,
            },
            async () => {
                const spaces = await this.spaceModel.find({ projectUuid }); // Get all spaces in the project
                const allowedSpacesBooleans = await Promise.all(
                    spaces.map(async (space) =>
                        hasViewAccessToSpace(
                            user,
                            space,
                            await this.spaceModel.getUserSpaceAccess(
                                user.userUuid,
                                space.uuid,
                            ),
                        ),
                    ),
                );

                const allowedSpaces = spaces.filter(
                    (_, index) => allowedSpacesBooleans[index],
                );

                await this.projectModel.duplicateContent(
                    projectUuid,
                    previewProjectUuid,
                    allowedSpaces,
                );
            },
        );
    }

    async _getCalculateTotalQuery(
        user: SessionUser,
        explore: Explore,
        metricQuery: MetricQuery,
        organizationUuid: string,
        warehouseClient: WarehouseClient,
    ) {
        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
            user.userUuid,
        );
        const intrinsicUserAttributes = emailStatus.isVerified
            ? getIntrinsicUserAttributes(user)
            : {};

        const totalQuery: MetricQuery = {
            ...metricQuery,
            limit: 1,
            tableCalculations: [],
            sorts: [],
            dimensions: [],
            customDimensions: [],
            metrics: metricQuery.metrics,
            additionalMetrics: metricQuery.additionalMetrics,
        };

        const { query } = await ProjectService._compileQuery(
            totalQuery,
            explore,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
        );

        return { query, totalQuery };
    }

    async _calculateTotal(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricQuery: MetricQuery,
        organizationUuid: string,
    ) {
        const explore = await this.getExplore(
            user,
            projectUuid,
            exploreName,
            organizationUuid,
        );

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            explore.warehouse,
        );

        const { query } = await this._getCalculateTotalQuery(
            user,
            explore,
            metricQuery,
            organizationUuid,
            warehouseClient,
        );

        const queryTags: RunQueryTags = {
            organization_uuid: user.organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
        };

        const { rows } = await warehouseClient.runQuery(query, queryTags);
        await sshTunnel.disconnect();
        return { row: rows[0] };
    }

    async _calculateTotalFromCacheOrWarehouse(
        user: SessionUser,
        projectUuid: string,
        explore: Explore,
        metricQuery: MetricQuery,
        invalidateCache: boolean,
        organizationUuid: string,
    ) {
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            explore.warehouse,
        );

        const isTimezoneEnabled = await isFeatureFlagEnabled(
            FeatureFlags.EnableUserTimezones,
            {
                userUuid: user.userUuid,
                organizationUuid,
            },
        );
        const metricQueryWithTimezone = {
            ...metricQuery,
            timezone: isTimezoneEnabled ? metricQuery.timezone : undefined,
        };

        const { query, totalQuery } = await this._getCalculateTotalQuery(
            user,
            explore,
            metricQueryWithTimezone,
            organizationUuid,
            warehouseClient,
        );

        const queryTags: RunQueryTags = {
            organization_uuid: user.organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
        };

        const { rows, cacheMetadata } =
            await this.getResultsFromCacheOrWarehouse({
                projectUuid,
                context: QueryExecutionContext.CALCULATE_TOTAL,
                warehouseClient,
                metricQuery: totalQuery,
                query,
                queryTags,
                invalidateCache,
            });
        await sshTunnel.disconnect();
        return { row: rows[0], cacheMetadata };
    }

    async calculateTotalFromSavedChart(
        user: SessionUser,
        chartUuid: string,
        dashboardFilters: DashboardFilters,
        invalidateCache: boolean = false,
    ) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const savedChart = await this.savedChartModel.get(
            chartUuid,
            undefined, // VersionUuid
        );
        const { organizationUuid, projectUuid } = savedChart;

        const explore = await this.getExplore(
            user,
            projectUuid,
            savedChart.tableName,
            organizationUuid,
        );
        const tables = Object.keys(explore.tables);

        const appliedDashboardFilters = dashboardFilters
            ? {
                  dimensions: getDashboardFilterRulesForTables(
                      tables,
                      dashboardFilters.dimensions,
                  ),
                  metrics: getDashboardFilterRulesForTables(
                      tables,
                      dashboardFilters.metrics,
                  ),
                  tableCalculations: getDashboardFilterRulesForTables(
                      tables,
                      dashboardFilters.tableCalculations,
                  ),
              }
            : undefined;

        const metricQuery: MetricQuery = appliedDashboardFilters
            ? addDashboardFiltersToMetricQuery(
                  savedChart.metricQuery,
                  appliedDashboardFilters,
              )
            : savedChart.metricQuery;

        const space = await this.spaceModel.getSpaceSummary(
            savedChart.spaceUuid,
        );
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            savedChart.spaceUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const results = await this._calculateTotalFromCacheOrWarehouse(
            user,
            projectUuid,
            explore,
            metricQuery,
            invalidateCache,
            savedChart.organizationUuid,
        );
        return results.row;
    }

    async calculateTotalFromQuery(
        user: SessionUser,
        projectUuid: string,
        data: CalculateTotalFromQuery,
    ) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const results = await this._calculateTotal(
            user,
            projectUuid,
            data.explore,
            data.metricQuery,
            organizationUuid,
        );
        return results.row;
    }

    async getDbtExposures(
        user: SessionUser,
        projectUuid: string,
    ): Promise<Record<string, DbtExposure>> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        if (user.ability.cannot('manage', subject('Project', projectSummary))) {
            throw new ForbiddenError();
        }

        const explores = await this.projectModel.getExploresFromCache(
            projectUuid,
        );
        if (!explores) {
            throw new NotFoundError('No explores found');
        }

        const charts = await this.savedChartModel.findInfoForDbtExposures(
            projectUuid,
        );

        const chartExposures = charts.reduce<DbtExposure[]>((acc, chart) => {
            acc.push({
                name: `ld_chart_${snakeCaseName(chart.uuid)}`,
                type: DbtExposureType.ANALYSIS,
                owner: {
                    name: `${chart.firstName} ${chart.lastName}`,
                    email: '', // omit for now to avoid heavier query
                },
                label: chart.name,
                description: chart.description ?? '',
                url: `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/saved/${chart.uuid}/view`,
                dependsOn: Object.values(
                    explores.find(({ name }) => name === chart.tableName)
                        ?.tables || {},
                ).map((table) => `ref('${table.originalName || table.name}')`),
                tags: ['lightdash', 'chart'],
            });
            return acc;
        }, []);
        const dashboards = await this.dashboardModel.findInfoForDbtExposures(
            projectUuid,
        );

        const dashboardExposures = dashboards.reduce<DbtExposure[]>(
            (acc, dashboard) => {
                acc.push({
                    name: `ld_dashboard_${snakeCaseName(dashboard.uuid)}`,
                    type: DbtExposureType.DASHBOARD,
                    owner: {
                        name: `${dashboard.firstName} ${dashboard.lastName}`,
                        email: '', // omit for now to avoid heavier query
                    },
                    label: dashboard.name,
                    description: dashboard.description ?? '',
                    url: `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/dashboards/${dashboard.uuid}/view`,
                    dependsOn: dashboard.chartUuids
                        ? uniq(
                              dashboard.chartUuids
                                  .map((chartUuid) => {
                                      const chartExposureId = `ld_chart_${snakeCaseName(
                                          chartUuid,
                                      )}`;
                                      const chartExposure = chartExposures.find(
                                          ({ name }) =>
                                              name === chartExposureId,
                                      );
                                      return chartExposure
                                          ? chartExposure.dependsOn
                                          : [];
                                  })
                                  .flat(),
                          )
                        : [],
                    tags: ['lightdash', 'dashboard'],
                });
                return acc;
            },
            [],
        );

        const projectExposure: DbtExposure = {
            name: `ld_project_${snakeCaseName(projectSummary.projectUuid)}`,
            type: DbtExposureType.APPLICATION,
            owner: {
                name: `${user.firstName} ${user.lastName}`,
                email: user.email || '',
            },
            label: `Lightdash - ${projectSummary.name}`,
            description: 'Lightdash project',
            url: `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/home`,
            dependsOn: uniq(
                chartExposures.map(({ dependsOn }) => dependsOn).flat(),
            ),
            tags: ['lightdash', 'project'],
        };

        return [
            projectExposure,
            ...chartExposures,
            ...dashboardExposures,
        ].reduce<Record<string, DbtExposure>>((acc, exposure) => {
            acc[exposure.name] = exposure;
            return acc;
        }, {});
    }

    async getProjectCredentialsPreference(
        user: SessionUser,
        projectUuid: string,
    ): Promise<UserWarehouseCredentials | undefined> {
        const project = await this.projectModel.getSummary(projectUuid);
        if (user.ability.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }
        const credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        return this.userWarehouseCredentialsModel.findForProject(
            project.projectUuid,
            user.userUuid,
            credentials.type,
        );
    }

    async upsertProjectCredentialsPreference(
        user: SessionUser,
        projectUuid: string,
        userWarehouseCredentialsUuid: string,
    ) {
        const userWarehouseCredentials =
            await this.userWarehouseCredentialsModel.getByUuid(
                userWarehouseCredentialsUuid,
            );
        if (userWarehouseCredentials.userUuid !== user.userUuid) {
            throw new ForbiddenError();
        }
        const project = await this.projectModel.getSummary(projectUuid);
        if (user.ability.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }
        await this.userWarehouseCredentialsModel.upsertUserCredentialsPreference(
            user.userUuid,
            projectUuid,
            userWarehouseCredentialsUuid,
        );
    }

    async getCustomMetrics(
        user: SessionUser,
        projectUuid: string,
    ): Promise<
        {
            name: string;
            label: string;
            modelName: string;
            yml: string;
            chartLabel: string;
            chartUrl: string;
        }[]
    > {
        // TODO implement permissions
        const chartSummaries = await this.savedChartModel.find({
            projectUuid,
        });
        const chartPromises = chartSummaries.map((summary) =>
            this.savedChartModel.get(summary.uuid, undefined),
        );

        const charts = await Promise.all(chartPromises);

        return charts.reduce<any[]>((acc, chart) => {
            const customMetrics = chart.metricQuery.additionalMetrics;

            if (customMetrics === undefined || customMetrics.length === 0)
                return acc;
            const metrics = [
                ...acc,
                ...customMetrics.map((metric) => ({
                    name: metric.uuid,
                    label: metric.label,
                    modelName: metric.table,
                    yml: yaml.dump(convertCustomMetricToDbt(metric), {
                        quotingType: "'",
                    }),
                    chartLabel: chart.name,
                    chartUrl: `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/saved/${chart.uuid}/view`,
                })),
            ];

            return metrics;
        }, []);
    }

    async promoteChart(user: SessionUser, chartUuid: string) {
        const checkPermissions = async (
            organizationUuid: string,
            projectUuid: string,
            spaceSummary: Omit<SpaceSummary, 'userAccess'> | undefined,
            context: string,
            fromProjectUuid: string, // for analytics
            toProjectUuid?: string, // for analytics
        ) => {
            // If space is undefined, we only check the org/project access, we will create the chart in a new accessible space
            const userDontHaveAccess = spaceSummary
                ? user.ability.cannot(
                      'promote',
                      subject('SavedChart', {
                          organizationUuid,
                          projectUuid,
                          isPrivate: spaceSummary.isPrivate,
                          access: await this.spaceModel.getUserSpaceAccess(
                              user.userUuid,
                              spaceSummary.uuid,
                          ),
                      }),
                  )
                : user.ability.cannot(
                      'promote',
                      subject('SavedChart', {
                          organizationUuid,
                          projectUuid,
                      }),
                  ) ||
                  user.ability.cannot(
                      'create',
                      subject('Space', { organizationUuid, projectUuid }),
                  );

            if (userDontHaveAccess) {
                this.analytics.track({
                    event: 'promote.error',
                    userId: user.userUuid,
                    properties: {
                        chartId: chartUuid,
                        fromProjectId: fromProjectUuid,
                        toProjectId: toProjectUuid,
                        organizationId: organizationUuid,
                        error: `Permission error on ${context}`,
                    },
                });

                throw new ForbiddenError(
                    `You don't have the right access permissions on ${context} to promote this chart.`,
                );
            }
        };

        const promotedChart = await this.savedChartModel.get(
            chartUuid,
            undefined,
        );
        const { organizationUuid, projectUuid } = promotedChart;
        if (promotedChart.dashboardUuid)
            throw new ParameterError(
                `We can't promote charts within dashboards`,
            );
        const space = await this.spaceModel.getSpaceSummary(
            promotedChart.spaceUuid,
        );

        if (space.isPrivate) {
            throw new ParameterError(
                `We can't promote charts from private spaces`,
            );
        }

        await checkPermissions(
            organizationUuid,
            projectUuid,
            space,
            'this chart and project',
            projectUuid,
            undefined,
        );

        const { upstreamProjectUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (!upstreamProjectUuid)
            throw new NotFoundError(
                'This chart does not have an upstream project',
            );

        const existingUpstreamCharts = await this.savedChartModel.find({
            projectUuid: upstreamProjectUuid,
            slug: promotedChart.slug,
        });

        if (existingUpstreamCharts.length === 0) {
            // There are no chart with the same slug, we create the chart, and the space if needed
            // We only check the org/project access, we will create a new space if needed
            await checkPermissions(
                organizationUuid,
                upstreamProjectUuid,
                undefined,
                'the upstream project',
                projectUuid,
                upstreamProjectUuid,
            );

            let newSpaceUuid: string;
            const existingSpace = await this.spaceModel.find({
                projectUuid: upstreamProjectUuid,
                slug: space.slug,
            });
            if (existingSpace.length === 0) {
                // We have 0 or more than 1 space with the same slug
                await checkPermissions(
                    organizationUuid,
                    upstreamProjectUuid,
                    undefined, // we also check here if user can create spaces in the upstream project
                    'the upstream project',
                    projectUuid,
                    upstreamProjectUuid,
                );
                // We create a new space
                const newSpace = await this.spaceModel.createSpace(
                    upstreamProjectUuid,
                    space.name,
                    user.userId,
                    space.isPrivate,
                    space.slug,
                );
                newSpaceUuid = newSpace.uuid;
            } else if (existingSpace.length === 1) {
                // We have an existing space with the same slug
                await checkPermissions(
                    organizationUuid,
                    upstreamProjectUuid,
                    existingSpace[0],
                    'the upstream space and project',
                    projectUuid,
                    upstreamProjectUuid,
                );
                newSpaceUuid = existingSpace[0].uuid;
            } else {
                // Multiple spaces with the same slug
                throw new AlreadyExistsError(
                    `There are multiple spaces with the same identifier ${space.slug}`,
                );
            }

            // Create new chart
            const newChartData: CreateSavedChart & {
                slug: string;
                updatedByUser: UpdatedByUser;
            } = {
                ...promotedChart,
                dashboardUuid: undefined, // We don't copy charts within dashboards
                spaceUuid: newSpaceUuid,
                updatedByUser: promotedChart.updatedByUser!,
                slug: promotedChart.slug,
            };
            const newChart = await this.savedChartModel.create(
                upstreamProjectUuid,
                user.userUuid,
                newChartData,
            );

            this.analytics.track({
                event: 'promote.execute',
                userId: user.userUuid,
                properties: {
                    chartId: chartUuid,
                    fromProjectId: projectUuid,
                    toProjectId: upstreamProjectUuid,
                    organizationId: organizationUuid,
                    slug: promotedChart.slug,
                    hasExistingContent: false,
                    withNewSpace: existingSpace.length !== 1,
                },
            });

            return newChart;
        }
        if (existingUpstreamCharts.length === 1) {
            // We override existing chart details
            const upstreamChart = existingUpstreamCharts[0];
            const upstreamSpace = await this.spaceModel.getSpaceSummary(
                upstreamChart.spaceUuid,
            );

            await checkPermissions(
                organizationUuid,
                upstreamProjectUuid,
                upstreamSpace,
                'the upstream chart and project',

                projectUuid,
                upstreamProjectUuid,
            );
            if (
                upstreamChart.name !== promotedChart.name ||
                upstreamChart.description !== promotedChart.description
            ) {
                // We also update chart name and description if they have changed
                await this.savedChartModel.update(upstreamChart.uuid, {
                    name: promotedChart.name,
                    description: promotedChart.description,
                });
            }

            const updatedChart = await this.savedChartModel.createVersion(
                upstreamChart.uuid,
                {
                    tableName: promotedChart.tableName,
                    metricQuery: promotedChart.metricQuery,
                    chartConfig: promotedChart.chartConfig,
                    tableConfig: promotedChart.tableConfig,
                },
                user,
            );
            this.analytics.track({
                event: 'promote.execute',
                userId: user.userUuid,
                properties: {
                    chartId: chartUuid,
                    fromProjectId: projectUuid,
                    toProjectId: upstreamProjectUuid,
                    organizationId: organizationUuid,
                    slug: promotedChart.slug,
                    hasExistingContent: true,
                },
            });

            return updatedChart;
        }

        this.analytics.track({
            event: 'promote.error',
            userId: user.userUuid,
            properties: {
                chartId: chartUuid,
                fromProjectId: projectUuid,
                toProjectId: upstreamProjectUuid,
                organizationId: organizationUuid,
                slug: promotedChart.slug,
                error: `There are multiple charts with the same identifier`,
            },
        });
        // Multiple charts with the same slug
        throw new AlreadyExistsError(
            `There are multiple charts with the same identifier ${promotedChart.slug}`,
        );
    }
}
