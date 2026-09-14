import {
    getDbtProcessEnvironment,
    getMissingEnvironmentVariableHint,
} from './dbtProcessEnvironment';

const processEnvironment: NodeJS.ProcessEnv = {
    PATH: '/usr/local/bin:/usr/bin',
    HOME: '/root',
    TZ: 'Europe/London',
    HTTPS_PROXY: 'http://proxy.internal:3128',
    REQUESTS_CA_BUNDLE: '/etc/ssl/corporate.pem',
    AWS_ACCESS_KEY_ID: 'aws-key-id',
    AWS_SECRET_ACCESS_KEY: 'host-secret',
    GOOGLE_APPLICATION_CREDENTIALS: '/adc.json',
    LIGHTDASH_SECRET: 'not-for-dbt',
    LIGHTDASH_LICENSE_KEY: 'licence-jwt',
    PGPASSWORD: 'metadata-db-password',
    DATABASE_CONNECTION_URI: 'postgres://user:pw@host/db',
    ANTHROPIC_API_KEY: 'anthropic-key',
    MY_AWS_SECRET_KEY: 'lookalike-secret',
    UNKNOWN_VARIABLE: 'unknown',
    UTILS_PII_SALT: 'machine-owned-salt',
    OTHER_ALLOWED_VARIABLE: 'other-machine-value',
    ALLOW_DBT_COMMANDS_ACCESS_TO_ENV_VARS:
        'UTILS_PII_SALT,OTHER_ALLOWED_VARIABLE',
    EMPTY_VARIABLE: undefined,
};

const buildEnvironment = (projectEnvironment: Record<string, string> = {}) =>
    getDbtProcessEnvironment({
        processEnvironment,
        environmentVariableAllowlist: [],
        projectEnvironment,
        targetPath: '/tmp/dbt_target_test',
    });

