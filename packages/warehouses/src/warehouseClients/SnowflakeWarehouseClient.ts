import {
    AnyType,
    CreateSnowflakeCredentials,
    DimensionType,
    getErrorMessage,
    isWeekDay,
    Metric,
    MetricType,
    ParseError,
    SnowflakeAuthenticationType,
    SupportedDbtAdapter,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseResults,
    WarehouseTypes,
    type WarehouseExecuteAsyncQuery,
    type WarehouseExecuteAsyncQueryArgs,
} from '@lightdash/common';
import * as crypto from 'crypto';
import {
    Column,
    configure,
    Connection,
    ConnectionOptions,
    createConnection,
    SnowflakeError,
    type FileAndStageBindStatement,
    type RowStatement,
} from 'snowflake-sdk';
import { pipeline, Transform, Writable } from 'stream';
import * as Util from 'util';
import { WarehouseCatalog } from '../types';
import {
    DEFAULT_BATCH_SIZE,
    processPromisesInBatches,
} from '../utils/processPromisesInBatches';
import { normalizeUnicode } from '../utils/sql';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

const assertIsSnowflakeLoggingLevel = (
    x: string | undefined,
): x is 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' =>
    x !== undefined && ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'].includes(x);

// Prevent snowflake sdk from flooding the output with info logs
configure({
    logLevel: assertIsSnowflakeLoggingLevel(process.env.SNOWFLAKE_SDK_LOG_LEVEL)
        ? process.env.SNOWFLAKE_SDK_LOG_LEVEL
        : 'ERROR',
});

export enum SnowflakeTypes {
    NUMBER = 'NUMBER',
    DECIMAL = 'DECIMAL',
    NUMERIC = 'NUMERIC',
    INTEGER = 'INTEGER',
    INT = 'INT',
    BIGINT = 'BIGINT',
    SMALLINT = 'SMALLINT',
    FLOAT = 'FLOAT',
    FLOAT4 = 'FLOAT4',
    FLOAT8 = 'FLOAT8',
    DOUBLE = 'DOUBLE',
    DOUBLE_PRECISION = 'DOUBLE PRECISION',
    REAL = 'REAL',
    FIXED = 'FIXED',
    STRING = 'STRING',
    TEXT = 'TEXT',
    BOOLEAN = 'BOOLEAN',
    DATE = 'DATE',
    DATETIME = 'DATETIME',
    TIME = 'TIME',
    TIMESTAMP = 'TIMESTAMP',
    TIMESTAMP_LTZ = 'TIMESTAMP_LTZ',
    TIMESTAMP_NTZ = 'TIMESTAMP_NTZ',
    TIMESTAMP_TZ = 'TIMESTAMP_TZ',
    VARIANT = 'VARIANT',
    OBJECT = 'OBJECT',
    ARRAY = 'ARRAY',
    GEOGRAPHY = 'GEOGRAPHY',
}

const normaliseSnowflakeType = (type: string): string => {
    const r = /^[A-Z]+/;
    const match = r.exec(type);
    if (match === null) {
        throw new ParseError(
            `Cannot understand type from Snowflake: ${type}`,
            {},
        );
    }
    return match[0];
};

const EXTERNAL_BROWSER_AUTHENTICATOR = 'EXTERNALBROWSER';
const OAUTH_AUTHORIZATION_CODE_AUTHENTICATOR = 'OAUTH_AUTHORIZATION_CODE';
const SESSION_DISCOVERY_LIMIT = 100;
const SESSION_SCHEMA_DISCOVERY_LIMIT = 1000;

export type SnowflakeOAuthTokens = {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date | null;
};

type SnowflakeOAuthCredentialManager = {
    read(key: string): Promise<string | null>;
    write(key: string, token: string): Promise<void>;
    remove(key: string): Promise<void>;
    getTokens(): SnowflakeOAuthTokens | null;
};

const getAccessTokenExpiresAt = (token: string): Date | null => {
    try {
        const payload = token.split('.')[1];
        if (!payload) {
            return null;
        }
        const parsed = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8'),
        ) as unknown;
        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            !('exp' in parsed) ||
            typeof parsed.exp !== 'number' ||
            !Number.isFinite(parsed.exp)
        ) {
            return null;
        }
        return new Date(parsed.exp * 1000);
    } catch {
        return null;
    }
};

const createOAuthCredentialManager = (): SnowflakeOAuthCredentialManager => {
    const values = new Map<string, string>();
    let accessToken: string | null = null;
    let refreshToken: string | null = null;

    return {
        async read(key) {
            if (!key) return null;
            return values.get(key) ?? null;
        },
        async write(key, token) {
            if (!key) {
                if (getAccessTokenExpiresAt(token) !== null) {
                    accessToken = token;
                } else {
                    refreshToken = token;
                }
                return;
            }
            values.set(key, token);
            if (key.endsWith(':{OAUTH_AUTHORIZATION_CODE_ACCESS_TOKEN}')) {
                accessToken = token;
            } else if (
                key.endsWith(':{OAUTH_AUTHORIZATION_CODE_REFRESH_TOKEN}')
            ) {
                refreshToken = token;
            }
        },
        async remove(key) {
            if (!key) return;
            values.delete(key);
            if (key.endsWith(':{OAUTH_AUTHORIZATION_CODE_ACCESS_TOKEN}')) {
                accessToken = null;
            } else if (
                key.endsWith(':{OAUTH_AUTHORIZATION_CODE_REFRESH_TOKEN}')
            ) {
                refreshToken = null;
            }
        },
        getTokens() {
            if (accessToken === null || refreshToken === null) {
                return null;
            }
            return {
                accessToken,
                refreshToken,
                expiresAt: getAccessTokenExpiresAt(accessToken),
            };
        },
    };
};

export type SnowflakeSessionDefaults = {
    role: string | null;
    warehouse: string | null;
    database: string | null;
    schema: string | null;
};

export type SnowflakeSessionInventory = {
    databases: {
        name: string;
        comment: string | null;
        kind: string | null;
    }[];
    warehouses: {
        name: string;
        size: string | null;
        state: string | null;
        autoSuspendSeconds: number | null;
    }[];
    roles: {
        name: string;
        isDefault: boolean;
    }[];
    schemas: {
        databaseName: string;
        name: string;
    }[];
};

export type SnowflakeSessionDiscovery = {
    user: string;
    defaults: SnowflakeSessionDefaults;
    inventory: SnowflakeSessionInventory;
};

export type SnowflakeDiagnosticErrorCategory =
    | 'account_identifier'
    | 'authentication'
    | 'private_key'
    | 'database_access'
    | 'warehouse_access'
    | 'network_policy'
    | 'unknown';

export type SnowflakeDiagnosticErrorDetails = {
    category: SnowflakeDiagnosticErrorCategory;
    code: string | null;
    sanitizedMessage: string;
};

