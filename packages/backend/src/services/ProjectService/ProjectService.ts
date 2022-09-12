import { subject } from '@casl/ability';
import {
    AdditionalMetric,
    AlreadyProcessingError,
    ApiQueryResults,
    ApiSqlQueryResults,
    countTotalFilterRules,
    CreateJob,
    CreateProject,
    CreateProjectMember,
    Explore,
    ExploreError,
    fieldId as getFieldId,
    FilterableField,
    FilterOperator,
    findFieldByIdInExplore,
    ForbiddenError,
    formatRows,
    getDimensions,
    getFields,
    getItemId,
    getMetrics,
    hasIntersection,
    isExploreError,
    isFilterableDimension,
    Job,
    JobStatusType,
    JobStepType,
    JobType,
    MetricQuery,
    MetricType,
    MissingWarehouseCredentialsError,
    NotExistsError,
    NotFoundError,
    Project,
    ProjectCatalog,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectType,
    SessionUser,
    SummaryExplore,
    TablesConfiguration,
    TableSelectionType,
    UpdateProject,
    UpdateProjectMember,
} from '@lightdash/common';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { analytics } from '../../analytics/client';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { lightdashConfig } from '../../config/lightdashConfig';
import { errorHandler } from '../../errors';
import Logger from '../../logger';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { projectAdapterFromConfig } from '../../projectAdapters/projectAdapter';
import { buildQuery } from '../../queryBuilder';
import { compileMetricQuery } from '../../queryCompiler';
import { ProjectAdapter } from '../../types';

type ProjectServiceDependencies = {
    projectModel: ProjectModel;
    onboardingModel: OnboardingModel;
    savedChartModel: SavedChartModel;
    jobModel: JobModel;
    emailClient: EmailClient;
    spaceModel: SpaceModel;
};

export class ProjectService {
    projectModel: ProjectModel;

    onboardingModel: OnboardingModel;

    projectAdapters: Record<string, ProjectAdapter>;

    savedChartModel: SavedChartModel;

    jobModel: JobModel;

    emailClient: EmailClient;

    spaceModel: SpaceModel;

