import {
    generateOAuthRedirectPage,
    ManagedSignInError,
    ParameterError,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import express from 'express';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { InvalidTargetError } from '../auth/oauthScopes/oauthResources';
import Logger from '../logging/logger';
import { AiAccessService } from '../services/AiAccessService/AiAccessService';
import { InvalidClientMetadataError } from '../services/OAuthService/InvalidClientMetadataError';
import { InvalidRedirectUriError } from '../services/OAuthService/InvalidRedirectUriError';
import type { OAuthService } from '../services/OAuthService/OAuthService';
import { AgentCredentialResolutionError } from '../services/WarehouseClientFactory/resolvers/AgentCredentialResolutionError';
import oauthRouter, {
    oauthConfig,
    oauthProtectedResourceConfig,
} from './oauthRouter';

vi.mock('../logging/logger', () => ({
    default: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        child: vi.fn(() => ({ warn: vi.fn(), debug: vi.fn(), info: vi.fn() })),
    },
}));

type OAuthServiceStub = Pick<
    OAuthService,
    | 'authorize'
    | 'validateRedirectUri'
    | 'getClientDisplayName'
    | 'getSiteUrl'
    | 'token'
    | 'isSecurityStrict'
    | 'getAuthorizationResource'
    | 'registerClient'
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
    isSecurityStrict: vi
        .fn<OAuthServiceStub['isSecurityStrict']>()
        .mockResolvedValue(false),
    getAuthorizationResource: vi
        .fn<OAuthServiceStub['getAuthorizationResource']>()
        .mockResolvedValue(null),
    authorize: vi.fn<OAuthServiceStub['authorize']>(),
    validateRedirectUri: vi.fn<OAuthServiceStub['validateRedirectUri']>(),
    getClientDisplayName: vi
        .fn<OAuthServiceStub['getClientDisplayName']>()
        .mockResolvedValue('Lightdash Mobile'),
    getSiteUrl: vi
        .fn<OAuthServiceStub['getSiteUrl']>()
        .mockReturnValue('https://eu1.lightdash.cloud'),
    token: vi.fn<OAuthServiceStub['token']>(),
    registerClient: vi.fn<OAuthServiceStub['registerClient']>(),
});

