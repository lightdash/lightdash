/**
 * A single read-only {@link IFileSystem} that mounts MANY repositories at once,
 * so the agent reads them through one filesystem instead of one {@link RepoFs}
 * per `exploreRepo` target. Two kinds of mount:
 *
 *  - `/dbt/...`            → the project's dbt repo, subPath-scoped exactly as the
 *                            no-target `exploreRepo` path (denylist + chroot intact).
 *  - `/<owner>/<repo>/...` → any repository the org's installation can see, whole,
 *                            on its default branch.
 *
 * Laziness is the whole point. Construction fetches only the *list* of repos
 * (one cheap installation call — no trees), so the mount points are known
 * synchronously. A repo's git tree is fetched only when the agent first descends
 * into its mount, by materialising a per-mount {@link RepoFileSystem} (which
 * reuses all the per-repo machinery: tree index, lazy file cache, denylist,
 * `..` guard). A per-run materialisation budget caps how many repos a single
 * `grep -r /` can pull before erroring, so an unscoped recursive walk can't fan
 * out across every accessible repo.
 *
 * All mutating methods throw `EROFS` (read-only by construction), mirroring
 * {@link RepoFileSystem}.
 */
// Implementing an external interface (just-bash's IFileSystem) whose read-only
// stubs and pure path helpers legitimately don't touch instance state.
/* eslint-disable class-methods-use-this */
import type { FsStat, IFileSystem } from 'just-bash';
import { RepoFileSystem } from './repoFileSystem';
import type { RepoFs } from './RepoFs';

// just-bash's optional readdirWithFileTypes return shape (not exported by name;
// mirrors the local type in {@link ./repoFileSystem}).
type DirentEntry = {
    name: string;
    isFile: boolean;
    isDirectory: boolean;
    isSymbolicLink: boolean;
};

/** A repository the installation can read, as listed for the mount points. */
export type MountableRepo = {
    owner: string;
    repo: string;
};

/** The `/dbt` mount key — a repo named `dbt` would collide, so dbt wins and the
 *  system prompt documents `/dbt` as the dbt project. */
export const DBT_MOUNT = 'dbt';

/** Default cap on how many repository trees a single run may materialise — the
 *  guard that bounds an unscoped recursive walk (`grep -r /`) across a large
 *  installation. Generous for deliberate multi-repo reads, far below "all". */
export const DEFAULT_MAX_MATERIALISED_REPOS = 3;

const FILE_MODE = 0o100644;
const DIR_MODE = 0o040755;
const EPOCH = new Date(0);

const DIR_STAT: FsStat = {
    isFile: false,
    isDirectory: true,
    isSymbolicLink: false,
    mode: DIR_MODE,
    size: 0,
    mtime: EPOCH,
};

const enoent = (path: string): Error =>
    Object.assign(new Error(`ENOENT: no such file or directory: '${path}'`), {
        code: 'ENOENT',
    });
const enotdir = (path: string): Error =>
    Object.assign(new Error(`ENOTDIR: not a directory: '${path}'`), {
        code: 'ENOTDIR',
    });
const erofs = (): never => {
    throw Object.assign(
        new Error('EROFS: read-only file system (repositories are read-only)'),
        { code: 'EROFS' },
    );
};
/** Budget exhaustion: surfaced to the agent as a recoverable shell error (the
 *  `EACCES` code is mapped to a ShellError in {@link ./bashShell}). */
const ebudget = (max: number): never => {
    throw Object.assign(
        new Error(
            `EACCES: too many repositories opened in one command (limit ${max}). ` +
                `Target a specific repository path (e.g. /owner/repo/...) instead of a repo-spanning walk.`,
        ),
        { code: 'EACCES' },
    );
};

/** Resolve `base`/`path` to a clean absolute path, collapsing `.`/`..`. Mirrors
 *  the helper in {@link RepoFileSystem} so cross-mount `..` is flattened here
 *  before routing — a `..` can climb out of a mount into the virtual tree, but
 *  never escapes the mount root into the *backing* repo (each delegate re-guards). */
const resolveAbsolute = (base: string, path: string): string => {
    const start = path.startsWith('/') ? '/' : base || '/';
    const out: string[] = [];
    for (const segment of `${start}/${path}`.split('/')) {
        if (segment === '..') out.pop();
        else if (segment !== '' && segment !== '.') out.push(segment);
    }
    return `/${out.join('/')}`;
};

const segmentsOf = (absPath: string): string[] =>
    absPath.split('/').filter((s) => s !== '');

/**
 * Where an absolute path lands in the mount tree:
 *  - `root`             the virtual root `/`
 *  - `owner`            a virtual `/<owner>` directory (lists that owner's repos)
 *  - `mount`            inside a repo mount; `key` identifies it, `subPath` is the
 *                       repo-relative absolute path to delegate (always starts `/`)
 *  - `missing`          no such mount point
 */
type Resolution =
    | { type: 'root' }
    | { type: 'owner'; owner: string }
    | { type: 'mount'; key: string; owner: string | null; subPath: string }
    | { type: 'missing' };

