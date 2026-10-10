import express, { type Request, type Response } from 'express';
import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { canonicalOAuthResource } from '../auth/oauthScopes/oauthResources';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { OAuth2Model } from '../models/OAuth2Model';
import { type UserModel } from '../models/UserModel';
import { OAuthService } from '../services/OAuthService/OAuthService';
import oauthRouter, {
    oauthAuthorizationServerHandler,
    oauthConfig,
    oauthProtectedResourceConfig,
    oauthProtectedResourceHandler,
} from './oauthRouter';

const siteUrl = 'https://configured.lightdash.example';
const config = { ...lightdashConfigMock, siteUrl };
const oauthService = new OAuthService({
    lightdashConfig: config,
    userModel: {} as UserModel,
    oauthModel: new OAuth2Model(
        knex({ client: MockClient, dialect: 'pg' }),
        config,
        { get: vi.fn().mockResolvedValue({ enabled: false }) },
    ),
});

const callHandler = async (
    handler:
        | typeof oauthAuthorizationServerHandler
        | typeof oauthProtectedResourceHandler,
    headers: Record<string, string>,
) => {
    const request = {
        headers,
        services: { getOauthService: () => oauthService },
    } as unknown as Request;
    const json = vi.fn();
    await handler(request, { json } as unknown as Response, vi.fn());
    expect(json).toHaveBeenCalledOnce();
    return json.mock.calls[0][0] as Record<string, unknown>;
};

it('uses the configured site URL as the authorization server issuer', async () => {
    const metadata = await callHandler(oauthAuthorizationServerHandler, {});
    expect(metadata).toEqual(oauthConfig(siteUrl));
    expect(metadata.issuer).toBe(siteUrl);
    const endpoints = Object.entries(metadata).filter(([key]) =>
        key.endsWith('_endpoint'),
    );
    expect(endpoints).toHaveLength(6);
    endpoints.forEach(([, endpoint]) => {
        expect(typeof endpoint).toBe('string');
        expect(String(endpoint).startsWith(`${siteUrl}/`)).toBe(true);
    });
});

it('advertises only S256 for PKCE', async () => {
    const metadata = await callHandler(oauthAuthorizationServerHandler, {});
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
});

it('uses the configured site URL for protected resource metadata', async () => {
    const metadata = await callHandler(oauthProtectedResourceHandler, {});
    expect(metadata).toEqual(oauthProtectedResourceConfig(siteUrl));
    expect(metadata.resource).toBe(`${siteUrl}/api/v1/mcp`);
    expect(metadata.authorization_servers).toEqual([siteUrl]);
    expect(metadata.introspection_endpoint).toBe(
        `${siteUrl}/api/v1/oauth/introspect`,
    );
    expect(metadata.revocation_endpoint).toBe(`${siteUrl}/api/v1/oauth/revoke`);
});

it.each([
    ['Host', { host: 'evil.example' }],
    ['X-Forwarded-Host', { 'x-forwarded-host': 'evil.example' }],
    [
        'Host and X-Forwarded-Host',
        { host: 'evil.example', 'x-forwarded-host': 'other-evil.example' },
    ],
] as const)(
    'ignores hostile %s headers in both discovery handlers',
    async (_name, headers) => {
        const handlers = [
            oauthAuthorizationServerHandler,
            oauthProtectedResourceHandler,
        ];
        await Promise.all(
            handlers.map(async (handler) => {
                const baseline = await callHandler(handler, {
                    host: 'configured.lightdash.example',
                });
                expect(await callHandler(handler, headers)).toEqual(baseline);
            }),
        );
    },
);

it('advertises strict security from the instance flag', async () => {
    vi.spyOn(oauthService, 'isSecurityStrict').mockResolvedValueOnce(true);
    const metadata = await callHandler(oauthAuthorizationServerHandler, {});
    expect(metadata).toMatchObject({
        pkce_required: true,
        authorization_response_iss_parameter_supported: true,
    });
    expect(metadata.grant_types_supported).toEqual([
        'authorization_code',
        'refresh_token',
    ]);
    expect(metadata.token_endpoint_auth_methods_supported).toEqual([
        'client_secret_basic',
        'client_secret_post',
        'none',
    ]);
    expect(oauthService.isSecurityStrict).toHaveBeenCalledExactlyOnceWith(null);
    vi.restoreAllMocks();
});

afterEach(() => vi.restoreAllMocks());

it.each([true, false])(
    'advertises a trailing-slash site URL with strict=%s',
    async (strict) => {
        const trailingSiteUrl = `${siteUrl}/`;
        vi.spyOn(oauthService, 'getSiteUrl').mockReturnValue(trailingSiteUrl);
        vi.spyOn(oauthService, 'isSecurityStrict').mockResolvedValue(strict);
        const metadata = await callHandler(oauthProtectedResourceHandler, {});
        if (strict) {
            expect(metadata.resource).toBe(`${siteUrl}/api/v1/mcp`);
            expect(
                canonicalOAuthResource(
                    trailingSiteUrl,
                    String(metadata.resource),
                ),
            ).toBe(metadata.resource);
            expect(metadata.authorization_servers).toEqual([siteUrl]);
        } else {
            expect(JSON.stringify(metadata)).toBe(
                JSON.stringify(oauthProtectedResourceConfig(trailingSiteUrl)),
            );
        }
    },
);

it.each([
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-protected-resource',
])('forwards a rejected flag lookup at %s to Express', async (path) => {
    vi.spyOn(oauthService, 'isSecurityStrict').mockRejectedValue(
        new Error('flag lookup failed'),
    );
    const app = express();
    app.use((req, _res, next) => {
        req.services = {
            getOauthService: () => oauthService,
        } as Request['services'];
        next();
    });
    app.use(oauthRouter);
    const onError = vi.fn<express.ErrorRequestHandler>(
        (_error, _req, res, _next) => {
            res.status(503).send('flag lookup failed');
        },
    );
    app.use(onError);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
        const status = await new Promise<number>((resolve, reject) => {
            const request = httpRequest(
                {
                    hostname: '127.0.0.1',
                    port: (server.address() as AddressInfo).port,
                    path,
                },
                (response) => {
                    response.resume();
                    response.on('end', () => resolve(response.statusCode ?? 0));
                },
            );
            request.setTimeout(500, () =>
                request.destroy(new Error('OAuth route timed out')),
            );
            request.on('error', reject);
            request.end();
        });
        expect(status).toBe(503);
        expect(onError).toHaveBeenCalledOnce();
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
});
