import type { Request, RequestHandler, Response } from 'express';
import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { OAuth2Model } from '../models/OAuth2Model';
import type { UserModel } from '../models/UserModel';
import { OAuthService } from '../services/OAuthService/OAuthService';
import oauthRouter from './oauthRouter';

const model = new OAuth2Model(
    knex({ client: MockClient, dialect: 'pg' }),
    lightdashConfigMock,
    { get: vi.fn().mockResolvedValue({ enabled: false }) },
);
const service = new OAuthService({
    lightdashConfig: lightdashConfigMock,
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
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
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

afterEach(() => vi.restoreAllMocks());

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
