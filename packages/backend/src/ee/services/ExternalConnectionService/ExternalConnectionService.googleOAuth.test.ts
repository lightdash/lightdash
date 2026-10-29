import {
    ApiConnectorType,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    WarehouseConnectionError,
    type CreateExternalConnection,
    type ExternalConnection,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { buildAccount } from '../../../auth/account/account.mock';
import * as secureFetchModule from '../../../utils/secureFetch/secureFetch';
import { ExternalConnectionService } from './ExternalConnectionService';
import { GOOGLE_TOKEN_URL } from './googleOAuth';
import { OAuthAuthorizationCodeTokenClient } from './OAuthAuthorizationCodeTokenClient';

vi.mock('../../../utils/secureFetch/secureFetch', async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import('../../../utils/secureFetch/secureFetch')
        >();
    return { ...actual, secureFetch: vi.fn() };
});

const mockSecureFetch = vi.mocked(secureFetchModule.secureFetch);
const SITE_URL = 'https://lightdash.example.com';
const HOUR = 3_600_000;

const jsonResponse = (status: number, body: unknown) => ({
    status,
    contentType: 'application/json',
    headers: {},
    bodyText: JSON.stringify(body),
    truncated: false,
});

const sitesResponse = (...sites: [string, string][]) =>
    jsonResponse(200, {
        siteEntry: sites.map(([siteUrl, permissionLevel]) => ({
            siteUrl,
            permissionLevel,
        })),
    });

const tokenResponse = jsonResponse(200, {
    access_token: 'google-access-fresh',
    refresh_token: '1//refresh',
    expires_in: 3599,
    token_type: 'Bearer',
});

const searchConsoleConnection = (
    overrides: Partial<ExternalConnection> = {},
): ExternalConnection =>
    ({
        externalConnectionUuid: 'conn-1',
        projectUuid: 'proj-1',
        organizationUuid: 'org-1',
        name: 'Search Console',
        slug: 'search-console',
        type: 'oauth_authorization_code',
        origin: 'https://searchconsole.googleapis.com',
        instructions: null,
        allowedPathPrefixes: ['/webmasters/v3/sites/'],
        allowedMethods: ['POST'],
        allowedContentTypes: ['application/json'],
        responseMaxBytes: 25 * 1024 * 1024,
        requestMaxBytes: 262_144,
        timeoutMs: 30_000,
        allowBrowserImages: false,
        allowDataAppBuilderLinking: false,
        forwardUserIdentity: false,
        rateLimitPerMinute: null,
        apiKeyName: null,
        apiKeyLocation: null,
        oauthScopes: null,
        oauthTokenUrl: GOOGLE_TOKEN_URL,
        oauthClientId: 'google-client',
        oauthClientAuthMethod: null,
        customHeaders: null,
        kind: 'live_source',
        apiSource: {
            connector: ApiConnectorType.SEARCH_CONSOLE,
            siteUrl: 'https://lightdash.com/',
        },
        hasSecret: true,
        createdByUserUuid: 'user-1',
        updatedByUserUuid: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }) as ExternalConnection;

const account = buildAccount();

const buildService = ({
    googleClient = true,
    secret = JSON.stringify({
        accessToken: 'google-access-stale',
        refreshToken: '1//refresh',
        expiresAt: Date.now() - HOUR,
    }),
}: { googleClient?: boolean; secret?: string } = {}) => {
    let storedSecret: string | null = secret;
    const connection = searchConsoleConnection();
    const externalConnectionModel = {
        findByUuid: vi.fn().mockResolvedValue(connection),
        getProjectOrganizationUuid: vi.fn().mockResolvedValue('org-1'),
        getDecryptedSecret: vi.fn(async () => storedSecret),
        updateSecretLocked: vi.fn(
            async (
                _uuid: string,
                update: (current: string | null) => Promise<string | null>,
            ) => {
                const next = await update(storedSecret);
                if (next !== null) storedSecret = next;
                return storedSecret;
            },
        ),
        create: vi.fn(
            async (
                _projectUuid: string,
                _organizationUuid: string,
                _userUuid: string,
                config: CreateExternalConnection,
            ) => searchConsoleConnection({ apiSource: config.apiSource }),
        ),
        update: vi.fn(async () => connection),
        tryAcquireApiSourceCallLease: vi.fn().mockResolvedValue(true),
        tryCountApiSourceCall: vi.fn().mockResolvedValue(true),
        releaseApiSourceCallLease: vi.fn().mockResolvedValue(undefined),
    };
    const fetchToken = vi.fn().mockResolvedValue(tokenResponse);
    const service = new ExternalConnectionService({
        allowedPrivateHostCidrs: {},
        externalConnectionModel,
        analytics: { track: vi.fn() },
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        oauthAuthorizationCodeTokenClient:
            new OAuthAuthorizationCodeTokenClient({
                allowedPrivateHostCidrs: {},
                fetchToken,
            }),
        encryptionUtil: {
            encrypt: (message: string) => Buffer.from(`sealed:${message}`),
            decrypt: (sealed: Buffer) =>
                sealed.toString().replace(/^sealed:/, ''),
        },
        lightdashConfig: {
            siteUrl: SITE_URL,
            liveSources: {
                posthog: {
                    oauthClientId: undefined,
                    oauthClientSecret: undefined,
                },
            },
            auth: {
                google: {
                    oauth2ClientId: googleClient ? 'google-client' : undefined,
                    oauth2ClientSecret: googleClient
                        ? 'google-secret'
                        : undefined,
                    callbackPath: '/oauth/redirect/google',
                },
            },
        },
    } as never);
    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => true, cannot: () => false });
    return {
        service,
        externalConnectionModel,
        fetchToken,
        getStoredSecret: () => storedSecret,
    };
};

