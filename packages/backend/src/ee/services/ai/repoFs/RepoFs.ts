/**
 * Read-only in-memory virtual filesystem over a git repository, backed by an
 * abstract {@link RepoSource} (the GitHub API in production) instead of an E2B
 * sandbox/clone. The directory tree is fetched once and indexed in memory so
 * `ls`/`find` resolve with zero network calls; file contents are fetched lazily
 * on `cat`/`grep` and cached. All write operations are absent by construction.
 *
 * See the #engineering discussion of Mintlify's ChromaFs — this is the same
 * "intercept commands, translate to backing-store reads" idea, scoped to a dbt
 * repo and backed by the GitHub Git Trees + Contents APIs.
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

type RepoIndex = {
    /** path -> size, for every file (blob) in the repo. */
    files: Map<string, number>;
    /** directory path ("" = root) -> set of immediate child names. */
    children: Map<string, Set<{ name: string; type: RepoEntryType }>>;
    sortedPaths: string[];
    truncated: boolean;
};

export class RepoFs {
    private readonly source: RepoSource;

    private index: RepoIndex | null = null;

    private readonly fileCache = new Map<string, string | null>();

    constructor(source: RepoSource) {
        this.source = source;
    }

    get label(): string {
        return this.source.label;
    }

    private async ensureIndex(): Promise<RepoIndex> {
        if (this.index) return this.index;

        const { files, truncated } = await this.source.listAllPaths();
        const fileMap = new Map<string, number>();
        const children = new Map<
            string,
            Set<{ name: string; type: RepoEntryType }>
        >();
        const dirSet = new Set<string>();

        const addChild = (
            dir: string,
            name: string,
            type: RepoEntryType,
        ): void => {
            if (!children.has(dir)) children.set(dir, new Set());
            const set = children.get(dir)!;
            // Set identity is by reference, so dedupe on name+type manually.
            if (![...set].some((c) => c.name === name && c.type === type)) {
                set.add({ name, type });
            }
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
                    dirSet.add(prefix ? `${prefix}/${name}` : name);
                    prefix = prefix ? `${prefix}/${name}` : name;
                }
                addChild(dirname(normalized), basename(normalized), 'file');
            }
        }

        this.index = {
            files: fileMap,
            children,
            sortedPaths: [...fileMap.keys()].sort(),
            truncated,
        };
        return this.index;
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
        const set = index.children.get(normalized);
        if (!set) return [];
        return [...set].sort((a, b) => {
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
     * Every file path under `base` (recursive). `base === ''` means the whole
     * repo. Includes matching directory paths only when requested.
     */
    async walk(
        base: string,
        opts: { type?: RepoEntryType; nameGlob?: string } = {},
    ): Promise<string[]> {
        const index = await this.ensureIndex();
        const normalized = normalizePath(base);
        const prefix = normalized ? `${normalized}/` : '';
        const nameRe = opts.nameGlob ? globToRegExp(opts.nameGlob) : null;

        const results: string[] = [];

        const matches = (path: string): boolean =>
            !nameRe || nameRe.test(basename(path));

        if (opts.type !== 'dir') {
            for (const path of index.sortedPaths) {
                if (
                    (normalized === '' ||
                        path === normalized ||
                        path.startsWith(prefix)) &&
                    matches(path)
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
                if (underBase && matches(dir)) dirs.add(dir);
            }
            results.push(...dirs);
        }

        return results.sort();
    }

    async readFile(path: string): Promise<string | null> {
        const normalized = normalizePath(path);
        if (this.fileCache.has(normalized)) {
            return this.fileCache.get(normalized) ?? null;
        }
        const index = await this.ensureIndex();
        if (!index.files.has(normalized)) {
            this.fileCache.set(normalized, null);
            return null;
        }
        const content = await this.source.readFile(normalized);
        this.fileCache.set(normalized, content);
        return content;
    }
}
