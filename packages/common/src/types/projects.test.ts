import {
    DbtProjectType,
    getDbtEnvironmentVariableKeyError,
    getInvalidDbtEnvironmentVariableKeys,
    isSafeDbtEnvironmentVariableKey,
    LIGHTDASH_DBT_PROFILE_ENV_VAR_PREFIX,
    maybeOverrideDbtConnection,
    type DbtGithubProjectConfig,
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

describe('maybeOverrideDbtConnection', () => {
    const githubConnection: DbtGithubProjectConfig = {
        type: DbtProjectType.GITHUB,
        authorization_method: 'personal_access_token',
        personal_access_token: 'token',
        repository: 'org/repo',
        branch: 'main',
        project_sub_path: '/',
    };

    test('builds an S3-sourced MANIFEST connection when manifestS3Path is set', () => {
        const result = maybeOverrideDbtConnection(githubConnection, {
            manifestS3Path: 'previews/combined-manifest.json',
        });

        expect(result).toEqual({
            type: DbtProjectType.MANIFEST,
            manifest: '',
            manifestS3Path: 'previews/combined-manifest.json',
            hideRefreshButton: true,
        });
    });

    test('an explicit inline manifest overrides the S3 source for that preview', () => {
        const result = maybeOverrideDbtConnection(githubConnection, {
            manifest: '{"nodes":{},"metadata":{}}',
            manifestS3Path: 'previews/combined-manifest.json',
        });

        expect(result).toEqual({
            type: DbtProjectType.MANIFEST,
            manifest: '{"nodes":{},"metadata":{}}',
            hideRefreshButton: true,
        });
    });

    test('leaves the connection unchanged when no manifest source is provided', () => {
        const result = maybeOverrideDbtConnection(githubConnection, {
            branch: 'feature-branch',
        });

        expect(result).toEqual({
            ...githubConnection,
            branch: 'feature-branch',
        });
    });
});
