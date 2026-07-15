import {
    getErrorMessage,
    OnboardingStepStatus,
    SnowflakeAuthenticationType,
    WarehouseConnectionError,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type OnboardingConnectionDepositResult,
    type OnboardingConnectionInventory,
    type OnboardingConnectionKeyFingerprintResult,
    type OnboardingConnectionValues,
    type OnboardingConnectionValueSource,
    type OnboardingConnectionValueSources,
} from '@lightdash/common';
import {
    refreshSnowflakeOAuthToken,
    snowflakeIdentifier,
    SnowflakeWarehouseClient,
    type SnowflakeOAuthTokens,
    type SnowflakePublicKeySlot,
    type SnowflakeSessionDefaults,
    type SnowflakeSessionDiscovery,
} from '@lightdash/warehouses';
import fetch, { type Response } from 'node-fetch';
import { generateKeyPairSync } from 'node:crypto';
import * as styles from '../styles';

export type ConnectSnowflakeOptions = {
    code: string;
    url: string;
    account: string;
    database?: string;
    warehouse?: string;
    role?: string;
    schema?: string;
    user?: string;
    debugRefreshProbe?: boolean;
};

type SnowflakeOnboardingClient = Pick<
    SnowflakeWarehouseClient,
    | 'closeDiagnosticConnection'
    | 'createProgrammaticAccessToken'
    | 'getOAuthTokens'
    | 'getSessionDiscovery'
    | 'getUserPublicKeySlots'
    | 'openDiagnosticConnection'
    | 'selectOneDiagnosticConnection'
    | 'setUserPublicKey'
    | 'unsetUserPublicKey'
>;

type GeneratedKeyPair = {
    privateKey: string;
    publicKey: string;
};

type ConnectSnowflakeDependencies = {
    warehouseClientFactory: (
        credentials: CreateSnowflakeCredentials,
    ) => SnowflakeOnboardingClient;
    generateKeyPair: () => GeneratedKeyPair;
    sleep: (milliseconds: number) => Promise<void>;
    now: () => Date;
    fetch: typeof fetch;
    write: (message: string) => void;
};

type DepositResponse = {
    status: 'ok';
    results: OnboardingConnectionDepositResult;
};

type KeyFingerprintResponse = {
    status: 'ok';
    results: OnboardingConnectionKeyFingerprintResult;
};

const INVENTORY_LIMIT = 100;
const PAT_EXPIRY_DAYS = 365;
const KEY_VERIFICATION_ATTEMPTS = 3;
const KEY_VERIFICATION_RETRY_DELAY_MS = 5_000;

const generateSnowflakeKeyPair = (): GeneratedKeyPair => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'der' },
    });
    return {
        privateKey,
        publicKey: publicKey.toString('base64'),
    };
};

const defaultDependencies: ConnectSnowflakeDependencies = {
    warehouseClientFactory: (credentials) =>
        new SnowflakeWarehouseClient(credentials),
    generateKeyPair: generateSnowflakeKeyPair,
    sleep: (milliseconds) =>
        new Promise((resolve) => {
            setTimeout(resolve, milliseconds);
        }),
    now: () => new Date(),
    fetch,
    write: (message) => console.error(message),
};

const capInventory = (
    inventory: OnboardingConnectionInventory,
): OnboardingConnectionInventory => ({
    databases: inventory.databases.slice(0, INVENTORY_LIMIT),
    warehouses: inventory.warehouses.slice(0, INVENTORY_LIMIT),
    roles: inventory.roles.slice(0, INVENTORY_LIMIT),
});

const resolveConnectionValue = (
    flagValue: string | undefined,
    defaultValue: string | null,
): { value: string | null; source: OnboardingConnectionValueSource } => {
    if (flagValue !== undefined) {
        return { value: flagValue, source: 'flag' };
    }
    if (defaultValue !== null) {
        return { value: defaultValue, source: 'default' };
    }
    return { value: null, source: 'missing' };
};

const getConnectionValues = (
    options: ConnectSnowflakeOptions,
    defaults: SnowflakeSessionDefaults,
): {
    connectionValues: OnboardingConnectionValues;
    connectionValueSources: OnboardingConnectionValueSources;
} => {
    const database = resolveConnectionValue(
        options.database,
        defaults.database,
    );
    const warehouse = resolveConnectionValue(
        options.warehouse,
        defaults.warehouse,
    );
    const role = resolveConnectionValue(options.role, defaults.role);
    const schema = resolveConnectionValue(options.schema, defaults.schema);
    return {
        connectionValues: {
            database: database.value,
            warehouse: warehouse.value,
            role: role.value,
            schema: schema.value,
        },
        connectionValueSources: {
            database: database.source,
            warehouse: warehouse.source,
            role: role.source,
            schema: schema.source,
        },
    };
};

