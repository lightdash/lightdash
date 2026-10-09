import { Ability } from '@casl/ability';
import {
    buildSnowflakeAgentIntegrationSql,
    FeatureNotEnabledError,
    ForbiddenError,
    getSnowflakeAgentRedirectUri,
    ParameterError,
    SNOWFLAKE_AGENT_OAUTH_SETTINGS,
    WarehouseTypes,
    type PossibleAbilities,
} from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AiAccessService } from './AiAccessService';

const setup = () => {
    const config = {
        ...lightdashConfigMock,
        siteUrl: 'https://instance.example/nested/path/',
        license: { ...lightdashConfigMock.license, licenseKey: 'test-license' },
        auth: {
            ...lightdashConfigMock.auth,
            snowflakeAi: {
                ...lightdashConfigMock.auth.snowflakeAi,
                clientId: 'test-client',
                clientSecret: 'test-secret',
                authorizationEndpoint: 'https://snowflake.example/authorize',
                tokenEndpoint:
                    'https://test-account.snowflakecomputing.com/token',
            },
        },
    };
    const account = buildAccount();
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'Organization' },
    ]);
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const credentials = {
        hasOrganizationAiSnowflakeCredential: vi.fn().mockResolvedValue(false),
    };
    const rules = {
        set: vi.fn().mockResolvedValue({
            changed: false,
            previousSource: 'marked_person',
        }),
    };
    const settings = { upsert: vi.fn() };
    const service = new AiAccessService({
        lightdashConfig: config,
        featureFlagModel,
        userWarehouseCredentialsModel: credentials,
        organizationAgentIdentityRulesModel: rules,
        organizationAgentIdentitySettingsModel: settings,
    } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
    const fetchMock = vi.fn().mockResolvedValue({ status: 400 });
    vi.stubGlobal('fetch', fetchMock);
    return {
        config,
        account,
        featureFlagModel,
        credentials,
        rules,
        settings,
        service,
        fetchMock,
    };
};

afterEach(() => vi.unstubAllGlobals());

