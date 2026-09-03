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
        warn: vi.fn(),
    },
}));

type OAuthServiceStub = Pick<
    OAuthService,
    'authorize' | 'validateRedirectUri' | 'getClientDisplayName' | 'getSiteUrl'
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
    validateRedirectUri: vi.fn<OAuthServiceStub['validateRedirectUri']>(),
    getClientDisplayName: vi
        .fn<OAuthServiceStub['getClientDisplayName']>()
        .mockResolvedValue('Lightdash Mobile'),
    getSiteUrl: vi
        .fn<OAuthServiceStub['getSiteUrl']>()
        .mockReturnValue('https://eu1.lightdash.cloud'),
});

const authenticatedUser = {
    userId: 1,
    organizationUuid: 'organization-uuid',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@lightdash.com',
    organizationName: 'Test organization',
} as Express.User;

const userWithoutOrganization = {
    ...authenticatedUser,
    organizationUuid: undefined,
} as Express.User;

const missingOrganizationMessage =
    'Your account is not a member of an organization on eu1.lightdash.cloud. Sign in to the Lightdash instance where you were invited.';

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

const requestAuthorizationLoginRedirect = async (path: string) => {
    const app = express();
    app.use((request, _response, next) => {
        request.user = undefined;
        next();
    });
    app.use('/api/v1/oauth', oauthRouter);

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    try {
        return await new Promise<{
            headers: IncomingHttpHeaders;
            status: number;
        }>((resolve, reject) => {
            const request = httpRequest(
                {
                    hostname: '127.0.0.1',
                    method: 'GET',
                    path,
                    port: (server.address() as AddressInfo).port,
                },
                (response) => {
                    response.resume();
                    response.on('end', () =>
                        resolve({
                            headers: response.headers,
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

const requestAuthorizePage = async ({
    query,
    oauthService,
    user = authenticatedUser,
}: {
    query: Record<string, string>;
    oauthService: ReturnType<typeof createOAuthService>;
    user?: Express.User;
}): Promise<{ body: string; status: number }> => {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.user = user;
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
                    path: `/api/v1/oauth/authorize?${new URLSearchParams(
                        query,
                    ).toString()}`,
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

describe('OAuth authorize redirects', () => {
    it.each(['sso', 'local'])(
        'preserves the %s mobile login intent in the outer authorization request',
        async (intent) => {
            const authorizePath = `/api/v1/oauth/authorize?client_id=mobile-client&redirect_uri=lightdash%3A%2F%2Foauth%2Fcallback&state=request-state&mobile_login_intent=${intent}`;

            const response =
                await requestAuthorizationLoginRedirect(authorizePath);

            expect(response.status).toBe(302);
            expect(response.headers.location).toBe(
                `/login?redirect=${encodeURIComponent(authorizePath)}`,
            );
        },
    );

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

    it('sends an OAuth error instead of the approve page when the user has no organization', async () => {
        const oauthService = createOAuthService();
        oauthService.validateRedirectUri.mockResolvedValue(true);

        const response = await requestAuthorizePage({
            query: {
                client_id: 'client-id',
                redirect_uri: 'https://registered.example/callback',
                state: 'request-state',
            },
            oauthService,
            user: userWithoutOrganization,
        });

        expect(response.status).toBe(200);
        const location = new URL(getRedirectUrl(response.body));
        expect(location.searchParams.get('error')).toBe('access_denied');
        expect(location.searchParams.get('error_description')).toBe(
            missingOrganizationMessage,
        );
        expect(location.searchParams.get('state')).toBe('request-state');
        expect(oauthService.getClientDisplayName).not.toHaveBeenCalled();
    });

    it('renders the approve page when the user has an organization', async () => {
        const oauthService = createOAuthService();

        const response = await requestAuthorizePage({
            query: {
                client_id: 'client-id',
                redirect_uri: 'https://registered.example/callback',
                state: 'request-state',
            },
            oauthService,
        });

        expect(response.status).toBe(200);
        expect(response.body).toContain('Lightdash Mobile');
        expect(response.body).toContain('action="/api/v1/oauth/authorize"');
        expect(oauthService.getClientDisplayName).toHaveBeenCalledWith(
            'client-id',
        );
    });

    it('sends an OAuth error when an approval comes from a user with no organization', async () => {
        const oauthService = createOAuthService();
        oauthService.validateRedirectUri.mockResolvedValue(true);

        const response = await requestAuthorize({
            body: {
                approve: 'true',
                client_id: 'client-id',
                redirect_uri: 'https://registered.example/callback',
                state: 'request-state',
            },
            oauthService,
            user: userWithoutOrganization,
        });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/html');
        const location = new URL(getRedirectUrl(response.body));
        expect(location.searchParams.get('error')).toBe('access_denied');
        expect(location.searchParams.get('error_description')).toBe(
            missingOrganizationMessage,
        );
        expect(location.searchParams.get('state')).toBe('request-state');
        expect(oauthService.authorize).not.toHaveBeenCalled();
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
