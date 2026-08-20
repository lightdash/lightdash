import OAuth2Server from '@node-oauth/oauth2-server';
import express from 'express';
import { once } from 'node:events';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { OAuthService } from '../services/OAuthService/OAuthService';
import oauthRouter from './oauthRouter';

vi.mock('../logging/logger', () => ({
    default: {
        error: vi.fn(),
    },
}));

type OAuthServiceStub = Pick<OAuthService, 'authorize' | 'validateRedirectUri'>;

const createOAuthService = () => ({
    authorize: vi.fn<OAuthServiceStub['authorize']>(),
    validateRedirectUri: vi.fn<OAuthServiceStub['validateRedirectUri']>(),
});

const authenticatedUser = {
    userId: 1,
    organizationUuid: 'organization-uuid',
} as Express.User;

const requestAuthorize = async ({
    body,
    oauthService,
    user = authenticatedUser,
}: {
    body: Record<string, string>;
    oauthService: ReturnType<typeof createOAuthService>;
    user?: Express.User | null;
}): Promise<{
    body: string;
    headers: IncomingHttpHeaders;
    status: number;
}> => {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.user = user ?? undefined;
        request.services = {
            getOauthService: () => oauthService as unknown as OAuthService,
        } as Express.Request['services'];
        next();
    });
    app.use('/api/v1/oauth', oauthRouter);

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    try {
        return await new Promise((resolve, reject) => {
            const request = httpRequest(
                {
                    headers: { 'content-type': 'application/json' },
                    hostname: '127.0.0.1',
                    method: 'POST',
                    path: '/api/v1/oauth/authorize',
                    port: (server.address() as AddressInfo).port,
                },
                (response) => {
                    const chunks: Buffer[] = [];
                    response.on('data', (chunk: Buffer) => chunks.push(chunk));
                    response.on('end', () =>
                        resolve({
                            body: Buffer.concat(chunks).toString('utf8'),
                            headers: response.headers,
                            status: response.statusCode ?? 0,
                        }),
                    );
                },
            );
            request.on('error', reject);
            request.end(JSON.stringify(body));
        });
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
};

describe('OAuth authorize redirects', () => {
    it.each([
        'https://unregistered.example/callback',
        'urn:example:unregistered-callback',
    ])(
        'rejects the unregistered redirect URI %s without reflection',
        async (redirectUri) => {
            const oauthService = createOAuthService();
            oauthService.validateRedirectUri.mockResolvedValue(false);

            const response = await requestAuthorize({
                body: {
                    approve: 'false',
                    client_id: 'client-id',
                    redirect_uri: redirectUri,
                    state: 'request-state',
                },
                oauthService,
            });

            expect(response.status).toBe(400);
            expect(response.headers.location).toBeUndefined();
            expect(response.headers['content-type']).toContain(
                'application/json',
            );
            expect(response.body).toBe(
                '{"error":"invalid_request","error_description":"Invalid client_id or redirect_uri"}',
            );
            expect(response.body).not.toContain(redirectUri);
            expect(oauthService.validateRedirectUri).toHaveBeenCalledWith(
                'client-id',
                redirectUri,
            );
        },
    );

    it('redirects a denied request to its registered URI', async () => {
        const oauthService = createOAuthService();
        oauthService.validateRedirectUri.mockResolvedValue(true);

        const response = await requestAuthorize({
            body: {
                approve: 'false',
                client_id: 'client-id',
                redirect_uri: 'https://registered.example/callback?existing=1',
                state: 'request-state',
            },
            oauthService,
        });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
            'https://registered.example/callback?existing=1&error=access_denied&state=request-state',
        );
        expect(oauthService.authorize).not.toHaveBeenCalled();
    });

    it('redirects a successful request with its authorization code', async () => {
        const oauthService = createOAuthService();
        oauthService.validateRedirectUri.mockResolvedValue(true);
        oauthService.authorize.mockResolvedValue({
            authorizationCode: 'authorization-code',
        } as OAuth2Server.AuthorizationCode);

        const response = await requestAuthorize({
            body: {
                approve: 'true',
                client_id: 'client-id',
                redirect_uri: 'https://registered.example/callback',
                state: 'request-state',
            },
            oauthService,
        });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
            'https://registered.example/callback?code=authorization-code&state=request-state',
        );
    });

    it('redirects an authorization error only after URI validation', async () => {
        const oauthService = createOAuthService();
        oauthService.validateRedirectUri.mockResolvedValue(true);
        oauthService.authorize.mockRejectedValue(new Error('authorize failed'));

        const response = await requestAuthorize({
            body: {
                approve: 'true',
                client_id: 'client-id',
                redirect_uri: 'https://registered.example/callback',
                state: 'request-state',
            },
            oauthService,
        });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
            'https://registered.example/callback?error=server_error&state=request-state',
        );
    });

    it('does not include an authorization code in an error redirect', async () => {
        const oauthService = createOAuthService();
        oauthService.validateRedirectUri.mockResolvedValue(true);
        oauthService.authorize.mockResolvedValue({
            authorizationCode: 'authorization-code',
        } as OAuth2Server.AuthorizationCode);
        const redirectSpy = vi
            .spyOn(express.response, 'redirect')
            .mockImplementationOnce(() => {
                throw new Error('redirect failed');
            });

        try {
            const response = await requestAuthorize({
                body: {
                    approve: 'true',
                    client_id: 'client-id',
                    redirect_uri: 'https://registered.example/callback',
                    state: 'request-state',
                },
                oauthService,
            });

            expect(response.status).toBe(302);
            const location = new URL(response.headers.location ?? '');
            expect(location.searchParams.get('error')).toBe('server_error');
            expect(location.searchParams.has('code')).toBe(false);
            expect(location.searchParams.get('state')).toBe('request-state');
        } finally {
            redirectSpy.mockRestore();
        }
    });

    it('checks authentication before handling a denial', async () => {
        const oauthService = createOAuthService();

        const response = await requestAuthorize({
            body: {
                approve: 'false',
                client_id: 'client-id',
                redirect_uri: 'https://registered.example/callback',
            },
            oauthService,
            user: null,
        });

        expect(response.status).toBe(401);
        expect(oauthService.validateRedirectUri).not.toHaveBeenCalled();
    });
});
