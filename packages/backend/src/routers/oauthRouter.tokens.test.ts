import { CLI_PERSONAL_SESSION_LIFETIME_SECONDS } from '@lightdash/common';
import { createHash } from 'crypto';
import type { Request, RequestHandler, Response } from 'express';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { OAuth2Model } from '../models/OAuth2Model';
import type { UserModel } from '../models/UserModel';
import { OAuthService } from '../services/OAuthService/OAuthService';
import oauthRouter from './oauthRouter';

const config = {
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
const model = new OAuth2Model(
    knex({ client: MockClient, dialect: 'pg' }),
    config,
    { get: vi.fn().mockResolvedValue({ enabled: false }) },
);
const service = new OAuthService({
    lightdashConfig: config,
    userModel: {} as UserModel,
    oauthModel: model,
});
const callRoute = async (path: string, body: Record<string, string>) => {
    const stack = oauthRouter.stack as {
        route?: { path: string; stack: { handle: RequestHandler }[] };
    }[];
    const handler = stack.find((layer) => layer.route?.path === path)?.route
        ?.stack[0].handle;
    if (!handler) throw new Error(`Missing route ${path}`);
    const req = {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'transfer-encoding': 'chunked',
        },
        query: {},
        body,
        services: { getOauthService: () => service },
    } as unknown as Request;
    const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
    };
    await handler(req, res as unknown as Response, vi.fn());
    return res;
};

afterEach(() => {
    vi.restoreAllMocks();
    getTracker().reset();
});

it.each([null, undefined, 12345])(
    'returns session_expires_in only for a token with a deadline: %s',
    async (remaining) => {
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        vi.spyOn(service, 'token').mockResolvedValue({
            accessToken: 'access',
            refreshToken: 'refresh',
            accessTokenExpiresAt: new Date(now + 60000),
            ...(remaining === undefined
                ? {}
                : {
                      sessionExpiresAt:
                          remaining === null ? null : new Date(now + remaining),
                  }),
            scope: ['read', 'write'],
            client: { id: 'lightdash-cli', grants: ['refresh_token'] },
            user: { userId: 42, organizationUuid: 'org' },
        });
        const res = await callRoute('/token', {
            client_id: 'lightdash-cli',
            grant_type: 'refresh_token',
            refresh_token: 'refresh',
        });
        expect(res.json).toHaveBeenCalledOnce();
        const response = res.json.mock.calls[0][0] as Record<string, unknown>;
        expect(response).toMatchObject({
            access_token: 'access',
            refresh_token: 'refresh',
            token_type: 'Bearer',
            expires_in: 60,
            scope: 'read write',
        });
        if (remaining == null)
            expect(response).not.toHaveProperty('session_expires_in');
        else expect(response.session_expires_in).toBe(12);
    },
);

it.each([true, false])(
    'lets a public CLI client revoke its refresh token without a secret in strict mode %s',
    async (strict) => {
        const familyUuid = '11111111-1111-4111-8111-111111111111';
        vi.spyOn(model, 'getRefreshToken').mockResolvedValue({
            accessToken: '',
            refreshToken: 'refresh',
            familyUuid,
            securityStrict: strict,
            agentConnectionGrantUuid: null,
            client: { id: 'lightdash-cli', grants: ['refresh_token'] },
            user: { userId: 42, organizationUuid: 'org' },
        });
        const deleteToken = vi
            .spyOn(model, 'deleteRefreshToken')
            .mockResolvedValue(true);
        const revokeFamily = vi
            .spyOn(model, 'revokeUnboundRefreshFamily')
            .mockResolvedValue(true);
        const res = await callRoute('/revoke', {
            client_id: 'lightdash-cli',
            token: 'refresh',
            token_type_hint: 'refresh_token',
        });
        expect(res.status).toHaveBeenCalledExactlyOnceWith(200);
        expect(res.send).toHaveBeenCalledOnce();
        expect(model.getRefreshToken).toHaveBeenCalledExactlyOnceWith(
            'refresh',
        );
        if (strict) {
            expect(revokeFamily).toHaveBeenCalledExactlyOnceWith(
                familyUuid,
                42,
            );
            expect(deleteToken).not.toHaveBeenCalled();
        } else {
            expect(deleteToken).toHaveBeenCalledExactlyOnceWith('refresh');
            expect(revokeFamily).not.toHaveBeenCalled();
        }
    },
);

