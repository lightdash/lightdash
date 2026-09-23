import { subject } from '@casl/ability';
import {
    assertRegisteredAccount,
    ConflictError,
    FeatureFlags,
    fillOmittedSecrets,
    ForbiddenError,
    ParameterError,
    sensitiveCredentialsFieldNames,
    SingleConnectionProjectError,
    supportsMultipleConnections,
    validateWarehouseConnectionName,
    WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE,
    type Account,
    type ApiCreateWarehouseConnectionRequest,
    type ApiUpdateWarehouseConnectionRequest,
    type CreateWarehouseCredentials,
    type ProjectSummary,
    type RegisteredAccount,
    type WarehouseConnection,
    type WarehouseConnectionCapabilities,
    type WarehouseConnectionTestResults,
    type WarehouseConnectionWithCredentials,
    type WarehouseCredentials,
    type WarehouseTypes,
} from '@lightdash/common';
import { DatabaseError } from 'pg';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import {
    type WarehouseConnectionBoundContent,
    type WarehouseConnectionCredentialSource,
    type WarehouseConnectionModel,
    type WarehouseConnectionProject,
} from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { BaseService } from '../BaseService';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { type LicenseService } from '../LicenseService/LicenseService';

export type WarehouseCredentialPolicy = {
    assertCanWriteWarehouseConnection: (
        account: Account,
        project: Pick<
            ProjectSummary,
            'organizationUuid' | 'provisioningSource'
        >,
        data: {
            warehouseConnection?: CreateWarehouseCredentials;
            organizationWarehouseCredentialsUuid?: string;
        },
    ) => void;
    testWarehouseConnectionCredentials: (
        account: RegisteredAccount,
        organizationUuid: string,
        warehouseConnection: CreateWarehouseCredentials,
    ) => Promise<WarehouseConnectionTestResults>;
};

type WarehouseConnectionServiceArguments = {
    warehouseConnectionModel: WarehouseConnectionModel;
    projectModel: Pick<ProjectModel, 'getSummary'>;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    licenseService: Pick<LicenseService, 'canHoldMultipleConnections'>;
    credentialPolicy: WarehouseCredentialPolicy;
};

const NAME_UNIQUE_CONSTRAINT = 'warehouse_connections_project_name_unique';

const BINDING_FOREIGN_KEYS = [
    'cached_explore_warehouse_connection_fkey',
    'project_dbt_sources_warehouse_connection_fkey',
    'saved_sql_versions_warehouse_connection_fkey',
];

const isBindingConflict = (error: unknown): boolean =>
    error instanceof DatabaseError &&
    error.code === '23503' &&
    error.constraint !== undefined &&
    BINDING_FOREIGN_KEYS.includes(error.constraint);

export const WAREHOUSE_TYPE_REASON =
    'Multiple connections are supported for Postgres and Athena projects only.';
export const ENTITLEMENT_REASON =
    'An extra connection needs the Enterprise multi-connection add-on.';
export const ROLLOUT_REASON =
    'Extra connections are not enabled for this organisation yet.';

const isNameConflict = (error: unknown): boolean =>
    error instanceof DatabaseError &&
    error.code === '23505' &&
    error.constraint === NAME_UNIQUE_CONSTRAINT;

const describeBoundContent = (
    boundContent: WarehouseConnectionBoundContent,
): string[] => [
    ...(boundContent.explores.length > 0
        ? [`explores: ${boundContent.explores.join(', ')}`]
        : []),
    ...(boundContent.dbtSources.length > 0
        ? [`dbt sources: ${boundContent.dbtSources.join(', ')}`]
        : []),
    ...(boundContent.sqlCharts.length > 0
        ? [`SQL charts: ${boundContent.sqlCharts.join(', ')}`]
        : []),
    ...(boundContent.inFlightQueries > 0
        ? [`in-flight queries: ${boundContent.inFlightQueries}`]
        : []),
];

