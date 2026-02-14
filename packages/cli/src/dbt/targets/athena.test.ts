import {
    AthenaAuthenticationType,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { convertAthenaSchema } from './athena';

describe('convertAthenaSchema', () => {
    test('should parse access key authentication when keys are present', () => {
        const target = {
            type: 'athena',
            region_name: 'us-east-1',
            database: 'AwsDataCatalog',
            schema: 'default',
            s3_staging_dir: 's3://test-results/',
            aws_access_key_id: 'AKIATEST',
            aws_secret_access_key: 'SECRETTEST',
        };

        expect(convertAthenaSchema(target)).toEqual({
            type: WarehouseTypes.ATHENA,
            region: 'us-east-1',
            database: 'AwsDataCatalog',
            schema: 'default',
            s3StagingDir: 's3://test-results/',
            s3DataDir: undefined,
            authenticationType: AthenaAuthenticationType.ACCESS_KEY,
            accessKeyId: 'AKIATEST',
            secretAccessKey: 'SECRETTEST',
            workGroup: undefined,
            threads: undefined,
            numRetries: undefined,
        });
    });

    test('should parse iam role authentication when keys are missing', () => {
        const target = {
            type: 'athena',
            region_name: 'us-east-1',
            database: 'AwsDataCatalog',
            schema: 'default',
            s3_staging_dir: 's3://test-results/',
        };

        expect(convertAthenaSchema(target)).toEqual({
            type: WarehouseTypes.ATHENA,
            region: 'us-east-1',
            database: 'AwsDataCatalog',
            schema: 'default',
            s3StagingDir: 's3://test-results/',
            s3DataDir: undefined,
            authenticationType: AthenaAuthenticationType.IAM_ROLE,
            accessKeyId: undefined,
            secretAccessKey: undefined,
            workGroup: undefined,
            threads: undefined,
            numRetries: undefined,
        });
    });

    test('should require schema field', () => {
        expect(() =>
            convertAthenaSchema({
                type: 'athena',
                region_name: 'us-east-1',
                database: 'AwsDataCatalog',
                s3_staging_dir: 's3://test-results/',
            }),
        ).toThrow(ParseError);
    });

    test('should throw parse error for invalid Athena target', () => {
        expect(() =>
            convertAthenaSchema({
                type: 'athena',
                region_name: 'us-east-1',
            }),
        ).toThrow(ParseError);
    });
});