const DIAGNOSTIC_MESSAGES: Record<SnowflakeDiagnosticErrorCategory, string> = {
    account_identifier: 'The Snowflake account host could not be resolved.',
    authentication: 'Snowflake rejected the supplied username or password.',
    private_key:
        'Snowflake could not authenticate with the supplied private key.',
    database_access: 'The configured role cannot access the database.',
    warehouse_access: 'The configured role cannot use the warehouse.',
    network_policy:
        'Snowflake blocked this connection because of a network policy.',
    unknown: 'Snowflake could not complete the connection check.',
};

const getSnowflakeRowValue = (
    row: Record<string, AnyType>,
    name: string,
): string | null => {
    const resultValue = row[name] ?? row[name.toUpperCase()];
    return typeof resultValue === 'string' ? resultValue : null;
};

const getSnowflakeRowNumber = (
    row: Record<string, AnyType>,
    name: string,
): number | null => {
    const resultValue = row[name] ?? row[name.toUpperCase()];
    if (typeof resultValue === 'number') {
        return Number.isFinite(resultValue) ? resultValue : null;
    }
    if (typeof resultValue !== 'string' || resultValue.trim() === '') {
        return null;
    }
    const parsed = Number(resultValue);
    return Number.isFinite(parsed) ? parsed : null;
};

const listSnowflakeSchemas = (
    rows: AnyType[],
): SnowflakeSessionInventory['schemas'] =>
    rows.flatMap((rawRow) => {
        const row = rawRow as Record<string, AnyType>;
        const name = getSnowflakeRowValue(row, 'name');
        const databaseName = getSnowflakeRowValue(row, 'database_name');
        if (!name || !databaseName || name === 'INFORMATION_SCHEMA') {
            return [];
        }
        return [{ databaseName, name }];
    });

const listSnowflakeDatabases = (
    rows: AnyType[],
): SnowflakeSessionInventory['databases'] =>
    rows
        .flatMap((rawRow) => {
            const row = rawRow as Record<string, AnyType>;
            const name = getSnowflakeRowValue(row, 'name');
            if (!name) {
                return [];
            }
            return [
                {
                    name,
                    comment:
                        getSnowflakeRowValue(row, 'comment')?.trim() === ''
                            ? null
                            : getSnowflakeRowValue(row, 'comment'),
                    kind: getSnowflakeRowValue(row, 'kind'),
                },
            ];
        })
        .slice(0, SESSION_DISCOVERY_LIMIT);

const listSnowflakeWarehouses = (
    rows: AnyType[],
): SnowflakeSessionInventory['warehouses'] =>
    rows
        .flatMap((rawRow) => {
            const row = rawRow as Record<string, AnyType>;
            const name = getSnowflakeRowValue(row, 'name');
            if (!name) {
                return [];
            }
            return [
                {
                    name,
                    size: getSnowflakeRowValue(row, 'size'),
                    state: getSnowflakeRowValue(row, 'state'),
                    autoSuspendSeconds: getSnowflakeRowNumber(
                        row,
                        'auto_suspend',
                    ),
                },
            ];
        })
        .slice(0, SESSION_DISCOVERY_LIMIT);

export const snowflakeIdentifier = (value: string): string =>
    /^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)
        ? value
        : `"${value.replace(/"/g, '""')}"`;

export const mapSnowflakeDiagnosticError = (
    error: unknown,
): SnowflakeDiagnosticErrorDetails => {
    const errorWithCode = error as Partial<
        SnowflakeError & NodeJS.ErrnoException
    >;
    const rawMessage =
        typeof errorWithCode?.message === 'string'
            ? errorWithCode.message
            : getErrorMessage(error);
    const normalizedMessage = rawMessage.toLowerCase();
    const code =
        typeof errorWithCode?.code === 'string' ||
        typeof errorWithCode?.code === 'number'
            ? String(errorWithCode.code)
            : null;

    let category: SnowflakeDiagnosticErrorCategory = 'unknown';
    if (code === 'ENOTFOUND' || normalizedMessage.includes('enotfound')) {
        category = 'account_identifier';
    } else if (
        code === '390144' ||
        normalizedMessage.includes('private key') ||
        normalizedMessage.includes('passphrase') ||
        normalizedMessage.includes('jwt') ||
        normalizedMessage.includes('pkcs') ||
        normalizedMessage.includes('pem routines') ||
        normalizedMessage.includes('asn1')
    ) {
        category = 'private_key';
    } else if (
        code === '250001' ||
        normalizedMessage.includes('incorrect username or password') ||
        normalizedMessage.includes('incorrect username-password')
    ) {
        category = 'authentication';
    } else if (
        code === '390422' ||
        normalizedMessage.includes('network policy') ||
        normalizedMessage.includes('ip address is not allowed') ||
        normalizedMessage.includes('not allowed to access snowflake')
    ) {
        category = 'network_policy';
    } else if (
        normalizedMessage.includes('warehouse') &&
        (normalizedMessage.includes('not authorized') ||
            normalizedMessage.includes('does not exist') ||
            normalizedMessage.includes('no active warehouse') ||
            normalizedMessage.includes('insufficient privileges'))
    ) {
        category = 'warehouse_access';
    } else if (
        normalizedMessage.includes('database') &&
        (normalizedMessage.includes('not authorized') ||
            normalizedMessage.includes('does not exist') ||
            normalizedMessage.includes('insufficient privileges'))
    ) {
        category = 'database_access';
    }

    return {
        category,
        code,
        sanitizedMessage: DIAGNOSTIC_MESSAGES[category],
    };
};

export class SnowflakeDiagnosticError extends Error {
    readonly details: SnowflakeDiagnosticErrorDetails;

    private readonly rawError!: unknown;

    constructor(error: unknown) {
        const details = mapSnowflakeDiagnosticError(error);
        super(details.sanitizedMessage);
        this.name = 'SnowflakeDiagnosticError';
        this.details = details;
        Object.defineProperty(this, 'rawError', {
            configurable: false,
            enumerable: false,
            value: error,
            writable: false,
        });
    }

    getRawError(): unknown {
        return this.rawError;
    }
}

export type SnowflakeDiagnosticSession = {
    connection: Connection;
};

export type SnowflakePublicKeySlot = 'RSA_PUBLIC_KEY' | 'RSA_PUBLIC_KEY_2';

export type SnowflakePublicKeySlots = {
    RSA_PUBLIC_KEY: string | null;
    RSA_PUBLIC_KEY_2: string | null;
};

