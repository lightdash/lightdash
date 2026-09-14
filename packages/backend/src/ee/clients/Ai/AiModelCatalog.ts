import { assertUnreachable, type ByoAiProvider } from '@lightdash/common';
import { createHash } from 'crypto';
import { getAnthropicApiBaseUrl } from '../../../config/aiGatewayConfig';
import Logger from '../../../logging/logger';

const ANTHROPIC_VERSION = '2023-06-01';
const CACHE_TTL_MS = 60 * 60 * 1000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 5000;

export type FetchLike = (
    url: string,
    init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;

type AnthropicModelsPage = {
    data: { id: string }[];
    has_more: boolean;
    last_id: string | null;
};

type CacheEntry = { modelIds: string[]; expiresAt: number };

type Dependencies = { fetchFn?: FetchLike };

/**
 * Lists the model ids a provider credential can access, cached in-memory for an
 * hour per endpoint/auth context. Returns null on any failure (or unsupported
 * provider) so callers fail closed: hidden models stay hidden.
 */
export class AiModelCatalog {
    private readonly fetchFn: FetchLike;

    private readonly cache = new Map<string, CacheEntry>();

    constructor(dependencies: Dependencies = {}) {
        this.fetchFn =
            dependencies.fetchFn ??
            ((url, init) =>
                fetch(url, { headers: init.headers, signal: init.signal }));
    }

    async getAccessibleModelIds(
        provider: ByoAiProvider,
        apiKey: string,
        options?: { baseUrl?: string; headers?: Record<string, string> },
    ): Promise<string[] | null> {
        switch (provider) {
            case 'anthropic':
                return this.getAnthropicModelIds(
                    apiKey,
                    options?.baseUrl,
                    options?.headers,
                );
            case 'openai':
                // Not implemented yet — callers fail closed
                return null;
            case 'google':
                // Not implemented yet — callers fail closed
                return null;
            default:
                return assertUnreachable(
                    provider,
                    `Unknown AI provider: ${provider}`,
                );
        }
    }

    private async getAnthropicModelIds(
        apiKey: string,
        baseUrl?: string,
        customHeaders?: Record<string, string>,
    ): Promise<string[] | null> {
        const apiBaseUrl = getAnthropicApiBaseUrl(baseUrl);
        const authMode = baseUrl ? 'bearer' : 'api-key';
        const headerContext = Object.entries(customHeaders ?? {}).sort(
            ([left], [right]) => left.localeCompare(right),
        );
        const cacheKey = `anthropic:${createHash('sha256')
            .update(
                JSON.stringify({
                    apiBaseUrl,
                    apiKey,
                    authMode,
                    headerContext,
                }),
            )
            .digest('hex')}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.modelIds;

        try {
            const modelIds: string[] = [];
            let afterId: string | null = null;
            for (let page = 0; page < MAX_PAGES; page += 1) {
                const url = new URL(`${apiBaseUrl}/models`);
                url.searchParams.set('limit', String(PAGE_LIMIT));
                if (afterId) url.searchParams.set('after_id', afterId);
                // eslint-disable-next-line no-await-in-loop
                const response = await this.fetchFn(url.toString(), {
                    headers: {
                        ...(baseUrl
                            ? { authorization: `Bearer ${apiKey}` }
                            : { 'x-api-key': apiKey }),
                        'anthropic-version': ANTHROPIC_VERSION,
                        ...customHeaders,
                    },
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                });
                if (!response.ok) {
                    Logger.warn(
                        `Anthropic models list failed with status ${response.status}`,
                    );
                    return null;
                }
                // eslint-disable-next-line no-await-in-loop
                const body = (await response.json()) as AnthropicModelsPage;
                modelIds.push(...body.data.map((model) => model.id));
                if (!body.has_more || !body.last_id) break;
                afterId = body.last_id;
            }
            this.cache.set(cacheKey, {
                modelIds,
                expiresAt: Date.now() + CACHE_TTL_MS,
            });
            return modelIds;
        } catch (error) {
            Logger.warn(`Anthropic models list failed: ${error}`);
            return null;
        }
    }
}
