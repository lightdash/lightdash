import {
    ParseError,
    RedshiftAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import { convertRedshiftSchema } from './redshift';

describe('convertRedshiftSchema', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
        delete process.env.AWS_SESSION_TOKEN;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('should parse password authentication', () => {
        const target = {
            type: 'redshift',
            host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
            user: 'analytics',
            password: 'secret',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
        };

        expect(convertRedshiftSchema(target)).toEqual({
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

    test('should parse IAM authentication for a provisioned cluster', () => {
        process.env.AWS_ACCESS_KEY_ID = 'test-access-key-id-value';
        process.env.AWS_SECRET_ACCESS_KEY = 'super-secret-access-key';

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

        expect(convertRedshiftSchema(target)).toEqual({
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
    });

    test('should parse IAM authentication for serverless (derived from host), forwarding a session token when present', () => {
        process.env.AWS_ACCESS_KEY_ID = 'test-access-key-id-value';
        process.env.AWS_SECRET_ACCESS_KEY = 'super-secret-access-key';
        process.env.AWS_SESSION_TOKEN = 'temporary-session-token';

        const target = {
            type: 'redshift',
            method: 'iam',
            host: 'my-wg.123.us-east-1.redshift-serverless.amazonaws.com',
            region: 'us-east-1',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
        };

        expect(convertRedshiftSchema(target)).toEqual({
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
    });

    test('should throw when IAM target is missing a region', () => {
        expect(() =>
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
        ).toThrow(ParseError);
    });

    test('should throw when IAM target has no AWS credentials available', () => {
        expect(() =>
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
        ).toThrow(ParseError);
    });

    test('should throw a clear error when IAM target only has a local named profile', () => {
        expect(() =>
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
        ).toThrow(/iam_profile: shared-aws-profile/);
    });

    test('should throw when password target has no password', () => {
        expect(() =>
            convertRedshiftSchema({
                type: 'redshift',
                host: 'cluster.abc.us-east-1.redshift.amazonaws.com',
                user: 'analytics',
                port: 5439,
                dbname: 'dev',
                schema: 'public',
            }),
        ).toThrow(ParseError);
    });
});