export const mapFieldType = (type: string): DimensionType => {
    switch (normaliseSnowflakeType(type)) {
        case SnowflakeTypes.NUMBER:
        case SnowflakeTypes.DECIMAL:
        case SnowflakeTypes.NUMERIC:
        case SnowflakeTypes.INTEGER:
        case SnowflakeTypes.INT:
        case SnowflakeTypes.BIGINT:
        case SnowflakeTypes.SMALLINT:
        case SnowflakeTypes.FLOAT:
        case SnowflakeTypes.FLOAT4:
        case SnowflakeTypes.FLOAT8:
        case SnowflakeTypes.DOUBLE:
        case SnowflakeTypes.DOUBLE_PRECISION:
        case SnowflakeTypes.REAL:
        case SnowflakeTypes.FIXED:
            return DimensionType.NUMBER;
        case SnowflakeTypes.DATE:
            return DimensionType.DATE;
        case SnowflakeTypes.DATETIME:
        case SnowflakeTypes.TIME:
        case SnowflakeTypes.TIMESTAMP:
        case SnowflakeTypes.TIMESTAMP_LTZ:
        case SnowflakeTypes.TIMESTAMP_NTZ:
        case SnowflakeTypes.TIMESTAMP_TZ:
            return DimensionType.TIMESTAMP;
        case SnowflakeTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        default:
            return DimensionType.STRING;
    }
};

const parseCell = (cell: AnyType) => {
    if (cell instanceof Date) {
        return new Date(cell);
    }

    return cell;
};

const parseRow = (row: Record<string, AnyType>) =>
    Object.fromEntries(
        Object.entries(row).map(([name, value]) => [name, parseCell(value)]),
    );
const parseRows = (rows: Record<string, AnyType>[]) => rows.map(parseRow);

export class SnowflakeSqlBuilder extends WarehouseBaseSqlBuilder {
    readonly type = WarehouseTypes.SNOWFLAKE;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.SNOWFLAKE;
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `PERCENTILE_CONT(${
                    (metric.percentile ?? 50) / 100
                }) WITHIN GROUP (ORDER BY ${sql})`;
            case MetricType.MEDIAN:
                return `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${sql})`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    escapeString(value: string): string {
        if (typeof value !== 'string') {
            return value;
        }

        return (
            normalizeUnicode(value)
                // Snowflake uses single quote doubling like PostgreSQL
                .replaceAll("'", "''")
                // Escape backslashes first (before LIKE wildcards)
                .replaceAll('\\', '\\\\')
                // Remove SQL comments (-- and /* */)
                .replace(/--.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                // Remove null bytes
                .replaceAll('\0', '')
        );
    }

    getTimestampDiffSeconds(
        startTimestampSql: string,
        endTimestampSql: string,
    ): string {
        // Snowflake uses DATEDIFF function
        return `DATEDIFF('second', ${startTimestampSql}, ${endTimestampSql})`;
    }

    buildArray(elements: string[]): string {
        // Snowflake array construction syntax
        return `ARRAY_CONSTRUCT(${elements.join(', ')})`;
    }

    buildArrayAgg(expression: string, orderBy?: string): string {
        // Snowflake uses ARRAY_AGG function with WITHIN GROUP clause for ordering
        if (orderBy) {
            return `ARRAY_AGG(${expression}) WITHIN GROUP (ORDER BY ${orderBy})`;
        }
        return `ARRAY_AGG(${expression})`;
    }
}

export class SnowflakeWarehouseClient extends WarehouseBaseClient<CreateSnowflakeCredentials> {
    private static readonly MAX_QUERY_TAG_LENGTH = 2000;

    connectionOptions: ConnectionOptions;

    quotedIdentifiersIgnoreCase?: boolean;

