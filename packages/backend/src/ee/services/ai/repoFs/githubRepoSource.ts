import { getErrorMessage, NotFoundError } from '@lightdash/common';
import { type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { extract } from 'tar-stream';
import {
    getFileContent,
    getRepoArchiveStream,
    getRepoTree,
    isGithubRateLimitError,
    searchRepoCode,
} from '../../../../clients/github/Github';
import Logger from '../../../../logging/logger';
import { RepoSource } from './RepoFs';
import {
    isDeniedRepoPath,
    type RepoFsTimingCallback,
} from './repoSourceShared';

// Re-exported for backward compatibility: these provider-agnostic helpers moved
// to ./repoSourceShared so a non-GitHub source can reuse them, but existing
// importers (AiAgentService, tests) still reach them through this module.
export {
    isDeniedRepoPath,
    type RepoFsTimingEvent,
    type RepoFsTimingCallback,
} from './repoSourceShared';

/** Message + sentinel code for a GitHub rate-limit hit. The `ERATELIMIT` code is
 *  mapped to an agent-recoverable ShellError in {@link ./bashShell} so a 403 from
 *  GitHub (a transient, external limit — easy to hit when a command reads many
 *  files across large repos) degrades to a clear "back off / narrow the search"
 *  message instead of crashing the agent run or paging Sentry. */
const RATE_LIMIT_MESSAGE =
    "GitHub API rate limit reached for this organization's installation. " +
    'Narrow the search to fewer files or a single repository, or try again in a few minutes.';

/** Re-throw a GitHub error: a rate-limit becomes the recoverable ERATELIMIT
 *  error; anything else propagates unchanged. */
export const rethrowAsRecoverable = (error: unknown): never => {
    if (isGithubRateLimitError(error)) {
        throw Object.assign(new Error(RATE_LIMIT_MESSAGE), {
            code: 'ERATELIMIT',
        });
    }
    throw error;
};

// The Contents API serves no file above 1MB, so the archive keeps the same line.
const MAX_ARCHIVE_FILE_BYTES = 1024 * 1024;
// ponytail: the archive is the whole repo, so a larger one (a monorepo around a small dbt project) is read file by file; fetch its blobs in batches if that case matters.
const MAX_ARCHIVE_REPO_BYTES = 50 * 1024 * 1024;

/**
 * The text files of a repository archive under `prefix`, keyed relative to it;
 * null once they would hold more than `maxBytes`.
 * Symlinks, binaries, oversized and denied files are left out.
 */
export const readRepoArchive = async (
    archive: Readable,
    { prefix, maxBytes }: { prefix: string; maxBytes: number },
): Promise<Map<string, string> | null> => {
    const files = new Map<string, string>();
    let kept = 0;
    let tooLarge = false;
    const extractor = extract();
    const piped = pipeline(archive, createGunzip(), extractor);
    try {
        for await (const entry of extractor) {
            const { type, name, size = 0 } = entry.header;
            // GitHub wraps the tree in one "<owner>-<repo>-<sha>/" folder.
            const repoPath = name.slice(name.indexOf('/') + 1);
            const path = repoPath.slice(prefix.length);
            const chunks: Buffer[] = [];
            const wanted =
                type === 'file' &&
                size <= MAX_ARCHIVE_FILE_BYTES &&
                repoPath.startsWith(prefix) &&
                !isDeniedRepoPath(path);
            for await (const chunk of entry) {
                if (wanted) chunks.push(chunk);
            }
            const content = Buffer.concat(chunks);
            if (wanted && !content.includes(0)) {
                kept += content.length;
                if (kept > maxBytes) {
                    tooLarge = true;
                    archive.destroy();
                }
                files.set(path, content.toString('utf-8'));
            }
        }
        await piped;
    } catch (error) {
        if (!tooLarge) throw error;
    }
    return tooLarge ? null : files;
};

/**
 * A read-only {@link RepoSource} backed by the GitHub API (Git Trees + Contents)
 * using an App installation token — no clone, no sandbox. `readFile` returns
 * null for missing/binary/over-1MB files (the Contents API limit) so the shell
 * reports them as absent rather than throwing.
 *
 * `subPath` scopes the filesystem to the dbt project subdirectory: paths are
 * presented relative to it and files outside it are not listed or readable, so
 * the VFS can't expose secrets/CI/other apps elsewhere in the repo. `.` (or
 * empty) means the dbt project is the repo root — no scoping.
 *
 * `onTiming` (optional) receives the duration of each GitHub call for metrics.
 */
export const createGithubRepoSource = ({
    owner,
    repo,
    branch,
    token,
    subPath = '.',
    onTiming,
}: {
    owner: string;
    repo: string;
    branch: string;
    token: string;
    subPath?: string;
    onTiming?: RepoFsTimingCallback;
}): RepoSource => {
    const root =
        subPath === '.' || subPath === '' ? '' : subPath.replace(/\/+$/, '');
    const prefix = root ? `${root}/` : '';
    // The size of the whole repo, known once its tree is listed.
    let repoBytes: number | null = null;
    return {
        label: `${owner}/${repo}@${branch}${root ? `/${root}` : ''}`,
        listAllPaths: async () => {
            const start = Date.now();
            const { files, truncated } = await getRepoTree({
                owner,
                repo,
                branch,
                token,
            }).catch(rethrowAsRecoverable);
            repoBytes = files.reduce((total, { size }) => total + size, 0);
            const durationMs = Date.now() - start;
            Logger.info(
                `[repoShell] github tree fetched in ${durationMs}ms (${
                    files.length
                } files${truncated ? ', truncated' : ''})`,
                {
                    event: 'ai.repofs.github.tree',
                    repo: `${owner}/${repo}`,
                    branch,
                    fileCount: files.length,
                    truncated,
                    durationMs,
                },
            );
            onTiming?.({ kind: 'tree', durationMs });
            if (!root) {
                return {
                    files: files.filter((f) => !isDeniedRepoPath(f.path)),
                    truncated,
                };
            }
            const scoped = files
                .filter((f) => f.path.startsWith(prefix))
                .map((f) => ({
                    path: f.path.slice(prefix.length),
                    size: f.size,
                }))
                .filter((f) => !isDeniedRepoPath(f.path));
            return { files: scoped, truncated };
        },
        readAll: async (maxBytes) => {
            if (repoBytes === null || repoBytes > MAX_ARCHIVE_REPO_BYTES) {
                return null;
            }
            const start = Date.now();
            try {
                const files = await readRepoArchive(
                    await getRepoArchiveStream({
                        owner,
                        repo,
                        ref: branch,
                        token,
                    }),
                    { prefix, maxBytes },
                );
                const durationMs = Date.now() - start;
                Logger.info(
                    `[repoShell] github archive ${
                        files
                            ? `read in ${durationMs}ms (${files.size} files)`
                            : 'too large to hold'
                    }`,
                    {
                        event: 'ai.repofs.github.archive',
                        repo: `${owner}/${repo}`,
                        branch,
                        fileCount: files?.size ?? null,
                        durationMs,
                    },
                );
                onTiming?.({ kind: 'archive', durationMs });
                return files;
            } catch (error) {
                // The per-file path still works, and reports a rate limit properly.
                Logger.warn(
                    `[repoShell] github archive failed, reading file by file: ${getErrorMessage(error)}`,
                    { event: 'ai.repofs.github.archive_error' },
                );
                return null;
            }
        },
        searchCode: async (query) => {
            const start = Date.now();
            const items = await searchRepoCode({
                owner,
                repo,
                query,
                token,
            }).catch(rethrowAsRecoverable);
            const durationMs = Date.now() - start;
            Logger.info(
                `[repoShell] github code search in ${durationMs}ms (${items.length} matches): ${query}`,
                {
                    event: 'ai.repofs.github.search',
                    repo: `${owner}/${repo}`,
                    matches: items.length,
                    durationMs,
                },
            );
            onTiming?.({ kind: 'search', durationMs });
            return items
                .filter((item) => !root || item.path.startsWith(prefix))
                .map((item) => ({
                    path: root ? item.path.slice(prefix.length) : item.path,
                    fragments: item.fragments,
                }))
                .filter((item) => !isDeniedRepoPath(item.path));
        },
        readFile: async (path) => {
            // Never read a denied secret file, even if a truncated tree means it
            // wasn't filtered from the listing above.
            if (isDeniedRepoPath(path)) return null;
            const start = Date.now();
            try {
                const { content } = await getFileContent({
                    fileName: `${prefix}${path}`,
                    owner,
                    repo,
                    branch,
                    token,
                });
                // Per-file at debug — a single grep can read many files, so this
                // would be noisy at info; the tree fetch (one per run) is info.
                const durationMs = Date.now() - start;
                Logger.debug(
                    `[repoShell] github file fetched in ${durationMs}ms (${
                        content?.length ?? 0
                    }b): ${prefix}${path}`,
                    {
                        event: 'ai.repofs.github.file',
                        path: `${prefix}${path}`,
                        bytes: content?.length ?? 0,
                        durationMs,
                    },
                );
                onTiming?.({ kind: 'file', durationMs, outcome: 'found' });
                return content;
            } catch (error) {
                const durationMs = Date.now() - start;
                // getFileContent throws NotFoundError for a genuine 404 — and
                // also for too-large/binary files (no inline content) — which the
                // RepoSource contract represents as `null` (absent).
                if (error instanceof NotFoundError) {
                    Logger.debug(
                        `[repoShell] github file miss in ${durationMs}ms: ${prefix}${path}`,
                        {
                            event: 'ai.repofs.github.file_miss',
                            path: `${prefix}${path}`,
                            durationMs,
                        },
                    );
                    onTiming?.({
                        kind: 'file',
                        durationMs,
                        outcome: 'missing',
                    });
                    return null;
                }
                // Anything else (rate limit, network, 5xx) is NOT "file absent".
                // Returning null here would make grep/cat silently behave as if
                // the file were empty — wrong results with no signal. Surface it.
                Logger.warn(
                    `[repoShell] github file read failed in ${durationMs}ms: ${prefix}${path} — ${getErrorMessage(
                        error,
                    )}`,
                    {
                        event: 'ai.repofs.github.file_error',
                        path: `${prefix}${path}`,
                        durationMs,
                    },
                );
                onTiming?.({ kind: 'file', durationMs, outcome: 'error' });
                // A rate-limit becomes a recoverable ERATELIMIT error (clear
                // "back off" message, no Sentry); other faults propagate as-is.
                return rethrowAsRecoverable(error);
            }
        },
    };
};
