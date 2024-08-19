import { subject } from '@casl/ability';
import {
    addDashboardFiltersToMetricQuery,
    AlreadyProcessingError,
    AndFilterGroup,
    ApiChartAndResults,
    ApiQueryResults,
    ApiSqlQueryResults,
    assertUnreachable,
    CacheMetadata,
    CalculateTotalFromQuery,
    ChartSummary,
    CompiledDimension,
    convertCustomMetricToDbt,
    countCustomDimensionsInMetricQuery,
    countTotalFilterRules,
    CreateDbtCloudIntegration,
    createDimensionWithGranularity,
    CreateJob,
    CreateProject,
    CreateProjectMember,
    CreateSnowflakeCredentials,
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
    DownloadFileType,
    Explore,
    ExploreError,
    FilterableDimension,
    FilterGroupItem,
    FilterOperator,
    findFieldByIdInExplore,
    ForbiddenError,
    formatRows,
    getDashboardFilterRulesForTables,
    getDateDimension,
    getDimensions,
    getFields,
    getIntrinsicUserAttributes,
    getItemId,
    getMetrics,
    hasIntersection,
    IntrinsicUserAttributes,
    isCustomSqlDimension,
    isDateItem,
    isDimension,
    isExploreError,
    isFilterableDimension,
    isUserWithOrg,
    ItemsMap,
    Job,
    JobStatusType,
    JobStepType,
    JobType,
    MetricQuery,
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
    replaceDimensionInExplore,
    RequestMethod,
    ResultRow,
    SavedChartsInfoForDashboardAvailableFilters,
    SessionUser,
    snakeCaseName,
    SortField,
    SpaceQuery,
    SpaceSummary,
    SqlColumn,
    SqlRunnerPayload,
    SummaryExplore,
    TablesConfiguration,
    TableSelectionType,
    UnexpectedServerError,
    UpdateMetadata,
    UpdateProject,
    UpdateProjectMember,
    UserAttributeValueMap,
    UserWarehouseCredentials,
    WarehouseCatalog,
    WarehouseClient,
    WarehouseCredentials,
    WarehouseTables,
    WarehouseTableSchema,
    WarehouseTypes,
    type ApiCreateProjectResults,
} from '@lightdash/common';
import { SshTunnel } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { uniq } from 'lodash';
import { nanoid } from 'nanoid';
import { PassThrough, Readable } from 'stream';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { Worker } from 'worker_threads';
import {
    LightdashAnalytics,
    QueryExecutionContext,
} from '../../analytics/LightdashAnalytics';
import { S3Client } from '../../clients/Aws/s3';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../../config/parseConfig';
import { errorHandler } from '../../errors';
import Logger from '../../logging/logger';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { EmailModel } from '../../models/EmailModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { projectAdapterFromConfig } from '../../projectAdapters/projectAdapter';
import {
    applyLimitToSqlQuery,
    buildQuery,
    CompiledQuery,
} from '../../queryBuilder';
import { compileMetricQuery } from '../../queryCompiler';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { ProjectAdapter } from '../../types';
import { runWorkerThread, wrapSentryTransaction } from '../../utils';
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
    warehouseAvailableTablesModel: WarehouseAvailableTablesModel;
    schedulerClient: SchedulerClient;
    downloadFileModel: DownloadFileModel;
    s3Client: S3Client;
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

    warehouseAvailableTablesModel: WarehouseAvailableTablesModel;

    emailModel: EmailModel;

    schedulerClient: SchedulerClient;

    downloadFileModel: DownloadFileModel;

    s3Client: S3Client;

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
        warehouseAvailableTablesModel,
        emailModel,
        schedulerClient,
        downloadFileModel,
        s3Client,
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
        this.warehouseAvailableTablesModel = warehouseAvailableTablesModel;
        this.emailModel = emailModel;
        this.schedulerClient = schedulerClient;
        this.downloadFileModel = downloadFileModel;
        this.s3Client = s3Client;
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
        let userWarehouseCredentialsUuid: string | undefined;
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
            userWarehouseCredentialsUuid = userWarehouseCredentials.uuid;
        }
        return {
            ...credentials,
            userWarehouseCredentialsUuid,
        };
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
        const getSnowflakeWarehouse = (
            snowflakeCredentials: CreateSnowflakeCredentials,
        ): string => {
            if (snowflakeCredentials.override) {
                this.logger.debug(
                    `Overriding snowflake warehouse ${snowflakeVirtualWarehouse} with ${snowflakeCredentials.warehouse}`,
                );
                return snowflakeCredentials.warehouse;
            }
            return snowflakeVirtualWarehouse || snowflakeCredentials.warehouse;
        };

        const credentialsWithWarehouse =
            credentials.type === WarehouseTypes.SNOWFLAKE
                ? {
                      ...warehouseSshCredentials,
                      warehouse: getSnowflakeWarehouse(credentials),
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

    static async _compileQuery(
        metricQuery: MetricQuery,
        explore: Explore,
        warehouseClient: WarehouseClient,
        intrinsicUserAttributes: IntrinsicUserAttributes,
        userAttributes: UserAttributeValueMap,
        timezone: string,
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
            timezone,
        });

        return buildQueryResult;
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

        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
            user.userUuid,
        );
        const intrinsicUserAttributes = emailStatus.isVerified
            ? getIntrinsicUserAttributes(user)
            : {};

        const compiledQuery = await ProjectService._compileQuery(
            metricQuery,
            explore,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            this.lightdashConfig.query.timezone || 'UTC',
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
        context: QueryExecutionContext = QueryExecutionContext.VIEW_UNDERLYING_DATA,
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
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
        };

        return this.runQueryAndFormatRows({
            user,
            metricQuery,
            projectUuid,
            exploreName,
            csvLimit,
            context,
            queryTags,
            chartUuid: undefined,
        });
    }

    async runViewChartQuery({
        user,
        chartUuid,
        versionUuid,
        invalidateCache,
        context = QueryExecutionContext.CHART,
    }: {
        user: SessionUser;
        chartUuid: string;
        versionUuid?: string;
        invalidateCache?: boolean;
        context?: QueryExecutionContext;
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
                context,
                queryTags,
                invalidateCache,
                explore,
                chartUuid,
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
        autoRefresh,
        context = QueryExecutionContext.DASHBOARD,
    }: {
        user: SessionUser;
        chartUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        invalidateCache?: boolean;
        dashboardSorts: SortField[];
        granularity?: DateGranularity;
        autoRefresh?: boolean;
        context?: QueryExecutionContext;
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
                context: autoRefresh
                    ? QueryExecutionContext.AUTOREFRESHED_DASHBOARD
                    : context,
                queryTags,
                invalidateCache,
                explore,
                granularity,
                chartUuid,
            });

        const metricQueryDimensions = [
            ...metricQueryWithDashboardOverrides.dimensions,
            ...(metricQueryWithDashboardOverrides.customDimensions ?? []),
        ];
        const hasADateDimension = exploreDimensions.find(
            (c) =>
                metricQueryDimensions.includes(getItemId(c)) && isDateItem(c),
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
        context: QueryExecutionContext = QueryExecutionContext.EXPLORE,
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
            chartUuid: undefined,
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
        chartUuid,
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
        chartUuid: string | undefined;
    }): Promise<ApiQueryResults> {
        return wrapSentryTransaction(
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
                        chartUuid,
                    });
                span.setAttribute('rows', rows.length);

                const { warehouseConnection } =
                    await this.projectModel.getWithSensitiveFields(projectUuid);
                if (warehouseConnection) {
                    span.setAttribute('warehouse', warehouseConnection?.type);
                }

                // If there are more than 500 rows, we need to format them in a background job
                const formattedRows = await wrapSentryTransaction<ResultRow[]>(
                    'ProjectService.runQueryAndFormatRows.formatRows',
                    {
                        rows: rows.length,
                        warehouse: warehouseConnection?.type,
                    },
                    async (formatRowsSpan) => {
                        const useWorker = rows.length > 500;
                        formatRowsSpan.setAttribute('useWorker', useWorker);

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
        context: QueryExecutionContext,
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
                    context,
                    chartUuid,
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
    }: {
        projectUuid: string;
        context: QueryExecutionContext;
        warehouseClient: WarehouseClient;
        query: any;
        metricQuery: MetricQuery;
        queryTags?: RunQueryTags;
        invalidateCache?: boolean;
    }): Promise<{
        rows: Record<string, any>[];
        cacheMetadata: CacheMetadata;
    }> {
        return wrapSentryTransaction(
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
                const warehouseResults = await wrapSentryTransaction(
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
                            // metricQuery.timezone,
                        ),
                );

                if (this.lightdashConfig.resultsCache?.enabled) {
                    this.logger.debug(
                        `Writing data to cache with key ${queryHash}`,
                    );
                    const buffer = Buffer.from(
                        JSON.stringify(warehouseResults),
                    );
                    // fire and forget
                    this.s3CacheClient
                        .uploadResults(queryHash, buffer, queryTags)
                        .catch((e) => undefined); // ignore since error is tracked in s3Client
                }

                return {
                    rows: warehouseResults.rows,
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
        chartUuid,
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
        chartUuid: string | undefined; // for analytics
    }): Promise<{
        rows: Record<string, any>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
    }> {
        return wrapSentryTransaction(
            'ProjectService.runMetricQuery',
            {},
            async (span) => {
                try {
                    if (!isUserWithOrg(user)) {
                        throw new ForbiddenError(
                            'User is not part of an organization',
                        );
                    }

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

                    const fullQuery = await ProjectService._compileQuery(
                        metricQueryWithLimit,
                        explore,
                        warehouseClient,
                        intrinsicUserAttributes,
                        userAttributes,
                        this.lightdashConfig.query.timezone || 'UTC',
                        granularity,
                    );

                    const { fields, query, hasExampleMetric } = fullQuery;

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

                    this.analytics.track({
                        userId: user.userUuid,
                        event: 'query.executed',
                        properties: {
                            organizationId: organizationUuid,
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
                                metricQuery.metrics.includes(getItemId(metric)),
                            ).length,
                            additionalMetricsFilterCount: (
                                metricQuery.additionalMetrics || []
                            ).filter(
                                (metric) =>
                                    metricQuery.metrics.includes(
                                        getItemId(metric),
                                    ) &&
                                    metric.filters &&
                                    metric.filters.length > 0,
                            ).length,
                            additionalMetricsPercentFormatCount: (
                                metricQuery.additionalMetrics || []
                            ).filter(
                                (metric) =>
                                    metricQuery.metrics.includes(
                                        getItemId(metric),
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
                                        getItemId(metric),
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
                                        getItemId(metric),
                                    ) &&
                                    metric.formatOptions &&
                                    metric.formatOptions.type ===
                                        CustomFormatType.NUMBER,
                            ).length,
                            context,
                            ...countCustomDimensionsInMetricQuery(metricQuery),
                            dateZoomGranularity: granularity || null,
                            timezone: metricQuery.timezone,
                            ...(queryTags?.dashboard_uuid
                                ? { dashboardId: queryTags.dashboard_uuid }
                                : {}),
                            chartId: chartUuid,
                        },
                    });
                    this.logger.debug(
                        `Fetch query results from cache or warehouse`,
                    );
                    span.setAttribute('generatedSql', query);

                    span.setAttribute('lightdash.projectUuid', projectUuid);
                    span.setAttribute(
                        'warehouse.type',
                        warehouseClient.credentials.type,
                    );

                    const { rows, cacheMetadata } =
                        await this.getResultsFromCacheOrWarehouse({
                            projectUuid,
                            context,
                            warehouseClient,
                            metricQuery: metricQueryWithLimit,
                            query,
                            queryTags,
                            invalidateCache,
                        });
                    await sshTunnel.disconnect();
                    return { rows, cacheMetadata, fields };
                } catch (e) {
                    span.setStatus({
                        code: 2, // ERROR
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

        this.analytics.track({
            userId: user.userUuid,
            event: 'query.executed',
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                context: QueryExecutionContext.SQL_RUNNER,
                usingStreaming: false,
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

        // enforce limit for current SQL queries as it may crash server. We are working on a new SQL runner that supports streaming
        const cteWithLimit = `
            WITH cte AS (\n${sql.replace(/;$/, '')}\n)
            SELECT *
            FROM cte LIMIT ${this.lightdashConfig.query.maxLimit}`;

        const results = await warehouseClient.runQuery(cteWithLimit, queryTags);
        await sshTunnel.disconnect();
        return results;
    }

    async streamSqlQueryIntoFile({
        userUuid,
        projectUuid,
        sql,
        limit,
        sqlChartUuid,
        context,
    }: SqlRunnerPayload): Promise<{
        fileUrl: string;
        columns: SqlColumn[];
    }> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        const query = applyLimitToSqlQuery({ sqlQuery: sql, limit });

        this.analytics.track({
            userId: userUuid,
            event: 'query.executed',
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                context: context as QueryExecutionContext,
                sqlChartId: sqlChartUuid,
                usingStreaming: true,
            },
        });
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, userUuid),
        );
        this.logger.debug(`Stream query against warehouse`);
        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            user_uuid: userUuid,
        };

        const columns: SqlColumn[] = [];

        const fileUrl = await this.downloadFileModel.streamFunction(
            this.s3Client,
        )(
            `${this.lightdashConfig.siteUrl}/api/v1/projects/${projectUuid}/sqlRunner/results`,
            async (writer) => {
                await warehouseClient.streamQuery(
                    query,
                    async ({ rows, fields }) => {
                        if (!columns.length) {
                            // Get column types from first row of results
                            columns.push(
                                ...Object.keys(fields).map((fieldName) => ({
                                    reference: fieldName,
                                    type: fields[fieldName].type,
                                })),
                            );
                        }

                        const formattedRows = formatRows(rows, {}); // TODO fields to itemmap
                        formattedRows.forEach(writer);
                    },
                    {
                        tags: queryTags,
                    },
                );
            },
            this.s3Client,
        );

        await sshTunnel.disconnect();

        return { fileUrl, columns };
    }

    async getFileStream(
        user: SessionUser,
        projectUuid: string,
        fileId: string,
    ): Promise<Readable> {
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

        const downloadFile = await this.downloadFileModel.getDownloadFile(
            fileId,
        );
        switch (downloadFile.type) {
            case DownloadFileType.JSONL:
                return fs.createReadStream(downloadFile.path);
            case DownloadFileType.S3_JSONL:
                return this.s3Client.getS3FileStream(downloadFile.path);
            default:
                throw new ParameterError('File is not a valid JSONL file');
        }
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

        if (!isDimension(field)) {
            throw new ParameterError(
                `Searching by field is only available for dimensions, but ${fieldId} is a ${field.type}`,
            );
        }
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
            dimensions: [getItemId(field)],
            metrics: [],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: autocompleteDimensionFilters,
                },
            },
            tableCalculations: [],
            sorts: [
                {
                    fieldId: getItemId(field),
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
            this.lightdashConfig.query.timezone || 'UTC',
        );

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

        return rows.map((row) => row[getItemId(field)]);
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
                subject('CompileProject', {
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
                subject('CompileProject', {
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
        includeErrors: boolean = true,
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
                    return includeErrors
                        ? [
                              ...acc,
                              {
                                  name: explore.name,
                                  label: explore.label,
                                  tags: explore.tags,
                                  groupLabel: explore.groupLabel,
                                  errors: explore.errors,
                                  databaseName:
                                      explore.baseTable &&
                                      explore.tables?.[explore.baseTable]
                                          ?.database,
                                  schemaName:
                                      explore.baseTable &&
                                      explore.tables?.[explore.baseTable]
                                          ?.schema,
                                  description:
                                      explore.baseTable &&
                                      explore.tables?.[explore.baseTable]
                                          ?.description,
                              },
                          ]
                        : acc;
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
        return Sentry.startSpan(
            {
                op: 'ProjectService.getExplore',
                name: 'ProjectService.getExplore',
            },
            async () => {
                const exploresMap = await this.findExplores({
                    user,
                    projectUuid,
                    exploreNames: [exploreName],
                    organizationUuid,
                });
                const explore = exploresMap[exploreName];

                if (!explore) {
                    throw new NotExistsError(
                        `Explore "${exploreName}" does not exist.`,
                    );
                }
                if (isExploreError(explore)) {
                    throw new NotExistsError(
                        `Explore "${exploreName}" has an error.`,
                    );
                }
                return explore;
            },
        );
    }

    private async findExplores({
        user,
        projectUuid,
        exploreNames,
        organizationUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
        exploreNames: string[];
        organizationUuid?: string;
    }): Promise<Record<string, Explore | ExploreError>> {
        return Sentry.startSpan(
            {
                op: 'ProjectService.findExplores',
                name: 'ProjectService.findExplores',
                attributes: {
                    projectUuid,
                    exploreNames,
                    organizationUuid,
                },
            },

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
                const explores = await this.projectModel.findExploresFromCache(
                    projectUuid,
                    exploreNames,
                );

                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid: project.organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );

                return Object.values(explores).reduce<
                    Record<string, Explore | ExploreError>
                >((acc, explore) => {
                    if (isExploreError(explore)) {
                        acc[explore.name] = explore;
                    } else {
                        const shouldFilterExplore =
                            exploreHasFilteredAttribute(explore);
                        if (!shouldFilterExplore) {
                            acc[explore.name] = explore;
                        } else {
                            acc[explore.name] = getFilteredExplore(
                                explore,
                                userAttributes,
                            );
                        }
                    }
                    return acc;
                }, {});
            },
        );
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

    private static getWarehouseSchema(
        credentials: WarehouseCredentials,
    ): string | undefined {
        switch (credentials.type) {
            case WarehouseTypes.BIGQUERY:
                return credentials.dataset;
            case WarehouseTypes.DATABRICKS:
                return credentials.catalog;
            default:
                return credentials.schema;
        }
    }

    private static getWarehouseDatabase(
        credentials: WarehouseCredentials,
    ): string | undefined {
        switch (credentials.type) {
            case WarehouseTypes.BIGQUERY:
                return credentials.project;
            case WarehouseTypes.REDSHIFT:
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.TRINO:
                return credentials.dbname;
            case WarehouseTypes.SNOWFLAKE:
            case WarehouseTypes.DATABRICKS:
                return credentials.database.toLowerCase();
            default:
                return assertUnreachable(credentials, 'Unknown warehouse type');
        }
    }

    async populateWarehouseTablesCache(
        user: SessionUser,
        projectUuid: string,
    ): Promise<WarehouseCatalog> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const credentials = await this.getWarehouseCredentials(
            projectUuid,
            user.userUuid,
        );

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            credentials,
        );

        const schema = ProjectService.getWarehouseSchema(credentials);

        const warehouseTables = await warehouseClient.getAllTables(schema);

        const catalog =
            WarehouseAvailableTablesModel.toWarehouseCatalog(warehouseTables);

        if (credentials.userWarehouseCredentialsUuid) {
            await this.warehouseAvailableTablesModel.createAvailableTablesForUserWarehouseCredentials(
                credentials.userWarehouseCredentialsUuid,
                warehouseTables,
            );
        } else {
            await this.warehouseAvailableTablesModel.createAvailableTablesForProjectWarehouseCredentials(
                projectUuid,
                warehouseTables,
            );
        }

        await sshTunnel.disconnect();

        return catalog;
    }

    async getWarehouseTables(
        user: SessionUser,
        projectUuid: string,
    ): Promise<WarehouseCatalog> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const credentials = await this.getWarehouseCredentials(
            projectUuid,
            user.userUuid,
        );

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            credentials,
        );

        const schema = ProjectService.getWarehouseSchema(credentials);

        let catalog: WarehouseCatalog | null = null;
        // Check the cache for catalog
        if (credentials.userWarehouseCredentialsUuid) {
            catalog =
                await this.warehouseAvailableTablesModel.getTablesForUserWarehouseCredentials(
                    credentials.userWarehouseCredentialsUuid,
                );
        } else {
            catalog =
                await this.warehouseAvailableTablesModel.getTablesForProjectWarehouseCredentials(
                    projectUuid,
                );
        }

        // If there was no cached catalog, generate it
        if (!catalog || Object.keys(catalog).length === 0) {
            catalog = await this.populateWarehouseTablesCache(
                user,
                projectUuid,
            );
        }

        await sshTunnel.disconnect();

        if (!catalog) {
            throw new NotFoundError('Warehouse tables not found');
        }

        return catalog;
    }

    async getWarehouseFields(
        user: SessionUser,
        projectUuid: string,
        tableName: string,
    ): Promise<WarehouseTableSchema> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const credentials = await this.getWarehouseCredentials(
            projectUuid,
            user.userUuid,
        );

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            credentials,
        );

        const queryTags: RunQueryTags = {
            organization_uuid: user.organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
        };
        const schema = ProjectService.getWarehouseSchema(credentials);
        const database = ProjectService.getWarehouseDatabase(credentials);

        if (!schema) {
            throw new NotFoundError(
                'Schema not found in warehouse credentials',
            );
        }
        if (!database) {
            throw new NotFoundError(
                'Database not found in warehouse credentials',
            );
        }

        const warehouseCatalog = await warehouseClient.getFields(
            tableName,
            schema,
            queryTags,
        );

        await sshTunnel.disconnect();

        return warehouseCatalog[database][schema][tableName];
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
        return Sentry.startSpan(
            {
                op: 'projectService.getAvailableFiltersForSavedQuery',
                name: 'ProjectService.getAvailableFiltersForSavedQuery',
            },
            async () => {
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
            },
        );
    }

    async getAvailableFiltersForSavedQueries(
        user: SessionUser,
        savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
    ): Promise<DashboardAvailableFilters> {
        let allFilters: {
            uuid: string;
            filters: CompiledDimension[];
        }[] = [];

        allFilters = await Sentry.startSpan(
            {
                op: 'projectService.getAvailableFiltersForSavedQueries',
                name: 'ProjectService.getAvailableFiltersForSavedQueries',
            },
            async () => {
                const savedQueryUuids = savedChartUuidsAndTileUuids.map(
                    ({ savedChartUuid }) => savedChartUuid,
                );

                const savedCharts =
                    await this.savedChartModel.getInfoForAvailableFilters(
                        savedQueryUuids,
                    );
                const uniqueSpaceUuids = [
                    ...new Set(savedCharts.map((chart) => chart.spaceUuid)),
                ];

                if (savedCharts.length === 0) {
                    return [];
                }

                const [spaceAccessMap, exploresMap, userSpacesAccess] =
                    await Promise.all([
                        this.spaceModel.getSpacesForAccessCheck(
                            uniqueSpaceUuids,
                        ),
                        this.findExplores({
                            user,
                            projectUuid: savedCharts[0].projectUuid, // TODO: route should be updated to be project/dashboard specific. For now we pick it from first chart as they all should be from the same project
                            exploreNames: savedCharts.map(
                                (chart) => chart.tableName,
                            ),
                            organizationUuid: user.organizationUuid,
                        }),
                        this.spaceModel.getUserSpacesAccess(
                            user.userUuid,
                            uniqueSpaceUuids,
                        ),
                    ]);

                return savedCharts.map((savedChart) => {
                    const spaceAccess = spaceAccessMap.get(
                        savedChart.spaceUuid,
                    );

                    if (
                        user.ability.cannot(
                            'view',
                            subject('SavedChart', {
                                ...savedChart,
                                isPrivate: spaceAccess?.isPrivate,
                                access:
                                    userSpacesAccess[savedChart.spaceUuid] ??
                                    [],
                            }),
                        )
                    ) {
                        return { uuid: savedChart.uuid, filters: [] };
                    }

                    const explore = exploresMap[savedChart.tableName];

                    let filters: CompiledDimension[] = [];
                    if (explore && !isExploreError(explore)) {
                        filters = getDimensions(explore).filter(
                            (field) =>
                                isFilterableDimension(field) && !field.hidden,
                        );
                    }

                    return { uuid: savedChart.uuid, filters };
                });
            },
        );

        const allFilterableFields: FilterableDimension[] = [];
        const filterIndexMap: Record<string, number> = {};

        allFilters.forEach((filterSet) => {
            filterSet.filters.forEach((filter) => {
                const fieldId = getItemId(filter);
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
                (filter) => filterIndexMap[getItemId(filter)],
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
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        const allowedSpaceUuids = spaces
            .filter(
                (space) =>
                    space.projectUuid === projectUuid &&
                    hasViewAccessToSpace(
                        user,
                        space,
                        spacesAccess[space.uuid] ?? [],
                    ),
            )
            .map(({ uuid }) => uuid);

        return this.spaceModel.getSpaceQueries(allowedSpaceUuids);
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
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        const allowedSpaceUuids = spaces
            .filter(
                (space) =>
                    space.projectUuid === projectUuid &&
                    hasViewAccessToSpace(
                        user,
                        space,
                        spacesAccess[space.uuid] ?? [],
                    ),
            )
            .map((space) => space.uuid);

        return this.savedChartModel.find({
            projectUuid,
            spaceUuids: allowedSpaceUuids,
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
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        const spacesWithUserAccess = spaces
            .filter((space) =>
                hasViewAccessToSpace(user, space, spacesAccess[space.uuid]),
            )
            .map((spaceSummary) => ({
                ...spaceSummary,
                userAccess: spacesAccess[spaceSummary.uuid]?.[0] ?? [],
            }));

        return spacesWithUserAccess;
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
                const spacesAccess = await this.spaceModel.getUserSpacesAccess(
                    user.userUuid,
                    spaces.map((s) => s.uuid),
                );
                const allowedSpaces = spaces.filter((space) =>
                    hasViewAccessToSpace(
                        user,
                        space,
                        spacesAccess[space.uuid] ?? [],
                    ),
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
            customDimensions: metricQuery.customDimensions,
            metrics: metricQuery.metrics,
            additionalMetrics: metricQuery.additionalMetrics,
        };

        const { query } = await ProjectService._compileQuery(
            totalQuery,
            explore,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            this.lightdashConfig.query.timezone || 'UTC',
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

        const { query, totalQuery } = await this._getCalculateTotalQuery(
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

        if (
            data.metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
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
}
