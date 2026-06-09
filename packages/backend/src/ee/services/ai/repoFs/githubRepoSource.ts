import { getErrorMessage, NotFoundError } from '@lightdash/common';
import { getFileContent, getRepoTree } from '../../../../clients/github/Github';
import Logger from '../../../../logging/logger';
import { RepoSource } from './RepoFs';

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
 */
export const createGithubRepoSource = ({
    owner,
    repo,
    branch,
    token,
    subPath = '.',
}: {
    owner: string;
    repo: string;
    branch: string;
    token: string;
    subPath?: string;
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
            });
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
            if (!root) return { files, truncated };
            const scoped = files
                .filter((f) => f.path.startsWith(prefix))
                .map((f) => ({
                    path: f.path.slice(prefix.length),
                    size: f.size,
                }));
            return { files: scoped, truncated };
        },
        readFile: async (path) => {
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
                throw error;
            }
        },
    };
};