    static formatQueryTag(tags: Record<string, string>): string {
        return Array.from(JSON.stringify(tags))
            .slice(0, SnowflakeWarehouseClient.MAX_QUERY_TAG_LENGTH)
            .join('')
            .replace(/'/g, "''");
    }

    private interactiveConnectionPromise?: Promise<Connection>;

    private readonly privateKey: string | undefined;

    private readonly privateKeyPassphrase: string | undefined;

    private readonly oauthCredentialManager?: SnowflakeOAuthCredentialManager;

    constructor(credentials: CreateSnowflakeCredentials) {
        super(credentials, new SnowflakeSqlBuilder(credentials.startOfWeek));
        if (typeof credentials.quotedIdentifiersIgnoreCase !== 'undefined') {
            this.quotedIdentifiersIgnoreCase =
                credentials.quotedIdentifiersIgnoreCase;
        }

        let authenticationOptions: Partial<ConnectionOptions> = {};

        // if authenticationType is undefined, we assume it is a password authentication, for backwards compatibility
        if (
            credentials.authenticationType === SnowflakeAuthenticationType.SSO
        ) {
            if (!credentials.token) {
                // Perhaps we forgot to refresh the token before building the client, check buildAdapter for more details
                throw new UnexpectedServerError(
                    'Snowflake token is required for SSO authentication',
                );
            }
            authenticationOptions = {
                // Do not include username or role when doing SSO authentication
                token: credentials.token,
                authenticator: 'OAUTH',
            };
        } else if (
            credentials.authenticationType ===
            SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE
        ) {
            this.oauthCredentialManager = createOAuthCredentialManager();
            configure({
                customCredentialManager: this.oauthCredentialManager,
            });
            authenticationOptions = {
                authenticator: OAUTH_AUTHORIZATION_CODE_AUTHENTICATOR,
                ...(credentials.user ? { username: credentials.user } : {}),
                role: credentials.role,
                clientStoreTemporaryCredential: true,
                browserActionTimeout: 300_000,
            };
        } else if (
            credentials.authenticationType ===
            SnowflakeAuthenticationType.EXTERNAL_BROWSER
        ) {
            // This can only be used on the CLI
            // The backend does not support this authentication type
            // See createProgrammaticAccessToken for more details
            authenticationOptions = {
                authenticator: EXTERNAL_BROWSER_AUTHENTICATOR,
            };
        } else if (
            credentials.privateKey &&
            (!credentials.password ||
                credentials.authenticationType ===
                    SnowflakeAuthenticationType.PRIVATE_KEY)
        ) {
            authenticationOptions = {
                username: credentials.user,
                role: credentials.role,
                authenticator: 'SNOWFLAKE_JWT',
            };
        } else if (credentials.password) {
            authenticationOptions = {
                username: credentials.user,
                role: credentials.role,
                password: credentials.password,
                authenticator: 'SNOWFLAKE',
            };
        }

        const usesPrivateKey =
            authenticationOptions.authenticator === 'SNOWFLAKE_JWT';
        this.privateKey = usesPrivateKey ? credentials.privateKey : undefined;
        this.privateKeyPassphrase = usesPrivateKey
            ? credentials.privateKeyPass
            : undefined;

        this.connectionOptions = {
            account: credentials.account,
            ...authenticationOptions,
            database: credentials.database,
            schema: credentials.schema,
            warehouse: credentials.warehouse,
            ...(credentials.accessUrl?.length
                ? { accessUrl: credentials.accessUrl }
                : {}),
            ...(credentials.clientSessionKeepAlive !== undefined
                ? { clientSessionKeepAlive: credentials.clientSessionKeepAlive }
                : {}),
            sfRetryMaxLoginRetries: 3, // Number of retries for the login request.
            retryTimeout: 15000, // according to docs: The max login timeout value. This value is either 0 or over 300.
        };

        // Manually specify the connection options to log, to avoid logging sensitive information
        const logConnectionOptions = {
            account: this.connectionOptions.account,
            authenticator: authenticationOptions.authenticator,
            username: this.connectionOptions.username,
            role: this.connectionOptions.role,
            database: this.connectionOptions.database,
            schema: this.connectionOptions.schema,
            warehouse: this.connectionOptions.warehouse,
            accessUrl: this.connectionOptions.accessUrl,
        };

        if (credentials.requireUserCredentials)
            console.info(
                `Initialized snowflake warehouse client with "requireUserCredentials" authentication type "${
                    credentials.authenticationType
                }" and connection options: ${JSON.stringify(
                    logConnectionOptions,
                )}`,
            );
    }

    private async getConnection(
        connectionOptionsOverrides?: Partial<ConnectionOptions>,
    ) {
        if (this.isInteractiveAuthenticator()) {
            return this.createInteractiveConnection(connectionOptionsOverrides);
        }

        return this.createConnection(connectionOptionsOverrides);
    }

    private isInteractiveAuthenticator(): boolean {
        return (
            this.connectionOptions.authenticator ===
                EXTERNAL_BROWSER_AUTHENTICATOR ||
            this.connectionOptions.authenticator ===
                OAUTH_AUTHORIZATION_CODE_AUTHENTICATOR
        );
    }

    private async getConnectionOptions(
        connectionOptionsOverrides?: Partial<ConnectionOptions>,
    ): Promise<ConnectionOptions> {
        let privateKey: string | undefined;
        if (this.privateKey && this.privateKeyPassphrase) {
            privateKey = crypto
                .createPrivateKey({
                    key: this.privateKey,
                    format: 'pem',
                    passphrase: this.privateKeyPassphrase,
                })
                .export({ format: 'pem', type: 'pkcs8' })
                .toString();
        } else {
            privateKey = this.privateKey;
        }

        return {
            ...this.connectionOptions,
            ...(privateKey ? { privateKey } : {}),
            ...connectionOptionsOverrides,
        };
    }

    private async createInteractiveConnection(
        connectionOptionsOverrides?: Partial<ConnectionOptions>,
    ): Promise<Connection> {
        if (this.interactiveConnectionPromise) {
            return this.interactiveConnectionPromise;
        }

        this.interactiveConnectionPromise = (async () => {
            let connection: Connection;
            const isExternalBrowser =
                this.connectionOptions.authenticator ===
                EXTERNAL_BROWSER_AUTHENTICATOR;
            try {
                connection = createConnection({
                    ...(await this.getConnectionOptions(
                        connectionOptionsOverrides,
                    )),
                });

                console.info(
                    isExternalBrowser
                        ? `Connecting to snowflake warehouse with "external_browser" authentication type`
                        : `Connecting to snowflake warehouse with interactive authentication type`,
                );
                await Util.promisify(
                    connection.connectAsync.bind(connection),
                )();
            } catch (e: unknown) {
                throw new WarehouseConnectionError(
                    isExternalBrowser
                        ? `Snowflake external browser error: ${getErrorMessage(e)}`
                        : `Snowflake interactive authentication error: ${getErrorMessage(
                              e,
                          )}`,
                );
            }
            return connection;
        })();

        try {
            return await this.interactiveConnectionPromise;
        } catch (e) {
            this.interactiveConnectionPromise = undefined;
            throw e;
        }
    }

    private async createConnection(
        connectionOptionsOverrides?: Partial<ConnectionOptions>,
    ): Promise<Connection> {
        let connection: Connection;
        try {
            connection = createConnection({
                ...(await this.getConnectionOptions(
                    connectionOptionsOverrides,
                )),
            });

            await Util.promisify(connection.connect.bind(connection))();
        } catch (e: unknown) {
            throw new WarehouseConnectionError(
                `Snowflake error: ${getErrorMessage(e)}`,
            );
        }
        return connection;
    }

    async openDiagnosticConnection(): Promise<SnowflakeDiagnosticSession> {
        try {
            const connection = createConnection(
                await this.getConnectionOptions(),
            );
            await Util.promisify(connection.connect.bind(connection))();
            return { connection };
        } catch (error) {
            throw new SnowflakeDiagnosticError(error);
        }
    }

    async selectOneDiagnosticConnection(
        session: SnowflakeDiagnosticSession,
    ): Promise<void> {
        try {
            await this.executeStatements(session.connection, 'SELECT 1');
        } catch (error) {
            throw new SnowflakeDiagnosticError(error);
        }
    }

    async closeDiagnosticConnection(
        session: SnowflakeDiagnosticSession,
    ): Promise<void> {
        await this.destroyConnection(
            session.connection,
            this.connectionOptions.authenticator,
        );
    }

    async getSessionDiscovery(
        user?: string,
    ): Promise<SnowflakeSessionDiscovery> {
        const connection = await this.getConnection();
        const defaultsResult = await this.executeStatements(
            connection,
            'SELECT CURRENT_USER() AS user, CURRENT_ROLE() AS role, CURRENT_WAREHOUSE() AS warehouse, CURRENT_DATABASE() AS database, CURRENT_SCHEMA() AS schema',
        );
        const defaultsRow = (defaultsResult.rows[0] ?? {}) as Record<
            string,
            AnyType
        >;
        const sessionUser = user || getSnowflakeRowValue(defaultsRow, 'user');
        if (!sessionUser) {
            throw new SnowflakeDiagnosticError(
                new Error('Could not determine the authenticated user'),
            );
        }
        const databasesResult = await this.executeStatements(
            connection,
            `SHOW DATABASES LIMIT ${SESSION_DISCOVERY_LIMIT}`,
        );
        const warehousesResult = await this.executeStatements(
            connection,
            `SHOW WAREHOUSES LIMIT ${SESSION_DISCOVERY_LIMIT}`,
        );
        const grantsResult = await this.executeStatements(
            connection,
            `SHOW GRANTS TO USER ${snowflakeIdentifier(
                sessionUser,
            )} LIMIT ${SESSION_DISCOVERY_LIMIT}`,
        );
        let schemaRows: AnyType[] = [];
        try {
            const schemasResult = await this.executeStatements(
                connection,
                `SHOW SCHEMAS IN ACCOUNT LIMIT ${SESSION_SCHEMA_DISCOVERY_LIMIT}`,
            );
            schemaRows = schemasResult.rows;
        } catch {
            schemaRows = [];
        }
        const defaultRole = getSnowflakeRowValue(defaultsRow, 'role');
        const grantedRoles = [
            ...new Set([
                ...(defaultRole ? [defaultRole] : []),
                ...grantsResult.rows.flatMap((row) => {
                    const role = getSnowflakeRowValue(
                        row as Record<string, AnyType>,
                        'role',
                    );
                    return role ? [role] : [];
                }),
            ]),
        ].filter((role) => role !== 'PUBLIC');
        const roles = [
            ...grantedRoles.slice(0, SESSION_DISCOVERY_LIMIT - 1),
            'PUBLIC',
        ].map((name) => ({
            name,
            isDefault: name === defaultRole,
        }));
        return {
            user: sessionUser,
            defaults: {
                role: getSnowflakeRowValue(defaultsRow, 'role'),
                warehouse: getSnowflakeRowValue(defaultsRow, 'warehouse'),
                database: getSnowflakeRowValue(defaultsRow, 'database'),
                schema: getSnowflakeRowValue(defaultsRow, 'schema'),
            },
            inventory: {
                databases: listSnowflakeDatabases(databasesResult.rows),
                warehouses: listSnowflakeWarehouses(warehousesResult.rows),
                roles,
                schemas: listSnowflakeSchemas(schemaRows),
            },
        };
    }

    async getUserPublicKeySlots(
        user: string,
    ): Promise<SnowflakePublicKeySlots> {
        const connection = await this.getConnection();
        const result = await this.executeStatements(
            connection,
            `DESCRIBE USER ${snowflakeIdentifier(user)}`,
        );
        const fingerprints = new Map(
            result.rows.flatMap((rawRow) => {
                const row = rawRow as Record<string, AnyType>;
                const property = getSnowflakeRowValue(row, 'property');
                const value = getSnowflakeRowValue(row, 'value');
                return property
                    ? [[property.toUpperCase(), value] as const]
                    : [];
            }),
        );
        const getFingerprint = (property: string): string | null => {
            const value = fingerprints.get(property);
            const fingerprint = value?.trim();
            return fingerprint && fingerprint.toLowerCase() !== 'null'
                ? fingerprint
                : null;
        };
        return {
            RSA_PUBLIC_KEY: getFingerprint('RSA_PUBLIC_KEY_FP'),
            RSA_PUBLIC_KEY_2: getFingerprint('RSA_PUBLIC_KEY_2_FP'),
        };
    }

    async setUserPublicKey(
        user: string,
        slot: SnowflakePublicKeySlot,
        publicKey: string,
    ): Promise<void> {
        if (!/^[A-Za-z0-9+/=]+$/.test(publicKey)) {
            throw new UnexpectedServerError('Invalid Snowflake public key');
        }
        const connection = await this.getConnection();
        await this.executeStatements(
            connection,
            `ALTER USER ${snowflakeIdentifier(
                user,
            )} SET ${slot} = '${publicKey}'`,
        );
    }

    async unsetUserPublicKey(
        user: string,
        slot: SnowflakePublicKeySlot,
    ): Promise<void> {
        const connection = await this.getConnection();
        await this.executeStatements(
            connection,
            `ALTER USER ${snowflakeIdentifier(user)} UNSET ${slot}`,
        );
    }

    getOAuthTokens(): SnowflakeOAuthTokens | null {
        return this.oauthCredentialManager?.getTokens() ?? null;
    }

    async createProgrammaticAccessToken(
        tokenName: string = `lightdash_pat_${Date.now()}`,
        daysToExpiry: number = 1,
        minsToBypassNetworkPolicy: number = 1440,
        roleRestriction: string | null = null,
    ): Promise<{ tokenSecret: string; tokenName: string }> {
        if (
            this.connectionOptions.authenticator !==
                EXTERNAL_BROWSER_AUTHENTICATOR &&
            this.connectionOptions.authenticator !==
                OAUTH_AUTHORIZATION_CODE_AUTHENTICATOR
        ) {
            throw new UnexpectedServerError(
                'PAT creation requires an interactive Snowflake session',
            );
        }

        const connection = await this.getConnection();

        try {
            if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(tokenName)) {
                throw new UnexpectedServerError('Invalid Snowflake PAT name');
            }
            const existingTokens = await this.executeStatements(
                connection,
                'SHOW USER PROGRAMMATIC ACCESS TOKENS',
            );
            const tokenExists = existingTokens.rows.some((row) =>
                Object.entries(row).some(
                    ([key, value]) =>
                        key.toLowerCase() === 'name' &&
                        String(value).toUpperCase() === tokenName.toUpperCase(),
                ),
            );
            if (tokenExists) {
                await this.executeStatements(
                    connection,
                    `ALTER USER REMOVE PROGRAMMATIC ACCESS TOKEN ${tokenName}`,
                );
            }
            const inactiveLightdashTokenNames = existingTokens.rows.flatMap(
                (row) => {
                    const name = Object.entries(row).find(
                        ([key]) => key.toLowerCase() === 'name',
                    )?.[1];
                    const status = Object.entries(row).find(
                        ([key]) => key.toLowerCase() === 'status',
                    )?.[1];
                    return name !== undefined &&
                        /^[A-Za-z_][A-Za-z0-9_$]*$/.test(String(name)) &&
                        String(name)
                            .toUpperCase()
                            .startsWith('LIGHTDASH_ONBOARDING') &&
                        String(name).toUpperCase() !==
                            tokenName.toUpperCase() &&
                        status !== undefined &&
                        String(status).toUpperCase() !== 'ACTIVE'
                        ? [String(name)]
                        : [];
                },
            );
            try {
                await inactiveLightdashTokenNames.reduce<Promise<void>>(
                    async (previousRemoval, inactiveTokenName) => {
                        await previousRemoval;
                        await this.executeStatements(
                            connection,
                            `ALTER USER REMOVE PROGRAMMATIC ACCESS TOKEN ${inactiveTokenName}`,
                        );
                    },
                    Promise.resolve(),
                );
            } catch {
                // Stale-token cleanup must not prevent minting a new token.
            }
            const roleClause = roleRestriction
                ? ` ROLE_RESTRICTION = '${roleRestriction.replace(/'/g, "''")}'`
                : '';
            const sqlText = `ALTER USER ADD PROGRAMMATIC ACCESS TOKEN ${tokenName}${roleClause} DAYS_TO_EXPIRY = ${daysToExpiry} MINS_TO_BYPASS_NETWORK_POLICY_REQUIREMENT = ${minsToBypassNetworkPolicy} COMMENT = 'Lightdash backend access token'`;

            const result = await this.executeStatements(connection, sqlText);

            if (!result.rows || result.rows.length === 0) {
                throw new UnexpectedServerError(
                    'Failed to create PAT: no result returned',
                );
            }

            const tokenSecret = Object.entries(result.rows[0] ?? {}).find(
                ([key]) => key.toLowerCase() === 'token_secret',
            )?.[1];
            if (!tokenSecret) {
                throw new UnexpectedServerError(
                    'Failed to create PAT: token_secret not found in result',
                );
            }

            return { tokenSecret: String(tokenSecret), tokenName };
        } catch (e: unknown) {
            throw new WarehouseConnectionError(
                `Failed to create Snowflake PAT: ${getErrorMessage(e)}`,
            );
        }
    }

