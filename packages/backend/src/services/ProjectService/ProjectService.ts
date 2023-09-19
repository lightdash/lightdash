import { subject } from '@casl/ability';
import {
    AdditionalMetric,
    AlreadyProcessingError,
    AndFilterGroup,
    ApiQueryResults,
    ApiSqlQueryResults,
    ChartSummary,
    countTotalFilterRules,
    CreateDbtCloudIntegration,
    CreateJob,
    CreateProject,
    CreateProjectMember,
    CreateWarehouseCredentials,
    DashboardAvailableFilters,
    DbtProjectType,
    deepEqual,
    DefaultSupportedDbtVersion,
    Explore,
    ExploreError,
    fieldId as getFieldId,
    FilterableField,
    FilterGroup,
    FilterGroupItem,
    FilterOperator,
    Filters,
    findFieldByIdInExplore,
    ForbiddenError,
    formatRows,
    getDimensions,
    getFields,
    getItemId,
    getItemMap,
    getMetrics,
    hasIntersection,
    isExploreError,
    isFilterableDimension,
    isUserWithOrg,
    Job,
    JobStatusType,
    JobStepType,
    JobType,
    MetricQuery,
    MetricType,
    MissingWarehouseCredentialsError,
    NotExistsError,
    NotFoundError,
    ParameterError,
    Project,
    ProjectCatalog,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectType,
    RequestMethod,
    ResultRow,
    SchedulerCsvOptions,
    SessionUser,
    SpaceSummary,
    SummaryExplore,
    TableCalculationFormatType,
    TablesConfiguration,
    TableSelectionType,
    UpdateProject,
    UpdateProjectMember,
    UserAttribute,
    WarehouseClient,
    WarehouseTypes,
} from '@lightdash/common';
import { SshTunnel } from '@lightdash/warehouses';
import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { Worker } from 'worker_threads';
import { analytics } from '../../analytics/client';
import { QueryExecutionContext } from '../../analytics/LightdashAnalytics';
import { schedulerClient } from '../../clients/clients';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { lightdashConfig } from '../../config/lightdashConfig';
import { errorHandler } from '../../errors';
import Logger from '../../logging/logger';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { projectAdapterFromConfig } from '../../projectAdapters/projectAdapter';
import { buildQuery } from '../../queryBuilder';
import { compileMetricQuery } from '../../queryCompiler';
import { ProjectAdapter } from '../../types';
import { runWorkerThread, wrapSentryTransaction } from '../../utils';
import { hasSpaceAccess } from '../SpaceService/SpaceService';
import {
    exploreHasFilteredAttribute,
    filterDimensionsFromExplore,
} from '../UserAttributesService/UserAttributeUtils';

type RunQueryTags = {
    project_uuid?: string;
    user_uuid?: string;
    organization_uuid?: string;
    chart_uuid?: string;
};

type ProjectServiceDependencies = {
    projectModel: ProjectModel;
    onboardingModel: OnboardingModel;
    savedChartModel: SavedChartModel;
    jobModel: JobModel;
    emailClient: EmailClient;
    spaceModel: SpaceModel;
    sshKeyPairModel: SshKeyPairModel;
    userAttributesModel: UserAttributesModel;
};

export class ProjectService {
    projectModel: ProjectModel;

    onboardingModel: OnboardingModel;

    warehouseClients: Record<string, WarehouseClient>;

    savedChartModel: SavedChartModel;

    jobModel: JobModel;

    emailClient: EmailClient;

    spaceModel: SpaceModel;

    sshKeyPairModel: SshKeyPairModel;

    userAttributesModel: UserAttributesModel;

