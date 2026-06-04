import {
    filterDbtEnvironment,
    getInvalidDbtEnvironmentVariableKeys,
    isAllowedDbtEnvironmentVariableKey,
} from './projects';

describe('dbt environment variables', () => {
    it('allows blank keys for empty UI rows and documented dbt variables', () => {
        expect(isAllowedDbtEnvironmentVariableKey('')).toEqual(true);
        expect(isAllowedDbtEnvironmentVariableKey('DBT_PROFILES_DIR')).toEqual(
            true,
        );
        expect(
            isAllowedDbtEnvironmentVariableKey('DBT_ENV_CUSTOM_ENV_KEY'),
        ).toEqual(true);
        expect(
            isAllowedDbtEnvironmentVariableKey('DBT_ENV_SECRET_TOKEN'),
        ).toEqual(true);
        expect(isAllowedDbtEnvironmentVariableKey('DBT_CLOUD_RUN_ID')).toEqual(
            true,
        );
    });

    it('rejects non-dbt variables', () => {
        expect(
            getInvalidDbtEnvironmentVariableKeys([
                { key: 'LIGHTDASH_DBT_PROFILE_VAR_PASSWORD', value: 'secret' },
                { key: 'AWS_ACCESS_KEY_ID', value: 'aws-key' },
                {
                    key: 'GOOGLE_APPLICATION_CREDENTIALS',
                    value: '/tmp/credentials.json',
                },
                { key: 'DATABRICKS_HOST', value: 'databricks-host' },
                { key: 'DBT_ENV_CUSTOM_key', value: 'lowercase-key' },
                { key: 'GIT_SSH_COMMAND', value: 'touch /tmp/pwned' },
                { key: 'GIT_CONFIG_COUNT', value: '1' },
                { key: 'LD_PRELOAD', value: '/tmp/payload.so' },
                { key: 'DYLD_INSERT_LIBRARIES', value: '/tmp/payload.dylib' },
                { key: 'PYTHONPATH', value: '/tmp' },
                { key: 'NODE_OPTIONS', value: '--require /tmp/payload.js' },
                { key: 'BASH_ENV', value: '/tmp/payload.sh' },
                { key: 'SSH_ASKPASS', value: '/tmp/payload.sh' },
                { key: 'BASH_FUNC_x%%', value: '() { ignored; }' },
            ]),
        ).toEqual([
            'LIGHTDASH_DBT_PROFILE_VAR_PASSWORD',
            'AWS_ACCESS_KEY_ID',
            'GOOGLE_APPLICATION_CREDENTIALS',
            'DATABRICKS_HOST',
            'DBT_ENV_CUSTOM_key',
            'GIT_SSH_COMMAND',
            'GIT_CONFIG_COUNT',
            'LD_PRELOAD',
            'DYLD_INSERT_LIBRARIES',
            'PYTHONPATH',
            'NODE_OPTIONS',
            'BASH_ENV',
            'SSH_ASKPASS',
            'BASH_FUNC_x%%',
        ]);
    });

    it('filters environment records before spawning dbt', () => {
        expect(
            filterDbtEnvironment({
                '': 'ignored-empty-row',
                DBT_ENV_CUSTOM_ENV_KEY: 'dbt-value',
                LIGHTDASH_DBT_PROFILE_VAR_PASSWORD: 'password',
                LIGHTDASH_API_KEY: 'lightdash-api-key',
                AWS_ACCESS_KEY_ID: 'aws-key',
                GIT_SSH_COMMAND: 'touch /tmp/pwned',
            }),
        ).toEqual({
            DBT_ENV_CUSTOM_ENV_KEY: 'dbt-value',
            LIGHTDASH_DBT_PROFILE_VAR_PASSWORD: 'password',
        });
    });
});
