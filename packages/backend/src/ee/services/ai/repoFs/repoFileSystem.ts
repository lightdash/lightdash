/**
 * A read-only {@link IFileSystem} (just-bash's pluggable filesystem seam) backed
 * by {@link RepoFs}. This is the adapter that lets just-bash own all the bash
 * parsing/piping/flag handling while we keep the part that's actually ours: the
 * GitHub-backed tree index, lazy file fetch, LRU cache, truncation handling and
 * `..` chroot guard inside RepoFs.
 *
 * Read methods delegate to RepoFs (async, network-backed, cached). Every mutating
 * method throws `EROFS` — so the repository is read-only *by construction* even
 * though just-bash's command set is read-only only *by configuration* (the
 * command allowlist in {@link ./bashShell}). The two layers are independent.
 *
 * Paths arrive absolute (`/models/orders.sql`); RepoFs works in repository-
 * relative paths, so `toRepoRelative` resolves `.`/`..` and strips the leading
 * slash.
 */
// Implementing an external interface (just-bash's IFileSystem) whose read-only
// stubs and pure path helpers legitimately don't touch instance state.
/* eslint-disable class-methods-use-this */
import type { FsStat, IFileSystem } from 'just-bash';
import type { RepoCodeSearchMatch, RepoFs } from './RepoFs';

// just-bash's optional readdirWithFileTypes return shape (not exported by name).
type DirentEntry = {
    name: string;
    isFile: boolean;
    isDirectory: boolean;
    isSymbolicLink: boolean;
};

const FILE_MODE = 0o100644;
const DIR_MODE = 0o040755;
const EPOCH = new Date(0);

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
        new Error('EROFS: read-only file system (the dbt repo is read-only)'),
        { code: 'EROFS' },
    );
};

/** Resolve `base`/`path` to a clean absolute path, collapsing `.`/`..`. */
const resolveAbsolute = (base: string, path: string): string => {
    const start = path.startsWith('/') ? '/' : base || '/';
    const out: string[] = [];
    for (const segment of `${start}/${path}`.split('/')) {
        if (segment === '..') out.pop();
        else if (segment !== '' && segment !== '.') out.push(segment);
    }
    return `/${out.join('/')}`;
};

const toRepoRelative = (path: string): string =>
    resolveAbsolute('/', path).replace(/^\/+/, '');

export class RepoFileSystem implements IFileSystem {
    private readonly repoFs: RepoFs;

    // All file + directory paths (absolute), captured once so getAllPaths — the
    // one synchronous method just-bash calls (for glob expansion) — needs no
    // await. The async tree fetch is memoised in RepoFs and already complete.
    private readonly snapshot: string[];

    private constructor(repoFs: RepoFs, snapshot: string[]) {
        this.repoFs = repoFs;
        this.snapshot = snapshot;
    }

    /** Materialise the path index, then build the adapter. */
    static async create(repoFs: RepoFs): Promise<RepoFileSystem> {
        const { paths } = await repoFs.listAll();
        const all = new Set<string>(['/']);
        for (const path of paths) {
            all.add(`/${path}`);
            const segments = path.split('/');
            let prefix = '';
            for (let i = 0; i < segments.length - 1; i += 1) {
                prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
                all.add(`/${prefix}`);
            }
        }
        return new RepoFileSystem(repoFs, [...all].sort());
    }

    async readFile(path: string): Promise<string> {
        const content = await this.repoFs.readFile(toRepoRelative(path));
        if (content === null) throw enoent(path);
        return content;
    }

    async readFileBuffer(path: string): Promise<Uint8Array> {
        return new TextEncoder().encode(await this.readFile(path));
    }

    async exists(path: string): Promise<boolean> {
        return (await this.repoFs.statEntry(toRepoRelative(path))) !== null;
    }

    private async statPath(path: string): Promise<FsStat> {
        const info = await this.repoFs.statEntry(toRepoRelative(path));
        if (!info) throw enoent(path);
        const isDirectory = info.type === 'dir';
        return {
            isFile: !isDirectory,
            isDirectory,
            isSymbolicLink: false,
            mode: isDirectory ? DIR_MODE : FILE_MODE,
            size: info.size,
            mtime: EPOCH,
        };
    }

    stat(path: string): Promise<FsStat> {
        return this.statPath(path);
    }

    // No symlinks in the repo VFS, so lstat == stat.
    lstat(path: string): Promise<FsStat> {
        return this.statPath(path);
    }

    async readdir(path: string): Promise<string[]> {
        const rel = toRepoRelative(path);
        const info = await this.repoFs.statEntry(rel);
        if (!info) throw enoent(path);
        if (info.type !== 'dir') throw enotdir(path);
        return (await this.repoFs.listDir(rel)).map((entry) => entry.name);
    }

    async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
        const rel = toRepoRelative(path);
        const info = await this.repoFs.statEntry(rel);
        if (!info) throw enoent(path);
        if (info.type !== 'dir') throw enotdir(path);
        return (await this.repoFs.listDir(rel)).map((entry) => ({
            name: entry.name,
            isFile: entry.type === 'file',
            isDirectory: entry.type === 'dir',
            isSymbolicLink: false,
        }));
    }

    getAllPaths(): string[] {
        return this.snapshot;
    }

    search(query: string): Promise<RepoCodeSearchMatch[] | null> {
        return this.repoFs.search(query);
    }

    async realpath(path: string): Promise<string> {
        const abs = resolveAbsolute('/', path);
        if (abs === '/') return '/';
        if ((await this.repoFs.statEntry(toRepoRelative(abs))) === null)
            throw enoent(path);
        return abs;
    }

    resolvePath(base: string, path: string): string {
        return resolveAbsolute(base, path);
    }

    // Repo has no symlinks; mirror POSIX EINVAL for a non-symlink target.
    readlink(path: string): Promise<string> {
        throw Object.assign(new Error(`EINVAL: not a symlink: '${path}'`), {
            code: 'EINVAL',
        });
    }

    // ---- Mutations: absent by construction → always EROFS. ----
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