it('returns server_error when the revocation database query fails', async () => {
    getTracker()
        .on.select('oauth2_refresh_tokens')
        .simulateError('database unavailable');
    const res = await callRoute('/revoke', { token: 'refresh' });
    expect(res.status).toHaveBeenCalledExactlyOnceWith(500);
    expect(res.json).toHaveBeenCalledExactlyOnceWith({ error: 'server_error' });
    expect(res.send).not.toHaveBeenCalled();
});
it('returns 200 for an expired personal session through the model and service', async () => {
    getTracker()
        .on.select('oauth2_refresh_tokens')
        .response({
            client_id: 'lightdash-cli',
            agent_connection_grant_uuid: null,
            session_expires_at: new Date(Date.now() - 1),
        });
    const res = await callRoute('/revoke', { token: 'expired-refresh' });
    expect(res.status).toHaveBeenCalledExactlyOnceWith(200);
    expect(res.send).toHaveBeenCalledOnce();
    expect(res.json).not.toHaveBeenCalled();
});
it('returns 200 for an unknown token', async () => {
    getTracker().on.select('oauth2_refresh_tokens').response([]);
    getTracker().on.delete('oauth2_access_tokens').response(0);
    getTracker().on.update('oauth2_access_tokens').response(0);
    const res = await callRoute('/revoke', { token: 'unknown' });
    expect(res.status).toHaveBeenCalledExactlyOnceWith(200);
    expect(res.send).toHaveBeenCalledOnce();
    expect(res.json).not.toHaveBeenCalled();
});
it.each(['lightdash-cli', 'other-client'])(
    'exchanges a legacy null-deadline code for %s',
    async (clientId) => {
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const tracker = getTracker();
        const verifier = 'a'.repeat(64);
        const client = {
            client_id: clientId,
            grants: ['authorization_code', 'refresh_token'],
            redirect_uris: ['http://localhost/callback'],
            scopes: ['read', 'write'],
        };
        tracker.on.select(/from "oauth2_clients"/).response(client);
        tracker.on.select('oauth2_authorization_codes').response({
            ...client,
            authorization_code: 'legacy-code',
            expires_at: new Date(now + 60_000),
            redirect_uri: client.redirect_uris[0],
            code_challenge: createHash('sha256')
                .update(verifier)
                .digest('base64url'),
            code_challenge_method: 'S256',
            user_id: 42,
            organization_uuid: 'org',
            scope: ['read', 'write'],
            resource: null,
            agent_connection_grant_uuid: null,
            session_expires_at: null,
        });
        tracker.on.select('users').response({ user_uuid: 'user' });
        tracker.on.insert('oauth2_access_tokens').response([]);
        tracker.on.insert('oauth2_refresh_tokens').response([]);
        tracker.on.delete('oauth2_authorization_codes').response(1);
        tracker.on.delete('oauth2_refresh_tokens').response(0);
        const res = await callRoute('/token', {
            grant_type: 'authorization_code',
            client_id: clientId,
            code: 'legacy-code',
            redirect_uri: client.redirect_uris[0],
            code_verifier: verifier,
        });
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                access_token: expect.any(String),
                refresh_token: expect.any(String),
            }),
        );
        expect(tracker.history.insert).toHaveLength(2);
        const deadline =
            clientId === 'lightdash-cli'
                ? new Date(now + CLI_PERSONAL_SESSION_LIFETIME_SECONDS * 1000)
                : null;
        for (const query of tracker.history.insert) {
            const columns = query.sql
                .match(/\(([^)]+)\) values/)![1]
                .replaceAll('"', '')
                .split(', ');
            expect(
                query.bindings[columns.indexOf('session_expires_at')],
            ).toEqual(deadline);
            const expiry = query.bindings[
                columns.indexOf('expires_at')
            ] as Date;
            if (deadline !== null)
                expect(expiry.getTime()).toBeLessThanOrEqual(
                    deadline.getTime(),
                );
        }
    },
);
