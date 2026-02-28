import {
    AthenaAuthenticationType,
    CreateAthenaCredentials,
    WarehouseTypes,
} from '@lightdash/common';

// Must import after mocks are set up
import { AthenaWarehouseClient } from './AthenaWarehouseClient';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-athena', () => ({
    ...jest.requireActual('@aws-sdk/client-athena'),
    // eslint-disable-next-line object-shorthand, func-names
    AthenaClient: function () {
        return { send: mockSend };
    },
}));

const baseCredentials: CreateAthenaCredentials = {
    type: WarehouseTypes.ATHENA,
    region: 'us-east-1',
    database: 'AwsDataCatalog',
    schema: 'my_database',
    s3StagingDir: 's3://bucket/staging',
    workGroup: 'primary',
    authenticationType: AthenaAuthenticationType.IAM_ROLE,
};

describe('AthenaWarehouseClient', () => {
    describe('getCatalog', () => {
        beforeEach(() => {
            mockSend.mockReset();
        });

        test('should use ListTableMetadataCommand to fetch catalog', async () => {
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [
                    {
                        Name: 'orders',
                        Columns: [
                            { Name: 'id', Type: 'integer' },
                            { Name: 'status', Type: 'varchar' },
                        ],
                    },
                    {
                        Name: 'users',
                        Columns: [
                            { Name: 'id', Type: 'integer' },
                            { Name: 'name', Type: 'varchar' },
                        ],
                    },
                ],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient(baseCredentials);
            const catalog = await client.getCatalog([
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 'orders',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 'users',
                },
            ]);

            expect(catalog).toEqual({
                AwsDataCatalog: {
                    my_database: {
                        orders: { id: 'number', status: 'string' },
                        users: { id: 'number', name: 'string' },
                    },
                },
            });
            // Should be a single ListTableMetadataCommand call, not per-table
            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        test('should handle multiple schemas in requests', async () => {
            // First schema response
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [
                    {
                        Name: 'orders',
                        Columns: [{ Name: 'id', Type: 'integer' }],
                    },
                ],
                NextToken: undefined,
            });
            // Second schema response
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [
                    {
                        Name: 'events',
                        Columns: [{ Name: 'ts', Type: 'timestamp' }],
                    },
                ],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient(baseCredentials);
            const catalog = await client.getCatalog([
                {
                    database: 'AwsDataCatalog',
                    schema: 'schema_a',
                    table: 'orders',
                },
                {
                    database: 'AwsDataCatalog',
                    schema: 'schema_b',
                    table: 'events',
                },
            ]);

            expect(catalog).toEqual({
                AwsDataCatalog: {
                    schema_a: { orders: { id: 'number' } },
                    schema_b: { events: { ts: 'timestamp' } },
                },
            });
            expect(mockSend).toHaveBeenCalledTimes(2);
        });

        test('should handle pagination in ListTableMetadataCommand', async () => {
            // First page
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [
                    {
                        Name: 'table1',
                        Columns: [{ Name: 'col1', Type: 'varchar' }],
                    },
                ],
                NextToken: 'page2',
            });
            // Second page
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [
                    {
                        Name: 'table2',
                        Columns: [{ Name: 'col2', Type: 'integer' }],
                    },
                ],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient(baseCredentials);
            const catalog = await client.getCatalog([
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

            expect(catalog).toEqual({
                AwsDataCatalog: {
                    my_database: {
                        table1: { col1: 'string' },
                        table2: { col2: 'number' },
                    },
                },
            });
            expect(mockSend).toHaveBeenCalledTimes(2);
        });

        test('should filter out tables not in the request', async () => {
            mockSend.mockResolvedValueOnce({
                TableMetadataList: [
                    {
                        Name: 'orders',
                        Columns: [{ Name: 'id', Type: 'integer' }],
                    },
                    {
                        Name: 'extra_table',
                        Columns: [{ Name: 'x', Type: 'varchar' }],
                    },
                ],
                NextToken: undefined,
            });

            const client = new AthenaWarehouseClient(baseCredentials);
            const catalog = await client.getCatalog([
                {
                    database: 'AwsDataCatalog',
                    schema: 'my_database',
                    table: 'orders',
                },
            ]);

            expect(catalog).toEqual({
                AwsDataCatalog: {
                    my_database: {
                        orders: { id: 'number' },
                    },
                },
            });
        });

        test('should return empty catalog when schema does not exist (MetadataException)', async () => {
            const metadataError = new Error('Schema not found');
            (metadataError as unknown as { name: string }).name =
                'MetadataException';
            mockSend.mockRejectedValueOnce(metadataError);

            const client = new AthenaWarehouseClient(baseCredentials);
            const catalog = await client.getCatalog([
                {
                    database: 'AwsDataCatalog',
                    schema: 'nonexistent',
                    table: 'some_table',
                },
            ]);

            expect(catalog).toEqual({});
        });
    });
});
