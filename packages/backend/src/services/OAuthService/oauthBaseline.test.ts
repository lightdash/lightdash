import { FeatureFlags } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { createHash } from 'node:crypto';
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
const codes = new Map<
    string,
    OAuth2Server.AuthorizationCode & { sessionExpiresAt: Date | null }
>();
const strictModes = [false, true] as const;

const setSecurityStrict = async (strict: boolean) => {
    flags.get.mockResolvedValue({
        id: FeatureFlags.AgentIdentity,
        enabled: strict,
    });
};

const authorize = (overrides: Record<string, unknown> = {}) =>
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
    overrides: Record<string, unknown> = {},
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
            const saved = {
                ...code,
                sessionExpiresAt: null,
                client: savedClient,
                user: savedUser,
            };
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

it('preserves the flag-off SQL sequence when revoking a null-family refresh token', async () => {
    flags.get.mockResolvedValue({
        id: FeatureFlags.AgentIdentity,
        enabled: false,
    });
    const tracker = getTracker();
    tracker.on.select('oauth2_refresh_tokens').responseOnce({
        refresh_token: 'refresh-token',
        family_uuid: null,
        agent_connection_grant_uuid: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 86400000),
        client_id: client.id,
        redirect_uris: client.redirectUris,
        grants: ['refresh_token'],
        scope: ['read'],
        user_id: user.userId,
        organization_uuid: user.organizationUuid,
    });
    tracker.on.select('oauth2_refresh_tokens').responseOnce(undefined);
    tracker.on.delete('oauth2_refresh_tokens').responseOnce(1);

    await expect(service.revokeToken('refresh-token')).resolves.toBe(true);

    expect(
        tracker.history.all.map(({ method, sql }) => [
            method,
            /(?:from|update) "([^"]+)"/.exec(sql)?.[1],
        ]),
    ).toEqual([
        ['select', 'oauth2_refresh_tokens'],
        ['select', 'users'],
        ['select', 'oauth2_refresh_tokens'],
        ['delete', 'oauth2_refresh_tokens'],
    ]);
    expect(flags.get).toHaveBeenCalledOnce();
    expect(tracker.history.transactions).toHaveLength(0);
});

it('preserves the flag-off SQL sequence when revoking a refresh token with a family', async () => {
    flags.get.mockResolvedValue({
        id: FeatureFlags.AgentIdentity,
        enabled: false,
    });
    const tracker = getTracker();
    tracker.on.select('oauth2_refresh_tokens').responseOnce({
        refresh_token: 'refresh-token',
        family_uuid: '11111111-1111-4111-8111-111111111111',
        agent_connection_grant_uuid: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 86400000),
        client_id: client.id,
        redirect_uris: client.redirectUris,
        grants: ['refresh_token'],
        scope: ['read'],
        user_id: user.userId,
        organization_uuid: user.organizationUuid,
    });
    tracker.on.select('oauth2_refresh_tokens').responseOnce(undefined);
    tracker.on.delete('oauth2_refresh_tokens').responseOnce(1);

    await expect(service.revokeToken('refresh-token')).resolves.toBe(true);

    expect(
        tracker.history.all.map(({ method, sql }) => [
            method,
            /(?:from|update) "([^"]+)"/.exec(sql)?.[1],
        ]),
    ).toEqual([
        ['select', 'oauth2_refresh_tokens'],
        ['select', 'users'],
        ['select', 'oauth2_refresh_tokens'],
        ['delete', 'oauth2_refresh_tokens'],
    ]);
    expect(flags.get).toHaveBeenCalledOnce();
    expect(tracker.history.transactions).toHaveLength(0);
});

