import { Ability } from '@casl/ability';
import {
    AuthorizationError,
    OnboardingStepStatus,
    OnboardingStepType,
    ParameterError,
    PossibleAbilities,
    ProjectType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type ConnectionDiagnosticResult,
    type CreatePostgresCredentials,
    type CreateSnowflakeCredentials,
    type DepositOnboardingConnectionRequest,
} from '@lightdash/common';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { OnboardingConnectCodeModel } from '../../models/OnboardingConnectCodeModel';
import { OnboardingProjectStateModel } from '../../models/OnboardingProjectStateModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ProjectService } from '../ProjectService/ProjectService';
import { UserService } from '../UserService';
import { WarehouseDiagnosticsService } from '../WarehouseDiagnosticsService/WarehouseDiagnosticsService';
import {
    hashOnboardingConnectCode,
    OnboardingConnectionService,
} from './OnboardingConnectionService';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const { userUuid, organizationUuid: accountOrganizationUuid } =
    defaultSessionUser;
const organizationUuid = accountOrganizationUuid!;
const code = '11111111_random-code';
const expiresAt = new Date('2026-07-14T12:15:00.000Z');

const credentials: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'acme.eu-west-1',
    user: 'lightdash_user',
    password: 'pat-secret',
    authenticationType: SnowflakeAuthenticationType.PASSWORD,
    role: 'lightdash_role',
    database: 'analytics',
    warehouse: 'lightdash_wh',
    schema: 'public',
};

const postgresCredentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    user: 'user',
    password: 'password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
};

const passedDiagnostic: ConnectionDiagnosticResult = {
    status: 'passed',
    checks: [
        {
            id: 'open_connection',
            label: 'Open connection',
            status: 'passed',
            durationMs: 12,
            diagnosis: null,
        },
    ],
};

const connectionValues = {
    database: credentials.database,
    warehouse: credentials.warehouse,
    role: credentials.role ?? null,
    schema: credentials.schema,
};

const connectionValueSources = {
    database: 'default' as const,
    warehouse: 'default' as const,
    role: 'default' as const,
    schema: 'default' as const,
};

const inventory = {
    databases: ['analytics'],
    warehouses: ['lightdash_wh'],
    roles: ['lightdash_role', 'PUBLIC'],
};

const depositRequest = (
    overrides: Partial<DepositOnboardingConnectionRequest> = {},
): DepositOnboardingConnectionRequest => ({
    code,
    warehouseConnection: credentials,
    connectionValues,
    connectionValueSources,
    inventory,
    ...overrides,
});

const create = vi.fn<OnboardingConnectCodeModel['create']>();
const consume = vi.fn<OnboardingConnectCodeModel['consume']>();
const getAll = vi.fn<OnboardingProjectStateModel['getAll']>();
const upsert = vi.fn<OnboardingProjectStateModel['upsert']>();
const getSummary = vi.fn<ProjectModel['getSummary']>();
const updateWarehouseCredentials =
    vi.fn<ProjectService['updateWarehouseCredentials']>();
const getAccountByUserUuid = vi.fn<UserService['getAccountByUserUuid']>();
const diagnoseConnection =
    vi.fn<WarehouseDiagnosticsService['diagnoseConnection']>();

const account = fromSession({
    ...defaultSessionUser,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'CompileProject',
            action: 'manage',
            conditions: { projectUuid },
        },
    ]),
});

const getService = () =>
    new OnboardingConnectionService({
        onboardingConnectCodeModel: {
            create,
            consume,
        } as unknown as OnboardingConnectCodeModel,
        onboardingProjectStateModel: {
            getAll,
            upsert,
        } as unknown as OnboardingProjectStateModel,
        projectModel: { getSummary } as unknown as ProjectModel,
        projectService: {
            updateWarehouseCredentials,
        } as unknown as ProjectService,
        userService: { getAccountByUserUuid } as unknown as UserService,
        warehouseDiagnosticsService: {
            diagnoseConnection,
        } as unknown as WarehouseDiagnosticsService,
        now: () => new Date('2026-07-14T12:00:00.000Z'),
        generateRandomCode: () => 'random-code',
    });

