import { FeatureFlags } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { lightdashConfig } from '../../../config/lightdashConfig';
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
            profile: unknown,
            done: (error: unknown, user?: unknown) => void,
        ) => Promise<void>;
    }
)._verify;

const callVerify = async (
    enabled: boolean,
    refreshToken: string,
    agentSession: boolean | 'error' = true,
) => {
    const check = vi.spyOn(snowflakeAiSessionCheck, 'check');
    if (agentSession === 'error') {
        check.mockRejectedValue(new Error('Snowflake query failed'));
    } else {
        check.mockResolvedValue({
            agentActivated: agentSession,
            currentRole: agentSession ? 'ANALYST' : null,
            activeRestrictedSessionScopes: agentSession ? 'READ' : null,
        });
    }
    const upsertAiSnowflakeCredential = vi.fn(async () => undefined);
    const get = vi.fn(
        async ({ featureFlagId }: { featureFlagId: FeatureFlags }) => ({
            id: featureFlagId,
            enabled,
        }),
    );
    const service = new AiAccessService({
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
    await verify(req, 'access-token', refreshToken, {}, done);
    const checkCalls = [...check.mock.calls];
    check.mockRestore();
    return { checkCalls, done, get, upsertAiSnowflakeCredential, user };
};

describe('Snowflake AI OAuth callback', () => {
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
                ['myorg-myaccount', 'access-token'],
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
        );
        expect(result.done).toHaveBeenCalledWith(null, result.user);
    });
});