    private async prepareWarehouse(
        connection: Connection,
        options?: {
            timezone?: string;
            tags?: Record<string, string>;
        },
    ) {
        if (this.connectionOptions.warehouse) {
            // eslint-disable-next-line no-console
            console.debug(
                `Running snowflake query on warehouse: ${this.connectionOptions.warehouse}`,
            );
            try {
                await this.executeStatements(
                    connection,
                    `USE WAREHOUSE ${this.connectionOptions.warehouse};`,
                );
            } catch (e) {
                // Best-effort: fetch session identity to attach diagnostic
                // context (user/role/session_id) to the error. Useful when a
                // user's session role lacks USAGE on the warehouse — surfaces
                // the role that needs the grant. Falls back to the raw error
                // if the identity lookup itself fails.
                let identityContext = '';
                try {
                    const identity = await this.executeStatements(
                        connection,
                        `SELECT CURRENT_USER() AS "user", CURRENT_ROLE() AS "role", CURRENT_SESSION() AS "session_id"`,
                    );
                    const row = (identity.rows?.[0] ?? {}) as Record<
                        string,
                        unknown
                    >;
                    identityContext = ` (user=${JSON.stringify(
                        row.user,
                    )}, role=${JSON.stringify(
                        row.role,
                    )}, session_id=${JSON.stringify(row.session_id)})`;
                } catch {
                    // ignore — identity lookup is best-effort only
                }
                throw new WarehouseConnectionError(
                    `Failed to select Snowflake warehouse "${
                        this.connectionOptions.warehouse
                    }"${identityContext}: ${getErrorMessage(e)}`,
                );
            }
        }

        const sessionParams: string[] = [];

        const startOfWeek = this.getStartOfWeek();
        if (isWeekDay(startOfWeek)) {
            const snowflakeStartOfWeekIndex = startOfWeek + 1; // 1 (Monday) to 7 (Sunday):
            sessionParams.push(`WEEK_START = ${snowflakeStartOfWeekIndex}`);
        }

        if (options?.tags) {
            sessionParams.push(
                `QUERY_TAG = '${SnowflakeWarehouseClient.formatQueryTag(
                    options.tags,
                )}'`,
            );
        }

        const timezoneQuery = options?.timezone || 'UTC';
        console.debug(`Setting Snowflake session timezone to ${timezoneQuery}`);
        sessionParams.push(`TIMEZONE = '${timezoneQuery}'`);

        /**
         * Force QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE to avoid casing inconsistencies
         * between Snowflake <> Lightdash
         */
        console.debug(
            'Setting Snowflake session QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE',
        );
        sessionParams.push(`QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE`);

        // Default timeout to 300 seconds if not specified
        const timeoutSeconds = this.credentials.timeoutSeconds ?? 300;
        console.debug(
            `Setting Snowflake session STATEMENT_TIMEOUT_IN_SECONDS = ${timeoutSeconds}`,
        );
        sessionParams.push(`STATEMENT_TIMEOUT_IN_SECONDS = ${timeoutSeconds}`);

        await this.executeStatements(
            connection,
            `ALTER SESSION SET ${sessionParams.join(', ')};`,
        );
    }

