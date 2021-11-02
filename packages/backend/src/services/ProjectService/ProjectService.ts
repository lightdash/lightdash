import {
    ApiQueryResults,
    ApiSqlQueryResults,
    CreateProject,
    Explore,
    ExploreError,
    isExploreError,
    MetricQuery,
    Project,
    SessionUser,
    UpdateProject,
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
        await ProjectService.testProjectAdapter(data);
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
        return this.getProject(projectUuid, user);
    }

    async update(
        projectUuid: string,
        user: SessionUser,
        data: UpdateProject,
    ): Promise<void> {
        await ProjectService.testProjectAdapter(data);
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
    }

    private static async testProjectAdapter(
        data: UpdateProject,
    ): Promise<void> {
        const adapter = await projectAdapterFromConfig(
            data.dbtConnection,
            data.warehouseConnection,
        );
        try {
            await adapter.test();
        } finally {
            await adapter.destroy();
        }
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
            await this.cachedExplores[projectUuid];
            analytics.track({
                event: 'project.compiled',
                userId: user.userUuid,
                organizationId: user.organizationUuid,
                projectId: projectUuid,
                properties: {
                    projectType: project.dbtConnection.type,
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
}