export class MountingRepoFileSystem implements IFileSystem {
    private readonly repos: MountableRepo[];

    /** Whether `/dbt` is mounted (the project has a GitHub-backed dbt repo).
     *  Public so the caller can pick the no-target starting directory. */
    readonly hasDbtMount: boolean;

    private readonly buildDbtRepoFs: () => Promise<RepoFs>;

    private readonly buildRepoFs: (
        owner: string,
        repo: string,
    ) => Promise<RepoFs>;

    private readonly maxRepos: number;

    /** Distinct owners, sorted — the immediate children of `/`. */
    private readonly owners: string[];

    /** `owner` -> sorted repo names, for `/<owner>` listings. */
    private readonly reposByOwner: Map<string, string[]>;

    /** Set of valid `owner/repo` mount keys for O(1) existence checks. */
    private readonly repoKeys: Set<string>;

    /** Lazily-materialised per-mount adapters, keyed by mount key
     *  (`dbt` or `owner/repo`). The map size is the materialisation budget. */
    private readonly mounts = new Map<string, Promise<RepoFileSystem>>();

    /** Mounts whose adapter has finished building, for the synchronous
     *  {@link getAllPaths} (populated when each `mounts` promise resolves). */
    private readonly resolved = new Map<string, RepoFileSystem>();

    /** Mount keys whose GitHub tree listing was truncated (large repos), for the
     *  "results may be incomplete" advisory after find/grep/ls. */
    private readonly truncatedMounts = new Set<string>();

    private constructor(opts: {
        repos: MountableRepo[];
        hasDbtMount: boolean;
        buildDbtRepoFs: () => Promise<RepoFs>;
        buildRepoFs: (owner: string, repo: string) => Promise<RepoFs>;
        maxRepos: number;
    }) {
        this.repos = opts.repos;
        this.hasDbtMount = opts.hasDbtMount;
        this.buildDbtRepoFs = opts.buildDbtRepoFs;
        this.buildRepoFs = opts.buildRepoFs;
        this.maxRepos = opts.maxRepos;

        this.reposByOwner = new Map();
        this.repoKeys = new Set();
        for (const { owner, repo } of opts.repos) {
            this.repoKeys.add(`${owner}/${repo}`);
            const list = this.reposByOwner.get(owner) ?? [];
            list.push(repo);
            this.reposByOwner.set(owner, list);
        }
        for (const list of this.reposByOwner.values())
            list.sort((a, b) => a.localeCompare(b));
        this.owners = [...this.reposByOwner.keys()].sort((a, b) =>
            a.localeCompare(b),
        );
    }

    /**
     * Fetch the repo list (one installation call, no trees) and build the mount
     * tree. Per-repo trees are fetched lazily later, on first descent.
     */
    static async create(opts: {
        listRepos: () => Promise<MountableRepo[]>;
        hasDbtMount: boolean;
        buildDbtRepoFs: () => Promise<RepoFs>;
        buildRepoFs: (owner: string, repo: string) => Promise<RepoFs>;
        maxRepos: number;
    }): Promise<MountingRepoFileSystem> {
        const repos = await opts.listRepos();
        return new MountingRepoFileSystem({ ...opts, repos });
    }

    // ---- routing ----

    private resolve(absPath: string): Resolution {
        const segments = segmentsOf(absPath);
        if (segments.length === 0) return { type: 'root' };

        if (this.hasDbtMount && segments[0] === DBT_MOUNT) {
            return {
                type: 'mount',
                key: DBT_MOUNT,
                owner: null,
                subPath: `/${segments.slice(1).join('/')}`,
            };
        }

        const [owner, repo] = segments;
        if (segments.length === 1) {
            return this.reposByOwner.has(owner)
                ? { type: 'owner', owner }
                : { type: 'missing' };
        }
        if (this.repoKeys.has(`${owner}/${repo}`)) {
            return {
                type: 'mount',
                key: `${owner}/${repo}`,
                owner,
                subPath: `/${segments.slice(2).join('/')}`,
            };
        }
        return { type: 'missing' };
    }

    /** Materialise (or reuse) a mount's adapter, enforcing the budget on the
     *  first materialisation of each new mount. */
    private getMount(key: string): Promise<RepoFileSystem> {
        const existing = this.mounts.get(key);
        if (existing) return existing;
        if (this.mounts.size >= this.maxRepos) ebudget(this.maxRepos);

        const promise = (async () => {
            const repoFs =
                key === DBT_MOUNT
                    ? await this.buildDbtRepoFs()
                    : await this.buildRepoFs(
                          ...(key.split('/') as [string, string]),
                      );
            const adapter = await RepoFileSystem.create(repoFs);
            if (await repoFs.isTruncated()) this.truncatedMounts.add(key);
            this.resolved.set(key, adapter);
            return adapter;
        })();
        this.mounts.set(key, promise);
        return promise;
    }

    // ---- reads ----

