import { FeatureFlags } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { createHash } from 'node:crypto';
import { type OAuthScopeMode } from '../../auth/oauthScopes/mode';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OAuth2Model } from '../../models/OAuth2Model';
import { type UserModel } from '../../models/UserModel';
import { OAuthService } from './OAuthService';

const database = knex({ client: MockClient, dialect: 'pg' });
const flags = { get: vi.fn<FeatureFlagModel['get']>() };
const model = new OAuth2Model(database, lightdashConfigMock, flags);
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
const redirectUri = 'https://client.example/callback';
const client = {
    id: 'client',
    grants: ['authorization_code'],
    redirectUris: [redirectUri],
    scopes: ['read'],
};
const otherClient = { ...client, id: 'other-client' };
const user = { userId: 42, organizationUuid: 'org' };
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const codes = new Map<string, OAuth2Server.AuthorizationCode>();
const modes = [null, 'log', 'enforce'] as const;

const setScopeMode = async (mode: OAuthScopeMode | null) => {
    flags.get.mockImplementation(async ({ featureFlagId }) => ({
        id: featureFlagId,
        enabled:
            featureFlagId === FeatureFlags.AgentIdentity
                ? mode !== null
                : mode === 'enforce',
    }));
    await expect(model.getScopeMode(user)).resolves.toBe(mode);
};

const authorize = (overrides: Record<string, string> = {}) =>
    service.authorize(
        new OAuth2Server.Request({
            method: 'GET',
            headers: {},
            body: {},
            query: {
                response_type: 'code',
                client_id: client.id,
                redirect_uri: redirectUri,
                scope: 'read',
                state: 'request-state',
                code_challenge: challenge,
                code_challenge_method: 'S256',
                ...overrides,
            },
        }),
        new OAuth2Server.Response({}),
        user,
    );

const exchange = (
    code: OAuth2Server.AuthorizationCode,
    overrides: Record<string, string> = {},
) =>
    service.token(
        new OAuth2Server.Request({
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'transfer-encoding': 'chunked',
            },
            query: {},
            body: {
                grant_type: 'authorization_code',
                client_id: client.id,
                client_secret: 'client-secret',
                code: code.authorizationCode,
                redirect_uri: redirectUri,
                code_verifier: verifier,
                ...overrides,
            },
        }),
        new OAuth2Server.Response({}),
    );