describe('Snowflake integration setup', () => {
    it('returns the shared callback and SQL without exposing secrets', async () => {
        const { service, account, config } = setup();
        const result = await service.getSnowflakeSetup(account);
        const redirectUri = getSnowflakeAgentRedirectUri(config.siteUrl);
        expect(result).toEqual({
            redirectUri,
            integrationSql: buildSnowflakeAgentIntegrationSql({ redirectUri }),
            configured: true,
            missingSettings: [],
        });
        expect(JSON.stringify(result)).not.toMatch(/test-secret|test-client/);
    });
    it('names every missing setting and the Enterprise licence', async () => {
        const { service, account, config, fetchMock } = setup();
        Object.assign(config.auth.snowflakeAi, {
            clientId: undefined,
            clientSecret: undefined,
            authorizationEndpoint: undefined,
            tokenEndpoint: undefined,
        });
        Object.assign(config.license, { licenseKey: undefined });
        const result = await service.getSnowflakeSetup(account);
        expect(result.missingSettings).toEqual([
            ...SNOWFLAKE_AGENT_OAUTH_SETTINGS.map(({ envVar }) => envVar),
            'Enterprise licence',
        ]);
        expect(result.configured).toBe(false);
        const verification = await service.verifySnowflakeSetup(account);
        expect(verification.passed).toBe(false);
        expect(verification.checks[0].status).toBe('failed');
        result.missingSettings.forEach((setting) =>
            expect(verification.checks[0].detail).toContain(setting),
        );
        expect(verification.checks[1].status).toBe('not_checked');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it.each([200, 302, 303, 307, 400, 401, 403])(
        'accepts HTTP %s without following redirects or sending credentials',
        async (status) => {
            const { service, account, fetchMock, config } = setup();
            config.auth.snowflakeAi.authorizationEndpoint =
                'https://user:password@snowflake.example/authorize?client_secret=hidden#fragment';
            fetchMock.mockResolvedValue({ status });
            const result = await service.verifySnowflakeSetup(account);
            expect(result.passed).toBe(true);
            expect(result.checkedAt).toBeInstanceOf(Date);
            expect(result.checks[1]).toMatchObject({
                status: 'passed',
                detail: `Snowflake answered (HTTP ${status}).`,
            });
            expect(result.checks[2]).toMatchObject({
                required: false,
                status: 'not_checked',
            });
            expect(fetchMock).toHaveBeenCalledWith(
                'https://snowflake.example/authorize',
                {
                    method: 'GET',
                    redirect: 'manual',
                    signal: expect.any(AbortSignal),
                },
            );
        },
    );
    it.each([201, 301, 304, 308, 404, 405, 429, 499, 500, 503])(
        'fails for HTTP %s',
        async (status) => {
            const { service, account, fetchMock } = setup();
            fetchMock.mockResolvedValue({ status });
            const result = await service.verifySnowflakeSetup(account);
            expect(result.passed).toBe(false);
            expect(result.checks[1]).toMatchObject({
                status: 'failed',
                detail: `The authorization endpoint returned HTTP ${status}.${
                    [404, 405].includes(status)
                        ? ' Check SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT.'
                        : ''
                }`,
            });
        },
    );
    it.each(['Error', 'TimeoutError', 'AbortError'])(
        'reports a plain reason for %s without exposing the error',
        async (name) => {
            const { service, account, fetchMock } = setup();
            fetchMock.mockRejectedValue(
                Object.assign(new Error('sensitive-url'), { name }),
            );
            const result = await service.verifySnowflakeSetup(account);
            expect(result.passed).toBe(false);
            expect(result.checks[1]).toMatchObject({
                status: 'failed',
                detail:
                    name === 'Error'
                        ? 'Could not reach the authorization endpoint.'
                        : 'The authorization endpoint did not respond within 5 seconds.',
            });
        },
    );
    it('sets a five second timeout', async () => {
        const { service, account } = setup();
        const timeout = vi.spyOn(AbortSignal, 'timeout');
        await service.verifySnowflakeSetup(account);
        expect(timeout).toHaveBeenCalledWith(5000);
        timeout.mockRestore();
    });
    it('checks agent activation evidence in this organisation without a warehouse query', async () => {
        const { service, account, credentials } = setup();
        credentials.hasOrganizationAiSnowflakeCredential.mockResolvedValue(
            true,
        );
        const result = await service.verifySnowflakeSetup(account);
        expect(
            credentials.hasOrganizationAiSnowflakeCredential,
        ).toHaveBeenCalledWith(account.organization?.organizationUuid);
        expect(result.checks[2]).toMatchObject({
            status: 'passed',
            required: false,
        });
    });
    it.each(['getSnowflakeSetup', 'verifySnowflakeSetup'] as const)(
        'gates %s by flag and organisation permission',
        async (method) => {
            const {
                service,
                account,
                featureFlagModel,
                fetchMock,
                credentials,
            } = setup();
            featureFlagModel.get.mockResolvedValue({ enabled: false });
            await expect(service[method](account)).rejects.toBeInstanceOf(
                FeatureNotEnabledError,
            );
            featureFlagModel.get.mockResolvedValue({ enabled: true });
            account.user.ability = new Ability<PossibleAbilities>([]);
            await expect(service[method](account)).rejects.toBeInstanceOf(
                ForbiddenError,
            );
            expect(fetchMock).not.toHaveBeenCalled();
            expect(
                credentials.hasOrganizationAiSnowflakeCredential,
            ).not.toHaveBeenCalled();
        },
    );
    it('rejects unconfigured agent sign-in on both write endpoints, but permits the existing source', async () => {
        const { service, account, config, rules, settings } = setup();
        Object.assign(config.auth.snowflakeAi, { clientSecret: undefined });
        await expect(
            service.updateOrganizationRule(account, WarehouseTypes.SNOWFLAKE, {
                source: 'agent_sign_in',
            }),
        ).rejects.toThrow(
            new ParameterError(
                'The Snowflake agent integration is not configured on this instance',
            ),
        );
        await expect(
            service.updateOrganizationSettings(account, {
                requireVerifiedAgentSessions: true,
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(rules.set).not.toHaveBeenCalled();
        expect(settings.upsert).not.toHaveBeenCalled();
        await expect(
            service.updateOrganizationRule(account, WarehouseTypes.SNOWFLAKE, {
                source: 'marked_person',
            }),
        ).resolves.toMatchObject({ source: 'marked_person' });
    });
    it('reports an unresolved account in setup and verification and blocks both write endpoints', async () => {
        const { service, account, config, fetchMock, rules, settings } =
            setup();
        Object.assign(config.auth.snowflakeAi, {
            account: undefined,
            tokenEndpoint: 'https://proxy.example/token',
        });
        await expect(service.getSnowflakeSetup(account)).resolves.toMatchObject(
            {
                configured: false,
                missingSettings: ['SNOWFLAKE_AI_OAUTH_ACCOUNT'],
            },
        );
        const result = await service.verifySnowflakeSetup(account);
        expect(result.passed).toBe(false);
        expect(result.checks[0]).toMatchObject({
            status: 'failed',
            detail: 'Missing: SNOWFLAKE_AI_OAUTH_ACCOUNT.',
        });
        expect(result.checks[1].status).toBe('not_checked');
        expect(fetchMock).not.toHaveBeenCalled();
        await expect(
            service.updateOrganizationRule(account, WarehouseTypes.SNOWFLAKE, {
                source: 'agent_sign_in',
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            service.updateOrganizationSettings(account, {
                requireVerifiedAgentSessions: true,
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(rules.set).not.toHaveBeenCalled();
        expect(settings.upsert).not.toHaveBeenCalled();
        config.auth.snowflakeAi.account = 'test-account';
        await expect(service.getSnowflakeSetup(account)).resolves.toMatchObject(
            {
                configured: true,
                missingSettings: [],
            },
        );
        await expect(
            service.verifySnowflakeSetup(account),
        ).resolves.toMatchObject({
            passed: true,
        });
        await expect(
            service.updateOrganizationRule(account, WarehouseTypes.SNOWFLAKE, {
                source: 'agent_sign_in',
            }),
        ).resolves.toMatchObject({ source: 'agent_sign_in' });
    });
    it('allows configured agent sign-in', async () => {
        const { service, account } = setup();
        await expect(
            service.updateOrganizationRule(account, WarehouseTypes.SNOWFLAKE, {
                source: 'agent_sign_in',
            }),
        ).resolves.toMatchObject({ source: 'agent_sign_in' });
    });
});
