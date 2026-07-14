import {
    CreateSnowflakeCredentials,
    DimensionType,
    SnowflakeAuthenticationType,
} from '@lightdash/common';
import { createConnection } from 'snowflake-sdk';
import { Readable } from 'stream';
import type { Mock } from 'vitest';
import {
    mapFieldType,
    mapSnowflakeDiagnosticError,
    SnowflakeDiagnosticError,
    SnowflakeWarehouseClient,
} from './SnowflakeWarehouseClient';
import {
    columns,
    credentials,
    expectedFields,
    expectedRow,
    expectedWarehouseSchema,
    queryColumnsMock,
} from './SnowflakeWarehouseClient.mock';
import { config } from './WarehouseClient.mock';

const mockStreamRows = () =>
    new Readable({
        objectMode: true,
        read() {
            this.push(expectedRow);
            this.push(null);
        },
    });

const executeMock = vi.fn(({ sqlText, complete }) => {
    complete(
        undefined,
        {
            streamRows: mockStreamRows,
            getColumns: () => queryColumnsMock,
            getQueryId: () => 'queryId',
            getSqlText: () => sqlText,
        },
        [],
    );
});

const getResultsFromQueryIdMock = vi.fn(({ sqlText, queryId }) => ({
    streamRows: mockStreamRows,
    getColumns: () => queryColumnsMock,
    getQueryId: () => queryId,
    getNumRows: () => 1,
}));

vi.mock('snowflake-sdk', async () => ({
    ...(
        await vi.importActual<{ default: typeof import('snowflake-sdk') }>(
            'snowflake-sdk',
        )
    ).default,
    createConnection: vi.fn(() => ({
        connect: vi.fn((callback) => callback(null, {})),
        execute: executeMock,
        destroy: vi.fn((callback) => callback(null, {})),
        getResultsFromQueryId: getResultsFromQueryIdMock,
        getQueryStatus: vi.fn(() => 'SUCCESS'),
        isStillRunning: vi.fn(() => false),
    })),
}));