    constructor({
        projectModel,
        onboardingModel,
        savedChartModel,
        jobModel,
        emailClient,
        spaceModel,
    }: ProjectServiceDependencies) {
        this.projectModel = projectModel;
        this.onboardingModel = onboardingModel;
        this.projectAdapters = {};
        this.savedChartModel = savedChartModel;
        this.jobModel = jobModel;
        this.emailClient = emailClient;
        this.spaceModel = spaceModel;
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

    async createPreview(
        user: SessionUser,
        data: CreateProject,
    ): Promise<Project> {
        if (
            user.ability.cannot('create', 'Job') ||
            user.ability.cannot('create', 'Project')
        ) {
            throw new ForbiddenError();
        }
        const projectUuid = await this.projectModel.create(
            user.organizationUuid,
            data,
        );

        // Give admin user permissions to user who created this project even if he is an admin
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
                projectName: data.name,
                projectId: projectUuid,
                projectType: data.dbtConnection.type,
                warehouseConnectionType: data.warehouseConnection.type,
                organizationId: user.organizationUuid,
                dbtConnectionType: data.dbtConnection.type,
                isPreview: true,
            },
        });

        return this.projectModel.get(projectUuid);
    }

    async create(
        user: SessionUser,
        data: CreateProject,
    ): Promise<{ jobUuid: string }> {
        if (
            user.ability.cannot('create', 'Job') ||
            user.ability.cannot('create', 'Project')
        ) {
            throw new ForbiddenError();
        }

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
                const adapter = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.TESTING_ADAPTOR,
                    async () => ProjectService.testProjectAdapter(data),
                );

                const explores = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.COMPILING,
                    async () => adapter.compileAllExplores(),
                );

                const projectUuid = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.CREATING_PROJECT,
                    async () =>
                        this.projectModel.create(user.organizationUuid, data),
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

                this.projectAdapters[projectUuid] = adapter;

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
                        projectName: data.name,
                        projectId: projectUuid,
                        projectType: data.dbtConnection.type,
                        warehouseConnectionType: data.warehouseConnection.type,
                        organizationId: user.organizationUuid,
                        dbtConnectionType: data.dbtConnection.type,
                        isPreview: data.type === ProjectType.PREVIEW,
                    },
                });
                this.projectAdapters[projectUuid] = adapter;
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
        projectUuid: string,
        explores: (Explore | ExploreError)[],
    ): Promise<void> {
        await this.projectModel.saveExploresToCache(projectUuid, explores);
    }

    async update(
        projectUuid: string,
        user: SessionUser,
        data: UpdateProject,
    ): Promise<{ jobUuid: string }> {
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
                { stepType: JobStepType.COMPILING },
            ],
        };

        const updatedProject = ProjectModel.mergeMissingProjectConfigSecrets(
            data,
            savedProject,
        );

        await this.projectModel.update(projectUuid, updatedProject);

        const doAsyncWork = async () => {
            try {
                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.RUNNING,
                });
                const adapter = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.TESTING_ADAPTOR,
                    async () =>
                        ProjectService.testProjectAdapter(updatedProject),
                );
                const explores = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.COMPILING,
                    async () => adapter.compileAllExplores(),
                );
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
                    event: 'project.updated',
                    userId: user.userUuid,
                    properties: {
                        projectName: updatedProject.name,
                        projectId: projectUuid,
                        projectType: updatedProject.dbtConnection.type,
                        warehouseConnectionType:
                            updatedProject.warehouseConnection.type,
                        organizationId: user.organizationUuid,
                        dbtConnectionType: data.dbtConnection.type,
                        isPreview: savedProject.type === ProjectType.PREVIEW,
                    },
                });
                if (this.projectAdapters[projectUuid] !== undefined)
                    await this.projectAdapters[projectUuid].destroy();
                this.projectAdapters[projectUuid] = adapter;
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

    private static async testProjectAdapter(
        data: UpdateProject,
    ): Promise<ProjectAdapter> {
        const adapter = await projectAdapterFromConfig(
            data.dbtConnection,
            data.warehouseConnection,
            {
                warehouseCatalog: undefined,
                onWarehouseCatalogChange: () => {},
            },
        );
        try {
            await adapter.test();
        } catch (e) {
            await adapter.destroy();
            throw e;
        }
        return adapter;
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

        const runningAdapter = this.projectAdapters[projectUuid];
        if (runningAdapter !== undefined) {
            await runningAdapter.destroy();
        }
        delete this.projectAdapters[projectUuid];
    }

    private async restartAdapter(projectUuid: string): Promise<ProjectAdapter> {
        const runningAdapter = this.projectAdapters[projectUuid];
        if (runningAdapter !== undefined) {
            await runningAdapter.destroy();
        }
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
        const adapter = await projectAdapterFromConfig(
            project.dbtConnection,
            project.warehouseConnection,
            {
                warehouseCatalog: cachedWarehouseCatalog,
                onWarehouseCatalogChange: async (warehouseCatalog) => {
                    await this.projectModel.saveWarehouseToCache(
                        projectUuid,
                        warehouseCatalog,
                    );
                },
            },
        );
        this.projectAdapters[projectUuid] = adapter;
        return adapter;
    }

    private async getAdapter(projectUuid: string): Promise<ProjectAdapter> {
        return (
            this.projectAdapters[projectUuid] ||
            this.restartAdapter(projectUuid)
        );
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
        const explore = await this.getExplore(user, projectUuid, exploreName);
        const compiledMetricQuery = compileMetricQuery({
            explore,
            metricQuery,
        });
        return buildQuery({ explore, compiledMetricQuery });
    }

    async runQuery(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
    ): Promise<ApiQueryResults> {
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

        const { query, hasExampleMetric } = await this.compileQuery(
            user,
            metricQuery,
            projectUuid,
            exploreName,
        );

        const onboardingRecord =
            await this.onboardingModel.getByOrganizationUuid(
                user.organizationUuid,
            );
        if (!onboardingRecord.ranQueryAt) {
            await this.onboardingModel.update(user.organizationUuid, {
                ranQueryAt: new Date(),
            });
        }

        await analytics.track({
            userId: user.userUuid,
            event: 'query.executed',
            properties: {
                projectId: projectUuid,
                hasExampleMetric,
                dimensionsCount: metricQuery.dimensions.length,
                metricsCount: metricQuery.metrics.length,
                filtersCount: countTotalFilterRules(metricQuery.filters),
                sortsCount: metricQuery.sorts.length,
                tableCalculationsCount: metricQuery.tableCalculations.length,
                additionalMetricsCount: (
                    metricQuery.additionalMetrics || []
                ).filter((metric) =>
                    metricQuery.metrics.includes(getFieldId(metric)),
                ).length,
            },
        });
        const explore = await this.getExplore(user, projectUuid, exploreName);

        const adapter = await this.getAdapter(projectUuid);
        const { rows } = await adapter.runQuery(query);

        const formattedRows = formatRows(
            rows,
            explore,
            metricQuery.additionalMetrics,
            metricQuery.tableCalculations,
        );

        return {
            rows: formattedRows,
            metricQuery,
        };
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
        const adapter = await this.getAdapter(projectUuid);
        return adapter.runQuery(sql);
    }

    async searchFieldUniqueValues(
        user: SessionUser,
        projectUuid: string,
        fieldId: string,
        search: string,
        limit: number,
    ): Promise<Array<any>> {
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

        const explore = await this.getExploreByFieldId(
            user,
            projectUuid,
            fieldId,
        );

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

        const metricQuery: MetricQuery = {
            dimensions: [],
            metrics: [getItemId(distinctMetric)],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: [
                        {
                            id: uuidv4(),
                            target: {
                                fieldId,
                            },
                            operator: FilterOperator.INCLUDE,
                            values: [search],
                        },
                    ],
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

        const { query } = await this.compileQuery(
            user,
            metricQuery,
            projectUuid,
            explore.name,
        );

        const adapter = await this.getAdapter(projectUuid);
        const { rows } = await adapter.runQuery(query);

        return rows.map((row) => row[getItemId(distinctMetric)]);
    }

    async refreshAllTables(
        user: Pick<SessionUser, 'userUuid'>,
        projectUuid: string,
    ): Promise<(Explore | ExploreError)[]> {
        // Checks that project exists
        const project = await this.projectModel.get(projectUuid);

        // Force refresh adapter (refetch git repos, check for changed credentials, etc.)
        // Might want to cache parts of this in future if slow
        const adapter = await this.restartAdapter(projectUuid);
        const packages = await adapter.getDbtPackages();
        try {
            const explores = await adapter.compileAllExplores();
            analytics.track({
                event: 'project.compiled',
                userId: user.userUuid,
                properties: {
                    projectId: projectUuid,
                    projectName: project.name,
                    projectType: project.dbtConnection.type,
                    warehouseType: project.warehouseConnection?.type,
                    modelsCount: explores.length,
                    modelsWithErrorsCount:
                        explores.filter(isExploreError).length,
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
                },
            });
            return explores;
        } catch (e) {
            const errorResponse = errorHandler(e);
            analytics.track({
                event: 'project.error',
                userId: user.userUuid,
                properties: {
                    projectId: projectUuid,
                    name: errorResponse.name,
                    statusCode: errorResponse.statusCode,
                    projectType: project.dbtConnection.type,
                },
            });
            throw errorResponse;
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

    async compileProject(
        user: SessionUser,
        projectUuid: string,
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

        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            userUuid: user.userUuid,
            projectUuid,
            steps: [{ stepType: JobStepType.COMPILING }],
        };
        return new Promise<{ jobUuid: string }>((resolve, reject) => {
            const onLockFailed = async () => {
                reject(
                    new AlreadyProcessingError('Project is already compiling'),
                );
            };
            const onLockAcquired = async () => {
                await this.jobModel.create(job);
                resolve({ jobUuid: job.jobUuid });
                try {
                    await this.jobModel.update(job.jobUuid, {
                        jobStatus: JobStatusType.RUNNING,
                    });
                    const explores = await this.jobModel.tryJobStep(
                        job.jobUuid,
                        JobStepType.COMPILING,
                        async () => this.refreshAllTables(user, projectUuid),
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
            this.projectModel
                .tryAcquireProjectLock(
                    projectUuid,
                    onLockAcquired,
                    onLockFailed,
                )
                .catch((e) => Logger.error(`Background job failed: ${e}`));
        });
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
        const explores =
            (await this.projectModel.getExploresFromCache(projectUuid)) || [];
        const explore = explores.find((t) => t.name === exploreName);
        if (explore === undefined || isExploreError(explore)) {
            throw new NotExistsError(
                `Explore "${exploreName}" does not exist.`,
            );
        }

        return explore;
    }

    async getExploreByFieldId(
        user: SessionUser,
        projectUuid: string,
        fieldId: string,
    ): Promise<Explore> {
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
        const explores =
            (await this.projectModel.getExploresFromCache(projectUuid)) || [];
        const explore = explores.find((t) =>
            isExploreError(t) ? false : !!findFieldByIdInExplore(t, fieldId),
        );
        if (explore === undefined || isExploreError(explore)) {
            throw new NotExistsError(
                `Can't find explore with field id: ${fieldId}`,
            );
        }

        return explore;
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
        const savedChart = await this.savedChartModel.get(savedChartUuid);

        if (user.ability.cannot('view', subject('SavedChart', savedChart))) {
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
            const spaces = await this.spaceModel.getAllSpaces(projectUuid);
            return spaces.some((space) => space.queries.length > 0);
        } catch (e: any) {
            return false;
        }
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
}
