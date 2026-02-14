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

const mockFromTemporaryCredentials = jest.fn(() => 'sts-credentials');

jest.mock('@aws-sdk/credential-providers', () => ({
    fromTemporaryCredentials: mockFromTemporaryCredentials,
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
});