const session = (connectionUuid: string | null = null) => ({
    projectUuid: 'proj-1',
    connector: ApiConnectorType.SEARCH_CONSOLE as const,
    name: 'Search Console',
    connectionUuid,
    redirectUri: `${SITE_URL}/api/v1/oauth/redirect/google`,
    codeVerifier: 'verifier-1',
});

beforeEach(() => {
    mockSecureFetch.mockReset();
});

describe('Google sign-in for live sources', () => {
    it('is unavailable until the server has a Google client', async () => {
        const { service } = buildService({ googleClient: false });
        await expect(
            service.startGoogleOAuth(account, 'proj-1', {
                connector: ApiConnectorType.SEARCH_CONSOLE,
                name: 'Search Console',
                connectionUuid: null,
            }),
        ).rejects.toBeInstanceOf(MissingConfigError);
    });

    it('asks for offline read-only access on the existing Google redirect, bound to a PKCE verifier', async () => {
        const { service } = buildService();
        const {
            authorizeUrl,
            state,
            session: started,
        } = await service.startGoogleOAuth(account, 'proj-1', {
            connector: ApiConnectorType.SEARCH_CONSOLE,
            name: ' Search Console ',
            connectionUuid: null,
        });

        const params = new URL(authorizeUrl).searchParams;
        expect(authorizeUrl).toMatch(
            /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/,
        );
        expect(Object.fromEntries(params)).toMatchObject({
            client_id: 'google-client',
            redirect_uri: `${SITE_URL}/api/v1/oauth/redirect/google`,
            scope: 'https://www.googleapis.com/auth/webmasters.readonly',
            state,
            access_type: 'offline',
            prompt: 'consent',
            code_challenge_method: 'S256',
            code_challenge: createHash('sha256')
                .update(started.codeVerifier)
                .digest('base64url'),
        });
        expect(started.name).toBe('Search Console');
    });

    it('refuses connectors that are not Google sources', async () => {
        const { service } = buildService();
        await expect(
            service.startGoogleOAuth(account, 'proj-1', {
                connector: ApiConnectorType.POSTHOG,
                name: 'PostHog',
                connectionUuid: null,
            }),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('saves the source straight away when the account can read one site', async () => {
        const { service, externalConnectionModel, fetchToken } = buildService();
        mockSecureFetch.mockResolvedValueOnce(
            sitesResponse(
                ['sc-domain:lightdash.com', 'siteOwner'],
                ['https://other.example/', 'siteUnverifiedUser'],
            ),
        );

        const result = await service.completeGoogleOAuth(
            account,
            session(),
            'code-1',
        );

        expect('connection' in result).toBe(true);
        expect(
            Object.fromEntries(
                new URLSearchParams(fetchToken.mock.calls[0][1].body),
            ),
        ).toMatchObject({
            grant_type: 'authorization_code',
            code: 'code-1',
            code_verifier: 'verifier-1',
            client_id: 'google-client',
            client_secret: 'google-secret',
        });
        const [, , , config] = externalConnectionModel.create.mock.calls[0];
        expect(config).toMatchObject({
            type: 'oauth_authorization_code',
            origin: 'https://searchconsole.googleapis.com',
            oauthTokenUrl: GOOGLE_TOKEN_URL,
            oauthClientId: 'google-client',
            apiSource: {
                connector: ApiConnectorType.SEARCH_CONSOLE,
                siteUrl: 'sc-domain:lightdash.com',
            },
            allowedPathPrefixes: ['/webmasters/v3/sites/'],
            allowedMethods: ['POST'],
        });
        expect(JSON.parse(config.secret ?? '')).toMatchObject({
            accessToken: 'google-access-fresh',
            refreshToken: '1//refresh',
        });
    });

    it('holds a sign-in that can read several sites until the admin picks one', async () => {
        const { service, externalConnectionModel } = buildService();
        mockSecureFetch.mockResolvedValueOnce(
            sitesResponse(
                ['https://lightdash.com/', 'siteFullUser'],
                ['sc-domain:lightdash.com', 'siteOwner'],
            ),
        );

        const result = await service.completeGoogleOAuth(
            account,
            session(),
            'code-1',
        );
        if (!('pending' in result))
            throw new Error('Expected a pending sign-in');
        expect(result.pending.encryptedTokens).not.toContain(
            'google-access-fresh',
        );
        expect(externalConnectionModel.create).not.toHaveBeenCalled();

        await expect(
            service.getPendingGoogleChoice(account, 'proj-1', result.pending),
        ).resolves.toEqual({
            connector: ApiConnectorType.SEARCH_CONSOLE,
            name: 'Search Console',
            choices: [
                {
                    value: 'https://lightdash.com/',
                    label: 'https://lightdash.com/',
                    description: 'Full user',
                },
                {
                    value: 'sc-domain:lightdash.com',
                    label: 'sc-domain:lightdash.com',
                    description: 'Owner',
                },
            ],
        });
        await expect(
            service.finishGoogleOAuth(
                account,
                'proj-1',
                result.pending,
                'sc-domain:elsewhere.com',
            ),
        ).rejects.toThrow('Pick one of the listed options');

        await service.finishGoogleOAuth(
            account,
            'proj-1',
            result.pending,
            'sc-domain:lightdash.com',
        );
        const [, , , config] = externalConnectionModel.create.mock.calls[0];
        expect(config.apiSource).toEqual({
            connector: ApiConnectorType.SEARCH_CONSOLE,
            siteUrl: 'sc-domain:lightdash.com',
        });
        expect(JSON.parse(config.secret ?? '').accessToken).toBe(
            'google-access-fresh',
        );
    });

    it('only finishes a pending sign-in for the project that started it', async () => {
        const { service } = buildService();
        await expect(
            service.finishGoogleOAuth(account, 'proj-1', undefined, 'x'),
        ).rejects.toBeInstanceOf(NotFoundError);
        await expect(
            service.getPendingGoogleChoice(account, 'proj-2', {
                projectUuid: 'proj-1',
                connector: ApiConnectorType.SEARCH_CONSOLE,
                name: 'Search Console',
                encryptedTokens: '',
                choices: [],
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('reconnects only an account that can still read the same site', async () => {
        const { service, externalConnectionModel } = buildService();
        mockSecureFetch.mockResolvedValueOnce(
            sitesResponse(['https://lightdash.com/', 'siteOwner']),
        );
        await service.completeGoogleOAuth(account, session('conn-1'), 'code-1');
        expect(externalConnectionModel.update).toHaveBeenCalledWith(
            'conn-1',
            account.user.id,
            expect.objectContaining({
                apiSource: {
                    connector: ApiConnectorType.SEARCH_CONSOLE,
                    siteUrl: 'https://lightdash.com/',
                },
            }),
        );

        mockSecureFetch.mockResolvedValueOnce(
            sitesResponse(['sc-domain:other.example', 'siteOwner']),
        );
        await expect(
            service.completeGoogleOAuth(account, session('conn-1'), 'code-2'),
        ).rejects.toThrow(
            'This Google account cannot read https://lightdash.com/ in Search Console',
        );
    });

    it('refuses a sign-in without offline access', async () => {
        const { service, fetchToken } = buildService();
        fetchToken.mockResolvedValueOnce(
            jsonResponse(200, {
                access_token: 'google-access-fresh',
                expires_in: 3599,
            }),
        );
        await expect(
            service.completeGoogleOAuth(account, session(), 'code-1'),
        ).rejects.toBeInstanceOf(WarehouseConnectionError);
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });

    it('refreshes an expired sign-in with the Google client secret before querying', async () => {
        const { service, fetchToken, getStoredSecret } = buildService();
        mockSecureFetch.mockResolvedValueOnce(
            jsonResponse(200, {
                rows: [{ clicks: 1, impressions: 2, ctr: 0.5, position: 1 }],
            }),
        );

        const connector = await service.getApiConnector(
            account,
            'proj-1',
            'conn-1',
        );
        const result = await connector.execute({
            payload: {
                kind: 'query',
                query: JSON.stringify({
                    startDate: '2026-10-01',
                    endDate: '2026-10-28',
                }),
            },
            limit: 10,
        });

        expect(result.rows).toHaveLength(1);
        expect(
            Object.fromEntries(
                new URLSearchParams(fetchToken.mock.calls[0][1].body),
            ),
        ).toMatchObject({
            grant_type: 'refresh_token',
            refresh_token: '1//refresh',
            client_secret: 'google-secret',
        });
        const [url, init] = mockSecureFetch.mock.calls[0];
        expect(url).toBe(
            'https://searchconsole.googleapis.com/webmasters/v3/sites/https%3A%2F%2Flightdash.com%2F/searchAnalytics/query',
        );
        expect(init.headers?.Authorization).toBe('Bearer google-access-fresh');
        expect(JSON.parse(getStoredSecret() ?? '{}').accessToken).toBe(
            'google-access-fresh',
        );
    });
});
