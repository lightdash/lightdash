import {
    SnowflakeAuthenticationType,
    WarehouseConnectionError,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type DepositWarehouseConnectionRequest,
} from '@lightdash/common';
import {
    SnowflakeWarehouseClient,
    type SnowflakeSessionDiscovery,
} from '@lightdash/warehouses';
import inquirer from 'inquirer';
import fetch, { Response } from 'node-fetch';
import { categorizeError } from '../analytics/analytics';
import {
    connectSnowflakeHandler,
    type ConnectSnowflakeOptions,
} from './connectSnowflake';

vi.mock('../analytics/analytics');

vi.mock('inquirer', () => ({
    default: {
        prompt: vi.fn(),
    },
}));

const options: ConnectSnowflakeOptions = {
    code: '11111111_random-code',
    url: 'https://lightdash.example.com/setup',
    account: 'acme.eu-west-1',
    user: 'lightdash_user',
};

const discovery: SnowflakeSessionDiscovery = {
    user: 'lightdash_user',
    defaults: {
        database: 'analytics',
        warehouse: 'lightdash_wh',
        role: 'lightdash_role',
        schema: 'public',
    },
    inventory: {
        databases: [
            {
                name: 'analytics',
                comment: 'Analytics data',
                kind: 'STANDARD',
            },
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
    },
};

const privateKey =
    '-----BEGIN PRIVATE KEY-----\ntest-private-key\n-----END PRIVATE KEY-----\n';
const publicKey = 'dGVzdC1wdWJsaWMta2V5';

const getSessionDiscovery =
    vi.fn<SnowflakeWarehouseClient['getSessionDiscovery']>();
const getUserPublicKeySlots =
    vi.fn<SnowflakeWarehouseClient['getUserPublicKeySlots']>();
const setUserPublicKey = vi.fn<SnowflakeWarehouseClient['setUserPublicKey']>();
const unsetUserPublicKey =
    vi.fn<SnowflakeWarehouseClient['unsetUserPublicKey']>();
const createProgrammaticAccessToken =
    vi.fn<SnowflakeWarehouseClient['createProgrammaticAccessToken']>();
const openDiagnosticConnection =
    vi.fn<SnowflakeWarehouseClient['openDiagnosticConnection']>();
const selectOneDiagnosticConnection =
    vi.fn<SnowflakeWarehouseClient['selectOneDiagnosticConnection']>();
const closeDiagnosticConnection =
    vi.fn<SnowflakeWarehouseClient['closeDiagnosticConnection']>();

const warehouseClientFactory = vi.fn(() => ({
    closeDiagnosticConnection,
    createProgrammaticAccessToken,
    getSessionDiscovery,
    getUserPublicKeySlots,
    openDiagnosticConnection,
    selectOneDiagnosticConnection,
    setUserPublicKey,
    unsetUserPublicKey,
}));
const fetchMock = vi.fn<typeof fetch>();
const write = vi.fn<(message: string) => void>();
const sleep = vi.fn(async () => undefined);
const isTTY = vi.fn(() => false);

const responseForDeposit = (): Response =>
    new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });

const getDependencies = () => ({
    warehouseClientFactory,
    generateKeyPair: () => ({ privateKey, publicKey }),
    sleep,
    now: () => new Date('2026-07-14T12:00:00.000Z'),
    fetch: fetchMock,
    write,
    isTTY,
});

const privateKeyCredentials = (
    values: Partial<CreateSnowflakeCredentials> = {},
): CreateSnowflakeCredentials => ({
    type: WarehouseTypes.SNOWFLAKE,
    account: options.account,
    user: discovery.user,
    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
    role: discovery.defaults.role ?? undefined,
    database: discovery.defaults.database ?? '',
    warehouse: discovery.defaults.warehouse ?? '',
    schema: discovery.defaults.schema ?? '',
    privateKey,
    ...values,
});

