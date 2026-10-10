/* eslint-disable prefer-arrow-callback, func-names */
import {
    ListDatabasesCommand,
    ListTableMetadataCommand,
} from '@aws-sdk/client-athena';
import {
    AthenaAuthenticationType,
    CreateAthenaCredentials,
    DimensionType,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseTypes,
} from '@lightdash/common';

const { mockAthenaClient } = vi.hoisted(() => ({
    mockAthenaClient: vi.fn(),
}));
vi.mock('@aws-sdk/client-athena', async () => ({
    ...(await vi.importActual<typeof import('@aws-sdk/client-athena')>(
        '@aws-sdk/client-athena',
    )),
    AthenaClient: mockAthenaClient,
}));

const { mockFromTemporaryCredentials } = vi.hoisted(() => ({
    mockFromTemporaryCredentials: vi.fn(() => 'sts-credentials'),
}));

vi.mock('@aws-sdk/credential-providers', () => ({
    fromTemporaryCredentials: mockFromTemporaryCredentials,
}));

// eslint-disable-next-line import/first -- Must import after mocks are set up
import {
    AthenaTypes,
    AthenaWarehouseClient,
    convertDataTypeToDimensionType,
} from './AthenaWarehouseClient';

const baseCredentials: CreateAthenaCredentials = {
    type: WarehouseTypes.ATHENA,
    region: 'us-east-1',
    database: 'AwsDataCatalog',
    schema: 'my_database',
    s3StagingDir: 's3://bucket/staging/',
    authenticationType: AthenaAuthenticationType.ACCESS_KEY,
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
};

describe('convertDataTypeToDimensionType', () => {
    test.each([
        [AthenaTypes.FLOAT, DimensionType.NUMBER],
        ['FLOAT', DimensionType.NUMBER],
        [AthenaTypes.DOUBLE, DimensionType.NUMBER],
        [AthenaTypes.BIGINT, DimensionType.NUMBER],
        ['decimal(10, 2)', DimensionType.NUMBER],
    ])('maps Athena %s columns to %s dimensions', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });
});

