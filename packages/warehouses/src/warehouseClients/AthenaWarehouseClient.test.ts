import {
    AthenaAuthenticationType,
    CreateAthenaCredentials,
    DimensionType,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseTypes,
} from '@lightdash/common';

const mockAthenaClient = jest.fn();
jest.mock('@aws-sdk/client-athena', () => ({
    ...jest.requireActual('@aws-sdk/client-athena'),
    AthenaClient: mockAthenaClient,
}));

const mockFromTemporaryCredentials = jest.fn(() => 'sts-credentials');

jest.mock('@aws-sdk/credential-providers', () => ({
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
        jest.clearAllMocks();
        mockAthenaClient.mockImplementation(() => ({}));
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
            mockAthenaClient.mockImplementation(() => ({
                send: jest.fn().mockRejectedValue(error),
            }));
        };

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

    describe('getAllTables with multi-schema', () => {
        const mockSend = jest.fn();

        beforeEach(() => {
            mockAthenaClient.mockImplementation(() => ({
                send: mockSend,
            }));
        });

        test('should list tables from single schema', async () => {
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'table1' }, { Name: 'table2' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'my_database',
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 'table1',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 'table2',
                },
            ]);
        });

        test('should list tables from schema and accessibleSchemas', async () => {
            // Default schema tables
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'table_a' }],
                NextToken: undefined,
            });
            // Additional schema tables
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'table_b' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'db1',
                accessibleSchemas: ['db2'],
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'db1',
                    table: 'table_a',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'db2',
                    table: 'table_b',
                },
            ]);
        });

        test('should deduplicate schemas when accessibleSchemas contains the default schema', async () => {
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'table1' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'db1',
                accessibleSchemas: ['db1'],
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'db1',
                    table: 'table1',
                },
            ]);
            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        test('should list tables from only the default schema when accessibleSchemas is empty', async () => {
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'tbl1' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'my_db',
                accessibleSchemas: [],
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_db',
                    table: 'tbl1',
                },
            ]);
        });

        test('should expand * wildcard to all databases', async () => {
            // ListDatabasesCommand response
            mockSend.mockResolvedValueOnce({
                DatabaseList: [
                    { Name: 'db_alpha' },
                    { Name: 'db_beta' },
                    { Name: 'my_database' },
                ],
                NextToken: undefined,
            });
            // Tables for my_database (default schema)
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't1' }],
                NextToken: undefined,
            });
            // Tables for db_alpha
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't2' }],
                NextToken: undefined,
            });
            // Tables for db_beta
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't3' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'my_database',
                accessibleSchemas: ['*'],
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 't1',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'db_alpha',
                    table: 't2',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'db_beta',
                    table: 't3',
                },
            ]);
        });

        test('should expand prefix wildcard pattern', async () => {
            // ListDatabasesCommand response
            mockSend.mockResolvedValueOnce({
                DatabaseList: [
                    { Name: 'sales_us' },
                    { Name: 'sales_eu' },
                    { Name: 'marketing' },
                ],
                NextToken: undefined,
            });
            // Tables for default schema
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't0' }],
                NextToken: undefined,
            });
            // Tables for sales_us
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't1' }],
                NextToken: undefined,
            });
            // Tables for sales_eu
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't2' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'my_database',
                accessibleSchemas: ['sales_*'],
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 't0',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'sales_us',
                    table: 't1',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'sales_eu',
                    table: 't2',
                },
            ]);
        });

        test('should support ? single-character wildcard', async () => {
            // ListDatabasesCommand response
            mockSend.mockResolvedValueOnce({
                DatabaseList: [
                    { Name: 'db_a' },
                    { Name: 'db_b' },
                    { Name: 'db_ab' },
                ],
                NextToken: undefined,
            });
            // Tables for default schema
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't0' }],
                NextToken: undefined,
            });
            // Tables for db_a
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't1' }],
                NextToken: undefined,
            });
            // Tables for db_b
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't2' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'my_database',
                accessibleSchemas: ['db_?'],
            });
            const tables = await client.getAllTables();

            // db_ab should NOT match db_? (? matches exactly one character)
            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 't0',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'db_a',
                    table: 't1',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'db_b',
                    table: 't2',
                },
            ]);
        });

        test('should mix explicit schemas and wildcard patterns', async () => {
            // ListDatabasesCommand response (for wildcard resolution)
            mockSend.mockResolvedValueOnce({
                DatabaseList: [
                    { Name: 'prod_us' },
                    { Name: 'prod_eu' },
                    { Name: 'staging' },
                ],
                NextToken: undefined,
            });
            // Tables for default schema
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't0' }],
                NextToken: undefined,
            });
            // Tables for staging (explicit)
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't1' }],
                NextToken: undefined,
            });
            // Tables for prod_us (matched by wildcard)
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't2' }],
                NextToken: undefined,
            });
            // Tables for prod_eu (matched by wildcard)
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't3' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'my_database',
                accessibleSchemas: ['staging', 'prod_*'],
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 't0',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'staging',
                    table: 't1',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'prod_us',
                    table: 't2',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'prod_eu',
                    table: 't3',
                },
            ]);
        });

        test('should ignore empty strings in accessibleSchemas', async () => {
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'table1' }],
                NextToken: undefined,
            });
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'table2' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'db1',
                accessibleSchemas: ['', 'db2', '  '],
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'db1',
                    table: 'table1',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'db2',
                    table: 'table2',
                },
            ]);
        });

        test('should return only default schema tables when wildcard matches nothing', async () => {
            // ListDatabasesCommand response
            mockSend.mockResolvedValueOnce({
                DatabaseList: [{ Name: 'unrelated_db' }],
                NextToken: undefined,
            });
            // Tables for default schema
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'table1' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'my_database',
                accessibleSchemas: ['nonexistent_*'],
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 'table1',
                },
            ]);
        });

        test('should paginate through listAllDatabases', async () => {
            // First page of ListDatabasesCommand
            mockSend.mockResolvedValueOnce({
                DatabaseList: [{ Name: 'db_page1' }],
                NextToken: 'token123',
            });
            // Second page of ListDatabasesCommand
            mockSend.mockResolvedValueOnce({
                DatabaseList: [{ Name: 'db_page2' }],
                NextToken: undefined,
            });
            // Tables for default schema
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't0' }],
                NextToken: undefined,
            });
            // Tables for db_page1
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't1' }],
                NextToken: undefined,
            });
            // Tables for db_page2
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 't2' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'my_database',
                accessibleSchemas: ['db_*'],
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 't0',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'db_page1',
                    table: 't1',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'db_page2',
                    table: 't2',
                },
            ]);
        });

        test('should throw error when wildcard matches exceed limit', async () => {
            // Generate 101 databases to exceed MAX_WILDCARD_MATCHES (100)
            const databases = Array.from({ length: 101 }, (_, i) => ({
                Name: `db_${i}`,
            }));

            mockSend.mockResolvedValueOnce({
                DatabaseList: databases,
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'my_database',
                accessibleSchemas: ['*'],
            });

            await expect(client.getAllTables()).rejects.toThrow(
                /Wildcard pattern matched 101 databases, exceeding the limit of 100/,
            );
        });
    });
});