    async readFile(path: string): Promise<string> {
        const r = this.resolve(resolveAbsolute('/', path));
        if (r.type !== 'mount') throw enoent(path); // dirs / missing aren't files
        const fs = await this.getMount(r.key);
        return fs.readFile(r.subPath);
    }

    async readFileBuffer(path: string): Promise<Uint8Array> {
        return new TextEncoder().encode(await this.readFile(path));
    }

    async exists(path: string): Promise<boolean> {
        const r = this.resolve(resolveAbsolute('/', path));
        if (r.type === 'root' || r.type === 'owner') return true;
        if (r.type === 'missing') return false;
        if (r.subPath === '/') return true; // the mount root exists without a fetch
        const fs = await this.getMount(r.key);
        return fs.exists(r.subPath);
    }

    private async statResolved(path: string): Promise<FsStat> {
        const r = this.resolve(resolveAbsolute('/', path));
        if (r.type === 'missing') throw enoent(path);
        if (r.type === 'root' || r.type === 'owner') return DIR_STAT;
        if (r.subPath === '/') return DIR_STAT; // mount root is a directory
        const fs = await this.getMount(r.key);
        return fs.stat(r.subPath);
    }

    stat(path: string): Promise<FsStat> {
        return this.statResolved(path);
    }

    lstat(path: string): Promise<FsStat> {
        return this.statResolved(path); // no symlinks in the VFS
    }

    async readdir(path: string): Promise<string[]> {
        const r = this.resolve(resolveAbsolute('/', path));
        if (r.type === 'missing') throw enoent(path);
        if (r.type === 'root')
            return [...(this.hasDbtMount ? [DBT_MOUNT] : []), ...this.owners];
        if (r.type === 'owner') return this.reposByOwner.get(r.owner) ?? [];
        const fs = await this.getMount(r.key);
        return fs.readdir(r.subPath);
    }

    async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
        const r = this.resolve(resolveAbsolute('/', path));
        if (r.type === 'missing') throw enoent(path);
        const asDir = (name: string): DirentEntry => ({
            name,
            isFile: false,
            isDirectory: true,
            isSymbolicLink: false,
        });
        if (r.type === 'root')
            return [
                ...(this.hasDbtMount ? [DBT_MOUNT] : []),
                ...this.owners,
            ].map(asDir);
        if (r.type === 'owner')
            return (this.reposByOwner.get(r.owner) ?? []).map(asDir);
        const fs = await this.getMount(r.key);
        return fs.readdirWithFileTypes(r.subPath);
    }

    /**
     * Synchronous glob index. Returns the static mount points plus the paths of
     * every *already-materialised* mount (each prefixed with its mount path).
     * Unmaterialised repos contribute only their mount directory, so a glob
     * can't silently fan out into a repo the agent hasn't opened — consistent
     * with the lazy contract. just-bash calls this synchronously, and every
     * materialised delegate's snapshot is already resolved.
     */
    getAllPaths(): string[] {
        const paths = new Set<string>(['/']);
        if (this.hasDbtMount) paths.add(`/${DBT_MOUNT}`);
        for (const owner of this.owners) {
            paths.add(`/${owner}`);
            for (const repo of this.reposByOwner.get(owner) ?? [])
                paths.add(`/${owner}/${repo}`);
        }
        for (const [key, adapter] of this.resolved) {
            const prefix = key === DBT_MOUNT ? `/${DBT_MOUNT}` : `/${key}`;
            for (const p of adapter.getAllPaths()) {
                // the mount root ('/') is already added above
                if (p !== '/') paths.add(`${prefix}${p}`);
            }
        }
        return [...paths].sort();
    }

    async realpath(path: string): Promise<string> {
        const abs = resolveAbsolute('/', path);
        const r = this.resolve(abs);
        if (r.type === 'missing') throw enoent(path);
        if (r.type === 'mount' && r.subPath !== '/') {
            const fs = await this.getMount(r.key);
            if (!(await fs.exists(r.subPath))) throw enoent(path);
        }
        return abs;
    }

    resolvePath(base: string, path: string): string {
        return resolveAbsolute(base, path);
    }

    /** True once any materialised mount had its GitHub tree listing truncated,
     *  so find/grep/ls results across the VFS may be incomplete. */
    isTruncated(): boolean {
        return this.truncatedMounts.size > 0;
    }

    readlink(path: string): Promise<string> {
        throw Object.assign(new Error(`EINVAL: not a symlink: '${path}'`), {
            code: 'EINVAL',
        });
    }

    // ---- mutations: absent by construction → always EROFS. ----
    writeFile(): Promise<void> {
        return erofs();
    }

    appendFile(): Promise<void> {
        return erofs();
    }

    mkdir(): Promise<void> {
        return erofs();
    }

    rm(): Promise<void> {
        return erofs();
    }

    cp(): Promise<void> {
        return erofs();
    }

    mv(): Promise<void> {
        return erofs();
    }

    chmod(): Promise<void> {
        return erofs();
    }

    symlink(): Promise<void> {
        return erofs();
    }

    link(): Promise<void> {
        return erofs();
    }

    utimes(): Promise<void> {
        return erofs();
    }
}
