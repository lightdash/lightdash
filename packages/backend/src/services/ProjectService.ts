import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    Explore,
    ExploreError,
    isExploreError,
    MetricQuery,
    Project,
    SessionUser,
    WarehouseCredentials,
} from 'common';
import { LightdashConfig } from '../config/parseConfig';
import { projectAdapterFromConfig } from '../projectAdapters/projectAdapter';
import { ProjectAdapter } from '../types';
import { ProjectModel } from '../models/ProjectModel';
import { DbtLocalProjectAdapter } from '../projectAdapters/dbtLocalProjectAdapter';
import { analytics } from '../analytics/client';
import { errorHandler, NotExistsError } from '../errors';
import { compileMetricQuery } from '../queryCompiler';
import { buildQuery } from '../queryBuilder';

type ProjectServiceDependencies = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
};

// Will return project with a working adapter, credentials.
// Interface does not care about profiles.yml vs. warehouse credentials etc.
export class ProjectService {
    // TODO: CONFIG SHOULD BE FROM PROJECT MODEL
    projectConfig: DbtProjectConfig;

    // TODO: This is replaced with projectAdapters (below)
    projectAdapter: ProjectAdapter;

    // TODO: This should exist on project model
    warehouseCredentials: WarehouseCredentials | undefined;

    projectModel: ProjectModel;

    cachedExplores: Record<string, Promise<(Explore | ExploreError)[]>>;

    projectLoading: Record<string, boolean>;

    projectAdapters: Record<string, ProjectAdapter>;

    constructor({ lightdashConfig, projectModel }: ProjectServiceDependencies) {
        [this.projectConfig] = lightdashConfig.projects;
        this.projectModel = projectModel;
        this.projectAdapter = projectAdapterFromConfig(this.projectConfig);
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

    async getProject(projectUuid: string, user: SessionUser): Promise<Project> {
        // Todo: Check user has access
        const project = await this.projectModel.get(projectUuid);
        return project;
    }

    async updateWarehouseConnection(
        projectUuid: string,
        user: SessionUser,
        data: CreateWarehouseCredentials,
    ): Promise<Project> {
        await this.projectModel.updateCredentials(projectUuid, data);
        const project = await this.getProject(projectUuid, user);
        analytics.track({
            event: 'project.updated',
            userId: user.userUuid,
            properties: {
                projectUuid,
                projectType: project.dbtConnection.type,
                warehouseConnectionType: project.warehouseConnection?.type,
            },
        });
        return project;
    }

    // TODO: THIS DOES NOT WORK
    async startAdapter(projectUuid: string): Promise<ProjectAdapter> {
        const adapter = this.projectAdapters[projectUuid];
        if (adapter !== undefined) {
            return adapter;
        }
        return projectAdapterFromConfig(this.projectConfig);
    }

    async runQuery(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
    ): Promise<Record<string, any>> {
        const explore = await this.getExplore(user, projectUuid, exploreName);
        const compiledMetricQuery = compileMetricQuery(metricQuery);
        const sql = buildQuery({ explore, compiledMetricQuery });
        const adapter = await this.startAdapter(projectUuid);
        const rows = await adapter.runQuery(sql);
        return rows;
    }

    async compileAllExplores(
        projectUuid: string,
    ): Promise<(Explore | ExploreError)[]> {
        const adapter = await this.startAdapter(projectUuid);
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
        this.projectLoading[projectUuid] = true;
        this.cachedExplores[projectUuid] = this.compileAllExplores(projectUuid);
        try {
            await this.cachedExplores[projectUuid];
            analytics.track({
                event: 'project.compiled',
                userId: user.userUuid,
                anonymousId: '', // TODO: remove anon id - not needed
                properties: {
                    projectType: this.projectConfig.type,
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
                    projectType: this.projectConfig.type,
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