describe('connectSnowflakeHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(categorizeError).mockReturnValue('warehouse_connection');
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
        vi.mocked(fetchMock).mockResolvedValue(responseForDeposit());
        vi.mocked(isTTY).mockReturnValue(false);
    });

    it('deposits private-key credentials using session defaults', async () => {
        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(warehouseClientFactory).toHaveBeenNthCalledWith(1, {
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
        expect(setUserPublicKey).toHaveBeenCalledWith(
            discovery.user,
            'RSA_PUBLIC_KEY',
            publicKey,
        );
        const request: DepositWarehouseConnectionRequest = {
            code: options.code,
            credentials: privateKeyCredentials(),
        };
        expect(fetchMock).toHaveBeenCalledWith(
            'https://lightdash.example.com/api/v1/warehouse-connect/deposit',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
            },
        );
        expect(write).toHaveBeenCalledWith('Secured with a key pair');
        expect(write).not.toHaveBeenCalledWith(
            expect.stringContaining(options.code),
        );
        expect(write).not.toHaveBeenCalledWith(
            expect.stringContaining(privateKey),
        );
        const { LightdashAnalytics } = await import('../analytics/analytics');
        expect(vi.mocked(LightdashAnalytics.track)).toHaveBeenCalledWith({
            event: 'connect_snowflake.started',
            properties: {},
        });
        expect(vi.mocked(LightdashAnalytics.track)).toHaveBeenCalledWith({
            event: 'connect_snowflake.completed',
            properties: { method: 'key_pair' },
        });
    });

    it('prefers explicit flags over session defaults', async () => {
        const overrideOptions: ConnectSnowflakeOptions = {
            ...options,
            database: 'flag_db',
            warehouse: 'flag_wh',
            role: 'flag_role',
            schema: 'flag_schema',
        };

        await expect(
            connectSnowflakeHandler(overrideOptions, getDependencies()),
        ).resolves.toBeUndefined();

        const request: DepositWarehouseConnectionRequest = {
            code: options.code,
            credentials: privateKeyCredentials({
                database: 'flag_db',
                warehouse: 'flag_wh',
                role: 'flag_role',
                schema: 'flag_schema',
            }),
        };
        expect(fetchMock).toHaveBeenCalledWith(
            'https://lightdash.example.com/api/v1/warehouse-connect/deposit',
            expect.objectContaining({ body: JSON.stringify(request) }),
        );
    });

    it('prompts for missing values in an interactive terminal', async () => {
        vi.mocked(getSessionDiscovery).mockResolvedValue({
            ...discovery,
            defaults: {
                ...discovery.defaults,
                database: null,
                warehouse: null,
                schema: null,
            },
        });
        vi.mocked(isTTY).mockReturnValue(true);
        vi.mocked(inquirer.prompt).mockResolvedValue({
            database: 'prompt_db',
            warehouse: 'prompt_wh',
            schema: 'prompt_schema',
        });

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(inquirer.prompt).toHaveBeenCalledWith([
            expect.objectContaining({
                type: 'list',
                name: 'database',
                choices: ['analytics'],
            }),
            expect.objectContaining({
                type: 'list',
                name: 'warehouse',
                choices: ['lightdash_wh'],
            }),
            expect.objectContaining({ type: 'input', name: 'schema' }),
        ]);
        const request: DepositWarehouseConnectionRequest = {
            code: options.code,
            credentials: privateKeyCredentials({
                database: 'prompt_db',
                warehouse: 'prompt_wh',
                schema: 'prompt_schema',
            }),
        };
        expect(fetchMock).toHaveBeenCalledWith(
            'https://lightdash.example.com/api/v1/warehouse-connect/deposit',
            expect.objectContaining({ body: JSON.stringify(request) }),
        );
    });

    it('reports required flags when values are missing in a non-TTY terminal', async () => {
        vi.mocked(getSessionDiscovery).mockResolvedValue({
            ...discovery,
            defaults: {
                ...discovery.defaults,
                database: null,
                warehouse: null,
                schema: null,
            },
        });

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).rejects.toThrow(
            'Pass --database, --warehouse, --schema when running in a non-interactive terminal.',
        );
        expect(inquirer.prompt).not.toHaveBeenCalled();
        expect(getUserPublicKeySlots).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('selects the first free Snowflake public-key slot', async () => {
        vi.mocked(getUserPublicKeySlots).mockResolvedValue({
            RSA_PUBLIC_KEY: 'SHA256:existing-key',
            RSA_PUBLIC_KEY_2: null,
        });

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(setUserPublicKey).toHaveBeenCalledWith(
            discovery.user,
            'RSA_PUBLIC_KEY_2',
            publicKey,
        );
        expect(createProgrammaticAccessToken).not.toHaveBeenCalled();
    });

    it('uses the stable PAT name for collision replacement when both key slots are occupied', async () => {
        vi.mocked(getUserPublicKeySlots).mockResolvedValue({
            RSA_PUBLIC_KEY: 'SHA256:existing-key-1',
            RSA_PUBLIC_KEY_2: 'SHA256:existing-key-2',
        });

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(setUserPublicKey).not.toHaveBeenCalled();
        expect(createProgrammaticAccessToken).toHaveBeenCalledWith(
            'LIGHTDASH_ONBOARDING',
            365,
            1440,
        );
        const request: DepositWarehouseConnectionRequest = {
            code: options.code,
            credentials: {
                type: WarehouseTypes.SNOWFLAKE,
                account: options.account,
                user: discovery.user,
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
                role: discovery.defaults.role ?? undefined,
                database: discovery.defaults.database ?? '',
                warehouse: discovery.defaults.warehouse ?? '',
                schema: discovery.defaults.schema ?? '',
                password: 'pat-secret',
            },
        };
        expect(fetchMock).toHaveBeenCalledWith(
            'https://lightdash.example.com/api/v1/warehouse-connect/deposit',
            expect.objectContaining({ body: JSON.stringify(request) }),
        );
    });

    it('unsets an unverified key before falling back to a PAT', async () => {
        vi.mocked(openDiagnosticConnection).mockRejectedValue(
            new Error('Authentication policy excludes KEYPAIR'),
        );

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(openDiagnosticConnection).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(5_000);
        expect(unsetUserPublicKey).toHaveBeenCalledWith(
            discovery.user,
            'RSA_PUBLIC_KEY',
        );
        expect(createProgrammaticAccessToken).toHaveBeenCalledAfter(
            unsetUserPublicKey,
        );
    });

    it('falls back to a PAT when key registration lacks privileges', async () => {
        vi.mocked(setUserPublicKey).mockRejectedValue(
            new Error('Insufficient privileges to operate on user'),
        );

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).resolves.toBeUndefined();

        expect(createProgrammaticAccessToken).toHaveBeenCalledWith(
            'LIGHTDASH_ONBOARDING',
            365,
            1440,
        );
        expect(write).toHaveBeenCalledWith(
            'Secured with a programmatic access token (expires 2027-07-14)',
        );
    });

    it('prints administrator remediation when both durable paths fail', async () => {
        vi.mocked(setUserPublicKey).mockRejectedValue(
            new Error('Insufficient privileges'),
        );
        vi.mocked(createProgrammaticAccessToken).mockRejectedValue(
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

    it('reports an expired connect code without exposing it', async () => {
        vi.mocked(fetchMock).mockResolvedValue(
            new Response(JSON.stringify({ status: 'error' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        await expect(
            connectSnowflakeHandler(options, getDependencies()),
        ).rejects.toThrow(WarehouseConnectionError);
        expect(write).not.toHaveBeenCalledWith(
            expect.stringContaining(options.code),
        );
        const { LightdashAnalytics } = await import('../analytics/analytics');
        expect(vi.mocked(LightdashAnalytics.track)).toHaveBeenCalledWith({
            event: 'connect_snowflake.error',
            properties: {
                error: expect.any(String),
                errorCategory: 'warehouse_connection',
            },
        });
    });
});
