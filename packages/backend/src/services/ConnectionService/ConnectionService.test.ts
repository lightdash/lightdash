import { Ability } from '@casl/ability';
import {
    ConflictError,
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    WarehouseTypes,
    type ApiCreateConnectionRequest,
    type ApiUpdateConnectionRequest,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { DatabaseError } from 'pg';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import {
    type ConnectionBoundContent,
    type ConnectionModel,
} from '../../models/ConnectionModel/ConnectionModel';
import { ConnectionService } from './ConnectionService';

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';
const connectionUuid = 'connection-uuid';
const secondConnectionUuid = 'second-connection-uuid';

const adminUser: SessionUser = {
    ...defaultSessionUser,
    ability: new Ability<PossibleAbilities>([
        { subject: 'Project', action: 'manage' },
    ]),
};
const adminAccount = fromSession(adminUser, 'session-cookie');
const viewerAccount = fromSession(
    {
        ...adminUser,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: 'view' },
        ]),
    },
    'session-cookie',
);

const warehouseConnection: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    user: 'postgres',
    password: 'password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
};
const otherWarehouseConnection: CreateRedshiftCredentials = {
    ...warehouseConnection,
    type: WarehouseTypes.REDSHIFT,
};
const createInput: ApiCreateConnectionRequest = {
    name: 'Analytics',
    warehouseConnection,
};
const firstConnection = {
    connectionUuid,
    name: 'Primary',
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-17T12:00:00Z'),
};
const secondConnection = {
    ...firstConnection,
    connectionUuid: secondConnectionUuid,
    name: 'Analytics',
};
const noBoundContent: ConnectionBoundContent = {
    cached_explore: 0,
    saved_sql_versions: 0,
    project_dbt_sources: 0,
    query_history: 0,
};

const connectionModel = {
    transaction: vi.fn(),
    lockProject: vi.fn(),
    listByProject: vi.fn(),
    contractApplied: vi.fn(),
    create: vi.fn(),
    getByUuid: vi.fn(),
    getCredentials: vi.fn(),
    getOrganizationCredentialsForProject: vi.fn(),
    update: vi.fn(),
    rename: vi.fn(),
    hasBoundContent: vi.fn(),
    delete: vi.fn(),
};
const featureFlagService = {
    get: vi.fn(),
};
const licenseService = {
    canHoldMultipleConnections: vi.fn(),
};
const projectModel = {
    getSummary: vi.fn(),
};
const testWarehouseConnection = vi.fn();

const getService = () =>
    new ConnectionService({
        connectionModel: connectionModel as unknown as ConnectionModel,
        featureFlagService: featureFlagService as never,
        licenseService: licenseService as never,
        projectModel: projectModel as never,
        testWarehouseConnection,
    });

const duplicateNameError = () => {
    const error = new DatabaseError('duplicate connection name', 0, 'error');
    error.code = '23505';
    error.constraint = 'warehouse_credentials_project_name_unique';
    return error;
};

