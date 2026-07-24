import {
    getErrorMessage,
    SnowflakeAuthenticationType,
    WarehouseConnectionError,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type DepositSnowflakeCredentials,
    type DepositWarehouseConnectionRequest,
    type WarehouseConnectInventory,
} from '@lightdash/common';
import {
    snowflakeIdentifier,
    SnowflakeWarehouseClient,
    type SnowflakePublicKeySlot,
    type SnowflakeSessionDiscovery,
} from '@lightdash/warehouses';
import fetch, { type Response } from 'node-fetch';
import { generateKeyPairSync } from 'node:crypto';
import { categorizeError, LightdashAnalytics } from '../analytics/analytics';

export type ConnectSnowflakeOptions = {
    code: string;
    url: string;
    account: string;
    database?: string;
    warehouse?: string;
    role?: string;
    schema?: string;
    user?: string;
};

type SnowflakeOnboardingClient = Pick<
    SnowflakeWarehouseClient,
    | 'closeDiagnosticConnection'
    | 'createProgrammaticAccessToken'
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

type ConnectionValueName = 'database' | 'warehouse' | 'schema' | 'role';

type ConnectionValues = {
    database?: string;
    warehouse?: string;
    role?: string;
    schema?: string;
};

type ResolvedConnectionValues = {
    values: ConnectionValues;
    sources: Partial<Record<ConnectionValueName, 'flag' | 'session default'>>;
};

const PAT_EXPIRY_DAYS = 365;
const PAT_NETWORK_POLICY_BYPASS_MINUTES = 60;
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

const parseDepositResponse = async (response: Response): Promise<void> => {
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new WarehouseConnectionError(
            'Lightdash returned an invalid response while depositing the Snowflake credential',
        );
    }
    if (!response.ok) {
        if (response.status === 401 || response.status === 404) {
            throw new WarehouseConnectionError(
                'code expired — generate a new one in the Lightdash setup wizard',
            );
        }
        const serverMessage =
            typeof body === 'object' &&
            body !== null &&
            'error' in body &&
            typeof body.error === 'object' &&
            body.error !== null &&
            'message' in body.error &&
            typeof body.error.message === 'string'
                ? ` (${response.status}: ${body.error.message})`
                : ` (${response.status})`;
        throw new WarehouseConnectionError(
            `Lightdash could not accept the Snowflake credential${serverMessage}`,
        );
    }
    if (
        typeof body !== 'object' ||
        body === null ||
        !('status' in body) ||
        body.status !== 'ok'
    ) {
        throw new WarehouseConnectionError(
            'Lightdash returned an invalid response while depositing the Snowflake credential',
        );
    }
};

const resolveValue = (
    flagValue: string | undefined,
    defaultValue: string | null,
): string | undefined => {
    const value = flagValue ?? defaultValue ?? undefined;
    return value?.trim() ? value : undefined;
};

const resolveConnectionValues = (
    options: ConnectSnowflakeOptions,
    discovery: SnowflakeSessionDiscovery,
): ResolvedConnectionValues => {
    const values: ConnectionValues = {
        database: resolveValue(options.database, discovery.defaults.database),
        warehouse: resolveValue(
            options.warehouse,
            discovery.defaults.warehouse,
        ),
        schema: resolveValue(options.schema, discovery.defaults.schema),
        role: resolveValue(options.role, discovery.defaults.role),
    };
    const sources: ResolvedConnectionValues['sources'] = {};
    (Object.keys(values) as ConnectionValueName[]).forEach((name) => {
        if (values[name] !== undefined) {
            sources[name] =
                options[name] !== undefined ? 'flag' : 'session default';
        }
    });
    return {
        values,
        sources,
    };
};

const buildInventory = (
    discovery: SnowflakeSessionDiscovery,
): WarehouseConnectInventory | null => {
    if (!discovery.inventory) {
        return null;
    }
    return {
        databases: discovery.inventory.databases
            .map(({ name, comment, sizeBytes }) => ({
                name,
                comment,
                sizeBytes,
            }))
            .slice(0, 100),
        warehouses: discovery.inventory.warehouses
            .map(({ name, size, state }) => ({ name, size, state }))
            .slice(0, 100),
        roles: discovery.inventory.roles
            .map(({ name, isDefault }) => ({ name, isDefault }))
            .slice(0, 100),
        schemas: discovery.inventory.schemas
            .map(({ databaseName, name }) => ({ database: databaseName, name }))
            .slice(0, 1000),
    };
};

