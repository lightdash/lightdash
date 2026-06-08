import { getFileContent, getRepoTree } from '../../../../clients/github/Github';
import { RepoSource } from './RepoFs';

/**
 * A read-only {@link RepoSource} backed by the GitHub API (Git Trees + Contents)
 * using an App installation token — no clone, no sandbox. `readFile` returns
 * null for missing/binary/over-1MB files (the Contents API limit) so the shell
 * reports them as absent rather than throwing.
 */
export const createGithubRepoSource = ({
    owner,
    repo,
    branch,
    token,
}: {
    owner: string;
    repo: string;
    branch: string;
    token: string;
}): RepoSource => ({
    label: `${owner}/${repo}@${branch}`,
    listAllPaths: () => getRepoTree({ owner, repo, branch, token }),
    readFile: async (path) => {
        try {
            const { content } = await getFileContent({
                fileName: path,
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
});
