import {
    ApiConnectorType,
    MissingConfigError,
    ParameterError,
    WarehouseConnectionError,
    type ExternalConnection,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { buildAccount } from '../../../auth/account/account.mock';
import * as secureFetchModule from '../../../utils/secureFetch/secureFetch';
import { ExternalConnectionService } from './ExternalConnectionService';
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
const TOKEN_URL = 'https://us.posthog.com/oauth/token/';
const HOUR = 3_600_000;

const jsonResponse = (status: number, body: unknown) => ({
    status,
    contentType: 'application/json',
    headers: {},
    bodyText: JSON.stringify(body),
    truncated: false,
});

const queryResponse = jsonResponse(200, {
    columns: ['a'],
    types: [['a', 'UInt8']],
    results: [[1]],
    error: null,
});

const signedInConnection = (
    overrides: Partial<ExternalConnection> = {},
): ExternalConnection =>
    ({
        externalConnectionUuid: 'conn-1',
        projectUuid: 'proj-1',
        organizationUuid: 'org-1',
        name: 'PostHog',
        slug: 'posthog',
        type: 'oauth_authorization_code',
        origin: 'https://us.posthog.com',
        instructions: null,
        allowedPathPrefixes: ['/api/projects/7/query/'],
        allowedMethods: ['POST'],
        allowedContentTypes: ['application/json'],
        responseMaxBytes: 25 * 1024 * 1024,
        requestMaxBytes: 262_144,
        timeoutMs: 45_000,
        rateLimitPerMinute: null,
        apiKeyName: null,
        apiKeyLocation: null,
        oauthScopes: null,
        oauthTokenUrl: TOKEN_URL,
        oauthClientId: 'client-1',
        oauthClientAuthMethod: null,
        customHeaders: null,
        kind: 'live_source',
        apiSource: { connector: ApiConnectorType.POSTHOG, projectId: '7' },
        hasSecret: true,
        createdByUserUuid: 'user-1',
        updatedByUserUuid: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }) as ExternalConnection;

const storedTokens = (accessToken: string, expiresAt: number | null) =>
    JSON.stringify({ accessToken, refreshToken: 'phr_1', expiresAt });

const account = buildAccount();

const buildService = ({
    clientId = 'client-1',
    secret = storedTokens('pha_fresh', Date.now() + HOUR),
}: { clientId?: string | null; secret?: string } = {}) => {
    let storedSecret: string | null = secret;
    const connection = signedInConnection();
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
        create: vi.fn(async () => connection),
        update: vi.fn(async () => connection),
    };
    const fetchToken = vi.fn();
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
        lightdashConfig: {
            siteUrl: SITE_URL,
            liveSources: {
                posthog: {
                    oauthClientId: clientId ?? undefined,
                    oauthClientSecret: undefined,
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

const runQuery = async (service: ExternalConnectionService) => {
    const connector = await service.getApiConnector(
        account,
        'proj-1',
        'conn-1',
    );
    return connector.execute({
        payload: { kind: 'query', query: 'SELECT 1 AS a' },
        limit: 10,
    });
};

beforeEach(() => {
    mockSecureFetch.mockReset();
    mockSecureFetch.mockResolvedValue(queryResponse);
});

describe('PostHog sign-in', () => {
    it('is unavailable until the server has a client ID', async () => {
        const { service } = buildService({ clientId: null });
        await expect(
            service.startPostHogOAuth(account, 'proj-1', {
                region: 'us',
                name: 'PostHog',
                connectionUuid: null,
            }),
        ).rejects.toBeInstanceOf(MissingConfigError);
        expect(service.getPostHogClientMetadata()).toBeNull();
    });

    it('asks for one project with read-only query access, bound to a PKCE verifier', async () => {
        const { service } = buildService();
        const { authorizeUrl, state, session } =
            await service.startPostHogOAuth(account, 'proj-1', {
                region: 'eu',
                name: ' Product ',
                connectionUuid: null,
            });

        const url = new URL(authorizeUrl);
        expect(url.origin + url.pathname).toBe(
            'https://eu.posthog.com/oauth/authorize/',
        );
        expect(Object.fromEntries(url.searchParams)).toEqual({
            response_type: 'code',
            client_id: 'client-1',
            redirect_uri: `${SITE_URL}/api/v1/ee/posthog/oauth/callback`,
            scope: 'query:read',
            state,
            code_challenge: createHash('sha256')
                .update(session.codeVerifier)
                .digest('base64url'),
            code_challenge_method: 'S256',
            required_access_level: 'project',
        });
        expect(session).toEqual(
            expect.objectContaining({
                projectUuid: 'proj-1',
                region: 'eu',
                name: 'Product',
                connectionUuid: null,
            }),
        );
    });

    it('creates a signed-in source for the project the user picked', async () => {
        const { service, externalConnectionModel, fetchToken } = buildService();
        fetchToken.mockResolvedValue(
            jsonResponse(200, {
                access_token: 'pha_1',
                refresh_token: 'phr_1',
                expires_in: 36000,
                scoped_teams: [7],
            }),
        );
        const { session } = await service.startPostHogOAuth(account, 'proj-1', {
            region: 'us',
            name: 'PostHog',
            connectionUuid: null,
        });

        await service.completePostHogOAuth(account, session, 'code-1');

        expect(fetchToken.mock.calls[0][0]).toBe(TOKEN_URL);
        const [, , , config] = externalConnectionModel.create.mock
            .calls[0] as unknown as [string, string, string, never];
        expect(config).toEqual(
            expect.objectContaining({
                type: 'oauth_authorization_code',
                origin: 'https://us.posthog.com',
                apiSource: {
                    connector: ApiConnectorType.POSTHOG,
                    projectId: '7',
                },
                oauthTokenUrl: TOKEN_URL,
                oauthClientId: 'client-1',
                allowedPathPrefixes: ['/api/projects/7/query/'],
                allowedMethods: ['POST'],
            }),
        );
        expect(JSON.parse((config as { secret: string }).secret)).toEqual(
            expect.objectContaining({
                accessToken: 'pha_1',
                refreshToken: 'phr_1',
            }),
        );
    });

    it('refuses a grant that covers more than one project', async () => {
        const { service, fetchToken } = buildService();
        fetchToken.mockResolvedValue(
            jsonResponse(200, { access_token: 'pha_1', scoped_teams: [7, 8] }),
        );
        const { session } = await service.startPostHogOAuth(account, 'proj-1', {
            region: 'us',
            name: 'PostHog',
            connectionUuid: null,
        });
        await expect(
            service.completePostHogOAuth(account, session, 'code-1'),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('keeps signed-in sources out of the create API', async () => {
        const { service } = buildService();
        await expect(
            service.create(account, 'proj-1', {
                name: 'PostHog',
                type: 'oauth_authorization_code',
                origin: 'https://us.posthog.com',
                secret: storedTokens('pha_forged', null),
                apiSource: {
                    connector: ApiConnectorType.POSTHOG,
                    projectId: '7',
                },
                allowedPathPrefixes: [],
                allowedMethods: ['POST'],
                allowedContentTypes: [],
            }),
        ).rejects.toThrow(/by signing in/);
    });
});

describe('querying a signed-in PostHog source', () => {
    it('sends the stored access token while it is fresh', async () => {
        const { service, fetchToken } = buildService();
        await runQuery(service);
        expect(fetchToken).not.toHaveBeenCalled();
        expect(mockSecureFetch.mock.calls[0][1].headers?.Authorization).toBe(
            'Bearer pha_fresh',
        );
    });

    it('refreshes an expired token under the lock and stores the rotated pair', async () => {
        const {
            service,
            fetchToken,
            externalConnectionModel,
            getStoredSecret,
        } = buildService({ secret: storedTokens('pha_old', Date.now() - 1) });
        fetchToken.mockResolvedValue(
            jsonResponse(200, {
                access_token: 'pha_new',
                refresh_token: 'phr_2',
                expires_in: 36000,
            }),
        );

        await runQuery(service);

        expect(externalConnectionModel.updateSecretLocked).toHaveBeenCalled();
        expect(
            new URLSearchParams(fetchToken.mock.calls[0][1].body).get(
                'refresh_token',
            ),
        ).toBe('phr_1');
        expect(mockSecureFetch.mock.calls[0][1].headers?.Authorization).toBe(
            'Bearer pha_new',
        );
        expect(JSON.parse(getStoredSecret()!)).toEqual(
            expect.objectContaining({
                accessToken: 'pha_new',
                refreshToken: 'phr_2',
            }),
        );
    });

    it('refreshes once and replays when PostHog rejects a token early', async () => {
        const { service, fetchToken } = buildService();
        fetchToken.mockResolvedValue(
            jsonResponse(200, { access_token: 'pha_new', expires_in: 36000 }),
        );
        mockSecureFetch
            .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
            .mockResolvedValueOnce(queryResponse);

        await runQuery(service);

        expect(fetchToken).toHaveBeenCalledTimes(1);
        expect(mockSecureFetch.mock.calls[1][1].headers?.Authorization).toBe(
            'Bearer pha_new',
        );
    });

    it('asks to reconnect once access is revoked', async () => {
        const { service, fetchToken } = buildService({
            secret: storedTokens('pha_old', Date.now() - 1),
        });
        fetchToken.mockResolvedValue(
            jsonResponse(400, { error: 'invalid_grant' }),
        );

        const query = runQuery(service);
        await expect(query).rejects.toBeInstanceOf(WarehouseConnectionError);
        await expect(query).rejects.toThrow(
            /Reconnect it in Live data sources/,
        );
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });
});
