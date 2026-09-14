import { AiModelCatalog, type FetchLike } from './AiModelCatalog';

const page = (ids: string[], hasMore: boolean) => ({
    ok: true,
    json: async () => ({
        data: ids.map((id) => ({ id })),
        has_more: hasMore,
        last_id: ids[ids.length - 1] ?? null,
    }),
});

describe('AiModelCatalog', () => {
    it('returns anthropic model ids and paginates', async () => {
        const fetchFn = vi
            .fn<FetchLike>()
            .mockResolvedValueOnce(page(['claude-opus-4-8'], true))
            .mockResolvedValueOnce(page(['claude-sonnet-5'], false));
        const catalog = new AiModelCatalog({ fetchFn });

        const result = await catalog.getAccessibleModelIds(
            'anthropic',
            'sk-ant-test',
        );

        expect(result).toEqual(['claude-opus-4-8', 'claude-sonnet-5']);
        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect(String(fetchFn.mock.calls[0][0])).toContain(
            'https://api.anthropic.com/v1/models',
        );
        expect(String(fetchFn.mock.calls[1][0])).toContain(
            'after_id=claude-opus-4-8',
        );
        expect(fetchFn.mock.calls[0][1].headers['x-api-key']).toBe(
            'sk-ant-test',
        );
    });

    it('caches per key: second call does not refetch', async () => {
        const fetchFn = vi
            .fn<FetchLike>()
            .mockResolvedValue(page(['claude-sonnet-5'], false));
        const catalog = new AiModelCatalog({ fetchFn });

        await catalog.getAccessibleModelIds('anthropic', 'sk-ant-test');
        await catalog.getAccessibleModelIds('anthropic', 'sk-ant-test');

        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('returns null on HTTP error and does not cache the failure', async () => {
        const fetchFn = vi
            .fn<FetchLike>()
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({}),
            })
            .mockResolvedValueOnce(page(['claude-sonnet-5'], false));
        const catalog = new AiModelCatalog({ fetchFn });

        expect(
            await catalog.getAccessibleModelIds('anthropic', 'sk-ant-bad'),
        ).toBeNull();
        expect(
            await catalog.getAccessibleModelIds('anthropic', 'sk-ant-bad'),
        ).toEqual(['claude-sonnet-5']);
    });

    it('uses the normalized gateway models endpoint and bearer auth', async () => {
        const fetchFn = vi
            .fn<FetchLike>()
            .mockResolvedValue(page(['claude-sonnet-5'], false));
        const catalog = new AiModelCatalog({ fetchFn });

        await catalog.getAccessibleModelIds('anthropic', 'gateway-token', {
            baseUrl: 'https://gateway.example/anthropic/v1',
            headers: { 'x-gateway-tenant': 'lightdash' },
        });

        expect(String(fetchFn.mock.calls[0][0])).toContain(
            'https://gateway.example/anthropic/v1/models',
        );
        expect(fetchFn.mock.calls[0][1].headers).toMatchObject({
            authorization: 'Bearer gateway-token',
            'x-gateway-tenant': 'lightdash',
        });
        expect(fetchFn.mock.calls[0][1].headers).not.toHaveProperty(
            'x-api-key',
        );
    });

    it('returns null when fetch throws', async () => {
        const fetchFn = vi
            .fn<FetchLike>()
            .mockRejectedValue(new Error('network'));
        const catalog = new AiModelCatalog({ fetchFn });

        expect(
            await catalog.getAccessibleModelIds('anthropic', 'sk-ant-test'),
        ).toBeNull();
    });

    it('fails closed for providers without catalog support', async () => {
        const fetchFn = vi.fn<FetchLike>();
        const catalog = new AiModelCatalog({ fetchFn });

        expect(
            await catalog.getAccessibleModelIds('openai', 'sk-test'),
        ).toBeNull();
        expect(
            await catalog.getAccessibleModelIds(
                'google',
                'AIza-fake-gemini-key',
            ),
        ).toBeNull();
        expect(fetchFn).not.toHaveBeenCalled();
    });
});