const writeConnectionValuesSummary = (
    resolvedValues: ResolvedConnectionValues,
    write: (message: string) => void,
): void => {
    const names: ConnectionValueName[] = [
        'database',
        'warehouse',
        'schema',
        'role',
    ];
    const resolved = names.filter(
        (name) => resolvedValues.values[name] !== undefined,
    );
    const missing = names.filter(
        (name) => resolvedValues.values[name] === undefined,
    );
    write(
        `Connection values resolved: ${
            resolved.length === 0
                ? 'none'
                : resolved
                      .map(
                          (name) => `${name} (${resolvedValues.sources[name]})`,
                      )
                      .join(', ')
        }`,
    );
    if (missing.length > 0) {
        write(`Finish choosing ${missing.join(', ')} in the browser.`);
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
            await attemptConnection(attempt + 1);
        }
    };
    await attemptConnection(1);
};

const writeAdminRemedies = (
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
    credentials: DepositSnowflakeCredentials;
    successMessage: string;
    method: 'key_pair' | 'pat';
};

const createDurableCredential = async (
    authorizationCodeCredentials: CreateSnowflakeCredentials,
    warehouseClient: SnowflakeOnboardingClient,
    discovery: SnowflakeSessionDiscovery,
    connectionValues: ConnectionValues,
    dependencies: ConnectSnowflakeDependencies,
): Promise<DurableCredential> => {
    const keyPair = dependencies.generateKeyPair();
    const slots = await warehouseClient.getUserPublicKeySlots(discovery.user);
    const slot = getAvailableKeySlot(slots);
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
        type: WarehouseTypes.SNOWFLAKE,
        account: authorizationCodeCredentials.account,
        user: discovery.user,
        authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
        privateKey: keyPair.privateKey,
        database: connectionValues.database ?? '',
        warehouse: connectionValues.warehouse ?? '',
        schema: connectionValues.schema ?? '',
        role: connectionValues.role,
    };
    if (keyRegistered && slot !== null) {
        try {
            await verifyKeyPair(
                {
                    ...keyPairCredentials,
                    database: '',
                    warehouse: '',
                    schema: '',
                    role: undefined,
                },
                dependencies,
            );
            return {
                credentials: {
                    ...keyPairCredentials,
                    database: connectionValues.database,
                    warehouse: connectionValues.warehouse,
                    schema: connectionValues.schema,
                },
                successMessage: 'Secured with a key pair',
                method: 'key_pair',
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
                `LIGHTDASH_ONBOARDING_${Date.now()}`,
                PAT_EXPIRY_DAYS,
                PAT_NETWORK_POLICY_BYPASS_MINUTES,
            );
        const expiresAt = new Date(
            dependencies.now().getTime() +
                PAT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        );
        dependencies.write(
            `The token bypasses your Snowflake network policy for the next ${PAT_NETWORK_POLICY_BYPASS_MINUTES} minutes so this connection can be verified. Allowlist Lightdash's IP addresses in your network policy to keep it working afterwards.`,
        );
        return {
            credentials: {
                type: WarehouseTypes.SNOWFLAKE,
                account: authorizationCodeCredentials.account,
                user: discovery.user,
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
                password: tokenSecret,
                database: connectionValues.database,
                warehouse: connectionValues.warehouse,
                schema: connectionValues.schema,
                role: connectionValues.role,
            },
            successMessage: `Secured with a programmatic access token (expires ${expiresAt.toISOString().slice(0, 10)})`,
            method: 'pat',
        };
    } catch (error) {
        writeAdminRemedies(
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
    await LightdashAnalytics.track({
        event: 'connect_snowflake.started',
        properties: {},
    });
    try {
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
        const discovery = await warehouseClient.getSessionDiscovery(
            options.user,
        );
        const resolvedConnectionValues = resolveConnectionValues(
            options,
            discovery,
        );
        const durableCredential = await createDurableCredential(
            authorizationCodeCredentials,
            warehouseClient,
            discovery,
            resolvedConnectionValues.values,
            dependencies,
        );
        const depositUrl = new URL(
            '/api/v1/warehouse-connect/deposit',
            options.url,
        );
        const request: DepositWarehouseConnectionRequest = {
            code: options.code,
            credentials: durableCredential.credentials,
            inventory: buildInventory(discovery),
        };
        const response = await dependencies.fetch(depositUrl.href, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        await parseDepositResponse(response);
        await LightdashAnalytics.track({
            event: 'connect_snowflake.completed',
            properties: { method: durableCredential.method },
        });
        dependencies.write(durableCredential.successMessage);
        writeConnectionValuesSummary(
            resolvedConnectionValues,
            dependencies.write,
        );
        dependencies.write(
            'Authenticated and connected! Return to Lightdash to finish setup.',
        );
    } catch (error) {
        await LightdashAnalytics.track({
            event: 'connect_snowflake.error',
            properties: {
                error: getErrorMessage(error),
                errorCategory: categorizeError(error),
            },
        });
        throw error;
    }
};

export const connectSnowflakeTestHelpers = {
    resolveConnectionValues,
};
