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

const organizationClient = {
    organizationUuid: 'test-org-uuid',
    accountUrl: 'https://org-account.snowflakecomputing.com',
    accountIdentifier: 'org-account',
    clientId: 'org-client',
    clientSecret: 'org-client-secret',
    clientVersion: 'version-1',
    updatedAt: new Date(),
};

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
        list: vi.fn().mockResolvedValue([]),
        set: vi.fn().mockResolvedValue({
            changed: false,
            previousSource: 'marked_person',
        }),
    };
    const settings = {
        get: vi.fn().mockResolvedValue({ requireVerifiedAgentSessions: false }),
        upsert: vi.fn().mockResolvedValue({
            settings: { requireVerifiedAgentSessions: true },
            previousSource: 'marked_person',
            changed: false,
        }),
    };
    const clients = {
        getWithSecret: vi.fn().mockResolvedValue(null),
        getMetadata: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
    };
    const analytics = { track: vi.fn() };
    const service = new AiAccessService({
        organizationSnowflakeAgentClientModel: clients,
        analytics,
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
        clients,
        analytics,
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
    it.each(['organization', 'environment', 'empty', 'partial'] as const)(
        'describes the %s OAuth client state',
        async (state) => {
            const { service, account, config, clients } = setup();
            if (state === 'organization') {
                clients.getWithSecret.mockResolvedValue(organizationClient);
            }
            if (state === 'empty' || state === 'partial') {
                Object.assign(config.auth.snowflakeAi, {
                    clientId: state === 'partial' ? 'test-client' : undefined,
                    clientSecret: undefined,
                    authorizationEndpoint: undefined,
                    tokenEndpoint: undefined,
                    account: undefined,
                });
            }
            const details = {
                organization: 'Using the client saved for this organisation.',
                environment: "Using this instance's Snowflake OAuth settings.",
                empty: 'Not saved. Paste the account URL, client ID and client secret from Snowflake in step 2, then verify again.',
                partial:
                    "This instance's Snowflake OAuth settings are incomplete. Missing instance settings: SNOWFLAKE_AI_OAUTH_CLIENT_SECRET, SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT, SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT. Set them, or paste the client from Snowflake in step 2.",
            };
            const result = await service.verifySnowflakeSetup(account);
            expect(result.checks[0]).toMatchObject({
                status:
                    state === 'empty' || state === 'partial'
                        ? 'failed'
                        : 'passed',
                detail: details[state],
            });
            expect(result.passed).toBe(
                state === 'organization' || state === 'environment',
            );
            if (state !== 'partial') {
                result.checks.forEach(({ detail }) =>
                    expect(detail).not.toContain('SNOWFLAKE_AI_OAUTH'),
                );
            }
            if (state === 'empty' || state === 'partial') {
                expect(result.checks[1]).toMatchObject({
                    status: 'not_checked',
                    detail: 'Save the OAuth client first.',
                });
            }
            expect(result.checks[2]).toMatchObject({
                status: 'not_checked',
                detail: 'No one has connected an agent yet. Connect yours in My agent connections to confirm Snowflake marks the session as an agent session.',
            });
            Object.assign(config.license, { licenseKey: undefined });
            const unlicensed = await service.verifySnowflakeSetup(account);
            expect(unlicensed.passed).toBe(false);
            expect(unlicensed.checks[0].status).toBe(result.checks[0].status);
            expect(unlicensed.checks[0].detail).toBe(
                `${details[state]} Missing: Enterprise licence.`,
            );
        },
    );
    it.each([
        'full',
        'empty',
        'clientId',
        'clientSecret',
        'authorizationEndpoint',
        'tokenEndpoint',
        'account',
    ] as const)(
        'reports instance settings when %s is configured',
        async (state) => {
            const { service, account, config } = setup();
            if (state !== 'full') {
                Object.assign(config.auth.snowflakeAi, {
                    clientId: undefined,
                    clientSecret: undefined,
                    authorizationEndpoint: undefined,
                    tokenEndpoint: undefined,
                    account: undefined,
                });
                if (state !== 'empty')
                    config.auth.snowflakeAi[state] = 'test-value';
            }
            expect(
                (await service.getSnowflakeSetup(account)).hasInstanceSettings,
            ).toBe(state !== 'empty');
            if (state !== 'full' && state !== 'empty') {
                const { checks } = await service.verifySnowflakeSetup(account);
                expect(checks[0].detail).toMatch(
                    /^This instance's Snowflake OAuth settings are incomplete\. Missing instance settings: /,
                );
            }
        },
    );

    it('returns the shared callback and SQL without exposing secrets', async () => {
        const { service, account, config } = setup();
        const result = await service.getSnowflakeSetup(account);
        const redirectUri = getSnowflakeAgentRedirectUri(config.siteUrl);
        expect(result).toEqual({
            redirectUri,
            integrationSql: buildSnowflakeAgentIntegrationSql({ redirectUri }),
            configured: true,
            hasInstanceSettings: true,
            missingSettings: [],
            client: {
                source: 'environment',
                accountUrl: 'https://test-account.snowflakecomputing.com',
                clientId: 'test-client',
                hasClientSecret: true,
                updatedAt: null,
            },
        });
        expect(JSON.stringify(result)).not.toMatch(/test-secret/);
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
        expect(verification.checks[0].detail).toBe(
            'Not saved. Paste the account URL, client ID and client secret from Snowflake in step 2, then verify again. Missing: Enterprise licence.',
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
                detail: "Snowflake's sign-in page responded.",
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
                        ? " Check this instance's SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT setting."
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
        ).toHaveBeenCalledWith(account.organization?.organizationUuid, null);
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
            detail: "This instance's Snowflake OAuth settings are incomplete. Missing instance settings: SNOWFLAKE_AI_OAUTH_ACCOUNT. Set them, or paste the client from Snowflake in step 2.",
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

const clientBody = {
    accountUrl: organizationClient.accountUrl,
    clientId: organizationClient.clientId,
    clientSecret: organizationClient.clientSecret,
};

describe('organization Snowflake client', () => {
    it('saves canonical settings and returns metadata without a secret', async () => {
        const { service, account, clients, analytics } = setup();
        clients.upsert.mockImplementation(async () => {
            clients.getWithSecret.mockResolvedValue(organizationClient);
            clients.getMetadata.mockResolvedValue(organizationClient);
            return { ...organizationClient, action: 'created' };
        });
        const result = await service.saveSnowflakeAgentClient(account, {
            ...clientBody,
            accountUrl: 'ORG-ACCOUNT.snowflakecomputing.com/',
            clientId: ' org-client ',
        });
        expect(clients.upsert).toHaveBeenCalledWith({
            ...clientBody,
            accountIdentifier: 'org-account',
            organizationUuid: account.organization.organizationUuid,
            userUuid: account.user.id,
        });
        expect(result.client).toEqual({
            source: 'organization',
            accountUrl: clientBody.accountUrl,
            clientId: clientBody.clientId,
            hasClientSecret: true,
            updatedAt: organizationClient.updatedAt,
        });
        expect(result.configured).toBe(true);
        expect(JSON.stringify(result)).not.toContain(clientBody.clientSecret);
        expect(JSON.stringify(result)).not.toContain('clientSecret');
        expect(analytics.track).toHaveBeenCalledWith({
            event: 'agent_identity.snowflake_client_saved',
            userId: account.user.id,
            properties: {
                organizationId: account.organization.organizationUuid,
                userId: account.user.id,
                warehouseType: WarehouseTypes.SNOWFLAKE,
                action: 'created',
            },
        });
        expect(JSON.stringify(analytics.track.mock.calls)).not.toContain(
            clientBody.clientId,
        );
        expect(JSON.stringify(analytics.track.mock.calls)).not.toContain(
            clientBody.accountUrl,
        );
        expect(JSON.stringify(analytics.track.mock.calls)).not.toContain(
            clientBody.clientSecret,
        );
    });
    it('denies a save when the flag is off or the user cannot manage the organization', async () => {
        const { service, account, featureFlagModel, clients } = setup();
        featureFlagModel.get.mockResolvedValue({ enabled: false });
        await expect(
            service.saveSnowflakeAgentClient(account, clientBody),
        ).rejects.toBeInstanceOf(FeatureNotEnabledError);
        featureFlagModel.get.mockResolvedValue({ enabled: true });
        account.user.ability = new Ability<PossibleAbilities>([]);
        await expect(
            service.saveSnowflakeAgentClient(account, clientBody),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(clients.upsert).not.toHaveBeenCalled();
    });
    it.each([
        { clientId: '' },
        { clientId: '  ' },
        { clientSecret: '' },
        { clientSecret: '  ' },
        { accountUrl: 'https://evil.test' },
    ])('rejects invalid client input %j', async (invalid) => {
        const { service, account, clients } = setup();
        await expect(
            service.saveSnowflakeAgentClient(account, {
                ...clientBody,
                ...invalid,
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(clients.upsert).not.toHaveBeenCalled();
    });
    it('verifies the saved authorization endpoint and reports its source', async () => {
        const { service, account, clients, fetchMock } = setup();
        clients.getWithSecret.mockResolvedValue(organizationClient);
        const result = await service.verifySnowflakeSetup(account);
        expect(result.checks[0]).toMatchObject({
            status: 'passed',
            detail: 'Using the client saved for this organisation.',
        });
        expect(fetchMock).toHaveBeenCalledWith(
            `${clientBody.accountUrl}/oauth/authorize`,
            expect.any(Object),
        );
        expect(JSON.stringify(result)).not.toContain(clientBody.clientSecret);
    });
    it.each([404, 405])(
        'gives an account URL hint for an organization endpoint returning %s',
        async (status) => {
            const { service, account, clients, fetchMock } = setup();
            clients.getWithSecret.mockResolvedValue(organizationClient);
            fetchMock.mockResolvedValue({ status });
            const result = await service.verifySnowflakeSetup(account);
            expect(result.checks[1].detail).toBe(
                `The authorization endpoint returned HTTP ${status}. Check the Snowflake account URL.`,
            );
        },
    );
    it('allows org-aware settings updates without instance OAuth settings', async () => {
        const { service, account, clients, config } = setup();
        clients.getWithSecret.mockResolvedValue(organizationClient);
        Object.assign(config.auth.snowflakeAi, { clientSecret: undefined });
        await expect(
            service.updateOrganizationSettings(account, {
                requireVerifiedAgentSessions: true,
            }),
        ).resolves.toMatchObject({ snowflakeConfigured: true });
        await expect(
            service.updateOrganizationRule(account, WarehouseTypes.SNOWFLAKE, {
                source: 'agent_sign_in',
            }),
        ).resolves.toMatchObject({ source: 'agent_sign_in' });
    });
});

it('verifies a resolved client while still reporting a missing licence', async () => {
    const { service, account, clients, config } = setup();
    clients.getWithSecret.mockResolvedValue(organizationClient);
    Object.assign(config.license, { licenseKey: undefined });
    const result = await service.verifySnowflakeSetup(account);
    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({ status: 'passed' });
    expect(result.checks[0].detail).toContain(
        'Using the client saved for this organisation.',
    );
    expect(result.checks[0].detail).toContain('Enterprise licence');
});

it('keeps unreadable organization clients editable without falling back to the environment', async () => {
    const { service, clients, account } = setup();
    clients.getMetadata.mockResolvedValue(organizationClient);
    clients.getWithSecret.mockRejectedValue(
        new ParameterError('Cannot decrypt'),
    );
    await expect(service.getSnowflakeSetup(account)).resolves.toMatchObject({
        configured: false,
        missingSettings: ['Snowflake client secret (replace it)'],
        client: {
            source: 'organization',
            accountUrl: organizationClient.accountUrl,
            clientId: organizationClient.clientId,
            hasClientSecret: false,
            updatedAt: organizationClient.updatedAt,
        },
    });
    await expect(
        service.getOrganizationSettings(account),
    ).resolves.toMatchObject({ snowflakeConfigured: false });
});

it('resolves an environment client only once when reading setup', async () => {
    const { service, clients, account } = setup();
    await service.getSnowflakeSetup(account);
    expect(clients.getWithSecret).toHaveBeenCalledOnce();
});

it('scopes activation evidence to the current organization client version', async () => {
    const { service, clients, credentials, account } = setup();
    clients.getWithSecret.mockResolvedValue(organizationClient);
    await service.verifySnowflakeSetup(account);
    expect(
        credentials.hasOrganizationAiSnowflakeCredential,
    ).toHaveBeenCalledWith(
        account.organization.organizationUuid,
        organizationClient.clientVersion,
    );
});