    constructor({
        projectModel,
        onboardingModel,
        savedChartModel,
        jobModel,
        emailClient,
        spaceModel,
        sshKeyPairModel,
        userAttributesModel,
    }: ProjectServiceDependencies) {
        this.projectModel = projectModel;
        this.onboardingModel = onboardingModel;
        this.warehouseClients = {};
        this.savedChartModel = savedChartModel;
        this.jobModel = jobModel;
        this.emailClient = emailClient;
        this.spaceModel = spaceModel;
        this.sshKeyPairModel = sshKeyPairModel;
        this.userAttributesModel = userAttributesModel;
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

    private async _getWarehouseClient(projectUuid: string): Promise<{
        warehouseClient: WarehouseClient;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
    }> {
        // Always load the latest credentials from the database
        const credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        // Setup SSH tunnel for client (user needs to close this)
        const sshTunnel = new SshTunnel(credentials);
        const warehouseSshCredentials = await sshTunnel.connect();

        // Check cache for existing client (always false if ssh tunnel was connected)
        const existingClient = this.warehouseClients[projectUuid] as
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
        const client = this.projectModel.getWarehouseClientFromCredentials(
            warehouseSshCredentials,
        );
        this.warehouseClients[projectUuid] = client;
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
    ): Promise<Project> {
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

        analytics.track({
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
                copiedFromProjectUuid: data.copiedFromProjectUuid,
            },
        });

        if (data.copiedFromProjectUuid) {
            try {
                const project = await this.projectModel.get(
                    data.copiedFromProjectUuid,
                );
                // We only allow copying from projects if the user is an admin until we remove the `createProjectAccess` call above
                if (
                    user.ability.cannot(
                        'manage',
                        subject('Project', {
                            organizationUuid: project.organizationUuid,
                            projectUuid: data.copiedFromProjectUuid,
                        }),
                    )
                ) {
                    throw new ForbiddenError();
                }
                await this.copyContentOnPreview(
                    data.copiedFromProjectUuid,
                    projectUuid,
                );
            } catch (e) {
                Sentry.captureException(e);
                Logger.error(`Unable to copy content on preview ${e}`);
            }
        }

        return this.projectModel.get(projectUuid);
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
                        ProjectService.testProjectAdapter(createProject),
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
                analytics.track({
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
            Logger.error(`Error running background job: ${e}`),
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
        const { organizationUuid } = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
                'update',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.projectModel.saveExploresToCache(projectUuid, explores);

        await schedulerClient.generateValidation({
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
            await schedulerClient.testAndCompileProject({
                organizationUuid: user.organizationUuid,
                createdByUserUuid: user.userUuid,
                projectUuid,
                requestMethod: method,
                jobUuid: job.jobUuid,
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
            analytics.track({
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

    private static async testProjectAdapter(data: UpdateProject): Promise<{
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

        analytics.track({
            event: 'project.deleted',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                isPreview: type === ProjectType.PREVIEW,
            },
        });
    }

    private async buildAdapter(projectUuid: string): Promise<{
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

    private static async _compileQuery(
        metricQuery: MetricQuery,
        explore: Explore,
        warehouseClient: WarehouseClient,
        userUuid: string,
        userAttributes: UserAttribute[],
    ): Promise<{ query: string; hasExampleMetric: boolean }> {
        const compiledMetricQuery = compileMetricQuery({
            explore,
            metricQuery,
            warehouseClient,
        });
        return buildQuery({
            explore,
            compiledMetricQuery,
            warehouseClient,
            userUuid,
            userAttributes,
        });
    }

    async compileQuery(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
    ): Promise<{ query: string; hasExampleMetric: boolean }> {
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
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
        );
        const explore = await this.getExplore(user, projectUuid, exploreName);
        const userAttributes = await this.userAttributesModel.find({
            organizationUuid,
            userUuid: user.userUuid,
        });
        const compiledQuery = ProjectService._compileQuery(
            metricQuery,
            explore,
            warehouseClient,
            user.userUuid,
            userAttributes,
        );
        await sshTunnel.disconnect();
        return compiledQuery;
    }

    static metricQueryWithLimit(
        metricQuery: MetricQuery,
        csvLimit: number | null | undefined,
    ): MetricQuery {
        if (csvLimit === undefined) {
            if (metricQuery.limit > lightdashConfig.query?.maxLimit) {
                throw new ParameterError(
                    `Query limit can not exceed ${lightdashConfig.query.maxLimit}`,
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

        const cellsLimit = lightdashConfig.query?.csvCellsLimit || 100000;
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

        const queryTags: RunQueryTags = {
            organization_uuid: projectUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
        };

        return this.runQueryAndFormatRows(
            user,
            metricQuery,
            projectUuid,
            exploreName,
            csvLimit,
            QueryExecutionContext.VIEW_UNDERLYING_DATA,

            queryTags,
        );
    }

    private static combineFilters(
        metricQuery: MetricQuery,
        filters: Filters,
    ): MetricQuery {
        return {
            ...metricQuery,
            filters: {
                dimensions: {
                    id: 'and-dimensions',
                    and: [
                        metricQuery.filters?.dimensions,
                        filters.dimensions,
                    ].reduce<FilterGroup[]>((acc, val) => {
                        if (val) return [...acc, val];
                        return acc;
                    }, []),
                },
                metrics: {
                    id: 'and-metrics',
                    and: [metricQuery.filters?.metrics, filters.metrics].reduce<
                        FilterGroup[]
                    >((acc, val) => {
                        if (val) return [...acc, val];
                        return acc;
                    }, []),
                },
            },
        };
    }

    async runViewChartQuery(
        user: SessionUser,
        chartUuid: string,
        filters?: Filters,
    ): Promise<ApiQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const savedChart = await this.savedChartModel.get(chartUuid);
        const { organizationUuid, projectUuid } = savedChart;

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const space = await this.spaceModel.getSpaceSummary(
            savedChart.spaceUuid,
        );

        if (!hasSpaceAccess(user, space)) {
            throw new ForbiddenError();
        }

        const metricQuery: MetricQuery = filters
            ? ProjectService.combineFilters(savedChart.metricQuery, filters)
            : savedChart.metricQuery;

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            chart_uuid: chartUuid,
        };

        return this.runQueryAndFormatRows(
            user,
            metricQuery,
            projectUuid,
            savedChart.tableName,
            undefined,
            filters
                ? QueryExecutionContext.DASHBOARD
                : QueryExecutionContext.CHART,

            queryTags,
        );
    }

    async runExploreQuery(
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
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
        };

        return this.runQueryAndFormatRows(
            user,
            metricQuery,
            projectUuid,
            exploreName,
            csvLimit,
            QueryExecutionContext.EXPLORE,
            queryTags,
        );
    }

    private async runQueryAndFormatRows(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
        csvLimit: number | null | undefined,
        context: QueryExecutionContext,
        queryTags?: RunQueryTags,
    ): Promise<ApiQueryResults> {
        const rows = await this.runMetricQuery(
            user,
            metricQuery,
            projectUuid,
            exploreName,
            csvLimit,
            context,
            queryTags,
        );

        const { warehouseConnection } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        const explore = await this.getExplore(user, projectUuid, exploreName);

        const itemMap = getItemMap(
            explore,
            metricQuery.additionalMetrics,
            metricQuery.tableCalculations,
        );

        // If there are more than 500 rows, we need to format them in a background job
        const formattedRows =
            rows.length > 500
                ? await wrapSentryTransaction<ResultRow[]>(
                      'formatted rows',
                      {
                          rows: rows.length,
                          warehouse: warehouseConnection?.type,
                      },
                      async () =>
                          runWorkerThread<ResultRow[]>(
                              new Worker(
                                  './dist/services/ProjectService/formatRows.js',
                                  {
                                      workerData: {
                                          rows,
                                          itemMap,
                                      },
                                  },
                              ),
                          ),
                  )
                : formatRows(rows, itemMap);

        return {
            rows: formattedRows,
            metricQuery,
        };
    }

    async getResultsForChart(
        user: SessionUser,
        chartUuid: string,
    ): Promise<Record<string, any>[]> {
        const rows = await wrapSentryTransaction(
            'getResultsForChartWithWarehouseQuery',
            {
                user,
                chartUuid,
            },
            async () => {
                const chart = await this.savedChartModel.get(chartUuid);
                const { metricQuery } = chart;
                const exploreId = chart.tableName;

                return this.runMetricQuery(
                    user,
                    metricQuery,
                    chart.projectUuid,
                    exploreId,
                    undefined,
                    QueryExecutionContext.GSHEETS,
                );
            },
        );

        return rows;
    }

    async runMetricQuery(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
        csvLimit: number | null | undefined,
        context: QueryExecutionContext,
        queryTags?: RunQueryTags,
    ): Promise<Record<string, any>[]> {
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

                    const { organizationUuid } =
                        await this.projectModel.getWithSensitiveFields(
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

                    const metricQueryWithLimit =
                        ProjectService.metricQueryWithLimit(
                            metricQuery,
                            csvLimit,
                        );

                    const { warehouseClient, sshTunnel } =
                        await this._getWarehouseClient(projectUuid);
                    const explore = await this.getExplore(
                        user,
                        projectUuid,
                        exploreName,
                    );
                    const userAttributes = await this.userAttributesModel.find({
                        organizationUuid,
                        userUuid: user.userUuid,
                    });

                    const { query, hasExampleMetric } =
                        await ProjectService._compileQuery(
                            metricQueryWithLimit,
                            explore,
                            warehouseClient,
                            user.userUuid,
                            userAttributes,
                        );

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

                    await analytics.track({
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
                                        TableCalculationFormatType.PERCENT,
                                ).length,
                            tableCalculationsCurrencyFormatCount:
                                metricQuery.tableCalculations.filter(
                                    (tableCalculation) =>
                                        tableCalculation.format?.type ===
                                        TableCalculationFormatType.CURRENCY,
                                ).length,
                            tableCalculationsNumberFormatCount:
                                metricQuery.tableCalculations.filter(
                                    (tableCalculation) =>
                                        tableCalculation.format?.type ===
                                        TableCalculationFormatType.NUMBER,
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
                            context,
                        },
                    });

                    Logger.debug(`Run query against warehouse`);
                    span.setAttribute('generatedSql', query);
                    span.setAttribute('lightdash.projectUuid', projectUuid);
                    span.setAttribute(
                        'warehouse.type',
                        warehouseClient.credentials.type,
                    );
                    const { rows } = await wrapSentryTransaction(
                        'runWarehouseQuery',
                        {
                            query,
                            queryTags,
                            type: warehouseClient.credentials.type,
                        },
                        async () => warehouseClient.runQuery(query, queryTags),
                    );
                    await sshTunnel.disconnect();
                    return rows;
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
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('SqlRunner', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        await analytics.track({
            userId: user.userUuid,
            event: 'sql.executed',
            properties: {
                projectId: projectUuid,
            },
        });
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
        );
        Logger.debug(`Run query against warehouse`);
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

        if (limit > lightdashConfig.query.maxLimit) {
            throw new ParameterError(
                `Query limit can not exceed ${lightdashConfig.query.maxLimit}`,
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
        );
        const userAttributes = await this.userAttributesModel.find({
            organizationUuid,
            userUuid: user.userUuid,
        });
        const { query } = await ProjectService._compileQuery(
            metricQuery,
            explore,
            warehouseClient,
            user.userUuid,
            userAttributes,
        );

        Logger.debug(`Run query against warehouse`);
        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            user_uuid: user.userUuid,
            project_uuid: projectUuid,
        };
        const { rows } = await warehouseClient.runQuery(query, queryTags);
        await sshTunnel.disconnect();

        analytics.track({
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
        const { adapter, sshTunnel } = await this.buildAdapter(projectUuid);
        const packages = await adapter.getDbtPackages();
        try {
            const explores = await adapter.compileAllExplores();
            analytics.track({
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
                                Logger.error(
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
                },
            });
            return explores;
        } catch (e) {
            const errorResponse = errorHandler(e);
            analytics.track({
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
            const { organizationUuid } =
                await this.projectModel.getWithSensitiveFields(job.projectUuid);
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
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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

        await schedulerClient.compileProject({
            createdByUserUuid: user.userUuid,
            organizationUuid,
            projectUuid,
            requestMethod,
            jobUuid: job.jobUuid,
        });

        return { jobUuid: job.jobUuid };
    }

    async compileProject(
        user: SessionUser,
        projectUuid: string,
        requestMethod: RequestMethod,
        jobUuid: string,
    ) {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
            .catch((e) => Logger.error(`Background job failed: ${e}`));
    }

    async getAllExploresSummary(
        user: SessionUser,
        projectUuid: string,
        filtered: boolean,
    ): Promise<SummaryExplore[]> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
        const allExploreSummaries = explores.map<SummaryExplore>((explore) => {
            if (isExploreError(explore)) {
                return {
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
                        explore.tables?.[explore.baseTable]?.description,
                };
            }

            return {
                name: explore.name,
                label: explore.label,
                tags: explore.tags,
                groupLabel: explore.groupLabel,
                databaseName: explore.tables[explore.baseTable].database,
                schemaName: explore.tables[explore.baseTable].schema,
                description: explore.tables[explore.baseTable].description,
            };
        });

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
    ): Promise<Explore> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'ProjectService.getExplore',
            description: 'Gets a single explore from the cache',
        });
        try {
            const { organizationUuid } = await this.projectModel.get(
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
            const explore = await this.projectModel.getExploreFromCache(
                projectUuid,
                exploreName,
            );

            if (isExploreError(explore)) {
                throw new NotExistsError(
                    `Explore "${exploreName}" does not exist.`,
                );
            }

            if (!exploreHasFilteredAttribute(explore)) {
                return explore;
            }
            const userAttributes = await this.userAttributesModel.find({
                organizationUuid,
                userUuid: user.userUuid,
            });

            return filterDimensionsFromExplore(
                explore,
                user.userUuid,
                userAttributes,
            );
        } finally {
            span?.finish();
        }
    }

    async getCatalog(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectCatalog> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
        analytics.track({
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
    ): Promise<FilterableField[]> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'projectService.getAvailableFiltersForSavedQuery',
            description: 'Gets all filters available for a single query',
        });
        try {
            const savedChart = await this.savedChartModel.get(savedChartUuid);

            if (
                user.ability.cannot('view', subject('SavedChart', savedChart))
            ) {
                throw new ForbiddenError();
            }

            const space = await this.spaceModel.getSpaceSummary(
                savedChart.spaceUuid,
            );
            if (!hasSpaceAccess(user, space)) {
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
        savedQueryUuids: string[],
    ): Promise<DashboardAvailableFilters> {
        const allFilters = await Promise.all(
            savedQueryUuids.map(async (savedQueryUuid) => {
                try {
                    return await this.getAvailableFiltersForSavedQuery(
                        user,
                        savedQueryUuid,
                    );
                } catch (e: unknown) {
                    if (e instanceof ForbiddenError) {
                        return null;
                    }

                    throw e;
                }
            }),
        );

        return savedQueryUuids.reduce<DashboardAvailableFilters>(
            (acc, savedQueryUuid, index) => {
                const filters = allFilters[index];
                if (!filters) return acc;

                return {
                    ...acc,
                    [savedQueryUuid]: filters,
                };
            },
            {},
        );
    }

    async hasSavedCharts(
        user: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
        const project = await this.projectModel.get(projectUuid);
        const projectUrl = new URL(
            `/projects/${projectUuid}/home`,
            lightdashConfig.siteUrl,
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
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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

    async deleteProjectAccess(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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

    async upsertDbtCloudIntegration(
        user: SessionUser,
        projectUuid: string,
        integration: CreateDbtCloudIntegration,
    ) {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
        analytics.track({
            event: 'dbt_cloud_integration.updated',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
            },
        });
        return this.findDbtCloudIntegration(user, projectUuid);
    }

    async deleteDbtCloudIntegration(user: SessionUser, projectUuid: string) {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.projectModel.deleteDbtCloudIntegration(projectUuid);
        analytics.track({
            event: 'dbt_cloud_integration.deleted',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
            },
        });
    }

    async findDbtCloudIntegration(user: SessionUser, projectUuid: string) {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
    ): Promise<ChartSummary[]> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const allowedSpaces = spaces.filter(
            (space) =>
                space.projectUuid === projectUuid &&
                hasSpaceAccess(user, space, true),
        );

        const charts = await this.savedChartModel.find({
            projectUuid,
            spaceUuids: allowedSpaces.map((s) => s.uuid),
        });
        return charts;
    }

    async getSpaces(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SpaceSummary[]> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const allowedSpaces = spaces.filter((space) =>
            hasSpaceAccess(user, space, true),
        );
        return allowedSpaces;
    }

    async copyContentOnPreview(
        projectUuid: string,
        previewProjectUuid: string,
    ): Promise<void> {
        Logger.debug(
            `Copying content from project ${projectUuid} to preview project ${previewProjectUuid}`,
        );
        await wrapSentryTransaction<void>(
            'duplicateContent',
            {
                projectUuid,
            },
            async () => {
                await this.projectModel.duplicateContent(
                    projectUuid,
                    previewProjectUuid,
                );
            },
        );
    }
}
