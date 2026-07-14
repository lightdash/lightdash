import {
    OnboardingStepStatus,
    SnowflakeAuthenticationType,
    WarehouseConnectionError,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type OnboardingConnectionDepositResult,
    type OnboardingConnectionInventory,
    type OnboardingConnectionValues,
    type OnboardingConnectionValueSource,
    type OnboardingConnectionValueSources,
} from '@lightdash/common';
import {
    SnowflakeWarehouseClient,
    type SnowflakeSessionDefaults,
    type SnowflakeSessionDiscovery,
} from '@lightdash/warehouses';
import fetch, { type Response } from 'node-fetch';
import * as styles from '../styles';

export type ConnectSnowflakeOptions = {
    code: string;
    url: string;
    account: string;
    database?: string;
    warehouse?: string;
    role?: string;
    schema?: string;
    user: string;
};

type SnowflakePatClient = Pick<
    SnowflakeWarehouseClient,
    'createProgrammaticAccessToken' | 'getSessionDiscovery'
>;

type ConnectSnowflakeDependencies = {
    warehouseClientFactory: (
        credentials: CreateSnowflakeCredentials,
    ) => SnowflakePatClient;
    fetch: typeof fetch;
    write: (message: string) => void;
};

type DepositResponse = {
    status: 'ok';
    results: OnboardingConnectionDepositResult;
};

const INVENTORY_LIMIT = 100;

const defaultDependencies: ConnectSnowflakeDependencies = {
    warehouseClientFactory: (credentials) =>
        new SnowflakeWarehouseClient(credentials),
    fetch,
    write: (message) => console.error(message),
};

const getPatName = (code: string): string => {
    const projectPrefix = /^([A-Za-z0-9]{8})_/.exec(code)?.[1];
    if (!projectPrefix) {
        throw new Error(
            'Invalid connect code — generate a new one in the Lightdash setup wizard',
        );
    }
    return `LIGHTDASH_ONBOARDING_${projectPrefix.toUpperCase()}`;
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

export const connectSnowflakeHandler = async (
    options: ConnectSnowflakeOptions,
    dependencies: ConnectSnowflakeDependencies = defaultDependencies,
): Promise<void> => {
    const externalBrowserCredentials: CreateSnowflakeCredentials = {
        type: WarehouseTypes.SNOWFLAKE,
        account: options.account,
        user: options.user,
        authenticationType: SnowflakeAuthenticationType.EXTERNAL_BROWSER,
        role: options.role,
        database: options.database ?? '',
        warehouse: options.warehouse ?? '',
        schema: options.schema ?? '',
    };
    const warehouseClient = dependencies.warehouseClientFactory(
        externalBrowserCredentials,
    );
    dependencies.write('Opening Snowflake sign-in in your browser…');
    const { tokenSecret } = await warehouseClient.createProgrammaticAccessToken(
        getPatName(options.code),
        365,
        1440,
    );
    const discovery: SnowflakeSessionDiscovery =
        await warehouseClient.getSessionDiscovery(options.user);
    const { connectionValues, connectionValueSources } = getConnectionValues(
        options,
        discovery.defaults,
    );
    const inventory = capInventory(discovery.inventory);
    const warehouseConnection: CreateSnowflakeCredentials = {
        ...externalBrowserCredentials,
        authenticationType: SnowflakeAuthenticationType.PASSWORD,
        password: tokenSecret,
        database: connectionValues.database ?? '',
        warehouse: connectionValues.warehouse ?? '',
        schema: connectionValues.schema ?? '',
        role: connectionValues.role ?? undefined,
    };
    const depositUrl = new URL(
        '/api/v1/onboarding/connection/deposit',
        options.url,
    );
    const response = await dependencies.fetch(depositUrl.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code: options.code,
            warehouseConnection,
            connectionValues,
            connectionValueSources,
            inventory,
        }),
    });
    const deposit = await parseDepositResponse(response);
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
    getPatName,
    renderDiagnostics,
};
