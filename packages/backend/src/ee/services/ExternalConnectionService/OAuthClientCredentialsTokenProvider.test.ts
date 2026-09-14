import { type SecureFetchOptions } from '../../../utils/secureFetch/secureFetch';
import { OAuthClientCredentialsTokenProvider } from './OAuthClientCredentialsTokenProvider';

const config = {
    tokenUrl: 'https://auth.example.com/oauth/token',
    clientId: 'client id',
    clientAuthMethod: 'basic' as const,
    scopes: ['read:data', 'https://api.example.com/.default'],
};

const tokenResponse = (token: string, expiresIn: number | string = 3600) => ({
    status: 200,
    contentType: 'application/json',
    headers: {},
    bodyText: JSON.stringify({
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
    }),
    truncated: false,
});

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('OAuthClientCredentialsTokenProvider', () => {
    it('mints with Basic authentication and caches the token', async () => {
        const fetchToken = vi.fn().mockResolvedValue(tokenResponse('token-1'));
        const provider = new OAuthClientCredentialsTokenProvider(fetchToken);

        await expect(
            provider.getAccessToken(config, 'client secret'),
        ).resolves.toBe('token-1');
        await expect(
            provider.getAccessToken(config, 'client secret'),
        ).resolves.toBe('token-1');

        expect(fetchToken).toHaveBeenCalledTimes(1);
        const [url, options] = fetchToken.mock.calls[0];
        expect(url).toBe(config.tokenUrl);
        expect(options).toMatchObject({
            method: 'POST',
            timeoutMs: 10_000,
            maxResponseBytes: 64 * 1024,
            allowedContentTypes: ['application/json'],
        });
        expect(options.headers.Authorization).toBe(
            `Basic ${Buffer.from('client+id:client+secret').toString('base64')}`,
        );
        expect(new URLSearchParams(options.body)).toEqual(
            new URLSearchParams({
                grant_type: 'client_credentials',
                scope: 'read:data https://api.example.com/.default',
            }),
        );
    });

    it('supports credentials in the request body and coalesces concurrent mints', async () => {
        let resolveFetch: (value: ReturnType<typeof tokenResponse>) => void;
        const fetchToken = vi.fn(
            (_url: string, _options: SecureFetchOptions) =>
                new Promise<ReturnType<typeof tokenResponse>>((resolve) => {
                    resolveFetch = resolve;
                }),
        );
        const provider = new OAuthClientCredentialsTokenProvider(fetchToken);
        const bodyConfig = {
            ...config,
            clientAuthMethod: 'body' as const,
            scopes: [],
        };

        const first = provider.getAccessToken(bodyConfig, 'secret');
        const second = provider.getAccessToken(bodyConfig, 'secret');
        expect(fetchToken).toHaveBeenCalledTimes(1);
        resolveFetch!(tokenResponse('token-2', '120'));

        await expect(Promise.all([first, second])).resolves.toEqual([
            'token-2',
            'token-2',
        ]);
        const options = fetchToken.mock.calls[0][1];
        expect(options.headers!.Authorization).toBeUndefined();
        expect(Object.fromEntries(new URLSearchParams(options.body))).toEqual({
            grant_type: 'client_credentials',
            client_id: 'client id',
            client_secret: 'secret',
        });
    });

    it('refreshes the cached token when it reaches the expiry skew', async () => {
        const fetchToken = vi
            .fn()
            .mockResolvedValueOnce(tokenResponse('token-1', 100))
            .mockResolvedValueOnce(tokenResponse('token-2', 100));
        const provider = new OAuthClientCredentialsTokenProvider(fetchToken);

        await expect(provider.getAccessToken(config, 'secret')).resolves.toBe(
            'token-1',
        );

        vi.advanceTimersByTime(89_999);
        await expect(provider.getAccessToken(config, 'secret')).resolves.toBe(
            'token-1',
        );

        vi.advanceTimersByTime(1);
        await expect(provider.getAccessToken(config, 'secret')).resolves.toBe(
            'token-2',
        );
        expect(fetchToken).toHaveBeenCalledTimes(2);
    });

    it('invalidates only the rejected cached token', async () => {
        const fetchToken = vi
            .fn()
            .mockResolvedValueOnce(tokenResponse('token-1'))
            .mockResolvedValueOnce(tokenResponse('token-2'));
        const provider = new OAuthClientCredentialsTokenProvider(fetchToken);

        await provider.getAccessToken(config, 'secret');
        provider.invalidateAccessToken(config, 'secret', 'newer-token');
        await expect(provider.getAccessToken(config, 'secret')).resolves.toBe(
            'token-1',
        );

        provider.invalidateAccessToken(config, 'secret', 'token-1');
        await expect(provider.getAccessToken(config, 'secret')).resolves.toBe(
            'token-2',
        );
        expect(fetchToken).toHaveBeenCalledTimes(2);
    });

    it('rejects unsuccessful or malformed token responses', async () => {
        const fetchToken = vi
            .fn()
            .mockResolvedValueOnce({
                ...tokenResponse('unused'),
                status: 401,
            })
            .mockResolvedValueOnce({
                ...tokenResponse('unused'),
                bodyText: '{bad json',
            })
            .mockResolvedValueOnce({
                ...tokenResponse('unused'),
                bodyText: JSON.stringify({ token_type: 'Bearer' }),
            });
        const provider = new OAuthClientCredentialsTokenProvider(fetchToken);

        await expect(provider.getAccessToken(config, 'one')).rejects.toThrow();
        await expect(provider.getAccessToken(config, 'two')).rejects.toThrow();
        await expect(
            provider.getAccessToken(config, 'three'),
        ).rejects.toThrow();
    });
});