const requestOAuthPost = async (
    path: string,
    body: Record<string, unknown>,
    oauthService: ReturnType<typeof createOAuthService>,
): Promise<{ body: Record<string, unknown>; status: number }> => {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
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
                    path: `/api/v1/oauth/${path}`,
                    port: (server.address() as AddressInfo).port,
                },
                (response) => {
                    const chunks: Buffer[] = [];
                    response.on('data', (chunk: Buffer) => chunks.push(chunk));
                    response.on('end', () => {
                        try {
                            resolve({
                                body: JSON.parse(
                                    Buffer.concat(chunks).toString('utf8'),
                                ) as Record<string, unknown>,
                                status: response.statusCode ?? 0,
                            });
                        } catch (error) {
                            reject(error);
                        }
                    });
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

const requestToken = async (tokenError: unknown) => {
    const oauthService = createOAuthService();
    oauthService.token.mockRejectedValue(tokenError);
    return requestOAuthPost('token', {}, oauthService);
};

describe('POST /register', () => {
    const metadata = {
        client_name: 'Test client',
        redirect_uris: ['https://example.com/callback'],
    };
    const client = {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        clientName: metadata.client_name,
        redirectUris: metadata.redirect_uris,
        grantTypes: ['authorization_code', 'refresh_token'],
        scopes: ['read', 'write'],
        createdAt: new Date('2026-10-01T12:00:00Z'),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns invalid_redirect_uri for a refused redirect', async () => {
        const oauthService = createOAuthService();
        const uri = 'http://example.com/callback';
        oauthService.registerClient.mockRejectedValue(
            new InvalidRedirectUriError(uri),
        );

        const response = await requestOAuthPost(
            'register',
            { ...metadata, redirect_uris: [uri] },
            oauthService,
        );

        expect(response).toEqual({
            status: 400,
            body: {
                error: 'invalid_redirect_uri',
                error_description: `Invalid redirect URI ${uri}`,
            },
        });
        expect(Logger.error).not.toHaveBeenCalled();
    });

    it.each([
        { redirect_uris: ['https://example.com/callback', 42] },
        { redirect_uris: [null] },
        { redirect_uris: 'https://example.com/callback' },
    ])('rejects malformed metadata: %j', async (invalidMetadata) => {
        const oauthService = createOAuthService();
        oauthService.registerClient.mockResolvedValue(client);

        const response = await requestOAuthPost(
            'register',
            { ...metadata, ...invalidMetadata },
            oauthService,
        );

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: 'invalid_client_metadata',
            error_description: expect.any(String),
        });
        expect(oauthService.registerClient).not.toHaveBeenCalled();
        expect(Logger.error).not.toHaveBeenCalled();
    });

    it.each([{ scope: ['read'] }, { scope: null }])(
        'ignores non-string scope: %j',
        async (scopeMetadata) => {
            const oauthService = createOAuthService();
            oauthService.registerClient.mockResolvedValue(client);

            const response = await requestOAuthPost(
                'register',
                { ...metadata, ...scopeMetadata },
                oauthService,
            );

            expect(response.status).toBe(201);
            expect(oauthService.registerClient).toHaveBeenCalledWith({
                clientName: metadata.client_name,
                redirectUris: metadata.redirect_uris,
                grantTypes: undefined,
                scopes: [],
            });
        },
    );

    it('keeps numeric client names compatible', async () => {
        const oauthService = createOAuthService();
        oauthService.registerClient.mockResolvedValue(client);

        const response = await requestOAuthPost(
            'register',
            { ...metadata, client_name: 42 },
            oauthService,
        );

        expect(response.status).toBe(201);
        expect(oauthService.registerClient).toHaveBeenCalledWith({
            clientName: 42,
            redirectUris: metadata.redirect_uris,
            grantTypes: undefined,
            scopes: [],
        });
    });

    it('maps rejected null grantTypes to invalid_client_metadata', async () => {
        const oauthService = createOAuthService();
        oauthService.registerClient.mockRejectedValue(
            new InvalidClientMetadataError(),
        );

        const response = await requestOAuthPost(
            'register',
            { ...metadata, grantTypes: null },
            oauthService,
        );

        expect(response).toEqual({
            status: 400,
            body: {
                error: 'invalid_client_metadata',
                error_description: 'Client metadata is invalid',
            },
        });
        expect(oauthService.registerClient).toHaveBeenCalledWith({
            clientName: metadata.client_name,
            redirectUris: metadata.redirect_uris,
            grantTypes: null,
            scopes: [],
        });
        expect(Logger.error).not.toHaveBeenCalled();
    });

    it.each([{}, { client_name: 'Test client' }, { redirect_uris: [] }])(
        'keeps missing metadata as a 400: %j',
        async (body) => {
            const oauthService = createOAuthService();
            const response = await requestOAuthPost(
                'register',
                body,
                oauthService,
            );

            expect(response).toEqual({
                status: 400,
                body: {
                    error: 'invalid_client_metadata',
                    error_description:
                        'client_name and redirect_uris are required',
                },
            });
            expect(oauthService.registerClient).not.toHaveBeenCalled();
            expect(Logger.error).not.toHaveBeenCalled();
        },
    );

    it('maps other parameter errors to invalid_client_metadata', async () => {
        const oauthService = createOAuthService();
        oauthService.registerClient.mockRejectedValue(
            new ParameterError('Invalid client metadata'),
        );

        expect(
            await requestOAuthPost('register', metadata, oauthService),
        ).toEqual({
            status: 400,
            body: {
                error: 'invalid_client_metadata',
                error_description: 'Invalid client metadata',
            },
        });
        expect(Logger.error).not.toHaveBeenCalled();
    });

    it('keeps unexpected failures as logged server errors', async () => {
        const oauthService = createOAuthService();
        oauthService.registerClient.mockRejectedValue(
            new Error('Database unavailable'),
        );

        expect(
            await requestOAuthPost('register', metadata, oauthService),
        ).toEqual({
            status: 500,
            body: {
                error: 'server_error',
                error_description:
                    'Internal server error during client registration',
            },
        });
        expect(Logger.error).toHaveBeenCalledWith(
            'Client registration error: Database unavailable',
        );
    });

    it('preserves the successful response and grantTypes request key', async () => {
        const oauthService = createOAuthService();
        oauthService.registerClient.mockResolvedValue(client);

        const response = await requestOAuthPost(
            'register',
            { ...metadata, scope: 'read write', grantTypes: client.grantTypes },
            oauthService,
        );

        expect(response).toEqual({
            status: 201,
            body: {
                client_id: client.clientId,
                client_secret: client.clientSecret,
                client_name: client.clientName,
                redirect_uris: client.redirectUris,
                grant_types: client.grantTypes,
                scope: 'read write',
                client_id_issued_at: 1790856000,
            },
        });
        expect(oauthService.registerClient).toHaveBeenCalledWith({
            clientName: metadata.client_name,
            redirectUris: metadata.redirect_uris,
            grantTypes: client.grantTypes,
            scopes: ['read', 'write'],
        });
    });

    it('keeps empty redirect arrays and omitted optional metadata valid', async () => {
        const oauthService = createOAuthService();
        oauthService.registerClient.mockResolvedValue({
            ...client,
            redirectUris: [],
            scopes: [],
        });

        const response = await requestOAuthPost(
            'register',
            { client_name: metadata.client_name, redirect_uris: [] },
            oauthService,
        );

        expect(response.status).toBe(201);
        expect(oauthService.registerClient).toHaveBeenCalledWith({
            clientName: metadata.client_name,
            redirectUris: [],
            grantTypes: undefined,
            scopes: [],
        });
    });
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
    'Your account is not a member of an organization on eu1.lightdash.cloud. Sign in to the instance where you were invited.';

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
            request.setTimeout(500, () =>
                request.destroy(new Error('OAuth route timed out')),
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
    prompt = { required: false },
    rawQuery,
    aiAccessService,
}: {
    query: Record<string, string>;
    oauthService: ReturnType<typeof createOAuthService>;
    user?: Express.User;
    prompt?: Awaited<ReturnType<AiAccessService['getAgentConnectPrompt']>>;
    rawQuery?: string;
    aiAccessService?: AiAccessService;
}): Promise<{ body: string; headers: IncomingHttpHeaders; status: number }> => {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.user = user;
        request.services = {
            getOauthService: () => oauthService as unknown as OAuthService,
            getAiAccessService: () =>
                aiAccessService ??
                ({
                    getAgentConnectPrompt: vi.fn().mockResolvedValue(prompt),
                } as unknown as AiAccessService),
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
                    path: `/api/v1/oauth/authorize?${rawQuery ?? new URLSearchParams(query).toString()}`,
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
            request.setTimeout(500, () =>
                request.destroy(new Error('OAuth route timed out')),
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
    it('refuses a strict invalid redirect before rendering consent', async () => {
        const oauthService = createOAuthService();
        oauthService.isSecurityStrict.mockResolvedValue(true);
        oauthService.validateRedirectUri.mockResolvedValue(false);
        const response = await requestAuthorizePage({
            query: {
                client_id: 'client',
                redirect_uri: 'http://example.com/cb',
            },
            oauthService,
        });
        expect(response.status).toBe(400);
        expect(response.body).toBe(
            '{"error":"invalid_request","error_description":"Invalid client_id or redirect_uri"}',
        );
        expect(response.headers.location).toBeUndefined();
        expect(response.body).not.toContain('http://example.com/cb');
        expect(response.body).not.toContain('http-equiv="refresh"');
        expect(oauthService.authorize).not.toHaveBeenCalled();
        expect(oauthService.getClientDisplayName).not.toHaveBeenCalled();
        expect(oauthService.validateRedirectUri).toHaveBeenCalledWith(
            'client',
            'http://example.com/cb',
            {
                userId: authenticatedUser.userId,
                organizationUuid: authenticatedUser.organizationUuid,
            },
        );
    });

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
                {
                    userId: authenticatedUser.userId,
                    organizationUuid: authenticatedUser.organizationUuid,
                },
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
        expect(response.body).not.toContain('warehouse agent');
        expect(createHash('sha256').update(response.body).digest('hex')).toBe(
            '65958e01412262970916671ca04c8d1b9bd2dc48517145d78891a38323394536',
        );
        expect(oauthService.getClientDisplayName).toHaveBeenCalledWith(
            'client-id',
        );
    });

    it.each([
        [
            'needs_sign_in',
            'Your organisation requires an agent sign-in. Connect once now, or authorise and connect later from the link your agent shows you.',
        ],
        [
            'sign_in_expired',
            'Your agent sign-in expired. Connect your agent again now, or authorise and connect later from the link your agent shows you.',
        ],
    ] as const)(
        'offers an optional agent connection for %s',
        async (reason, copy) => {
            const query = {
                client_id: 'client-id',
                redirect_uri: 'https://registered.example/callback',
                response_type: 'code',
                scope: 'read',
                state: 'request-state',
                code_challenge: 'challenge',
                code_challenge_method: 'S256',
            };
            const response = await requestAuthorizePage({
                query,
                oauthService: createOAuthService(),
                prompt: { required: true, reason, projectUuid: 'project-uuid' },
            });
            expect(response.status).toBe(200);
            expect(response.body).toContain('Connect your warehouse agent');
            expect(response.body).toContain(copy);
            expect(response.body).toContain(
                'class="oauth-btn deny" href="/api/v1/login/snowflake-ai?redirect&#x3D;',
            );
            const link =
                /href="([^"]+)">Connect your warehouse agent<\/a>/.exec(
                    response.body,
                )?.[1];
            expect(link).toBeDefined();
            const connectUrl = new URL(
                link!.replaceAll('&#x3D;', '=').replaceAll('&amp;', '&'),
                'https://eu1.lightdash.cloud',
            );
            expect(connectUrl.searchParams.get('redirect')).toBe(
                `https://eu1.lightdash.cloud/api/v1/oauth/authorize?${new URLSearchParams(query)}`,
            );
            expect(response.body).toContain('name="approve" value="true"');
            expect(response.body).toContain('name="approve" value="false"');
        },
    );

    it.each([
        ['mcp:read', 'mcp_consent'],
        ['mcp:write', 'mcp_consent'],
        ['read mcp:read mcp:write', 'mcp_consent'],
        ['read write', 'oauth_consent'],
        ['mcp:read-extra', 'oauth_consent'],
        ['', 'oauth_consent'],
    ])(
        'attributes consent for scope %s to %s without changing the authorize request',
        async (scope, entryPoint) => {
            const rawQuery = `client_id=client-id&redirect_uri=https%3a%2f%2fregistered.example%2fcallback%3fx%3d1&scope=${encodeURIComponent(scope)}&state=a%20b%2bc%26d%3d~&code_challenge=abc-_%7e&code_challenge_method=S256`;
            const response = await requestAuthorizePage({
                query: {},
                rawQuery,
                oauthService: createOAuthService(),
                prompt: {
                    required: true,
                    reason: 'needs_sign_in',
                    projectUuid: 'project-uuid',
                },
            });
            expect(response.status).toBe(200);
            const link =
                /href="([^"]+)">Connect your warehouse agent<\/a>/.exec(
                    response.body,
                )?.[1];
            expect(link).toBeDefined();
            const connectUrl = new URL(
                link!.replaceAll('&#x3D;', '=').replaceAll('&amp;', '&'),
                'https://eu1.lightdash.cloud',
            );
            expect(connectUrl.searchParams.get('entryPoint')).toBe(entryPoint);
            expect(connectUrl.searchParams.get('project')).toBe('project-uuid');
            const redirect = new URL(connectUrl.searchParams.get('redirect')!);
            expect(redirect.pathname).toBe('/api/v1/oauth/authorize');
            expect([...redirect.searchParams]).toEqual([
                ...new URLSearchParams(rawQuery),
            ]);
        },
    );

    it('renders consent with the real prompt service without starting a connection', async () => {
        const { Ability } = await import('@casl/ability');
        const { WarehouseTypes, AiAccessRefusalReason } =
            await import('@lightdash/common');
        const analytics = { track: vi.fn() };
        const aiAccessService = new AiAccessService({
            agentActionLogModel: {
                insert: vi.fn().mockResolvedValue(undefined),
            },
            analytics,
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            },
            organizationAgentIdentityRulesModel: {
                get: vi.fn().mockResolvedValue({ source: 'agent_sign_in' }),
            },
            organizationAgentIdentitySettingsModel: {
                get: vi
                    .fn()
                    .mockResolvedValue({ requireVerifiedAgentSessions: true }),
            },
            projectModel: {
                getAllByOrganizationUuid: vi.fn().mockResolvedValue([
                    {
                        projectUuid: 'project-uuid',
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                    },
                ]),
                getWarehouseCredentialsForBinding: vi
                    .fn()
                    .mockResolvedValue({ type: WarehouseTypes.SNOWFLAKE }),
            },
            agentSignInCredentialResolver: {
                inspect: vi.fn().mockResolvedValue(
                    new AgentCredentialResolutionError({
                        kind: 'credential',
                        classification: 'missing',
                    }),
                ),
            },
        } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
        const response = await requestAuthorizePage({
            query: {
                client_id: 'client-id',
                redirect_uri: 'https://registered.example/callback',
                scope: 'mcp:read',
            },
            oauthService: createOAuthService(),
            user: {
                ...authenticatedUser,
                ability: new Ability([{ action: 'view', subject: 'Project' }]),
            },
            aiAccessService,
        });
        expect(response.status).toBe(200);
        expect(response.body).toContain('Connect your warehouse agent');
        expect(analytics.track).not.toHaveBeenCalled();
    });

    it('shows a sign-in error and removes it from the connection return URL', async () => {
        const query = {
            client_id: 'client-id',
            error: 'not_agent_session',
            redirect_uri: 'https://registered.example/callback',
            state: 'request-state',
        };
        const response = await requestAuthorizePage({
            query,
            oauthService: createOAuthService(),
            prompt: {
                required: true,
                reason: 'needs_sign_in',
                projectUuid: 'project-uuid',
            },
        });
        expect(response.status).toBe(200);
        expect(response.body).toContain(
            'class="oauth-agent-connect-error" role="alert"',
        );
        expect(response.body).toContain(
            'Your Snowflake sign-in is not an agent session. Ask your Snowflake admin to set IS_AGENTIC &#x3D; TRUE on the security integration used for agents.',
        );
        const link = /href="([^"]+)">Connect your warehouse agent<\/a>/.exec(
            response.body,
        )?.[1];
        expect(link).toBeDefined();
        const connectUrl = new URL(
            link!.replaceAll('&#x3D;', '=').replaceAll('&amp;', '&'),
            'https://eu1.lightdash.cloud',
        );
        const authorizeUrl = new URL(
            `/api/v1/oauth/authorize?${new URLSearchParams(query)}`,
            'https://eu1.lightdash.cloud',
        );
        authorizeUrl.searchParams.delete('error');
        expect(connectUrl.searchParams.get('redirect')).toBe(authorizeUrl.href);
        expect(
            new URL(connectUrl.searchParams.get('redirect')!).searchParams.has(
                'error',
            ),
        ).toBe(false);
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

