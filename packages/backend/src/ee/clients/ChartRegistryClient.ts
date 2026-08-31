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

export type ChartRegistryFetch = (
    url: string,
) => Promise<{ status: number; body: Buffer; contentType: string | null }>;

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
        const { body } = await this.fetchImpl(url.toString());
        const digest = createHash('sha256').update(body).digest('hex');
        if (digest !== artifact.sha256) {
            throw new ParameterError(
                `Chart registry artifact "${artifact.path}" digest mismatch`,
            );
        }
        return body;
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
        const { body, contentType } = await this.fetchImpl(
            this.resolveUrl(path).toString(),
        );
        return {
            buffer: body,
            contentType: contentType ?? 'application/octet-stream',
        };
    }

    private async defaultFetch(
        url: string,
    ): Promise<{ status: number; body: Buffer; contentType: string | null }> {
        await validatePublicHttpUrl(url, {
            allowedProtocols: this.allowInsecure
                ? ['http:', 'https:']
                : ['https:'],
            allowPrivateAddresses: this.allowInsecure,
        });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            const contentLength = response.headers.get('content-length');
            if (contentLength && Number(contentLength) > MAX_ARTIFACT_BYTES) {
                throw new ParameterError(
                    `Chart registry response for "${url}" exceeds the maximum allowed size`,
                );
            }
            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength > MAX_ARTIFACT_BYTES) {
                throw new ParameterError(
                    `Chart registry response for "${url}" exceeds the maximum allowed size`,
                );
            }
            return {
                status: response.status,
                body: Buffer.from(arrayBuffer),
                contentType: response.headers.get('content-type'),
            };
        } finally {
            clearTimeout(timeout);
        }
    }
}
