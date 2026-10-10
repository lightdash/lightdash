import type { Request, Response } from 'express';
import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { OAuth2Model } from '../models/OAuth2Model';
import { type UserModel } from '../models/UserModel';
import { OAuthService } from '../services/OAuthService/OAuthService';
import {
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
        { get: vi.fn() },
    ),
});

const callHandler = (
    handler: typeof oauthAuthorizationServerHandler,
    headers: Record<string, string>,
) => {
    const request = {
        headers,
        services: { getOauthService: () => oauthService },
    } as unknown as Request;
    const json = vi.fn();
    handler(request, { json } as unknown as Response);
    expect(json).toHaveBeenCalledOnce();
    return json.mock.calls[0][0] as Record<string, unknown>;
};

it('uses the configured site URL as the authorization server issuer', () => {
    const metadata = callHandler(oauthAuthorizationServerHandler, {});
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

it('advertises only S256 for PKCE', () => {
    const metadata = callHandler(oauthAuthorizationServerHandler, {});
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
});

it('uses the configured site URL for protected resource metadata', () => {
    const metadata = callHandler(oauthProtectedResourceHandler, {});
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
    (_name, headers) => {
        [
            oauthAuthorizationServerHandler,
            oauthProtectedResourceHandler,
        ].forEach((handler) => {
            const baseline = callHandler(handler, {
                host: 'configured.lightdash.example',
            });
            expect(callHandler(handler, headers)).toEqual(baseline);
        });
    },
);