it('deletes an unbound refresh family in one transaction with one flag resolution', async () => {
    flags.get.mockResolvedValue({
        id: FeatureFlags.AgentIdentity,
        enabled: true,
    });
    const tracker = getTracker();
    tracker.on.select('oauth2_refresh_tokens').responseOnce({
        refresh_token: 'refresh-token',
        family_uuid: '11111111-1111-4111-8111-111111111111',
        agent_connection_grant_uuid: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 86400000),
        client_id: client.id,
        redirect_uris: client.redirectUris,
        grants: ['refresh_token'],
        scope: ['read'],
        user_id: user.userId,
        organization_uuid: user.organizationUuid,
    });
    tracker.on.select('pg_advisory_xact_lock').responseOnce([]);
    tracker.on.delete('oauth2_refresh_tokens').responseOnce(1);
    tracker.on.delete('oauth2_access_tokens').responseOnce(1);

    await expect(service.revokeToken('refresh-token')).resolves.toBe(true);

    expect(
        tracker.history.all.map(({ method, sql }) => [
            method,
            /(?:from|update) "([^"]+)"/.exec(sql)?.[1],
        ]),
    ).toEqual([
        ['select', 'oauth2_refresh_tokens'],
        ['select', 'users'],
        ['select', undefined],
        ['delete', 'oauth2_refresh_tokens'],
        ['delete', 'oauth2_access_tokens'],
    ]);
    expect(flags.get).toHaveBeenCalledOnce();
    expect(tracker.history.transactions).toHaveLength(1);
    const transaction = tracker.history.transactions[0];
    expect(transaction.state).toBe('committed');
    expect(transaction.queries).toEqual(tracker.history.all.slice(2));
    expect(
        transaction.queries.map(({ method, sql, bindings }) => ({
            method,
            sql,
            bindings,
        })),
    ).toEqual([
        {
            method: 'select',
            sql: "SELECT pg_advisory_xact_lock(hashtext('oauth_refresh_rotation'), $1)",
            bindings: [user.userId],
        },
        {
            method: 'delete',
            sql: 'delete from "oauth2_refresh_tokens" where "family_uuid" = $1 and "agent_connection_grant_uuid" is null',
            bindings: ['11111111-1111-4111-8111-111111111111'],
        },
        {
            method: 'delete',
            sql: 'delete from "oauth2_access_tokens" where "family_uuid" = $1 and "agent_connection_grant_uuid" is null',
            bindings: ['11111111-1111-4111-8111-111111111111'],
        },
    ]);
});

it('preserves the flag-off SQL sequence when revoking an access token', async () => {
    flags.get.mockResolvedValue({
        id: FeatureFlags.AgentIdentity,
        enabled: false,
    });
    const tracker = getTracker();
    tracker.on.select('oauth2_refresh_tokens').responseOnce(undefined);
    tracker.on.update('oauth2_access_tokens').responseOnce(0);
    tracker.on.delete('oauth2_access_tokens').responseOnce(1);

    await expect(service.revokeToken('access-token')).resolves.toBe(true);

    expect(
        tracker.history.all.map(({ method, sql }) => [
            method,
            /(?:from|update) "([^"]+)"/.exec(sql)?.[1],
        ]),
    ).toEqual([
        ['select', 'oauth2_refresh_tokens'],
        ['update', 'oauth2_access_tokens'],
        ['delete', 'oauth2_access_tokens'],
    ]);
    expect(flags.get).not.toHaveBeenCalled();
    expect(tracker.history.transactions).toHaveLength(0);
});