describe('OnboardingConnectionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getSummary.mockResolvedValue({
            projectUuid,
            organizationUuid,
            name: 'Onboarding project',
            type: ProjectType.DEFAULT,
            upstreamProjectUuid: undefined,
            createdByUserUuid: userUuid,
        });
        consume.mockResolvedValue({
            projectUuid,
            createdByUserUuid: userUuid,
            expiresAt,
            usedAt: new Date('2026-07-14T12:01:00.000Z'),
        });
        getAccountByUserUuid.mockResolvedValue(account);
        diagnoseConnection.mockResolvedValue(passedDiagnostic);
        upsert.mockResolvedValue({
            step: OnboardingStepType.CONNECT,
            status: OnboardingStepStatus.COMPLETED,
            result: passedDiagnostic,
            updatedAt: new Date('2026-07-14T12:01:00.000Z'),
        });
    });

    it('mints a hashed 15-minute connect code with a project PAT prefix', async () => {
        await expect(
            getService().createConnectCode(account, projectUuid),
        ).resolves.toEqual({ code, expiresAt });
        expect(create).toHaveBeenCalledWith({
            codeHash: hashOnboardingConnectCode(code),
            projectUuid,
            createdByUserUuid: userUuid,
            expiresAt,
        });
    });

    it.each(['invalid', 'expired'])('rejects an %s code', async () => {
        consume.mockResolvedValueOnce(null);

        await expect(
            getService().depositConnection(depositRequest()),
        ).rejects.toThrow(AuthorizationError);
        expect(updateWarehouseCredentials).not.toHaveBeenCalled();
    });

    it('rejects a replay after the first consume succeeds', async () => {
        const service = getService();
        await service.depositConnection(depositRequest());
        consume.mockResolvedValueOnce(null);

        await expect(
            service.depositConnection(depositRequest()),
        ).rejects.toThrow(AuthorizationError);
        expect(updateWarehouseCredentials).toHaveBeenCalledTimes(1);
    });

    it('consumes then rejects non-Snowflake credentials', async () => {
        await expect(
            getService().depositConnection({
                warehouseConnection: postgresCredentials,
                code,
                connectionValues,
                connectionValueSources,
                inventory,
            }),
        ).rejects.toThrow(ParameterError);
        expect(consume).toHaveBeenCalledOnce();
        expect(updateWarehouseCredentials).not.toHaveBeenCalled();
    });

    it('stores credentials, runs diagnostics, and records completed state', async () => {
        await expect(
            getService().depositConnection(depositRequest()),
        ).resolves.toEqual({
            stepStatus: OnboardingStepStatus.COMPLETED,
            connectionValues,
            connectionValueSources,
            inventory,
            missingConnectionValues: [],
            diagnostic: passedDiagnostic,
        });
        expect(getAccountByUserUuid).toHaveBeenCalledWith(userUuid);
        expect(updateWarehouseCredentials).toHaveBeenCalledWith(
            projectUuid,
            account,
            { warehouseConnection: credentials },
        );
        expect(diagnoseConnection).toHaveBeenCalledWith(credentials);
        expect(upsert).toHaveBeenCalledWith(
            projectUuid,
            OnboardingStepType.CONNECT,
            OnboardingStepStatus.COMPLETED,
            {
                stepStatus: OnboardingStepStatus.COMPLETED,
                connectionValues,
                connectionValueSources,
                inventory,
                missingConnectionValues: [],
                diagnostic: passedDiagnostic,
            },
        );
    });

    it('stores credentials and records pending configuration when required defaults are missing', async () => {
        const missingValues = {
            ...connectionValues,
            warehouse: null,
        };

        await expect(
            getService().depositConnection(
                depositRequest({
                    connectionValues: missingValues,
                    connectionValueSources: {
                        ...connectionValueSources,
                        warehouse: 'missing',
                    },
                }),
            ),
        ).resolves.toEqual({
            stepStatus: OnboardingStepStatus.PENDING_CONFIGURATION,
            connectionValues: missingValues,
            connectionValueSources: {
                ...connectionValueSources,
                warehouse: 'missing',
            },
            inventory,
            missingConnectionValues: ['warehouse'],
            diagnostic: null,
        });
        expect(updateWarehouseCredentials).toHaveBeenCalledWith(
            projectUuid,
            account,
            {
                warehouseConnection: {
                    ...credentials,
                    warehouse: '',
                },
            },
        );
        expect(diagnoseConnection).not.toHaveBeenCalled();
        expect(upsert).toHaveBeenCalledWith(
            projectUuid,
            OnboardingStepType.CONNECT,
            OnboardingStepStatus.PENDING_CONFIGURATION,
            {
                stepStatus: OnboardingStepStatus.PENDING_CONFIGURATION,
                connectionValues: missingValues,
                connectionValueSources: {
                    ...connectionValueSources,
                    warehouse: 'missing',
                },
                inventory,
                missingConnectionValues: ['warehouse'],
                diagnostic: null,
            },
        );
    });

    it('records failed diagnostics as an error state', async () => {
        const failedDiagnostic: ConnectionDiagnosticResult = {
            status: 'failed',
            checks: [
                {
                    id: 'authenticate',
                    label: 'Authenticate',
                    status: 'failed',
                    durationMs: 8,
                    diagnosis: {
                        title: 'Authentication failed',
                        detail: 'Check the PAT.',
                        remedySql: null,
                        docsUrl: null,
                    },
                },
            ],
        };
        diagnoseConnection.mockResolvedValueOnce(failedDiagnostic);

        await expect(
            getService().depositConnection(depositRequest()),
        ).resolves.toEqual({
            stepStatus: OnboardingStepStatus.ERROR,
            connectionValues,
            connectionValueSources,
            inventory,
            missingConnectionValues: [],
            diagnostic: failedDiagnostic,
        });
        expect(upsert).toHaveBeenCalledWith(
            projectUuid,
            OnboardingStepType.CONNECT,
            OnboardingStepStatus.ERROR,
            {
                stepStatus: OnboardingStepStatus.ERROR,
                connectionValues,
                connectionValueSources,
                inventory,
                missingConnectionValues: [],
                diagnostic: failedDiagnostic,
            },
        );
    });
});
