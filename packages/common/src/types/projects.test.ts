import {
    DbtVersionOptionLatest,
    getDbtEnvironmentVariableKeyError,
    getDbtVersionSupportedWarehouses,
    getInvalidDbtEnvironmentVariableKeys,
    getLatestSupportDbtVersion,
    isSafeDbtEnvironmentVariableKey,
    isWarehouseSupportedByDbtVersion,
    LATEST_SUPPORTED_DBT_VERSION,
    LIGHTDASH_DBT_PROFILE_ENV_VAR_PREFIX,
    mergeWarehouseCredentials,
    resolveDbtVersion,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateAthenaCredentials,
    type CreatePostgresCredentials,
    type CreateRedshiftCredentials,
    type CreateWarehouseCredentials,
} from './projects';

describe('dbt environment variable validation', () => {
    test('allows customer-defined environment variables', () => {
        expect(isSafeDbtEnvironmentVariableKey('ENV')).toBe(true);
        expect(isSafeDbtEnvironmentVariableKey('LD_CUSTOMER_ENV')).toBe(true);
        expect(isSafeDbtEnvironmentVariableKey('SNOWFLAKE_ACCOUNT')).toBe(true);
        expect(isSafeDbtEnvironmentVariableKey('DBT_ENV_SECRET_TOKEN')).toBe(
            true,
        );
    });

    test('blocks environment variables that can alter child process execution', () => {
        expect(getDbtEnvironmentVariableKeyError('GIT_SSH_COMMAND')).toContain(
            'cannot be used',
        );
        expect(getDbtEnvironmentVariableKeyError('PYTHONPATH')).toContain(
            'cannot be used',
        );
        expect(getDbtEnvironmentVariableKeyError('LD_PRELOAD')).toContain(
            'cannot be used',
        );
    });

    test('reserves Lightdash profile variables for internal use', () => {
        const key = `${LIGHTDASH_DBT_PROFILE_ENV_VAR_PREFIX}PASSWORD`;

        expect(getDbtEnvironmentVariableKeyError(key)).toContain(
            'reserved for Lightdash',
        );
        expect(
            getDbtEnvironmentVariableKeyError(key, {
                allowLightdashProfileEnvironmentVariables: true,
            }),
        ).toBeUndefined();
    });

    test('returns invalid project environment variable keys', () => {
        expect(
            getInvalidDbtEnvironmentVariableKeys([
                { key: 'ENV', value: 'production' },
                { key: 'GIT_SSH_COMMAND', value: 'echo unsafe' },
                { key: 'PYTHONPATH', value: '/tmp' },
            ]),
        ).toEqual(['GIT_SSH_COMMAND', 'PYTHONPATH']);
    });
});

