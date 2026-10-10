import {
    FeatureFlags,
    ID_TOKEN_TYPE,
    TOKEN_EXCHANGE_GRANT_TYPE,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import { OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { ManagedSignInService } from './managedSignIn/ManagedSignInService';
import { OAuthService } from './OAuthService';

const database = knex({ client: MockClient, dialect: 'pg' });
const flags = { get: vi.fn() };
const model = new OAuth2Model(database, lightdashConfigMock, flags);
const client = { id: 'client', grants: ['refresh_token'], scopes: ['read'] };
const user = { userId: 42, organizationUuid: 'org' };
const lightdashConfig = {
    ...lightdashConfigMock,
    auth: {
        ...lightdashConfigMock.auth,
        oauthServer: {
            accessTokenLifetime: 3600,
            refreshTokenLifetime: 86400,
            mobileRefreshTokenLifetime: 86400,
            refreshTokenRotationGrace: 0,
        },
    },
};
const service = new OAuthService({
    oauthModel: model,
    userModel: {} as UserModel,
    lightdashConfig,
});
const refresh = (scope?: string) =>
    service.token(
        new OAuth2Server.Request({
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'transfer-encoding': 'chunked',
            },
            query: {},
            body: {
                grant_type: 'refresh_token',
                client_id: 'client',
                refresh_token: 'refresh',
                ...(scope === undefined ? {} : { scope }),
            },
        }),
        new OAuth2Server.Response({}),
    );

beforeEach(() => {
    getTracker().on.select('users').response({ user_uuid: 'user' });
    vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    vi.spyOn(model, 'getClient').mockResolvedValue(client);
    vi.spyOn(model, 'getRefreshToken').mockResolvedValue({
        accessToken: '',
        refreshToken: 'refresh',
        refreshTokenExpiresAt: new Date(Date.now() + 60000),
        scope: ['write'],
        client,
        user,
    });
    vi.spyOn(model, 'revokeToken').mockResolvedValue(true);
    vi.spyOn(model, 'saveToken').mockImplementation(
        async (token, savedClient, savedUser) => ({
            ...token,
            client: savedClient,
            user: savedUser,
        }),
    );
});
afterEach(() => {
    vi.restoreAllMocks();
    getTracker().reset();
});

it.each([null, 'log', 'enforce'] as const)(
    'checks the current registered scopes before refresh rotation in %s mode',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity
                    ? mode !== null
                    : mode === 'enforce',
        }));
        if (mode === 'enforce') {
            await expect(refresh()).rejects.toMatchObject({
                name: 'invalid_scope',
            });
            expect(model.revokeToken).not.toHaveBeenCalled();
            expect(model.saveToken).not.toHaveBeenCalled();
        } else {
            await expect(refresh()).resolves.toMatchObject({
                scope: ['write'],
            });
            expect(model.revokeToken).toHaveBeenCalledOnce();
        }
        expect(Logger.warn).toHaveBeenCalledTimes(mode === null ? 0 : 1);
    },
);
it('allows a refresh narrowed to the current client scope', async () => {
    flags.get.mockResolvedValue({ enabled: true });
    vi.mocked(model.getRefreshToken).mockResolvedValue({
        accessToken: '',
        refreshToken: 'refresh',
        scope: ['read', 'write'],
        client,
        user,
    });
    await expect(refresh('read')).resolves.toMatchObject({ scope: ['read'] });
});
it.each(['unknown-client', 'bad-token', 'other-client', 'expired'] as const)(
    'preserves %s authentication failure before checking scopes',
    async (failure) => {
        const validate = vi.spyOn(model, 'validateScope');
        if (failure === 'unknown-client')
            vi.mocked(model.getClient).mockResolvedValue(false);
        else if (failure === 'bad-token')
            vi.mocked(model.getRefreshToken).mockResolvedValue(false);
        else
            vi.mocked(model.getRefreshToken).mockResolvedValue({
                accessToken: '',
                refreshToken: 'refresh',
                scope: ['write'],
                user,
                client:
                    failure === 'other-client'
                        ? { ...client, id: 'other' }
                        : client,
                refreshTokenExpiresAt: new Date(
                    failure === 'expired' ? 0 : Date.now() + 60000,
                ),
            });
        await expect(refresh()).rejects.toMatchObject({
            name:
                failure === 'unknown-client'
                    ? 'invalid_client'
                    : 'invalid_grant',
        });
        expect(validate).not.toHaveBeenCalled();
        expect(model.revokeToken).not.toHaveBeenCalled();
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(['log', 'enforce'] as const)(
    'redacts legacy refresh scopes in %s records',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity ||
                mode === 'enforce',
        }));
        vi.mocked(model.getRefreshToken).mockResolvedValue({
            accessToken: '',
            refreshToken: 'refresh',
            scope: ['https://example.test/?token=secret'],
            client,
            user,
        });
        if (mode === 'enforce')
            await expect(refresh()).rejects.toMatchObject({
                name: 'invalid_scope',
            });
        else await expect(refresh()).resolves.toBeDefined();
        expect(Logger.warn).toHaveBeenCalledWith(
            'oauth_scope_refusal',
            expect.objectContaining({ scopes: ['unknown'] }),
        );
        expect(JSON.stringify(vi.mocked(Logger.warn).mock.calls)).not.toContain(
            'secret',
        );
    },
);