describe('OAuth token errors', () => {
    it('keeps 401 for an invalid authorization code', async () => {
        const { body, status } = await requestToken(
            new OAuth2Server.InvalidGrantError(
                'Invalid grant: authorization code is invalid',
            ),
        );

        expect(status).toBe(401);
        expect(body).toEqual({
            error: 'invalid_grant',
            error_description: 'Invalid grant: authorization code is invalid',
        });
    });

    it('keeps 401 for missing client credentials', async () => {
        const { body, status } = await requestToken(
            new OAuth2Server.InvalidClientError(
                'Invalid client: cannot retrieve client credentials',
            ),
        );

        expect(status).toBe(401);
        expect(body).toEqual({
            error: 'invalid_client',
            error_description:
                'Invalid client: cannot retrieve client credentials',
        });
    });

    it.each(Object.values(ManagedSignInError))(
        'returns invalid_grant with %s in error_description',
        async (code) => {
            const { body, status } = await requestToken(
                new OAuth2Server.InvalidGrantError(code),
            );

            expect(status).toBe(400);
            expect(body).toEqual({
                error: 'invalid_grant',
                error_description: code,
            });
        },
    );

    it('answers 400 for organisation_required despite the legacy word match', async () => {
        const { body, status } = await requestToken(
            new OAuth2Server.InvalidGrantError(
                ManagedSignInError.ORGANISATION_REQUIRED,
            ),
        );

        expect(status).toBe(400);
        expect(body).toEqual({
            error: 'invalid_grant',
            error_description: 'organisation_required',
        });
    });

    it('still answers 401 for a legacy message containing required', async () => {
        const { body, status } = await requestToken(
            new OAuth2Server.InvalidRequestError(
                'Missing parameter: `client_id` is required',
            ),
        );

        expect(status).toBe(401);
        expect(body).toMatchObject({ error: 'invalid_request' });
    });

    it('leaves a non-OAuth failure in the shape it had', async () => {
        const { body, status } = await requestToken(new Error('boom'));

        expect(status).toBe(400);
        expect(body).toEqual({ error: 'boom' });
    });

    it('never wraps a token error in the api envelope', async () => {
        const { body } = await requestToken(
            new OAuth2Server.InvalidGrantError(
                ManagedSignInError.TOKEN_REPLAYED,
            ),
        );

        expect(body).not.toHaveProperty('status');
        expect(body).not.toHaveProperty('results');
    });
});

