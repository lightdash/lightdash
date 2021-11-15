import {
    ApiQueryResults,
    ApiSqlQueryResults,
    CreateProject,
    Explore,
    ExploreError,
    hasIntersection,
    isExploreError,
    MetricQuery,
    Project,
    ProjectCatalog,
    SessionUser,
    SummaryExplore,
    TablesConfiguration,
    TableSelectionType,
    UpdateProject,
    getMetrics,
} from 'common';
import { projectAdapterFromConfig } from '../../projectAdapters/projectAdapter';
import { ProjectAdapter } from '../../types';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { analytics } from '../../analytics/client';
import {
    errorHandler,
    MissingWarehouseCredentialsError,
    NotExistsError,
} from '../../errors';
import { compileMetricQuery } from '../../queryCompiler';
import { buildQuery } from '../../queryBuilder';

type ProjectServiceDependencies = {
    projectModel: ProjectModel;
};

export class ProjectService {
    projectModel: ProjectModel;

    cachedExplores: Record<string, Promise<(Explore | ExploreError)[]>>;

    projectLoading: Record<string, boolean>;

    projectAdapters: Record<string, ProjectAdapter>;

    constructor({ projectModel }: ProjectServiceDependencies) {
        this.projectModel = projectModel;
        this.projectAdapters = {};
        this.projectLoading = {};
        this.cachedExplores = {};
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
        this.projectLoading[projectUuid] = true;
        const [adapter, explores] = await ProjectService.testProjectAdapter(
            data,
        );
        await this.projectModel.update(projectUuid, data);
        analytics.track({
            event: 'project.updated',
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
    ): Promise<string> {
        const explore = await this.getExplore(user, projectUuid, exploreName);
        const compiledMetricQuery = compileMetricQuery({
            explore,
            metricQuery,
        });
        const sql = buildQuery({ explore, compiledMetricQuery });
        return sql;
    }

    async runQuery(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
    ): Promise<ApiQueryResults> {
        await analytics.track({
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            userId: user.userUuid,
            event: 'query.executed',
        });
        const sql = await this.compileQuery(
            user,
            metricQuery,
            projectUuid,
            exploreName,
        );
        const adapter = await this.getAdapter(projectUuid);
        const rows = await adapter.runQuery(sql);
        return {
            rows,
            metricQuery,
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

    async refreshAllTables(user: SessionUser, projectUuid: string) {
        // Checks that project exists
        const project = await this.projectModel.get(projectUuid);

        // Force refresh adapter (refetch git repos, check for changed credentials, etc.)
        // Might want to cache parts of this in future if slow
        this.projectLoading[projectUuid] = true;
        const adapter = await this.restartAdapter(projectUuid);
        this.cachedExplores[projectUuid] = adapter.compileAllExplores();
        try {
            const explores = await this.cachedExplores[projectUuid];
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
                    packages: await adapter.getDbtPackages(),
                },
            });
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
        return this.cachedExplores[projectUuid];
    }

    async getAllExplores(
        user: SessionUser,
        projectUuid: string,
    ): Promise<(Explore | ExploreError)[]> {
        const explores = this.cachedExplores[projectUuid];
        if (explores === undefined) {
            return this.refreshAllTables(user, projectUuid);
        }
        return explores;
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
                    tags: explore.tags,
                    errors: explore.errors,
                };
            }
            return {
                name: explore.name,
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
}
