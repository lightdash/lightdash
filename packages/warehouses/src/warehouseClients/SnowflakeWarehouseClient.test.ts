import {
    AnyType,
    CreateSnowflakeCredentials,
    DimensionType,
    SnowflakeAuthenticationType,
} from '@lightdash/common';
import {
    configure,
    Connection,
    createConnection,
    type ConnectionCallback,
} from 'snowflake-sdk';
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

const oauthAccessToken = (expiresAtSeconds: number): string =>
    `header.${Buffer.from(JSON.stringify({ exp: expiresAtSeconds })).toString(
        'base64url',
    )}.signature`;

const interactiveConnectionMock = (
    execute: ReturnType<typeof vi.fn>,
): Connection =>
    ({
        connect: vi.fn((callback: ConnectionCallback) =>
            callback(undefined, {} as Connection),
        ),
        connectAsync: vi.fn((callback: ConnectionCallback) => {
            callback(undefined, {} as Connection);
            return Promise.resolve();
        }),
        execute,
        destroy: vi.fn((callback: ConnectionCallback) =>
            callback(undefined, {} as Connection),
        ),
    }) as unknown as Connection;

type OAuthCredentialWriter = {
    write(key: string, token: string): Promise<void>;
};

const getConfiguredCredentialManager = (): OAuthCredentialWriter => {
    const manager =
        vi.mocked(configure).mock.lastCall?.[0]?.customCredentialManager;
    if (
        !manager ||
        typeof manager !== 'object' ||
        !('write' in manager) ||
        typeof manager.write !== 'function'
    ) {
        throw new Error('OAuth credential manager was not configured');
    }
    return manager as OAuthCredentialWriter;
};

