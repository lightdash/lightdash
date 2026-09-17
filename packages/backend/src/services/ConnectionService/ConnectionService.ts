import { subject } from '@casl/ability';
import {
    ConflictError,
    FeatureFlags,
    ForbiddenError,
    type Account,
    type Connection,
    type WarehouseTypes,
} from '@lightdash/common';
import { DatabaseError } from 'pg';
import {
    ConnectionModel,
    type ConnectionBoundContent,
    type ConnectionWriteInput,
} from '../../models/ConnectionModel/ConnectionModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { type FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { type LicenseService } from '../LicenseService/LicenseService';

type ConnectionServiceArguments = {
    connectionModel: ConnectionModel;
    featureFlagService: FeatureFlagService;
    licenseService: LicenseService;
    projectModel: ProjectModel;
};

const CONNECTION_NAME_INDEX = 'warehouse_credentials_project_name_unique';

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

    constructor(args: ConnectionServiceArguments) {
        super({ serviceName: 'ConnectionService' });
        this.connectionModel = args.connectionModel;
        this.featureFlagService = args.featureFlagService;
        this.licenseService = args.licenseService;
        this.projectModel = args.projectModel;
    }

    private async assertCanManageProject(
        account: Account,
        projectUuid: string,
    ): Promise<string> {
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
        return project.organizationUuid;
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
            throw new ConflictError(
                'A connection with this name already exists in this project.',
            );
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

    async list(account: Account, projectUuid: string): Promise<Connection[]> {
        await this.assertCanManageProject(account, projectUuid);
        return this.connectionModel.listByProject(projectUuid);
    }

    async create(
        account: Account,
        projectUuid: string,
        input: ConnectionWriteInput,
    ): Promise<Connection> {
        const organizationUuid = await this.assertCanManageProject(
            account,
            projectUuid,
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
                    if (connections.length > 0) {
                        if (
                            !this.licenseService.canHoldMultipleConnections(
                                organizationUuid,
                            )
                        ) {
                            throw new ForbiddenError(
                                'This project can hold one connection. A second connection needs the Enterprise multi-connection add-on.',
                            );
                        }
                        const { enabled } = await this.featureFlagService.get({
                            user: { organizationUuid },
                            featureFlagId: FeatureFlags.MultiConnectionProjects,
                        });
                        if (!enabled) {
                            throw new ForbiddenError(
                                'A second connection is not enabled for this organisation yet.',
                            );
                        }
                        if (!(await transactionModel.contractApplied())) {
                            throw new ForbiddenError(
                                'A second connection needs the connections upgrade to finish on this instance.',
                            );
                        }
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
        input: ConnectionWriteInput,
    ): Promise<Connection> {
        await this.assertCanManageProject(account, projectUuid);
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
        await this.assertCanManageProject(account, projectUuid);
        try {
            return await this.connectionModel.rename(
                projectUuid,
                connectionUuid,
                name,
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
        await this.assertCanManageProject(account, projectUuid);
        await this.connectionModel.transaction(async (transactionModel) => {
            await transactionModel.lockProject(projectUuid);
            await transactionModel.getByUuid(projectUuid, connectionUuid);
            const boundContent =
                await transactionModel.hasBoundContent(connectionUuid);
            ConnectionService.assertConnectionIsUnbound(boundContent);
            await transactionModel.delete(projectUuid, connectionUuid);
        });
    }
}
