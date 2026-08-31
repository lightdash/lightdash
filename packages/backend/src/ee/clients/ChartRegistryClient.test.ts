import { createHash } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ChartRegistryClient,
    type ChartRegistryFetch,
} from './ChartRegistryClient';

const BASE = 'https://charts.example.com';

const entry = {
    slug: 'sankey',
    name: 'Sankey Diagram',
    description: 'Flow between categories',
    version: '1.2.0',
    publishedAt: '2026-08-31T00:00:00.000Z',
    tags: ['flow'],
    changelog: 'Initial release',
    minLightdashVersion: null,
    vizSchema: { fields: [], configOptions: [], colorPalette: null },
    thumbnail: 'charts/sankey/1.2.0/thumb.png',
    screenshots: ['charts/sankey/1.2.0/screenshot-1.png'],
    artifacts: {
        source: {
            path: 'charts/sankey/1.2.0/source.tar',
            sha256: 'a'.repeat(64),
        },
        dist: { path: 'charts/sankey/1.2.0/dist.tar', sha256: 'b'.repeat(64) },
    },
};

const index = {
    schemaVersion: 1,
    generatedAt: '2026-08-31T00:00:00.000Z',
    charts: [entry],
};

const jsonResponse = (body: unknown) => ({
    status: 200,
    body: Buffer.from(JSON.stringify(body)),
    contentType: 'application/json',
});

const makeClient = (
    fetchImpl: ReturnType<typeof vi.fn>,
    url: string | null = BASE,
) =>
    new ChartRegistryClient({
        lightdashConfig: {
            appRuntime: { chartRegistry: { url, allowInsecure: false } },
        } as never,
        fetchImpl: fetchImpl as unknown as ChartRegistryFetch,
    });

describe('ChartRegistryClient', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('is disabled when url is null', () => {
        expect(makeClient(vi.fn(), null).isEnabled()).toBe(false);
    });

    it('is enabled when a url is configured', () => {
        expect(makeClient(vi.fn()).isEnabled()).toBe(true);
    });

    it('exposes the configured base url', () => {
        expect(makeClient(vi.fn()).getBaseUrl()).toBe(BASE);
        expect(makeClient(vi.fn(), null).getBaseUrl()).toBeNull();
    });

    it('fetches, validates, and caches the index', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(index));
        const client = makeClient(fetchImpl);
        await client.getIndex();
        await client.getIndex();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/index.json`);
    });

    it('serves the stale cache when a refetch fails', async () => {
        vi.useFakeTimers();
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(index))
            .mockRejectedValueOnce(new Error('network down'));
        const client = makeClient(fetchImpl);

        const first = await client.getIndex();
        expect(first.charts).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(61 * 60 * 1000);

        const second = await client.getIndex();
        expect(second.charts).toHaveLength(1);
        expect(second).toBe(first);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('rejects an invalid index loudly', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValue(jsonResponse({ schemaVersion: 99 }));
        await expect(makeClient(fetchImpl).getIndex()).rejects.toThrow();
    });

    it('rejects a non-JSON index loudly', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            status: 200,
            body: Buffer.from('not json'),
            contentType: 'application/json',
        });
        await expect(makeClient(fetchImpl).getIndex()).rejects.toThrow();
    });

    it('returns undefined for an unknown slug', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(index));
        const client = makeClient(fetchImpl);
        expect(await client.getEntry('does-not-exist')).toBeUndefined();
    });

    it('verifies artifact digests and throws on mismatch', async () => {
        const distBytes = Buffer.from('dist-tar-bytes');
        const goodSha = createHash('sha256').update(distBytes).digest('hex');
        const goodEntry = {
            ...entry,
            artifacts: {
                ...entry.artifacts,
                dist: {
                    path: 'charts/sankey/1.2.0/dist.tar',
                    sha256: goodSha,
                },
            },
        };
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({ ...index, charts: [goodEntry] }),
            )
            .mockResolvedValueOnce({
                status: 200,
                body: distBytes,
                contentType: 'application/x-tar',
            });
        const client = makeClient(fetchImpl);
        const buf = await client.downloadArtifact(
            (await client.getEntry('sankey'))!,
            'dist',
        );
        expect(buf.equals(distBytes)).toBe(true);

        const tampered = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({ ...index, charts: [goodEntry] }),
            )
            .mockResolvedValueOnce({
                status: 200,
                body: Buffer.from('evil'),
                contentType: 'application/x-tar',
            });
        const client2 = makeClient(tampered);
        await expect(
            client2.downloadArtifact(
                (await client2.getEntry('sankey'))!,
                'dist',
            ),
        ).rejects.toThrow(/digest/i);
    });

    it('refuses artifact paths that resolve outside the base URL', async () => {
        const evil = {
            ...entry,
            artifacts: {
                ...entry.artifacts,
                dist: {
                    path: 'https://evil.example.com/x.tar',
                    sha256: 'a'.repeat(64),
                },
            },
        };
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ ...index, charts: [evil] }));
        const client = makeClient(fetchImpl);
        await expect(
            client.downloadArtifact((await client.getEntry('sankey'))!, 'dist'),
        ).rejects.toThrow(/outside/i);
    });

    it('only serves assets enumerated in the index', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(index));
        const client = makeClient(fetchImpl);
        expect(await client.getAsset('charts/other/steal.png')).toBeUndefined();
    });

    it('serves an asset path enumerated in the index', async () => {
        const thumbBytes = Buffer.from('thumb-bytes');
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(index))
            .mockResolvedValueOnce({
                status: 200,
                body: thumbBytes,
                contentType: 'image/png',
            });
        const client = makeClient(fetchImpl);
        const asset = await client.getAsset(entry.thumbnail);
        expect(asset?.buffer.equals(thumbBytes)).toBe(true);
        expect(asset?.contentType).toBe('image/png');
        expect(fetchImpl).toHaveBeenLastCalledWith(
            `${BASE}/${entry.thumbnail}`,
        );
    });
});
