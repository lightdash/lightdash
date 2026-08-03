import { listAuthorizedAgentRepositories } from './AiAgentService';

describe('listAuthorizedAgentRepositories', () => {
    it('uses the GitLab authorization source for a GitLab project', async () => {
        const listGithubRepositories = vi.fn().mockResolvedValue(['github']);
        const listGitlabRepositories = vi.fn().mockResolvedValue(['gitlab']);

        await expect(
            listAuthorizedAgentRepositories({
                provider: 'gitlab',
                listGithubRepositories,
                listGitlabRepositories,
            }),
        ).resolves.toEqual(['gitlab']);
        expect(listGithubRepositories).not.toHaveBeenCalled();
    });

    it('uses the GitHub authorization source for a GitHub project', async () => {
        const listGithubRepositories = vi.fn().mockResolvedValue(['github']);
        const listGitlabRepositories = vi.fn().mockResolvedValue(['gitlab']);

        await expect(
            listAuthorizedAgentRepositories({
                provider: 'github',
                listGithubRepositories,
                listGitlabRepositories,
            }),
        ).resolves.toEqual(['github']);
        expect(listGitlabRepositories).not.toHaveBeenCalled();
    });
});