describe('getDbtProcessEnvironment', () => {
    it('forwards what dbt needs to run and reach the network', () => {
        const environment = buildEnvironment();

        expect(environment.PATH).toEqual('/usr/local/bin:/usr/bin');
        expect(environment.HOME).toEqual('/root');
        expect(environment.TZ).toEqual('Europe/London');
        expect(environment.HTTPS_PROXY).toEqual('http://proxy.internal:3128');
        expect(environment.REQUESTS_CA_BUNDLE).toEqual(
            '/etc/ssl/corporate.pem',
        );
    });

    it('forwards the credentials warehouses resolve from the host', () => {
        const environment = buildEnvironment();

        expect(environment.AWS_ACCESS_KEY_ID).toEqual('aws-key-id');
        expect(environment.GOOGLE_APPLICATION_CREDENTIALS).toEqual('/adc.json');
    });

    it('does not forward the backend own secrets', () => {
        const environment = buildEnvironment();

        expect(environment).not.toHaveProperty('LIGHTDASH_SECRET');
        expect(environment).not.toHaveProperty('LIGHTDASH_LICENSE_KEY');
        expect(environment).not.toHaveProperty('PGPASSWORD');
        expect(environment).not.toHaveProperty('DATABASE_CONNECTION_URI');
        expect(environment).not.toHaveProperty('ANTHROPIC_API_KEY');
        // A value smuggled under a different key would pass the checks above
        expect(Object.values(environment)).not.toContain('not-for-dbt');
        expect(Object.values(environment)).not.toContain('licence-jwt');
        expect(Object.values(environment)).not.toContain(
            'metadata-db-password',
        );
    });

    it('matches names exactly, so lookalikes are not forwarded', () => {
        const environment = buildEnvironment();

        expect(environment).not.toHaveProperty('MY_AWS_SECRET_KEY');
        expect(environment).not.toHaveProperty('UNKNOWN_VARIABLE');
        expect(environment).not.toHaveProperty('EMPTY_VARIABLE');
    });

    it('forwards machine variables named in the dbt allowlist', () => {
        const environment = getDbtProcessEnvironment({
            processEnvironment: {
                ...processEnvironment,
            },
            environmentVariableAllowlist: [
                'UTILS_PII_SALT',
                'OTHER_ALLOWED_VARIABLE',
            ],
            projectEnvironment: {},
            targetPath: '/tmp/dbt_target_test',
        });

        expect(environment.UTILS_PII_SALT).toEqual('machine-owned-salt');
        expect(environment.OTHER_ALLOWED_VARIABLE).toEqual(
            'other-machine-value',
        );
        expect(environment).not.toHaveProperty(
            'ALLOW_DBT_COMMANDS_ACCESS_TO_ENV_VARS',
        );
        expect(environment).not.toHaveProperty('UNKNOWN_VARIABLE');
    });

    it('lets project variables override allowlisted machine variables', () => {
        const environment = getDbtProcessEnvironment({
            processEnvironment: {
                ...processEnvironment,
            },
            environmentVariableAllowlist: ['UTILS_PII_SALT'],
            projectEnvironment: {
                UTILS_PII_SALT: 'project-owned-salt',
            },
            targetPath: '/tmp/dbt_target_test',
        });

        expect(environment.UTILS_PII_SALT).toEqual('project-owned-salt');
    });

    it('keeps the Lightdash controlled dbt variables', () => {
        const environment = buildEnvironment({
            DBT_TARGET_PATH: '/tmp/attacker',
        });

        expect(environment.DBT_PARTIAL_PARSE).toEqual('false');
        expect(environment.DBT_SEND_ANONYMOUS_USAGE_STATS).toEqual('false');
        expect(environment.DBT_TARGET_PATH).toEqual('/tmp/dbt_target_test');
    });

    it('uses only the Lightdash-controlled git config when provided', () => {
        const environment = getDbtProcessEnvironment({
            processEnvironment,
            environmentVariableAllowlist: [],
            projectEnvironment: {
                GIT_CONFIG_GLOBAL: '/tmp/attacker',
                GIT_TERMINAL_PROMPT: '1',
            },
            targetPath: '/tmp/dbt_target_test',
            gitConfigGlobalPath: '/tmp/lightdash-gitconfig',
        });

        expect(environment.GIT_CONFIG_GLOBAL).toEqual(
            '/tmp/lightdash-gitconfig',
        );
        expect(environment.GIT_TERMINAL_PROMPT).toEqual('0');
    });

    it('does not let a project redirect the runtime plumbing', () => {
        const environment = buildEnvironment({
            PATH: '/tmp/malicious',
            HOME: '/tmp/malicious',
            HTTPS_PROXY: 'http://attacker.example:8080',
            REQUESTS_CA_BUNDLE: '/tmp/malicious.pem',
        });

        expect(environment.PATH).toEqual('/usr/local/bin:/usr/bin');
        expect(environment.HOME).toEqual('/root');
        expect(environment.HTTPS_PROXY).toEqual('http://proxy.internal:3128');
        expect(environment.REQUESTS_CA_BUNDLE).toEqual(
            '/etc/ssl/corporate.pem',
        );
    });

    it('lets the warehouse credentials beat the host identity', () => {
        // profiles.ts injects these for Redshift IAM with static keys, and they
        // must win over whatever the pod itself is authenticated as
        const environment = buildEnvironment({
            AWS_ACCESS_KEY_ID: 'warehouse-key-id',
            AWS_SECRET_ACCESS_KEY: 'warehouse-secret',
        });

        expect(environment.AWS_ACCESS_KEY_ID).toEqual('warehouse-key-id');
        expect(environment.AWS_SECRET_ACCESS_KEY).toEqual('warehouse-secret');
    });

    it('passes project variables through', () => {
        const environment = buildEnvironment({
            LIGHTDASH_DBT_PROFILE_VAR_PASSWORD: 'warehouse-password',
            DBT_ENV_SECRET_GIT_TOKEN: 'project-owned-token',
        });

        expect(environment.LIGHTDASH_DBT_PROFILE_VAR_PASSWORD).toEqual(
            'warehouse-password',
        );
        expect(environment.DBT_ENV_SECRET_GIT_TOKEN).toEqual(
            'project-owned-token',
        );
    });
});

describe('getMissingEnvironmentVariableHint', () => {
    it('names the variables dbt asked for', () => {
        const hint = getMissingEnvironmentVariableHint(
            `Env var required but not provided: 'MY_VAR'\nEnv var required but not provided: 'OTHER_VAR'`,
        );

        expect(hint).toContain('MY_VAR');
        expect(hint).toContain('OTHER_VAR');
        expect(hint).toContain('ALLOW_DBT_COMMANDS_ACCESS_TO_ENV_VARS');
    });

    it('returns nothing for unrelated dbt failures', () => {
        expect(
            getMissingEnvironmentVariableHint('Database Error in model orders'),
        ).toBeUndefined();
    });
});
