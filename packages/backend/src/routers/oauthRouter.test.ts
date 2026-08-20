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

type OAuthServiceStub = Pick<
    OAuthService,
    'authorize' | 'getClientAuthorizationDetails' | 'validateRedirectUri'
>;

const getRedirectUrl = (body: string): string => {
    const match = /<meta http-equiv="refresh" content="0;url=([^"]+)" \/>/.exec(
        body,
    );
    if (!match) {
        throw new Error('Missing OAuth meta refresh');
    }
    return match[1]
        .replaceAll('&amp;', '&')
        .replaceAll('&#x3D;', '=')
        .replaceAll('&quot;', '"')
        .replaceAll('&#x27;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
};

const createOAuthService = () => ({
    authorize: vi.fn<OAuthServiceStub['authorize']>(),
    getClientAuthorizationDetails:
        vi.fn<OAuthServiceStub['getClientAuthorizationDetails']>(),
    validateRedirectUri: vi.fn<OAuthServiceStub['validateRedirectUri']>(),
});

const authenticatedUser = {
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    organizationName: 'Test organization',
    userId: 1,
    organizationUuid: 'organization-uuid',
} as Express.User;

const requestConsent = async ({
    oauthService,
    redirectUri,
}: {
    oauthService: ReturnType<typeof createOAuthService>;
    redirectUri: string;
}): Promise<{ body: string; status: number }> => {
    const app = express();
    app.use((request, _response, next) => {
        request.user = authenticatedUser;
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
                    hostname: '127.0.0.1',
                    method: 'GET',
                    path: `/api/v1/oauth/authorize?client_id=mcp-client&redirect_uri=${encodeURIComponent(redirectUri)}&scope=mcp%3Aread`,
                    port: (server.address() as AddressInfo).port,
                },
                (response) => {
                    const chunks: Buffer[] = [];
                    response.on('data', (chunk: Buffer) => chunks.push(chunk));
                    response.on('end', () =>
                        resolve({
                            body: Buffer.concat(chunks).toString('utf8'),
                            status: response.statusCode ?? 0,
                        }),
                    );
                },
            );
            request.on('error', reject);
            request.end();
        });
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
};

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
    it('shows the redirect origin and warning for a self-registered client', async () => {
        const oauthService = createOAuthService();
        vi.mocked(oauthService.getClientAuthorizationDetails).mockResolvedValue(
            {
                clientName: 'Self-registered client',
                isSelfRegistered: true,
            },
        );

        const response = await requestConsent({
            oauthService,
            redirectUri: 'http://localhost:3210/callback',
        });

        expect(response.status).toBe(200);
        expect(response.body).toContain(
            'This application is self-registered and has not been verified by your organisation.',
        );
        expect(response.body).toContain('http://localhost:3210');
    });

    it('does not show the self-registration warning for an organisation client', async () => {
        const oauthService = createOAuthService();
        vi.mocked(oauthService.getClientAuthorizationDetails).mockResolvedValue(
            {
                clientName: 'Organisation client',
                isSelfRegistered: false,
            },
        );

        const response = await requestConsent({
            oauthService,
            redirectUri: 'https://example.com/callback',
        });

        expect(response.status).toBe(200);
        expect(response.body).not.toContain('self-registered');
        expect(response.body).not.toContain(
            'The authorization code will be sent to',
        );
    });

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

        expect(response.status).toBe(200);
        expect(response.headers.location).toBeUndefined();
        expect(getRedirectUrl(response.body)).toBe(
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

        expect(response.status).toBe(200);
        expect(response.headers.location).toBeUndefined();
        expect(getRedirectUrl(response.body)).toBe(
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

        expect(response.status).toBe(200);
        expect(response.headers.location).toBeUndefined();
        expect(getRedirectUrl(response.body)).toBe(
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
            .spyOn(express.response, 'send')
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

            expect(response.status).toBe(200);
            const location = new URL(getRedirectUrl(response.body));
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
