import { subject } from '@casl/ability';
import {
    ApiCreateProjectDbtSource,
    ApiUpdateProjectDbtSource,
    DbtProjectConfig,
    DbtProjectType,
    ForbiddenError,
    ParameterError,
    ProjectDbtSource,
    ProjectDbtSourceSummary,
    ProjectDbtSourceWithConnection,
    sensitiveDbtCredentialsFieldNames,
    UnexpectedServerError,
    type Account,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import { ProjectDbtSourcesModel } from '../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
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

    /**
     * The git-backed identity of a connection (repo, branch, subfolder). These
     * fields are not credentials, so they are safe to expose in summaries. Null
     * for non-git connections (local, dbt cloud, none, manifest).
     */
    private static gitIdentity(config: DbtProjectConfig | null): {
        repository: string | null;
        branch: string | null;
        projectSubPath: string | null;
    } {
        if (
            config &&
            (config.type === DbtProjectType.GITHUB ||
                config.type === DbtProjectType.GITLAB ||
                config.type === DbtProjectType.BITBUCKET ||
                config.type === DbtProjectType.AZURE_DEVOPS)
        ) {
            return {
                repository: config.repository,
                branch: config.branch,
                projectSubPath: config.project_sub_path,
            };
        }
        return { repository: null, branch: null, projectSubPath: null };
    }

    /**
     * Removes sensitive dbt credentials (tokens, keys) from a connection so it
     * can be returned to the client for editing. The stripped secrets are
     * preserved on update via ProjectModel.mergeMissingDbtConfigSecrets.
     */
    private static stripDbtSecrets(
        config: DbtProjectConfig | null,
    ): DbtProjectConfig | null {
        if (!config) {
            return null;
        }
        const stripped: Record<string, unknown> = { ...config };
        sensitiveDbtCredentialsFieldNames.forEach((key) => {
            delete stripped[key];
        });
        return stripped as unknown as DbtProjectConfig;
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
            hasCredentialError: source.hasCredentialError,
            ...ProjectDbtSourcesService.gitIdentity(source.dbtConnection),
        };
    }

    private async checkProjectAccess(
        account: Account,
        projectUuid: string,
        action: 'view' | 'manage',
    ): Promise<string> {
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
        return organizationUuid;
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
            hasCredentialError: false,
            ...ProjectDbtSourcesService.gitIdentity(project.dbtConnection),
        };
        return [primary, ...sources.map(ProjectDbtSourcesService.toSummary)];
    }

    async createProjectDbtSource(
        account: Account,
        projectUuid: string,
        data: ApiCreateProjectDbtSource,
    ): Promise<ProjectDbtSourceSummary> {
        const organizationUuid = await this.checkProjectAccess(
            account,
            projectUuid,
            'manage',
        );
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
        this.analytics.track({
            event: 'dbt_source_added',
            userId: account.user?.id,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                dbtSourceCount: existing.length + 2,
            },
        });
        return ProjectDbtSourcesService.toSummary(created);
    }

    async getProjectDbtSource(
        account: Account,
        projectUuid: string,
        projectDbtSourceUuid: string,
    ): Promise<ProjectDbtSourceWithConnection> {
        await this.checkProjectAccess(account, projectUuid, 'view');
        const source =
            await this.projectDbtSourcesModel.getSource(projectDbtSourceUuid);
        if (source.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                'This dbt source does not belong to the project',
            );
        }
        // Listing tolerates a credential error (other sources still load), but
        // fetching this one source for editing genuinely cannot proceed without
        // its connection — fail clearly, naming the source, instead of
        // returning an unusable blank form.
        if (source.hasCredentialError) {
            throw new UnexpectedServerError(
                `Could not load credentials for dbt source "${source.name}" — remove it and add it again with a fresh connection.`,
            );
        }
        return {
            ...ProjectDbtSourcesService.toSummary(source),
            dbtConnection: ProjectDbtSourcesService.stripDbtSecrets(
                source.dbtConnection,
            ),
        };
    }

    async updateProjectDbtSource(
        account: Account,
        projectUuid: string,
        projectDbtSourceUuid: string,
        data: ApiUpdateProjectDbtSource,
    ): Promise<ProjectDbtSourceSummary> {
        await this.checkProjectAccess(account, projectUuid, 'manage');
        const existing =
            await this.projectDbtSourcesModel.getSource(projectDbtSourceUuid);
        if (existing.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                'This dbt source does not belong to the project',
            );
        }
        // GitHub-only for now, matching createProjectDbtSource.
        if (
            data.dbtConnection &&
            data.dbtConnection.type !== DbtProjectType.GITHUB
        ) {
            throw new ParameterError(
                'Additional dbt sources currently support GitHub connections only',
            );
        }
        // The edit form receives the connection with secrets stripped; restore
        // any the user did not re-enter from the stored connection.
        const dbtConnection =
            data.dbtConnection && existing.dbtConnection
                ? ProjectModel.mergeMissingDbtConfigSecrets(
                      data.dbtConnection,
                      existing.dbtConnection,
                  )
                : data.dbtConnection;
        const updated = await this.projectDbtSourcesModel.updateSource(
            projectDbtSourceUuid,
            {
                name: data.name,
                dbtConnection,
            },
        );
        return ProjectDbtSourcesService.toSummary(updated);
    }

    async deleteProjectDbtSource(
        account: Account,
        projectUuid: string,
        projectDbtSourceUuid: string,
    ): Promise<void> {
        const organizationUuid = await this.checkProjectAccess(
            account,
            projectUuid,
            'manage',
        );
        const source =
            await this.projectDbtSourcesModel.getSource(projectDbtSourceUuid);
        if (source.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                'This dbt source does not belong to the project',
            );
        }
        const sources =
            await this.projectDbtSourcesModel.getSources(projectUuid);
        await this.projectDbtSourcesModel.deleteSource(projectDbtSourceUuid);
        this.analytics.track({
            event: 'dbt_source_removed',
            userId: account.user?.id,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                dbtSourceCount: sources.length,
            },
        });
    }
}
