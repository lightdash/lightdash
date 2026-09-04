import {
    chartRegistryIndexSchema,
    ParameterError,
    type ChartRegistryEntry,
    type ChartRegistryIndex,
} from '@lightdash/common';
import { createHash } from 'crypto';
import * as ipaddr from 'ipaddr.js';
import * as dns from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import { Agent } from 'undici';
import type { LightdashConfig } from '../../config/parseConfig';
import {
    isPrivateAddress,
    validatePublicHttpUrl,
} from '../../utils/ssrfProtection';

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

// Servable asset shape: one image filename under a published version dir of
// an indexed chart. Validated structurally (plus a slug check against the
// index) rather than by exact enumeration: the index only lists each chart's
// latest version, and its per-process TTL cache means the listing and asset
// requests can straddle a publish on different cache generations — exact
// matching 404s thumbnails for up to the TTL on every publish. Published
// versions are immutable and served forever, so older versions' screenshots
// are always safe to proxy; resolveUrl and the content-type allowlist bound
// everything else.
const ASSET_PATH_PATTERN =
    /^charts\/([a-z0-9][a-z0-9-]*)\/\d+\.\d+\.\d+\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp|gif)$/;

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

type PinnedAddress = { address: string; family: 4 | 6 };

// Resolves hostname and validates every returned address is public. Mirrors
// secureFetch.ts's resolveAndValidateHost: unlike validatePublicHttpUrl (which
// only reports pass/fail), this returns the resolved address itself so the
// fetch below can pin its connection to it — see createPinnedLookup.
async function resolveAndValidatePublicHost(
    hostname: string,
): Promise<PinnedAddress> {
    const cleanHost = hostname.replace(/^\[/, '').replace(/\]$/, '');
    let addresses: Array<{ address: string; family: number }>;
    try {
        addresses = await dns.lookup(cleanHost, { all: true, verbatim: true });
    } catch {
        throw new ParameterError(
            `Unable to resolve chart registry hostname "${hostname}"`,
        );
    }
    if (addresses.length === 0) {
        throw new ParameterError(
            `Unable to resolve chart registry hostname "${hostname}"`,
        );
    }
    for (const { address } of addresses) {
        if (!ipaddr.isValid(address) || isPrivateAddress(address)) {
            throw new ParameterError(
                `Chart registry hostname "${hostname}" resolved to a private/internal address`,
            );
        }
    }
    const { address, family } = addresses[0];
    return { address, family: family === 6 ? 6 : 4 };
}

/**
 * A `net.LookupFunction` that ignores real DNS and always returns `pinned`
 * for `expectedHostname` — refusing any other hostname. Passed to an undici
 * `Agent` as `connect.lookup` so the request's socket connects straight to
 * the address that was already validated, instead of triggering a second,
 * independent DNS resolution that an attacker controlling DNS could answer
 * differently (DNS rebinding SSRF/TOCTOU). TLS SNI is unaffected: undici
 * derives `servername` from the request's hostname, not from the lookup
 * result, so certificate validation still checks the real hostname.
 */
export function createPinnedLookup(
    expectedHostname: string,
    pinned: PinnedAddress,
): LookupFunction {
    const cleanExpectedHost = expectedHostname
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .toLowerCase();
    return (hostname, lookupOptions, callback) => {
        if (hostname.toLowerCase() !== cleanExpectedHost) {
            callback(
                Object.assign(
                    new Error(
                        `Refusing to resolve unexpected hostname "${hostname}" on a pinned chart registry connection`,
                    ),
                    { code: 'EACCES' },
                ) as NodeJS.ErrnoException,
                '',
                4,
            );
            return;
        }
        if (lookupOptions && (lookupOptions as { all?: boolean }).all) {
            (
                callback as (
                    err: NodeJS.ErrnoException | null,
                    addrs: Array<{ address: string; family: number }>,
                ) => void
            )(null, [{ address: pinned.address, family: pinned.family }]);
            return;
        }
        callback(null, pinned.address, pinned.family);
    };
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
    const parsedUrl = await validatePublicHttpUrl(url, {
        allowedProtocols: options.allowPrivateAddresses
            ? ['http:', 'https:']
            : ['https:'],
        allowPrivateAddresses: options.allowPrivateAddresses,
    });

    // Pin the connection to the address just validated above so this fetch
    // can't be answered by a different (private/internal) address than the
    // one validatePublicHttpUrl checked. Skipped when allowPrivateAddresses
    // is set — a dev-only escape hatch where hostname validation already
    // does not run.
    const dispatcher = options.allowPrivateAddresses
        ? undefined
        : new Agent({
              connect: {
                  lookup: createPinnedLookup(
                      parsedUrl.hostname,
                      await resolveAndValidatePublicHost(parsedUrl.hostname),
                  ),
              },
          });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            redirect: 'manual',
            signal: controller.signal,
            ...(dispatcher ? { dispatcher } : {}),
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
        if (dispatcher) void dispatcher.close();
    }
}

export class ChartRegistryClient {
    private readonly baseUrl: string | null;

    private readonly allowInsecure: boolean;

    private readonly indexFileName: string;

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
        // The next channel's index additionally lists charts whose latest
        // version is a beta (entries carry `channel`); the stable index
        // only ever lists stable versions.
        this.indexFileName =
            args.lightdashConfig.appRuntime.chartRegistry.channel === 'next'
                ? 'index-next.json'
                : 'index.json';
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
                this.resolveUrl(this.indexFileName).toString(),
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
        const match = path.match(ASSET_PATH_PATTERN);
        if (!match) {
            return undefined;
        }
        const index = await this.getIndex();
        const isKnownChart = index.charts.some(
            (chart) => chart.slug === match[1],
        );
        if (!isKnownChart) {
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
