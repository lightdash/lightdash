import {
    ClientIdMetadataDocumentResolver,
    isClientIdMetadataDocumentUrl,
    isPublicAddress,
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

const jsonResponse = (
    body: unknown,
    overrides: { ok?: boolean; status?: number; contentLength?: string } = {},
) => ({
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    headers: {
        get: (name: string) =>
            name.toLowerCase() === 'content-length'
                ? (overrides.contentLength ?? null)
                : null,
    },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

const createResolver = (
    body: unknown,
    options: {
        addresses?: string[];
        now?: () => number;
        fetchImpl?: ClientIdMetadataDocumentFetch;
    } = {},
) => {
    const fetchImpl =
        options.fetchImpl ??
        vi
            .fn<ClientIdMetadataDocumentFetch>()
            .mockResolvedValue(jsonResponse(body));
    const resolver = new ClientIdMetadataDocumentResolver({
        fetch: fetchImpl,
        lookupAddresses: vi
            .fn()
            .mockResolvedValue(options.addresses ?? ['160.79.104.10']),
        now: options.now,
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

describe('isPublicAddress', () => {
    it.each([
        ['160.79.104.10', true],
        ['8.8.8.8', true],
        ['10.1.2.3', false],
        ['127.0.0.1', false],
        ['169.254.169.254', false],
        ['172.16.0.1', false],
        ['192.168.1.1', false],
        ['100.64.0.1', false],
        ['0.0.0.0', false],
        ['224.0.0.1', false],
        ['::1', false],
        ['fd00::1', false],
        ['fe80::1', false],
        ['::ffff:127.0.0.1', false],
        ['2606:4700::1111', true],
    ])('classifies %s as %s', (address, expected) => {
        expect(isPublicAddress(address)).toBe(expected);
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
        expect(fetchImpl).toHaveBeenCalledWith(
            clientId,
            expect.objectContaining({
                headers: { Accept: 'application/json' },
            }),
        );
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
            'unsupported grant',
            { ...validDocument, grant_types: ['client_credentials'] },
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
                .mockResolvedValue(
                    jsonResponse(validDocument, { ok: false, status: 404 }),
                ),
        });
        await expect(resolver.resolve(clientId)).resolves.toBeNull();
    });

    it('rejects oversized documents', async () => {
        const { resolver } = createResolver(validDocument, {
            fetchImpl: vi
                .fn<ClientIdMetadataDocumentFetch>()
                .mockResolvedValue(
                    jsonResponse(validDocument, { contentLength: '100000' }),
                ),
        });
        await expect(resolver.resolve(clientId)).resolves.toBeNull();
    });

    it('refuses to fetch hosts that resolve to private addresses', async () => {
        const { resolver, fetchImpl } = createResolver(validDocument, {
            addresses: ['160.79.104.10', '10.0.0.5'],
        });
        await expect(resolver.resolve(clientId)).resolves.toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('treats fetch failures as unresolved', async () => {
        const { resolver } = createResolver(validDocument, {
            fetchImpl: vi
                .fn<ClientIdMetadataDocumentFetch>()
                .mockRejectedValue(new Error('timeout')),
        });
        await expect(resolver.resolve(clientId)).resolves.toBeNull();
    });

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
            .mockResolvedValueOnce(jsonResponse('{bad'))
            .mockResolvedValue(jsonResponse(validDocument));
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

    it('deduplicates concurrent fetches', async () => {
        const { resolver, fetchImpl } = createResolver(validDocument);
        await Promise.all([
            resolver.resolve(clientId),
            resolver.resolve(clientId),
        ]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('does not fetch non-document client ids', async () => {
        const { resolver, fetchImpl } = createResolver(validDocument);
        await expect(resolver.resolve('mcp-abc')).resolves.toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
