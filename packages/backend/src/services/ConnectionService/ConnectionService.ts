import { subject } from '@casl/ability';
import {
    assertRegisteredAccount,
    ConflictError,
    CONNECTION_NAME_CONFLICT_MESSAGE,
    FeatureFlags,
    fillOmittedSecrets,
    ForbiddenError,
    ParameterError,
    supportsMultipleConnections,
    validateConnectionName,
    type Account,
    type ApiCreateConnectionRequest,
    type ApiUpdateConnectionRequest,
    type Connection,
    type ConnectionCapabilities,
    type ConnectionWithCredentials,
    type CreateWarehouseCredentials,
    type ProjectSummary,
    type RegisteredAccount,
    type WarehouseConnectionTestResults,
    type WarehouseTypes,
} from '@lightdash/common';
import { DatabaseError } from 'pg';
import {
    ConnectionModel,
    type ConnectionBoundContent,
    type ConnectionWriteInput,
} from '../../models/ConnectionModel/ConnectionModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { type LicenseService } from '../LicenseService/LicenseService';

type ConnectionServiceArguments = {
    connectionModel: ConnectionModel;
    featureFlagService: FeatureFlagService;
    licenseService: LicenseService;
    projectModel: ProjectModel;
    testWarehouseConnection: (
        account: RegisteredAccount,
        projectUuid: string,
        warehouseConnection: CreateWarehouseCredentials,
    ) => Promise<WarehouseConnectionTestResults>;
    assertCanWriteProjectConnection: (
        account: Account,
        project: ProjectSummary,
        data: {
            warehouseConnection?: CreateWarehouseCredentials;
            organizationWarehouseCredentialsUuid?: string;
        },
    ) => void;
};

const CONNECTION_NAME_INDEX = 'warehouse_credentials_project_name_unique';
const ENTITLEMENT_REASON =
    'This project can hold one connection. A second connection needs the Enterprise multi-connection add-on.';
const ROLLOUT_REASON =
    'A second connection is not enabled for this organisation yet.';
const CONTRACT_REASON =
    'A second connection needs the connections upgrade to finish on this instance.';
const WAREHOUSE_TYPE_REASON =
    'Several connections are supported for Postgres and Athena projects only.';

const isConnectionNameConflict = (error: unknown): boolean =>
    error instanceof DatabaseError &&
    error.code === '23505' &&
    error.constraint === CONNECTION_NAME_INDEX;

const boundContentLabels: Record<
    keyof ConnectionBoundContent,
    { singular: string; plural: string }
> = {
    cached_explore: {
        singular: 'cached explore',
        plural: 'cached explores',
    },
    saved_sql_versions: {
        singular: 'saved SQL version',
        plural: 'saved SQL versions',
    },
    project_dbt_sources: {
        singular: 'dbt source',
        plural: 'dbt sources',
    },
    query_history: {
        singular: 'in-flight query',
        plural: 'in-flight queries',
    },
};

export class ConnectionService extends BaseService {
    private readonly connectionModel: ConnectionModel;

    private readonly featureFlagService: FeatureFlagService;

    private readonly licenseService: LicenseService;

    private readonly projectModel: ProjectModel;

    private readonly testWarehouseConnection: ConnectionServiceArguments['testWarehouseConnection'];

    private readonly assertCanWriteProjectConnection: ConnectionServiceArguments['assertCanWriteProjectConnection'];

    constructor(args: ConnectionServiceArguments) {
        super({ serviceName: 'ConnectionService' });
        this.connectionModel = args.connectionModel;
        this.featureFlagService = args.featureFlagService;
        this.licenseService = args.licenseService;
        this.projectModel = args.projectModel;
        this.testWarehouseConnection = args.testWarehouseConnection;
        this.assertCanWriteProjectConnection =
            args.assertCanWriteProjectConnection;
    }

