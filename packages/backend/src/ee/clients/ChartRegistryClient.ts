import {
    chartRegistryIndexSchema,
    ParameterError,
    type ChartRegistryEntry,
    type ChartRegistryIndex,
} from '@lightdash/common';
import { createHash } from 'crypto';
import type { LightdashConfig } from '../../config/parseConfig';
import { validatePublicHttpUrl } from '../../utils/ssrfProtection';

const INDEX_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_INDEX_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

// getAsset's response is streamed straight to the browser by a later task;
// svg is excluded because it can carry inline script.
const ALLOWED_ASSET_CONTENT_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
]);

const normalizeContentType = (contentType: string): string =>
    contentType.split(';')[0].trim().toLowerCase();

export type ChartRegistryRawResponse = {
    status: number;
    body: Buffer;
    contentType: string | null;
};

export type ChartRegistryFetch = (
    url: string,
    maxBytes: number,
) => Promise<ChartRegistryRawResponse>;

/** Reads a fetch response body, aborting the moment it exceeds maxBytes. */
async function readBodyWithCap(
    response: Response,
    maxBytes: number,
    url: string,
): Promise<Buffer> {
    const reader = response.body?.getReader();
    if (!reader) {
        return Buffer.alloc(0);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            // eslint-disable-next-line no-await-in-loop
            await reader.cancel();
            throw new ParameterError(
                `Chart registry response for "${url}" exceeds the maximum allowed size`,
            );
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}

/**
 * The real network fetch behind ChartRegistryClient's default fetchImpl,
 * exported standalone so tests can exercise it directly against a real
 * server. Validates the URL is public, refuses to follow redirects (a
 * redirect target is unvalidated — see secureFetch.ts), and streams the
 * body with a hard byte cap instead of buffering an unbounded response.
 */
export async function chartRegistryFetch(
    url: string,
    options: { maxBytes: number; allowPrivateAddresses: boolean },
): Promise<ChartRegistryRawResponse> {
    await validatePublicHttpUrl(url, {
        allowedProtocols: options.allowPrivateAddresses
            ? ['http:', 'https:']
            : ['https:'],
        allowPrivateAddresses: options.allowPrivateAddresses,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            redirect: 'manual',
            signal: controller.signal,
        });
        // validatePublicHttpUrl only validated this URL; a redirect target
        // is unvalidated, so the chain stops here.
        if (response.status >= 300 && response.status < 400) {
            throw new ParameterError(
                `Chart registry request to "${url}" was redirected; redirects are not allowed`,
            );
        }
        const contentLength = response.headers.get('content-length');
        if (contentLength && Number(contentLength) > options.maxBytes) {
            throw new ParameterError(
                `Chart registry response for "${url}" exceeds the maximum allowed size`,
            );
        }
        const body = await readBodyWithCap(response, options.maxBytes, url);
        return {
            status: response.status,
            body,
            contentType: response.headers.get('content-type'),
        };
    } finally {
        clearTimeout(timeout);
    }
}

export class ChartRegistryClient {
    private readonly baseUrl: string | null;

    private readonly allowInsecure: boolean;

    private readonly fetchImpl: ChartRegistryFetch;

    private cache: { index: ChartRegistryIndex; fetchedAt: number } | null =
        null;

    constructor(args: {
        lightdashConfig: LightdashConfig;
        fetchImpl?: ChartRegistryFetch;
    }) {
        this.baseUrl = args.lightdashConfig.appRuntime.chartRegistry.url;
        this.allowInsecure =
            args.lightdashConfig.appRuntime.chartRegistry.allowInsecure;
        this.fetchImpl = args.fetchImpl ?? this.defaultFetch.bind(this);
    }

    isEnabled(): boolean {
        return this.baseUrl !== null;
    }

    getBaseUrl(): string | null {
        return this.baseUrl;
    }

    /** Resolves a registry-relative path, rejecting anything outside baseUrl. */
    private resolveUrl(path: string): URL {
        if (!this.baseUrl) {
            throw new ParameterError('Chart registry is not configured');
        }
        const resolved = new URL(path, `${this.baseUrl}/`);
        if (!resolved.toString().startsWith(`${this.baseUrl}/`)) {
            throw new ParameterError(
                `Chart registry path "${path}" resolves outside the registry base URL`,
            );
        }
        return resolved;
    }

    async getIndex(): Promise<ChartRegistryIndex> {
        if (!this.baseUrl) {
            throw new ParameterError('Chart registry is not configured');
        }
        if (this.cache && Date.now() - this.cache.fetchedAt < INDEX_TTL_MS) {
            return this.cache.index;
        }
        try {
            const { body } = await this.fetchImpl(
                this.resolveUrl('index.json').toString(),
                MAX_INDEX_BYTES,
            );
            const index = this.parseIndex(body);
            this.cache = { index, fetchedAt: Date.now() };
            return index;
        } catch (e) {
            if (this.cache) {
                return this.cache.index;
            }
            throw e;
        }
    }

    /** Parses and validates a raw index.json body; throws on any error. */
    private parseIndex(body: Buffer): ChartRegistryIndex {
        if (body.byteLength > MAX_INDEX_BYTES) {
            throw new ParameterError(
                'Chart registry index exceeds the maximum allowed size',
            );
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(body.toString('utf-8'));
        } catch {
            throw new ParameterError('Chart registry index is not valid JSON');
        }
        return chartRegistryIndexSchema.parse(parsed);
    }

    async getEntry(slug: string): Promise<ChartRegistryEntry | undefined> {
        const index = await this.getIndex();
        return index.charts.find((chart) => chart.slug === slug);
    }

    async downloadArtifact(
        entry: ChartRegistryEntry,
        kind: 'source' | 'dist',
    ): Promise<Buffer> {
        const artifact = entry.artifacts[kind];
        const url = this.resolveUrl(artifact.path);
        const { body } = await this.fetchImpl(
            url.toString(),
            MAX_ARTIFACT_BYTES,
        );
        const digest = createHash('sha256').update(body).digest('hex');
        if (digest !== artifact.sha256) {
            throw new ParameterError(
                `Chart registry artifact "${artifact.path}" digest mismatch`,
            );
        }
        return body;
    }

    /** Non-2xx or a content type outside the image allowlist is treated as absent. */
    private isServableAsset(
        status: number,
        contentType: string | null,
    ): boolean {
        return (
            status >= 200 &&
            status < 300 &&
            contentType !== null &&
            ALLOWED_ASSET_CONTENT_TYPES.has(normalizeContentType(contentType))
        );
    }

    async getAsset(
        path: string,
    ): Promise<{ buffer: Buffer; contentType: string } | undefined> {
        const index = await this.getIndex();
        const isKnownAsset = index.charts.some(
            (chart) =>
                chart.thumbnail === path || chart.screenshots.includes(path),
        );
        if (!isKnownAsset) {
            return undefined;
        }
        const { status, body, contentType } = await this.fetchImpl(
            this.resolveUrl(path).toString(),
            MAX_ARTIFACT_BYTES,
        );
        if (!this.isServableAsset(status, contentType)) {
            return undefined;
        }
        return {
            buffer: body,
            contentType: normalizeContentType(contentType as string),
        };
    }

    private defaultFetch(
        url: string,
        maxBytes: number,
    ): Promise<ChartRegistryRawResponse> {
        return chartRegistryFetch(url, {
            maxBytes,
            allowPrivateAddresses: this.allowInsecure,
        });
    }
}
