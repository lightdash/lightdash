/* eslint-disable prefer-arrow-callback, func-names */
import {
    CreateRedshiftCredentials,
    RedshiftAuthenticationType,
    WarehouseConnectionError,
    WarehouseTypes,
} from '@lightdash/common';

const mockClusterSend = vi.fn();
const mockServerlessSend = vi.fn();

vi.mock('@aws-sdk/client-redshift', () => ({
    RedshiftClient: vi.fn(function () {
        return { send: mockClusterSend };
    }),
    GetClusterCredentialsCommand: vi.fn(function (input: unknown) {
        return { __command: 'cluster', input };
    }),
}));

vi.mock('@aws-sdk/client-redshift-serverless', () => ({
    RedshiftServerlessClient: vi.fn(function () {
        return { send: mockServerlessSend };
    }),
    GetCredentialsCommand: vi.fn(function (input: unknown) {
        return { __command: 'serverless', input };
    }),
}));

const { mockFromTemporaryCredentials } = vi.hoisted(() => ({
    mockFromTemporaryCredentials: vi.fn(() => 'sts-credentials'),
}));
vi.mock('@aws-sdk/credential-providers', () => ({
    fromTemporaryCredentials: mockFromTemporaryCredentials,
}));

// eslint-disable-next-line import/first -- Must import after mocks are set up
import {
    getRedshiftAwsCredentials,
    mintRedshiftIamCredentials,
} from './redshiftIamCredentials';

const provisionedCredentials: CreateRedshiftCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'my-cluster.abc123.us-east-1.redshift.amazonaws.com',
    user: 'analytics',
    port: 5439,
    dbname: 'dev',
    schema: 'public',
    authenticationType: RedshiftAuthenticationType.IAM,
    region: 'us-east-1',
    clusterIdentifier: 'my-cluster',
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
};

const serverlessCredentials: CreateRedshiftCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'my-wg.123.us-east-1.redshift-serverless.amazonaws.com',
    user: '',
    port: 5439,
    dbname: 'dev',
    schema: 'public',
    authenticationType: RedshiftAuthenticationType.IAM,
    region: 'us-east-1',
    isServerless: true,
    workgroupName: 'my-workgroup',
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
};

describe('getRedshiftAwsCredentials', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('returns static credentials when access keys are provided', () => {
        const result = getRedshiftAwsCredentials(provisionedCredentials);
        expect(result).toEqual({
            accessKeyId: 'AKID',
            secretAccessKey: 'SECRET',
            sessionToken: undefined,
        });
        expect(mockFromTemporaryCredentials).not.toHaveBeenCalled();
    });

    test('returns undefined (default chain) when no access keys are provided', () => {
        const result = getRedshiftAwsCredentials({
            ...provisionedCredentials,
            accessKeyId: undefined,
            secretAccessKey: undefined,
        });
        expect(result).toBeUndefined();
    });

    test('wraps with assume-role when assumeRoleArn is set', () => {
        getRedshiftAwsCredentials({
            ...provisionedCredentials,
            assumeRoleArn: 'arn:aws:iam::123456789012:role/redshift',
            assumeRoleExternalId: 'ext-1',
        });
        expect(mockFromTemporaryCredentials).toHaveBeenCalledWith({
            masterCredentials: {
                accessKeyId: 'AKID',
                secretAccessKey: 'SECRET',
                sessionToken: undefined,
            },
            params: {
                RoleArn: 'arn:aws:iam::123456789012:role/redshift',
                RoleSessionName: 'lightdash-redshift-session',
                ExternalId: 'ext-1',
            },
        });
    });

    test('does not re-assume when a session token is already present', () => {
        const result = getRedshiftAwsCredentials({
            ...provisionedCredentials,
            sessionToken: 'TEMP_TOKEN',
            assumeRoleArn: 'arn:aws:iam::123456789012:role/redshift',
        });
        expect(mockFromTemporaryCredentials).not.toHaveBeenCalled();
        expect(result).toEqual({
            accessKeyId: 'AKID',
            secretAccessKey: 'SECRET',
            sessionToken: 'TEMP_TOKEN',
        });
    });
});

describe('mintRedshiftIamCredentials', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('mints credentials for a provisioned cluster', async () => {
        const expiration = new Date('2026-01-01T00:00:00Z');
        mockClusterSend.mockResolvedValue({
            DbUser: 'IAM:analytics',
            DbPassword: 'temp-password',
            Expiration: expiration,
        });

        const result = await mintRedshiftIamCredentials(provisionedCredentials);

        expect(result).toEqual({
            dbUser: 'IAM:analytics',
            dbPassword: 'temp-password',
            expiration,
        });
        expect(mockClusterSend).toHaveBeenCalledTimes(1);
        expect(mockServerlessSend).not.toHaveBeenCalled();
    });

    test('mints credentials for a serverless workgroup', async () => {
        const expiration = new Date('2026-01-01T00:00:00Z');
        mockServerlessSend.mockResolvedValue({
            dbUser: 'IAMR:role',
            dbPassword: 'temp-password',
            expiration,
        });

        const result = await mintRedshiftIamCredentials(serverlessCredentials);

        expect(result).toEqual({
            dbUser: 'IAMR:role',
            dbPassword: 'temp-password',
            expiration,
        });
        expect(mockServerlessSend).toHaveBeenCalledTimes(1);
        expect(mockClusterSend).not.toHaveBeenCalled();
    });

    test('throws when the region is missing', async () => {
        await expect(
            mintRedshiftIamCredentials({
                ...provisionedCredentials,
                region: undefined,
            }),
        ).rejects.toThrow(WarehouseConnectionError);
    });

    test('throws when a provisioned cluster identifier is missing', async () => {
        await expect(
            mintRedshiftIamCredentials({
                ...provisionedCredentials,
                clusterIdentifier: undefined,
            }),
        ).rejects.toThrow(WarehouseConnectionError);
    });

    test('throws when a serverless workgroup name is missing', async () => {
        await expect(
            mintRedshiftIamCredentials({
                ...serverlessCredentials,
                workgroupName: undefined,
            }),
        ).rejects.toThrow(WarehouseConnectionError);
    });
});
