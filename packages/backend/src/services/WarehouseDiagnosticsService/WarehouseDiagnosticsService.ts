import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ConnectionCheck,
    ConnectionCheckDiagnosis,
    ConnectionDiagnosticResult,
    CreateSnowflakeCredentials,
    CreateWarehouseCredentials,
    ForbiddenError,
    ParameterError,
    ProjectType,
    RegisteredAccount,
    WarehouseTypes,
} from '@lightdash/common';
import {
    mapSnowflakeDiagnosticError,
    SnowflakeDiagnosticError,
    SnowflakeDiagnosticErrorCategory,
    SnowflakeDiagnosticIdentity,
    SnowflakeDiagnosticSession,
    SnowflakeSchemaSummary,
    SnowflakeWarehouseClient,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import { BaseService } from '../BaseService';

const SNOWFLAKE_DOCS_URL =
    'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse-connection';

const SAFE_IDENTIFIER = /^[A-Za-z0-9_$]+$/;

const formatIdentifier = (identifier: string): string => {
    if (!SAFE_IDENTIFIER.test(identifier)) {
        throw new ParameterError(
            'Snowflake identifiers may only contain letters, numbers, underscores, and dollar signs',
        );
    }
    return `"${identifier.toUpperCase()}"`;
};

const tryFormatIdentifier = (identifier: string | undefined): string | null => {
    if (!identifier || !SAFE_IDENTIFIER.test(identifier)) {
        return null;
    }
    return `"${identifier.toUpperCase()}"`;
};

export type SnowflakeGrantScriptParams = {
    roleName: string;
    databaseName: string;
    warehouseName: string;
    userName?: string;
    schemas?: string[];
};

export const generateSnowflakeGrantScript = (
    params: SnowflakeGrantScriptParams,
): string => {
    const role = formatIdentifier(params.roleName);
    const database = formatIdentifier(params.databaseName);
    const warehouse = formatIdentifier(params.warehouseName);
    const statements = [
        `CREATE ROLE IF NOT EXISTS ${role};`,
        `GRANT USAGE ON WAREHOUSE ${warehouse} TO ROLE ${role};`,
        `GRANT USAGE ON DATABASE ${database} TO ROLE ${role};`,
    ];

    if (params.schemas && params.schemas.length > 0) {
        params.schemas.forEach((schemaName) => {
            const schema = `${database}.${formatIdentifier(schemaName)}`;
            statements.push(
                `GRANT USAGE ON SCHEMA ${schema} TO ROLE ${role};`,
                `GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ROLE ${role};`,
                `GRANT SELECT ON FUTURE TABLES IN SCHEMA ${schema} TO ROLE ${role};`,
            );
        });
    } else {
        statements.push(
            `GRANT USAGE ON ALL SCHEMAS IN DATABASE ${database} TO ROLE ${role};`,
            `GRANT SELECT ON ALL TABLES IN DATABASE ${database} TO ROLE ${role};`,
            `GRANT SELECT ON FUTURE TABLES IN DATABASE ${database} TO ROLE ${role};`,
        );
    }

    if (params.userName) {
        statements.push(
            `GRANT ROLE ${role} TO USER ${formatIdentifier(params.userName)};`,
        );
    }

    return statements.join('\n');
};

type GenericDiagnosticClient = {
    test(): Promise<void>;
};

export type SnowflakeDiagnosticClient = Pick<
    SnowflakeWarehouseClient,
    | 'resolveDiagnosticHost'
    | 'openDiagnosticConnection'
    | 'authenticateDiagnosticConnection'
    | 'listDiagnosticTables'
    | 'selectOneDiagnosticConnection'
    | 'closeDiagnosticConnection'
>;

export type SnowflakeConnectionValidationClient = Pick<
    SnowflakeWarehouseClient,
    | 'openDiagnosticConnection'
    | 'authenticateDiagnosticConnection'
    | 'useDiagnosticWarehouse'
    | 'useDiagnosticDatabase'
    | 'getSchemaSummaries'
    | 'closeDiagnosticConnection'
>;

type WarehouseDiagnosticsServiceArguments = {
    warehouseClientFactory?: (
        credentials: CreateWarehouseCredentials,
    ) => GenericDiagnosticClient;
    snowflakeClientFactory?: (
        credentials: CreateSnowflakeCredentials,
    ) => SnowflakeDiagnosticClient;
};

const databaseRemedy = (
    credentials: CreateSnowflakeCredentials,
    identity: SnowflakeDiagnosticIdentity | null,
): string | null => {
    const database = tryFormatIdentifier(credentials.database);
    const role = tryFormatIdentifier(identity?.role ?? credentials.role);
    if (!database || !role) {
        return null;
    }
    return [
        `GRANT USAGE ON DATABASE ${database} TO ROLE ${role};`,
        `GRANT USAGE ON ALL SCHEMAS IN DATABASE ${database} TO ROLE ${role};`,
        `GRANT SELECT ON ALL TABLES IN DATABASE ${database} TO ROLE ${role};`,
        `GRANT SELECT ON FUTURE TABLES IN DATABASE ${database} TO ROLE ${role};`,
    ].join('\n');
};

const warehouseRemedy = (
    credentials: CreateSnowflakeCredentials,
    identity: SnowflakeDiagnosticIdentity | null,
): string | null => {
    const warehouse = tryFormatIdentifier(credentials.warehouse);
    const role = tryFormatIdentifier(identity?.role ?? credentials.role);
    if (!warehouse || !role) {
        return null;
    }
    return `GRANT USAGE ON WAREHOUSE ${warehouse} TO ROLE ${role};`;
};

const databaseUsageRemedy = (
    credentials: CreateSnowflakeCredentials,
    identity: SnowflakeDiagnosticIdentity | null,
): string | null => {
    const database = tryFormatIdentifier(credentials.database);
    const role = tryFormatIdentifier(identity?.role ?? credentials.role);
    if (!database || !role) {
        return null;
    }
    return `GRANT USAGE ON DATABASE ${database} TO ROLE ${role};`;
};

const diagnosisForCategory = (
    category: SnowflakeDiagnosticErrorCategory,
    credentials: CreateSnowflakeCredentials,
    identity: SnowflakeDiagnosticIdentity | null,
    code: string | null,
): ConnectionCheckDiagnosis => {
    const role = identity?.role ?? credentials.role ?? 'the configured role';
    const codeDetail = code ? ` Snowflake error code: ${code}.` : '';
    switch (category) {
        case 'account_identifier':
            return {
                title: 'Snowflake account not found',
                detail: `Check the account identifier and access URL, then try again.${codeDetail}`,
                remedySql: null,
                docsUrl: SNOWFLAKE_DOCS_URL,
            };
        case 'authentication':
            return {
                title: 'Authentication failed',
                detail: `Check the username and password, then try again.${codeDetail}`,
                remedySql: null,
                docsUrl: SNOWFLAKE_DOCS_URL,
            };
        case 'private_key':
            return {
                title: 'Private key authentication failed',
                detail: `Check that the private key is valid PEM, its passphrase is correct, and its public key is assigned to the Snowflake user.${codeDetail}`,
                remedySql: null,
                docsUrl: SNOWFLAKE_DOCS_URL,
            };
        case 'database_access':
            return {
                title: 'Role cannot access the database',
                detail: `Role ${role} authenticated, but cannot see tables in database ${credentials.database}. Ask a Snowflake administrator to grant read access.${codeDetail}`,
                remedySql: databaseRemedy(credentials, identity),
                docsUrl: SNOWFLAKE_DOCS_URL,
            };
        case 'warehouse_access':
            return {
                title: 'Role cannot use the warehouse',
                detail: `Role ${role} cannot use warehouse ${credentials.warehouse}. Ask a Snowflake administrator to grant warehouse usage.${codeDetail}`,
                remedySql: warehouseRemedy(credentials, identity),
                docsUrl: SNOWFLAKE_DOCS_URL,
            };
        case 'network_policy':
            return {
                title: 'Connection blocked by network policy',
                detail: `Ask a Snowflake administrator to allow the Lightdash deployment IP in the applicable network policy.${codeDetail}`,
                remedySql: null,
                docsUrl: SNOWFLAKE_DOCS_URL,
            };
        case 'unknown':
            return {
                title: 'Connection failed',
                detail: `Snowflake could not complete this connection check. Review the connection settings and try again.${codeDetail}`,
                remedySql: null,
                docsUrl: SNOWFLAKE_DOCS_URL,
            };
        default:
            return assertUnreachable(category, 'Unknown diagnostic category');
    }
};

const diagnosisForCheck = (
    checkId: ConnectionCheck['id'],
    category: SnowflakeDiagnosticErrorCategory,
    credentials: CreateSnowflakeCredentials,
    identity: SnowflakeDiagnosticIdentity | null,
    code: string | null,
): ConnectionCheckDiagnosis => {
    const role = identity?.role ?? credentials.role ?? 'the configured role';
    const codeDetail = code ? ` Snowflake error code: ${code}.` : '';
    if (checkId === 'use_warehouse' && category === 'warehouse_access') {
        return {
            title: 'Cannot use the selected warehouse',
            detail: `Role ${role} cannot use warehouse ${credentials.warehouse}. Ask a Snowflake administrator to grant warehouse usage.${codeDetail}`,
            remedySql: warehouseRemedy(credentials, identity),
            docsUrl: SNOWFLAKE_DOCS_URL,
        };
    }
    if (checkId === 'use_database' && category === 'database_access') {
        return {
            title: 'Cannot use the selected database',
            detail: `Role ${role} cannot use database ${credentials.database}. Ask a Snowflake administrator to grant database usage.${codeDetail}`,
            remedySql: databaseUsageRemedy(credentials, identity),
            docsUrl: SNOWFLAKE_DOCS_URL,
        };
    }
    return diagnosisForCategory(category, credentials, identity, code);
};

const diagnosticCategoryForCheck = (
    checkId: ConnectionCheck['id'],
    category: SnowflakeDiagnosticErrorCategory,
): SnowflakeDiagnosticErrorCategory => {
    if (category !== 'unknown') {
        return category;
    }
    switch (checkId) {
        case 'use_warehouse':
            return 'warehouse_access';
        case 'use_database':
        case 'list_schemas':
            return 'database_access';
        case 'resolve_host':
        case 'open_connection':
        case 'authenticate':
        case 'select_1':
            return category;
        default:
            return assertUnreachable(checkId, 'Unknown connection check');
    }
};

export type SnowflakeConnectionValidation = {
    diagnostic: ConnectionDiagnosticResult;
    schemas: SnowflakeSchemaSummary[] | null;
};

export class WarehouseDiagnosticsService extends BaseService {
    private readonly warehouseClientFactory: (
        credentials: CreateWarehouseCredentials,
    ) => GenericDiagnosticClient;

    private readonly snowflakeClientFactory: (
        credentials: CreateSnowflakeCredentials,
    ) => SnowflakeDiagnosticClient;

    constructor(args: WarehouseDiagnosticsServiceArguments = {}) {
        super();
        this.warehouseClientFactory =
            args.warehouseClientFactory ?? warehouseClientFromCredentials;
        this.snowflakeClientFactory =
            args.snowflakeClientFactory ??
            ((credentials) => new SnowflakeWarehouseClient(credentials));
    }

    private assertCanCreateProject(account: RegisteredAccount): void {
        const { organizationUuid } = account.organization;
        const auditedAbility = this.createAuditedAbility(account);
        if (
            !organizationUuid ||
            auditedAbility.cannot(
                'create',
                subject('Project', {
                    organizationUuid,
                    type: ProjectType.DEFAULT,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async testGenericConnection(
        credentials: CreateWarehouseCredentials,
    ): Promise<ConnectionDiagnosticResult> {
        const start = performance.now();
        try {
            const client = this.warehouseClientFactory(credentials);
            await client.test();
            return {
                status: 'passed',
                checks: [
                    {
                        id: 'open_connection',
                        label: 'Open connection',
                        status: 'passed',
                        durationMs: performance.now() - start,
                        diagnosis: null,
                    },
                ],
            };
        } catch {
            return {
                status: 'failed',
                checks: [
                    {
                        id: 'open_connection',
                        label: 'Open connection',
                        status: 'failed',
                        durationMs: performance.now() - start,
                        diagnosis: {
                            title: 'Connection failed',
                            detail: 'The warehouse rejected the connection test. Review the connection settings and try again.',
                            remedySql: null,
                            docsUrl: null,
                        },
                    },
                ],
            };
        }
    }

    private async testSnowflakeConnection(
        credentials: CreateSnowflakeCredentials,
    ): Promise<ConnectionDiagnosticResult> {
        const client = this.snowflakeClientFactory(credentials);
        let session: SnowflakeDiagnosticSession | null = null;
        let identity: SnowflakeDiagnosticIdentity | null = null;
        const checks: ConnectionCheck[] = [
            ['resolve_host', 'Resolve account host'],
            ['open_connection', 'Open connection'],
            ['authenticate', 'Authenticate'],
            ['list_schemas', 'List schemas and tables'],
            ['select_1', 'Run test query'],
        ].map(([id, label]) => ({
            id: id as ConnectionCheck['id'],
            label,
            status: 'skipped',
            durationMs: null,
            diagnosis: null,
        }));
        const actions = [
            async () => client.resolveDiagnosticHost(),
            async () => {
                session = await client.openDiagnosticConnection();
            },
            async () => {
                identity = await client.authenticateDiagnosticConnection(
                    session!,
                );
            },
            async () => {
                const result = await client.listDiagnosticTables(session!);
                if (result.tableCount === 0) {
                    throw new Error('No visible Snowflake tables');
                }
            },
            async () => client.selectOneDiagnosticConnection(session!),
        ];

        const runCheck = async (
            index: number,
        ): Promise<ConnectionDiagnosticResult> => {
            if (index >= checks.length) {
                return { status: 'passed', checks };
            }

            const start = performance.now();
            try {
                await actions[index]();
                checks[index] = {
                    ...checks[index],
                    status: 'passed',
                    durationMs: performance.now() - start,
                };
                return await runCheck(index + 1);
            } catch (error) {
                const mapped =
                    error instanceof SnowflakeDiagnosticError
                        ? error.details
                        : mapSnowflakeDiagnosticError(error);
                const category =
                    checks[index].id === 'list_schemas' &&
                    mapped.category === 'unknown'
                        ? 'database_access'
                        : mapped.category;
                checks[index] = {
                    ...checks[index],
                    status: 'failed',
                    durationMs: performance.now() - start,
                    diagnosis: diagnosisForCategory(
                        category,
                        credentials,
                        identity,
                        mapped.code,
                    ),
                };
                return { status: 'failed', checks };
            }
        };

        try {
            return await runCheck(0);
        } finally {
            if (session) {
                await client
                    .closeDiagnosticConnection(session)
                    .catch(() => undefined);
            }
        }
    }

    async testConnection(
        account: RegisteredAccount,
        credentials: CreateWarehouseCredentials,
    ): Promise<ConnectionDiagnosticResult> {
        this.assertCanCreateProject(account);
        return this.diagnoseConnection(credentials);
    }

    async diagnoseConnection(
        credentials: CreateWarehouseCredentials,
    ): Promise<ConnectionDiagnosticResult> {
        if (credentials.type !== WarehouseTypes.SNOWFLAKE) {
            return this.testGenericConnection(credentials);
        }
        return this.testSnowflakeConnection(credentials);
    }

    async validateSnowflakeConnection(
        credentials: CreateSnowflakeCredentials,
        client: SnowflakeConnectionValidationClient,
    ): Promise<SnowflakeConnectionValidation> {
        this.logger.debug('Validating Snowflake onboarding connection');
        let session: SnowflakeDiagnosticSession | null = null;
        let identity: SnowflakeDiagnosticIdentity | null = null;
        let schemas: SnowflakeSchemaSummary[] | null = null;
        const checks: ConnectionCheck[] = [
            ['open_connection', 'Open connection'],
            ['authenticate', 'Authenticate'],
            ['use_warehouse', 'Use warehouse'],
            ['use_database', 'Use database'],
            ['list_schemas', 'List schemas'],
        ].map(([id, label]) => ({
            id: id as ConnectionCheck['id'],
            label,
            status: 'skipped',
            durationMs: null,
            diagnosis: null,
        }));
        const actions: (() => Promise<void>)[] = [
            async () => {
                session = await client.openDiagnosticConnection();
            },
            async () => {
                identity = await client.authenticateDiagnosticConnection(
                    session!,
                );
            },
            async () => {
                if (credentials.warehouse) {
                    await client.useDiagnosticWarehouse(
                        session!,
                        credentials.warehouse,
                    );
                }
            },
            async () => {
                if (credentials.database) {
                    await client.useDiagnosticDatabase(
                        session!,
                        credentials.database,
                    );
                }
            },
            async () => {
                if (credentials.database) {
                    schemas = await client.getSchemaSummaries(
                        credentials.database,
                    );
                }
            },
        ];
        const shouldRun = [
            true,
            true,
            Boolean(credentials.warehouse),
            Boolean(credentials.database),
            Boolean(credentials.database),
        ];

        const runCheck = async (index: number): Promise<void> => {
            if (index >= checks.length) {
                return;
            }
            if (!shouldRun[index]) {
                await runCheck(index + 1);
                return;
            }
            const start = performance.now();
            try {
                await actions[index]();
                checks[index] = {
                    ...checks[index],
                    status: 'passed',
                    durationMs: performance.now() - start,
                };
                await runCheck(index + 1);
            } catch (error) {
                const mapped =
                    error instanceof SnowflakeDiagnosticError
                        ? error.details
                        : mapSnowflakeDiagnosticError(error);
                const category = diagnosticCategoryForCheck(
                    checks[index].id,
                    mapped.category,
                );
                checks[index] = {
                    ...checks[index],
                    status: 'failed',
                    durationMs: performance.now() - start,
                    diagnosis: diagnosisForCheck(
                        checks[index].id,
                        category,
                        credentials,
                        identity,
                        mapped.code,
                    ),
                };
            }
        };

        try {
            await runCheck(0);
            return {
                diagnostic: {
                    status: checks.some((check) => check.status === 'failed')
                        ? 'failed'
                        : 'passed',
                    checks,
                },
                schemas,
            };
        } finally {
            if (session) {
                await client
                    .closeDiagnosticConnection(session)
                    .catch(() => undefined);
            }
        }
    }

    async getGrantScript(
        account: RegisteredAccount,
        params: SnowflakeGrantScriptParams,
    ): Promise<{ sql: string }> {
        this.assertCanCreateProject(account);
        return { sql: generateSnowflakeGrantScript(params) };
    }
}
