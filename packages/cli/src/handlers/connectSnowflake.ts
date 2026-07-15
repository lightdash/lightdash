import {
    getErrorMessage,
    SnowflakeAuthenticationType,
    WarehouseConnectionError,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type DepositWarehouseConnectionRequest,
} from '@lightdash/common';
import {
    snowflakeIdentifier,
    SnowflakeWarehouseClient,
    type SnowflakePublicKeySlot,
    type SnowflakeSessionDiscovery,
} from '@lightdash/warehouses';
import inquirer from 'inquirer';
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
    isTTY: () => boolean;
};

type ConnectionValues = {
    database: string;
    warehouse: string;
    role: string | null;
    schema: string;
};

type PromptValue = 'database' | 'warehouse' | 'schema';

const PAT_EXPIRY_DAYS = 365;
const PAT_NETWORK_POLICY_BYPASS_MINUTES = 1440;
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
    isTTY: () => Boolean(process.stdout.isTTY),
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
        throw new WarehouseConnectionError(
            'Lightdash could not accept the Snowflake credential',
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
): string | null => flagValue ?? defaultValue;

const requiredPromptValues = ['database', 'warehouse', 'schema'] as const;

const getMissingValues = (
    values: Record<PromptValue, string | null>,
): PromptValue[] =>
    requiredPromptValues.filter((name) => !values[name]?.trim());

const promptForMissingValues = async (
    values: Record<PromptValue, string | null>,
    missingValues: PromptValue[],
    discovery: SnowflakeSessionDiscovery,
): Promise<Record<PromptValue, string>> => {
    const questions = missingValues.map((name) => {
        let choices: string[] = [];
        if (name === 'database') {
            choices = discovery.inventory.databases.map(
                ({ name: value }) => value,
            );
        } else if (name === 'warehouse') {
            choices = discovery.inventory.warehouses.map(
                ({ name: value }) => value,
            );
        }
        return {
            type: choices.length > 0 ? 'list' : 'input',
            name,
            message: `Select a Snowflake ${name}`,
            choices: choices.length > 0 ? choices : undefined,
            validate: (value: string) =>
                value.trim().length > 0 || `${name} is required`,
        };
    });
    const answers =
        await inquirer.prompt<Partial<Record<PromptValue, string>>>(questions);
    return {
        database: answers.database ?? values.database ?? '',
        warehouse: answers.warehouse ?? values.warehouse ?? '',
        schema: answers.schema ?? values.schema ?? '',
    };
};

const resolveConnectionValues = async (
    options: ConnectSnowflakeOptions,
    discovery: SnowflakeSessionDiscovery,
    dependencies: ConnectSnowflakeDependencies,
): Promise<ConnectionValues> => {
    const unresolvedValues = {
        database: resolveValue(options.database, discovery.defaults.database),
        warehouse: resolveValue(
            options.warehouse,
            discovery.defaults.warehouse,
        ),
        schema: resolveValue(options.schema, discovery.defaults.schema),
    };
    const missingValues = getMissingValues(unresolvedValues);
    let resolvedValues = unresolvedValues;
    if (missingValues.length > 0) {
        if (!dependencies.isTTY()) {
            const flags = missingValues.map((name) => `--${name}`).join(', ');
            throw new WarehouseConnectionError(
                `Snowflake did not provide defaults for ${missingValues.join(', ')}. Pass ${flags} when running in a non-interactive terminal.`,
            );
        }
        resolvedValues = await promptForMissingValues(
            unresolvedValues,
            missingValues,
            discovery,
        );
    }
    return {
        database: resolvedValues.database ?? '',
        warehouse: resolvedValues.warehouse ?? '',
        schema: resolvedValues.schema ?? '',
        role: resolveValue(options.role, discovery.defaults.role),
    };
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
    credentials: CreateSnowflakeCredentials;
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
        ...authorizationCodeCredentials,
        user: discovery.user,
        authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
        privateKey: keyPair.privateKey,
        database: connectionValues.database,
        warehouse: connectionValues.warehouse,
        schema: connectionValues.schema,
        role: connectionValues.role ?? undefined,
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
                credentials: keyPairCredentials,
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
                'LIGHTDASH_ONBOARDING',
                PAT_EXPIRY_DAYS,
                PAT_NETWORK_POLICY_BYPASS_MINUTES,
            );
        const expiresAt = new Date(
            dependencies.now().getTime() +
                PAT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        );
        return {
            credentials: {
                ...authorizationCodeCredentials,
                user: discovery.user,
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
                password: tokenSecret,
                database: connectionValues.database,
                warehouse: connectionValues.warehouse,
                schema: connectionValues.schema,
                role: connectionValues.role ?? undefined,
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
        const connectionValues = await resolveConnectionValues(
            options,
            discovery,
            dependencies,
        );
        const durableCredential = await createDurableCredential(
            authorizationCodeCredentials,
            warehouseClient,
            discovery,
            connectionValues,
            dependencies,
        );
        const depositUrl = new URL(
            '/api/v1/warehouse-connect/deposit',
            options.url,
        );
        const request: DepositWarehouseConnectionRequest = {
            code: options.code,
            credentials: durableCredential.credentials,
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