describe('strict OAuth redirects and consent', () => {
    it.each(['success', 'denied', 'invalid_target'] as const)(
        'adds the issuer to %s redirects under strict',
        async (outcome) => {
            const oauthService = createOAuthService();
            oauthService.getSiteUrl.mockReturnValue('https://server.example/');
            oauthService.isSecurityStrict.mockResolvedValue(true);
            oauthService.validateRedirectUri.mockResolvedValue(true);
            if (outcome === 'invalid_target')
                oauthService.authorize.mockRejectedValue(
                    new InvalidTargetError(),
                );
            else
                oauthService.authorize.mockResolvedValue({
                    authorizationCode: 'code',
                } as OAuth2Server.AuthorizationCode);
            const response = await requestAuthorize({
                body: {
                    approve: outcome === 'denied' ? 'false' : 'true',
                    client_id: 'client',
                    redirect_uri: 'https://client.example/callback',
                    state: 'state',
                },
                oauthService,
            });
            const redirect = new URL(getRedirectUrl(response.body));
            const { issuer } = oauthConfig(oauthService.getSiteUrl(), true);
            expect(redirect.searchParams.get('iss')).toBe(
                'https://server.example',
            );
            expect(redirect.searchParams.get('iss')).toBe(issuer);
            expect(
                oauthProtectedResourceConfig(issuer).authorization_servers,
            ).toEqual([issuer]);
            expect(redirect.searchParams.get('state')).toBe('state');
            if (outcome === 'success')
                expect(redirect.searchParams.get('code')).toBe('code');
            else
                expect(redirect.searchParams.get('error')).toBe(
                    outcome === 'denied' ? 'access_denied' : 'invalid_target',
                );
        },
    );
    it.each(['https://server.example', 'https://server.example/'])(
        'preserves flag-off redirects byte for byte for %s',
        async (siteUrl) => {
            const oauthService = createOAuthService();
            oauthService.getSiteUrl.mockReturnValue(siteUrl);
            oauthService.validateRedirectUri.mockResolvedValue(true);
            oauthService.authorize.mockResolvedValue({
                authorizationCode: 'code',
            } as OAuth2Server.AuthorizationCode);
            const response = await requestAuthorize({
                body: {
                    approve: 'true',
                    client_id: 'client',
                    redirect_uri: 'https://client.example/callback',
                },
                oauthService,
            });
            expect(
                new URL(getRedirectUrl(response.body)).searchParams.has('iss'),
            ).toBe(false);
            expect(response.body).toBe(
                generateOAuthRedirectPage({
                    redirectUrl: 'https://client.example/callback?code=code',
                    message: 'Redirecting you back to your application...',
                }),
            );
        },
    );
    it('preserves the canonical resource through the consent form POST', async () => {
        const oauthService = createOAuthService();
        const resource = 'https://eu1.lightdash.cloud/api/v1/mcp';
        oauthService.getAuthorizationResource.mockResolvedValue(resource);
        oauthService.isSecurityStrict.mockResolvedValue(true);
        oauthService.validateRedirectUri.mockResolvedValue(true);
        oauthService.authorize.mockResolvedValue({
            authorizationCode: 'code',
        } as OAuth2Server.AuthorizationCode);
        const page = await requestAuthorizePage({
            query: {
                client_id: 'client',
                redirect_uri: 'https://client.example/callback',
                resource: `${resource}/`,
            },
            oauthService,
        });
        const match = /name="resource" value="([^"]+)"/.exec(page.body);
        expect(match?.[1]).toBe(resource);
        await requestAuthorize({
            body: {
                approve: 'true',
                client_id: 'client',
                redirect_uri: 'https://client.example/callback',
                resource: match![1],
            },
            oauthService,
        });
        expect(oauthService.authorize).toHaveBeenCalledWith(
            expect.objectContaining({
                body: expect.objectContaining({ resource }),
            }),
            expect.anything(),
            expect.anything(),
        );
    });
    it('refuses an invalid resource before showing the consent form', async () => {
        const oauthService = createOAuthService();
        oauthService.getAuthorizationResource.mockRejectedValue(
            new InvalidTargetError(),
        );
        oauthService.isSecurityStrict.mockResolvedValue(true);
        oauthService.validateRedirectUri.mockResolvedValue(true);
        const response = await requestAuthorizePage({
            query: {
                client_id: 'client',
                redirect_uri: 'https://client.example/callback',
                resource: 'https://foreign.example',
            },
            oauthService,
        });
        const redirect = new URL(getRedirectUrl(response.body));
        expect(redirect.searchParams.get('error')).toBe('invalid_target');
        expect(redirect.searchParams.get('iss')).toBe(
            oauthService.getSiteUrl(),
        );
        expect(oauthService.getClientDisplayName).not.toHaveBeenCalled();
    });
    it('returns status 400 for invalid_target token errors', async () => {
        expect(await requestToken(new InvalidTargetError())).toMatchObject({
            status: 400,
            body: { error: 'invalid_target' },
        });
    });
});