describe('SnowflakeWarehouseClient', () => {
    it('expect query rows', async () => {
        const warehouse = new SnowflakeWarehouseClient(credentials);
        const results = await warehouse.runQuery('fake sql');

        expect(results.fields).toEqual(expectedFields);
        expect(results.rows[0]).toEqual(expectedRow);
    });

    it('escapes single quotes in query tags for session SQL', () => {
        expect(
            SnowflakeWarehouseClient.formatQueryTag({
                user_attribute_company: "O'Reilly Media",
            }),
        ).toBe('{"user_attribute_company":"O\'\'Reilly Media"}');
    });

    it('limits query tag value to Snowflake maximum length', () => {
        expect(
            SnowflakeWarehouseClient.formatQueryTag({
                user_attribute_company: 'x'.repeat(3000),
            }).length,
        ).toBe(2000);
    });

    it('keeps long escaped query tags safe for Snowflake session SQL', () => {
        const result = SnowflakeWarehouseClient.formatQueryTag({
            user_attribute_company: "'".repeat(3000),
        });
        const singleQuoteRuns = result.match(/'+/g) ?? [];

        expect(result.length).toBeGreaterThan(2000);
        expect(result.replace(/''/g, "'")).toHaveLength(2000);
        expect(singleQuoteRuns.every((run) => run.length % 2 === 0)).toBe(true);
    });

    it('expect schema with snowflake types mapped to dimension types', async () => {
        (createConnection as Mock).mockImplementationOnce(() => ({
            connect: vi.fn((callback) => callback(null, {})),
            execute: vi.fn(({ sqlText, complete }) => {
                complete(
                    undefined,
                    { getColumns: () => queryColumnsMock },
                    columns,
                );
            }),
            destroy: vi.fn((callback) => callback(null, {})),
        }));
        const warehouse = new SnowflakeWarehouseClient(credentials);
        expect(await warehouse.getCatalog(config)).toEqual(
            expectedWarehouseSchema,
        );
    });

    it('returns metadata row counts for tables and null for views', async () => {
        const warehouse = new SnowflakeWarehouseClient(credentials);
        const runQuery = vi.spyOn(warehouse, 'runQuery').mockResolvedValue({
            fields: {},
            rows: [
                {
                    table_catalog: 'ANALYTICS',
                    table_schema: 'PUBLIC',
                    table_name: 'ORDERS',
                    table_type: 'BASE TABLE',
                    row_count: 12800,
                },
                {
                    table_catalog: 'ANALYTICS',
                    table_schema: 'PUBLIC',
                    table_name: 'LATEST_ORDERS',
                    table_type: 'VIEW',
                    row_count: null,
                },
            ],
        });

        await expect(warehouse.getAllTables()).resolves.toEqual([
            {
                database: 'ANALYTICS',
                schema: 'PUBLIC',
                table: 'ORDERS',
                tableType: 'table',
                rowCount: 12800,
            },
            {
                database: 'ANALYTICS',
                schema: 'PUBLIC',
                table: 'LATEST_ORDERS',
                tableType: 'view',
                rowCount: null,
            },
        ]);
        expect(runQuery).toHaveBeenCalledWith(
            expect.stringContaining(
                "WHEN TABLE_TYPE = 'BASE TABLE' THEN ROW_COUNT",
            ),
            {},
            undefined,
            undefined,
        );
    });

    it('replaces an existing named PAT and scopes the new token to a role', async () => {
        const execute = vi.fn(
            ({ sqlText, complete }: { sqlText: string; complete: Mock }) => {
                let rows: Record<string, string>[] = [];
                if (sqlText.startsWith('SHOW USER')) {
                    rows = [{ name: 'LIGHTDASH_ONBOARDING_11111111' }];
                } else if (sqlText.startsWith('ALTER USER ADD')) {
                    rows = [{ TOKEN_SECRET: 'pat-secret' }];
                }
                complete(
                    undefined,
                    { getColumns: () => queryColumnsMock },
                    rows,
                );
            },
        );
        vi.mocked(createConnection).mockImplementationOnce(
            () =>
                ({
                    connectAsync: vi.fn((callback) => {
                        callback(undefined, {});
                    }),
                    execute,
                }) as never,
        );
        const warehouse = new SnowflakeWarehouseClient({
            ...credentials,
            authenticationType: SnowflakeAuthenticationType.EXTERNAL_BROWSER,
        });

        await expect(
            warehouse.createProgrammaticAccessToken(
                'LIGHTDASH_ONBOARDING_11111111',
                365,
                1440,
                "ANALYTICS'ROLE",
            ),
        ).resolves.toEqual({
            tokenName: 'LIGHTDASH_ONBOARDING_11111111',
            tokenSecret: 'pat-secret',
        });
        expect(execute).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                sqlText:
                    'ALTER USER REMOVE PROGRAMMATIC ACCESS TOKEN LIGHTDASH_ONBOARDING_11111111',
            }),
        );
        expect(execute).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                sqlText: expect.stringContaining(
                    "ROLE_RESTRICTION = 'ANALYTICS''ROLE'",
                ),
            }),
        );
    });

    it('discovers session defaults and capped inventory for external browser sessions', async () => {
        const execute = vi.fn(
            ({ sqlText, complete }: { sqlText: string; complete: Mock }) => {
                let rows: Record<string, string | null>[] = [];
                if (sqlText.startsWith('SELECT CURRENT_ROLE')) {
                    rows = [
                        {
                            ROLE: 'ANALYST',
                            WAREHOUSE: 'TRANSFORMING',
                            DATABASE: 'ANALYTICS',
                            SCHEMA: 'PUBLIC',
                        },
                    ];
                } else if (sqlText.startsWith('SHOW DATABASES')) {
                    rows = Array.from({ length: 125 }, (_, index) => ({
                        name: `DATABASE_${index}`,
                    }));
                } else if (sqlText.startsWith('SHOW WAREHOUSES')) {
                    rows = [{ name: 'TRANSFORMING' }];
                } else if (sqlText.startsWith('SHOW GRANTS')) {
                    rows = [{ role: 'ANALYST' }, { role: 'REPORTER' }];
                }
                complete(
                    undefined,
                    { getColumns: () => queryColumnsMock },
                    rows,
                );
            },
        );
        vi.mocked(createConnection).mockImplementationOnce(
            () =>
                ({
                    connectAsync: vi.fn((callback) => {
                        callback(undefined, {});
                    }),
                    execute,
                }) as never,
        );
        const warehouse = new SnowflakeWarehouseClient({
            ...credentials,
            authenticationType: SnowflakeAuthenticationType.EXTERNAL_BROWSER,
        });

        await expect(
            warehouse.getSessionDiscovery('user.name@example.com'),
        ).resolves.toEqual({
            defaults: {
                role: 'ANALYST',
                warehouse: 'TRANSFORMING',
                database: 'ANALYTICS',
                schema: 'PUBLIC',
            },
            inventory: {
                databases: Array.from(
                    { length: 100 },
                    (_, index) => `DATABASE_${index}`,
                ),
                warehouses: ['TRANSFORMING'],
                roles: ['ANALYST', 'REPORTER', 'PUBLIC'],
            },
        });
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText:
                    'SHOW GRANTS TO USER "user.name@example.com" LIMIT 100',
            }),
        );
    });
});

