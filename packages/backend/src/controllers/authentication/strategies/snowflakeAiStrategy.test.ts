import {
    buildSnowflakeAgentIntegrationSql,
    FeatureFlags,
    getSnowflakeAgentRedirectUri,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { analyticsMock } from '../../../analytics/LightdashAnalytics.mock';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';
import { AiAccessService } from '../../../services/AiAccessService/AiAccessService';
import {
    snowflakeAiPassportStrategy,
    snowflakeAiSessionCheck,
} from './snowflakeAiStrategy';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: 'https://lightdash.example',
            license: { licenseKey: 'test-license' },
            auth: {
                snowflakeAi: {
                    account: 'test-account',
                    clientId: 'ai-client',
                    clientSecret: 'ai-secret',
                    authorizationEndpoint:
                        'https://snowflake.example/authorize',
                    tokenEndpoint: 'https://snowflake.example/token',
                    callbackPath: '/oauth/redirect/snowflake-ai',
                },
            },
        },
    };
});

const verify = (
    snowflakeAiPassportStrategy as unknown as {
        _verify: (
            req: Express.Request,
            accessToken: string,
            refreshToken: string,
            params: { refresh_token_expires_in?: unknown },
            profile: unknown,
            done: (error: unknown, user?: unknown) => void,
        ) => Promise<void>;
    }
)._verify;

const callVerify = async (
    enabled: boolean,
    refreshToken: string,
    agentSession: boolean | 'error' | Error = true,
    seconds: unknown = undefined,
) => {
    const check = vi.spyOn(snowflakeAiSessionCheck, 'check');
    if (agentSession === 'error' || agentSession instanceof Error) {
        check.mockRejectedValue(
            agentSession instanceof Error
                ? agentSession
                : new Error('Snowflake query failed'),
        );
    } else {
        check.mockResolvedValue({
            agentActivated: agentSession,
            currentRole: agentSession ? 'ANALYST' : null,
            activeRestrictedSessionScopes: agentSession ? 'READ' : null,
        });
    }
    const upsertAiSnowflakeCredential = vi.fn<
        (user: unknown, token: string, expiresAt: Date | null) => Promise<void>
    >(async () => undefined);
    const get = vi.fn(
        async ({ featureFlagId }: { featureFlagId: FeatureFlags }) => ({
            id: featureFlagId,
            enabled,
        }),
    );
    const service = new AiAccessService({
        analytics: analyticsMock,
        featureFlagModel: { get },
    } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
    const user = { userUuid: 'user-uuid', organizationUuid: 'org-uuid' };
    const req = {
        user,
        services: {
            getAiAccessService: () => service,
            getUserService: () => ({ upsertAiSnowflakeCredential }),
        },
    } as unknown as Express.Request;
    const done = vi.fn();
    await verify(
        req,
        'access-token',
        refreshToken,
        { refresh_token_expires_in: seconds },
        {},
        done,
    );
    const checkCalls = [...check.mock.calls];
    check.mockRestore();
    return { checkCalls, done, get, upsertAiSnowflakeCredential, user };
};

describe('Snowflake AI OAuth callback', () => {
    it('exposes the six-argument callback that receives OAuth token params', () => {
        expect(verify.length).toBe(6);
    });

    it.each([undefined, null, 0, -1, NaN, Infinity, '7776000'])(
        'stores no expiry for an invalid lifetime %s',
        async (seconds) => {
            const result = await callVerify(
                true,
                'refresh-token',
                true,
                seconds,
            );
            expect(result.upsertAiSnowflakeCredential).toHaveBeenCalledWith(
                result.user,
                'refresh-token',
                null,
            );
        },
    );

    it('stores the refresh-token expiry from a positive lifetime', async () => {
        const before = Date.now();
        const result = await callVerify(true, 'refresh-token', true, 7776000);
        const expiresAt = result.upsertAiSnowflakeCredential.mock
            .calls[0]?.[2] as Date;
        expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7776000000);
        expect(expiresAt.getTime()).toBeLessThanOrEqual(
            Date.now() + 7776000000,
        );
    });
    it('exchanges a code only once for state issued to the same session', async () => {
        const strategy = Object.create(snowflakeAiPassportStrategy!);
        const exchange = vi.fn();
        strategy._oauth2 = {
            ...strategy._oauth2,
            getOAuthAccessToken: exchange,
        };
        strategy.fail = vi.fn();
        strategy.error = vi.fn();
        const session = {};
        const redirectUrl = await new Promise<string>((resolve) => {
            strategy.redirect = resolve;
            strategy.authenticate({ query: {}, session });
        });
        const state = new URL(redirectUrl).searchParams.get('state');
        expect(state).toEqual(expect.any(String));
        const query = { code: 'authorized-code', state };
        strategy.authenticate({ query, session: {} });
        expect(exchange).not.toHaveBeenCalled();
        strategy.authenticate({ query, session });
        expect(exchange).toHaveBeenCalledOnce();
        strategy.authenticate({ query, session });
        expect(exchange).toHaveBeenCalledOnce();
        expect(strategy.fail).toHaveBeenCalledTimes(2);
        expect(strategy.error).not.toHaveBeenCalled();
    });

    it.each([undefined, 'unrelated-state'])(
        'rejects an unsolicited callback with state %s before exchanging the code',
        (state) => {
            const strategy = Object.create(snowflakeAiPassportStrategy!);
            const exchange = vi.fn();
            strategy._oauth2 = {
                ...strategy._oauth2,
                getOAuthAccessToken: exchange,
            };
            strategy.fail = vi.fn();
            strategy.error = vi.fn();
            strategy.authenticate({
                query: { code: 'unsolicited-code', state },
                session: {},
            });
            expect(exchange).not.toHaveBeenCalled();
            expect(strategy.fail).toHaveBeenCalledWith(expect.anything(), 403);
            expect(strategy.error).not.toHaveBeenCalled();
        },
    );

    it('refuses while the organization flag is off', async () => {
        const result = await callVerify(false, 'refresh-token');
        expect(result.done.mock.calls[0]?.[0]).toMatchObject({
            name: 'FeatureNotEnabledError',
            statusCode: 403,
            data: {
                code: 'feature_not_enabled',
                featureFlagId: FeatureFlags.AgentIdentity,
            },
        });
        expect(result.checkCalls).toEqual([]);
        expect(result.upsertAiSnowflakeCredential).not.toHaveBeenCalled();
    });

    it('refuses a missing refresh token without writing', async () => {
        const result = await callVerify(true, '');
        expect(result.done.mock.calls[0]?.[0]).toMatchObject({
            name: 'ParameterError',
        });
        expect(result.upsertAiSnowflakeCredential).not.toHaveBeenCalled();
    });

    it('refuses a session without agent activation without writing', async () => {
        const result = await callVerify(true, 'refresh-token', false);
        expect(result.done.mock.calls[0]?.[0]).toMatchObject({
            name: 'ForbiddenError',
            message: expect.stringContaining('IS_AGENTIC = TRUE'),
        });
        expect(result.upsertAiSnowflakeCredential).not.toHaveBeenCalled();
    });

    it('refuses when the session check errors', async () => {
        const result = await callVerify(true, 'refresh-token', 'error');
        expect(result.done.mock.calls[0]?.[0]).toMatchObject({
            name: 'ForbiddenError',
            message: expect.stringContaining('IS_AGENTIC = TRUE'),
        });
        expect(result.upsertAiSnowflakeCredential).not.toHaveBeenCalled();
    });

    it('derives the account from the Snowflake token endpoint', async () => {
        const config = lightdashConfig.auth.snowflakeAi;
        const originalAccount = config.account;
        const originalEndpoint = config.tokenEndpoint;
        config.account = undefined;
        config.tokenEndpoint =
            'https://myorg-myaccount.snowflakecomputing.com/oauth/token';
        try {
            const result = await callVerify(true, 'refresh-token');
            expect(result.checkCalls).toEqual([
                [
                    'myorg-myaccount',
                    'access-token',
                    {
                        accessUrl:
                            'https://myorg-myaccount.snowflakecomputing.com',
                    },
                ],
            ]);
            expect(result.upsertAiSnowflakeCredential).toHaveBeenCalled();
        } finally {
            config.account = originalAccount;
            config.tokenEndpoint = originalEndpoint;
        }
    });

    it('stores the AI credential when agent identity is enabled', async () => {
        const result = await callVerify(true, 'refresh-token');
        expect(result.get).toHaveBeenCalledExactlyOnceWith({
            user: result.user,
            featureFlagId: FeatureFlags.AgentIdentity,
        });
        expect(result.upsertAiSnowflakeCredential).toHaveBeenCalledWith(
            result.user,
            'refresh-token',
            null,
        );
        expect(result.checkCalls).toEqual([
            [
                'test-account',
                'access-token',
                { accessUrl: 'https://snowflake.example' },
            ],
        ]);
        expect(result.done).toHaveBeenCalledWith(null, result.user);
    });
});

