import { getErrorMessage, NotFoundError } from '@lightdash/common';
import {
    getFileContent,
    getGitlabRepoTree,
    isGitlabRateLimitError,
} from '../../../../clients/gitlab/Gitlab';
import Logger from '../../../../logging/logger';
import { RepoSource } from './RepoFs';
import {
    isDeniedRepoPath,
    type RepoFsTimingCallback,
} from './repoSourceShared';

/** Message + sentinel code for a GitLab rate-limit hit. Mirrors the GitHub
 *  source: the `ERATELIMIT` code is mapped to an agent-recoverable ShellError in
 *  {@link ./bashShell}, so a 429 from GitLab (a transient, external limit — easy
 *  to hit when a command reads many files) degrades to a clear "back off / narrow
 *  the search" message instead of crashing the agent run or paging Sentry. */
const RATE_LIMIT_MESSAGE =
    'GitLab API rate limit reached for this organization. ' +
    'Narrow the search to fewer files, or try again in a few minutes.';

/** Re-throw a GitLab error: a rate-limit becomes the recoverable ERATELIMIT
 *  error; anything else propagates unchanged. */
export const rethrowGitlabAsRecoverable = (error: unknown): never => {
    if (isGitlabRateLimitError(error)) {
        throw Object.assign(new Error(RATE_LIMIT_MESSAGE), {
            code: 'ERATELIMIT',
        });
    }
    throw error;
};

/**
 * A read-only {@link RepoSource} backed by the GitLab REST API (Repository Trees
 * + Files) using the org's GitLab app-install OAuth token — no clone, no sandbox.
 * The GitHub-source twin ({@link ./githubRepoSource}); see it for the shared
 * design. GitLab specifics:
 *
 * - `owner`/`repo` form the URL-encoded project path (`group/project`), and
 *   `hostDomain` targets self-hosted instances (defaults to gitlab.com).
 * - `listAllPaths` uses the recursive Trees API, which does NOT return blob
 *   sizes, so sizes are reported as 0 (used only for `ls -l` display).
 * - `readFile` returns null for missing/binary files; GitLab's Files API has no
 *   inline-size cap, so very large text files are returned in full.
 * - Code search is not implemented yet — the shell's `grep` falls back to
 *   reading files, so it still works (just without server-side search).
 *
 * `subPath` scopes the filesystem to the dbt project subdirectory exactly as the
 * GitHub source does. `onTiming` (optional) receives each call's duration.
 */
export const createGitlabRepoSource = ({
    owner,
    repo,
    branch,
    token,
    hostDomain,
    subPath = '.',
    onTiming,
}: {
    owner: string;
    repo: string;
    branch: string;
    token: string;
    hostDomain?: string;
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
            const { files, truncated } = await getGitlabRepoTree({
                owner,
                repo,
                branch,
                token,
                hostDomain,
            }).catch(rethrowGitlabAsRecoverable);
            const durationMs = Date.now() - start;
            Logger.info(
                `[repoShell] gitlab tree fetched in ${durationMs}ms (${
                    files.length
                } files${truncated ? ', truncated' : ''})`,
                {
                    event: 'ai.repofs.gitlab.tree',
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
                    hostDomain,
                });
                // A NUL byte means the blob is binary; the RepoSource contract
                // represents non-text content as `null` rather than feeding
                // mojibake to the agent. (GitLab, unlike GitHub Contents, returns
                // even binary files inline, so we screen here.)
                if (content.includes('\0')) {
                    onTiming?.({
                        kind: 'file',
                        durationMs: Date.now() - start,
                        outcome: 'missing',
                    });
                    return null;
                }
                const durationMs = Date.now() - start;
                Logger.debug(
                    `[repoShell] gitlab file fetched in ${durationMs}ms (${content.length}b): ${prefix}${path}`,
                    {
                        event: 'ai.repofs.gitlab.file',
                        path: `${prefix}${path}`,
                        bytes: content.length,
                        durationMs,
                    },
                );
                onTiming?.({ kind: 'file', durationMs, outcome: 'found' });
                return content;
            } catch (error) {
                const durationMs = Date.now() - start;
                // getFileContent throws NotFoundError for a genuine 404, which the
                // RepoSource contract represents as `null` (absent).
                if (error instanceof NotFoundError) {
                    Logger.debug(
                        `[repoShell] gitlab file miss in ${durationMs}ms: ${prefix}${path}`,
                        {
                            event: 'ai.repofs.gitlab.file_miss',
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
                // Returning null would make grep/cat silently behave as if the
                // file were empty — wrong results with no signal. Surface it.
                Logger.warn(
                    `[repoShell] gitlab file read failed in ${durationMs}ms: ${prefix}${path} — ${getErrorMessage(
                        error,
                    )}`,
                    {
                        event: 'ai.repofs.gitlab.file_error',
                        path: `${prefix}${path}`,
                        durationMs,
                    },
                );
                onTiming?.({ kind: 'file', durationMs, outcome: 'error' });
                // A rate-limit becomes a recoverable ERATELIMIT error (clear
                // "back off" message, no Sentry); other faults propagate as-is.
                return rethrowGitlabAsRecoverable(error);
            }
        },
    };
};