    private getFieldsFromStatement(
        stmt: RowStatement | FileAndStageBindStatement,
    ) {
        // There is a bug/mistype in snowflake-sdk since this method can return undefined
        const columns = stmt.getColumns() as Column[] | undefined;
        return columns
            ? columns.reduce(
                  (acc, column) => ({
                      ...acc,
                      [column.getName()]: {
                          type: mapFieldType(column.getType().toUpperCase()),
                      },
                  }),
                  {},
              )
            : {};
    }

    private async destroyConnection(
        connection: Connection,
        authenticator: string | undefined,
    ) {
        if (
            authenticator === EXTERNAL_BROWSER_AUTHENTICATOR ||
            authenticator === OAUTH_AUTHORIZATION_CODE_AUTHENTICATOR
        ) {
            return;
        }
        console.info(
            `Destroying snowflake connection for authenticator ${authenticator}`,
        );
        await new Promise((resolve, reject) => {
            connection.destroy((err, conn) => {
                if (err) {
                    reject(new WarehouseConnectionError(err.message));
                }
                resolve(conn);
            });
        });
    }

    async executeAsyncQuery(
        { sql, values, tags, timezone }: WarehouseExecuteAsyncQueryArgs,
        resultsStreamCallback?: (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => void | Promise<void>,
    ): Promise<WarehouseExecuteAsyncQuery> {
        const connectStart = performance.now();
        const connection = await this.getConnection();
        const connectMs = performance.now() - connectStart;

        try {
            const sessionStart = performance.now();
            await this.prepareWarehouse(connection, {
                timezone,
                tags,
            });
            const sessionMs = performance.now() - sessionStart;

            const { queryId, durationMs, totalRows, queryMs, fetchMs } =
                await this.executeAsyncStatement(
                    connection,
                    sql,
                    resultsStreamCallback,
                    {
                        values,
                    },
                );

            return {
                queryId,
                queryMetadata: null,
                totalRows,
                durationMs,
                phaseTimings: {
                    connect: connectMs,
                    session: sessionMs,
                    query: queryMs,
                    fetch: fetchMs,
                },
            };
        } finally {
            await this.destroyConnection(
                connection,
                this.connectionOptions.authenticator,
            );
        }
    }

    private async executeAsyncStatement(
        connection: Connection,
        sql: string,
        resultsStreamCallback?: (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => void | Promise<void>,
        options?: {
            values?: AnyType[];
        },
    ) {
        const startTime = performance.now();

        if (resultsStreamCallback) {
            return new Promise<{
                queryId: string;
                queryMetadata: null;
                totalRows: number;
                durationMs: number;
                queryMs: number;
                fetchMs: number;
            }>((resolve, reject) => {
                connection.execute({
                    sqlText: sql,
                    binds: options?.values,
                    streamResult: true,
                    complete: (err, stmt) => {
                        if (err) {
                            reject(this.parseError(err, sql));
                            return;
                        }

                        const fields = this.getFieldsFromStatement(stmt);
                        let rowCount = 0;
                        const queryMs = performance.now() - startTime;
                        const fetchStart = performance.now();

                        pipeline(
                            stmt.streamRows(),
                            new Transform({
                                objectMode: true,
                                highWaterMark: 1,
                                transform(chunk, encoding, callback) {
                                    callback(null, parseRow(chunk));
                                },
                            }),
                            new Writable({
                                objectMode: true,
                                highWaterMark: 1,
                                async write(chunk, encoding, callback) {
                                    try {
                                        rowCount += 1;
                                        await resultsStreamCallback(
                                            [chunk],
                                            fields,
                                        );
                                        callback();
                                    } catch (writeError) {
                                        if (writeError instanceof Error) {
                                            callback(writeError);
                                        } else {
                                            callback(
                                                new Error(String(writeError)),
                                            );
                                        }
                                    }
                                },
                            }),
                            (error) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    resolve({
                                        queryId: stmt.getQueryId(),
                                        queryMetadata: null,
                                        totalRows: rowCount,
                                        durationMs:
                                            performance.now() - startTime,
                                        queryMs,
                                        fetchMs: performance.now() - fetchStart,
                                    });
                                }
                            },
                        );
                    },
                });
            });
        }

        const { queryId, totalRows, durationMs } = await new Promise<{
            queryId: string;
            totalRows: number;
            durationMs: number;
        }>((resolve, reject) => {
            connection.execute({
                sqlText: sql,
                binds: options?.values,
                asyncExec: true,
                complete: (err, stmt) => {
                    if (err) {
                        reject(this.parseError(err, sql));
                        return;
                    }

                    // Calling `getNumRows` from current statement returns undefined
                    void connection
                        .getResultsFromQueryId({
                            sqlText: '',
                            queryId: stmt.getQueryId(),
                            complete: (err2, stmt2) => {
                                if (err2) {
                                    reject(this.parseError(err2, sql));
                                    return;
                                }

                                resolve({
                                    queryId: stmt.getQueryId(),
                                    totalRows: stmt2.getNumRows(),
                                    durationMs: performance.now() - startTime,
                                });
                            },
                        })
                        .catch((err3) => {
                            reject(this.parseError(err3, sql));
                        });
                },
            });
        });

        return {
            queryId,
            queryMetadata: null,
            totalRows,
            durationMs,
            queryMs: durationMs,
            fetchMs: 0,
        };
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options: {
            values?: AnyType[];
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        const connection = await this.getConnection();

        try {
            await this.prepareWarehouse(connection, options);

            await this.executeStreamStatement(
                connection,
                sql,
                streamCallback,
                options,
            );
        } catch (e) {
            const error = e as SnowflakeError;
            throw this.parseError(error, sql);
        } finally {
            await this.destroyConnection(
                connection,
                this.connectionOptions.authenticator,
            );
        }
    }

    private async executeStreamStatement(
        connection: Connection,
        sqlText: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options?: {
            values?: AnyType[];
        },
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            connection.execute({
                sqlText,
                binds: options?.values,
                streamResult: true,
                complete: (err, stmt) => {
                    if (err) {
                        reject(err);
                    }

                    const fields = this.getFieldsFromStatement(stmt);

                    pipeline(
                        stmt.streamRows(),
                        new Transform({
                            objectMode: true,
                            transform(chunk, encoding, callback) {
                                callback(null, parseRow(chunk));
                            },
                        }),
                        new Writable({
                            objectMode: true,
                            async write(chunk, encoding, callback) {
                                try {
                                    await streamCallback({
                                        fields,
                                        rows: [chunk],
                                    });
                                    callback();
                                } catch (writeError) {
                                    // Pass error to pipeline which will reject the promise
                                    if (writeError instanceof Error) {
                                        callback(writeError);
                                    } else {
                                        callback(new Error(String(writeError)));
                                    }
                                }
                            },
                        }),
                        (error) => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve();
                            }
                        },
                    );
                },
            });
        });
    }

    // eslint-disable-next-line class-methods-use-this
    private async executeStatements(
        connection: Connection,
        sqlText: string,
        statementsCount: number = 1,
    ) {
        return new Promise<{
            fields: Record<string, { type: DimensionType }>;
            rows: AnyType[];
        }>((resolve, reject) => {
            connection.execute({
                sqlText,
                ...(statementsCount > 1
                    ? { parameters: { MULTI_STATEMENT_COUNT: statementsCount } }
                    : {}),
                complete: (err, stmt, data) => {
                    if (err) {
                        reject(err);
                    }
                    if (data) {
                        resolve({
                            fields: this.getFieldsFromStatement(stmt),
                            rows: parseRows(data),
                        });
                    } else {
                        reject(
                            new WarehouseQueryError(
                                'Query result is undefined',
                            ),
                        );
                    }
                },
            });
        });
    }

    private async runTableCatalogQuery(
        database: string,
        schema: string,
        table: string,
    ) {
        const sqlText = `SHOW COLUMNS IN TABLE ${table}`;
        const connection = await this.getConnection({ schema, database });

        try {
            return await this.executeStatements(connection, sqlText);
        } catch (e) {
            console.error(
                `\nError running catalog query for table ${database}.${schema}.${table}:`,
            );
            console.error(e);

            // Ignore error and let UI show invalid table
            return undefined;
        } finally {
            await this.destroyConnection(
                connection,
                this.connectionOptions.authenticator,
            );
        }
    }

    async getCatalog(
        config: {
            database: string;
            schema: string;
            table: string;
        }[],
    ) {
        const tablesMetadata = await processPromisesInBatches(
            config,
            DEFAULT_BATCH_SIZE,
            async ({ database, schema, table }) =>
                this.runTableCatalogQuery(database, schema, table),
        );

        return tablesMetadata.reduce<WarehouseCatalog>((acc, tableMetadata) => {
            if (tableMetadata) {
                tableMetadata.rows.forEach((row) => {
                    const match = config.find(
                        ({ database, schema, table }) =>
                            database.toLowerCase() ===
                                row.database_name.toLowerCase() &&
                            schema.toLowerCase() ===
                                row.schema_name.toLowerCase() &&
                            table.toLowerCase() ===
                                row.table_name.toLowerCase(),
                    );
                    // Unquoted identifiers will always be
                    if (row.kind === 'COLUMN' && !!match) {
                        acc[match.database] = acc[match.database] || {};
                        acc[match.database][match.schema] =
                            acc[match.database][match.schema] || {};
                        acc[match.database][match.schema][match.table] =
                            acc[match.database][match.schema][match.table] ||
                            {};
                        acc[match.database][match.schema][match.table][
                            row.column_name
                        ] = mapFieldType(JSON.parse(row.data_type).type);
                    }
                });
            }
            return acc;
        }, {});
    }

    async getAllTables() {
        const databaseName = this.connectionOptions.database;
        const whereSql = databaseName ? `AND TABLE_CATALOG ILIKE ?` : '';
        const query = `
            SELECT
                TABLE_CATALOG as "table_catalog",
                TABLE_SCHEMA as "table_schema",
                TABLE_NAME as "table_name"
            FROM information_schema.tables
            WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
            ${whereSql}
            ORDER BY 1,2,3
        `;
        console.debug('Running query to fetch all tables: ', {
            query,
            databaseName,
        });
        const { rows } = await this.runQuery(
            query,
            {},
            undefined,
            databaseName ? [databaseName] : undefined,
        );
        return rows.map((row: Record<string, AnyType>) => ({
            database: row.table_catalog,
            schema: row.table_schema,
            table: row.table_name,
        }));
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        if (tableName && database && schema) {
            // When having all three we can use the catalog to get the fields using the correct connection args and table names
            return this.getCatalog([{ database, schema, table: tableName }]);
        }

        const query = `
            SELECT TABLE_CATALOG as "table_catalog",
                   TABLE_SCHEMA  as "table_schema",
                   TABLE_NAME    as "table_name",
                   COLUMN_NAME   as "column_name",
                   DATA_TYPE            as "data_type"
            FROM information_schema.columns
            WHERE TABLE_NAME = ?
            ${schema ? 'AND TABLE_SCHEMA = ?' : ''}
            ${database ? 'AND TABLE_CATALOG = ?' : ''}
            ORDER BY 1, 2, 3;
        `;
        const values = [tableName];
        if (schema) {
            values.push(schema);
        }
        if (database) {
            values.push(database);
        }
        console.debug('Running query to fetch fields: ', {
            query,
            values,
        });
        const { rows } = await this.runQuery(query, tags, undefined, values);
        return this.parseWarehouseCatalog(rows, mapFieldType);
    }

    /*
     * This function is used to format the error message for the user.
     * It is used to replace the {snowflakeTable} and {snowflakeSchema} with the actual table and schema names.
     * Sample custom template: You don't have access to the {snowflakeTable} table. Please go to '{snowflakeSchema}' and request access
     */
    private formatCustomErrorMessage(
        originalMessage: string,
        customTemplate: string,
    ): string {
        let formattedMessage = customTemplate;

        const objectMatch = originalMessage.match(
            /Object '([^']+)' does not exist or not authorized/i,
        );

        const schemaMatch = originalMessage.match(
            /Schema '([^']+)' does not exist or not authorized/i,
        );

        if (objectMatch) {
            const parts = objectMatch[1].split('.');

            if (parts.length >= 3) {
                const snowflakeTable = parts[parts.length - 1];
                const snowflakeSchema = parts[parts.length - 2];

                formattedMessage = formattedMessage
                    .replace(/\{snowflakeTable\}/g, snowflakeTable)
                    .replace(/\{snowflakeSchema\}/g, snowflakeSchema);
            }
        } else if (schemaMatch) {
            const parts = schemaMatch[1].split('.');
            const snowflakeSchema = parts[parts.length - 1];

            formattedMessage = formattedMessage
                .replace(/\{snowflakeTable\}/g, snowflakeSchema)
                .replace(/\{snowflakeSchema\}/g, snowflakeSchema);
        }

        return formattedMessage;
    }

    /*
     * This function is used to format the warehouse error message for the user.
     * It is used to replace the {warehouseName} with the actual warehouse name.
     * Sample custom template: You don't have access to warehouse {warehouseName}. Please reach out to your admin.
     */
    private formatWarehouseErrorMessage(customTemplate: string): string {
        let formattedMessage = customTemplate;

        // Replace warehouse name placeholder with the actual warehouse from connection options
        if (this.connectionOptions.warehouse) {
            formattedMessage = formattedMessage.replace(
                /\{warehouseName\}/g,
                this.connectionOptions.warehouse,
            );
        }

        return formattedMessage;
    }

    parseError(error: SnowflakeError, query: string = '') {
        // if the error has no code or data, return a generic error
        if (!error?.code && !error.data) {
            return new WarehouseQueryError(error?.message || 'Unknown error');
        }

        const originalMessage = error?.message || 'Unknown error';

        // Check for unauthorized access errors and use custom message if configured
        if (originalMessage.includes('does not exist or not authorized')) {
            const customErrorMessage =
                process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE?.replace(
                    /\\n/g,
                    '\n',
                );
            if (customErrorMessage) {
                const formattedMessage = this.formatCustomErrorMessage(
                    originalMessage,
                    customErrorMessage,
                );
                return new WarehouseQueryError(formattedMessage);
            }
        }

        // Check for warehouse access errors and use custom message if configured
        if (
            originalMessage.includes(
                'No active warehouse selected in the current session',
            )
        ) {
            const customErrorMessage =
                process.env.SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE?.replace(
                    /\\n/g,
                    '\n',
                );
            if (customErrorMessage) {
                const formattedMessage =
                    this.formatWarehouseErrorMessage(customErrorMessage);
                return new WarehouseQueryError(formattedMessage);
            }
            // Append the warehouse configured on the connection so admins can
            // tell apart "warehouse was set but Snowflake rejected the
            // selection" from "no warehouse was configured at all" — the
            // latter usually means the credentials are missing the field.
            const configured = this.connectionOptions.warehouse;
            const detail = configured
                ? ` (configured warehouse: "${configured}")`
                : ' (no warehouse was configured on the connection — credentials may be missing this field)';
            return new WarehouseQueryError(`${originalMessage}${detail}`);
        }

        // pull error type from data object
        const errorType = error.data?.type || error.code;
        switch (errorType) {
            // if query is mistyped (compilation error)
            case 'COMPILATION':
                // The query will look something like this:
                // 'WITH user_sql AS (
                //     SELECT * FROM `lightdash-database-staging`.`e2e_jaffle_shop`.`users`;
                // ) select * from user_sql limit 500';
                // We want to check for the first part of the query, if so strip the first and last lines
                const queryMatch = query.match(
                    /(?:WITH\s+[a-zA-Z_]+\s+AS\s*\()\s*?/i,
                );
                // also match the line number and character number in the error message
                const lineMatch = error.message.match(
                    /line\s+(\d+)\s+at\s+position\s+(\d+)/,
                );
                if (lineMatch) {
                    // parse out line number and character number
                    let lineNumber = Number(lineMatch[1]) || undefined;
                    const charNumber = Number(lineMatch[2]) + 1 || undefined; // Note the + 1 as it is 0 indexed
                    // if query match, subtract the number of lines from the line number
                    if (queryMatch && lineNumber && lineNumber > 1) {
                        lineNumber -= 1;
                    }
                    // re-inject the line and character number into the error message
                    const message = error.message.replace(
                        /line\s+\d+\s+at\s+position\s+\d+/,
                        `line ${lineNumber} at position ${charNumber}`,
                    );
                    // return a new error with the line and character number in data object
                    return new WarehouseQueryError(message, {
                        lineNumber,
                        charNumber,
                    });
                }
                break;
            default:
                break;
        }
        // otherwise return a generic error
        return new WarehouseQueryError(originalMessage);
    }
}