    private async assertCanManageProject(
        account: Account,
        projectUuid: string,
    ): Promise<ProjectSummary> {
        const project = await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                    metadata: {
                        projectUuid,
                        projectName: project.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage this project',
            );
        }
        return project;
    }

    private static parseConnectionName(name: string): string {
        const error = validateConnectionName(name);
        if (error) {
            throw new ParameterError(error);
        }
        return name.trim();
    }

    private static toWriteGuardInput(input: ConnectionWriteInput) {
        return {
            warehouseConnection: input.warehouseConnection,
            organizationWarehouseCredentialsUuid:
                input.organizationWarehouseCredentialsUuid ?? undefined,
        };
    }

    private static assertWarehouseTypeMatches(
        connections: Connection[],
        warehouseType: WarehouseTypes,
        connectionUuid?: string,
    ): void {
        const otherConnection = connections.find(
            (connection) => connection.connectionUuid !== connectionUuid,
        );
        if (
            otherConnection &&
            otherConnection.warehouseType !== warehouseType
        ) {
            throw new ConflictError(
                'All connections in a project must use the same warehouse type.',
            );
        }
    }

    private static mapConnectionNameConflict(error: unknown): never {
        if (isConnectionNameConflict(error)) {
            throw new ConflictError(CONNECTION_NAME_CONFLICT_MESSAGE);
        }
        throw error;
    }

    private static assertConnectionIsUnbound(
        boundContent: ConnectionBoundContent,
    ): void {
        const bindings = Object.entries(boundContent)
            .filter(([, count]) => count > 0)
            .map(([table, count]) => {
                const labels =
                    boundContentLabels[table as keyof ConnectionBoundContent];
                return `${count} ${count === 1 ? labels.singular : labels.plural}`;
            });
        if (bindings.length > 0) {
            throw new ConflictError(
                `Connection cannot be deleted because it is used by ${bindings.join(', ')}.`,
            );
        }
    }

    private async getAdditionalConnectionBlockReason(
        organizationUuid: string,
        warehouseType: WarehouseTypes,
        connectionModel: ConnectionModel = this.connectionModel,
    ): Promise<string | undefined> {
        // The scope limit comes first: no licence or rollout makes a project
        // of another warehouse type eligible.
        if (!supportsMultipleConnections(warehouseType)) {
            return WAREHOUSE_TYPE_REASON;
        }
        if (!this.licenseService.canHoldMultipleConnections(organizationUuid)) {
            return ENTITLEMENT_REASON;
        }
        const { enabled } = await this.featureFlagService.get({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.MultiConnectionProjects,
        });
        if (!enabled) {
            return ROLLOUT_REASON;
        }
        if (!(await connectionModel.contractApplied())) {
            return CONTRACT_REASON;
        }
        return undefined;
    }

    private async assertWarehouseConnectionWorks(
        account: Account,
        projectUuid: string,
        warehouseConnection: CreateWarehouseCredentials,
    ): Promise<void> {
        assertRegisteredAccount(account);
        const result = await this.testWarehouseConnection(
            account,
            projectUuid,
            warehouseConnection,
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

    private async resolveCreateInput(
        projectUuid: string,
        input: ApiCreateConnectionRequest,
    ): Promise<ConnectionWriteInput> {
        const hasProjectCredentials = input.warehouseConnection !== undefined;
        const hasOrganizationCredentials =
            input.organizationWarehouseCredentialsUuid !== undefined;
        if (hasProjectCredentials === hasOrganizationCredentials) {
            throw new ParameterError(
                'Provide either project warehouse credentials or an organization warehouse credential.',
            );
        }
        if (input.organizationWarehouseCredentialsUuid) {
            const warehouseConnection =
                await this.connectionModel.getOrganizationCredentialsForProject(
                    projectUuid,
                    input.organizationWarehouseCredentialsUuid,
                );
            return {
                name: input.name,
                organizationWarehouseCredentialsUuid:
                    input.organizationWarehouseCredentialsUuid,
                warehouseConnection: {
                    ...warehouseConnection,
                    listAllDatabases: false,
                    additionalDatabases: [],
                },
            };
        }
        return {
            name: input.name,
            warehouseConnection: input.warehouseConnection!,
        };
    }

    private async resolveUpdateInput(
        projectUuid: string,
        connectionUuid: string,
        input: ApiUpdateConnectionRequest,
    ): Promise<ConnectionWriteInput> {
        if (
            input.warehouseConnection &&
            typeof input.organizationWarehouseCredentialsUuid === 'string'
        ) {
            throw new ParameterError(
                'Provide either project warehouse credentials or an organization warehouse credential.',
            );
        }
        const connection = await this.connectionModel.getByUuid(
            projectUuid,
            connectionUuid,
        );
        const savedCredentials = await this.connectionModel.getCredentials(
            projectUuid,
            connectionUuid,
        );
        let warehouseConnection: CreateWarehouseCredentials;
        let { organizationWarehouseCredentialsUuid } = connection;
        if (typeof input.organizationWarehouseCredentialsUuid === 'string') {
            warehouseConnection =
                await this.connectionModel.getOrganizationCredentialsForProject(
                    projectUuid,
                    input.organizationWarehouseCredentialsUuid,
                );
            organizationWarehouseCredentialsUuid =
                input.organizationWarehouseCredentialsUuid;
        } else if (input.warehouseConnection) {
            warehouseConnection = fillOmittedSecrets(
                connection.organizationWarehouseCredentialsUuid === null
                    ? ProjectModel.mergeMissingWarehouseSecrets(
                          input.warehouseConnection,
                          savedCredentials,
                      )
                    : input.warehouseConnection,
            );
            organizationWarehouseCredentialsUuid = null;
        } else {
            if (input.organizationWarehouseCredentialsUuid === null) {
                throw new ParameterError(
                    'Project warehouse credentials are required when detaching an organization warehouse credential.',
                );
            }
            warehouseConnection = savedCredentials;
        }
        return {
            organizationWarehouseCredentialsUuid,
            warehouseConnection: {
                ...warehouseConnection,
                listAllDatabases:
                    input.listAllDatabases ?? connection.listAllDatabases,
                additionalDatabases:
                    input.additionalDatabases ?? connection.additionalDatabases,
            },
        };
    }

    async list(account: Account, projectUuid: string): Promise<Connection[]> {
        await this.assertCanManageProject(account, projectUuid);
        return this.connectionModel.listByProject(projectUuid);
    }

    async listWithCapabilities(
        account: Account,
        projectUuid: string,
    ): Promise<{
        connections: Connection[];
        capabilities: ConnectionCapabilities;
    }> {
        const { organizationUuid } = await this.assertCanManageProject(
            account,
            projectUuid,
        );
        const connections =
            await this.connectionModel.listByProject(projectUuid);
        const [firstConnection] = connections;
        const reason =
            firstConnection === undefined
                ? undefined
                : await this.getAdditionalConnectionBlockReason(
                      organizationUuid,
                      firstConnection.warehouseType,
                  );
        return {
            connections,
            capabilities: {
                canAddConnection: reason === undefined,
                ...(reason ? { reason } : undefined),
            },
        };
    }

    async get(
        account: Account,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ConnectionWithCredentials> {
        await this.assertCanManageProject(account, projectUuid);
        const [connection, warehouseConnection] = await Promise.all([
            this.connectionModel.getByUuid(projectUuid, connectionUuid),
            this.connectionModel.getCredentials(projectUuid, connectionUuid),
        ]);
        return {
            ...connection,
            warehouseConnection:
                ProjectModel.getNonSensitiveWarehouseCredentials(
                    warehouseConnection,
                ),
        };
    }

    async create(
        account: Account,
        projectUuid: string,
        request: ApiCreateConnectionRequest,
    ): Promise<Connection> {
        const project = await this.assertCanManageProject(account, projectUuid);
        const { organizationUuid } = project;
        this.assertCanWriteProjectConnection(account, project, {
            organizationWarehouseCredentialsUuid:
                request.organizationWarehouseCredentialsUuid,
        });
        const name = ConnectionService.parseConnectionName(request.name);
        const existingConnections =
            await this.connectionModel.listByProject(projectUuid);
        const [firstExistingConnection] = existingConnections;
        if (firstExistingConnection !== undefined) {
            const reason = await this.getAdditionalConnectionBlockReason(
                organizationUuid,
                firstExistingConnection.warehouseType,
            );
            if (reason) {
                throw new ForbiddenError(reason);
            }
        }
        const input = await this.resolveCreateInput(projectUuid, {
            ...request,
            name,
        });
        this.assertCanWriteProjectConnection(
            account,
            project,
            ConnectionService.toWriteGuardInput(input),
        );
        ConnectionService.assertWarehouseTypeMatches(
            existingConnections,
            input.warehouseConnection.type,
        );
        await this.assertWarehouseConnectionWorks(
            account,
            projectUuid,
            input.warehouseConnection,
        );
        try {
            return await this.connectionModel.transaction(
                async (transactionModel) => {
                    await transactionModel.lockProject(projectUuid);
                    const connections =
                        await transactionModel.listByProject(projectUuid);
                    ConnectionService.assertWarehouseTypeMatches(
                        connections,
                        input.warehouseConnection.type,
                    );
                    const [firstConnection] = connections;
                    if (firstConnection !== undefined) {
                        const reason =
                            await this.getAdditionalConnectionBlockReason(
                                organizationUuid,
                                firstConnection.warehouseType,
                                transactionModel,
                            );
                        if (reason) {
                            throw new ForbiddenError(reason);
                        }
                    }
                    if (connections.length === 1) {
                        await transactionModel.stampUnboundContent(
                            projectUuid,
                            connections[0].connectionUuid,
                        );
                    }
                    const created = await transactionModel.create(
                        projectUuid,
                        input,
                    );
                    ConnectionService.assertWarehouseTypeMatches(
                        connections,
                        created.warehouseType,
                    );
                    return created;
                },
            );
        } catch (error) {
            return ConnectionService.mapConnectionNameConflict(error);
        }
    }

    async update(
        account: Account,
        projectUuid: string,
        connectionUuid: string,
        request: ApiUpdateConnectionRequest,
    ): Promise<Connection> {
        const project = await this.assertCanManageProject(account, projectUuid);
        this.assertCanWriteProjectConnection(account, project, {
            organizationWarehouseCredentialsUuid:
                request.organizationWarehouseCredentialsUuid ?? undefined,
        });
        const input = await this.resolveUpdateInput(
            projectUuid,
            connectionUuid,
            request,
        );
        this.assertCanWriteProjectConnection(
            account,
            project,
            ConnectionService.toWriteGuardInput(input),
        );
        ConnectionService.assertWarehouseTypeMatches(
            await this.connectionModel.listByProject(projectUuid),
            input.warehouseConnection.type,
            connectionUuid,
        );
        await this.assertWarehouseConnectionWorks(
            account,
            projectUuid,
            input.warehouseConnection,
        );
        try {
            return await this.connectionModel.transaction(
                async (transactionModel) => {
                    await transactionModel.lockProject(projectUuid);
                    const connections =
                        await transactionModel.listByProject(projectUuid);
                    await transactionModel.getByUuid(
                        projectUuid,
                        connectionUuid,
                    );
                    ConnectionService.assertWarehouseTypeMatches(
                        connections,
                        input.warehouseConnection.type,
                        connectionUuid,
                    );
                    const updated = await transactionModel.update(
                        projectUuid,
                        connectionUuid,
                        input,
                    );
                    ConnectionService.assertWarehouseTypeMatches(
                        connections,
                        updated.warehouseType,
                        connectionUuid,
                    );
                    return updated;
                },
            );
        } catch (error) {
            return ConnectionService.mapConnectionNameConflict(error);
        }
    }

    async rename(
        account: Account,
        projectUuid: string,
        connectionUuid: string,
        name: string,
    ): Promise<Connection> {
        const project = await this.assertCanManageProject(account, projectUuid);
        this.assertCanWriteProjectConnection(account, project, {});
        const parsedName = ConnectionService.parseConnectionName(name);
        try {
            return await this.connectionModel.rename(
                projectUuid,
                connectionUuid,
                parsedName,
            );
        } catch (error) {
            return ConnectionService.mapConnectionNameConflict(error);
        }
    }

    async delete(
        account: Account,
        projectUuid: string,
        connectionUuid: string,
    ): Promise<void> {
        const project = await this.assertCanManageProject(account, projectUuid);
        this.assertCanWriteProjectConnection(account, project, {});
        await this.connectionModel.transaction(async (transactionModel) => {
            await transactionModel.lockProject(projectUuid);
            await transactionModel.getByUuid(projectUuid, connectionUuid);
            const connections =
                await transactionModel.listByProject(projectUuid);
            if (connections.length <= 1) {
                throw new ConflictError(
                    'The last connection in a project cannot be deleted.',
                );
            }
            const boundContent =
                await transactionModel.hasBoundContent(connectionUuid);
            ConnectionService.assertConnectionIsUnbound(boundContent);
            await transactionModel.delete(projectUuid, connectionUuid);
        });
    }
}
