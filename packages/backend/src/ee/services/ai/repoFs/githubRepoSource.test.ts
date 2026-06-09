import { NotFoundError, UnexpectedGitError } from '@lightdash/common';
import { getFileContent } from '../../../../clients/github/Github';
import { createGithubRepoSource } from './githubRepoSource';

jest.mock('../../../../clients/github/Github');

const mockGetFileContent = getFileContent as jest.MockedFunction<
    typeof getFileContent
>;

const source = () =>
    createGithubRepoSource({
        owner: 'acme',
        repo: 'jaffle',
        branch: 'main',
        token: 'tok',
    });

describe('githubRepoSource.readFile error handling', () => {
    beforeEach(() => {
        mockGetFileContent.mockReset();
    });

    it('returns content for a found file', async () => {
        mockGetFileContent.mockResolvedValue({
            content: 'select 1 as id',
            sha: 'abc',
        });
        await expect(source().readFile('models/x.sql')).resolves.toBe(
            'select 1 as id',
        );
    });

    it('returns null for a missing / too-large file (NotFoundError)', async () => {
        mockGetFileContent.mockRejectedValue(
            new NotFoundError('file not found in Github'),
        );
        await expect(
            source().readFile('models/missing.sql'),
        ).resolves.toBeNull();
    });

    it('re-throws a rate limit instead of returning null (no silent empty)', async () => {
        // Simulated GitHub throttle: getFileContent wraps the 403/429 into
        // UnexpectedGitError. readFile must surface it, not treat it as absent.
        mockGetFileContent.mockRejectedValue(
            new UnexpectedGitError('API rate limit exceeded for installation'),
        );
        await expect(source().readFile('models/x.sql')).rejects.toThrow(
            'rate limit',
        );
    });

    it('re-throws other unexpected errors (network / 5xx)', async () => {
        mockGetFileContent.mockRejectedValue(
            new UnexpectedGitError('socket hang up'),
        );
        await expect(source().readFile('models/x.sql')).rejects.toThrow(
            'socket hang up',
        );
    });
});
