import { subject } from '@casl/ability';
import {
    allowsOptionalUserCredentials,
    assertRegisteredAccount,
    ConflictError,
    fillOmittedSecrets,
    ForbiddenError,
    ParameterError,
    sensitiveCredentialsFieldNames,
    SingleConnectionProjectError,
    validateWarehouseConnectionName,
    WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE,
    WarehouseTypes,
    type Account,
    type ApiCreateWarehouseConnectionRequest,
    type ApiUpdateWarehouseConnectionRequest,
    type CreateWarehouseCredentials,
    type ProjectSummary,
    type RegisteredAccount,
    type WarehouseConnection,
    type WarehouseConnectionCapabilities,
    type WarehouseConnectionForUserCredentials,
    type WarehouseConnectionTestResults,
    type WarehouseConnectionUserCredentials,
    type WarehouseConnectionWithCredentials,
    type WarehouseCredentials,
} from '@lightdash/common';
import { DatabaseError } from 'pg';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import {
    type WarehouseConnectionBoundContent,
    type WarehouseConnectionCredentialSource,
    type WarehouseConnectionModel,
    type WarehouseConnectionProject,
} from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { BaseService } from '../BaseService';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { type LicenseService } from '../LicenseService/LicenseService';
import { getExtraConnectionRequireUserCredentials } from './extraConnectionUserCredentials';
import {
    ENTITLEMENT_REASON,
    getMultipleConnectionsBlockReason,
    ROLLOUT_REASON,
} from './multipleConnectionsGate';

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
    projectModel: Pick<
        ProjectModel,
        'getSummary' | 'getWarehouseCredentialsForProject'
    >;
    userWarehouseCredentialsModel: Pick<
        UserWarehouseCredentialsModel,
        'getByUuid'
    >;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    licenseService: Pick<LicenseService, 'canHoldMultipleConnections'>;
    credentialPolicy: WarehouseCredentialPolicy;
    analytics: Pick<LightdashAnalytics, 'track'>;
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

