/**
 * Read-only in-memory virtual filesystem over a git repository, backed by an
 * abstract {@link RepoSource} (the GitHub API in production) instead of an E2B
 * sandbox/clone. The directory tree is fetched once and indexed in memory so
 * `ls`/`find` resolve with zero network calls; file contents are fetched lazily
 * on `cat`/`grep` and cached. All write operations are absent by construction.
 *
 * It's the "intercept commands, translate to backing-store reads" idea, scoped to
 * a dbt repo and backed by the GitHub Git Trees + Contents APIs.
 */

export type RepoEntryType = 'file' | 'dir';

export interface RepoSource {
    /** Human-readable identifier, e.g. "owner/repo@main". */
    readonly label: string;
    /** Every file path in the repo (relative, no leading slash). */
    listAllPaths(): Promise<{
        files: { path: string; size: number }[];
        truncated: boolean;
    }>;
    /** File content as UTF-8, or null if missing/too large/binary. */
    readFile(path: string): Promise<string | null>;
}

export class RepoNotFoundError extends Error {}

const normalizePath = (input: string): string => {
    // Strip a leading "./" or "/", drop a trailing "/", collapse "//".
    let path = input.trim();
    if (path === '.' || path === '' || path === '/' || path === './') return '';
    path = path.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
    return path;
};

const basename = (path: string): string => {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? path : path.slice(idx + 1);
};

const dirname = (path: string): string => {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? '' : path.slice(0, idx);
};

