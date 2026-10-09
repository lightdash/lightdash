import { Ability } from '@casl/ability';
import {
    buildSnowflakeAgentIntegrationSql,
    FeatureNotEnabledError,
    ForbiddenError,
    getSnowflakeAgentRedirectUri,
    ParameterError,
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

const setup = (saved = true) => {
    const config = {
        ...lightdashConfigMock,
        siteUrl: 'https://instance.example/nested/path/',
        license: { ...lightdashConfigMock.license, licenseKey: 'test-license' },
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
        getWithSecret: vi
            .fn()
            .mockResolvedValue(saved ? organizationClient : null),
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
    it.each([
        { saved: false, licensed: false },
        { saved: false, licensed: true },
        { saved: true, licensed: false },
        { saved: true, licensed: true },
    ])(
        'describes a saved client=$saved with licensed=$licensed',
        async ({ saved, licensed }) => {
            const { service, account, config } = setup(saved);
            const detail = saved
                ? 'Using the client saved for this organisation.'
                : 'Not saved. Paste the client ID and secret from Snowflake in the form above, then verify again.';
            Object.assign(config.license, {
                licenseKey: licensed ? 'test-license' : null,
            });
            const result = await service.verifySnowflakeSetup(account);
            expect(result.checks[0]).toMatchObject({
                status: saved ? 'passed' : 'failed',
                detail: `${detail}${licensed ? '' : ' Missing: Enterprise licence.'}`,
            });
            expect(result.passed).toBe(saved && licensed);
            if (!saved)
                expect(result.checks[1]).toMatchObject({
                    status: 'not_checked',
                    detail: 'Save the OAuth client first.',
                });
            expect(result.checks[2]).toMatchObject({
                status: 'not_checked',
                detail: 'No one has connected an agent yet. Connect yours in My agent connections to confirm Snowflake marks the session as an agent session.',
            });
            const setupResult = await service.getSnowflakeSetup(account);
            expect(setupResult.configured).toBe(saved && licensed);
            expect(setupResult.missingSettings).toEqual([
                ...(saved ? [] : ['Snowflake OAuth client']),
                ...(licensed ? [] : ['Enterprise licence']),
            ]);
            for (const text of [
                ...result.checks.map((check) => check.detail),
                ...setupResult.missingSettings,
            ]) {
                expect(text).not.toContain('SNOWFLAKE_AI_OAUTH');
                expect(text.toLowerCase()).not.toContain('instance');
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
            missingSettings: [],
            client: {
                source: 'organization',
                accountUrl: organizationClient.accountUrl,
                clientId: organizationClient.clientId,
                hasClientSecret: true,
                updatedAt: null,
            },
        });
        expect(JSON.stringify(result)).not.toMatch(/org-client-secret/);
    });
    it.each([200, 302, 303, 307, 400, 401, 403])(
        'accepts HTTP %s without following redirects or sending credentials',
        async (status) => {
            const { service, account, fetchMock } = setup();
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
                `${organizationClient.accountUrl}/oauth/authorize`,
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
                        ? ' Check the Snowflake account URL.'
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
        ).toHaveBeenCalledWith(
            account.organization?.organizationUuid,
            organizationClient.clientVersion,
        );
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
        const { service, account, rules, settings } = setup(false);
        await expect(
            service.updateOrganizationRule(account, WarehouseTypes.SNOWFLAKE, {
                source: 'agent_sign_in',
            }),
        ).rejects.toThrow(
            new ParameterError(
                'The Snowflake agent integration is not configured for this organisation',
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
    it('blocks setup until an organization client is saved', async () => {
        const { service, account, clients, fetchMock, rules, settings } =
            setup(false);
        await expect(service.getSnowflakeSetup(account)).resolves.toMatchObject(
            {
                configured: false,
                missingSettings: ['Snowflake OAuth client'],
            },
        );
        const result = await service.verifySnowflakeSetup(account);
        expect(result.passed).toBe(false);
        expect(result.checks[0]).toMatchObject({
            status: 'failed',
            detail: 'Not saved. Paste the client ID and secret from Snowflake in the form above, then verify again.',
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
        clients.getWithSecret.mockResolvedValue(organizationClient);
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
    it('allows settings updates with a saved organization client', async () => {
        const { service, account, clients } = setup();
        clients.getWithSecret.mockResolvedValue(organizationClient);
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
    Object.assign(config.license, { licenseKey: null });
    const result = await service.verifySnowflakeSetup(account);
    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({ status: 'passed' });
    expect(result.checks[0].detail).toContain(
        'Using the client saved for this organisation.',
    );
    expect(result.checks[0].detail).toContain('Enterprise licence');
});

it('keeps unreadable organization clients editable', async () => {
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

it('resolves a saved client only once when reading setup', async () => {
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
