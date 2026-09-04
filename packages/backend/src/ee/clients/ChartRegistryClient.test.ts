import { createHash } from 'crypto';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Agent } from 'undici';
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    ChartRegistryClient,
    chartRegistryFetch,
    createPinnedLookup,
    type ChartRegistryFetch as ChartRegistryFetchType,
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
    channel: 'stable' | 'next' = 'stable',
) =>
    new ChartRegistryClient({
        lightdashConfig: {
            appRuntime: {
                chartRegistry: { url, allowInsecure: false, channel },
            },
        } as never,
        fetchImpl: fetchImpl as unknown as ChartRegistryFetchType,
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
        expect(fetchImpl).toHaveBeenCalledWith(
            `${BASE}/index.json`,
            expect.any(Number),
        );
    });

    it('fetches index-next.json on the next channel and keeps beta entries', async () => {
        const betaIndex = {
            ...index,
            charts: [{ ...index.charts[0], channel: 'beta' }],
        };
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(betaIndex));
        const client = makeClient(fetchImpl, BASE, 'next');
        const result = await client.getIndex();
        expect(fetchImpl).toHaveBeenCalledWith(
            `${BASE}/index-next.json`,
            expect.any(Number),
        );
        expect(result.charts[0].channel).toBe('beta');
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

    it('only serves assets under chart slugs present in the index', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(index));
        const client = makeClient(fetchImpl);
        expect(
            await client.getAsset('charts/other/1.0.0/steal.png'),
        ).toBeUndefined();
    });

    it('serves a previous version screenshot no longer enumerated in the index', async () => {
        // The index lists only each chart's latest version, and the listing
        // and asset requests can be served from different index cache
        // generations across a publish — older versions are immutable and
        // still served by the registry, so they must stay proxyable.
        const oldBytes = Buffer.from('old-version-bytes');
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(index))
            .mockResolvedValueOnce({
                status: 200,
                body: oldBytes,
                contentType: 'image/png',
            });
        const client = makeClient(fetchImpl);
        const asset = await client.getAsset(
            'charts/sankey/1.1.0/screenshot-1.png',
        );
        expect(asset?.buffer.equals(oldBytes)).toBe(true);
    });

    it('rejects non-image and malformed asset paths without fetching', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(index));
        const client = makeClient(fetchImpl);
        expect(
            await client.getAsset('charts/sankey/1.2.0/dist.tar'),
        ).toBeUndefined();
        expect(
            await client.getAsset('charts/sankey/1.2.0/../../../etc/pw.png'),
        ).toBeUndefined();
        expect(
            await client.getAsset('charts/sankey/not-semver/shot.png'),
        ).toBeUndefined();
        expect(await client.getAsset('index.json')).toBeUndefined();
        // Shape-rejected paths short-circuit before any fetch, index included.
        expect(fetchImpl).toHaveBeenCalledTimes(0);
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
            expect.any(Number),
        );
    });

    it('treats a non-2xx asset response as absent', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(index))
            .mockResolvedValueOnce({
                status: 404,
                body: Buffer.from('<html>not found</html>'),
                contentType: 'text/html',
            });
        const client = makeClient(fetchImpl);
        expect(await client.getAsset(entry.thumbnail)).toBeUndefined();
    });

    it('rejects an asset content-type outside the image allowlist (e.g. svg)', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(index))
            .mockResolvedValueOnce({
                status: 200,
                body: Buffer.from('<svg onload="alert(1)"></svg>'),
                contentType: 'image/svg+xml',
            });
        const client = makeClient(fetchImpl);
        expect(await client.getAsset(entry.thumbnail)).toBeUndefined();
    });

    it('rejects an asset with a missing content-type', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(index))
            .mockResolvedValueOnce({
                status: 200,
                body: Buffer.from('bytes'),
                contentType: null,
            });
        const client = makeClient(fetchImpl);
        expect(await client.getAsset(entry.thumbnail)).toBeUndefined();
    });
});

