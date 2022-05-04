import {
    ApiQueryResults,
    ApiSqlQueryResults,
    countTotalFilterRules,
    CreateJob,
    CreateProject,
    defineAbilityForOrganizationMember,
    Explore,
    ExploreError,
    fieldId,
    FilterableField,
    formatRows,
    getDimensions,
    getFields,
    getMetrics,
    hasIntersection,
    isExploreError,
    isFilterableDimension,
    Job,
    JobStatusType,
    JobStepType,
    JobType,
    MetricQuery,
    Project,
    ProjectCatalog,
    SessionUser,
    SummaryExplore,
    TablesConfiguration,
    TableSelectionType,
    UpdateProject,
} from 'common';
import { v4 as uuidv4 } from 'uuid';
import { analytics } from '../../analytics/client';
import {
    AlreadyProcessingError,
    AuthorizationError,
    errorHandler,
    ForbiddenError,
    MissingWarehouseCredentialsError,
    NotExistsError,
} from '../../errors';
import Logger from '../../logger';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { projectAdapterFromConfig } from '../../projectAdapters/projectAdapter';
import { buildQuery } from '../../queryBuilder';
import { compileMetricQuery } from '../../queryCompiler';
import { ProjectAdapter } from '../../types';

type ProjectServiceDependencies = {
    projectModel: ProjectModel;
    onboardingModel: OnboardingModel;
    savedChartModel: SavedChartModel;
    jobModel: JobModel;
};

export class ProjectService {
    projectModel: ProjectModel;

    onboardingModel: OnboardingModel;

    projectAdapters: Record<string, ProjectAdapter>;

    savedChartModel: SavedChartModel;

    jobModel: JobModel;

    constructor({
        projectModel,
        onboardingModel,
        savedChartModel,
        jobModel,
    }: ProjectServiceDependencies) {
        this.projectModel = projectModel;
        this.onboardingModel = onboardingModel;
        this.projectAdapters = {};
        this.savedChartModel = savedChartModel;
        this.jobModel = jobModel;
    }

    async hasProject(): Promise<boolean> {
        return this.projectModel.hasProjects();
    }

    async getProject(projectUuid: string, user: SessionUser): Promise<Project> {
        // Todo: Check user has access
        const project = await this.projectModel.get(projectUuid);
        return project;
    }

    async create(
        user: SessionUser,
        data: CreateProject,
    ): Promise<{ jobUuid: string }> {
        if (user.ability.cannot('create', 'Project')) {
            throw new ForbiddenError();
        }

        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.CREATE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            projectUuid: undefined,
            steps: [
                { stepType: JobStepType.TESTING_ADAPTOR },
                { stepType: JobStepType.COMPILING },
                { stepType: JobStepType.CREATING_PROJECT },
            ],
        };

        const doAsyncWork = async () => {
            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.RUNNING,
            });
            try {
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
                await this.projectModel.saveExploresToCache(
                    projectUuid,
                    explores,
                );

                // do we still need project adapters?
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
                    },
                });
                this.projectAdapters[projectUuid] = adapter;
            } catch (error) {
                await this.jobModel.setPendingJobsToSkipped(job.jobUuid);
                throw error;
            }
        };

        await this.jobModel.create(job);
        doAsyncWork()
            .catch(async (e) => {
                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.ERROR,
                });
                throw e;
            })
            .catch((e) => Logger.error(`Error running background job: ${e}`));
        return {
            jobUuid: job.jobUuid,
        };
    }

    async update(
        projectUuid: string,
        user: SessionUser,
        data: UpdateProject,
    ): Promise<void> {
        if (user.ability.cannot('update', 'Project')) {
            throw new ForbiddenError();
        }
        const savedProject = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );

        const updatedProject = ProjectModel.mergeMissingProjectConfigSecrets(
            data,
            savedProject,
        );

        const adapter = await ProjectService.testProjectAdapter(updatedProject);
        await this.projectModel.update(projectUuid, updatedProject);
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
            },
        });
        this.projectAdapters[projectUuid] = adapter;
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
        if (user.ability.cannot('delete', 'Project')) {
            throw new ForbiddenError();
        }

        await this.projectModel.delete(projectUuid);
        analytics.track({
            event: 'project.deleted',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
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
                    metricQuery.metrics.includes(fieldId(metric)),
                ).length,
            },
        });
        const explore = await this.getExplore(user, projectUuid, exploreName);
        const adapter = await this.getAdapter(projectUuid);
        const rows = await adapter.runQuery(query);

        const formattedRows = formatRows(
            rows,
            explore,
            metricQuery.additionalMetrics,
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
        await analytics.track({
            userId: user.userUuid,
            event: 'sql.executed',
            properties: {
                projectId: projectUuid,
            },
        });
        const adapter = await this.getAdapter(projectUuid);
        const rows = await adapter.runQuery(sql);
        return {
            rows,
        };
    }

    private async refreshAllTables(
        user: SessionUser,
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

    async getMostRecentJobByProject(
        projectUuid: string,
    ): Promise<Job | undefined> {
        return this.jobModel.getMostRecentJobByProject(projectUuid);
    }

    async getJobStatus(jobUuid: string): Promise<Job> {
        return this.jobModel.get(jobUuid);
    }

    async compileProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ jobUuid: string }> {
        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
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
                };
            }
            return {
                name: explore.name,
                label: explore.label,
                tags: explore.tags,
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

    async getCatalog(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectCatalog> {
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
        return this.projectModel.getTablesConfiguration(projectUuid);
    }

    async updateTablesConfiguration(
        user: SessionUser,
        projectUuid: string,
        data: TablesConfiguration,
    ): Promise<TablesConfiguration> {
        if (user.ability.cannot('update', 'Project')) {
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
        const ability = defineAbilityForOrganizationMember(user);
        if (ability.cannot('view', 'Project')) {
            throw new AuthorizationError();
        }
        const savedChart = await this.savedChartModel.get(savedChartUuid);
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
        const ability = defineAbilityForOrganizationMember(user);
        if (ability.cannot('view', 'Project')) {
            throw new AuthorizationError();
        }
        const spaces = await this.savedChartModel.getAllSpaces(projectUuid);
        return spaces.some((space) => space.queries.length > 0);
    }
}