describe('ConnectionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        connectionModel.transaction.mockImplementation(
            async (
                callback: (
                    transactionModel: ConnectionModel,
                ) => Promise<unknown>,
            ) => callback(connectionModel as unknown as ConnectionModel),
        );
        connectionModel.lockProject.mockResolvedValue({ organizationUuid });
        connectionModel.listByProject.mockResolvedValue([firstConnection]);
        connectionModel.contractApplied.mockResolvedValue(true);
        connectionModel.create.mockResolvedValue(secondConnection);
        connectionModel.getByUuid.mockResolvedValue(firstConnection);
        connectionModel.getCredentials.mockResolvedValue({
            ...warehouseConnection,
            listAllDatabases: false,
            additionalDatabases: [],
        });
        connectionModel.getOrganizationCredentialsForProject.mockResolvedValue(
            warehouseConnection,
        );
        connectionModel.update.mockResolvedValue(firstConnection);
        connectionModel.rename.mockResolvedValue(firstConnection);
        connectionModel.hasBoundContent.mockResolvedValue(noBoundContent);
        connectionModel.delete.mockResolvedValue(undefined);
        featureFlagService.get.mockResolvedValue({
            id: FeatureFlags.MultiConnectionProjects,
            enabled: true,
        });
        licenseService.canHoldMultipleConnections.mockReturnValue(true);
        projectModel.getSummary.mockResolvedValue({
            organizationUuid,
            projectUuid,
            name: 'Project',
        });
        testWarehouseConnection.mockResolvedValue({
            ok: true,
            hops: [{ stage: 'database', status: 'ok', message: null }],
        });
    });

    it('creates the first connection without entitlement gates', async () => {
        connectionModel.listByProject.mockResolvedValue([]);

        await expect(
            getService().create(adminAccount, projectUuid, createInput),
        ).resolves.toEqual(secondConnection);

        expect(connectionModel.lockProject).toHaveBeenCalledWith(projectUuid);
        expect(
            licenseService.canHoldMultipleConnections,
        ).not.toHaveBeenCalled();
        expect(featureFlagService.get).not.toHaveBeenCalled();
        expect(connectionModel.contractApplied).not.toHaveBeenCalled();
    });

    it('creates a second connection when every gate passes', async () => {
        await expect(
            getService().create(adminAccount, projectUuid, createInput),
        ).resolves.toEqual(secondConnection);

        expect(licenseService.canHoldMultipleConnections).toHaveBeenCalledWith(
            organizationUuid,
        );
        expect(featureFlagService.get).toHaveBeenCalledWith({
            user: { organizationUuid },
            featureFlagId: FeatureFlags.MultiConnectionProjects,
        });
        expect(connectionModel.contractApplied).toHaveBeenCalledTimes(2);
        expect(connectionModel.create).toHaveBeenCalledWith(
            projectUuid,
            createInput,
        );
    });

    it('refuses a second connection without the entitlement', async () => {
        licenseService.canHoldMultipleConnections.mockReturnValue(false);

        await expect(
            getService().create(adminAccount, projectUuid, createInput),
        ).rejects.toEqual(
            new ForbiddenError(
                'This project can hold one connection. A second connection needs the Enterprise multi-connection add-on.',
            ),
        );
        expect(testWarehouseConnection).not.toHaveBeenCalled();
    });

    it('refuses a second connection without the rollout flag', async () => {
        featureFlagService.get.mockResolvedValue({
            id: FeatureFlags.MultiConnectionProjects,
            enabled: false,
        });

        await expect(
            getService().create(adminAccount, projectUuid, createInput),
        ).rejects.toEqual(
            new ForbiddenError(
                'A second connection is not enabled for this organisation yet.',
            ),
        );
    });

    it('refuses a second connection before the contract migration', async () => {
        connectionModel.contractApplied.mockResolvedValue(false);

        await expect(
            getService().create(adminAccount, projectUuid, createInput),
        ).rejects.toEqual(
            new ForbiddenError(
                'A second connection needs the connections upgrade to finish on this instance.',
            ),
        );
    });

    it('refuses a connection with a different warehouse type', async () => {
        await expect(
            getService().create(adminAccount, projectUuid, {
                ...createInput,
                warehouseConnection: otherWarehouseConnection,
            }),
        ).rejects.toEqual(
            new ConflictError(
                'All connections in a project must use the same warehouse type.',
            ),
        );
    });

    it('maps a duplicate connection name to a conflict', async () => {
        connectionModel.create.mockRejectedValue(duplicateNameError());

        await expect(
            getService().create(adminAccount, projectUuid, createInput),
        ).rejects.toEqual(
            new ConflictError(
                'A connection with this name already exists in this project.',
            ),
        );
    });

    it('refuses deletion and lists every bound content count', async () => {
        connectionModel.listByProject.mockResolvedValue([
            firstConnection,
            secondConnection,
        ]);
        connectionModel.hasBoundContent.mockResolvedValue({
            cached_explore: 2,
            saved_sql_versions: 1,
            project_dbt_sources: 3,
            query_history: 4,
        });

        await expect(
            getService().delete(adminAccount, projectUuid, connectionUuid),
        ).rejects.toEqual(
            new ConflictError(
                'Connection cannot be deleted because it is used by 2 cached explores, 1 saved SQL version, 3 dbt sources, 4 in-flight queries.',
            ),
        );
        expect(connectionModel.delete).not.toHaveBeenCalled();
    });

    it('takes the advisory lock before it creates and deletes', async () => {
        connectionModel.listByProject.mockResolvedValue([]);
        const service = getService();

        await service.create(adminAccount, projectUuid, createInput);
        connectionModel.listByProject.mockResolvedValue([
            firstConnection,
            secondConnection,
        ]);
        await service.delete(adminAccount, projectUuid, connectionUuid);

        expect(connectionModel.lockProject).toHaveBeenNthCalledWith(
            1,
            projectUuid,
        );
        expect(connectionModel.lockProject).toHaveBeenNthCalledWith(
            2,
            projectUuid,
        );
        expect(
            connectionModel.lockProject.mock.invocationCallOrder[0],
        ).toBeLessThan(connectionModel.create.mock.invocationCallOrder[0]);
        expect(
            connectionModel.lockProject.mock.invocationCallOrder[1],
        ).toBeLessThan(
            connectionModel.hasBoundContent.mock.invocationCallOrder[0],
        );
    });

    it('requires project settings management for every method', async () => {
        const service = getService();
        const calls = [
            service.list(viewerAccount, projectUuid),
            service.create(viewerAccount, projectUuid, createInput),
            service.update(
                viewerAccount,
                projectUuid,
                connectionUuid,
                createInput,
            ),
            service.rename(
                viewerAccount,
                projectUuid,
                connectionUuid,
                'Renamed',
            ),
            service.delete(viewerAccount, projectUuid, connectionUuid),
        ];

        await Promise.all(
            calls.map((call) =>
                expect(call).rejects.toBeInstanceOf(ForbiddenError),
            ),
        );
        expect(connectionModel.transaction).not.toHaveBeenCalled();
        expect(connectionModel.listByProject).not.toHaveBeenCalled();
        expect(connectionModel.rename).not.toHaveBeenCalled();
    });

    it('returns the list with the reason that blocks another connection', async () => {
        licenseService.canHoldMultipleConnections.mockReturnValue(false);

        await expect(
            getService().listWithCapabilities(adminAccount, projectUuid),
        ).resolves.toEqual({
            connections: [firstConnection],
            capabilities: {
                canAddConnection: false,
                reason: 'This project can hold one connection. A second connection needs the Enterprise multi-connection add-on.',
            },
        });
    });

    it('tests credentials before saving them', async () => {
        testWarehouseConnection.mockResolvedValue({
            ok: false,
            hops: [
                {
                    stage: 'database',
                    status: 'failed',
                    message: 'Login failed',
                },
            ],
        });

        await expect(
            getService().create(adminAccount, projectUuid, createInput),
        ).rejects.toEqual(
            new ParameterError(
                'Warehouse connection test failed: Login failed',
            ),
        );
        expect(connectionModel.create).not.toHaveBeenCalled();
    });

    it('loads an organization credential owned by the project organization', async () => {
        const organizationWarehouseCredentialsUuid =
            'organization-credentials-uuid';

        await getService().create(adminAccount, projectUuid, {
            name: 'Shared',
            organizationWarehouseCredentialsUuid,
        });

        expect(
            connectionModel.getOrganizationCredentialsForProject,
        ).toHaveBeenCalledWith(
            projectUuid,
            organizationWarehouseCredentialsUuid,
        );
        expect(connectionModel.create).toHaveBeenCalledWith(projectUuid, {
            name: 'Shared',
            organizationWarehouseCredentialsUuid,
            warehouseConnection: {
                ...warehouseConnection,
                listAllDatabases: false,
                additionalDatabases: [],
            },
        });
    });

    it('returns scrubbed credentials for one connection', async () => {
        await expect(
            getService().get(adminAccount, projectUuid, connectionUuid),
        ).resolves.toEqual({
            ...firstConnection,
            warehouseConnection: {
                type: WarehouseTypes.POSTGRES,
                host: 'localhost',
                port: 5432,
                dbname: 'analytics',
                schema: 'public',
                listAllDatabases: false,
                additionalDatabases: [],
            },
        });
    });

    it('merges omitted secrets before it tests and updates a project credential', async () => {
        const request: ApiUpdateConnectionRequest = {
            warehouseConnection: {
                ...warehouseConnection,
                password: undefined,
            },
        };

        await getService().update(
            adminAccount,
            projectUuid,
            connectionUuid,
            request,
        );

        expect(testWarehouseConnection).toHaveBeenCalledWith(
            adminAccount,
            projectUuid,
            {
                ...warehouseConnection,
                listAllDatabases: false,
                additionalDatabases: [],
            },
        );
        expect(connectionModel.update).toHaveBeenCalledWith(
            projectUuid,
            connectionUuid,
            {
                organizationWarehouseCredentialsUuid: null,
                warehouseConnection: {
                    ...warehouseConnection,
                    listAllDatabases: false,
                    additionalDatabases: [],
                },
            },
        );
    });

    it('refuses deletion of the last connection', async () => {
        await expect(
            getService().delete(adminAccount, projectUuid, connectionUuid),
        ).rejects.toEqual(
            new ConflictError(
                'The last connection in a project cannot be deleted.',
            ),
        );
        expect(connectionModel.delete).not.toHaveBeenCalled();
    });
});
