import { FeatureFlags } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import express, { type Request, type RequestHandler } from 'express';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import passport from 'passport';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { OAuthBearerRefusalError } from '../../auth/oauthScopes/security';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { authenticateServiceAccount } from '../../ee/authentication';
import { OAuth2Model } from '../../models/OAuth2Model';
import { type UserModel } from '../../models/UserModel';
import mcpRouter from '../../routers/mcpRouter';
import { OAuthService } from '../../services/OAuthService/OAuthService';
import {
    acceptAnyOAuthAudience,
    allowApiKeyAuthentication,
    allowOauthAuthentication,
} from './middlewares';

vi.mock('passport', () => ({ default: { authenticate: vi.fn() } }));
vi.mock('../../ee/authentication', () => ({
    authenticateServiceAccount: vi.fn(),
}));

const fetch = (
    url: string,
    options: { method?: string; headers?: Record<string, string> } = {},
) =>
    new Promise<{
        status: number;
        headers: { get: (name: string) => string | null };
    }>((resolve, reject) => {
        const request = httpRequest(url, options, (response) => {
            response.resume();
            response.on('end', () =>
                resolve({
                    status: response.statusCode ?? 0,
                    headers: {
                        get: (name) =>
                            String(
                                response.headers[name.toLowerCase()] ?? '',
                            ) || null,
                    },
                }),
            );
        });
        request.on('error', reject);
        request.end();
    });

const site = 'https://server.example';
const mcp = `${site}/api/v1/mcp`;
const user = {
    ...defaultSessionUser,
    userId: 42,
    userUuid: 'user',
    organizationUuid: 'org',
};
const servers: Server[] = [];
const database = knex({ client: MockClient, dialect: 'pg' });
const start = async (
    token: OAuth2Server.Token,
    strict: boolean,
    middleware: RequestHandler,
    useMcpRouter = false,
) => {
    const app = express();
    app.use((req, _res, next) => {
        req.isAuthenticated = (() => false) as Request['isAuthenticated'];
        req.services = {
            getOauthService: () => ({
                authenticate: async () => token,
                getSiteUrl: () => site,
            }),
            getUserService: () => ({ findSessionUser: async () => user }),
            getFeatureFlagService: () => ({
                get: async ({ featureFlagId }: { featureFlagId: string }) => ({
                    enabled:
                        featureFlagId === FeatureFlags.AgentIdentity && strict,
                }),
            }),
            getMcpService: () => ({
                canAccessMcp: () => {},
                isEnabled: async () => true,
            }),
        } as unknown as Request['services'];
        next();
    });
    if (useMcpRouter) app.use('/api/v1/mcp', mcpRouter);
    else
        app.get('/api/v1/projects', middleware, (req, res) =>
            res.sendStatus(req.account?.isAuthenticated() ? 200 : 401),
        );
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
const tokenFor = (resource: string | null): OAuth2Server.Token => ({
    accessToken: 'oauth-token',
    resource,
    scope: ['read', 'mcp:read'],
    client: { id: 'client', grants: ['authorization_code'] },
    user,
});
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
    vi.restoreAllMocks();
    getTracker().reset();
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve, reject) => {
                    server.closeAllConnections();
                    server.close((error) =>
                        error ? reject(error) : resolve(),
                    );
                }),
        ),
    );
});

