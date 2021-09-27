import {
    ApiQueryResults,
    CreateProject,
    Explore,
    ExploreError,
    isExploreError,
    MetricQuery,
    Project,
    SessionUser,
    UpdateProject,
} from 'common';
import { projectAdapterFromConfig } from '../projectAdapters/projectAdapter';
import { ProjectAdapter } from '../types';
import { ProjectModel } from '../models/ProjectModel';
import { DbtLocalProjectAdapter } from '../projectAdapters/dbtLocalProjectAdapter';
import { analytics } from '../analytics/client';
import { errorHandler, NotExistsError } from '../errors';
import { compileMetricQuery } from '../queryCompiler';
import { buildQuery } from '../queryBuilder';

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
            properties: {
                projectUuid,
                projectType: data.dbtConnection.type,
                warehouseConnectionType: data.warehouseConnection?.type,
            },
        });
        await this.startAdapter(projectUuid);
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
            properties: {
                projectUuid,
                projectType: data.dbtConnection.type,
                warehouseConnectionType: data.warehouseConnection?.type,
            },
        });
        await this.startAdapter(projectUuid);
    }

    private static async testProjectAdapter(
        data: UpdateProject,
    ): Promise<void> {
        const adapter = await projectAdapterFromConfig(data.dbtConnection);
        if (adapter instanceof DbtLocalProjectAdapter) {
            if (data.warehouseConnection) {
                await adapter.updateProfile(data.warehouseConnection);
            }
        }
        try {
            await adapter.test();
        } finally {
            if (adapter instanceof DbtLocalProjectAdapter) {
                await adapter.dbtChildProcess.kill();
            }
        }
    }

    private async startAdapter(projectUuid: string): Promise<ProjectAdapter> {
        const project = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );
        const adapter = await projectAdapterFromConfig(project.dbtConnection);
        this.projectAdapters[projectUuid] = adapter;
        return adapter;
    }

    private async getAdapter(projectUuid: string): Promise<ProjectAdapter> {
        return (
            this.projectAdapters[projectUuid] || this.startAdapter(projectUuid)
        );
    }

    async compileQuery(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
    ): Promise<string> {
        const explore = await this.getExplore(user, projectUuid, exploreName);
        const compiledMetricQuery = compileMetricQuery(metricQuery);
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
            metricQuery,
            rows,
        };
    }

    async compileAllExplores(
        projectUuid: string,
    ): Promise<(Explore | ExploreError)[]> {
        const adapter = await this.getAdapter(projectUuid);
        if (adapter instanceof DbtLocalProjectAdapter) {
            const project = await this.projectModel.getWithSensitiveFields(
                projectUuid,
            );
            if (project.warehouseConnection) {
                await adapter.updateProfile(project.warehouseConnection);
            }
        }
        return adapter.compileAllExplores();
    }

    async refreshAllTables(user: SessionUser, projectUuid: string) {
        const project = await this.projectModel.get(projectUuid);
        this.projectLoading[projectUuid] = true;
        this.cachedExplores[projectUuid] = this.compileAllExplores(projectUuid);
        try {
            await this.cachedExplores[projectUuid];
            analytics.track({
                event: 'project.compiled',
                userId: user.userUuid,
                properties: {
                    projectType: project.dbtConnection.type,
                },
            });
        } catch (e) {
            const errorResponse = errorHandler(e);
            analytics.track({
                event: 'project.error',
                userId: user.userUuid,
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
