import {
    OnboardingStepStatus,
    SnowflakeAuthenticationType,
    WarehouseConnectionError,
    WarehouseTypes,
    type ConnectionDiagnosticResult,
    type CreateSnowflakeCredentials,
    type OnboardingConnectionDepositResult,
    type OnboardingConnectionInventory,
    type OnboardingConnectionValues,
} from '@lightdash/common';
import type {
    SnowflakePublicKeySlots,
    SnowflakeSessionDiscovery,
} from '@lightdash/warehouses';
import fetch, { Response } from 'node-fetch';
import {
    connectSnowflakeHandler,
    type ConnectSnowflakeOptions,
} from './connectSnowflake';

const options: ConnectSnowflakeOptions = {
    code: '11111111_random-code',
    url: 'https://lightdash.example.com/setup',
    account: 'acme.eu-west-1',
    user: 'lightdash_user',
};

const connectionValues: OnboardingConnectionValues = {
    database: 'analytics',
    warehouse: 'lightdash_wh',
    role: 'lightdash_role',
    schema: 'public',
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

const discovery: SnowflakeSessionDiscovery = {
    user: 'lightdash_user',
    defaults: connectionValues,
    inventory,
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

const completedDepositResult: OnboardingConnectionDepositResult = {
    stepStatus: OnboardingStepStatus.COMPLETED,
    connectionValues,
    connectionValueSources,
    inventory,
    missingConnectionValues: [],
    diagnostic: passedDiagnostic,
};

const responseFor = (results: OnboardingConnectionDepositResult): Response =>
    new Response(JSON.stringify({ status: 'ok', results }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });

const fingerprintResponseFor = (fingerprint: string | null): Response =>
    new Response(JSON.stringify({ status: 'ok', results: { fingerprint } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });

const oauthTokens = {
    accessToken: 'oauth-access-token',
    refreshToken: 'oauth-refresh-token',
    expiresAt: new Date('2026-07-14T13:00:00.000Z'),
};
const privateKey =
    '-----BEGIN PRIVATE KEY-----\ntest-private-key\n-----END PRIVATE KEY-----\n';
const publicKey = 'dGVzdC1wdWJsaWMta2V5';
const storedFingerprint = 'SHA256:stored-key-fingerprint';
const getOAuthTokens = vi.fn<() => typeof oauthTokens | null>(
    () => oauthTokens,
);
const getSessionDiscovery = vi.fn(async () => discovery);
const getUserPublicKeySlots = vi.fn<() => Promise<SnowflakePublicKeySlots>>(
    async () => ({
        RSA_PUBLIC_KEY: null,
        RSA_PUBLIC_KEY_2: null,
    }),
);
const setUserPublicKey = vi.fn(async () => undefined);
const unsetUserPublicKey = vi.fn(async () => undefined);
const createProgrammaticAccessToken = vi.fn(async () => ({
    tokenName: 'LIGHTDASH_ONBOARDING',
    tokenSecret: 'pat-secret',
}));
const openDiagnosticConnection = vi.fn(async () => ({
    connection: {} as never,
}));
const selectOneDiagnosticConnection = vi.fn(async () => undefined);
const closeDiagnosticConnection = vi.fn(async () => undefined);
const warehouseClientFactory = vi.fn<
    (credentials: CreateSnowflakeCredentials) => {
        closeDiagnosticConnection: typeof closeDiagnosticConnection;
        createProgrammaticAccessToken: typeof createProgrammaticAccessToken;
        getOAuthTokens: typeof getOAuthTokens;
        getSessionDiscovery: typeof getSessionDiscovery;
        getUserPublicKeySlots: typeof getUserPublicKeySlots;
        openDiagnosticConnection: typeof openDiagnosticConnection;
        selectOneDiagnosticConnection: typeof selectOneDiagnosticConnection;
        setUserPublicKey: typeof setUserPublicKey;
        unsetUserPublicKey: typeof unsetUserPublicKey;
    }
>(() => ({
    closeDiagnosticConnection,
    createProgrammaticAccessToken,
    getOAuthTokens,
    getSessionDiscovery,
    getUserPublicKeySlots,
    openDiagnosticConnection,
    selectOneDiagnosticConnection,
    setUserPublicKey,
    unsetUserPublicKey,
}));
const fetchMock = vi.fn<typeof fetch>();
const write = vi.fn<(message: string) => void>();

const getDependencies = () => ({
    warehouseClientFactory,
    generateKeyPair: () => ({ privateKey, publicKey }),
    sleep: vi.fn(async () => undefined),
    now: () => new Date('2026-07-14T12:00:00.000Z'),
    fetch: fetchMock,
    write,
});

describe('connectSnowflakeHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getOAuthTokens).mockReturnValue(oauthTokens);
        vi.mocked(getSessionDiscovery).mockResolvedValue(discovery);
        vi.mocked(getUserPublicKeySlots).mockResolvedValue({
            RSA_PUBLIC_KEY: null,
            RSA_PUBLIC_KEY_2: null,
        });
        vi.mocked(setUserPublicKey).mockResolvedValue(undefined);
        vi.mocked(unsetUserPublicKey).mockResolvedValue(undefined);
        vi.mocked(createProgrammaticAccessToken).mockResolvedValue({
            tokenName: 'LIGHTDASH_ONBOARDING',
            tokenSecret: 'pat-secret',
        });
        vi.mocked(openDiagnosticConnection).mockResolvedValue({
            connection: {} as never,
        });
        vi.mocked(selectOneDiagnosticConnection).mockResolvedValue(undefined);
        vi.mocked(closeDiagnosticConnection).mockResolvedValue(undefined);
    });

    it('uses session defaults when optional connection flags are omitted', async () => {
        fetchMock.mockImplementationOnce(async (_url, init) => {
            expect(init?.body).toEqual(
                JSON.stringify({
                    code: options.code,
                    warehouseConnection: {
                        type: WarehouseTypes.SNOWFLAKE,
                        account: options.account,
                        user: options.user,
                        authenticationType:
                            SnowflakeAuthenticationType.PRIVATE_KEY,
                        role: connectionValues.role,
                        database: connectionValues.database,
                        warehouse: connectionValues.warehouse,
                        schema: connectionValues.schema,
                        privateKey,
                    },
                    connectionValues,
                    connectionValueSources,
                    inventory,
                }),
            );
            return responseFor(completedDepositResult);
        });

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();
        expect(warehouseClientFactory).toHaveBeenCalledWith({
            type: WarehouseTypes.SNOWFLAKE,
            account: options.account,
            user: options.user,
            authenticationType:
                SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
            role: undefined,
            database: '',
            warehouse: '',
            schema: '',
        });
        expect(getSessionDiscovery).toHaveBeenCalledWith(options.user);
        expect(getOAuthTokens).not.toHaveBeenCalled();
        expect(setUserPublicKey).toHaveBeenCalledWith(
            discovery.user,
            'RSA_PUBLIC_KEY',
            publicKey,
        );
        expect(fetchMock).toHaveBeenCalledWith(
            'https://lightdash.example.com/api/v1/onboarding/connection/deposit',
            expect.objectContaining({
                method: 'POST',
            }),
        );
        expect(write).toHaveBeenCalledWith(expect.stringContaining('✓'));
        expect(write).not.toHaveBeenCalledWith(
            expect.stringContaining(oauthTokens.accessToken),
        );
        expect(write).not.toHaveBeenCalledWith(
            expect.stringContaining(oauthTokens.refreshToken),
        );
    });

    it('prefers explicit connection flags over session defaults', async () => {
        const overrideOptions: ConnectSnowflakeOptions = {
            ...options,
            database: 'flag_db',
            warehouse: 'flag_wh',
            role: 'flag_role',
            schema: 'flag_schema',
        };
        fetchMock.mockImplementationOnce(async (_url, init) => {
            expect(init?.body).toEqual(
                JSON.stringify({
                    code: options.code,
                    warehouseConnection: {
                        type: WarehouseTypes.SNOWFLAKE,
                        account: options.account,
                        user: options.user,
                        authenticationType:
                            SnowflakeAuthenticationType.PRIVATE_KEY,
                        role: 'flag_role',
                        database: 'flag_db',
                        warehouse: 'flag_wh',
                        schema: 'flag_schema',
                        privateKey,
                    },
                    connectionValues: {
                        database: 'flag_db',
                        warehouse: 'flag_wh',
                        role: 'flag_role',
                        schema: 'flag_schema',
                    },
                    connectionValueSources: {
                        database: 'flag',
                        warehouse: 'flag',
                        role: 'flag',
                        schema: 'flag',
                    },
                    inventory,
                }),
            );
            return responseFor({
                ...completedDepositResult,
                connectionValues: {
                    database: 'flag_db',
                    warehouse: 'flag_wh',
                    role: 'flag_role',
                    schema: 'flag_schema',
                },
                connectionValueSources: {
                    database: 'flag',
                    warehouse: 'flag',
                    role: 'flag',
                    schema: 'flag',
                },
            });
        });

        await expect(
            connectSnowflakeHandler(overrideOptions, getDependencies()),
        ).resolves.toBeUndefined();
    });

    it('prints the wizard handoff message for pending configuration', async () => {
        const pendingValues = {
            ...connectionValues,
            warehouse: null,
        };
        getSessionDiscovery.mockResolvedValueOnce({
            user: 'lightdash_user',
            defaults: pendingValues,
            inventory,
        });
        fetchMock.mockImplementationOnce(async (_url, init) => {
            expect(init?.body).toEqual(
                JSON.stringify({
                    code: options.code,
                    warehouseConnection: {
                        type: WarehouseTypes.SNOWFLAKE,
                        account: options.account,
                        user: options.user,
                        authenticationType:
                            SnowflakeAuthenticationType.PRIVATE_KEY,
                        role: connectionValues.role,
                        database: connectionValues.database,
                        warehouse: '',
                        schema: connectionValues.schema,
                        privateKey,
                    },
                    connectionValues: pendingValues,
                    connectionValueSources: {
                        ...connectionValueSources,
                        warehouse: 'missing',
                    },
                    inventory,
                }),
            );
            return responseFor({
                stepStatus: OnboardingStepStatus.PENDING_CONFIGURATION,
                connectionValues: pendingValues,
                connectionValueSources: {
                    ...connectionValueSources,
                    warehouse: 'missing',
                },
                inventory,
                missingConnectionValues: ['warehouse'],
                diagnostic: null,
            });
        });

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();
        expect(write).toHaveBeenCalledWith(
            'Authenticated and connected! Finish choosing a database/warehouse in the Lightdash setup wizard.',
        );
        expect(write).not.toHaveBeenCalledWith(
            expect.stringContaining('Connection diagnostics'),
        );
    });

    it('caps deposited rich inventory lists at 100 entries', async () => {
        const manyDatabases = Array.from({ length: 125 }, (_, index) => ({
            name: `database_${index}`,
            comment: index === 99 ? 'last included database' : null,
            kind: 'STANDARD',
        }));
        const manyWarehouses = Array.from({ length: 110 }, (_, index) => ({
            name: `warehouse_${index}`,
            size: 'X-Small',
            state: 'SUSPENDED',
            autoSuspendSeconds: 60,
        }));
        const manyRoles = Array.from({ length: 101 }, (_, index) => ({
            name: `role_${index}`,
            isDefault: index === 0,
        }));
        getSessionDiscovery.mockResolvedValueOnce({
            user: options.user!,
            defaults: connectionValues,
            inventory: {
                databases: manyDatabases,
                warehouses: manyWarehouses,
                roles: manyRoles,
            },
        });
        fetchMock.mockImplementationOnce(async (_url, init) => {
            const body = JSON.parse(String(init?.body)) as {
                inventory: {
                    databases: typeof manyDatabases;
                    warehouses: typeof manyWarehouses;
                    roles: typeof manyRoles;
                };
            };
            expect(body.inventory.databases).toHaveLength(100);
            expect(body.inventory.warehouses).toHaveLength(100);
            expect(body.inventory.roles).toHaveLength(100);
            expect(body.inventory.databases[99]).toEqual({
                name: 'database_99',
                comment: 'last included database',
                kind: 'STANDARD',
            });
            return responseFor(completedDepositResult);
        });

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();
    });

    it('renders failed diagnostics and rejects the command', async () => {
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
                        detail: 'The OAuth token was rejected.',
                        remedySql: null,
                        docsUrl: null,
                    },
                },
            ],
        };
        fetchMock.mockResolvedValueOnce(
            responseFor({
                ...completedDepositResult,
                stepStatus: OnboardingStepStatus.ERROR,
                diagnostic: failedDiagnostic,
            }),
        );

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).rejects.toThrow(WarehouseConnectionError);
        expect(write).toHaveBeenCalledWith(
            expect.stringContaining('Authentication failed'),
        );
        expect(write).toHaveBeenCalledWith(
            expect.stringContaining('The OAuth token was rejected.'),
        );
    });

    it('rejects the refresh probe when the SDK does not expose granted tokens', async () => {
        vi.mocked(getOAuthTokens).mockReturnValueOnce(null);

        await expect(
            connectSnowflakeHandler(
                { ...options, debugRefreshProbe: true },
                getDependencies(),
            ),
        ).rejects.toThrow(
            'Snowflake did not return the OAuth tokens required for the refresh probe',
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('shows the setup-wizard message when the code is expired or used', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    status: 'error',
                    error: { name: 'AuthorizationError' },
                }),
                {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                },
            ),
        );

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).rejects.toThrow(
            'code expired — generate a new one in the Lightdash setup wizard',
        );
    });

    it('falls back to a PAT when key registration lacks privileges', async () => {
        vi.mocked(setUserPublicKey).mockRejectedValueOnce(
            new Error('Insufficient privileges to operate on user'),
        );
        fetchMock.mockImplementationOnce(async (_url, init) => {
            const body = JSON.parse(String(init?.body)) as {
                warehouseConnection: CreateSnowflakeCredentials;
            };
            expect(body.warehouseConnection).toEqual(
                expect.objectContaining({
                    authenticationType: SnowflakeAuthenticationType.PASSWORD,
                    password: 'pat-secret',
                    user: discovery.user,
                }),
            );
            expect(body.warehouseConnection).not.toHaveProperty('privateKey');
            expect(body.warehouseConnection).not.toHaveProperty('token');
            expect(body.warehouseConnection).not.toHaveProperty('refreshToken');
            return responseFor(completedDepositResult);
        });

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(createProgrammaticAccessToken).toHaveBeenCalledWith(
            'LIGHTDASH_ONBOARDING',
            365,
        );
        expect(write).toHaveBeenCalledWith(
            'Secured with a programmatic access token (expires 2027-07-14)',
        );
    });

    it('unsets an unverified key before falling back to a PAT', async () => {
        vi.mocked(openDiagnosticConnection).mockRejectedValue(
            new Error('Authentication policy excludes KEYPAIR'),
        );
        fetchMock.mockResolvedValueOnce(responseFor(completedDepositResult));

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(openDiagnosticConnection).toHaveBeenCalledTimes(3);
        expect(unsetUserPublicKey).toHaveBeenCalledWith(
            discovery.user,
            'RSA_PUBLIC_KEY',
        );
        expect(createProgrammaticAccessToken).toHaveBeenCalledAfter(
            unsetUserPublicKey,
        );
    });

    it('prints Tier C admin SQL when PAT policy blocks the fallback', async () => {
        vi.mocked(setUserPublicKey).mockRejectedValueOnce(
            new Error('Insufficient privileges'),
        );
        vi.mocked(createProgrammaticAccessToken).mockRejectedValueOnce(
            new Error(
                'Authentication policy does not allow PROGRAMMATIC_ACCESS_TOKEN',
            ),
        );

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).rejects.toThrow(
            'Snowflake programmatic access token creation failed',
        );

        expect(write).toHaveBeenCalledWith(
            'GRANT MODIFY PROGRAMMATIC AUTHENTICATION METHODS ON USER lightdash_user TO ROLE lightdash_role;',
        );
        expect(write).toHaveBeenCalledWith(
            expect.stringContaining('PROGRAMMATIC_ACCESS_TOKEN'),
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rotates the matching slot when both Snowflake key slots are occupied', async () => {
        vi.mocked(getUserPublicKeySlots).mockResolvedValueOnce({
            RSA_PUBLIC_KEY: 'SHA256:other-key',
            RSA_PUBLIC_KEY_2: storedFingerprint,
        });
        fetchMock
            .mockResolvedValueOnce(fingerprintResponseFor(storedFingerprint))
            .mockResolvedValueOnce(responseFor(completedDepositResult));

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://lightdash.example.com/api/v1/onboarding/connection/key-fingerprint',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ code: options.code }),
            }),
        );
        expect(setUserPublicKey).toHaveBeenCalledWith(
            discovery.user,
            'RSA_PUBLIC_KEY_2',
            publicKey,
        );
        expect(createProgrammaticAccessToken).not.toHaveBeenCalled();
    });

    it('uses a PAT when both occupied key slots belong to other tools', async () => {
        vi.mocked(getUserPublicKeySlots).mockResolvedValueOnce({
            RSA_PUBLIC_KEY: 'SHA256:other-key-1',
            RSA_PUBLIC_KEY_2: 'SHA256:other-key-2',
        });
        fetchMock
            .mockResolvedValueOnce(fingerprintResponseFor(storedFingerprint))
            .mockResolvedValueOnce(responseFor(completedDepositResult));

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(setUserPublicKey).not.toHaveBeenCalled();
        expect(createProgrammaticAccessToken).toHaveBeenCalledWith(
            'LIGHTDASH_ONBOARDING',
            365,
        );
        expect(write).toHaveBeenCalledWith(
            'Both Snowflake key slots are in use by other tools; using a programmatic access token instead.',
        );
    });

    it('rotates the occupied slot when its fingerprint matches', async () => {
        vi.mocked(getUserPublicKeySlots).mockResolvedValueOnce({
            RSA_PUBLIC_KEY: storedFingerprint,
            RSA_PUBLIC_KEY_2: null,
        });
        fetchMock
            .mockResolvedValueOnce(fingerprintResponseFor(storedFingerprint))
            .mockResolvedValueOnce(responseFor(completedDepositResult));

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(setUserPublicKey).toHaveBeenCalledWith(
            discovery.user,
            'RSA_PUBLIC_KEY',
            publicKey,
        );
    });

    it('uses the empty slot when the occupied fingerprint does not match', async () => {
        vi.mocked(getUserPublicKeySlots).mockResolvedValueOnce({
            RSA_PUBLIC_KEY: 'SHA256:other-key',
            RSA_PUBLIC_KEY_2: null,
        });
        fetchMock
            .mockResolvedValueOnce(fingerprintResponseFor(storedFingerprint))
            .mockResolvedValueOnce(responseFor(completedDepositResult));

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(setUserPublicKey).toHaveBeenCalledWith(
            discovery.user,
            'RSA_PUBLIC_KEY_2',
            publicKey,
        );
    });

    it('falls back to a PAT when the fingerprint endpoint fails with both slots occupied', async () => {
        vi.mocked(getUserPublicKeySlots).mockResolvedValueOnce({
            RSA_PUBLIC_KEY: 'SHA256:other-key-1',
            RSA_PUBLIC_KEY_2: 'SHA256:other-key-2',
        });
        fetchMock
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ status: 'error' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                }),
            )
            .mockResolvedValueOnce(responseFor(completedDepositResult));

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(setUserPublicKey).not.toHaveBeenCalled();
        expect(createProgrammaticAccessToken).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
