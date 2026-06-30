import { subject } from '@casl/ability';
import {
    ApiCreateProjectDbtSource,
    DbtProjectType,
    ForbiddenError,
    ParameterError,
    ProjectDbtSource,
    ProjectDbtSourceSummary,
    type Account,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import { ProjectDbtSourcesModel } from '../models/ProjectDbtSourcesModel';
import type { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { BaseService } from './BaseService';

type ProjectDbtSourcesServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    projectDbtSourcesModel: ProjectDbtSourcesModel;
};

/**
 * Manages the additional dbt sources connected to a project (PROD-7484). The
 * primary source is the project's own dbt_connection and is listed (synthesised)
 * but cannot be added or removed here.
 */
export class ProjectDbtSourcesService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly projectDbtSourcesModel: ProjectDbtSourcesModel;

    constructor(args: ProjectDbtSourcesServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.projectDbtSourcesModel = args.projectDbtSourcesModel;
    }

    private static toSummary(
        source: ProjectDbtSource,
    ): ProjectDbtSourceSummary {
        return {
            projectDbtSourceUuid: source.projectDbtSourceUuid,
            name: source.name,
            isPrimary: source.isPrimary,
            precedence: source.precedence,
            type: source.dbtConnection?.type ?? null,
        };
    }

    private async checkProjectAccess(
        account: Account,
        projectUuid: string,
        action: 'view' | 'manage',
    ): Promise<void> {
        const { organizationUuid, name: projectName } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                action,
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    async getProjectDbtSources(
        account: Account,
        projectUuid: string,
    ): Promise<ProjectDbtSourceSummary[]> {
        await this.checkProjectAccess(account, projectUuid, 'view');
        const project = await this.projectModel.get(projectUuid);
        const sources =
            await this.projectDbtSourcesModel.getSources(projectUuid);
        // The primary source is the project's own dbt_connection (precedence 0),
        // synthesised here rather than stored as a row.
        const primary: ProjectDbtSourceSummary = {
            projectDbtSourceUuid: project.projectUuid,
            name: 'Project dbt connection',
            isPrimary: true,
            precedence: 0,
            type: project.dbtConnection.type,
        };
        return [primary, ...sources.map(ProjectDbtSourcesService.toSummary)];
    }

    async createProjectDbtSource(
        account: Account,
        projectUuid: string,
        data: ApiCreateProjectDbtSource,
    ): Promise<ProjectDbtSourceSummary> {
        await this.checkProjectAccess(account, projectUuid, 'manage');
        // GitHub-only for now: additional sources are restricted to GitHub
        // connections until the other git providers are validated end-to-end.
        if (data.dbtConnection.type !== DbtProjectType.GITHUB) {
            throw new ParameterError(
                'Additional dbt sources currently support GitHub connections only',
            );
        }
        const existing =
            await this.projectDbtSourcesModel.getSources(projectUuid);
        // Append after the highest existing precedence (primary is 0).
        const precedence =
            existing.reduce(
                (max, source) => Math.max(max, source.precedence),
                0,
            ) + 1;
        const created = await this.projectDbtSourcesModel.createSource(
            projectUuid,
            {
                name: data.name,
                isPrimary: false,
                precedence,
                dbtConnection: data.dbtConnection,
            },
        );
        return ProjectDbtSourcesService.toSummary(created);
    }

    async deleteProjectDbtSource(
        account: Account,
        projectUuid: string,
        projectDbtSourceUuid: string,
    ): Promise<void> {
        await this.checkProjectAccess(account, projectUuid, 'manage');
        const source =
            await this.projectDbtSourcesModel.getSource(projectDbtSourceUuid);
        if (source.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                'This dbt source does not belong to the project',
            );
        }
        await this.projectDbtSourcesModel.deleteSource(projectDbtSourceUuid);
    }
}
