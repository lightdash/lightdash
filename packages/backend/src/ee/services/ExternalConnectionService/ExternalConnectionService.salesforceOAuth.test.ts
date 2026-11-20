import {
    ApiConnectorType,
    ForbiddenError,
    MissingConfigError,
    ParameterError,
    WarehouseConnectionError,
    type ExternalConnection,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import * as secureFetchModule from '../../../utils/secureFetch/secureFetch';
import {
    ExternalConnectionService,
    type SalesforceOAuthSession,
} from './ExternalConnectionService';
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
const ORG = 'https://acme.my.salesforce.com';
const account = buildAccount();

const jsonResponse = (status: number, body: unknown) => ({
    status,
    contentType: 'application/json',
    headers: {},
    bodyText: JSON.stringify(body),
    truncated: false,
});

const existingConnection = {
    externalConnectionUuid: 'conn-1',
    projectUuid: 'proj-1',
    name: 'Pipeline',
    kind: 'live_source',
    origin: ORG,
    apiSource: {
        connector: ApiConnectorType.SALESFORCE,
        object: 'Opportunity',
    },
} as ExternalConnection;

const buildService = ({
    clientId = 'client-1',
    tokenResponse = {
        access_token: 'sf_token',
        refresh_token: 'sf_refresh',
        instance_url: ORG,
        token_type: 'Bearer',
        id: 'https://login.salesforce.com/id/00D/005',
        issued_at: '1763560000000',
    } as Record<string, unknown>,
    canManage = true,
}: {
    clientId?: string | null;
    tokenResponse?: Record<string, unknown>;
    canManage?: boolean;
} = {}) => {
    const externalConnectionModel = {
        listHeldLiveSourceNames: vi.fn(async () => new Set<string>()),
        claimLiveSourceName: vi.fn(
            async (_project: string, _uuid: string, names: string[]) =>
                names[0],
        ),
        findByUuid: vi.fn().mockResolvedValue(existingConnection),
        getProjectOrganizationUuid: vi.fn().mockResolvedValue('org-1'),
        create: vi.fn(async () => existingConnection),
        update: vi.fn(async () => existingConnection),
        setApiSourceSchema: vi.fn().mockResolvedValue(undefined),
    };
    const fetchToken = vi.fn().mockResolvedValue({
        status: 200,
        contentType: 'application/json',
        headers: {},
        bodyText: JSON.stringify(tokenResponse),
        truncated: false,
    });
    const service = new ExternalConnectionService({
        projectModel: {
            replaceApiSourceExplores: vi.fn(),
            deleteApiSourceExplores: vi.fn(),
            findExploreNamesTakenByOthers: vi.fn(async () => []),
        },
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
            auth: { google: {} },
            liveSources: {
                posthog: {},
                linkedinAds: {},
                salesforce: {
                    oauthClientId: clientId ?? undefined,
                    oauthClientSecret: clientId ? 'secret-1' : undefined,
                },
            },
        },
    } as never);
    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => canManage, cannot: () => !canManage });
    return { service, externalConnectionModel, fetchToken };
};

const SESSION: SalesforceOAuthSession = {
    projectUuid: 'proj-1',
    name: 'Pipeline',
    object: 'Opportunity',
    connectionUuid: null,
    clientId: 'client-1',
    redirectUri: `${SITE_URL}/api/v1/ee/salesforce/oauth/callback`,
    codeVerifier: 'verifier-1',
};

const start = (
    service: ExternalConnectionService,
    overrides: {
        object?: string;
        connectionUuid?: string | null;
    } = {},
) =>
    service.startSalesforceOAuth(account, 'proj-1', {
        name: ' Pipeline ',
        object: 'Opportunity',
        connectionUuid: null,
        ...overrides,
    });

beforeEach(() => {
    mockSecureFetch.mockReset();
    mockSecureFetch.mockResolvedValue(jsonResponse(200, { fields: [] }));
});