it.each(['GET', 'POST'])(
    'forwards %s authorization flag failures to Express',
    async (method) => {
        const oauthService = createOAuthService();
        oauthService.validateRedirectUri.mockResolvedValue(true);
        oauthService.isSecurityStrict.mockRejectedValue(
            new Error('flag lookup failed'),
        );
        const params = {
            client_id: 'client',
            redirect_uri: 'https://client.example/callback',
            approve: 'false',
        };
        const response =
            method === 'GET'
                ? await requestAuthorizePage({ query: params, oauthService })
                : await requestAuthorize({ body: params, oauthService });
        expect(response.status).toBe(500);
    },
);

it.each(['GET', 'POST'])(
    'forwards %s missing-organization redirect flag failures to Express',
    async (method) => {
        const oauthService = createOAuthService();
        oauthService.validateRedirectUri.mockResolvedValue(true);
        oauthService.isSecurityStrict.mockRejectedValue(
            new Error('flag lookup failed'),
        );
        const params = {
            client_id: 'client',
            redirect_uri: 'https://client.example/callback',
        };
        const response =
            method === 'GET'
                ? await requestAuthorizePage({
                      query: params,
                      oauthService,
                      user: userWithoutOrganization,
                  })
                : await requestAuthorize({
                      body: params,
                      oauthService,
                      user: userWithoutOrganization,
                  });
        expect(response.status).toBe(500);
    },
);