const tokenRequest = (body: Record<string, string>) =>
    new OAuth2Server.Request({
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'transfer-encoding': 'chunked',
        },
        query: {},
        body: { client_id: client.id, client_secret: 'client-secret', ...body },
    });

it.each([null, 'log', 'enforce'] as const)(
    'validates authorization-code scopes in %s mode',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity
                    ? mode !== null
                    : mode === 'enforce',
        }));
        const codeClient = { ...client, grants: ['authorization_code'] };
        vi.mocked(model.getClient).mockResolvedValue(codeClient);
        vi.spyOn(model, 'getAuthorizationCode').mockResolvedValue({
            authorizationCode: 'code',
            expiresAt: new Date(Date.now() + 60000),
            redirectUri: 'https://example.test/callback',
            scope: ['write'],
            client: codeClient,
            user,
        });
        vi.spyOn(model, 'revokeAuthorizationCode').mockResolvedValue(true);
        const result = service.token(
            tokenRequest({
                grant_type: 'authorization_code',
                code: 'code',
                redirect_uri: 'https://example.test/callback',
            }),
            new OAuth2Server.Response({}),
        );
        if (mode === 'enforce') {
            await expect(result).rejects.toMatchObject({
                name: 'invalid_scope',
            });
            expect(model.saveToken).not.toHaveBeenCalled();
        } else
            await expect(result).resolves.toMatchObject({ scope: ['write'] });
        expect(Logger.warn).toHaveBeenCalledTimes(mode === null ? 0 : 1);
    },
);

it.each(['log', 'enforce'] as const)(
    'keeps invalid PKCE as an authentication failure in %s mode',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity ||
                mode === 'enforce',
        }));
        const codeClient = { ...client, grants: ['authorization_code'] };
        vi.mocked(model.getClient).mockResolvedValue(codeClient);
        vi.spyOn(model, 'getAuthorizationCode').mockResolvedValue({
            authorizationCode: 'code',
            expiresAt: new Date(Date.now() + 60000),
            redirectUri: 'https://example.test/callback',
            scope: ['write'],
            codeChallenge: 'wrong',
            codeChallengeMethod: 'S256',
            client: codeClient,
            user,
        });
        vi.spyOn(model, 'revokeAuthorizationCode').mockResolvedValue(true);
        const validate = vi.spyOn(model, 'validateScope');
        await expect(
            service.token(
                tokenRequest({
                    grant_type: 'authorization_code',
                    code: 'code',
                    code_verifier: 'a'.repeat(43),
                    redirect_uri: 'https://example.test/callback',
                }),
                new OAuth2Server.Response({}),
            ),
        ).rejects.toMatchObject({ name: 'invalid_grant' });
        expect(validate).not.toHaveBeenCalled();
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each([null, 'log', 'enforce'] as const)(
    'validates token-exchange scopes in %s mode',
    async (mode) => {
        flags.get.mockImplementation(async ({ featureFlagId }) => ({
            enabled:
                featureFlagId === FeatureFlags.AgentIdentity
                    ? mode !== null
                    : mode === 'enforce',
        }));
        const exchangeClient = {
            ...client,
            grants: [TOKEN_EXCHANGE_GRANT_TYPE],
        };
        vi.mocked(model.getClient).mockResolvedValue(exchangeClient);
        const getManagedSignInService = () =>
            ({
                exchangeIdToken: vi.fn(async () => user),
                recordSignInAllowed: vi.fn(),
            }) as unknown as ManagedSignInService;
        const exchangeService = new OAuthService({
            oauthModel: model,
            userModel: {} as UserModel,
            lightdashConfig,
            getManagedSignInService,
        });
        const result = exchangeService.token(
            tokenRequest({
                grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
                subject_token: 'verified-by-managed-sign-in',
                subject_token_type: ID_TOKEN_TYPE,
                scope: 'write',
            }),
            new OAuth2Server.Response({}),
        );
        if (mode === 'enforce') {
            await expect(result).rejects.toMatchObject({
                name: 'invalid_scope',
            });
            expect(model.saveToken).not.toHaveBeenCalled();
        } else
            await expect(result).resolves.toMatchObject({ scope: ['write'] });
        expect(Logger.warn).toHaveBeenCalledTimes(mode === null ? 0 : 1);
    },
);