vi.mock('snowflake-sdk', async () => ({
    ...(
        await vi.importActual<{ default: typeof import('snowflake-sdk') }>(
            'snowflake-sdk',
        )
    ).default,
    configure: vi.fn(),
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
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('caps result chunk size via CLIENT_RESULT_CHUNK_SIZE session parameter', async () => {
        const warehouse = new SnowflakeWarehouseClient(credentials);
        await warehouse.streamQuery('SELECT 1', () => {}, {});
        const alterSessionSql = executeMock.mock.calls
            .map((call) => call[0].sqlText as string)
            .find((sql) => sql.startsWith('ALTER SESSION SET'));
        expect(alterSessionSql).toContain('CLIENT_RESULT_CHUNK_SIZE = 16');
    });

    it('configures the local application authorization-code flow with SDK defaults', () => {
        const warehouse = new SnowflakeWarehouseClient({
            ...credentials,
            authenticationType:
                SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
        });

        expect(warehouse.connectionOptions).toEqual(
            expect.objectContaining({
                account: credentials.account,
                authenticator: 'OAUTH_AUTHORIZATION_CODE',
                clientStoreTemporaryCredential: true,
                browserActionTimeout: 300_000,
            }),
        );
        expect(warehouse.connectionOptions).not.toHaveProperty('username');
        expect(warehouse.connectionOptions).not.toHaveProperty('oauthClientId');
        expect(warehouse.connectionOptions).not.toHaveProperty(
            'oauthAuthorizationUrl',
        );
        expect(warehouse.connectionOptions).not.toHaveProperty(
            'oauthTokenRequestUrl',
        );
        expect(warehouse.connectionOptions).not.toHaveProperty(
            'oauthRedirectUri',
        );
        expect(warehouse.connectionOptions).not.toHaveProperty(
            'oauthEnableSingleUseRefreshTokens',
        );
        expect(warehouse.connectionOptions).not.toHaveProperty(
            'oauthClientSecret',
        );
        expect(vi.mocked(configure)).toHaveBeenCalledWith({
            customCredentialManager: expect.any(Object),
        });
    });

    it('exposes authorization-code tokens captured by the SDK credential manager', async () => {
        const expiresAtSeconds = 2_000_000_000;
        const accessToken = oauthAccessToken(expiresAtSeconds);
        const warehouse = new SnowflakeWarehouseClient({
            ...credentials,
            authenticationType:
                SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
        });
        const customCredentialManager = getConfiguredCredentialManager();

        await customCredentialManager.write(
            '{HOST}:{USER}:{OAUTH_AUTHORIZATION_CODE_ACCESS_TOKEN}',
            accessToken,
        );
        await customCredentialManager.write(
            '{HOST}:{USER}:{OAUTH_AUTHORIZATION_CODE_REFRESH_TOKEN}',
            'refresh-token',
        );

        expect(warehouse.getOAuthTokens()).toEqual({
            accessToken,
            refreshToken: 'refresh-token',
            expiresAt: new Date(expiresAtSeconds * 1000),
        });
    });

    it('inspects key fingerprints and changes only the selected user key slot', async () => {
        const execute = vi.fn(
            ({
                sqlText,
                complete,
            }: {
                sqlText: string;
                complete: (
                    error: undefined,
                    statement: { getColumns: () => typeof queryColumnsMock },
                    rows: Record<string, string>[],
                ) => void;
            }) => {
                const rows = sqlText.startsWith('DESCRIBE USER')
                    ? [
                          {
                              property: 'RSA_PUBLIC_KEY_FP',
                              value: 'SHA256:occupied',
                          },
                          {
                              property: 'RSA_PUBLIC_KEY_2_FP',
                              value: 'null',
                          },
                      ]
                    : [];
                complete(
                    undefined,
                    { getColumns: () => queryColumnsMock },
                    rows,
                );
            },
        );
        vi.mocked(createConnection).mockImplementationOnce(() =>
            interactiveConnectionMock(execute),
        );
        const warehouse = new SnowflakeWarehouseClient({
            ...credentials,
            user: 'Mixed User',
            authenticationType:
                SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
        });

        await expect(
            warehouse.getUserPublicKeySlots('Mixed User'),
        ).resolves.toEqual({
            RSA_PUBLIC_KEY: 'SHA256:occupied',
            RSA_PUBLIC_KEY_2: null,
        });
        await warehouse.setUserPublicKey(
            'Mixed User',
            'RSA_PUBLIC_KEY_2',
            'dGVzdA==',
        );
        await warehouse.unsetUserPublicKey('Mixed User', 'RSA_PUBLIC_KEY_2');

        expect(createConnection).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                sqlText: 'DESCRIBE USER "Mixed User"',
            }),
        );
        expect(execute).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                sqlText:
                    'ALTER USER "Mixed User" SET RSA_PUBLIC_KEY_2 = \'dGVzdA==\'',
            }),
        );
        expect(execute).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                sqlText: 'ALTER USER "Mixed User" UNSET RSA_PUBLIC_KEY_2',
            }),
        );
    });

    it.each([
        SnowflakeAuthenticationType.EXTERNAL_BROWSER,
        SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
    ])(
        'replaces an existing named PAT for a %s session and scopes the new token to a role',
        async (authenticationType) => {
            const execute = vi.fn(
                ({
                    sqlText,
                    complete,
                }: {
                    sqlText: string;
                    complete: (
                        error: undefined,
                        statement: {
                            getColumns: () => typeof queryColumnsMock;
                        },
                        rows: Record<string, string>[],
                    ) => void;
                }) => {
                    let rows: Record<string, string>[] = [];
                    if (sqlText.startsWith('SHOW USER')) {
                        rows = [
                            {
                                name: 'LIGHTDASH_ONBOARDING_11111111',
                                status: 'ACTIVE',
                            },
                        ];
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
            vi.mocked(createConnection).mockImplementationOnce(() =>
                interactiveConnectionMock(execute),
            );
            const warehouse = new SnowflakeWarehouseClient({
                ...credentials,
                authenticationType,
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
        },
    );

    it('prunes only non-active Lightdash onboarding PATs', async () => {
        const execute = vi.fn(
            ({
                sqlText,
                complete,
            }: {
                sqlText: string;
                complete: (
                    error: undefined,
                    statement: { getColumns: () => typeof queryColumnsMock },
                    rows: Record<string, string>[],
                ) => void;
            }) => {
                let rows: Record<string, string>[] = [];
                if (sqlText.startsWith('SHOW USER')) {
                    rows = [
                        {
                            name: 'LIGHTDASH_ONBOARDING_EXPIRED',
                            status: 'EXPIRED',
                        },
                        {
                            name: 'LIGHTDASH_ONBOARDING_DISABLED',
                            status: 'DISABLED',
                        },
                        {
                            name: 'LIGHTDASH_ONBOARDING_ACTIVE',
                            status: 'ACTIVE',
                        },
                        { name: 'OTHER_EXPIRED', status: 'EXPIRED' },
                        { name: 'OTHER_ACTIVE', status: 'ACTIVE' },
                    ];
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
        vi.mocked(createConnection).mockImplementationOnce(() =>
            interactiveConnectionMock(execute),
        );
        const warehouse = new SnowflakeWarehouseClient({
            ...credentials,
            authenticationType:
                SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
        });

        await expect(
            warehouse.createProgrammaticAccessToken('LIGHTDASH_ONBOARDING_NEW'),
        ).resolves.toEqual({
            tokenName: 'LIGHTDASH_ONBOARDING_NEW',
            tokenSecret: 'pat-secret',
        });

        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText:
                    'ALTER USER REMOVE PROGRAMMATIC ACCESS TOKEN LIGHTDASH_ONBOARDING_EXPIRED',
            }),
        );
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText:
                    'ALTER USER REMOVE PROGRAMMATIC ACCESS TOKEN LIGHTDASH_ONBOARDING_DISABLED',
            }),
        );
        expect(execute).not.toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText:
                    'ALTER USER REMOVE PROGRAMMATIC ACCESS TOKEN LIGHTDASH_ONBOARDING_ACTIVE',
            }),
        );
        expect(execute).not.toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText:
                    'ALTER USER REMOVE PROGRAMMATIC ACCESS TOKEN OTHER_EXPIRED',
            }),
        );
        expect(execute).not.toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText:
                    'ALTER USER REMOVE PROGRAMMATIC ACCESS TOKEN OTHER_ACTIVE',
            }),
        );
    });

    it('creates a PAT when pruning an inactive PAT fails', async () => {
        const execute = vi.fn(
            ({
                sqlText,
                complete,
            }: {
                sqlText: string;
                complete: (
                    error: Error | undefined,
                    statement: { getColumns: () => typeof queryColumnsMock },
                    rows: Record<string, string>[],
                ) => void;
            }) => {
                const statement = { getColumns: () => queryColumnsMock };
                if (sqlText.startsWith('SHOW USER')) {
                    complete(undefined, statement, [
                        {
                            name: 'LIGHTDASH_ONBOARDING_EXPIRED',
                            status: 'EXPIRED',
                        },
                    ]);
                } else if (sqlText.startsWith('ALTER USER REMOVE')) {
                    complete(new Error('Failed to remove PAT'), statement, []);
                } else {
                    complete(undefined, statement, [
                        { TOKEN_SECRET: 'pat-secret' },
                    ]);
                }
            },
        );
        vi.mocked(createConnection).mockImplementationOnce(() =>
            interactiveConnectionMock(execute),
        );
        const warehouse = new SnowflakeWarehouseClient({
            ...credentials,
            authenticationType:
                SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
        });

        await expect(
            warehouse.createProgrammaticAccessToken('LIGHTDASH_ONBOARDING_NEW'),
        ).resolves.toEqual({
            tokenName: 'LIGHTDASH_ONBOARDING_NEW',
            tokenSecret: 'pat-secret',
        });
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText: expect.stringMatching(
                    /^ALTER USER ADD PROGRAMMATIC ACCESS TOKEN LIGHTDASH_ONBOARDING_NEW/,
                ),
            }),
        );
    });

    it('discovers session defaults and capped inventory for interactive sessions', async () => {
        const execute = vi.fn(
            ({
                sqlText,
                complete,
            }: {
                sqlText: string;
                complete: (
                    error: undefined,
                    statement: { getColumns: () => typeof queryColumnsMock },
                    rows: Record<string, AnyType>[],
                ) => void;
            }) => {
                let rows: Record<string, AnyType>[] = [];
                if (sqlText.startsWith('SELECT CURRENT_USER')) {
                    rows = [
                        {
                            USER: 'user.name@example.com',
                            ROLE: 'ANALYST',
                            WAREHOUSE: 'TRANSFORMING',
                            DATABASE: 'ANALYTICS',
                            SCHEMA: 'PUBLIC',
                        },
                    ];
                } else if (sqlText.startsWith('SHOW DATABASES')) {
                    rows = Array.from({ length: 125 }, (_, index) => ({
                        name: `DATABASE_${index}`,
                        comment: index === 0 ? 'Primary analytics' : '',
                        kind: index === 1 ? 'IMPORTED DATABASE' : 'STANDARD',
                    }));
                } else if (sqlText.startsWith('SHOW WAREHOUSES')) {
                    rows = [
                        {
                            name: 'TRANSFORMING',
                            size: 'X-Small',
                            state: 'SUSPENDED',
                            auto_suspend: '300',
                        },
                    ];
                } else if (sqlText.startsWith('SHOW GRANTS')) {
                    rows = [{ role: 'ANALYST' }, { role: 'REPORTER' }];
                } else if (sqlText.startsWith('SHOW SCHEMAS')) {
                    rows = [
                        { name: 'PUBLIC', database_name: 'ANALYTICS' },
                        { name: 'JAFFLE', database_name: 'ANALYTICS' },
                        {
                            name: 'INFORMATION_SCHEMA',
                            database_name: 'ANALYTICS',
                        },
                    ];
                } else if (sqlText.startsWith('SELECT SUM(bytes)')) {
                    if (sqlText.includes('DATABASE_0.')) {
                        rows = [{ total_bytes: 1250 }];
                    } else if (sqlText.includes('DATABASE_1.')) {
                        rows = [{ total_bytes: 500 }];
                    } else {
                        rows = [{ total_bytes: null }];
                    }
                }
                complete(
                    undefined,
                    { getColumns: () => queryColumnsMock },
                    rows,
                );
            },
        );
        vi.mocked(createConnection).mockImplementationOnce(() =>
            interactiveConnectionMock(execute),
        );
        const warehouse = new SnowflakeWarehouseClient({
            ...credentials,
            authenticationType:
                SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
        });

        await expect(
            warehouse.getSessionDiscovery('user.name@example.com'),
        ).resolves.toEqual({
            user: 'user.name@example.com',
            defaults: {
                role: 'ANALYST',
                warehouse: 'TRANSFORMING',
                database: 'ANALYTICS',
                schema: 'PUBLIC',
            },
            inventory: {
                databases: Array.from({ length: 100 }, (_, index) => ({
                    name: `DATABASE_${index}`,
                    comment: index === 0 ? 'Primary analytics' : null,
                    kind: index === 1 ? 'IMPORTED DATABASE' : 'STANDARD',
                    sizeBytes: [1250, 500][index] ?? null,
                })),
                warehouses: [
                    {
                        name: 'TRANSFORMING',
                        size: 'X-Small',
                        state: 'SUSPENDED',
                        autoSuspendSeconds: 300,
                    },
                ],
                roles: [
                    { name: 'ANALYST', isDefault: true },
                    { name: 'REPORTER', isDefault: false },
                    { name: 'PUBLIC', isDefault: false },
                ],
                schemas: [
                    { databaseName: 'ANALYTICS', name: 'PUBLIC' },
                    { databaseName: 'ANALYTICS', name: 'JAFFLE' },
                ],
            },
        });
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText: 'SHOW SCHEMAS IN ACCOUNT LIMIT 1000',
            }),
        );
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText: `SELECT SUM(bytes) AS "total_bytes" FROM DATABASE_0.INFORMATION_SCHEMA.TABLES WHERE table_type = 'BASE TABLE'`,
            }),
        );
        expect(
            execute.mock.calls.filter(([statement]) =>
                statement.sqlText.startsWith('SELECT SUM(bytes)'),
            ),
        ).toHaveLength(25);
        expect(
            execute.mock.calls.some(([statement]) =>
                statement.sqlText.startsWith('USE WAREHOUSE'),
            ),
        ).toBe(false);
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText:
                    'SHOW GRANTS TO USER "user.name@example.com" LIMIT 100',
            }),
        );
    });

    it('returns null database sizes when size discovery fails', async () => {
        const execute = vi.fn(
            ({
                sqlText,
                complete,
            }: {
                sqlText: string;
                complete: (
                    error: Error | undefined,
                    statement: { getColumns: () => typeof queryColumnsMock },
                    rows: Record<string, AnyType>[],
                ) => void;
            }) => {
                if (sqlText.startsWith('SELECT SUM(bytes)')) {
                    complete(
                        new Error('Insufficient privileges'),
                        { getColumns: () => queryColumnsMock },
                        [],
                    );
                    return;
                }
                let rows: Record<string, AnyType>[] = [];
                if (sqlText.startsWith('SELECT CURRENT_USER')) {
                    rows = [{ USER: 'test-user' }];
                } else if (sqlText.startsWith('SHOW DATABASES')) {
                    rows = [{ name: 'ANALYTICS' }, { name: 'RAW' }];
                } else if (sqlText.startsWith('SHOW WAREHOUSES')) {
                    rows = [
                        { name: 'WH_BIG', size: 'Large', state: 'SUSPENDED' },
                        {
                            name: 'WH_SMALL',
                            size: 'X-Small',
                            state: 'STARTED',
                        },
                    ];
                }
                complete(
                    undefined,
                    { getColumns: () => queryColumnsMock },
                    rows,
                );
            },
        );
        vi.mocked(createConnection).mockImplementationOnce(() =>
            interactiveConnectionMock(execute),
        );
        const warehouse = new SnowflakeWarehouseClient(credentials);

        const discovery = await warehouse.getSessionDiscovery('test-user');

        expect(discovery.inventory.databases).toEqual([
            {
                name: 'ANALYTICS',
                comment: null,
                kind: null,
                sizeBytes: null,
            },
            { name: 'RAW', comment: null, kind: null, sizeBytes: null },
        ]);
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlText: 'USE WAREHOUSE WH_SMALL',
            }),
        );
    });

    it('opens, checks, and closes a diagnostic connection', async () => {
        const execute = vi.fn(
            ({
                sqlText,
                complete,
            }: {
                sqlText: string;
                complete: (
                    error: undefined,
                    statement: { getColumns: () => typeof queryColumnsMock },
                    rows: Record<string, AnyType>[],
                ) => void;
            }) =>
                complete(undefined, { getColumns: () => queryColumnsMock }, []),
        );
        const connection = interactiveConnectionMock(execute);
        vi.mocked(createConnection).mockImplementationOnce(() => connection);
        const warehouse = new SnowflakeWarehouseClient(credentials);

        const session = await warehouse.openDiagnosticConnection();
        await warehouse.selectOneDiagnosticConnection(session);
        await warehouse.closeDiagnosticConnection(session);

        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({ sqlText: 'SELECT 1' }),
        );
        expect(connection.destroy).toHaveBeenCalledOnce();
    });

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
            { code: 390422, message: 'Incoming request rejected' },
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
