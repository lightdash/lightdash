import { Ability } from '@casl/ability';
import {
    AuthorizationError,
    ForbiddenError,
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
    type OnboardingConnectionDepositResult,
    type OnboardingConnectionInventory,
} from '@lightdash/common';
import {
    type SnowflakeSessionDiscovery,
    type SnowflakeWarehouseClient,
} from '@lightdash/warehouses';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { OnboardingConnectCodeModel } from '../../models/OnboardingConnectCodeModel';
import { OnboardingProjectStateModel } from '../../models/OnboardingProjectStateModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ProjectService } from '../ProjectService/ProjectService';
import { UserService } from '../UserService';
import {
    WarehouseDiagnosticsService,
    type SnowflakeConnectionValidationClient,
} from '../WarehouseDiagnosticsService/WarehouseDiagnosticsService';
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
    privateKey:
        '-----BEGIN PRIVATE KEY-----\ntest-private-key\n-----END PRIVATE KEY-----\n',
    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
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

const inventory: OnboardingConnectionInventory = {
    databases: [
        { name: 'analytics', comment: 'Analytics data', kind: 'STANDARD' },
    ],
    warehouses: [
        {
            name: 'lightdash_wh',
            size: 'X-Small',
            state: 'STARTED',
            autoSuspendSeconds: 300,
        },
    ],
    roles: [
        { name: 'lightdash_role', isDefault: true },
        { name: 'PUBLIC', isDefault: false },
    ],
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
const findConnectCode = vi.fn<OnboardingConnectCodeModel['find']>();
const getAll = vi.fn<OnboardingProjectStateModel['getAll']>();
const find = vi.fn<OnboardingProjectStateModel['find']>();
const upsert = vi.fn<OnboardingProjectStateModel['upsert']>();
const getSummary = vi.fn<ProjectModel['getSummary']>();
const getWithSensitiveFields = vi.fn<ProjectModel['getWithSensitiveFields']>();
const updateWarehouseCredentials =
    vi.fn<ProjectService['updateWarehouseCredentials']>();
const getWarehouseCredentialsForUser =
    vi.fn<ProjectService['getWarehouseCredentialsForUser']>();
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

type ValidationClient = SnowflakeConnectionValidationClient &
    Pick<SnowflakeWarehouseClient, 'getSessionDiscovery'>;

const getService = (
    overrides: {
        warehouseDiagnosticsService?: WarehouseDiagnosticsService;
        snowflakeClientFactory?: (
            clientCredentials: CreateSnowflakeCredentials,
        ) => ValidationClient;
    } = {},
) =>
    new OnboardingConnectionService({
        onboardingConnectCodeModel: {
            create,
            consume,
            find: findConnectCode,
        } as unknown as OnboardingConnectCodeModel,
        onboardingProjectStateModel: {
            getAll,
            find,
            upsert,
        } as unknown as OnboardingProjectStateModel,
        projectModel: {
            getSummary,
            getWithSensitiveFields,
        } as unknown as ProjectModel,
        projectService: {
            updateWarehouseCredentials,
            getWarehouseCredentialsForUser,
        } as unknown as ProjectService,
        userService: { getAccountByUserUuid } as unknown as UserService,
        warehouseDiagnosticsService:
            overrides.warehouseDiagnosticsService ??
            ({ diagnoseConnection } as unknown as WarehouseDiagnosticsService),
        snowflakeClientFactory: overrides.snowflakeClientFactory,
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
        findConnectCode.mockResolvedValue({
            projectUuid,
            createdByUserUuid: userUuid,
            expiresAt,
            usedAt: null,
        });
        getAccountByUserUuid.mockResolvedValue(account);
        getWithSensitiveFields.mockResolvedValue({
            projectUuid,
            organizationUuid,
            name: 'Onboarding project',
            type: ProjectType.DEFAULT,
            upstreamProjectUuid: undefined,
            createdByUserUuid: userUuid,
            warehouseConnection: credentials,
        } as Awaited<ReturnType<ProjectModel['getWithSensitiveFields']>>);
        diagnoseConnection.mockResolvedValue(passedDiagnostic);
        getWarehouseCredentialsForUser.mockResolvedValue({
            ...credentials,
            userWarehouseCredentialsUuid: undefined,
        });
        upsert.mockResolvedValue({
            step: OnboardingStepType.CONNECT,
            status: OnboardingStepStatus.COMPLETED,
            result: passedDiagnostic,
            updatedAt: new Date('2026-07-14T12:01:00.000Z'),
        });
    });

    it('mints a hashed 15-minute connect code with a project prefix', async () => {
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

    it('returns the stored private key fingerprint without consuming the code', async () => {
        const { privateKey: knownPrivateKey, publicKey: knownPublicKey } =
            generateKeyPairSync('rsa', {
                modulusLength: 2048,
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
                publicKeyEncoding: { type: 'spki', format: 'der' },
            });
        getWithSensitiveFields.mockResolvedValueOnce({
            projectUuid,
            organizationUuid,
            name: 'Onboarding project',
            type: ProjectType.DEFAULT,
            upstreamProjectUuid: undefined,
            createdByUserUuid: userUuid,
            warehouseConnection: {
                ...credentials,
                privateKey: knownPrivateKey,
            },
        } as Awaited<ReturnType<ProjectModel['getWithSensitiveFields']>>);
        const service = getService();

        await expect(service.getKeyFingerprint({ code })).resolves.toEqual({
            fingerprint: `SHA256:${createHash('sha256')
                .update(knownPublicKey)
                .digest('base64')}`,
        });
        await expect(
            service.depositConnection(depositRequest()),
        ).resolves.toEqual(
            expect.objectContaining({
                stepStatus: OnboardingStepStatus.COMPLETED,
            }),
        );
        expect(findConnectCode).toHaveBeenCalledWith(
            hashOnboardingConnectCode(code),
        );
        expect(consume).toHaveBeenCalledWith(hashOnboardingConnectCode(code));
    });

    it('returns null when the stored credential is not a private key', async () => {
        getWithSensitiveFields.mockResolvedValueOnce({
            projectUuid,
            organizationUuid,
            name: 'Onboarding project',
            type: ProjectType.DEFAULT,
            upstreamProjectUuid: undefined,
            createdByUserUuid: userUuid,
            warehouseConnection: {
                ...credentials,
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
                privateKey: undefined,
                password: 'pat-secret',
            },
        } as Awaited<ReturnType<ProjectModel['getWithSensitiveFields']>>);

        await expect(getService().getKeyFingerprint({ code })).resolves.toEqual(
            { fingerprint: null },
        );
    });

    it('rejects an invalid fingerprint lookup code', async () => {
        findConnectCode.mockResolvedValueOnce(null);

        await expect(getService().getKeyFingerprint({ code })).rejects.toThrow(
            AuthorizationError,
        );
        expect(getWithSensitiveFields).not.toHaveBeenCalled();
        expect(consume).not.toHaveBeenCalled();
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

    it('rejects OAuth token deposits with an actionable error', async () => {
        await expect(
            getService().depositConnection(
                depositRequest({
                    warehouseConnection: {
                        ...credentials,
                        authenticationType: SnowflakeAuthenticationType.OAUTH,
                        privateKey: undefined,
                        refreshToken: 'oauth-refresh-token',
                        token: 'oauth-access-token',
                    },
                }),
            ),
        ).rejects.toThrow(
            'Update the Lightdash CLI and run connect-snowflake again',
        );
        expect(updateWarehouseCredentials).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'private key',
            warehouseConnection: { ...credentials, privateKey: '   ' },
        },
        {
            name: 'private-key user',
            warehouseConnection: { ...credentials, user: '' },
        },
        {
            name: 'PAT secret',
            warehouseConnection: {
                ...credentials,
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
                privateKey: undefined,
                password: '',
            },
        },
    ])(
        'rejects a durable deposit with a missing $name',
        async ({ warehouseConnection }) => {
            await expect(
                getService().depositConnection(
                    depositRequest({ warehouseConnection }),
                ),
            ).rejects.toThrow(ParameterError);
            expect(updateWarehouseCredentials).not.toHaveBeenCalled();
        },
    );

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

    it('caps rich deposited inventory without changing entry shape', async () => {
        const largeInventory: OnboardingConnectionInventory = {
            databases: Array.from({ length: 101 }, (_, index) => ({
                name: `database_${index}`,
                comment: index === 99 ? 'last included database' : null,
                kind: 'STANDARD',
            })),
            warehouses: Array.from({ length: 101 }, (_, index) => ({
                name: `warehouse_${index}`,
                size: 'X-Small',
                state: 'SUSPENDED',
                autoSuspendSeconds: 60,
            })),
            roles: Array.from({ length: 101 }, (_, index) => ({
                name: `role_${index}`,
                isDefault: index === 0,
            })),
        };

        const result = await getService().depositConnection(
            depositRequest({ inventory: largeInventory }),
        );

        expect(result.inventory.databases).toHaveLength(100);
        expect(result.inventory.warehouses).toHaveLength(100);
        expect(result.inventory.roles).toHaveLength(100);
        expect(result.inventory.databases[99]).toEqual({
            name: 'database_99',
            comment: 'last included database',
            kind: 'STANDARD',
        });
    });

    it('accepts a PAT deposited in the Snowflake password shape', async () => {
        const patCredentials: CreateSnowflakeCredentials = {
            ...credentials,
            authenticationType: SnowflakeAuthenticationType.PASSWORD,
            privateKey: undefined,
            password: 'pat-secret',
        };

        await getService().depositConnection(
            depositRequest({
                warehouseConnection: patCredentials,
            }),
        );

        expect(updateWarehouseCredentials).toHaveBeenCalledWith(
            projectUuid,
            account,
            { warehouseConnection: patCredentials },
        );
        expect(diagnoseConnection).toHaveBeenCalledWith(patCredentials);
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
                        detail: 'Check the OAuth credential.',
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

    describe('configureConnection', () => {
        const pendingConnectionValues = {
            ...connectionValues,
            warehouse: null,
        };
        const pendingResult: OnboardingConnectionDepositResult = {
            stepStatus: OnboardingStepStatus.PENDING_CONFIGURATION,
            connectionValues: pendingConnectionValues,
            connectionValueSources: {
                ...connectionValueSources,
                warehouse: 'missing',
            },
            inventory,
            missingConnectionValues: ['warehouse'],
            diagnostic: null,
        };

        beforeEach(() => {
            find.mockResolvedValue({
                step: OnboardingStepType.CONNECT,
                status: OnboardingStepStatus.PENDING_CONFIGURATION,
                result: pendingResult,
                updatedAt: new Date('2026-07-14T12:01:00.000Z'),
            });
        });

        it('rejects a connection that is not pending configuration', async () => {
            find.mockResolvedValueOnce({
                step: OnboardingStepType.CONNECT,
                status: OnboardingStepStatus.COMPLETED,
                result: pendingResult,
                updatedAt: new Date('2026-07-14T12:01:00.000Z'),
            });

            await expect(
                getService().configureConnection(
                    account,
                    projectUuid,
                    connectionValues,
                ),
            ).rejects.toThrow(ParameterError);
            expect(getWithSensitiveFields).not.toHaveBeenCalled();
            expect(updateWarehouseCredentials).not.toHaveBeenCalled();
        });

        it('merges user values, runs diagnostics, and records completed state', async () => {
            const chosenValues = {
                database: 'selected_database',
                warehouse: 'selected_warehouse',
                role: null,
                schema: null,
            };
            const expectedCredentials: CreateSnowflakeCredentials = {
                ...credentials,
                database: 'selected_database',
                warehouse: 'selected_warehouse',
                role: undefined,
                schema: '',
            };
            const expectedResult: OnboardingConnectionDepositResult = {
                stepStatus: OnboardingStepStatus.COMPLETED,
                connectionValues: chosenValues,
                connectionValueSources: {
                    database: 'user',
                    warehouse: 'user',
                    role: 'user',
                    schema: 'user',
                },
                inventory,
                missingConnectionValues: [],
                diagnostic: passedDiagnostic,
            };

            await expect(
                getService().configureConnection(
                    account,
                    projectUuid,
                    chosenValues,
                ),
            ).resolves.toEqual(expectedResult);
            expect(updateWarehouseCredentials).toHaveBeenCalledWith(
                projectUuid,
                account,
                { warehouseConnection: expectedCredentials },
            );
            expect(diagnoseConnection).toHaveBeenCalledWith(
                expectedCredentials,
            );
            expect(upsert).toHaveBeenCalledWith(
                projectUuid,
                OnboardingStepType.CONNECT,
                OnboardingStepStatus.COMPLETED,
                expectedResult,
            );
        });

        it('rejects an unauthorized account', async () => {
            const unauthorizedAccount = fromSession({
                ...defaultSessionUser,
                ability: new Ability<PossibleAbilities>([]),
            });

            await expect(
                getService().configureConnection(
                    unauthorizedAccount,
                    projectUuid,
                    connectionValues,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(find).not.toHaveBeenCalled();
            expect(getWithSensitiveFields).not.toHaveBeenCalled();
        });

        it('lists missing required values without updating credentials', async () => {
            await expect(
                getService().configureConnection(account, projectUuid, {
                    database: '',
                    warehouse: null,
                    role: null,
                    schema: null,
                }),
            ).rejects.toThrow(
                'Missing required connection values: database, warehouse',
            );
            expect(getWithSensitiveFields).not.toHaveBeenCalled();
            expect(updateWarehouseCredentials).not.toHaveBeenCalled();
            expect(diagnoseConnection).not.toHaveBeenCalled();
            expect(upsert).not.toHaveBeenCalled();
        });
    });

    describe('validateConnection', () => {
        const schemaSummaries = [
            { name: 'PUBLIC', tableCount: 2 },
            { name: 'FINANCE', tableCount: 1 },
        ];

        const createValidationClient = () => {
            const events: string[] = [];
            const openDiagnosticConnection = vi.fn<
                ValidationClient['openDiagnosticConnection']
            >(async () => {
                events.push('open_connection');
                return { connection: {} as never };
            });
            const authenticateDiagnosticConnection = vi.fn<
                ValidationClient['authenticateDiagnosticConnection']
            >(async () => {
                events.push('authenticate');
                return {
                    role: 'SELECTED_ROLE',
                    user: 'LIGHTDASH_USER',
                    database: null,
                    warehouse: null,
                };
            });
            const useDiagnosticWarehouse = vi.fn<
                ValidationClient['useDiagnosticWarehouse']
            >(async () => {
                events.push('use_warehouse');
            });
            const useDiagnosticDatabase = vi.fn<
                ValidationClient['useDiagnosticDatabase']
            >(async () => {
                events.push('use_database');
            });
            const getSchemaSummaries = vi.fn<
                ValidationClient['getSchemaSummaries']
            >(async () => {
                events.push('list_schemas');
                return schemaSummaries;
            });
            const closeDiagnosticConnection = vi.fn<
                ValidationClient['closeDiagnosticConnection']
            >(async () => {
                events.push('close_connection');
            });
            const discovery: SnowflakeSessionDiscovery = {
                user: credentials.user,
                defaults: {
                    role: 'SELECTED_ROLE',
                    warehouse: 'SELECTED_WAREHOUSE',
                    database: 'SELECTED_DATABASE',
                    schema: 'PUBLIC',
                },
                inventory,
            };
            const getSessionDiscovery = vi.fn<
                ValidationClient['getSessionDiscovery']
            >(async () => {
                events.push('discovery');
                return discovery;
            });
            const client: ValidationClient = {
                openDiagnosticConnection,
                authenticateDiagnosticConnection,
                useDiagnosticWarehouse,
                useDiagnosticDatabase,
                getSchemaSummaries,
                closeDiagnosticConnection,
                getSessionDiscovery,
            };
            return {
                client,
                events,
                openDiagnosticConnection,
                authenticateDiagnosticConnection,
                useDiagnosticWarehouse,
                useDiagnosticDatabase,
                getSchemaSummaries,
                closeDiagnosticConnection,
                getSessionDiscovery,
            };
        };

        it('validates choices in order, returns schemas, and does not persist choices', async () => {
            const validationClient = createValidationClient();
            const snowflakeClientFactory = vi.fn<
                (
                    clientCredentials: CreateSnowflakeCredentials,
                ) => ValidationClient
            >(() => validationClient.client);
            const resolvedPrivateKeyCredentials: CreateSnowflakeCredentials = {
                ...credentials,
            };
            getWarehouseCredentialsForUser.mockResolvedValueOnce({
                ...resolvedPrivateKeyCredentials,
                userWarehouseCredentialsUuid: undefined,
            });
            const selectedValues = {
                database: 'Selected Database',
                warehouse: 'Selected Warehouse',
                role: 'SELECTED_ROLE',
                schema: 'SELECTED_SCHEMA',
            };

            const result = await getService({
                warehouseDiagnosticsService: new WarehouseDiagnosticsService(),
                snowflakeClientFactory,
            }).validateConnection(account, projectUuid, selectedValues);

            expect(validationClient.events).toEqual([
                'open_connection',
                'authenticate',
                'use_warehouse',
                'use_database',
                'list_schemas',
                'close_connection',
                'discovery',
            ]);
            expect(result).toEqual({
                diagnostic: {
                    status: 'passed',
                    checks: expect.arrayContaining([
                        expect.objectContaining({
                            id: 'use_warehouse',
                            status: 'passed',
                        }),
                        expect.objectContaining({
                            id: 'use_database',
                            status: 'passed',
                        }),
                    ]),
                },
                schemas: schemaSummaries,
                inventory,
            });
            expect(getWarehouseCredentialsForUser).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid }),
                projectUuid,
            );
            expect(snowflakeClientFactory).toHaveBeenCalledWith({
                ...resolvedPrivateKeyCredentials,
                userWarehouseCredentialsUuid: undefined,
                database: selectedValues.database,
                warehouse: selectedValues.warehouse,
                role: selectedValues.role,
                schema: selectedValues.schema,
            });
            expect(
                validationClient.useDiagnosticWarehouse,
            ).toHaveBeenCalledWith(expect.anything(), selectedValues.warehouse);
            expect(validationClient.useDiagnosticDatabase).toHaveBeenCalledWith(
                expect.anything(),
                selectedValues.database,
            );
            expect(find).not.toHaveBeenCalled();
            expect(updateWarehouseCredentials).not.toHaveBeenCalled();
        });

        it('validates stored PAT password credentials', async () => {
            const validationClient = createValidationClient();
            const patCredentials: CreateSnowflakeCredentials = {
                ...credentials,
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
                privateKey: undefined,
                password: 'pat-secret',
            };
            getWithSensitiveFields.mockResolvedValueOnce({
                projectUuid,
                organizationUuid,
                name: 'Onboarding project',
                type: ProjectType.DEFAULT,
                upstreamProjectUuid: undefined,
                createdByUserUuid: userUuid,
                warehouseConnection: patCredentials,
            } as Awaited<ReturnType<ProjectModel['getWithSensitiveFields']>>);
            getWarehouseCredentialsForUser.mockResolvedValueOnce({
                ...patCredentials,
                userWarehouseCredentialsUuid: undefined,
            });
            const snowflakeClientFactory = vi.fn(() => validationClient.client);

            await expect(
                getService({
                    warehouseDiagnosticsService:
                        new WarehouseDiagnosticsService(),
                    snowflakeClientFactory,
                }).validateConnection(account, projectUuid, connectionValues),
            ).resolves.toEqual(
                expect.objectContaining({
                    diagnostic: expect.objectContaining({ status: 'passed' }),
                }),
            );
            expect(snowflakeClientFactory).toHaveBeenCalledWith(
                expect.objectContaining({
                    authenticationType: SnowflakeAuthenticationType.PASSWORD,
                    password: 'pat-secret',
                }),
            );
        });

        it('skips selection checks when warehouse and database are absent', async () => {
            const validationClient = createValidationClient();

            const result = await getService({
                warehouseDiagnosticsService: new WarehouseDiagnosticsService(),
                snowflakeClientFactory: () => validationClient.client,
            }).validateConnection(account, projectUuid, {
                database: null,
                warehouse: null,
                role: null,
                schema: null,
            });

            expect(validationClient.events).toEqual([
                'open_connection',
                'authenticate',
                'close_connection',
                'discovery',
            ]);
            expect(result.schemas).toBeNull();
            expect(result.diagnostic.checks).toEqual([
                expect.objectContaining({
                    id: 'open_connection',
                    status: 'passed',
                }),
                expect.objectContaining({
                    id: 'authenticate',
                    status: 'passed',
                }),
                expect.objectContaining({
                    id: 'use_warehouse',
                    status: 'skipped',
                }),
                expect.objectContaining({
                    id: 'use_database',
                    status: 'skipped',
                }),
                expect.objectContaining({
                    id: 'list_schemas',
                    status: 'skipped',
                }),
            ]);
        });

        it('stops after the first failed check and returns a targeted remedy', async () => {
            const validationClient = createValidationClient();
            validationClient.useDiagnosticWarehouse.mockImplementationOnce(
                async () => {
                    validationClient.events.push('use_warehouse');
                    throw new Error('warehouse permission denied');
                },
            );

            const result = await getService({
                warehouseDiagnosticsService: new WarehouseDiagnosticsService(),
                snowflakeClientFactory: () => validationClient.client,
            }).validateConnection(account, projectUuid, {
                database: 'ANALYTICS',
                warehouse: 'SELECTED_WAREHOUSE',
                role: 'SELECTED_ROLE',
                schema: null,
            });

            expect(validationClient.events).toEqual([
                'open_connection',
                'authenticate',
                'use_warehouse',
                'close_connection',
                'discovery',
            ]);
            expect(result.diagnostic.status).toBe('failed');
            expect(result.diagnostic.checks[2]).toEqual(
                expect.objectContaining({
                    id: 'use_warehouse',
                    status: 'failed',
                    diagnosis: expect.objectContaining({
                        title: 'Cannot use the selected warehouse',
                        remedySql:
                            'GRANT USAGE ON WAREHOUSE "SELECTED_WAREHOUSE" TO ROLE "SELECTED_ROLE";',
                    }),
                }),
            );
            expect(result.diagnostic.checks[3]).toEqual(
                expect.objectContaining({ status: 'skipped' }),
            );
            expect(result.schemas).toBeNull();
        });

        it('returns null inventory when discovery fails', async () => {
            const validationClient = createValidationClient();
            validationClient.getSessionDiscovery.mockRejectedValueOnce(
                new Error('discovery failed'),
            );

            const result = await getService({
                warehouseDiagnosticsService: new WarehouseDiagnosticsService(),
                snowflakeClientFactory: () => validationClient.client,
            }).validateConnection(account, projectUuid, connectionValues);

            expect(result.diagnostic.status).toBe('passed');
            expect(result.schemas).toEqual(schemaSummaries);
            expect(result.inventory).toBeNull();
        });

        it('rejects validation without project management permission', async () => {
            const unauthorizedAccount = fromSession({
                ...defaultSessionUser,
                ability: new Ability<PossibleAbilities>([]),
            });

            await expect(
                getService().validateConnection(
                    unauthorizedAccount,
                    projectUuid,
                    connectionValues,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(getWithSensitiveFields).not.toHaveBeenCalled();
            expect(getWarehouseCredentialsForUser).not.toHaveBeenCalled();
        });
    });
});