const parseDepositResponse = async (
    response: Response,
): Promise<DepositResponse> => {
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new WarehouseConnectionError(
            'Lightdash returned an invalid response while depositing the Snowflake credential',
        );
    }
    if (!response.ok) {
        if (response.status === 401) {
            throw new WarehouseConnectionError(
                'code expired — generate a new one in the Lightdash setup wizard',
            );
        }
        throw new WarehouseConnectionError(
            'Lightdash could not accept the Snowflake credential',
        );
    }
    if (
        typeof body !== 'object' ||
        body === null ||
        !('status' in body) ||
        body.status !== 'ok' ||
        !('results' in body)
    ) {
        throw new WarehouseConnectionError(
            'Lightdash returned an invalid response while depositing the Snowflake credential',
        );
    }
    return body as DepositResponse;
};

const getStoredKeyFingerprint = async (
    code: string,
    baseUrl: string,
    dependencies: ConnectSnowflakeDependencies,
): Promise<string | null> => {
    const url = new URL(
        '/api/v1/onboarding/connection/key-fingerprint',
        baseUrl,
    );
    const response = await dependencies.fetch(url.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    });
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new WarehouseConnectionError(
            'Lightdash returned an invalid key fingerprint response',
        );
    }
    if (
        !response.ok ||
        typeof body !== 'object' ||
        body === null ||
        !('status' in body) ||
        body.status !== 'ok' ||
        !('results' in body) ||
        typeof body.results !== 'object' ||
        body.results === null ||
        !('fingerprint' in body.results) ||
        (typeof body.results.fingerprint !== 'string' &&
            body.results.fingerprint !== null)
    ) {
        throw new WarehouseConnectionError(
            'Lightdash could not inspect the stored Snowflake key fingerprint',
        );
    }
    return (body as KeyFingerprintResponse).results.fingerprint;
};

const renderDiagnostics = (
    result: NonNullable<OnboardingConnectionDepositResult['diagnostic']>,
    write: (message: string) => void,
): void => {
    write('\nConnection diagnostics');
    result.checks.forEach((check) => {
        let marker = styles.secondary('○');
        if (check.status === 'passed') {
            marker = styles.success('✓');
        } else if (check.status === 'failed') {
            marker = styles.error('✗');
        }
        write(`${marker} ${check.label}`);
        if (check.status === 'failed' && check.diagnosis) {
            write(styles.error(`  ${check.diagnosis.title}`));
            write(`  ${check.diagnosis.detail}`);
        }
    });
};

