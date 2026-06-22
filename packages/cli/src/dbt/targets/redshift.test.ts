import {
    ParseError,
    RedshiftAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import { convertRedshiftSchema } from './redshift';

describe('convertRedshiftSchema', () => {
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
            clusterIdentifier: 'my-cluster',
            autoCreate: true,
        });
    });

    test('should parse IAM authentication without a user (serverless)', () => {
        const target = {
            type: 'redshift',
            method: 'iam',
            host: 'wg.123.us-east-1.redshift-serverless.amazonaws.com',
            region: 'us-east-1',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
        };

        expect(convertRedshiftSchema(target)).toEqual({
            type: WarehouseTypes.REDSHIFT,
            host: 'wg.123.us-east-1.redshift-serverless.amazonaws.com',
            user: '',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
            keepalivesIdle: undefined,
            sslmode: undefined,
            authenticationType: RedshiftAuthenticationType.IAM,
            region: 'us-east-1',
            clusterIdentifier: undefined,
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