it('forwards flag failures from the authorization error redirect to Express', async () => {
    const oauthService = createOAuthService();
    oauthService.validateRedirectUri.mockResolvedValue(true);
    oauthService.authorize.mockRejectedValue(new Error('authorization failed'));
    oauthService.isSecurityStrict.mockRejectedValue(
        new Error('flag lookup failed'),
    );
    const response = await requestAuthorize({
        body: {
            client_id: 'client',
            redirect_uri: 'https://client.example/callback',
            approve: 'true',
        },
        oauthService,
    });
    expect(response.status).toBe(500);
});

it('forwards flag failures while sending an authorization page error redirect', async () => {
    const oauthService = createOAuthService();
    oauthService.validateRedirectUri.mockResolvedValue(true);
    oauthService.getAuthorizationResource.mockRejectedValue(
        new InvalidTargetError(),
    );
    oauthService.isSecurityStrict
        .mockResolvedValueOnce(false)
        .mockRejectedValue(new Error('flag lookup failed'));
    const response = await requestAuthorizePage({
        query: {
            client_id: 'client',
            redirect_uri: 'https://client.example/callback',
        },
        oauthService,
    });
    expect(response.status).toBe(500);
});

it('forwards flag failures while sending an authorization POST error redirect', async () => {
    const oauthService = createOAuthService();
    oauthService.validateRedirectUri.mockResolvedValue(true);
    oauthService.authorize.mockRejectedValue(new Error('authorization failed'));
    oauthService.isSecurityStrict
        .mockResolvedValueOnce(false)
        .mockRejectedValue(new Error('flag lookup failed'));
    const response = await requestAuthorize({
        body: {
            client_id: 'client',
            redirect_uri: 'https://client.example/callback',
            approve: 'true',
        },
        oauthService,
    });
    expect(response.status).toBe(500);
});
