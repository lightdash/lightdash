import {
    isAccessTokenFresh,
    OAuthAuthorizationCodeTokenClient,
    OAuthGrantRejectedError,
    parseStoredOAuthTokens,
} from './OAuthAuthorizationCodeTokenClient';

const NOW = 1_800_000_000_000;

const tokenResponse = (status: number, body: unknown) => ({
    status,
    contentType: 'application/json',
    headers: {},
    bodyText: JSON.stringify(body),
    truncated: false,
});

const client = {
    tokenUrl: 'https://us.posthog.com/oauth/token/',
    clientId: 'client-1',
    clientSecret: null,
};

const buildClient = (response: ReturnType<typeof tokenResponse>) => {
    const fetchToken = vi.fn().mockResolvedValue(response);
    return {
        fetchToken,
        tokenClient: new OAuthAuthorizationCodeTokenClient({
            allowedPrivateHostCidrs: {},
            fetchToken,
            now: () => NOW,
        }),
    };
};

describe('OAuthAuthorizationCodeTokenClient', () => {
    it('exchanges a code with its PKCE verifier as a public client', async () => {
        const { fetchToken, tokenClient } = buildClient(
            tokenResponse(200, {
                access_token: 'pha_1',
                refresh_token: 'phr_1',
                expires_in: 36000,
                token_type: 'Bearer',
                scoped_teams: [7],
            }),
        );

        const { tokens, response } = await tokenClient.exchangeCode(client, {
            code: 'code-1',
            redirectUri: 'https://lightdash.example.com/callback',
            codeVerifier: 'verifier-1',
        });

        expect(tokens).toEqual({
            accessToken: 'pha_1',
            refreshToken: 'phr_1',
            expiresAt: NOW + 36_000_000,
        });
        expect(response.scoped_teams).toEqual([7]);
        const [url, init] = fetchToken.mock.calls[0];
        expect(url).toBe(client.tokenUrl);
        expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
            grant_type: 'authorization_code',
            code: 'code-1',
            redirect_uri: 'https://lightdash.example.com/callback',
            code_verifier: 'verifier-1',
            client_id: 'client-1',
        });
    });

    it('keeps the refresh token when the server does not rotate it, and sends a configured secret', async () => {
        const { fetchToken, tokenClient } = buildClient(
            tokenResponse(200, { access_token: 'pha_2' }),
        );

        await expect(
            tokenClient.refresh({ ...client, clientSecret: 'shh' }, 'phr_1'),
        ).resolves.toEqual({
            accessToken: 'pha_2',
            refreshToken: 'phr_1',
            expiresAt: null,
        });
        expect(
            new URLSearchParams(fetchToken.mock.calls[0][1].body).get(
                'client_secret',
            ),
        ).toBe('shh');
    });

    it('reports a revoked grant separately from other failures', async () => {
        await expect(
            buildClient(
                tokenResponse(400, { error: 'invalid_grant' }),
            ).tokenClient.refresh(client, 'phr_1'),
        ).rejects.toBeInstanceOf(OAuthGrantRejectedError);

        const failure = buildClient(
            tokenResponse(503, { error: 'temporarily_unavailable' }),
        ).tokenClient.refresh(client, 'phr_1');
        await expect(failure).rejects.toThrow('returned 503');
        await expect(failure).rejects.not.toBeInstanceOf(
            OAuthGrantRejectedError,
        );
    });
});

describe('stored OAuth tokens', () => {
    it('reads only well-formed token JSON', () => {
        expect(parseStoredOAuthTokens('phx_plain_key')).toBeNull();
        expect(parseStoredOAuthTokens(null)).toBeNull();
        expect(
            parseStoredOAuthTokens(
                JSON.stringify({
                    accessToken: 'a',
                    refreshToken: null,
                    expiresAt: 1,
                }),
            ),
        ).toEqual({ accessToken: 'a', refreshToken: null, expiresAt: 1 });
    });

    it('treats a token as stale a minute before it expires', () => {
        const tokens = { accessToken: 'a', refreshToken: 'r' };
        expect(
            isAccessTokenFresh({ ...tokens, expiresAt: NOW + 120_000 }, NOW),
        ).toBe(true);
        expect(
            isAccessTokenFresh({ ...tokens, expiresAt: NOW + 30_000 }, NOW),
        ).toBe(false);
        expect(isAccessTokenFresh({ ...tokens, expiresAt: null }, NOW)).toBe(
            true,
        );
    });
});