it.each([allowApiKeyAuthentication, allowOauthAuthentication])(
    'refuses an MCP-bound token at REST without authentication fallbacks',
    async (middleware) => {
        const url = await start(tokenFor(mcp), false, middleware);
        const response = await fetch(`${url}/api/v1/projects`, {
            headers: { Authorization: 'Bearer oauth-token' },
        });
        expect(response.status).toBe(401);
        expect(authenticateServiceAccount).not.toHaveBeenCalled();
        expect(passport.authenticate).not.toHaveBeenCalled();
    },
);
it.each([site, mcp])(
    'accepts a token bound to %s where any audience is allowed',
    async (resource) => {
        const url = await start(tokenFor(resource), true, (req, res, next) =>
            acceptAnyOAuthAudience(req, res, () =>
                allowApiKeyAuthentication(req, res, next),
            ),
        );
        const response = await fetch(`${url}/api/v1/projects`, {
            headers: { Authorization: 'Bearer oauth-token' },
        });
        expect(response.status).toBe(200);
    },
);
it.each([
    '/api/v1/mcp',
    '/api/v1/mcp/projects/11111111-1111-4111-8111-111111111111',
])('refuses an API-bound token at %s with resource discovery', async (path) => {
    const url = await start(
        tokenFor(site),
        false,
        allowApiKeyAuthentication,
        true,
    );
    const response = await fetch(`${url}${path}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer oauth-token' },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain(
        `resource_metadata="${site}/api/v1/oauth/.well-known/oauth-protected-resource"`,
    );
    expect(authenticateServiceAccount).not.toHaveBeenCalled();
    expect(passport.authenticate).not.toHaveBeenCalled();
});
it.each([false, true])(
    'accepts legacy tokens on REST and MCP with strict=%s',
    async (strict) => {
        await Promise.all(
            [false, true].map(async (isMcp) => {
                const url = await start(
                    tokenFor(null),
                    strict,
                    allowApiKeyAuthentication,
                    isMcp,
                );
                const response = await fetch(
                    `${url}${isMcp ? '/api/v1/mcp' : '/api/v1/projects'}`,
                    {
                        method: isMcp ? 'DELETE' : 'GET',
                        headers: { Authorization: 'Bearer oauth-token' },
                    },
                );
                expect(response.status).toBe(isMcp ? 405 : 200);
            }),
        );
    },
);
it.each([allowApiKeyAuthentication, allowOauthAuthentication])(
    'refuses query tokens under strict and accepts them with the flag off',
    async (middleware) => {
        await Promise.all(
            [true, false].map(async (strict) => {
                const url = await start(tokenFor(null), strict, middleware);
                const response = await fetch(
                    `${url}/api/v1/projects?access_token=oauth-token`,
                );
                expect(response.status).toBe(strict ? 401 : 200);
            }),
        );
        expect(authenticateServiceAccount).not.toHaveBeenCalled();
        expect(passport.authenticate).not.toHaveBeenCalled();
    },
);
it.each([true, false])(
    'handles MCP query tokens with strict=%s',
    async (strict) => {
        const url = await start(
            tokenFor(null),
            strict,
            allowApiKeyAuthentication,
            true,
        );
        const response = await fetch(
            `${url}/api/v1/mcp?access_token=oauth-token`,
            { method: 'DELETE' },
        );
        expect(response.status).toBe(401);
        if (strict)
            expect(response.headers.get('WWW-Authenticate')).toContain(
                'resource_metadata=',
            );
    },
);
it('refuses a service-issued MCP token in the REST middleware', async () => {
    const config = {
        ...lightdashConfigMock,
        siteUrl: site,
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
    const model = new OAuth2Model(database, config, {
        get: vi.fn().mockImplementation(async ({ featureFlagId }) => ({
            enabled: featureFlagId === FeatureFlags.AgentIdentity,
        })),
    });
    const service = new OAuthService({
        oauthModel: model,
        userModel: {} as UserModel,
        lightdashConfig: config,
    });
    const client = {
        id: 'client',
        grants: ['authorization_code'],
        redirectUris: ['https://client.example/callback'],
        scopes: ['mcp:read'],
    };
    getTracker().on.select('users').response({ user_uuid: 'user' });
    vi.spyOn(model, 'getClient').mockResolvedValue(client);
    vi.spyOn(model, 'saveAuthorizationCode').mockImplementation(
        async (code, savedClient, savedUser) => ({
            ...code,
            client: savedClient,
            user: savedUser,
        }),
    );
    const verifier = 'a'.repeat(43);
    const code = await service.authorize(
        new OAuth2Server.Request({
            method: 'GET',
            headers: {},
            body: {},
            query: {
                response_type: 'code',
                client_id: client.id,
                redirect_uri: client.redirectUris[0],
                scope: 'mcp:read',
                resource: mcp,
                code_challenge: createHash('sha256')
                    .update(verifier)
                    .digest('base64url'),
                code_challenge_method: 'S256',
            },
        }),
        new OAuth2Server.Response({}),
        user,
    );
    vi.spyOn(model, 'getAuthorizationCode').mockResolvedValue(code);
    vi.spyOn(model, 'revokeAuthorizationCode').mockResolvedValue(true);
    vi.spyOn(model, 'saveToken').mockImplementation(
        async (token, savedClient, savedUser) => ({
            ...token,
            client: savedClient,
            user: savedUser,
        }),
    );
    const token = await service.token(
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
                client_secret: 'secret',
                code: code.authorizationCode,
                redirect_uri: client.redirectUris[0],
                code_verifier: verifier,
            },
        }),
        new OAuth2Server.Response({}),
    );
    expect(token.resource).toBe(mcp);
    vi.spyOn(model, 'getAccessToken').mockResolvedValue(token);
    const app = express();
    app.use((req, _res, next) => {
        req.isAuthenticated = (() => false) as Request['isAuthenticated'];
        req.services = {
            getOauthService: () => service,
            getUserService: () => ({ findSessionUser: async () => user }),
        } as unknown as Request['services'];
        next();
    });
    app.get('/api/v1/projects', allowApiKeyAuthentication, (_req, res) =>
        res.sendStatus(200),
    );
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    const response = await fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/projects`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } },
    );
    expect(response.status).toBe(401);
    expect(passport.authenticate).not.toHaveBeenCalled();
    expect(authenticateServiceAccount).not.toHaveBeenCalled();
});

it.each([allowApiKeyAuthentication, allowOauthAuthentication])(
    'does not fall back after a strict query-token refusal from the service',
    async (middleware) => {
        const app = express();
        app.use((req, _res, next) => {
            req.isAuthenticated = (() => false) as Request['isAuthenticated'];
            req.services = {
                getOauthService: () => ({
                    authenticate: async () => {
                        throw new OAuthBearerRefusalError();
                    },
                }),
            } as unknown as Request['services'];
            next();
        });
        app.get('/api/v1/projects', middleware, (_req, res) =>
            res.sendStatus(200),
        );
        const server = app.listen(0, '127.0.0.1');
        servers.push(server);
        await once(server, 'listening');
        const response = await fetch(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/projects?access_token=token`,
        );
        expect(response.status).toBe(401);
        expect(authenticateServiceAccount).not.toHaveBeenCalled();
        expect(passport.authenticate).not.toHaveBeenCalled();
    },
);
