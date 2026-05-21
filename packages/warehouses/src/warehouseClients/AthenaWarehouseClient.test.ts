import {
    AthenaAuthenticationType,
    CreateAthenaCredentials,
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
});