describe('mergeWarehouseCredentials', () => {
    const athenaBase: CreateAthenaCredentials = {
        type: WarehouseTypes.ATHENA,
        region: 'us-east-2',
        database: 'awsdatacatalog',
        schema: 'dbt',
        s3StagingDir: 's3://staging/',
        accessKeyId: 'PARENT_KEY',
        secretAccessKey: 'PARENT_SECRET',
        assumeRoleArn: 'arn:aws:iam::111:role/parent-role',
        assumeRoleExternalId: 'parent-external-id',
    };

    test('does not inherit parent assumeRoleArn when preview supplies its own base credentials', () => {
        // The preview credentials come from profiles.yml with no assume-role config.
        // JSON transport strips undefined keys, so the incoming object simply omits them.
        const previewCredentials: CreateAthenaCredentials = {
            type: WarehouseTypes.ATHENA,
            region: 'us-east-2',
            database: 'awsdatacatalog',
            schema: 'dbt',
            s3StagingDir: 's3://staging/',
            accessKeyId: 'PREVIEW_KEY',
            secretAccessKey: 'PREVIEW_SECRET',
            sessionToken: 'PREVIEW_TOKEN',
        };

        const merged = mergeWarehouseCredentials(
            athenaBase,
            previewCredentials,
        );

        expect(merged.assumeRoleArn).toBeUndefined();
        expect(merged.assumeRoleExternalId).toBeUndefined();
        // The preview's own base credentials are still used
        expect(merged.accessKeyId).toBe('PREVIEW_KEY');
    });

    test('uses the preview assumeRoleArn when it supplies its own', () => {
        const previewCredentials: CreateAthenaCredentials = {
            ...athenaBase,
            accessKeyId: 'PREVIEW_KEY',
            secretAccessKey: 'PREVIEW_SECRET',
            assumeRoleArn: 'arn:aws:iam::222:role/preview-role',
            assumeRoleExternalId: 'preview-external-id',
        };

        const merged = mergeWarehouseCredentials(
            athenaBase,
            previewCredentials,
        );

        expect(merged.assumeRoleArn).toBe('arn:aws:iam::222:role/preview-role');
        expect(merged.assumeRoleExternalId).toBe('preview-external-id');
    });

    test('still inherits non-sensitive advanced settings the preview omits', () => {
        // Guards against the exclusion being too broad: excluding the assume-role
        // fields must not stop other parent-only config from being inherited.
        const previewCredentials: CreateAthenaCredentials = {
            type: WarehouseTypes.ATHENA,
            region: 'us-east-2',
            database: 'awsdatacatalog',
            schema: 'dbt',
            s3StagingDir: 's3://staging/',
            accessKeyId: 'PREVIEW_KEY',
            secretAccessKey: 'PREVIEW_SECRET',
        };

        const merged = mergeWarehouseCredentials(
            { ...athenaBase, workGroup: 'data_platform', numRetries: 7 },
            previewCredentials,
        );

        expect(merged.workGroup).toBe('data_platform');
        expect(merged.numRetries).toBe(7);
        expect(merged.assumeRoleArn).toBeUndefined();
    });

    test('does not inherit parent assumeRoleArn for Redshift either', () => {
        const redshiftBase: CreateRedshiftCredentials = {
            type: WarehouseTypes.REDSHIFT,
            host: 'cluster.redshift.amazonaws.com',
            user: '',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
            accessKeyId: 'PARENT_KEY',
            secretAccessKey: 'PARENT_SECRET',
            assumeRoleArn: 'arn:aws:iam::111:role/parent-role',
            assumeRoleExternalId: 'parent-external-id',
        };
        const previewCredentials: CreateRedshiftCredentials = {
            type: WarehouseTypes.REDSHIFT,
            host: 'cluster.redshift.amazonaws.com',
            user: '',
            port: 5439,
            dbname: 'dev',
            schema: 'public',
            accessKeyId: 'PREVIEW_KEY',
            secretAccessKey: 'PREVIEW_SECRET',
        };

        const merged = mergeWarehouseCredentials(
            redshiftBase,
            previewCredentials,
        );

        expect(merged.assumeRoleArn).toBeUndefined();
        expect(merged.assumeRoleExternalId).toBeUndefined();
    });

    test('returns preview credentials as-is when warehouse types differ', () => {
        const postgresPreview: CreatePostgresCredentials = {
            type: WarehouseTypes.POSTGRES,
            host: 'localhost',
            user: 'preview',
            password: 'preview',
            port: 5432,
            dbname: 'dev',
            schema: 'public',
        };

        const parent: CreateWarehouseCredentials = {
            ...athenaBase,
            requireUserCredentials: true,
        };
        const merged = mergeWarehouseCredentials<CreateWarehouseCredentials>(
            parent,
            postgresPreview,
        );

        expect(merged).toEqual(postgresPreview);
        expect(merged).not.toHaveProperty('requireUserCredentials');
    });

    test('preserves requireUserCredentials from either side', () => {
        const previewCredentials: CreateAthenaCredentials = {
            type: WarehouseTypes.ATHENA,
            region: 'us-east-2',
            database: 'awsdatacatalog',
            schema: 'dbt',
            s3StagingDir: 's3://staging/',
            accessKeyId: 'PREVIEW_KEY',
            secretAccessKey: 'PREVIEW_SECRET',
        };

        // Inherited from the parent
        expect(
            mergeWarehouseCredentials(
                { ...athenaBase, requireUserCredentials: true },
                previewCredentials,
            ).requireUserCredentials,
        ).toBe(true);

        // Set by the preview itself
        expect(
            mergeWarehouseCredentials(athenaBase, {
                ...previewCredentials,
                requireUserCredentials: true,
            }).requireUserCredentials,
        ).toBe(true);
    });
});

describe('latest dbt version', () => {
    test('`latest` resolves to LATEST_SUPPORTED_DBT_VERSION', () => {
        expect(getLatestSupportDbtVersion()).toBe(LATEST_SUPPORTED_DBT_VERSION);
        expect(resolveDbtVersion(DbtVersionOptionLatest.LATEST)).toBe(
            LATEST_SUPPORTED_DBT_VERSION,
        );
    });

    test('`latest` supports every warehouse adapter', () => {
        const supported = getDbtVersionSupportedWarehouses(
            LATEST_SUPPORTED_DBT_VERSION,
        );
        const missing = Object.values(WarehouseTypes).filter(
            (warehouse) => !supported.includes(warehouse),
        );
        expect(missing).toEqual([]);
    });

    test('records dbt 1.12 as missing databricks support', () => {
        expect(
            isWarehouseSupportedByDbtVersion(
                SupportedDbtVersions.V1_12,
                WarehouseTypes.DATABRICKS,
            ),
        ).toBe(false);
    });
});