describe('Salesforce sign-in', () => {
    it('is unavailable until the server has a Connected App', async () => {
        await expect(
            start(buildService({ clientId: null }).service),
        ).rejects.toThrow(MissingConfigError);
    });

    it('signs in at login.salesforce.com with PKCE', async () => {
        const { authorizeUrl, session, state } = await start(
            buildService().service,
        );
        const url = new URL(authorizeUrl);
        expect(url.origin + url.pathname).toBe(
            'https://login.salesforce.com/services/oauth2/authorize',
        );
        expect(url.searchParams.get('scope')).toBe('api refresh_token');
        expect(url.searchParams.get('state')).toBe(state);
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        expect(url.searchParams.get('redirect_uri')).toBe(SESSION.redirectUri);
        expect(session).toMatchObject({
            name: 'Pipeline',
            object: 'Opportunity',
        });
    });

    it('refuses to start for a user who cannot manage live data sources', async () => {
        await expect(
            start(buildService({ canManage: false }).service),
        ).rejects.toThrow(ForbiddenError);
    });

    it('refuses to finish for a user who cannot manage live data sources, before exchanging the code', async () => {
        const { service, fetchToken, externalConnectionModel } = buildService({
            canManage: false,
        });
        await expect(
            service.completeSalesforceOAuth(account, SESSION, 'the-code'),
        ).rejects.toThrow(ForbiddenError);
        expect(fetchToken).not.toHaveBeenCalled();
        expect(externalConnectionModel.create).not.toHaveBeenCalled();
    });

    it('refuses an object it does not read', async () => {
        await expect(
            start(buildService().service, { object: 'User' }),
        ).rejects.toThrow(ParameterError);
    });

    it('refuses to point a reconnect at another object', async () => {
        await expect(
            start(buildService().service, {
                object: 'Lead',
                connectionUuid: 'conn-1',
            }),
        ).rejects.toThrow('different Salesforce object');
    });

    it("stores the sign-in on the org's own My Domain once the user can read the object", async () => {
        const { service, externalConnectionModel, fetchToken } = buildService();
        await service.completeSalesforceOAuth(account, SESSION, 'the-code');

        const [tokenUrl, tokenOptions] = fetchToken.mock.calls[0];
        expect(tokenUrl).toBe(
            'https://login.salesforce.com/services/oauth2/token',
        );
        const tokenBody = new URLSearchParams(tokenOptions.body as string);
        expect(tokenBody.get('client_secret')).toBe('secret-1');
        expect(tokenBody.get('code_verifier')).toBe('verifier-1');

        const [checkUrl, checkOptions] = mockSecureFetch.mock.calls[0];
        expect(checkUrl).toBe(
            `${ORG}/services/data/v62.0/sobjects/Opportunity/describe`,
        );
        expect(checkOptions.headers).toMatchObject({
            Authorization: 'Bearer sf_token',
        });

        const [, , , created] = externalConnectionModel.create.mock
            .calls[0] as unknown as [
            string,
            string,
            string,
            Record<string, unknown>,
        ];
        expect(created).toMatchObject({
            type: 'oauth_authorization_code',
            origin: ORG,
            oauthTokenUrl: 'https://login.salesforce.com/services/oauth2/token',
            allowedMethods: ['GET'],
            allowedPathPrefixes: [
                '/services/data/v62.0/query',
                '/services/data/v62.0/sobjects/Opportunity/describe',
                '/services/data/v62.0/limits',
            ],
            apiSource: {
                connector: ApiConnectorType.SALESFORCE,
                object: 'Opportunity',
            },
        });
        expect(JSON.parse(created.secret as string)).toMatchObject({
            accessToken: 'sf_token',
            refreshToken: 'sf_refresh',
        });
    });

    it.each([
        [
            'an instance off salesforce.com',
            { instance_url: 'https://evil.example.com' },
        ],
        ['no instance', { instance_url: undefined }],
        ['no refresh token', { refresh_token: undefined }],
    ])('saves nothing for a token with %s', async (_, override) => {
        const { service, externalConnectionModel } = buildService({
            tokenResponse: {
                access_token: 'sf_token',
                refresh_token: 'sf_refresh',
                instance_url: ORG,
                ...override,
            },
        });
        await expect(
            service.completeSalesforceOAuth(account, SESSION, 'the-code'),
        ).rejects.toThrow(WarehouseConnectionError);
        expect(mockSecureFetch).not.toHaveBeenCalled();
        expect(externalConnectionModel.create).not.toHaveBeenCalled();
    });

    it('refuses a reconnect signed in to another org', async () => {
        const { service, externalConnectionModel } = buildService({
            tokenResponse: {
                access_token: 'sf_token',
                refresh_token: 'sf_refresh',
                instance_url: 'https://other.my.salesforce.com',
            },
        });
        await expect(
            service.completeSalesforceOAuth(
                account,
                { ...SESSION, connectionUuid: 'conn-1' },
                'the-code',
            ),
        ).rejects.toThrow('same Salesforce org');
        expect(externalConnectionModel.update).not.toHaveBeenCalled();
    });

    it.each([403, 404])(
        'saves nothing when the object check returns %s',
        async (status) => {
            mockSecureFetch.mockResolvedValue(jsonResponse(status, []));
            const { service, externalConnectionModel } = buildService();
            await expect(
                service.completeSalesforceOAuth(account, SESSION, 'the-code'),
            ).rejects.toThrow(WarehouseConnectionError);
            expect(externalConnectionModel.create).not.toHaveBeenCalled();
        },
    );
});
