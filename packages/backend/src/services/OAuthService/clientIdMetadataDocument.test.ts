import { SecureFetchError } from '../../utils/secureFetch/secureFetch';
import {
    ClientIdMetadataDocumentResolver,
    isClientIdMetadataDocumentUrl,
    type ClientIdMetadataDocumentFetch,
} from './clientIdMetadataDocument';

const clientId = 'https://claude.ai/oauth/claude-code-client-metadata';

const validDocument = {
    client_id: clientId,
    client_name: 'Claude Code',
    redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
};

const response = (body: unknown, status = 200) => ({
    status,
    bodyText: typeof body === 'string' ? body : JSON.stringify(body),
});

const createResolver = (
    body: unknown,
    options: {
        now?: () => number;
        fetchImpl?: ClientIdMetadataDocumentFetch;
        maxCacheEntries?: number;
        maxInFlight?: number;
    } = {},
) => {
    const fetchImpl =
        options.fetchImpl ??
        vi
            .fn<ClientIdMetadataDocumentFetch>()
            .mockResolvedValue(response(body));
    const resolver = new ClientIdMetadataDocumentResolver({
        fetch: fetchImpl,
        now: options.now,
        maxCacheEntries: options.maxCacheEntries,
        maxInFlight: options.maxInFlight,
    });
    return { resolver, fetchImpl };
};

describe('isClientIdMetadataDocumentUrl', () => {
    it.each([
        [clientId, true],
        ['https://chatgpt.com/oauth/client.json', true],
        ['https://chatgpt.com/', false],
        ['https://chatgpt.com', false],
        ['http://chatgpt.com/oauth/client.json', false],
        ['https://user:pass@chatgpt.com/oauth/client.json', false],
        ['https://chatgpt.com/oauth/client.json#frag', false],
        ['https://10.0.0.1/client.json', false],
        ['https://[::1]/client.json', false],
        ['https://chatgpt.com/oauth/client.json ', false],
        ['https://ChatGPT.com/oauth/client.json', false],
        ['mcp-abc123', false],
        ['lightdash-cli', false],
    ])('classifies %s as %s', (candidate, expected) => {
        expect(isClientIdMetadataDocumentUrl(candidate)).toBe(expected);
    });
});

