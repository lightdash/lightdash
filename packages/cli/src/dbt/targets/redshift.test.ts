import { fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers';
import {
    ParseError,
    RedshiftAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import { convertRedshiftSchema } from './redshift';

vi.mock('@aws-sdk/credential-providers', () => ({
    fromIni: vi.fn(),
    fromNodeProviderChain: vi.fn(),
}));

const mockedFromIni = vi.mocked(fromIni);
const mockedFromNodeProviderChain = vi.mocked(fromNodeProviderChain);

// Build a credential provider (the thunk fromIni/fromNodeProviderChain return)
// that resolves to the given AWS credentials.
const providerResolving = (credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: Date;
}) => vi.fn().mockResolvedValue(credentials);

// ...or rejects, the way the SDK does when nothing in the chain resolves
// (e.g. an expired SSO session, or no credentials at all).
const providerRejecting = (message: string) =>
    vi.fn().mockRejectedValue(new Error(message));

describe('convertRedshiftSchema', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    test('should parse password authentication', async () => {
        const target = {
            type: 'redshift',
            host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
            user: 'analytics',
            password: 'secret',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
        };

        expect(await convertRedshiftSchema(target)).toEqual({
            type: WarehouseTypes.REDSHIFT,
            host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
            user: 'analytics',
            password: 'secret',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
            keepalivesIdle: undefined,
            sslmode: undefined,
        });
    });

    test('should resolve IAM credentials from the default AWS chain for a provisioned cluster', async () => {
        mockedFromNodeProviderChain.mockReturnValue(
            providerResolving({
                accessKeyId: 'test-access-key-id-value',
                secretAccessKey: 'super-secret-access-key',
            }),
        );

        const target = {
            type: 'redshift',
            method: 'iam',
            host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
            cluster_id: 'my-cluster',
            user: 'analytics',
            region: 'us-east-1',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
            autocreate: true,
        };

        expect(await convertRedshiftSchema(target)).toEqual({
            type: WarehouseTypes.REDSHIFT,
            host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
            user: 'analytics',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
            keepalivesIdle: undefined,
            sslmode: undefined,
            authenticationType: RedshiftAuthenticationType.IAM,
            region: 'us-east-1',
            isServerless: false,
            clusterIdentifier: 'my-cluster',
            accessKeyId: 'test-access-key-id-value',
            secretAccessKey: 'super-secret-access-key',
            autoCreate: true,
        });
        // No named profile -> resolve via the default provider chain.
        expect(mockedFromNodeProviderChain).toHaveBeenCalledTimes(1);
        expect(mockedFromIni).not.toHaveBeenCalled();
    });

    test('should resolve a named iam_profile via fromIni and forward a session token for serverless (derived from host)', async () => {
        mockedFromIni.mockReturnValue(
            providerResolving({
                accessKeyId: 'test-access-key-id-value',
                secretAccessKey: 'super-secret-access-key',
                sessionToken: 'temporary-session-token',
            }),
        );

        const target = {
            type: 'redshift',
            method: 'iam',
            host: 'my-wg.123.us-east-1.redshift-serverless.amazonaws.com',
            iam_profile: 'my-sso-profile',
            region: 'us-east-1',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
        };

        expect(await convertRedshiftSchema(target)).toEqual({
            type: WarehouseTypes.REDSHIFT,
            host: 'my-wg.123.us-east-1.redshift-serverless.amazonaws.com',
            user: '',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
            keepalivesIdle: undefined,
            sslmode: undefined,
            authenticationType: RedshiftAuthenticationType.IAM,
            region: 'us-east-1',
            isServerless: true,
            workgroupName: 'my-wg',
            accessKeyId: 'test-access-key-id-value',
            secretAccessKey: 'super-secret-access-key',
            sessionToken: 'temporary-session-token',
            autoCreate: undefined,
        });
        // The dbt "iam_profile" is passed straight through to fromIni so we
        // resolve the exact identity dbt would use (matching its precedence).
        expect(mockedFromIni).toHaveBeenCalledWith({
            profile: 'my-sso-profile',
        });
        expect(mockedFromNodeProviderChain).not.toHaveBeenCalled();
    });

    test('should warn when forwarding temporary (expiring) credentials', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const expiration = new Date('2026-07-07T12:00:00.000Z');
        mockedFromNodeProviderChain.mockReturnValue(
            providerResolving({
                accessKeyId: 'test-access-key-id-value',
                secretAccessKey: 'super-secret-access-key',
                sessionToken: 'temporary-session-token',
                expiration,
            }),
        );

        await convertRedshiftSchema({
            type: 'redshift',
            method: 'iam',
            host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
            cluster_id: 'my-cluster',
            user: 'analytics',
            region: 'us-east-1',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
        });

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining(expiration.toISOString()),
        );
        warnSpy.mockRestore();
    });

    test('should throw when IAM target is missing a region', async () => {
        await expect(
            convertRedshiftSchema({
                type: 'redshift',
                method: 'iam',
                host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
                cluster_id: 'my-cluster',
                user: 'analytics',
                port: 5439,
                dbname: 'dev',
                schema: 'public',
            }),
        ).rejects.toThrow(ParseError);
    });

    test('should throw a clear error when the default AWS credential chain resolves nothing', async () => {
        mockedFromNodeProviderChain.mockReturnValue(
            providerRejecting('Could not load credentials from any providers'),
        );

        await expect(
            convertRedshiftSchema({
                type: 'redshift',
                method: 'iam',
                host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
                cluster_id: 'my-cluster',
                user: 'analytics',
                region: 'us-east-1',
                port: 5439,
                dbname: 'dev',
                schema: 'public',
            }),
        ).rejects.toThrow(ParseError);
    });

    test('should throw an error naming the profile and "aws sso login" when a named profile cannot be resolved', async () => {
        mockedFromIni.mockReturnValue(
            providerRejecting(
                'Token for sso-session shared-aws-profile is expired',
            ),
        );

        await expect(
            convertRedshiftSchema({
                type: 'redshift',
                method: 'iam',
                host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
                cluster_id: 'my-cluster',
                user: 'analytics',
                region: 'us-east-1',
                iam_profile: 'shared-aws-profile',
                port: 5439,
                dbname: 'dev',
                schema: 'public',
            }),
        ).rejects.toThrow(/aws sso login --profile shared-aws-profile/);
    });

    test('should throw when password target has no password', async () => {
        await expect(
            convertRedshiftSchema({
                type: 'redshift',
                host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
                user: 'analytics',
                port: 5439,
                dbname: 'dev',
                schema: 'public',
            }),
        ).rejects.toThrow(ParseError);
    });
});
