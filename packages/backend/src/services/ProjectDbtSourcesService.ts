import { subject } from '@casl/ability';
import {
    ApiCreateProjectDbtSource,
    ApiUpdateProjectDbtSource,
    DbtProjectConfig,
    DbtProjectType,
    EMPTY_WAREHOUSE_LOCATION,
    ForbiddenError,
    getDbtEnvironmentVariableKeyError,
    normalizeWarehouseLocation,
    ParameterError,
    ProjectDbtSource,
    ProjectDbtSourceSummary,
    ProjectDbtSourceWithConnection,
    sensitiveDbtCredentialsFieldNames,
    UnexpectedServerError,
    validateGithubToken,
    validateProjectDbtSourceName,
    validateWarehouseLocation,
    type Account,
    type WarehouseLocation,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import { ProjectDbtSourcesModel } from '../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { omitDbtEnvironment } from '../utils/dbtProjectConfig';
import { BaseService } from './BaseService';

type ProjectDbtSourcesServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    projectDbtSourcesModel: ProjectDbtSourcesModel;
};

const assertProjectDbtSourceName = (name: string): void => {
    const validationError = validateProjectDbtSourceName(name);
    if (validationError) throw new ParameterError(validationError);
};

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
            connectionUuid: source.connectionUuid,
            namespacePrefix: source.namespacePrefix,
            name: source.name,
            isPrimary: source.isPrimary,
            precedence: source.precedence,
            type: source.dbtConnection?.type ?? null,
            warehouseLocation: source.warehouseLocation,
            hasCredentialError: source.hasCredentialError,
            ...ProjectDbtSourcesService.gitIdentity(source.dbtConnection),
        };
    }

    private static validateDbtEnvironmentVariables(
        dbtConnection: DbtProjectConfig,
    ): void {
        if (!('environment' in dbtConnection) || !dbtConnection.environment) {
            return;
        }

        dbtConnection.environment.forEach(({ key }) => {
            const error = getDbtEnvironmentVariableKeyError(key);
            if (error) {
                throw new ParameterError(error);
            }
        });
    }

    /**
     * Reject a location the project's warehouse cannot express while the user is
     * still looking at the form, rather than at the next deploy.
     */
    private async resolveWarehouseLocation(
        projectUuid: string,
        warehouseLocation: WarehouseLocation | undefined,
    ): Promise<WarehouseLocation | undefined> {
        if (!warehouseLocation) {
            return undefined;
        }
        const location = normalizeWarehouseLocation(warehouseLocation);
        const project = await this.projectModel.get(projectUuid);
        if (project.warehouseConnection) {
            validateWarehouseLocation(project.warehouseConnection, location);
        }
        return location;
    }

    private static validateGithubPersonalAccessToken(
        dbtConnection: DbtProjectConfig,
    ): void {
        if (
            dbtConnection.type !== DbtProjectType.GITHUB ||
            !dbtConnection.personal_access_token
        ) {
            return;
        }
        const [isValid, error] = validateGithubToken(
            dbtConnection.personal_access_token,
        );
        if (!isValid) {
            throw new ParameterError(error);
        }
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
        const sources =
            await this.projectDbtSourcesModel.getSources(projectUuid);
        return sources.map(ProjectDbtSourcesService.toSummary);
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
        assertProjectDbtSourceName(data.name);
        // GitHub-only for now: additional sources are restricted to GitHub
        // connections until the other git providers are validated end-to-end.
        if (data.dbtConnection.type !== DbtProjectType.GITHUB) {
            throw new ParameterError(
                'Additional dbt sources currently support GitHub connections only',
            );
        }
        ProjectDbtSourcesService.validateGithubPersonalAccessToken(
            data.dbtConnection,
        );
        ProjectDbtSourcesService.validateDbtEnvironmentVariables(
            data.dbtConnection,
        );
        if (
            !(await this.projectDbtSourcesModel.connectionBelongsToProject(
                projectUuid,
                data.connectionUuid,
            ))
        ) {
            throw new ParameterError(
                'The selected connection does not belong to this project',
            );
        }
        const warehouseLocation = await this.resolveWarehouseLocation(
            projectUuid,
            data.warehouseLocation,
        );
        const existing =
            await this.projectDbtSourcesModel.getSources(projectUuid);
        const isPrimary = existing.length === 0;
        const namespacePrefix = isPrimary
            ? ''
            : data.namespacePrefix?.trim() || data.name;
        if (namespacePrefix) {
            assertProjectDbtSourceName(namespacePrefix);
        }
        const precedence = isPrimary
            ? 0
            : existing.reduce(
                  (max, source) => Math.max(max, source.precedence),
                  0,
              ) + 1;
        const created = await this.projectDbtSourcesModel.createSource(
            projectUuid,
            {
                connectionUuid: data.connectionUuid,
                namespacePrefix,
                name: data.name,
                isPrimary,
                precedence,
                dbtConnection: data.dbtConnection,
                warehouseLocation:
                    warehouseLocation ?? EMPTY_WAREHOUSE_LOCATION,
            },
        );
        this.analytics.track({
            event: 'dbt_source_added',
            userId: account.user?.id,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                dbtSourceCount: existing.length + 1,
            },
        });
        return ProjectDbtSourcesService.toSummary(created);
    }

    async getProjectDbtSource(
        account: Account,
        projectUuid: string,
        projectDbtSourceUuid: string,
    ): Promise<ProjectDbtSourceWithConnection> {
        const organizationUuid = await this.checkProjectAccess(
            account,
            projectUuid,
            'view',
        );
        const canManageProject = this.createAuditedAbility(account).can(
            'manage',
            subject('Project', { organizationUuid, projectUuid }),
        );
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
        const dbtConnection = ProjectDbtSourcesService.stripDbtSecrets(
            source.dbtConnection,
        );
        return {
            ...ProjectDbtSourcesService.toSummary(source),
            dbtConnection:
                canManageProject || !dbtConnection
                    ? dbtConnection
                    : omitDbtEnvironment(dbtConnection),
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
        if (
            data.namespacePrefix !== undefined &&
            data.namespacePrefix !== existing.namespacePrefix
        ) {
            throw new ParameterError(
                'The namespace prefix cannot be changed after source creation',
            );
        }
        if (
            data.connectionUuid !== undefined &&
            !(await this.projectDbtSourcesModel.connectionBelongsToProject(
                projectUuid,
                data.connectionUuid,
            ))
        ) {
            throw new ParameterError(
                'The selected connection does not belong to this project',
            );
        }
        if (
            existing.isPrimary &&
            (data.dbtConnection !== undefined ||
                data.warehouseLocation !== undefined)
        ) {
            throw new ParameterError(
                'Only the primary dbt source name and connection can be updated here',
            );
        }
        if (data.name !== undefined) {
            assertProjectDbtSourceName(data.name);
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
        if (data.dbtConnection) {
            ProjectDbtSourcesService.validateGithubPersonalAccessToken(
                data.dbtConnection,
            );
            ProjectDbtSourcesService.validateDbtEnvironmentVariables(
                data.dbtConnection,
            );
        }
        const warehouseLocation = await this.resolveWarehouseLocation(
            projectUuid,
            data.warehouseLocation,
        );
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
                connectionUuid: data.connectionUuid,
                name: data.name,
                dbtConnection,
                warehouseLocation,
            },
        );
        if (existing.isPrimary && data.name !== undefined) {
            await this.projectModel.updateDbtSourceName(projectUuid, data.name);
        }
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
        if (source.isPrimary) {
            throw new ParameterError(
                'The primary dbt source cannot be removed',
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
                dbtSourceCount: sources.length - 1,
            },
        });
    }
}
