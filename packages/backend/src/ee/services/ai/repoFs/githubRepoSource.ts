import { getFileContent, getRepoTree } from '../../../../clients/github/Github';
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
            const { files, truncated } = await getRepoTree({
                owner,
                repo,
                branch,
                token,
            });
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
            try {
                const { content } = await getFileContent({
                    fileName: `${prefix}${path}`,
                    owner,
                    repo,
                    branch,
                    token,
                });
                return content;
            } catch {
                return null;
            }
        },
    };
};