export {
    ENTITLEMENT_REASON,
    ROLLOUT_REASON,
    WAREHOUSE_TYPE_REASON,
} from './multipleConnectionsGate';

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

    private readonly projectModel: WarehouseConnectionServiceArguments['projectModel'];

    private readonly userWarehouseCredentialsModel: WarehouseConnectionServiceArguments['userWarehouseCredentialsModel'];

    private readonly featureFlagService: Pick<FeatureFlagService, 'get'>;

    private readonly licenseService: Pick<
        LicenseService,
        'canHoldMultipleConnections'
    >;

    private readonly credentialPolicy: WarehouseCredentialPolicy;

    private readonly analytics: Pick<LightdashAnalytics, 'track'>;

    constructor(args: WarehouseConnectionServiceArguments) {
        super({ serviceName: 'WarehouseConnectionService' });
        this.warehouseConnectionModel = args.warehouseConnectionModel;
        this.projectModel = args.projectModel;
        this.userWarehouseCredentialsModel = args.userWarehouseCredentialsModel;
        this.featureFlagService = args.featureFlagService;
        this.licenseService = args.licenseService;
        this.credentialPolicy = args.credentialPolicy;
        this.analytics = args.analytics;
    }

    private track(event: Parameters<LightdashAnalytics['track']>[0]): void {
        try {
            this.analytics.track(event);
        } catch (error) {
            this.logger.warn('Failed to track warehouse connection analytics', {
                error,
            });
        }
    }

    private async trackWithCount(
        project: WarehouseConnectionProject,
        buildEvent: (
            connectionCount: number | null,
        ) => Parameters<LightdashAnalytics['track']>[0],
    ): Promise<void> {
        let connectionCount: number | null = null;
        try {
            connectionCount = (
                await this.warehouseConnectionModel.list(project)
            ).length;
        } catch (error) {
            this.logger.warn(
                'Failed to count warehouse connections for analytics',
                {
                    error,
                },
            );
        }
        this.track(buildEvent(connectionCount));
    }

    private async trackRefusal(
        account: RegisteredAccount,
        organizationUuid: string,
        projectUuid: string,
        operation: 'add' | 'update' | 'remove',
        reason:
            | 'feature_disabled'
            | 'license_required'
            | 'warehouse_type_mismatch'
            | 'original_connection'
            | 'bound_content'
            | 'name_conflict',
        warehouseConnectionUuid: string | null,
        warehouseType: WarehouseTypes | null,
        project: WarehouseConnectionProject,
    ): Promise<void> {
        let connectionKind: 'primary' | 'extra' | null = null;
        if (warehouseConnectionUuid !== null) {
            connectionKind =
                reason === 'original_connection' ? 'primary' : 'extra';
        }
        await this.trackWithCount(project, (connectionCount) => ({
            event: 'warehouse_connection.action_refused',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                warehouseConnectionId: warehouseConnectionUuid,
                warehouseType,
                connectionKind,
                credentialSource: null,
                connectionCount,
                operation,
                reason,
            },
        }));
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
        return getMultipleConnectionsBlockReason(
            {
                licenseService: this.licenseService,
                featureFlagService: this.featureFlagService,
            },
            account,
            project,
        );
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
        operation: 'add' | 'update',
        warehouseConnectionUuid: string | null,
        credentialSource: 'project' | 'organization',
    ): Promise<void> {
        let result: WarehouseConnectionTestResults;
        try {
            result =
                await this.credentialPolicy.testWarehouseConnectionCredentials(
                    account,
                    project.organizationUuid,
                    credentials,
                );
        } catch (error) {
            await this.trackWithCount(project, (connectionCount) => ({
                event: 'warehouse_connection.test_completed',
                userId: account.user.userUuid,
                properties: {
                    organizationId: project.organizationUuid,
                    projectId: project.projectUuid,
                    warehouseConnectionId: warehouseConnectionUuid,
                    warehouseType: credentials.type,
                    connectionKind: 'extra',
                    credentialSource,
                    connectionCount,
                    operation,
                    result: 'failure',
                    reason: 'connection_test_error',
                },
            }));
            throw error;
        }
        await this.trackWithCount(project, (connectionCount) => ({
            event: 'warehouse_connection.test_completed',
            userId: account.user.userUuid,
            properties: {
                organizationId: project.organizationUuid,
                projectId: project.projectUuid,
                warehouseConnectionId: warehouseConnectionUuid,
                warehouseType: credentials.type,
                connectionKind: 'extra',
                credentialSource,
                connectionCount,
                operation,
                result: result.ok ? 'success' : 'failure',
                reason: result.ok ? null : 'connection_test_failed',
            },
        }));
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

    private async inheritPrimaryCredentialRequirement(
        projectUuid: string,
        source: WarehouseConnectionCredentialSource,
    ): Promise<WarehouseConnectionCredentialSource> {
        if (
            source.kind === 'organization' ||
            (source.credentials.type !== WarehouseTypes.POSTGRES &&
                source.credentials.type !== WarehouseTypes.ATHENA)
        )
            return source;
        const originalCredentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        return {
            kind: 'project',
            credentials: {
                ...source.credentials,
                requireUserCredentials:
                    originalCredentials.requireUserCredentials,
            },
        };
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
        const source =
            await this.warehouseConnectionModel.getExtraCredentialSource(
                project,
                warehouseConnectionUuid,
            );
        const originalCredentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        const warehouseConnection = toNonSensitiveCredentials(
            source.credentials,
        );
        if (
            warehouseConnection.type === WarehouseTypes.POSTGRES ||
            warehouseConnection.type === WarehouseTypes.ATHENA
        ) {
            warehouseConnection.requireUserCredentials =
                getExtraConnectionRequireUserCredentials(
                    originalCredentials,
                    source,
                ) === true;
        }
        return {
            ...connection,
            warehouseConnection,
        };
    }

    private async getMultiProjectForViewer(
        account: Account,
        projectUuid: string,
        userWarehouseCredentialsUuid?: string,
    ): Promise<WarehouseConnectionProject> {
        const summary = await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'view',
                subject('Project', {
                    ...summary,
                    ...(userWarehouseCredentialsUuid
                        ? { metadata: { userWarehouseCredentialsUuid } }
                        : {}),
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const project =
            await this.warehouseConnectionModel.getProject(projectUuid);
        WarehouseConnectionService.assertMultiMode(project);
        return project;
    }

    private async getExtraConnection(
        project: WarehouseConnectionProject,
        warehouseConnectionUuid: string,
    ): Promise<WarehouseConnection & { warehouseType: WarehouseTypes }> {
        const connection = await this.warehouseConnectionModel.get(
            project,
            warehouseConnectionUuid,
        );
        if (connection.isOriginal || connection.warehouseType === null) {
            throw new ParameterError(
                'The original connection uses the project warehouse credentials preference.',
            );
        }
        return { ...connection, warehouseType: connection.warehouseType };
    }

    async listForUserCredentials(
        account: Account,
        projectUuid: string,
    ): Promise<WarehouseConnectionForUserCredentials[]> {
        assertRegisteredAccount(account);
        const project = await this.getMultiProjectForViewer(
            account,
            projectUuid,
        );
        const originalCredentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        const connections = await this.warehouseConnectionModel.list(project);
        return Promise.all(
            connections.map(async (connection) => ({
                warehouseConnectionUuid: connection.warehouseConnectionUuid,
                name: connection.name,
                isOriginal: connection.isOriginal,
                warehouseType: connection.warehouseType,
                requireUserCredentials: connection.isOriginal
                    ? originalCredentials.requireUserCredentials === true
                    : getExtraConnectionRequireUserCredentials(
                          originalCredentials,
                          await this.warehouseConnectionModel.getExtraCredentialSource(
                              project,
                              connection.warehouseConnectionUuid,
                          ),
                      ) === true,
            })),
        );
    }

    async getUserCredentials(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string,
    ): Promise<WarehouseConnectionUserCredentials> {
        assertRegisteredAccount(account);
        const project = await this.getMultiProjectForViewer(
            account,
            projectUuid,
        );
        const connection = await this.getExtraConnection(
            project,
            warehouseConnectionUuid,
        );
        const source =
            await this.warehouseConnectionModel.getExtraCredentialSource(
                project,
                warehouseConnectionUuid,
            );
        const originalCredentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        const preferredUuid =
            await this.warehouseConnectionModel.findPreferredUserCredentialsUuid(
                {
                    userUuid: account.user.userUuid,
                    projectUuid,
                    warehouseConnectionUuid,
                    warehouseType: connection.warehouseType,
                },
            );
        return {
            warehouseConnectionUuid,
            warehouseType: connection.warehouseType,
            requireUserCredentials:
                getExtraConnectionRequireUserCredentials(
                    originalCredentials,
                    source,
                ) === true,
            allowsOptionalUserCredentials: allowsOptionalUserCredentials(
                toNonSensitiveCredentials(source.credentials),
            ),
            userWarehouseCredentials:
                preferredUuid === null
                    ? null
                    : await this.userWarehouseCredentialsModel.getByUuid(
                          preferredUuid,
                      ),
        };
    }

    async upsertUserCredentialsPreference(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string,
        userWarehouseCredentialsUuid: string,
    ): Promise<void> {
        assertRegisteredAccount(account);
        const userWarehouseCredentials =
            await this.userWarehouseCredentialsModel.getByUuid(
                userWarehouseCredentialsUuid,
            );
        if (userWarehouseCredentials.userUuid !== account.user.userUuid) {
            throw new ForbiddenError();
        }
        const project = await this.getMultiProjectForViewer(
            account,
            projectUuid,
            userWarehouseCredentialsUuid,
        );
        const connection = await this.getExtraConnection(
            project,
            warehouseConnectionUuid,
        );
        if (
            userWarehouseCredentials.credentials.type !==
            connection.warehouseType
        ) {
            throw new ParameterError(
                'These warehouse credentials do not match the connection warehouse type.',
            );
        }
        if (
            userWarehouseCredentials.project !== null &&
            userWarehouseCredentials.project.projectUuid !== projectUuid
        ) {
            throw new ParameterError(
                'These warehouse credentials belong to another project.',
            );
        }
        await this.warehouseConnectionModel.upsertUserCredentialsPreference({
            userUuid: account.user.userUuid,
            warehouseConnectionUuid,
            userWarehouseCredentialsUuid,
        });
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
        const requestedSource =
            WarehouseConnectionService.toCreateSource(request);
        this.assertCanWrite(
            account,
            summary,
            requestedSource,
            requestedSource.kind === 'project'
                ? requestedSource.credentials
                : null,
        );
        const source = await this.inheritPrimaryCredentialRequirement(
            projectUuid,
            requestedSource,
        );
        const name = WarehouseConnectionService.parseName(request.name);
        const blockReason = await this.getAddConnectionBlockReason(
            account,
            project,
        );
        if (blockReason !== null) {
            let refusalReason:
                | 'license_required'
                | 'feature_disabled'
                | 'warehouse_type_mismatch' = 'warehouse_type_mismatch';
            if (blockReason === ENTITLEMENT_REASON) {
                refusalReason = 'license_required';
            } else if (blockReason === ROLLOUT_REASON) {
                refusalReason = 'feature_disabled';
            }
            await this.trackRefusal(
                account,
                summary.organizationUuid,
                projectUuid,
                'add',
                refusalReason,
                null,
                project.originalWarehouseType,
                project,
            );
            throw new ForbiddenError(blockReason);
        }
        const credentials = await this.resolveCredentialSource(project, source);
        this.assertCanWrite(account, summary, source, credentials);
        if (project.originalWarehouseType !== credentials.type) {
            await this.trackRefusal(
                account,
                summary.organizationUuid,
                projectUuid,
                'add',
                'warehouse_type_mismatch',
                null,
                credentials.type,
                project,
            );
        }
        WarehouseConnectionService.assertSameWarehouseType(
            project,
            credentials.type,
        );
        await this.assertConnectionWorks(
            account,
            project,
            credentials,
            'add',
            null,
            source.kind,
        );

        try {
            const created = await this.warehouseConnectionModel.transaction(
                async (model) => {
                    await model.lockProject(projectUuid);
                    const lockedProject = await model.getProject(projectUuid);
                    WarehouseConnectionService.assertMultiMode(lockedProject);
                    WarehouseConnectionService.assertSameWarehouseType(
                        lockedProject,
                        credentials.type,
                    );
                    const newConnection = await model.createExtra(
                        lockedProject,
                        {
                            name,
                            warehouseType: credentials.type,
                            source,
                            listAllDatabases: request.listAllDatabases ?? false,
                            additionalDatabases:
                                request.additionalDatabases ?? [],
                            createdByUserUuid: account.user.userUuid,
                        },
                    );
                    await model.insertEvent({
                        projectUuid,
                        actorUserUuid: account.user.userUuid,
                        event: 'connection_added',
                        plan: {
                            warehouseConnectionUuid:
                                newConnection.warehouseConnectionUuid,
                            name: newConnection.name,
                            warehouseType: newConnection.warehouseType,
                        },
                    });
                    return newConnection;
                },
            );
            await this.trackWithCount(project, (connectionCount) => ({
                event: 'warehouse_connection.added',
                userId: account.user.userUuid,
                properties: {
                    organizationId: summary.organizationUuid,
                    projectId: projectUuid,
                    warehouseConnectionId: created.warehouseConnectionUuid,
                    warehouseType: created.warehouseType,
                    connectionKind: 'extra',
                    credentialSource: source.kind,
                    connectionCount,
                    listAllDatabases: created.listAllDatabases,
                    additionalDatabaseCount: created.additionalDatabases.length,
                    changedCredentials: true,
                    changedDatabaseSettings: true,
                },
            }));
            return created;
        } catch (error) {
            if (isNameConflict(error)) {
                await this.trackRefusal(
                    account,
                    summary.organizationUuid,
                    projectUuid,
                    'add',
                    'name_conflict',
                    null,
                    credentials.type,
                    project,
                );
            }
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
            await this.trackRefusal(
                account,
                summary.organizationUuid,
                projectUuid,
                'update',
                'original_connection',
                warehouseConnectionUuid,
                existing.warehouseType,
                project,
            );
            throw new ParameterError(
                'Edit the original connection in the project settings.',
            );
        }
        const requestedSource = await this.resolveUpdateSource(
            project,
            existing,
            request,
        );
        const source = requestedSource
            ? await this.inheritPrimaryCredentialRequirement(
                  projectUuid,
                  requestedSource,
              )
            : null;
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
        if (credentials !== null && source !== null) {
            if (project.originalWarehouseType !== credentials.type) {
                await this.trackRefusal(
                    account,
                    summary.organizationUuid,
                    projectUuid,
                    'update',
                    'warehouse_type_mismatch',
                    warehouseConnectionUuid,
                    credentials.type,
                    project,
                );
            }
            WarehouseConnectionService.assertSameWarehouseType(
                project,
                credentials.type,
            );
            await this.assertConnectionWorks(
                account,
                project,
                credentials,
                'update',
                warehouseConnectionUuid,
                source.kind,
            );
        }

        const updated = await this.warehouseConnectionModel.transaction(
            async (model) => {
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
            },
        );
        await this.trackWithCount(project, (connectionCount) => ({
            event: 'warehouse_connection.updated',
            userId: account.user.userUuid,
            properties: {
                organizationId: summary.organizationUuid,
                projectId: projectUuid,
                warehouseConnectionId: updated.warehouseConnectionUuid,
                warehouseType: updated.warehouseType,
                connectionKind: updated.isOriginal ? 'primary' : 'extra',
                credentialSource:
                    updated.organizationWarehouseCredentialsUuid === null
                        ? 'project'
                        : 'organization',
                connectionCount,
                listAllDatabases: updated.listAllDatabases,
                additionalDatabaseCount: updated.additionalDatabases.length,
                changedCredentials: source !== null,
                changedDatabaseSettings:
                    existing.listAllDatabases !== updated.listAllDatabases ||
                    existing.additionalDatabases.length !==
                        updated.additionalDatabases.length ||
                    existing.additionalDatabases.some(
                        (database, index) =>
                            database !== updated.additionalDatabases[index],
                    ),
            },
        }));
        return updated;
    }

    async rename(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string,
        name: string,
    ): Promise<WarehouseConnection> {
        assertRegisteredAccount(account);
        const { summary, project } = await this.getMultiProject(
            account,
            projectUuid,
        );
        this.assertCanWrite(account, summary, null, null);
        const parsedName = WarehouseConnectionService.parseName(name);
        try {
            const renamed = await this.warehouseConnectionModel.transaction(
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
            await this.trackWithCount(project, (connectionCount) => ({
                event: 'warehouse_connection.renamed',
                userId: account.user.userUuid,
                properties: {
                    organizationId: summary.organizationUuid,
                    projectId: projectUuid,
                    warehouseConnectionId: renamed.warehouseConnectionUuid,
                    warehouseType: renamed.warehouseType,
                    connectionKind: renamed.isOriginal ? 'primary' : 'extra',
                    credentialSource:
                        renamed.organizationWarehouseCredentialsUuid === null
                            ? 'project'
                            : 'organization',
                    connectionCount,
                    listAllDatabases: renamed.listAllDatabases,
                    additionalDatabaseCount: renamed.additionalDatabases.length,
                    changedCredentials: false,
                    changedDatabaseSettings: false,
                },
            }));
            return renamed;
        } catch (error) {
            if (isNameConflict(error)) {
                await this.trackRefusal(
                    account,
                    summary.organizationUuid,
                    projectUuid,
                    'update',
                    'name_conflict',
                    warehouseConnectionUuid,
                    project.originalWarehouseType,
                    project,
                );
            }
            return WarehouseConnectionService.rethrowNameConflict(error);
        }
    }

    async delete(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string,
    ): Promise<void> {
        assertRegisteredAccount(account);
        const { summary, project } = await this.getMultiProject(
            account,
            projectUuid,
        );
        this.assertCanWrite(account, summary, null, null);
        let connectionName: string | null = null;
        let removedWarehouseType: WarehouseTypes | null = null;
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
                removedWarehouseType = connection.warehouseType;
                if (connection.isOriginal) {
                    await this.trackRefusal(
                        account,
                        summary.organizationUuid,
                        projectUuid,
                        'remove',
                        'original_connection',
                        warehouseConnectionUuid,
                        connection.warehouseType,
                        lockedProject,
                    );
                    throw new ConflictError(
                        'The original connection cannot be removed.',
                    );
                }
                const bound = describeBoundContent(
                    await model.getBoundContent(warehouseConnectionUuid),
                );
                if (bound.length > 0) {
                    await this.trackRefusal(
                        account,
                        summary.organizationUuid,
                        projectUuid,
                        'remove',
                        'bound_content',
                        warehouseConnectionUuid,
                        connection.warehouseType,
                        lockedProject,
                    );
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
            .catch(async (error: unknown) => {
                if (isBindingConflict(error)) {
                    await this.trackRefusal(
                        account,
                        summary.organizationUuid,
                        projectUuid,
                        'remove',
                        'bound_content',
                        warehouseConnectionUuid,
                        removedWarehouseType,
                        project,
                    );
                    throw new ConflictError(
                        `Connection '${connectionName}' cannot be removed while content uses it.`,
                    );
                }
                throw error;
            });
        await this.trackWithCount(project, (connectionCount) => ({
            event: 'warehouse_connection.removed',
            userId: account.user.userUuid,
            properties: {
                organizationId: summary.organizationUuid,
                projectId: projectUuid,
                warehouseConnectionId: warehouseConnectionUuid,
                warehouseType: removedWarehouseType,
                connectionKind: 'extra',
                credentialSource: null,
                connectionCount,
                listAllDatabases: null,
                additionalDatabaseCount: null,
                changedCredentials: null,
                changedDatabaseSettings: null,
            },
        }));
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