// E4 diagnostic (hidden --debug-refresh-probe): before depositing, replay the
// backend's refresh request against the freshly-harvested token pair to prove
// whether the refresh token is already dead at the token endpoint (independent
// of any transfer/storage step). Prints outcome only — never token values.
const runRefreshProbe = async (
    account: string,
    tokens: SnowflakeOAuthTokens,
    write: (message: string) => void,
): Promise<void> => {
    write(
        '\n[debug-refresh-probe] Probe 1 — raw /oauth/token-request via refreshSnowflakeOAuthToken (identical to the backend refresh):',
    );
    try {
        // Called exactly as the backend does (default global fetch, account-only
        // host resolution) so the request is byte-for-byte the production path.
        await refreshSnowflakeOAuthToken({
            account,
            refreshToken: tokens.refreshToken,
        });
        write(
            '[debug-refresh-probe] Probe 1: SUCCESS — the newborn refresh token was accepted at the token endpoint. The deposited credential will still use the durable key-pair/PAT cascade.',
        );
        write(
            '[debug-refresh-probe] Probe 2 (SDK getAccessTokenUsingRefreshToken): SKIPPED — Probe 1 already succeeded, so the SDK path is moot.',
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        write(`[debug-refresh-probe] Probe 1: FAILED — ${message}`);
        write(
            '[debug-refresh-probe] Probe 2 (SDK getAccessTokenUsingRefreshToken): SKIPPED — reaching the SDK authenticator needs fragile internal plumbing, and research already confirmed the SDK sends the same client_id+secret+refresh_token body (no scope/redirect_uri/PKCE), so it is expected to fail identically.',
        );
    }
};

const isInsufficientPrivilegesError = (error: unknown): boolean => {
    const message = getErrorMessage(error).toLowerCase();
    return (
        message.includes('insufficient privilege') ||
        message.includes('not authorized') ||
        message.includes('not permitted') ||
        message.includes('modify programmatic authentication methods')
    );
};

const getAvailableKeySlot = (
    slots: Awaited<
        ReturnType<SnowflakeOnboardingClient['getUserPublicKeySlots']>
    >,
): SnowflakePublicKeySlot | null => {
    if (!slots.RSA_PUBLIC_KEY) {
        return 'RSA_PUBLIC_KEY';
    }
    if (!slots.RSA_PUBLIC_KEY_2) {
        return 'RSA_PUBLIC_KEY_2';
    }
    return null;
};

const selectKeySlot = async (
    slots: Awaited<
        ReturnType<SnowflakeOnboardingClient['getUserPublicKeySlots']>
    >,
    code: string,
    baseUrl: string,
    dependencies: ConnectSnowflakeDependencies,
): Promise<SnowflakePublicKeySlot | null> => {
    const occupiedSlots = (
        Object.entries(slots) as [SnowflakePublicKeySlot, string | null][]
    ).filter((entry): entry is [SnowflakePublicKeySlot, string] =>
        Boolean(entry[1]),
    );
    if (occupiedSlots.length === 0) {
        return getAvailableKeySlot(slots);
    }
    let fingerprint: string | null = null;
    try {
        fingerprint = await getStoredKeyFingerprint(
            code,
            baseUrl,
            dependencies,
        );
    } catch {
        return getAvailableKeySlot(slots);
    }
    const matchedSlot = occupiedSlots.find(
        ([, slotFingerprint]) => slotFingerprint === fingerprint,
    );
    return matchedSlot?.[0] ?? getAvailableKeySlot(slots);
};

const verifyKeyPair = async (
    credentials: CreateSnowflakeCredentials,
    dependencies: ConnectSnowflakeDependencies,
): Promise<void> => {
    const client = dependencies.warehouseClientFactory(credentials);
    const attemptConnection = async (attempt: number): Promise<void> => {
        let session: Awaited<
            ReturnType<SnowflakeOnboardingClient['openDiagnosticConnection']>
        > | null = null;
        try {
            session = await client.openDiagnosticConnection();
            await client.selectOneDiagnosticConnection(session);
            await client.closeDiagnosticConnection(session);
            return undefined;
        } catch (error) {
            if (session !== null) {
                await client
                    .closeDiagnosticConnection(session)
                    .catch(() => undefined);
            }
            if (attempt >= KEY_VERIFICATION_ATTEMPTS) {
                throw error;
            }
            await dependencies.sleep(KEY_VERIFICATION_RETRY_DELAY_MS);
            return attemptConnection(attempt + 1);
        }
    };
    await attemptConnection(1);
};

const writeTierCRemedies = (
    user: string,
    role: string | null,
    slot: SnowflakePublicKeySlot,
    publicKey: string,
    write: (message: string) => void,
): void => {
    const userIdentifier = snowflakeIdentifier(user);
    const roleIdentifier = snowflakeIdentifier(role ?? 'ACCOUNTADMIN');
    write(
        'Snowflake could not create a durable onboarding credential. Ask an administrator to use one of these remedies:',
    );
    write(
        `GRANT MODIFY PROGRAMMATIC AUTHENTICATION METHODS ON USER ${userIdentifier} TO ROLE ${roleIdentifier};`,
    );
    write(`ALTER USER ${userIdentifier} SET ${slot} = '${publicKey}';`);
    write(
        "ALTER AUTHENTICATION POLICY <policy_name> SET AUTHENTICATION_METHODS = ('OAUTH', 'PASSWORD', 'KEYPAIR', 'PROGRAMMATIC_ACCESS_TOKEN');",
    );
    write(
        'ALTER AUTHENTICATION POLICY <policy_name> SET PAT_POLICY = (MAX_EXPIRY_IN_DAYS = 365 NETWORK_POLICY_EVALUATION = ENFORCED_NOT_REQUIRED);',
    );
};

type DurableCredential = {
    warehouseConnection: CreateSnowflakeCredentials;
    successMessage: string;
};

const createDurableCredential = async (
    authorizationCodeCredentials: CreateSnowflakeCredentials,
    warehouseClient: SnowflakeOnboardingClient,
    discovery: SnowflakeSessionDiscovery,
    connectionValues: OnboardingConnectionValues,
    code: string,
    baseUrl: string,
    dependencies: ConnectSnowflakeDependencies,
): Promise<DurableCredential> => {
    const keyPair = dependencies.generateKeyPair();
    const slots = await warehouseClient.getUserPublicKeySlots(discovery.user);
    const slot = await selectKeySlot(slots, code, baseUrl, dependencies);
    if (slot === null) {
        dependencies.write(
            'Both Snowflake key slots are in use by other tools; using a programmatic access token instead.',
        );
    }

    let keyRegistered = false;
    if (slot !== null) {
        try {
            await warehouseClient.setUserPublicKey(
                discovery.user,
                slot,
                keyPair.publicKey,
            );
            keyRegistered = true;
        } catch (error) {
            if (!isInsufficientPrivilegesError(error)) {
                throw error;
            }
            dependencies.write(
                'Key-pair registration requires an administrator privilege; trying a self-service programmatic access token instead.',
            );
        }
    }

    const keyPairCredentials: CreateSnowflakeCredentials = {
        ...authorizationCodeCredentials,
        user: discovery.user,
        authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
        privateKey: keyPair.privateKey,
        database: connectionValues.database ?? '',
        warehouse: connectionValues.warehouse ?? '',
        schema: connectionValues.schema ?? '',
        role: connectionValues.role ?? undefined,
    };
    if (keyRegistered && slot !== null) {
        const verificationCredentials: CreateSnowflakeCredentials = {
            ...keyPairCredentials,
            database: '',
            warehouse: '',
            schema: '',
            role: undefined,
        };
        try {
            await verifyKeyPair(verificationCredentials, dependencies);
            return {
                warehouseConnection: keyPairCredentials,
                successMessage: 'Secured with a key pair',
            };
        } catch {
            dependencies.write(
                'Snowflake rejected key-pair authentication, likely because of the authentication policy. Removing the new key and trying a programmatic access token instead.',
            );
            await warehouseClient.unsetUserPublicKey(discovery.user, slot);
        }
    }

    try {
        const { tokenSecret } =
            await warehouseClient.createProgrammaticAccessToken(
                'LIGHTDASH_ONBOARDING',
                PAT_EXPIRY_DAYS,
            );
        const expiresAt = new Date(
            dependencies.now().getTime() +
                PAT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        );
        return {
            warehouseConnection: {
                ...authorizationCodeCredentials,
                user: discovery.user,
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
                password: tokenSecret,
                database: connectionValues.database ?? '',
                warehouse: connectionValues.warehouse ?? '',
                schema: connectionValues.schema ?? '',
                role: connectionValues.role ?? undefined,
            },
            successMessage: `Secured with a programmatic access token (expires ${expiresAt.toISOString().slice(0, 10)})`,
        };
    } catch (error) {
        writeTierCRemedies(
            discovery.user,
            discovery.defaults.role,
            slot ?? 'RSA_PUBLIC_KEY_2',
            keyPair.publicKey,
            dependencies.write,
        );
        throw new WarehouseConnectionError(
            `Snowflake programmatic access token creation failed: ${getErrorMessage(error)}`,
        );
    }
};

export const connectSnowflakeHandler = async (
    options: ConnectSnowflakeOptions,
    dependencies: ConnectSnowflakeDependencies = defaultDependencies,
): Promise<void> => {
    const authorizationCodeCredentials: CreateSnowflakeCredentials = {
        type: WarehouseTypes.SNOWFLAKE,
        account: options.account,
        user: options.user ?? '',
        authenticationType:
            SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
        role: options.role,
        database: options.database ?? '',
        warehouse: options.warehouse ?? '',
        schema: options.schema ?? '',
    };
    const warehouseClient = dependencies.warehouseClientFactory(
        authorizationCodeCredentials,
    );
    dependencies.write('Opening Snowflake sign-in in your browser…');
    const discovery: SnowflakeSessionDiscovery =
        await warehouseClient.getSessionDiscovery(options.user);
    if (options.debugRefreshProbe) {
        const harvestedTokens = warehouseClient.getOAuthTokens();
        if (harvestedTokens === null) {
            throw new WarehouseConnectionError(
                'Snowflake did not return the OAuth tokens required for the refresh probe',
            );
        }
        await runRefreshProbe(
            options.account,
            harvestedTokens,
            dependencies.write,
        );
    }
    const { connectionValues, connectionValueSources } = getConnectionValues(
        options,
        discovery.defaults,
    );
    const inventory = capInventory(discovery.inventory);
    const durableCredential = await createDurableCredential(
        authorizationCodeCredentials,
        warehouseClient,
        discovery,
        connectionValues,
        options.code,
        options.url,
        dependencies,
    );
    const depositUrl = new URL(
        '/api/v1/onboarding/connection/deposit',
        options.url,
    );
    const response = await dependencies.fetch(depositUrl.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code: options.code,
            warehouseConnection: durableCredential.warehouseConnection,
            connectionValues,
            connectionValueSources,
            inventory,
        }),
    });
    const deposit = await parseDepositResponse(response);
    dependencies.write(durableCredential.successMessage);
    if (
        deposit.results.stepStatus ===
        OnboardingStepStatus.PENDING_CONFIGURATION
    ) {
        dependencies.write(
            'Authenticated and connected! Finish choosing a database/warehouse in the Lightdash setup wizard.',
        );
        return;
    }
    if (deposit.results.diagnostic === null) {
        throw new WarehouseConnectionError(
            'Lightdash returned an invalid diagnostic response',
        );
    }
    renderDiagnostics(deposit.results.diagnostic, dependencies.write);
    if (deposit.results.diagnostic.status === 'failed') {
        throw new WarehouseConnectionError(
            'Snowflake connection diagnostics failed',
        );
    }
};

export const connectSnowflakeTestHelpers = {
    getConnectionValues,
    renderDiagnostics,
};
