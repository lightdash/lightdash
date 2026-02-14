import { WarehouseTypes } from '@lightdash/common';
import { getCredentialsWithPlaceholders } from './EditCredentialsModal';

describe('getCredentialsWithPlaceholders', () => {
    test('should return placeholders for Athena credentials', () => {
        const result = getCredentialsWithPlaceholders({
            type: WarehouseTypes.ATHENA,
        });
        expect(result).toEqual({
            type: WarehouseTypes.ATHENA,
            accessKeyId: '',
            secretAccessKey: '',
        });
    });

    test('should return placeholders for Redshift credentials', () => {
        const result = getCredentialsWithPlaceholders({
            type: WarehouseTypes.REDSHIFT,
            user: 'testuser',
        });
        expect(result).toEqual({
            type: WarehouseTypes.REDSHIFT,
            user: 'testuser',
            password: '',
        });
    });

    test('should return placeholders for Postgres credentials', () => {
        const result = getCredentialsWithPlaceholders({
            type: WarehouseTypes.POSTGRES,
            user: 'testuser',
        });
        expect(result).toEqual({
            type: WarehouseTypes.POSTGRES,
            user: 'testuser',
            password: '',
        });
    });

    test('should return placeholders for BigQuery credentials', () => {
        const result = getCredentialsWithPlaceholders({
            type: WarehouseTypes.BIGQUERY,
        });
        expect(result).toEqual({
            type: WarehouseTypes.BIGQUERY,
            keyfileContents: {},
        });
    });

    test('should return placeholders for Databricks credentials', () => {
        const result = getCredentialsWithPlaceholders({
            type: WarehouseTypes.DATABRICKS,
        });
        expect(result).toEqual({
            type: WarehouseTypes.DATABRICKS,
            personalAccessToken: '',
        });
    });

    test('should throw for unsupported credential type', () => {
        expect(() =>
            getCredentialsWithPlaceholders({
                type: 'unknown' as WarehouseTypes,
            } as any),
        ).toThrow('Credential type not supported');
    });
});