it.each(strictModes)(
    'rejects plain PKCE with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
        await expect(
            authorize({
                code_challenge: verifier,
                code_challenge_method: 'plain',
            }),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidRequestError);
        expect(model.saveAuthorizationCode).not.toHaveBeenCalled();
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(strictModes)(
    'rejects an unknown PKCE method with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
        await expect(
            authorize({ code_challenge_method: 'unknown' }),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidRequestError);
        expect(model.saveAuthorizationCode).not.toHaveBeenCalled();
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(strictModes)(
    'rejects a missing PKCE verifier with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
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
    },
);

it.each(strictModes)(
    'rejects a wrong PKCE verifier with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
        const code = await authorize();
        await expect(
            exchange(code, { code_verifier: 'b'.repeat(43) }),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidGrantError);
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(strictModes)(
    'rejects a verifier for a code issued without a challenge with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
        await setSecurityStrict(false);
        const code = await authorize({
            code_challenge: '',
            code_challenge_method: '',
        });
        await setSecurityStrict(strict);
        expect(code.codeChallenge).toBeUndefined();
        await expect(exchange(code)).rejects.toBeInstanceOf(
            OAuth2Server.InvalidGrantError,
        );
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(strictModes)(
    'consumes the code after a failed verifier attempt with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
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

it.each(strictModes)(
    'rejects a reused authorization code with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
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

it.each(strictModes)(
    'rejects an expired authorization code with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
        const code = await authorize();
        codes.set(code.authorizationCode, {
            ...code,
            sessionExpiresAt: null,
            expiresAt: new Date(0),
        });
        await expect(exchange(code)).rejects.toBeInstanceOf(
            OAuth2Server.InvalidGrantError,
        );
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(strictModes)(
    'rejects a code exchanged by another client with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
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

it.each(strictModes)(
    'rejects a different redirect URI at exchange with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
        const code = await authorize();
        await expect(
            exchange(code, { redirect_uri: 'https://client.example/other' }),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidRequestError);
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(strictModes)(
    'rejects an unregistered authorization redirect URI with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
        await expect(
            authorize({ redirect_uri: 'https://evil.example/callback' }),
        ).rejects.toBeInstanceOf(OAuth2Server.InvalidClientError);
        expect(model.saveAuthorizationCode).not.toHaveBeenCalled();
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);

it.each(strictModes)(
    'issues a token for S256 with a matching redirect URI with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
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

const apiResource = lightdashConfig.siteUrl.replace(/\/$/, '');
const mcpResource = `${apiResource}/api/v1/mcp`;

it.each([true] as const)(
    'requires PKCE with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
        await expect(
            authorize({ code_challenge: '', code_challenge_method: '' }),
        ).rejects.toMatchObject({ name: 'invalid_request' });
        expect(model.saveAuthorizationCode).not.toHaveBeenCalled();
    },
);

it.each([true] as const)(
    'rejects legacy challenge-less codes with security strict %s',
    async (strict) => {
        await setSecurityStrict(false);
        const code = await authorize({
            code_challenge: '',
            code_challenge_method: '',
        });
        await setSecurityStrict(strict);
        await expect(
            exchange(code, { code_verifier: '' }),
        ).rejects.toMatchObject({ name: 'invalid_grant' });
        expect(model.saveToken).not.toHaveBeenCalled();
        expect(codes.has(code.authorizationCode)).toBe(false);
    },
);

it.each([
    'https://foreign.example',
    `${apiResource}/other`,
    `${apiResource}?query=1`,
    `${apiResource}#fragment`,
    [apiResource, mcpResource],
])('rejects invalid authorize resource %j under strict', async (resource) => {
    await setSecurityStrict(true);
    await expect(authorize({ resource })).rejects.toMatchObject({
        name: 'invalid_target',
        status: 400,
    });
    expect(model.saveAuthorizationCode).not.toHaveBeenCalled();
});

it('rejects a resource switch at code exchange', async () => {
    await setSecurityStrict(true);
    const code = await authorize({ resource: mcpResource });
    await expect(
        exchange(code, { resource: apiResource }),
    ).rejects.toMatchObject({ name: 'invalid_target' });
    expect(model.saveToken).not.toHaveBeenCalled();
});

it.each([
    null,
    `${apiResource}/`,
    `${mcpResource}/`,
    `${mcpResource}/projects/11111111-1111-4111-8111-111111111111/`,
])('binds canonical resource %s to codes and tokens', async (resource) => {
    await setSecurityStrict(true);
    const expected = resource?.startsWith(mcpResource)
        ? mcpResource
        : apiResource;
    const code = await authorize(resource === null ? {} : { resource });
    expect(code.resource).toBe(expected);
    expect(await exchange(code)).toMatchObject({ resource: expected });
    expect(model.saveToken).toHaveBeenCalledWith(
        expect.objectContaining({ resource: expected }),
        client,
        user,
    );
});

it('keeps challenge-less authorization and ignores resource with the flag off', async () => {
    await setSecurityStrict(false);
    const code = await authorize({
        code_challenge: '',
        code_challenge_method: '',
        resource: ['foreign', 'other'],
    });
    expect(code.resource).toBeNull();
    const token = await exchange(code, {
        code_verifier: '',
        resource: 'foreign',
    });
    expect(token.resource).toBeNull();
});

it('defaults an omitted PKCE method to S256 under strict', async () => {
    await setSecurityStrict(true);
    const code = await authorize({ code_challenge_method: '' });
    expect(code.codeChallengeMethod).toBe('S256');
    await expect(exchange(code)).resolves.toMatchObject({
        resource: apiResource,
    });
});
it('binds a legacy challenged code to the requested resource after strict enablement', async () => {
    await setSecurityStrict(false);
    const code = await authorize();
    expect(code.resource).toBeNull();
    await setSecurityStrict(true);
    await expect(
        exchange(code, { resource: `${mcpResource}/` }),
    ).resolves.toMatchObject({ resource: mcpResource });
});
it.each([
    { resource: 'https://foreign.example' },
    { resource: [apiResource, apiResource] },
])(
    'refuses invalid token exchange resource $resource',
    async ({ resource }) => {
        await setSecurityStrict(true);
        const code = await authorize();
        await expect(exchange(code, { resource })).rejects.toMatchObject({
            name: 'invalid_target',
            status: 400,
        });
        expect(model.saveToken).not.toHaveBeenCalled();
    },
);
it('rejects duplicate authorize resources even when they are identical', async () => {
    await setSecurityStrict(true);
    await expect(
        authorize({ resource: [apiResource, apiResource] }),
    ).rejects.toMatchObject({ name: 'invalid_target' });
    expect(model.saveAuthorizationCode).not.toHaveBeenCalled();
});
it.each([false, true] as const)(
    'authenticates query tokens only with strict off with security strict %s',
    async (strict) => {
        await setSecurityStrict(strict);
        const token = {
            accessToken: 'query-token',
            accessTokenExpiresAt: new Date(Date.now() + 60000),
            client,
            user,
            resource: null,
        };
        vi.spyOn(model, 'getAccessToken').mockResolvedValue(token);
        const result = service.authenticate(
            new OAuth2Server.Request({
                method: 'GET',
                headers: {},
                body: {},
                query: { access_token: token.accessToken },
            }),
            new OAuth2Server.Response({}),
        );
        if (!strict) await expect(result).resolves.toEqual(token);
        else
            await expect(result).rejects.toMatchObject({
                name: 'invalid_token',
            });
    },
);
it('refuses a strict header token when a query token would make library authentication fail', async () => {
    await setSecurityStrict(true);
    vi.spyOn(model, 'getAccessToken').mockImplementation(async (accessToken) =>
        accessToken === 'header-token'
            ? { accessToken, client, user, resource: null }
            : false,
    );
    await expect(
        service.authenticate(
            new OAuth2Server.Request({
                method: 'GET',
                headers: { authorization: 'Bearer header-token' },
                body: {},
                query: { access_token: 'unknown' },
            }),
            new OAuth2Server.Response({}),
        ),
    ).rejects.toMatchObject({ name: 'invalid_token' });
});

it('keeps concurrent API and MCP grant resource bindings separate', async () => {
    await setSecurityStrict(true);
    const [apiCode, mcpCode] = await Promise.all([
        authorize(),
        authorize({ resource: mcpResource }),
    ]);
    const [apiToken, mcpToken] = await Promise.all([
        exchange(apiCode),
        exchange(mcpCode),
    ]);
    expect(apiToken.resource).toBe(apiResource);
    expect(mcpToken.resource).toBe(mcpResource);
});

describe.each(strictModes)(
    'redirect policy with security strict %s',
    (strict) => {
        it.each([
            ['https://client.example/callback', 'https://client.example/*'],
            ['myapp://cb', 'myapp://cb'],
            ['http://example.com/cb', 'http://example.com/cb'],
        ])('validates %s registered as %s', async (candidate, registered) => {
            await setSecurityStrict(strict);
            vi.mocked(model.getClient).mockResolvedValue({
                ...client,
                redirectUris: [registered],
            });
            await expect(
                service.validateRedirectUri(client.id, candidate, user),
            ).resolves.toBe(!strict);
            expect(flags.get).toHaveBeenCalledWith({
                featureFlagId: FeatureFlags.AgentIdentity,
                user: {
                    userUuid: 'user',
                    organizationUuid: user.organizationUuid,
                },
            });
            const result = authorize({ redirect_uri: candidate });
            if (!strict) {
                await expect(result).resolves.toMatchObject({
                    redirectUri: candidate,
                });
                expect(model.saveAuthorizationCode).toHaveBeenCalledOnce();
            } else {
                await expect(result).rejects.toBeInstanceOf(
                    OAuth2Server.InvalidClientError,
                );
                expect(model.saveAuthorizationCode).not.toHaveBeenCalled();
            }
        });
    },
);

it('resolves admin strict strict from the account UUID without a numeric user lookup', async () => {
    await setSecurityStrict(true);
    getTracker().reset();
    await expect(
        service.isSecurityStrict({
            userUuid: 'admin-user',
            organizationUuid: 'admin-org',
        }),
    ).resolves.toBe(true);
    expect(flags.get).toHaveBeenLastCalledWith({
        featureFlagId: FeatureFlags.AgentIdentity,
        user: { userUuid: 'admin-user', organizationUuid: 'admin-org' },
    });
});

it.each([
    ['http://127.0.0.1:1234/cb', 'http://127.0.0.1:5678/cb'],
    ['http://localhost:1234/callback', 'http://localhost:*/callback'],
    [
        'com.lightdash.mobile:/oauth/callback',
        'com.lightdash.mobile:/oauth/callback',
    ],
])(
    'authorizes strict native redirect %s registered as %s',
    async (candidate, registered) => {
        await setSecurityStrict(true);
        vi.mocked(model.getClient).mockResolvedValue({
            ...client,
            redirectUris: [registered],
        });
        await expect(
            service.validateRedirectUri(client.id, candidate, user),
        ).resolves.toBe(true);
        await expect(
            authorize({ redirect_uri: candidate }),
        ).resolves.toMatchObject({ redirectUri: candidate });
    },
);

it('keeps concurrent strict and legacy redirect checks isolated by user', async () => {
    await setSecurityStrict(true);
    vi.spyOn(model, 'isSecurityStrictForOAuthUser').mockImplementation(
        async (identity) => identity.userId === user.userId,
    );
    vi.mocked(model.getClient).mockResolvedValue({
        ...client,
        redirectUris: ['https://client.example/*'],
    });
    const legacyRequest = new OAuth2Server.Request({
        method: 'GET',
        headers: {},
        body: {},
        query: {
            response_type: 'code',
            client_id: client.id,
            redirect_uri: redirectUri,
            state: 'state',
            code_challenge: challenge,
            code_challenge_method: 'S256',
        },
    });
    const [strict, legacy] = await Promise.allSettled([
        authorize(),
        service.authorize(legacyRequest, new OAuth2Server.Response({}), {
            ...user,
            userId: 43,
        }),
    ]);
    expect(strict).toMatchObject({
        status: 'rejected',
        reason: { name: 'invalid_client' },
    });
    expect(legacy).toMatchObject({
        status: 'fulfilled',
        value: { redirectUri },
    });
    expect(model.saveAuthorizationCode).toHaveBeenCalledOnce();
});