beforeEach(() => {
    flags.get.mockReset();
    codes.clear();
    getTracker().on.select('users').response({ user_uuid: 'user' });
    vi.spyOn(model, 'getClient').mockImplementation(async (id) => {
        if (id === client.id) return client;
        if (id === otherClient.id) return otherClient;
        return false;
    });
    vi.spyOn(model, 'saveAuthorizationCode').mockImplementation(
        async (code, savedClient, savedUser) => {
            const saved = { ...code, client: savedClient, user: savedUser };
            codes.set(code.authorizationCode, saved);
            return saved;
        },
    );
    vi.spyOn(model, 'getAuthorizationCode').mockImplementation(
        async (code) => codes.get(code) ?? false,
    );
    vi.spyOn(model, 'revokeAuthorizationCode').mockImplementation(
        async (code) => codes.delete(code.authorizationCode),
    );
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

it.each(modes)('rejects plain PKCE in %s mode', async (mode) => {
    await setScopeMode(mode);
    await expect(
        authorize({ code_challenge: verifier, code_challenge_method: 'plain' }),
    ).rejects.toBeInstanceOf(OAuth2Server.InvalidRequestError);
    expect(model.saveAuthorizationCode).not.toHaveBeenCalled();
    expect(model.saveToken).not.toHaveBeenCalled();
});

it.each(modes)('rejects an unknown PKCE method in %s mode', async (mode) => {
    await setScopeMode(mode);
    await expect(
        authorize({ code_challenge_method: 'unknown' }),
    ).rejects.toBeInstanceOf(OAuth2Server.InvalidRequestError);
    expect(model.saveAuthorizationCode).not.toHaveBeenCalled();
    expect(model.saveToken).not.toHaveBeenCalled();
});

it.each(modes)('rejects a missing PKCE verifier in %s mode', async (mode) => {
    await setScopeMode(mode);
    const code = await authorize();
    const request = new OAuth2Server.Request({
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'transfer-encoding': 'chunked',
        },
        query: {},
        body: {
            grant_type: 'authorization_code',
            client_id: client.id,
            client_secret: 'client-secret',
            code: code.authorizationCode,
            redirect_uri: redirectUri,
        },
    });
    await expect(
        service.token(request, new OAuth2Server.Response({})),
    ).rejects.toBeInstanceOf(OAuth2Server.InvalidGrantError);
    expect(model.saveToken).not.toHaveBeenCalled();
});

it.each(modes)('rejects a wrong PKCE verifier in %s mode', async (mode) => {
    await setScopeMode(mode);
    const code = await authorize();
    await expect(
        exchange(code, { code_verifier: 'b'.repeat(43) }),
    ).rejects.toBeInstanceOf(OAuth2Server.InvalidGrantError);
    expect(model.saveToken).not.toHaveBeenCalled();
});

it.each(modes)(
    'rejects a verifier for a code issued without a challenge in %s mode',
    async (mode) => {
        await setScopeMode(mode);
        const code = await authorize({
            code_challenge: '',
            code_challenge_method: '',
        });
        expect(code.codeChallenge).toBeUndefined();
        await expect(exchange(code)).rejects.toBeInstanceOf(
            OAuth2Server.InvalidGrantError,
        );
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(modes)(
    'consumes the code after a failed verifier attempt in %s mode',
    async (mode) => {
        await setScopeMode(mode);
        const code = await authorize();
        await expect(
            exchange(code, { code_verifier: 'b'.repeat(43) }),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidGrantError);
        expect(model.saveToken).not.toHaveBeenCalled();
        expect(model.revokeAuthorizationCode).toHaveBeenCalledExactlyOnceWith(
            code,
        );
        expect(codes.has(code.authorizationCode)).toBe(false);
        await expect(exchange(code)).rejects.toBeInstanceOf(
            OAuth2Server.InvalidGrantError,
        );
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(modes)(
    'rejects a reused authorization code in %s mode',
    async (mode) => {
        await setScopeMode(mode);
        const code = await authorize();
        await expect(exchange(code)).resolves.toMatchObject({
            accessToken: expect.any(String),
        });
        expect(model.saveToken).toHaveBeenCalledOnce();
        vi.mocked(model.saveToken).mockClear();
        await expect(exchange(code)).rejects.toBeInstanceOf(
            OAuth2Server.InvalidGrantError,
        );
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(modes)(
    'rejects an expired authorization code in %s mode',
    async (mode) => {
        await setScopeMode(mode);
        const code = await authorize();
        codes.set(code.authorizationCode, { ...code, expiresAt: new Date(0) });
        await expect(exchange(code)).rejects.toBeInstanceOf(
            OAuth2Server.InvalidGrantError,
        );
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(modes)(
    'rejects a code exchanged by another client in %s mode',
    async (mode) => {
        await setScopeMode(mode);
        const code = await authorize();
        await expect(
            exchange(code, { client_id: otherClient.id }),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidGrantError);
        expect(model.getClient).toHaveBeenLastCalledWith(
            otherClient.id,
            'client-secret',
        );
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(modes)(
    'rejects a different redirect URI at exchange in %s mode',
    async (mode) => {
        await setScopeMode(mode);
        const code = await authorize();
        await expect(
            exchange(code, { redirect_uri: 'https://client.example/other' }),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidRequestError);
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(modes)(
    'rejects an unregistered authorization redirect URI in %s mode',
    async (mode) => {
        await setScopeMode(mode);
        await expect(
            authorize({ redirect_uri: 'https://evil.example/callback' }),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidClientError);
        expect(model.saveAuthorizationCode).not.toHaveBeenCalled();
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(modes)(
    'issues a token for S256 with a matching redirect URI in %s mode',
    async (mode) => {
        await setScopeMode(mode);
        const code = await authorize();
        expect(code).toMatchObject({
            authorizationCode: expect.any(String),
            codeChallenge: challenge,
            codeChallengeMethod: 'S256',
            redirectUri,
        });
        const token = await exchange(code);
        expect(token.accessToken).toEqual(expect.any(String));
        expect(token.accessToken.length).toBeGreaterThan(0);
        expect(token).toMatchObject({ client, user, scope: ['read'] });
        expect(model.saveAuthorizationCode).toHaveBeenCalledOnce();
        expect(model.saveToken).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ accessToken: token.accessToken }),
            client,
            user,
        );
        expect(codes.has(code.authorizationCode)).toBe(false);
    },
);
