import {
    ApiConnectorType,
    MissingConfigError,
    ParameterError,
    WarehouseConnectionError,
    type ExternalConnection,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import * as secureFetchModule from '../../../utils/secureFetch/secureFetch';
import {
    ExternalConnectionService,
    type LinkedInAdsOAuthSession,
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
const ACCOUNT_ID = '507404993';
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
    name: 'LinkedIn Ads',
    kind: 'live_source',
    apiSource: {
        connector: ApiConnectorType.LINKEDIN_ADS,
        adAccountId: ACCOUNT_ID,
    },
} as ExternalConnection;

const buildService = ({
    clientId = 'client-1',
}: { clientId?: string | null } = {}) => {
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
        bodyText: JSON.stringify({
            access_token: 'li_token',
            expires_in: 5_184_000,
        }),
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
                linkedinAds: {
                    oauthClientId: clientId ?? undefined,
                    oauthClientSecret: clientId ? 'secret-1' : undefined,
                },
            },
        },
    } as never);
    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => true, cannot: () => false });
    return { service, externalConnectionModel, fetchToken };
};

const SESSION: LinkedInAdsOAuthSession = {
    projectUuid: 'proj-1',
    name: 'LinkedIn Ads',
    adAccountId: ACCOUNT_ID,
    connectionUuid: null,
    clientId: 'client-1',
    redirectUri: `${SITE_URL}/api/v1/ee/linkedin/oauth/callback`,
};

const start = (
    service: ExternalConnectionService,
    overrides: { adAccountId?: string; connectionUuid?: string | null } = {},
) =>
    service.startLinkedInAdsOAuth(account, 'proj-1', {
        name: ' LinkedIn Ads ',
        adAccountId: ACCOUNT_ID,
        connectionUuid: null,
        ...overrides,
    });

beforeEach(() => {
    mockSecureFetch.mockReset();
    mockSecureFetch.mockResolvedValue(jsonResponse(200, { id: 507404993 }));
});

describe('LinkedIn Ads sign-in', () => {
    it('is unavailable until the server has a client', async () => {
        await expect(
            start(buildService({ clientId: null }).service),
        ).rejects.toThrow(MissingConfigError);
    });

    it('asks only for read access', async () => {
        const { authorizeUrl, session, state } = await start(
            buildService().service,
        );
        const url = new URL(authorizeUrl);
        expect(url.origin + url.pathname).toBe(
            'https://www.linkedin.com/oauth/v2/authorization',
        );
        expect(url.searchParams.get('scope')).toBe('r_ads r_ads_reporting');
        expect(url.searchParams.get('state')).toBe(state);
        expect(url.searchParams.get('redirect_uri')).toBe(SESSION.redirectUri);
        expect(session).toMatchObject({
            name: 'LinkedIn Ads',
            adAccountId: ACCOUNT_ID,
        });
    });

    it('refuses an ad account that is not a number', async () => {
        await expect(
            start(buildService().service, { adAccountId: 'urn:li:1' }),
        ).rejects.toThrow(ParameterError);
    });

    it('refuses to point a reconnect at another ad account', async () => {
        await expect(
            start(buildService().service, {
                adAccountId: '1',
                connectionUuid: 'conn-1',
            }),
        ).rejects.toThrow('different LinkedIn ad account');
    });

    it('stores the sign-in once the member can read the account', async () => {
        const { service, externalConnectionModel, fetchToken } = buildService();
        await service.completeLinkedInAdsOAuth(account, SESSION, 'the-code');

        const tokenBody = new URLSearchParams(
            fetchToken.mock.calls[0][1].body as string,
        );
        expect(tokenBody.get('client_secret')).toBe('secret-1');
        expect(tokenBody.has('code_verifier')).toBe(false);

        const [checkUrl, checkOptions] = mockSecureFetch.mock.calls[0];
        expect(checkUrl).toBe(
            `https://api.linkedin.com/rest/adAccounts/${ACCOUNT_ID}`,
        );
        expect(checkOptions.headers).toMatchObject({
            Authorization: 'Bearer li_token',
            'X-Restli-Protocol-Version': '2.0.0',
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
            origin: 'https://api.linkedin.com',
            oauthTokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
            allowedMethods: ['GET'],
            allowedPathPrefixes: [
                '/rest/adAnalytics',
                `/rest/adAccounts/${ACCOUNT_ID}`,
            ],
            apiSource: {
                connector: ApiConnectorType.LINKEDIN_ADS,
                adAccountId: ACCOUNT_ID,
            },
        });
    });

    it.each([403, 404])(
        'saves nothing when the account check returns %s',
        async (status) => {
            mockSecureFetch.mockResolvedValue(jsonResponse(status, {}));
            const { service, externalConnectionModel } = buildService();
            await expect(
                service.completeLinkedInAdsOAuth(account, SESSION, 'the-code'),
            ).rejects.toThrow(WarehouseConnectionError);
            expect(externalConnectionModel.create).not.toHaveBeenCalled();
        },
    );
});
