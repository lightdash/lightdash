import {
    AthenaAuthenticationType,
    CreateAthenaCredentials,
    WarehouseTypes,
} from '@lightdash/common';

const mockAthenaClient = jest.fn();
jest.mock('@aws-sdk/client-athena', () => ({
    ...jest.requireActual('@aws-sdk/client-athena'),
    AthenaClient: mockAthenaClient,
}));

// Must import after mocks are set up
import { AthenaWarehouseClient } from './AthenaWarehouseClient';

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

    describe('getAllTables with multi-schema', () => {
        const mockSend = jest.fn();

        beforeEach(() => {
            mockAthenaClient.mockImplementation(() => ({
                send: mockSend,
            }));
        });

        test('should list tables from single schema', async () => {
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [
                    { Name: 'table1' },
                    { Name: 'table2' },
                ],
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

        test('should list tables from comma-separated schemas', async () => {
            // First schema tables
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'table_a' }],
                NextToken: undefined,
            });
            // Second schema tables
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'table_b' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: 'db1, db2',
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

        test('should list all databases when schema is empty', async () => {
            // ListDatabasesCommand response
            mockSend.mockResolvedValueOnce({
                DatabaseList: [{ Name: 'db_x' }, { Name: 'db_y' }],
                NextToken: undefined,
            });
            // Tables for db_x
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'tbl1' }],
                NextToken: undefined,
            });
            // Tables for db_y
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [{ Name: 'tbl2' }],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient({
                ...baseCredentials,
                schema: '',
            });
            const tables = await client.getAllTables();

            expect(tables).toEqual([
                {
                    database: 'AwsDataCatalog',
                    schema: 'db_x',
                    table: 'tbl1',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'db_y',
                    table: 'tbl2',
                },
            ]);
        });
    });
});