describe('AthenaWarehouseClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAthenaClient.mockImplementation(function () {
            return {};
        });
    });

    describe('authentication', () => {
        test('should use static credentials for ACCESS_KEY auth', () => {
            // eslint-disable-next-line no-new
            new AthenaWarehouseClient(baseCredentials);

            expect(mockAthenaClient).toHaveBeenCalledWith({
                region: 'us-east-1',
                credentials: {
                    accessKeyId: 'AKID',
                    secretAccessKey: 'SECRET',
                },
            });
        });

        test('should forward sessionToken for temporary STS credentials', () => {
            const creds: CreateAthenaCredentials = {
                ...baseCredentials,
                accessKeyId: 'ASIATEST',
                secretAccessKey: 'SECRET',
                sessionToken: 'SESSIONTOKEN',
            };
            // eslint-disable-next-line no-new
            new AthenaWarehouseClient(creds);

            expect(mockAthenaClient).toHaveBeenCalledWith({
                region: 'us-east-1',
                credentials: {
                    accessKeyId: 'ASIATEST',
                    secretAccessKey: 'SECRET',
                    sessionToken: 'SESSIONTOKEN',
                },
            });
        });

        test('should not set credentials for IAM_ROLE auth', () => {
            const creds: CreateAthenaCredentials = {
                ...baseCredentials,
                authenticationType: AthenaAuthenticationType.IAM_ROLE,
            };
            // eslint-disable-next-line no-new
            new AthenaWarehouseClient(creds);

            expect(mockAthenaClient).toHaveBeenCalledWith({
                region: 'us-east-1',
            });
        });
    });

    describe('assume role', () => {
        test('should wrap credentials with fromTemporaryCredentials when assumeRoleArn is set', () => {
            const creds: CreateAthenaCredentials = {
                ...baseCredentials,
                assumeRoleArn: 'arn:aws:iam::123456789012:role/my-role',
                assumeRoleExternalId: 'ext-id',
            };
            // eslint-disable-next-line no-new
            new AthenaWarehouseClient(creds);

            expect(mockFromTemporaryCredentials).toHaveBeenCalledWith({
                masterCredentials: {
                    accessKeyId: 'AKID',
                    secretAccessKey: 'SECRET',
                },
                params: {
                    RoleArn: 'arn:aws:iam::123456789012:role/my-role',
                    RoleSessionName: 'lightdash-athena-session',
                    ExternalId: 'ext-id',
                },
            });
            expect(mockAthenaClient).toHaveBeenCalledWith({
                region: 'us-east-1',
                credentials: 'sts-credentials',
            });
        });

        test('should chain assume role using temporary credentials (sessionToken in masterCredentials)', () => {
            const creds: CreateAthenaCredentials = {
                ...baseCredentials,
                accessKeyId: 'ASIATEST',
                secretAccessKey: 'SECRET',
                sessionToken: 'SESSIONTOKEN',
                assumeRoleArn: 'arn:aws:iam::123456789012:role/my-role',
            };
            // eslint-disable-next-line no-new
            new AthenaWarehouseClient(creds);

            expect(mockFromTemporaryCredentials).toHaveBeenCalledWith({
                masterCredentials: {
                    accessKeyId: 'ASIATEST',
                    secretAccessKey: 'SECRET',
                    sessionToken: 'SESSIONTOKEN',
                },
                params: {
                    RoleArn: 'arn:aws:iam::123456789012:role/my-role',
                    RoleSessionName: 'lightdash-athena-session',
                    ExternalId: undefined,
                },
            });
        });

        test('should not wrap credentials when assumeRoleArn is not set', () => {
            // eslint-disable-next-line no-new
            new AthenaWarehouseClient(baseCredentials);

            expect(mockFromTemporaryCredentials).not.toHaveBeenCalled();
        });

        test('should work with IAM_ROLE and assume role together', () => {
            const creds: CreateAthenaCredentials = {
                ...baseCredentials,
                authenticationType: AthenaAuthenticationType.IAM_ROLE,
                assumeRoleArn: 'arn:aws:iam::123456789012:role/my-role',
            };
            // eslint-disable-next-line no-new
            new AthenaWarehouseClient(creds);

            expect(mockFromTemporaryCredentials).toHaveBeenCalledWith({
                masterCredentials: undefined,
                params: {
                    RoleArn: 'arn:aws:iam::123456789012:role/my-role',
                    RoleSessionName: 'lightdash-athena-session',
                    ExternalId: undefined,
                },
            });
            expect(mockAthenaClient).toHaveBeenCalledWith({
                region: 'us-east-1',
                credentials: 'sts-credentials',
            });
        });
    });

    describe('web identity', () => {
        const webIdentityCredentials: CreateAthenaCredentials = {
            ...baseCredentials,
            authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
            accessKeyId: undefined,
            secretAccessKey: undefined,
            assumeRoleArn: 'arn:aws:iam::123456789012:role/lightdash',
        };

        const getCredentialProvider = () => {
            const config = mockAthenaClient.mock.calls[0][0] as {
                credentials: () => Promise<unknown>;
            };
            return config.credentials;
        };

        test('should use the credentials the server resolved', async () => {
            const awsCredentials = vi.fn(async () => ({
                accessKeyId: 'ASIA',
                secretAccessKey: 'SECRET',
            }));
            // eslint-disable-next-line no-new
            new AthenaWarehouseClient(webIdentityCredentials, {
                awsCredentials,
            });

            expect(getCredentialProvider()).toBe(awsCredentials);
            expect(mockFromTemporaryCredentials).not.toHaveBeenCalled();
        });

        test('should fail when the server resolved no credentials', async () => {
            // eslint-disable-next-line no-new
            new AthenaWarehouseClient(webIdentityCredentials);

            await expect(getCredentialProvider()()).rejects.toThrow(
                WarehouseConnectionError,
            );
            expect(mockFromTemporaryCredentials).not.toHaveBeenCalled();
        });
    });

    describe('error translation', () => {
        // Synthesizes an error with the shape produced by the AWS SDK:
        // an Error subclass whose `name` is the AWS error code, with optional
        // $metadata.httpStatusCode (set by the SDK on every ServiceException).
        const makeAwsError = (
            name: string,
            message: string,
            httpStatusCode?: number,
        ): Error => {
            const err = new Error(message) as Error & {
                $metadata?: { httpStatusCode?: number };
            };
            err.name = name;
            if (httpStatusCode !== undefined) {
                err.$metadata = { httpStatusCode };
            }
            return err;
        };

        const setMockSendToReject = (error: Error) => {
            mockAthenaClient.mockImplementation(function () {
                return { send: vi.fn().mockRejectedValue(error) };
            });
        };

        test.each(['ExpiredToken', 'InvalidRequestException'])(
            'preserves the SDK cause for prefixed and unprefixed %s errors',
            async (name) => {
                const sdkError = makeAwsError(name, 'safe', 403);
                setMockSendToReject(sdkError);
                const client = new AthenaWarehouseClient(baseCredentials);
                const queryError = client.parseError(sdkError);

                expect(queryError).toBeInstanceOf(
                    name === 'ExpiredToken'
                        ? WarehouseConnectionError
                        : WarehouseQueryError,
                );
                expect(queryError.cause).toBe(sdkError);
                expect(queryError.message).toMatch(/^\[/);

                const fieldsResult = client.getFields(
                    'orders',
                    'my_database',
                    'AwsDataCatalog',
                );
                await expect(fieldsResult).rejects.toBeInstanceOf(
                    WarehouseConnectionError,
                );
                await expect(fieldsResult).rejects.toHaveProperty(
                    'cause',
                    sdkError,
                );
                await expect(fieldsResult).rejects.toThrow(
                    "Failed to get fields for table 'AwsDataCatalog.my_database.orders'.",
                );
            },
        );

        test('translates UnrecognizedClientException into WarehouseConnectionError with hint', async () => {
            setMockSendToReject(
                makeAwsError(
                    'UnrecognizedClientException',
                    'The security token included in the request is invalid.',
                ),
            );
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(client.test()).rejects.toBeInstanceOf(
                WarehouseConnectionError,
            );
            await expect(client.test()).rejects.toMatchObject({
                message: expect.stringContaining(
                    '[UnrecognizedClientException]',
                ),
            });
            await expect(client.test()).rejects.toMatchObject({
                message: expect.stringContaining(
                    'AWS rejected the access key ID',
                ),
            });
        });

        test('translates InvalidSignatureException into WarehouseConnectionError', async () => {
            setMockSendToReject(
                makeAwsError(
                    'InvalidSignatureException',
                    'Signature does not match.',
                ),
            );
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(client.test()).rejects.toBeInstanceOf(
                WarehouseConnectionError,
            );
            await expect(client.test()).rejects.toMatchObject({
                message: expect.stringContaining('secret access key'),
            });
        });

        test('translates ExpiredTokenException into WarehouseConnectionError', async () => {
            setMockSendToReject(
                makeAwsError(
                    'ExpiredTokenException',
                    'The security token has expired.',
                ),
            );
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(client.test()).rejects.toBeInstanceOf(
                WarehouseConnectionError,
            );
            await expect(client.test()).rejects.toMatchObject({
                message: expect.stringContaining('expired'),
            });
        });

        test('translates CredentialsProviderError into WarehouseConnectionError', async () => {
            setMockSendToReject(
                makeAwsError(
                    'CredentialsProviderError',
                    'Could not load credentials from any providers',
                ),
            );
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(client.test()).rejects.toBeInstanceOf(
                WarehouseConnectionError,
            );
            await expect(client.test()).rejects.toMatchObject({
                message: expect.stringContaining('IAM Role'),
            });
        });

        test('keeps non-auth errors as WarehouseQueryError from streamQuery', async () => {
            setMockSendToReject(
                makeAwsError(
                    'InvalidRequestException',
                    'Workgroup primary not found',
                ),
            );
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(client.test()).rejects.toBeInstanceOf(
                WarehouseQueryError,
            );
            await expect(client.test()).rejects.toMatchObject({
                message: expect.stringContaining('[InvalidRequestException]'),
            });
        });

        test('falls back to httpStatusCode=401 when error name is unfamiliar', async () => {
            // Some AWS error variants don't show up in our known-name set but
            // are still authentication failures (e.g. credential-provider chain
            // wrapping). HTTP 401 alone should be enough to classify as a
            // connection error.
            setMockSendToReject(
                makeAwsError('SomeFutureAwsAuthError', 'unauthenticated', 401),
            );
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(client.test()).rejects.toBeInstanceOf(
                WarehouseConnectionError,
            );
            await expect(client.test()).rejects.toMatchObject({
                message: expect.stringContaining(
                    '[SomeFutureAwsAuthError 401]',
                ),
            });
        });

        test('does NOT promote httpStatusCode=403 to a connection error (could be IAM gap)', async () => {
            // AccessDeniedException is 403 but represents an IAM permission
            // gap during a query — it should remain WarehouseQueryError when
            // streamQuery is the caller. The catalog/tables/fields paths
            // explicitly opt into 'connection' default elsewhere.
            setMockSendToReject(
                makeAwsError(
                    'AccessDeniedException',
                    'You are not authorized to perform: athena:GetQueryResults',
                    403,
                ),
            );
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(client.test()).rejects.toBeInstanceOf(
                WarehouseQueryError,
            );
            await expect(client.test()).rejects.toMatchObject({
                message: expect.stringContaining('[AccessDeniedException 403]'),
            });
        });

        test('catalog/tables/fields default to WarehouseConnectionError', async () => {
            setMockSendToReject(
                makeAwsError(
                    'AccessDeniedException',
                    'You are not authorized to perform: athena:ListTableMetadata',
                ),
            );
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(client.getAllTables()).rejects.toBeInstanceOf(
                WarehouseConnectionError,
            );
            await expect(client.getAllTables()).rejects.toMatchObject({
                message: expect.stringContaining('[AccessDeniedException]'),
            });
            await expect(client.getAllTables()).rejects.toMatchObject({
                message: expect.stringContaining('Failed to list tables'),
            });
        });
    });

    describe('listing all tables', () => {
        // Answers Glue calls from a map of database name to table names
        const makeSend = ({
            databases,
            tablesByDatabase,
            deniedDatabases = [],
        }: {
            databases: string[] | Error;
            tablesByDatabase: Record<string, string[]>;
            deniedDatabases?: string[];
        }) =>
            vi.fn(async (command: unknown) => {
                if (command instanceof ListDatabasesCommand) {
                    if (databases instanceof Error) throw databases;
                    return {
                        DatabaseList: databases.map((Name) => ({ Name })),
                    };
                }
                if (command instanceof ListTableMetadataCommand) {
                    const name = command.input.DatabaseName ?? '';
                    if (deniedDatabases.includes(name)) {
                        throw new Error(`Access denied to ${name}`);
                    }
                    return {
                        TableMetadataList: (tablesByDatabase[name] ?? []).map(
                            (Name) => ({ Name, TableType: 'EXTERNAL_TABLE' }),
                        ),
                    };
                }
                throw new Error('Unexpected command');
            });

        const listSchemaTables = async (send: ReturnType<typeof makeSend>) => {
            mockAthenaClient.mockImplementation(function () {
                return { send };
            });
            const tables = await new AthenaWarehouseClient(
                baseCredentials,
            ).getAllTables();
            return tables.map(({ schema, table }) => `${schema}.${table}`);
        };

        test('lists tables from every database in the catalog, each under its own schema', async () => {
            const tables = await listSchemaTables(
                makeSend({
                    databases: ['staging', 'my_database'],
                    tablesByDatabase: {
                        my_database: ['orders'],
                        staging: ['stg_orders', 'stg_customers'],
                    },
                }),
            );

            expect(tables).toEqual([
                'my_database.orders',
                'staging.stg_orders',
                'staging.stg_customers',
            ]);
        });

        test('falls back to the configured schema when listing databases is denied', async () => {
            const tables = await listSchemaTables(
                makeSend({
                    databases: new Error(
                        'not authorized to perform: glue:GetDatabases',
                    ),
                    tablesByDatabase: {
                        my_database: ['orders'],
                        staging: ['stg_orders'],
                    },
                }),
            );

            expect(tables).toEqual(['my_database.orders']);
        });

        test('skips another database whose tables cannot be listed', async () => {
            const tables = await listSchemaTables(
                makeSend({
                    databases: ['staging', 'restricted'],
                    tablesByDatabase: {
                        my_database: ['orders'],
                        staging: ['stg_orders'],
                    },
                    deniedDatabases: ['restricted'],
                }),
            );

            expect(tables).toEqual([
                'my_database.orders',
                'staging.stg_orders',
            ]);
        });

        test('fails when the configured schema cannot be listed', async () => {
            await expect(
                listSchemaTables(
                    makeSend({
                        databases: ['staging'],
                        tablesByDatabase: { staging: ['stg_orders'] },
                        deniedDatabases: ['my_database'],
                    }),
                ),
            ).rejects.toMatchObject({
                message: expect.stringContaining(
                    "Failed to list tables in 'AwsDataCatalog.my_database'",
                ),
            });
        });
    });

    describe('database listing', () => {
        test('lists two pages with the default database first', async () => {
            const send = vi
                .fn()
                .mockResolvedValueOnce({
                    DatabaseList: [{ Name: 'analytics' }, { Name: 'finance' }],
                    NextToken: 'page-2',
                })
                .mockResolvedValueOnce({
                    DatabaseList: [{ Name: 'marketing' }],
                });
            mockAthenaClient.mockImplementation(function () {
                return { send };
            });
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(client.listDatabases()).resolves.toEqual({
                databases: [
                    {
                        name: 'my_database',
                        database: 'AwsDataCatalog',
                        schema: 'my_database',
                        isDefault: true,
                    },
                    {
                        name: 'analytics',
                        database: 'AwsDataCatalog',
                        schema: 'analytics',
                        isDefault: false,
                    },
                    {
                        name: 'finance',
                        database: 'AwsDataCatalog',
                        schema: 'finance',
                        isDefault: false,
                    },
                    {
                        name: 'marketing',
                        database: 'AwsDataCatalog',
                        schema: 'marketing',
                        isDefault: false,
                    },
                ],
                truncated: false,
                limit: 100,
            });
            expect(send).toHaveBeenCalledTimes(2);
            expect(send.mock.calls[0][0]).toBeInstanceOf(ListDatabasesCommand);
            expect(send.mock.calls[0][0].input).toEqual({
                CatalogName: 'AwsDataCatalog',
                MaxResults: 50,
                NextToken: undefined,
            });
            expect(send.mock.calls[1][0].input.NextToken).toBe('page-2');
        });

        test('caps the result at 100 and stops when truncation is known', async () => {
            const send = vi
                .fn()
                .mockResolvedValueOnce({
                    DatabaseList: Array.from({ length: 50 }, (_, index) => ({
                        Name: `database_${index}`,
                    })),
                    NextToken: 'page-2',
                })
                .mockResolvedValueOnce({
                    DatabaseList: Array.from({ length: 50 }, (_, index) => ({
                        Name: `database_${index + 50}`,
                    })),
                    NextToken: 'page-3',
                })
                .mockResolvedValueOnce({
                    DatabaseList: Array.from({ length: 20 }, (_, index) => ({
                        Name: `database_${index + 100}`,
                    })),
                });
            mockAthenaClient.mockImplementation(function () {
                return { send };
            });
            const client = new AthenaWarehouseClient(baseCredentials);

            const result = await client.listDatabases();

            expect(result.databases).toHaveLength(100);
            expect(result.databases[0]).toMatchObject({
                name: 'my_database',
                isDefault: true,
            });
            expect(result.truncated).toBe(true);
            expect(send).toHaveBeenCalledTimes(2);
        });

        test('does not report truncation for exactly 100 databases', async () => {
            const send = vi.fn().mockResolvedValueOnce({
                DatabaseList: Array.from({ length: 99 }, (_, index) => ({
                    Name: `database_${index}`,
                })),
            });
            mockAthenaClient.mockImplementation(function () {
                return { send };
            });
            const client = new AthenaWarehouseClient(baseCredentials);

            const result = await client.listDatabases();

            expect(result.databases).toHaveLength(100);
            expect(result.truncated).toBe(false);
            expect(send).toHaveBeenCalledOnce();
        });

        test('keeps fetching once the cap is reached exactly, to learn whether more exist', async () => {
            const send = vi
                .fn()
                .mockResolvedValueOnce({
                    DatabaseList: Array.from({ length: 99 }, (_, index) => ({
                        Name: `database_${index}`,
                    })),
                    NextToken: 'page-2',
                })
                .mockResolvedValueOnce({
                    DatabaseList: [{ Name: 'database_99' }],
                });
            mockAthenaClient.mockImplementation(function () {
                return { send };
            });
            const client = new AthenaWarehouseClient(baseCredentials);

            const result = await client.listDatabases();

            expect(send).toHaveBeenCalledTimes(2);
            expect(result.databases).toHaveLength(100);
            expect(result.truncated).toBe(true);
        });

        test('translates a rejected listDatabases call', async () => {
            const send = vi.fn().mockRejectedValue(
                Object.assign(new Error('boom'), {
                    name: 'AccessDeniedException',
                    $metadata: { httpStatusCode: 403 },
                }),
            );
            mockAthenaClient.mockImplementation(function () {
                return { send };
            });
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(client.listDatabases()).rejects.toBeInstanceOf(
                WarehouseConnectionError,
            );
            await expect(client.listDatabases()).rejects.toMatchObject({
                message: expect.stringContaining(
                    "Failed to list databases in catalog 'AwsDataCatalog'.",
                ),
            });
        });
    });

    describe('table listing', () => {
        test('pages tables for the selected database', async () => {
            const send = vi
                .fn()
                .mockResolvedValueOnce({
                    TableMetadataList: [
                        { Name: 'orders', TableType: 'EXTERNAL_TABLE' },
                    ],
                    NextToken: 'page-2',
                })
                .mockResolvedValueOnce({
                    TableMetadataList: [
                        { Name: 'customers', TableType: 'VIRTUAL_VIEW' },
                    ],
                });
            mockAthenaClient.mockImplementation(function () {
                return { send };
            });
            const client = new AthenaWarehouseClient(baseCredentials);

            const result = await client.getTablesForDatabase({
                name: 'finance',
                database: 'AwsDataCatalog',
                schema: 'finance',
                isDefault: false,
            });

            expect(result).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'finance',
                    table: 'orders',
                    tableType: 'external',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'finance',
                    table: 'customers',
                    tableType: 'view',
                },
            ]);
            expect(send).toHaveBeenCalledTimes(2);
            expect(send.mock.calls[0][0]).toBeInstanceOf(
                ListTableMetadataCommand,
            );
            expect(send.mock.calls[0][0].input).toEqual({
                CatalogName: 'AwsDataCatalog',
                DatabaseName: 'finance',
                MaxResults: 50,
                NextToken: undefined,
            });
            expect(send.mock.calls[1][0].input.NextToken).toBe('page-2');
        });

        test('uses the requested database, not the connection catalog', async () => {
            const send = vi.fn().mockResolvedValue({
                TableMetadataList: [{ Name: 'orders' }],
            });
            mockAthenaClient.mockImplementation(function () {
                return { send };
            });
            const client = new AthenaWarehouseClient(baseCredentials);

            const result = await client.getTablesForDatabase({
                name: 'shared',
                database: 'OtherCatalog',
                schema: 'shared',
                isDefault: false,
            });

            expect(result).toEqual([
                {
                    database: 'OtherCatalog',
                    schema: 'shared',
                    table: 'orders',
                    tableType: 'table',
                },
            ]);
            expect(send.mock.calls[0][0].input).toMatchObject({
                CatalogName: 'OtherCatalog',
                DatabaseName: 'shared',
            });
        });

        test('translates a rejected getTablesForDatabase call', async () => {
            const send = vi.fn().mockRejectedValue(
                Object.assign(new Error('boom'), {
                    name: 'AccessDeniedException',
                    $metadata: { httpStatusCode: 403 },
                }),
            );
            mockAthenaClient.mockImplementation(function () {
                return { send };
            });
            const client = new AthenaWarehouseClient(baseCredentials);

            await expect(
                client.getTablesForDatabase({
                    name: 'finance',
                    database: 'AwsDataCatalog',
                    schema: 'finance',
                    isDefault: false,
                }),
            ).rejects.toBeInstanceOf(WarehouseConnectionError);
            await expect(
                client.getTablesForDatabase({
                    name: 'finance',
                    database: 'AwsDataCatalog',
                    schema: 'finance',
                    isDefault: false,
                }),
            ).rejects.toMatchObject({
                message: expect.stringContaining(
                    "Failed to list tables in 'AwsDataCatalog.finance'.",
                ),
            });
        });
    });
});
