import {
    ApiQueryResults,
    ApiSqlQueryResults,
    countTotalFilterRules,
    CreateProject,
    defineAbilityForOrganizationMember,
    Explore,
    ExploreError,
    FilterableField,
    getDimensions,
    getMetrics,
    hasIntersection,
    isExploreError,
    isFilterableDimension,
    MetricQuery,
    Project,
    ProjectCatalog,
    SessionUser,
    SummaryExplore,
    TablesConfiguration,
    TableSelectionType,
    UpdateProject,
} from 'common';
import { analytics } from '../../analytics/client';
import {
    AuthorizationError,
    errorHandler,
    ForbiddenError,
    MissingWarehouseCredentialsError,
    NotExistsError,
} from '../../errors';
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
};

// TODO Extract to another file
function formatRows(rows: { [col: string]: any }[]): { [col: string]: any }[] {
    const formattedRows: { [col: string]: any }[] = [];
    rows.forEach((row) => {
        const formattedRow: { [col: string]: any } = {};
        Object.keys(row).forEach((columnName: string) => {
            const col = row[columnName];
            // TODO do conversion based on metrics/dimension
            formattedRow[columnName] = `${col} %`;
        });

        formattedRows.push(formattedRow);
    });
    return formattedRows;
}

export class ProjectService {
    projectModel: ProjectModel;

    onboardingModel: OnboardingModel;

    cachedExplores: Record<string, Promise<(Explore | ExploreError)[]>>;

    projectLoading: Record<string, boolean>;

    projectAdapters: Record<string, ProjectAdapter>;

    savedChartModel: SavedChartModel;

    constructor({
        projectModel,
        onboardingModel,
        savedChartModel,
    }: ProjectServiceDependencies) {
        this.projectModel = projectModel;
        this.onboardingModel = onboardingModel;
        this.projectAdapters = {};
        this.projectLoading = {};
        this.cachedExplores = {};
        this.savedChartModel = savedChartModel;
    }

    async getProjectStatus(
        projectUuid: string,
        user: SessionUser,
    ): Promise<'loading' | 'error' | 'ready'> {
        // check access
        const { [projectUuid]: isLoading = false } = this.projectLoading;
        if (isLoading) {
            return 'loading';
        }
        const explore = this.cachedExplores[projectUuid];
        if (explore === undefined) {
            return 'error';
        }
        try {
            await explore;
        } catch (e) {
            return 'error';
        }
        return 'ready';
    }

    async hasProject(): Promise<boolean> {
        return this.projectModel.hasProjects();
    }

    async getProject(projectUuid: string, user: SessionUser): Promise<Project> {
        // Todo: Check user has access
        const project = await this.projectModel.get(projectUuid);
        return project;
    }

    async create(user: SessionUser, data: CreateProject): Promise<Project> {
        if (user.ability.cannot('create', 'Project')) {
            throw new ForbiddenError();
        }
        const [adapter, explores] = await ProjectService.testProjectAdapter(
            data,
        );
        const projectUuid = await this.projectModel.create(
            user.organizationUuid,
            data,
        );
        analytics.track({
            event: 'project.created',
            userId: user.userUuid,
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            properties: {
                projectId: projectUuid,
                projectType: data.dbtConnection.type,
                warehouseConnectionType: data.warehouseConnection.type,
            },
        });
        this.projectLoading[projectUuid] = false;
        this.projectAdapters[projectUuid] = adapter;
        this.cachedExplores[projectUuid] = Promise.resolve(explores);
        return this.getProject(projectUuid, user);
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

        this.projectLoading[projectUuid] = true;
        const [adapter, explores] = await ProjectService.testProjectAdapter(
            updatedProject,
        );
        await this.projectModel.update(projectUuid, updatedProject);
        analytics.track({
            event: 'project.updated',
            userId: user.userUuid,
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            properties: {
                projectId: projectUuid,
                projectType: updatedProject.dbtConnection.type,
                warehouseConnectionType:
                    updatedProject.warehouseConnection.type,
            },
        });
        this.projectLoading[projectUuid] = false;
        this.projectAdapters[projectUuid] = adapter;
        this.cachedExplores[projectUuid] = Promise.resolve(explores);
    }