describe('mapSnowflakeDiagnosticError', () => {
    it.each([
        [
            { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND host' },
            'account_identifier',
        ],
        [
            {
                code: 250001,
                message: 'Incorrect username or password was specified',
            },
            'authentication',
        ],
        [
            {
                code: 'ERR_OSSL_PEM_BAD_BASE64_DECODE',
                message: 'PEM routines failed',
            },
            'private_key',
        ],
        [
            { code: 390144, message: 'Authentication token rejected' },
            'private_key',
        ],
        [
            {
                code: 390422,
                message: 'Incoming request rejected',
            },
            'network_policy',
        ],
        [
            {
                code: '002003',
                message:
                    "Database 'ANALYTICS' does not exist or not authorized",
            },
            'database_access',
        ],
        [
            {
                code: '002043',
                message: "Warehouse 'COMPUTE' does not exist or not authorized",
            },
            'warehouse_access',
        ],
        [{ code: 'UNKNOWN', message: 'socket closed unexpectedly' }, 'unknown'],
    ])('maps %o to %s without exposing its raw message', (error, category) => {
        const result = mapSnowflakeDiagnosticError(error);

        expect(result.category).toBe(category);
        expect(result.code).toBe(String(error.code));
        expect(result.sanitizedMessage).not.toContain(error.message);
    });

    it('keeps the raw error non-enumerable for internal inspection', () => {
        const rawError = new Error('sensitive socket detail');
        const error = new SnowflakeDiagnosticError(rawError);

        expect(error.getRawError()).toBe(rawError);
        expect(JSON.stringify(error)).not.toContain('sensitive socket detail');
    });
});

describe('SnowflakeTypeParsing', () => {
    it('expect NUMBER(x,x) to be a number', () => {
        expect(mapFieldType('NUMBER(12,10)')).toEqual(DimensionType.NUMBER);
    });
    it('expect VARCHAR(x) to be a string', () => {
        expect(mapFieldType('VARCHAR(12)')).toEqual(DimensionType.STRING);
    });
});

describe('SnowflakeErrorParsing', () => {
    let warehouse: SnowflakeWarehouseClient;
    const originalEnv = process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE;

    beforeEach(() => {
        warehouse = new SnowflakeWarehouseClient(credentials);
    });

    afterEach(() => {
        // Restore original environment variable
        if (originalEnv) {
            process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE = originalEnv;
        } else {
            delete process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE;
        }
    });

    it('should return custom error message when SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE is set', () => {
        // Set environment variable
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            "You don't have access to the {snowflakeTable} table. Please go to 'analytics_{snowflakeSchema}' in sailpoint and request access";

        const error = {
            message:
                "SQL compilation error: Object 'SNOWFLAKE_DATABASE_STAGING.JAFFLE.EVENTS' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe(
            "You don't have access to the EVENTS table. Please go to 'analytics_JAFFLE' in sailpoint and request access",
        );
    });

    it('should return original error message when SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE is not set', () => {
        // Make sure environment variable is not set
        delete process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE;

        const error = {
            message:
                "SQL compilation error: Object 'SNOWFLAKE_DATABASE_STAGING.JAFFLE.EVENTS' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe(
            "SQL compilation error: Object 'SNOWFLAKE_DATABASE_STAGING.JAFFLE.EVENTS' does not exist or not authorized.",
        );
    });

    it('should return original error message for non-unauthorized errors', () => {
        // Set environment variable
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            "You don't have access to the {snowflakeTable} table. Please go to 'analytics_{snowflakeSchema}' in sailpoint and request access";

        const error = {
            message: 'Some other SQL error',
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe('Some other SQL error');
    });

    it('should handle table names with different formats', () => {
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            'Access denied for {snowflakeTable} in {snowflakeSchema}';

        const error = {
            message:
                "Object 'DB.MY_SCHEMA.MY_TABLE' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe('Access denied for MY_TABLE in MY_SCHEMA');
    });

    it('should extract schema name from Schema-level errors', () => {
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            "You don't have access to the {snowflakeTable} table. Please go to 'analytics_{snowflakeSchema}' in sailpoint and request access";

        const error = {
            message:
                "SQL compilation error: Schema 'ANALYTICS_DB.RPT_VERIFICATION' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe(
            "You don't have access to the RPT_VERIFICATION table. Please go to 'analytics_RPT_VERIFICATION' in sailpoint and request access",
        );
    });

    it('should handle Schema errors with different formats', () => {
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            'Access denied for {snowflakeTable} in {snowflakeSchema}';

        const error = {
            message: "Schema 'DB.MY_SCHEMA' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe('Access denied for MY_SCHEMA in MY_SCHEMA');
    });

    it('should handle errors without table information gracefully', () => {
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            "You don't have access to the {snowflakeTable} table. Please go to 'analytics_{snowflakeSchema}' in sailpoint and request access";

        const error = {
            message:
                "Object 'INCOMPLETE_TABLE_NAME' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        // Should still use custom message but without variable replacement
        expect(result.message).toBe(
            "You don't have access to the {snowflakeTable} table. Please go to 'analytics_{snowflakeSchema}' in sailpoint and request access",
        );
    });

    it('should convert literal \\n escape sequences into real newlines', () => {
        process.env.SNOWFLAKE_UNAUTHORIZED_ERROR_MESSAGE =
            'No access to {snowflakeTable}.\\n1) Step one\\n2) Step two';

        const error = {
            message:
                "Object 'DB.MY_SCHEMA.MY_TABLE' does not exist or not authorized.",
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe(
            'No access to MY_TABLE.\n1) Step one\n2) Step two',
        );
        expect(result.message).not.toContain('\\n');
    });
});

describe('SnowflakeWarehouseClient.parseError - warehouse access errors', () => {
    let warehouse: SnowflakeWarehouseClient;

    beforeEach(() => {
        const mockConnectionOptions = {
            account: 'test-account',
            user: 'test-user',
            password: 'test-password',
            warehouse: 'TEST_WAREHOUSE',
            database: 'test-database',
        };

        warehouse = new SnowflakeWarehouseClient(
            mockConnectionOptions as CreateSnowflakeCredentials,
        );
    });

    afterEach(() => {
        const originalEnv = process.env.SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE;
        if (originalEnv !== undefined) {
            process.env.SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE = originalEnv;
        } else {
            delete process.env.SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE;
        }
    });

    it('should return custom warehouse error message when SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE is set', () => {
        // Set environment variable
        process.env.SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE =
            "You don't have access to warehouse {warehouseName}. Please reach out to your admin.";

        const error = {
            message:
                "No active warehouse selected in the current session. Select an active warehouse with the 'use warehouse' command",
            code: 'SESSION_ERROR',
            data: { type: 'SESSION_ERROR' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe(
            "You don't have access to warehouse TEST_WAREHOUSE. Please reach out to your admin.",
        );
    });

    it('should append the configured warehouse to the original error when SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE is not set', () => {
        // Ensure environment variable is not set
        delete process.env.SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE;

        const error = {
            message:
                "No active warehouse selected in the current session. Select an active warehouse with the 'use warehouse' command",
            code: 'SESSION_ERROR',
            data: { type: 'SESSION_ERROR' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe(
            `No active warehouse selected in the current session. Select an active warehouse with the 'use warehouse' command (configured warehouse: "TEST_WAREHOUSE")`,
        );
    });

    it('should flag missing warehouse credentials when no warehouse is configured on the connection', () => {
        delete process.env.SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE;

        const warehouseWithoutWarehouse = new SnowflakeWarehouseClient({
            account: 'test-account',
            user: 'test-user',
            password: 'test-password',
            database: 'test-database',
        } as CreateSnowflakeCredentials);

        const error = {
            message:
                "No active warehouse selected in the current session. Select an active warehouse with the 'use warehouse' command",
            code: 'SESSION_ERROR',
            data: { type: 'SESSION_ERROR' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouseWithoutWarehouse.parseError(error as any);

        expect(result.message).toBe(
            "No active warehouse selected in the current session. Select an active warehouse with the 'use warehouse' command (no warehouse was configured on the connection — credentials may be missing this field)",
        );
    });

    it('should handle warehouse errors without warehouse name replacement when template has no placeholder', () => {
        process.env.SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE =
            'You do not have warehouse access. Please contact your administrator.';

        const error = {
            message:
                "No active warehouse selected in the current session. Select an active warehouse with the 'use warehouse' command",
            code: 'SESSION_ERROR',
            data: { type: 'SESSION_ERROR' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe(
            'You do not have warehouse access. Please contact your administrator.',
        );
    });

    it('should return original error message for non-warehouse access errors', () => {
        // Set environment variable
        process.env.SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE =
            "You don't have access to warehouse {warehouseName}. Please reach out to your admin.";

        const error = {
            message: 'Some other SQL error',
            code: 'COMPILATION',
            data: { type: 'COMPILATION' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe('Some other SQL error');
    });

    it('should convert literal \\n escape sequences into real newlines', () => {
        process.env.SNOWFLAKE_WAREHOUSE_ERROR_MESSAGE =
            'No access to warehouse {warehouseName}.\\n1) Step one\\n2) Step two';

        const error = {
            message:
                "No active warehouse selected in the current session. Select an active warehouse with the 'use warehouse' command",
            code: 'SESSION_ERROR',
            data: { type: 'SESSION_ERROR' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = warehouse.parseError(error as any);

        expect(result.message).toBe(
            'No access to warehouse TEST_WAREHOUSE.\n1) Step one\n2) Step two',
        );
        expect(result.message).not.toContain('\\n');
    });
});
