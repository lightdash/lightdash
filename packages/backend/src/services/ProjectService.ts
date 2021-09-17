import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    Explore,
    ExploreError,
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

type ProjectServiceDependencies = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
};

// Will return project with a working adapter, credentials.
// Interface does not care about profiles.yml vs. warehouse credentials etc.
export class ProjectService {
    projectConfig: DbtProjectConfig;

    projectAdapter: ProjectAdapter;

    warehouseCredentials: WarehouseCredentials | undefined;

    projectModel: ProjectModel;

    constructor({ lightdashConfig, projectModel }: ProjectServiceDependencies) {
        [this.projectConfig] = lightdashConfig.projects;
        this.projectModel = projectModel;
        this.projectAdapter = projectAdapterFromConfig(this.projectConfig);
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

    async runQuery(sql: string): Promise<Record<string, any>> {
        return this.projectAdapter.runQuery(sql);
    }

    async compileAllExplores(): Promise<(Explore | ExploreError)[]> {
        if (this.projectAdapter instanceof DbtLocalProjectAdapter) {
            const project =
                await this.projectModel.getDefaultWithSensitiveFields();
            if (project.warehouseConnection) {
                await this.projectAdapter.updateProfile(
                    project.warehouseConnection,
                );
            }
        }
        return this.projectAdapter.compileAllExplores();
    }
}