/** Convert a shell glob (supporting * and ?) into an anchored RegExp. */
export const globToRegExp = (glob: string): RegExp => {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${pattern}$`);
};

// Cap the lazy file-content cache by total bytes so a wide crawl (e.g. a grep
// across a large repo) can't grow it without bound. Least-recently-used entries
// are evicted once over the cap; ~32MB is generous for dbt source files.
const MAX_CACHE_BYTES = 32 * 1024 * 1024;

// GitHub Contents reads are round-trip-bound (~150-200ms each), so a serial
// crawl of N files costs ~N × that. Reading with bounded concurrency cuts the
// wall-clock ~10× while capping simultaneous requests (and peak memory).
const DEFAULT_READ_CONCURRENCY = 10;

type RepoIndex = {
    /** path -> size, for every file (blob) in the repo. */
    files: Map<string, number>;
    /** directory path ("" = root) -> (immediate child name -> entry type). */
    children: Map<string, Map<string, RepoEntryType>>;
    sortedPaths: string[];
    truncated: boolean;
};

export class RepoFs {
    private readonly source: RepoSource;

    // Memoised so concurrent reads (see readFiles) share a single tree fetch
    // rather than each racing their own source.listAllPaths().
    private indexPromise: Promise<RepoIndex> | null = null;

    // Insertion-ordered LRU of file contents, bounded by cacheBytes/MAX_CACHE_BYTES.
    private readonly fileCache = new Map<string, string | null>();

    private cacheBytes = 0;

    private readonly maxCacheBytes: number;

    constructor(source: RepoSource, maxCacheBytes: number = MAX_CACHE_BYTES) {
        this.source = source;
        this.maxCacheBytes = maxCacheBytes;
    }

    get label(): string {
        return this.source.label;
    }

    private async ensureIndex(): Promise<RepoIndex> {
        if (!this.indexPromise) this.indexPromise = this.buildIndex();
        return this.indexPromise;
    }

    private async buildIndex(): Promise<RepoIndex> {
        const { files, truncated } = await this.source.listAllPaths();
        const fileMap = new Map<string, number>();
        const children = new Map<string, Map<string, RepoEntryType>>();

        const addChild = (
            dir: string,
            name: string,
            type: RepoEntryType,
        ): void => {
            if (!children.has(dir)) children.set(dir, new Map());
            // Map keys dedupe by name in O(1) — a path is either a file or a
            // dir, never both, so the type never conflicts for a given name.
            children.get(dir)!.set(name, type);
        };

        for (const { path, size } of files) {
            const normalized = normalizePath(path);
            if (normalized) {
                fileMap.set(normalized, size);

                // Register every ancestor directory so `ls`/`find` see them.
                const segments = normalized.split('/');
                let prefix = '';
                for (let i = 0; i < segments.length - 1; i += 1) {
                    const dir = prefix;
                    const name = segments[i];
                    addChild(dir, name, 'dir');
                    prefix = prefix ? `${prefix}/${name}` : name;
                }
                addChild(dirname(normalized), basename(normalized), 'file');
            }
        }

        return {
            files: fileMap,
            children,
            sortedPaths: [...fileMap.keys()].sort(),
            truncated,
        };
    }

    async isFile(path: string): Promise<boolean> {
        const index = await this.ensureIndex();
        return index.files.has(normalizePath(path));
    }

    async isDir(path: string): Promise<boolean> {
        const index = await this.ensureIndex();
        const normalized = normalizePath(path);
        if (normalized === '') return true; // root
        return index.children.has(normalized);
    }

    /** Immediate children of a directory, sorted dirs-first then files. */
    async listDir(
        path: string,
    ): Promise<{ name: string; type: RepoEntryType }[]> {
        const index = await this.ensureIndex();
        const normalized = normalizePath(path);
        const entries = index.children.get(normalized);
        if (!entries) return [];
        return [...entries.entries()]
            .map(([name, type]) => ({ name, type }))
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
    }

    async listAll(): Promise<{ paths: string[]; truncated: boolean }> {
        const index = await this.ensureIndex();
        return { paths: index.sortedPaths, truncated: index.truncated };
    }

    /** True when the backing source capped the file listing (large repos). */
    async isTruncated(): Promise<boolean> {
        const index = await this.ensureIndex();
        return index.truncated;
    }

    /**
     * Type + size of a path from the in-memory index, or null if absent. Size is
     * the blob size for files and 0 for directories; reads no file content. Lets
     * the {@link RepoFileSystem} adapter answer `stat`/`exists` without a fetch.
     */
    async statEntry(
        path: string,
    ): Promise<{ type: RepoEntryType; size: number } | null> {
        const index = await this.ensureIndex();
        const normalized = normalizePath(path);
        if (normalized === '') return { type: 'dir', size: 0 };
        const size = index.files.get(normalized);
        if (size !== undefined) return { type: 'file', size };
        if (index.children.has(normalized)) return { type: 'dir', size: 0 };
        return null;
    }

    /**
     * Every file path under `base` (recursive). `base === ''` means the whole
     * repo. Includes matching directory paths only when requested.
     */
    async walk(
        base: string,
        opts: {
            type?: RepoEntryType;
            nameGlobs?: string[];
            maxDepth?: number;
        } = {},
    ): Promise<string[]> {
        const index = await this.ensureIndex();
        const normalized = normalizePath(base);
        const prefix = normalized ? `${normalized}/` : '';
        // Multiple globs are OR-ed (find's `-name a -o -name b`); none = match all.
        const nameRes = (opts.nameGlobs ?? []).map(globToRegExp);

        const results: string[] = [];

        const matches = (path: string): boolean =>
            nameRes.length === 0 ||
            nameRes.some((re) => re.test(basename(path)));

        // find's `-maxdepth N` counts path segments below the base; N=1 keeps
        // only immediate children. `undefined` means unbounded (the default).
        const baseSegments =
            normalized === '' ? 0 : normalized.split('/').length;
        const withinDepth = (path: string): boolean =>
            opts.maxDepth === undefined ||
            path.split('/').length - baseSegments <= opts.maxDepth;

        if (opts.type !== 'dir') {
            for (const path of index.sortedPaths) {
                if (
                    (normalized === '' ||
                        path === normalized ||
                        path.startsWith(prefix)) &&
                    matches(path) &&
                    withinDepth(path)
                ) {
                    results.push(path);
                }
            }
        }

        if (opts.type !== 'file') {
            const dirs = new Set<string>();
            for (const dir of index.children.keys()) {
                const underBase =
                    dir !== '' &&
                    (normalized === '' ||
                        dir === normalized ||
                        dir.startsWith(prefix));
                if (underBase && matches(dir) && withinDepth(dir))
                    dirs.add(dir);
            }
            results.push(...dirs);
        }

        return results.sort();
    }

    /** LRU read: returns {hit} so a cached `null` (known miss) is distinguished
     * from an absent entry, and refreshes recency by re-inserting at the end. */
    private cacheRead(path: string): { hit: boolean; value: string | null } {
        if (!this.fileCache.has(path)) return { hit: false, value: null };
        const value = this.fileCache.get(path) ?? null;
        this.fileCache.delete(path);
        this.fileCache.set(path, value);
        return { hit: true, value };
    }

    /** LRU write: tracks total bytes and evicts the least-recently-used entries
     * (front of the Map) until back under {@link MAX_CACHE_BYTES}. */
    private cacheWrite(path: string, value: string | null): void {
        if (this.fileCache.has(path)) {
            this.cacheBytes -= this.fileCache.get(path)?.length ?? 0;
            this.fileCache.delete(path);
        }
        this.fileCache.set(path, value);
        this.cacheBytes += value?.length ?? 0;
        while (
            this.cacheBytes > this.maxCacheBytes &&
            this.fileCache.size > 1
        ) {
            const oldest = this.fileCache.keys().next().value as string;
            if (oldest === path) break; // never evict the entry just written
            this.cacheBytes -= this.fileCache.get(oldest)?.length ?? 0;
            this.fileCache.delete(oldest);
        }
    }

    async readFile(path: string): Promise<string | null> {
        const normalized = normalizePath(path);
        const cached = this.cacheRead(normalized);
        if (cached.hit) return cached.value;
        // Never let a `..` segment escape the sub-path chroot the source enforces
        // by prefixing every read — the index gate below stops it on a complete
        // tree, but the truncated-tree fallback would otherwise resolve it.
        if (normalized.split('/').includes('..')) {
            this.cacheWrite(normalized, null);
            return null;
        }
        const index = await this.ensureIndex();
        // When the tree listing is complete it's authoritative, so a miss means
        // the file genuinely doesn't exist — skip the wasted Contents API call.
        // When it's truncated, the file may exist despite being absent from the
        // capped listing, so ask the source directly (it can fetch an explicit
        // path) instead of falsely reporting "No such file". Caveat: symlinks
        // are stripped from the tree (see getRepoTree) so a complete listing
        // can't resolve one, but this truncated read-through bypasses the index
        // and could still follow a symlink in a >100k-entry repo — a narrow
        // residual we accept rather than break reads of files the cap omitted.
        if (!index.files.has(normalized) && !index.truncated) {
            this.cacheWrite(normalized, null);
            return null;
        }
        const content = await this.source.readFile(normalized);
        this.cacheWrite(normalized, content);
        return content;
    }

    /**
     * Read many files with bounded concurrency, returning a path→content map
     * (null for missing files). GitHub Contents reads are round-trip-bound, so a
     * worker pool cuts a multi-file crawl's wall-clock ~10× versus a serial loop
     * while capping simultaneous requests. Each file still flows through
     * {@link readFile}, so caching and the chroot guard are unchanged.
     */
    async readFiles(
        paths: string[],
        concurrency: number = DEFAULT_READ_CONCURRENCY,
    ): Promise<Map<string, string | null>> {
        const result = new Map<string, string | null>();
        let cursor = 0;
        const worker = async (): Promise<void> => {
            while (cursor < paths.length) {
                const path = paths[cursor];
                cursor += 1;
                // eslint-disable-next-line no-await-in-loop
                result.set(path, await this.readFile(path));
            }
        };
        const workers = Math.max(1, Math.min(concurrency, paths.length));
        await Promise.all(Array.from({ length: workers }, () => worker()));
        return result;
    }
}