const toNonSensitiveCredentials = (
    credentials: CreateWarehouseCredentials,
): WarehouseCredentials =>
    Object.fromEntries(
        Object.entries(credentials).filter(
            ([key]) =>
                !(sensitiveCredentialsFieldNames as readonly string[]).includes(
                    key,
                ),
        ),
    ) as WarehouseCredentials;

export class WarehouseConnectionService extends BaseService {
    private readonly warehouseConnectionModel: WarehouseConnectionModel;

    private readonly projectModel: Pick<ProjectModel, 'getSummary'>;

    private readonly featureFlagService: Pick<FeatureFlagService, 'get'>;

    private readonly licenseService: Pick<
        LicenseService,
        'canHoldMultipleConnections'
    >;

    private readonly credentialPolicy: WarehouseCredentialPolicy;

    constructor(args: WarehouseConnectionServiceArguments) {
        super({ serviceName: 'WarehouseConnectionService' });
        this.warehouseConnectionModel = args.warehouseConnectionModel;
        this.projectModel = args.projectModel;
        this.featureFlagService = args.featureFlagService;
        this.licenseService = args.licenseService;
        this.credentialPolicy = args.credentialPolicy;
    }

    private async assertCanManageProject(
        account: Account,
        projectUuid: string,
    ): Promise<ProjectSummary> {
        const summary = await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Project', {
                    organizationUuid: summary.organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName: summary.name },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage this project',
            );
        }
        return summary;
    }

    private static assertMultiMode(project: WarehouseConnectionProject): void {
        if (project.connectionMode !== 'multi') {
            throw new SingleConnectionProjectError();
        }
    }

    private async getMultiProject(
        account: Account,
        projectUuid: string,
    ): Promise<{
        summary: ProjectSummary;
        project: WarehouseConnectionProject;
    }> {
        const summary = await this.assertCanManageProject(account, projectUuid);
        const project =
            await this.warehouseConnectionModel.getProject(projectUuid);
        WarehouseConnectionService.assertMultiMode(project);
        return { summary, project };
    }

    private static parseName(name: string): string {
        const error = validateWarehouseConnectionName(name);
        if (error) {
            throw new ParameterError(error);
        }
        return name.trim();
    }

    private static rethrowNameConflict(error: unknown): never {
        if (isNameConflict(error)) {
            throw new ConflictError(WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE);
        }
        throw error;
    }

    private async getAddConnectionBlockReason(
        account: RegisteredAccount,
        project: WarehouseConnectionProject,
    ): Promise<string | null> {
        if (!supportsMultipleConnections(project.originalWarehouseType)) {
            return WAREHOUSE_TYPE_REASON;
        }
        if (
            !this.licenseService.canHoldMultipleConnections(
                project.organizationUuid,
            )
        ) {
            return ENTITLEMENT_REASON;
        }
        const { enabled } = await this.featureFlagService.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: project.organizationUuid,
            },
            featureFlagId: FeatureFlags.MultiConnectionProjects,
        });
        return enabled ? null : ROLLOUT_REASON;
    }

    private static assertSameWarehouseType(
        project: WarehouseConnectionProject,
        warehouseType: WarehouseTypes,
    ): void {
        if (project.originalWarehouseType !== warehouseType) {
            throw new ParameterError(
                'An extra connection must use the same warehouse type as the original connection.',
            );
        }
    }

    private async assertConnectionWorks(
        account: RegisteredAccount,
        project: WarehouseConnectionProject,
        credentials: CreateWarehouseCredentials,
    ): Promise<void> {
        const result =
            await this.credentialPolicy.testWarehouseConnectionCredentials(
                account,
                project.organizationUuid,
                credentials,
            );
        if (!result.ok) {
            const reason = result.hops.find(
                (hop) => hop.status === 'failed',
            )?.message;
            throw new ParameterError(
                reason
                    ? `Warehouse connection test failed: ${reason}`
                    : 'Warehouse connection test failed.',
            );
        }
    }

    private async resolveCredentialSource(
        project: WarehouseConnectionProject,
        source: WarehouseConnectionCredentialSource,
    ): Promise<CreateWarehouseCredentials> {
        return source.kind === 'project'
            ? source.credentials
            : this.warehouseConnectionModel.loadOrganizationCredentials(
                  project.organizationUuid,
                  source.organizationWarehouseCredentialsUuid,
              );
    }

    private assertCanWrite(
        account: Account,
        summary: ProjectSummary,
        source: WarehouseConnectionCredentialSource | null,
        credentials: CreateWarehouseCredentials | null,
    ): void {
        this.credentialPolicy.assertCanWriteWarehouseConnection(
            account,
            summary,
            {
                warehouseConnection: credentials ?? undefined,
                organizationWarehouseCredentialsUuid:
                    source?.kind === 'organization'
                        ? source.organizationWarehouseCredentialsUuid
                        : undefined,
            },
        );
    }

    async list(
        account: Account,
        projectUuid: string,
    ): Promise<{
        connections: WarehouseConnection[];
        capabilities: WarehouseConnectionCapabilities;
    }> {
        assertRegisteredAccount(account);
        const { project } = await this.getMultiProject(account, projectUuid);
        const reason = await this.getAddConnectionBlockReason(account, project);
        return {
            connections: await this.warehouseConnectionModel.list(project),
            capabilities: { canAddConnection: reason === null, reason },
        };
    }

    async get(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string,
    ): Promise<WarehouseConnectionWithCredentials> {
        const { project } = await this.getMultiProject(account, projectUuid);
        const connection = await this.warehouseConnectionModel.get(
            project,
            warehouseConnectionUuid,
        );
        if (connection.isOriginal) {
            return { ...connection, warehouseConnection: null };
        }
        return {
            ...connection,
            warehouseConnection: toNonSensitiveCredentials(
                await this.warehouseConnectionModel.getCredentials(
                    project,
                    warehouseConnectionUuid,
                ),
            ),
        };
    }

    private static toCreateSource(
        request: ApiCreateWarehouseConnectionRequest,
    ): WarehouseConnectionCredentialSource {
        if (
            (request.warehouseConnection === undefined) ===
            (request.organizationWarehouseCredentialsUuid === undefined)
        ) {
            throw new ParameterError(
                'Provide either warehouse credentials or an organization warehouse credential.',
            );
        }
        return request.organizationWarehouseCredentialsUuid !== undefined
            ? {
                  kind: 'organization',
                  organizationWarehouseCredentialsUuid:
                      request.organizationWarehouseCredentialsUuid,
              }
            : { kind: 'project', credentials: request.warehouseConnection! };
    }

    async create(
        account: Account,
        projectUuid: string,
        request: ApiCreateWarehouseConnectionRequest,
    ): Promise<WarehouseConnection> {
        assertRegisteredAccount(account);
        const { summary, project } = await this.getMultiProject(
            account,
            projectUuid,
        );
        const source = WarehouseConnectionService.toCreateSource(request);
        this.assertCanWrite(
            account,
            summary,
            source,
            source.kind === 'project' ? source.credentials : null,
        );
        const name = WarehouseConnectionService.parseName(request.name);
        const blockReason = await this.getAddConnectionBlockReason(
            account,
            project,
        );
        if (blockReason !== null) {
            throw new ForbiddenError(blockReason);
        }
        const credentials = await this.resolveCredentialSource(project, source);
        this.assertCanWrite(account, summary, source, credentials);
        WarehouseConnectionService.assertSameWarehouseType(
            project,
            credentials.type,
        );
        await this.assertConnectionWorks(account, project, credentials);

        try {
            return await this.warehouseConnectionModel.transaction(
                async (model) => {
                    await model.lockProject(projectUuid);
                    const lockedProject = await model.getProject(projectUuid);
                    WarehouseConnectionService.assertMultiMode(lockedProject);
                    WarehouseConnectionService.assertSameWarehouseType(
                        lockedProject,
                        credentials.type,
                    );
                    const created = await model.createExtra(lockedProject, {
                        name,
                        warehouseType: credentials.type,
                        source,
                        listAllDatabases: request.listAllDatabases ?? false,
                        additionalDatabases: request.additionalDatabases ?? [],
                        createdByUserUuid: account.user.userUuid,
                    });
                    await model.insertEvent({
                        projectUuid,
                        actorUserUuid: account.user.userUuid,
                        event: 'connection_added',
                        plan: {
                            warehouseConnectionUuid:
                                created.warehouseConnectionUuid,
                            name: created.name,
                            warehouseType: created.warehouseType,
                        },
                    });
                    return created;
                },
            );
        } catch (error) {
            return WarehouseConnectionService.rethrowNameConflict(error);
        }
    }

    private async resolveUpdateSource(
        project: WarehouseConnectionProject,
        existing: WarehouseConnection,
        request: ApiUpdateWarehouseConnectionRequest,
    ): Promise<WarehouseConnectionCredentialSource | null> {
        if (
            request.warehouseConnection !== undefined &&
            request.organizationWarehouseCredentialsUuid !== undefined
        ) {
            throw new ParameterError(
                'Provide either warehouse credentials or an organization warehouse credential.',
            );
        }
        if (request.organizationWarehouseCredentialsUuid !== undefined) {
            return {
                kind: 'organization',
                organizationWarehouseCredentialsUuid:
                    request.organizationWarehouseCredentialsUuid,
            };
        }
        if (request.warehouseConnection !== undefined) {
            const saved =
                existing.organizationWarehouseCredentialsUuid === null
                    ? await this.warehouseConnectionModel.getCredentials(
                          project,
                          existing.warehouseConnectionUuid,
                      )
                    : null;
            return {
                kind: 'project',
                credentials: fillOmittedSecrets(
                    saved === null
                        ? request.warehouseConnection
                        : ProjectModel.mergeMissingWarehouseSecrets(
                              request.warehouseConnection,
                              saved,
                          ),
                ),
            };
        }
        return null;
    }

    async update(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string,
        request: ApiUpdateWarehouseConnectionRequest,
    ): Promise<WarehouseConnection> {
        assertRegisteredAccount(account);
        const { summary, project } = await this.getMultiProject(
            account,
            projectUuid,
        );
        this.assertCanWrite(
            account,
            summary,
            request.organizationWarehouseCredentialsUuid !== undefined
                ? {
                      kind: 'organization',
                      organizationWarehouseCredentialsUuid:
                          request.organizationWarehouseCredentialsUuid,
                  }
                : null,
            null,
        );
        const existing = await this.warehouseConnectionModel.get(
            project,
            warehouseConnectionUuid,
        );
        if (
            existing.isOriginal &&
            (request.warehouseConnection !== undefined ||
                request.organizationWarehouseCredentialsUuid !== undefined)
        ) {
            throw new ParameterError(
                'Edit the original connection in the project settings.',
            );
        }
        const source = await this.resolveUpdateSource(
            project,
            existing,
            request,
        );
        const effectiveSource: WarehouseConnectionCredentialSource | null =
            source ??
            (existing.organizationWarehouseCredentialsUuid !== null
                ? {
                      kind: 'organization',
                      organizationWarehouseCredentialsUuid:
                          existing.organizationWarehouseCredentialsUuid,
                  }
                : null);
        const credentials =
            source === null
                ? null
                : await this.resolveCredentialSource(project, source);
        this.assertCanWrite(account, summary, effectiveSource, credentials);
        if (credentials !== null) {
            WarehouseConnectionService.assertSameWarehouseType(
                project,
                credentials.type,
            );
            await this.assertConnectionWorks(account, project, credentials);
        }

        return this.warehouseConnectionModel.transaction(async (model) => {
            await model.lockProject(projectUuid);
            const lockedProject = await model.getProject(projectUuid);
            WarehouseConnectionService.assertMultiMode(lockedProject);
            await model.get(lockedProject, warehouseConnectionUuid);
            if (source !== null) {
                await model.updateExtraCredentials(
                    lockedProject,
                    warehouseConnectionUuid,
                    source,
                );
            }
            if (
                request.listAllDatabases !== undefined ||
                request.additionalDatabases !== undefined
            ) {
                await model.updateListingSettings(
                    lockedProject,
                    warehouseConnectionUuid,
                    {
                        listAllDatabases:
                            request.listAllDatabases ??
                            existing.listAllDatabases,
                        additionalDatabases:
                            request.additionalDatabases ??
                            existing.additionalDatabases,
                    },
                );
            }
            return model.get(lockedProject, warehouseConnectionUuid);
        });
    }

    async rename(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string,
        name: string,
    ): Promise<WarehouseConnection> {
        const { summary } = await this.getMultiProject(account, projectUuid);
        this.assertCanWrite(account, summary, null, null);
        const parsedName = WarehouseConnectionService.parseName(name);
        try {
            return await this.warehouseConnectionModel.transaction(
                async (model) => {
                    await model.lockProject(projectUuid);
                    const lockedProject = await model.getProject(projectUuid);
                    WarehouseConnectionService.assertMultiMode(lockedProject);
                    await model.get(lockedProject, warehouseConnectionUuid);
                    await model.rename(
                        lockedProject,
                        warehouseConnectionUuid,
                        parsedName,
                    );
                    return model.get(lockedProject, warehouseConnectionUuid);
                },
            );
        } catch (error) {
            return WarehouseConnectionService.rethrowNameConflict(error);
        }
    }

    async delete(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string,
    ): Promise<void> {
        assertRegisteredAccount(account);
        const { summary } = await this.getMultiProject(account, projectUuid);
        this.assertCanWrite(account, summary, null, null);
        let connectionName: string | null = null;
        await this.warehouseConnectionModel
            .transaction(async (model) => {
                await model.lockProject(projectUuid);
                const lockedProject = await model.getProject(projectUuid);
                WarehouseConnectionService.assertMultiMode(lockedProject);
                const connection = await model.get(
                    lockedProject,
                    warehouseConnectionUuid,
                );
                connectionName = connection.name;
                if (connection.isOriginal) {
                    throw new ConflictError(
                        'The original connection cannot be removed.',
                    );
                }
                const bound = describeBoundContent(
                    await model.getBoundContent(warehouseConnectionUuid),
                );
                if (bound.length > 0) {
                    throw new ConflictError(
                        `Connection '${connection.name}' cannot be removed while content uses it. ${bound.join('; ')}.`,
                    );
                }
                await model.clearOlderSqlChartVersionBindings(
                    warehouseConnectionUuid,
                );
                await model.deleteExtra(lockedProject, warehouseConnectionUuid);
                await model.insertEvent({
                    projectUuid,
                    actorUserUuid: account.user.userUuid,
                    event: 'connection_removed',
                    plan: {
                        warehouseConnectionUuid,
                        name: connection.name,
                        warehouseType: connection.warehouseType,
                    },
                });
            })
            .catch((error: unknown) => {
                if (isBindingConflict(error)) {
                    throw new ConflictError(
                        `Connection '${connectionName}' cannot be removed while content uses it.`,
                    );
                }
                throw error;
            });
    }

    async assertBindingsBelongToProject(
        projectUuid: string,
        warehouseConnectionUuids: (string | null)[],
    ): Promise<void> {
        await this.warehouseConnectionModel.assertBindingsBelongToProject(
            projectUuid,
            warehouseConnectionUuids,
        );
    }
}
