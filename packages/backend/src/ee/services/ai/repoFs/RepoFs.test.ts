import { RepoFs, RepoSource } from './RepoFs';

/**
 * A fake source that records how many times each path is fetched and tracks
 * peak concurrency, with a controllable per-read delay so we can observe the
 * worker pool overlapping reads.
 */
const instrumentedSource = (
    files: Record<string, string>,
    { delayMs = 0 }: { delayMs?: number } = {},
): RepoSource & { reads: Record<string, number>; peakConcurrency: number } => {
    const reads: Record<string, number> = {};
    let inFlight = 0;
    let peak = 0;
    const source = {
        label: 'acme/jaffle@main',
        reads,
        get peakConcurrency() {
            return peak;
        },
        listAllPaths: async () => ({
            files: Object.entries(files).map(([path, content]) => ({
                path,
                size: content.length,
            })),
            truncated: false,
        }),
        readFile: async (path: string) => {
            reads[path] = (reads[path] ?? 0) + 1;
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await new Promise((resolve) => {
                setTimeout(resolve, delayMs);
            });
            inFlight -= 1;
            return files[path] ?? null;
        },
    };
    return source;
};

describe('RepoFs.readFiles', () => {
    it('returns content for every path (null for misses)', async () => {
        const repo = new RepoFs(
            instrumentedSource({
                'a.sql': 'AAA',
                'b.sql': 'BBB',
            }),
        );
        const result = await repo.readFiles(['a.sql', 'b.sql', 'missing.sql']);
        expect(result.get('a.sql')).toBe('AAA');
        expect(result.get('b.sql')).toBe('BBB');
        expect(result.get('missing.sql')).toBeNull();
    });

    it('reads with bounded concurrency (does not exceed the limit)', async () => {
        const files: Record<string, string> = {};
        for (let i = 0; i < 30; i += 1) files[`f${i}.sql`] = `x${i}`;
        const source = instrumentedSource(files, { delayMs: 5 });
        const repo = new RepoFs(source);

        await repo.readFiles(Object.keys(files), 4);

        expect(source.peakConcurrency).toBeGreaterThan(1); // actually parallel
        expect(source.peakConcurrency).toBeLessThanOrEqual(4); // but bounded
    });

    it('caches reads so a repeated fetch never hits the source twice', async () => {
        const source = instrumentedSource({ 'a.sql': 'AAA' });
        const repo = new RepoFs(source);
        await repo.readFiles(['a.sql']);
        await repo.readFile('a.sql');
        await repo.readFiles(['a.sql']);
        expect(source.reads['a.sql']).toBe(1);
    });

    it('shares a single tree fetch across concurrent reads', async () => {
        let listCalls = 0;
        const source: RepoSource = {
            label: 'acme/jaffle@main',
            listAllPaths: async () => {
                listCalls += 1;
                await new Promise((resolve) => {
                    setTimeout(resolve, 5);
                });
                return {
                    files: [
                        { path: 'a.sql', size: 3 },
                        { path: 'b.sql', size: 3 },
                    ],
                    truncated: false,
                };
            },
            readFile: async (path) => (path === 'a.sql' ? 'AAA' : 'BBB'),
        };
        const repo = new RepoFs(source);
        // Fire concurrent reads before the index is built — they must not each
        // kick off their own listAllPaths.
        await Promise.all([repo.readFile('a.sql'), repo.readFile('b.sql')]);
        expect(listCalls).toBe(1);
    });
});

describe('RepoFs file cache LRU eviction', () => {
    it('evicts least-recently-used entries once over the byte cap', async () => {
        // 100-byte files, cap at 250 bytes → at most 2 fit.
        const big = (c: string) => c.repeat(100);
        const source = instrumentedSource({
            'a.sql': big('a'),
            'b.sql': big('b'),
            'c.sql': big('c'),
        });
        const repo = new RepoFs(source, 250);

        await repo.readFile('a.sql'); // cache: [a]
        await repo.readFile('b.sql'); // cache: [a, b]
        await repo.readFile('c.sql'); // adding c (300b > 250) evicts a → [b, c]
        expect(source.reads['a.sql']).toBe(1);

        // a was evicted → re-reading hits the source again (and re-adding it
        // evicts b, now the oldest → [c, a]).
        await repo.readFile('a.sql');
        expect(source.reads['a.sql']).toBe(2);

        // c stayed cached throughout → still served from memory.
        await repo.readFile('c.sql');
        expect(source.reads['c.sql']).toBe(1);
    });

    it('refreshes recency on read so a reused entry survives eviction', async () => {
        const big = (c: string) => c.repeat(100);
        const source = instrumentedSource({
            'a.sql': big('a'),
            'b.sql': big('b'),
            'c.sql': big('c'),
        });
        const repo = new RepoFs(source, 250);

        await repo.readFile('a.sql'); // [a]
        await repo.readFile('b.sql'); // [a, b]
        await repo.readFile('a.sql'); // touch a → [b, a]
        await repo.readFile('c.sql'); // evicts b (now oldest) → [a, c]

        await repo.readFile('a.sql'); // still cached
        expect(source.reads['a.sql']).toBe(1);
        await repo.readFile('b.sql'); // was evicted
        expect(source.reads['b.sql']).toBe(2);
    });
});