    private static async testProjectAdapter(
        data: UpdateProject,
    ): Promise<[ProjectAdapter, (Explore | ExploreError)[]]> {
        const adapter = await projectAdapterFromConfig(
            data.dbtConnection,
            data.warehouseConnection,
        );
        let explores: (Explore | ExploreError)[];
        try {
            await adapter.test();
            explores = await adapter.compileAllExplores();
        } catch (e) {
            await adapter.destroy();
            throw e;
        }
        return [adapter, explores];
    }

    async delete(projectUuid: string, user: SessionUser): Promise<void> {
        if (user.ability.cannot('delete', 'Project')) {
            throw new ForbiddenError();
        }

        await this.projectModel.delete(projectUuid);
        analytics.track({
            event: 'project.deleted',
            userId: user.userUuid,
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            properties: {
                projectId: projectUuid,
            },
        });

        const runningAdapter = this.projectAdapters[projectUuid];
        if (runningAdapter !== undefined) {
            await runningAdapter.destroy();
        }
        this.projectLoading[projectUuid] = false;
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
        const adapter = await projectAdapterFromConfig(
            project.dbtConnection,
            project.warehouseConnection,
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
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            userId: user.userUuid,
            event: 'query.executed',
            properties: {
                hasExampleMetric,
                dimensionsCount: metricQuery.dimensions.length,
                metricsCount: metricQuery.metrics.length,
                filtersCount: countTotalFilterRules(metricQuery.filters),
                sortsCount: metricQuery.sorts.length,
                tableCalculationsCount: metricQuery.tableCalculations.length,
            },
        });
        const adapter = await this.getAdapter(projectUuid);
        const rows = await adapter.runQuery(query);

        const formattedRows = formatRows(rows);
        return {
            rows,
            metricQuery,
            formattedRows,
        };
    }

    async runSqlQuery(
        user: SessionUser,
        projectUuid: string,
        sql: string,
    ): Promise<ApiSqlQueryResults> {
        await analytics.track({
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            userId: user.userUuid,
            event: 'sql.executed',
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
        this.projectLoading[projectUuid] = true;
        const adapter = await this.restartAdapter(projectUuid);
        const packages = await adapter.getDbtPackages();
        try {
            const explores = await adapter.compileAllExplores();
            analytics.track({
                event: 'project.compiled',
                userId: user.userUuid,
                organizationId: user.organizationUuid,
                projectId: projectUuid,
                properties: {
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
                },
            });
            return explores;
        } catch (e) {
            const errorResponse = errorHandler(e);
            analytics.track({
                event: 'project.error',
                userId: user.userUuid,
                projectId: projectUuid,
                organizationId: user.organizationUuid,
                properties: {
                    name: errorResponse.name,
                    statusCode: errorResponse.statusCode,
                    projectType: project.dbtConnection.type,
                },
            });
            throw errorResponse;
        } finally {
            this.projectLoading[projectUuid] = false;
        }
    }

    async hasMetrics(user: SessionUser): Promise<boolean> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const project = await this.projectModel.getDefaultProject(
            organizationUuid,
        );
        const explores = await this.getAllExplores(user, project.projectUuid);
        return explores.some((explore) => {
            if (!isExploreError(explore)) {
                return (
                    getMetrics(explore).filter(
                        ({ isAutoGenerated }) => !isAutoGenerated,
                    ).length > 0
                );
            }
            return false;
        });
    }

    async hasSavedCharts(user: SessionUser): Promise<boolean> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const project = await this.projectModel.getDefaultProject(
            organizationUuid,
        );
        const spaces = await this.savedChartModel.getAllSpaces(
            project.projectUuid,
        );
        return spaces.some((space) => space.queries.length > 0);
    }

    async getAllExplores(
        user: SessionUser,
        projectUuid: string,
        forceRefresh: boolean = false,
    ): Promise<(Explore | ExploreError)[]> {
        if (!this.cachedExplores[projectUuid] || forceRefresh) {
            this.cachedExplores[projectUuid] = this.refreshAllTables(
                user,
                projectUuid,
            );
        }
        return this.cachedExplores[projectUuid];
    }

    async getAllExploresSummary(
        user: SessionUser,
        projectUuid: string,
        filtered: boolean,
    ): Promise<SummaryExplore[]> {
        const explores = await this.getAllExplores(user, projectUuid);
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
        const explores = await this.getAllExplores(user, projectUuid);
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
        const explores = await this.getAllExplores(user, projectUuid);

        return explores.reduce<ProjectCatalog>((acc, explore) => {
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
            projectId: projectUuid,
            organizationId: user.organizationUuid,
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
}