// Exercises the real network layer (chartRegistryFetch / defaultFetch)
// against a real HTTP server, rather than the injected fetchImpl used above.
describe('ChartRegistryClient real network (defaultFetch)', () => {
    let server: http.Server | undefined;

    // setupVitest.ts stubs global fetch as a network safety net; these tests
    // specifically need the real implementation, restored afterward.
    beforeAll(() => {
        vi.unstubAllGlobals();
    });

    afterAll(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('', { status: 200 })),
        );
    });

    afterEach(async () => {
        if (server) {
            await new Promise<void>((resolve) => {
                server!.close(() => resolve());
            });
            server = undefined;
        }
    });

    const startServer = (
        handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
    ): Promise<string> =>
        new Promise((resolve) => {
            server = http.createServer(handler);
            server.listen(0, '127.0.0.1', () => {
                const { port } = server!.address() as AddressInfo;
                resolve(`http://127.0.0.1:${port}`);
            });
        });

    const makeRealClient = (baseUrl: string) =>
        new ChartRegistryClient({
            lightdashConfig: {
                appRuntime: {
                    chartRegistry: { url: baseUrl, allowInsecure: true },
                },
            } as never,
        });

    it('does not follow a redirect from the registry', async () => {
        const baseUrl = await startServer((req, res) => {
            if (req.url === '/index.json') {
                res.writeHead(302, {
                    Location: 'http://169.254.169.254/latest/meta-data/',
                });
                res.end();
                return;
            }
            res.writeHead(404);
            res.end();
        });
        const client = makeRealClient(baseUrl);
        await expect(client.getIndex()).rejects.toThrow(/redirect/i);
    });

    it('aborts a response exceeding an injected byte cap, even without a content-length header', async () => {
        const baseUrl = await startServer((req, res) => {
            res.writeHead(200, { 'content-type': 'application/octet-stream' });
            // Two writes with no pre-set content-length force chunked
            // transfer-encoding, so only the streaming cap can catch this.
            res.write(Buffer.alloc(32, 1));
            res.write(Buffer.alloc(32, 2));
            res.end();
        });
        await expect(
            chartRegistryFetch(`${baseUrl}/big`, {
                maxBytes: 16,
                allowPrivateAddresses: true,
            }),
        ).rejects.toThrow(/maximum allowed size/i);
    });

    it('treats a non-2xx asset response as absent end-to-end', async () => {
        const baseUrl = await startServer((req, res) => {
            if (req.url === '/index.json') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(index));
                return;
            }
            if (req.url === '/charts/sankey/1.2.0/thumb.png') {
                res.writeHead(404, { 'content-type': 'text/html' });
                res.end('<html>not found</html>');
                return;
            }
            res.writeHead(404);
            res.end();
        });
        const client = makeRealClient(baseUrl);
        expect(
            await client.getAsset('charts/sankey/1.2.0/thumb.png'),
        ).toBeUndefined();
    });

    it('round-trips a binary asset byte-for-byte', async () => {
        const imageBytes = Buffer.from(
            Array.from({ length: 2048 }, (_, i) => i % 256),
        );
        const baseUrl = await startServer((req, res) => {
            if (req.url === '/index.json') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(index));
                return;
            }
            if (req.url === '/charts/sankey/1.2.0/thumb.png') {
                res.writeHead(200, { 'content-type': 'image/png' });
                res.end(imageBytes);
                return;
            }
            res.writeHead(404);
            res.end();
        });
        const client = makeRealClient(baseUrl);
        const asset = await client.getAsset('charts/sankey/1.2.0/thumb.png');
        expect(asset?.buffer.equals(imageBytes)).toBe(true);
        expect(asset?.contentType).toBe('image/png');
    });

    // Proves the DNS-rebinding fix: createPinnedLookup is the lookup that
    // chartRegistryFetch hands to undici's Agent so the socket connects to
    // the address validatePublicHttpUrl already checked, instead of
    // triggering a second, independently-resolvable DNS lookup.
    describe('pinned dispatcher (createPinnedLookup)', () => {
        it('completes a real request when the URL hostname matches the pin, connecting via the pinned address rather than the hostname', async () => {
            const baseUrl = await startServer((req, res) => {
                res.writeHead(200, { 'content-type': 'text/plain' });
                res.end('pinned-ok');
            });
            const { port } = new URL(baseUrl);
            // The request targets "localhost", but the pin maps it straight
            // to 127.0.0.1 — proving the socket uses the pinned address
            // rather than re-resolving "localhost" itself.
            const dispatcher = new Agent({
                connect: {
                    lookup: createPinnedLookup('localhost', {
                        address: '127.0.0.1',
                        family: 4,
                    }),
                },
            });
            try {
                const response = await fetch(`http://localhost:${port}/`, {
                    dispatcher,
                } as never);
                expect(await response.text()).toBe('pinned-ok');
            } finally {
                await dispatcher.close();
            }
        });

        it('refuses to connect when asked to resolve a hostname other than the one it was pinned for', async () => {
            const baseUrl = await startServer((req, res) => {
                res.writeHead(200);
                res.end('should not be reached');
            });
            const { port } = new URL(baseUrl);
            const dispatcher = new Agent({
                connect: {
                    lookup: createPinnedLookup('charts.example.com', {
                        address: '127.0.0.1',
                        family: 4,
                    }),
                },
            });
            try {
                await expect(
                    fetch(`http://localhost:${port}/`, {
                        dispatcher,
                    } as never),
                ).rejects.toThrow();
            } finally {
                await dispatcher.close();
            }
        });
    });
});

describe('createPinnedLookup', () => {
    it('returns the pinned address for the matching hostname', async () => {
        const lookup = createPinnedLookup('charts.example.com', {
            address: '203.0.113.5',
            family: 4,
        });
        const result = await new Promise((resolve, reject) => {
            lookup('charts.example.com', {}, (err, address, family) => {
                if (err) reject(err);
                else resolve({ address, family });
            });
        });
        expect(result).toEqual({ address: '203.0.113.5', family: 4 });
    });

    it('returns the pinned address for a case-insensitive hostname match', async () => {
        const lookup = createPinnedLookup('Charts.Example.com', {
            address: '203.0.113.5',
            family: 4,
        });
        const result = await new Promise((resolve, reject) => {
            lookup('charts.example.com', {}, (err, address, family) => {
                if (err) reject(err);
                else resolve({ address, family });
            });
        });
        expect(result).toEqual({ address: '203.0.113.5', family: 4 });
    });

    it('honors the { all: true } lookup option by returning an address array', async () => {
        const lookup = createPinnedLookup('charts.example.com', {
            address: '203.0.113.5',
            family: 4,
        });
        const result = await new Promise((resolve, reject) => {
            lookup(
                'charts.example.com',
                { all: true },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (err: unknown, addrs: any) => {
                    if (err) reject(err);
                    else resolve(addrs);
                },
            );
        });
        expect(result).toEqual([{ address: '203.0.113.5', family: 4 }]);
    });

    it('errors for a hostname different from the one it was pinned for', async () => {
        const lookup = createPinnedLookup('charts.example.com', {
            address: '203.0.113.5',
            family: 4,
        });
        await expect(
            new Promise((resolve, reject) => {
                lookup('evil.example.com', {}, (err) => {
                    if (err) reject(err);
                    else resolve(undefined);
                });
            }),
        ).rejects.toThrow(/unexpected hostname/i);
    });
});
