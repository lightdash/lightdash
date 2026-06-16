import { getErrorMessage, NotFoundError } from '@lightdash/common';
import {
    getFileContent,
    getRepoTree,
    isGithubRateLimitError,
    searchRepoCode,
} from '../../../../clients/github/Github';
import Logger from '../../../../logging/logger';
import { RepoSource } from './RepoFs';

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

/**
 * Latency signal for each backing GitHub call, so a caller (e.g. the agent
 * service) can record metrics without coupling this layer to Prometheus.
 */
export type RepoFsTimingEvent =
    | { kind: 'tree'; durationMs: number }
    | {
          kind: 'file';
          durationMs: number;
          outcome: 'found' | 'missing' | 'error';
      };

export type RepoFsTimingCallback = (event: RepoFsTimingEvent) => void;

/**
 * Paths that must never be exposed through the read-only shell. Removing the
 * `subPath` confinement (so the whole repo is readable for an explicit
 * `exploreRepo` target) widens the blast radius to secrets that previously lived
 * outside the dbt subdirectory, so deny common credential/secret files at the
 * source layer — they're filtered from listings and read back as absent.
 */
const DENIED_PATH_PATTERNS: RegExp[] = [
    /(^|\/)\.env(\..*)?$/i, // .env, .env.local, .env.production, ...
    /\.pem$/i,
    /\.key$/i,
    /\.p12$/i,
    /\.pfx$/i,
    /(^|\/)id_rsa(\.pub)?$/i,
    /(^|\/)id_ed25519(\.pub)?$/i,
    /(^|\/)\.npmrc$/i,
    /(^|\/)\.pypirc$/i,
    /(^|\/)credentials$/i,
    /\.keyfile(\.json)?$/i,
];

export const isDeniedRepoPath = (path: string): boolean =>
    DENIED_PATH_PATTERNS.some((re) => re.test(path));

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
