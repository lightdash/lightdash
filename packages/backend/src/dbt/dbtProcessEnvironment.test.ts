import { buildSafeDbtEnvironmentVariables } from '@lightdash/common';
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
    GIT_CONFIG_GLOBAL: '/tmp/backend-global-git-config',
    GIT_CONFIG_NOSYSTEM: '0',
    GIT_TERMINAL_PROMPT: '1',
    GIT_ASKPASS: '/tmp/backend-askpass',
    SSH_ASKPASS: '/tmp/backend-ssh-askpass',
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

    it('adds the per-run git configuration without exposing its token', () => {
        const environment = getDbtProcessEnvironment({
            processEnvironment,
            environmentVariableAllowlist: [],
            projectEnvironment: {},
            targetPath: '/tmp/dbt_target_test',
            gitConfigPath: '/tmp/dbt_git_config/config',
        });

        expect(environment).toMatchObject({
            GIT_CONFIG_GLOBAL: '/tmp/dbt_git_config/config',
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: '',
            SSH_ASKPASS: '',
        });
        expect(Object.values(environment)).not.toContain(
            'github-installation-token',
        );
    });

    it('does not add git configuration variables without a config path', () => {
        const environment = buildEnvironment();

        expect(environment).not.toHaveProperty('GIT_CONFIG_GLOBAL');
        expect(environment).not.toHaveProperty('GIT_CONFIG_NOSYSTEM');
        expect(environment).not.toHaveProperty('GIT_TERMINAL_PROMPT');
        expect(environment).not.toHaveProperty('GIT_ASKPASS');
        expect(environment).not.toHaveProperty('SSH_ASKPASS');
    });

    it('does not let project variables override the per-run git configuration', () => {
        const environment = getDbtProcessEnvironment({
            processEnvironment,
            environmentVariableAllowlist: [],
            projectEnvironment: {
                GIT_CONFIG_GLOBAL: '/tmp/attacker',
                GIT_CONFIG_NOSYSTEM: '0',
                GIT_TERMINAL_PROMPT: '1',
                GIT_ASKPASS: '/tmp/attacker-askpass',
                SSH_ASKPASS: '/tmp/attacker-ssh-askpass',
            },
            targetPath: '/tmp/dbt_target_test',
            gitConfigPath: '/tmp/dbt_git_config/config',
        });

        expect(environment).toMatchObject({
            GIT_CONFIG_GLOBAL: '/tmp/dbt_git_config/config',
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: '',
            SSH_ASKPASS: '',
        });
    });

    it('strips git configuration stored in project environment variables', () => {
        const { environment: projectEnvironment, blockedKeys } =
            buildSafeDbtEnvironmentVariables([
                { key: 'ENV', value: 'production' },
                { key: 'GIT_CONFIG_GLOBAL', value: '/tmp/attacker' },
                { key: 'GIT_ASKPASS', value: '/tmp/attacker-askpass' },
                { key: 'SSH_ASKPASS', value: '/tmp/attacker-ssh-askpass' },
            ]);
        const environment = getDbtProcessEnvironment({
            processEnvironment,
            environmentVariableAllowlist: [],
            projectEnvironment,
            targetPath: '/tmp/dbt_target_test',
            gitConfigPath: '/tmp/dbt_git_config/config',
        });

        expect(blockedKeys).toEqual([
            'GIT_CONFIG_GLOBAL',
            'GIT_ASKPASS',
            'SSH_ASKPASS',
        ]);
        expect(environment).toMatchObject({
            ENV: 'production',
            GIT_CONFIG_GLOBAL: '/tmp/dbt_git_config/config',
            GIT_ASKPASS: '',
            SSH_ASKPASS: '',
        });
        expect(Object.values(environment)).not.toContain('/tmp/attacker');
        expect(Object.values(environment)).not.toContain(
            '/tmp/attacker-askpass',
        );
        expect(Object.values(environment)).not.toContain(
            '/tmp/attacker-ssh-askpass',
        );
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