describe('Snowflake agent redirect URI', () => {
    it.each([
        'https://instance.example',
        'https://instance.example/',
        'https://instance.example/nested/path/',
    ])(
        'uses the same URI in Passport and setup SQL for %s',
        async (siteUrl) => {
            const previousSiteUrl = lightdashConfig.siteUrl;
            try {
                lightdashConfig.siteUrl = siteUrl;
                vi.resetModules();
                const { snowflakeAiPassportStrategy: strategy } =
                    await import('./snowflakeAiStrategy');
                const callbackURL = (
                    strategy as unknown as { _callbackURL: string }
                )._callbackURL;
                expect(callbackURL).toBe(getSnowflakeAgentRedirectUri(siteUrl));
                expect(
                    buildSnowflakeAgentIntegrationSql({
                        redirectUri: getSnowflakeAgentRedirectUri(siteUrl),
                    }),
                ).toContain(`OAUTH_REDIRECT_URI = '${callbackURL}'`);
            } finally {
                lightdashConfig.siteUrl = previousSiteUrl;
            }
        },
    );
});

it('logs session activation with user and organization IDs and no credentials', async () => {
    const info = vi.spyOn(Logger, 'info').mockImplementation(() => Logger);
    try {
        await callVerify(true, 'refresh-secret');
        expect(info).toHaveBeenCalledWith('Snowflake agent session activated', {
            userUuid: 'user-uuid',
            organizationUuid: 'org-uuid',
            currentRole: 'ANALYST',
            activeRestrictedSessionScopes: 'READ',
        });
        expect(JSON.stringify(info.mock.calls)).not.toMatch(
            /refresh-secret|access-token|ai-secret|client_email|SELECT/,
        );
    } finally {
        info.mockRestore();
    }
});

it('preserves the session-check exception as a non-enumerable cause', async () => {
    const error = Object.assign(
        new TypeError('Connection failed password is abc123'),
        { code: '390318' },
    );
    const result = await callVerify(true, 'refresh-token', error);
    const refusal = result.done.mock.calls[0]?.[0];
    expect(refusal).toMatchObject({ name: 'ForbiddenError', cause: error });
    expect(Object.getOwnPropertyDescriptor(refusal, 'cause')).toMatchObject({
        value: error,
        enumerable: false,
    });
    expect(JSON.stringify(refusal)).not.toContain('abc123');
    expect(result.upsertAiSnowflakeCredential).not.toHaveBeenCalled();
});