describe('ClientIdMetadataDocumentResolver', () => {
    it('resolves a valid document as a public client', async () => {
        const { resolver, fetchImpl } = createResolver(validDocument);
        await expect(resolver.resolve(clientId)).resolves.toEqual({
            clientId,
            clientName: 'Claude Code',
            redirectUris: [
                'http://localhost/callback',
                'http://127.0.0.1/callback',
            ],
            grantTypes: ['authorization_code', 'refresh_token'],
        });
        expect(fetchImpl).toHaveBeenCalledWith(clientId, {
            timeoutMs: 5000,
            maxBytes: 64 * 1024,
        });
    });

    it('ignores unsupported grant types alongside authorization_code', async () => {
        const { resolver } = createResolver({
            ...validDocument,
            grant_types: [
                'authorization_code',
                'refresh_token',
                'urn:ietf:params:oauth:grant-type:jwt-bearer',
            ],
        });
        await expect(resolver.resolve(clientId)).resolves.toMatchObject({
            grantTypes: ['authorization_code', 'refresh_token'],
        });
    });

    it('defaults the client name and grant types', async () => {
        const { resolver } = createResolver({
            client_id: clientId,
            redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        });
        await expect(resolver.resolve(clientId)).resolves.toEqual({
            clientId,
            clientName: 'claude.ai',
            redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
            grantTypes: ['authorization_code', 'refresh_token'],
        });
    });

    it.each([
        [
            'client_id mismatch',
            { ...validDocument, client_id: 'https://claude.ai/other' },
        ],
        ['missing redirect_uris', { ...validDocument, redirect_uris: [] }],
        [
            'wildcard redirect',
            { ...validDocument, redirect_uris: ['https://claude.ai/*'] },
        ],
        [
            'non-loopback http redirect',
            { ...validDocument, redirect_uris: ['http://claude.ai/callback'] },
        ],
        [
            'confidential auth method',
            {
                ...validDocument,
                token_endpoint_auth_method: 'client_secret_post',
            },
        ],
        [
            'no authorization_code grant',
            { ...validDocument, grant_types: ['client_credentials'] },
        ],
        [
            'only refresh_token grant',
            { ...validDocument, grant_types: ['refresh_token'] },
        ],
        ['array body', [validDocument]],
        ['invalid json', '{not json'],
    ])('rejects a document with %s', async (_label, body) => {
        const { resolver } = createResolver(body);
        await expect(resolver.resolve(clientId)).resolves.toBeNull();
    });

    it('rejects non-2xx responses', async () => {
        const { resolver } = createResolver(validDocument, {
            fetchImpl: vi
                .fn<ClientIdMetadataDocumentFetch>()
                .mockResolvedValue(response(validDocument, 404)),
        });
        await expect(resolver.resolve(clientId)).resolves.toBeNull();
    });

    it.each([
        ['blocked_ip', 'Access to private/internal addresses is not allowed'],
        ['redirect', 'Redirects are not allowed for security reasons'],
        ['too_large', 'Response too large'],
        ['timeout', 'Request timed out'],
        ['disallowed_content_type', 'Disallowed content-type: text/html'],
    ] as const)(
        'treats a %s fetch refusal as unresolved',
        async (reason, message) => {
            const { resolver } = createResolver(validDocument, {
                fetchImpl: vi
                    .fn<ClientIdMetadataDocumentFetch>()
                    .mockRejectedValue(new SecureFetchError(reason, message)),
            });
            await expect(resolver.resolve(clientId)).resolves.toBeNull();
        },
    );

    it('caches resolved documents and expires them', async () => {
        let time = 0;
        const { resolver, fetchImpl } = createResolver(validDocument, {
            now: () => time,
        });
        await resolver.resolve(clientId);
        await resolver.resolve(clientId);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        time = 60 * 60 * 1000 + 1;
        await resolver.resolve(clientId);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('caches failures for a shorter period', async () => {
        let time = 0;
        const fetchImpl = vi
            .fn<ClientIdMetadataDocumentFetch>()
            .mockResolvedValueOnce(response('{bad'))
            .mockResolvedValue(response(validDocument));
        const { resolver } = createResolver(validDocument, {
            fetchImpl,
            now: () => time,
        });
        await expect(resolver.resolve(clientId)).resolves.toBeNull();
        await expect(resolver.resolve(clientId)).resolves.toBeNull();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        time = 60 * 1000 + 1;
        await expect(resolver.resolve(clientId)).resolves.not.toBeNull();
    });

    it('evicts the oldest cache entries beyond the cap', async () => {
        const fetchImpl = vi
            .fn<ClientIdMetadataDocumentFetch>()
            .mockImplementation(async (url) =>
                response({ ...validDocument, client_id: url }),
            );
        const { resolver } = createResolver(validDocument, {
            fetchImpl,
            maxCacheEntries: 2,
        });
        const urls = [1, 2, 3].map((n) => `https://claude.ai/client/${n}`);
        for (const url of urls) {
            // eslint-disable-next-line no-await-in-loop
            await resolver.resolve(url);
        }
        await resolver.resolve(urls[0]);
        expect(fetchImpl).toHaveBeenCalledTimes(4);
        await resolver.resolve(urls[2]);
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it('deduplicates concurrent fetches', async () => {
        const { resolver, fetchImpl } = createResolver(validDocument);
        await Promise.all([
            resolver.resolve(clientId),
            resolver.resolve(clientId),
        ]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('refuses new lookups beyond the in-flight cap', async () => {
        let release: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const fetchImpl = vi
            .fn<ClientIdMetadataDocumentFetch>()
            .mockImplementation(async (url) => {
                await gate;
                return response({ ...validDocument, client_id: url });
            });
        const { resolver } = createResolver(validDocument, {
            fetchImpl,
            maxInFlight: 1,
        });
        const first = resolver.resolve('https://claude.ai/client/1');
        await expect(
            resolver.resolve('https://claude.ai/client/2'),
        ).resolves.toBeNull();
        release();
        await expect(first).resolves.not.toBeNull();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('does not fetch non-document client ids', async () => {
        const { resolver, fetchImpl } = createResolver(validDocument);
        await expect(resolver.resolve('mcp-abc')).resolves.toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
