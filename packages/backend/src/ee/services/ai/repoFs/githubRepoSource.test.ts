import { NotFoundError, UnexpectedGitError } from '@lightdash/common';
import {
    getFileContent,
    getRepoTree,
    isGithubRateLimitError,
} from '../../../../clients/github/Github';
import {
    createGithubRepoSource,
    isDeniedRepoPath,
    type RepoFsTimingCallback,
} from './githubRepoSource';

jest.mock('../../../../clients/github/Github');

const mockGetFileContent = getFileContent as jest.MockedFunction<
    typeof getFileContent
>;
const mockGetRepoTree = getRepoTree as jest.MockedFunction<typeof getRepoTree>;
const mockIsRateLimit = isGithubRateLimitError as jest.MockedFunction<
    typeof isGithubRateLimitError
>;

const source = (onTiming?: RepoFsTimingCallback) =>
    createGithubRepoSource({
        owner: 'acme',
        repo: 'jaffle',
        branch: 'main',
        token: 'tok',
        onTiming,
    });

describe('githubRepoSource.readFile error handling', () => {
    beforeEach(() => {
        mockGetFileContent.mockReset();
        mockIsRateLimit.mockReset();
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

    it('converts a rate limit into a recoverable ERATELIMIT error (not a silent empty)', async () => {
        // Simulated GitHub throttle: not "absent", and not a hard fault — it
        // becomes an agent-recoverable ERATELIMIT (mapped to a ShellError, no
        // Sentry) carrying a clear "back off / narrow" message.
        mockGetFileContent.mockRejectedValue(
            new UnexpectedGitError('API rate limit exceeded for installation'),
        );
        mockIsRateLimit.mockReturnValue(true);
        await expect(source().readFile('models/x.sql')).rejects.toMatchObject({
            code: 'ERATELIMIT',
            message: expect.stringMatching(/rate limit reached/i),
        });
    });

    it('re-throws other unexpected errors (network / 5xx) unchanged', async () => {
        mockGetFileContent.mockRejectedValue(
            new UnexpectedGitError('socket hang up'),
        );
        mockIsRateLimit.mockReturnValue(false);
        await expect(source().readFile('models/x.sql')).rejects.toThrow(
            'socket hang up',
        );
    });
});

describe('githubRepoSource secrets denylist', () => {
    beforeEach(() => {
        mockGetFileContent.mockReset();
        mockGetRepoTree.mockReset();
    });

    it.each([
        '.env',
        '.env.production',
        'config/.env.local',
        'certs/server.pem',
        'deploy/id_rsa',
        'service.keyfile.json',
    ])('does not list or read the denied path %s', async (path) => {
        mockGetRepoTree.mockResolvedValue({
            files: [
                { path, size: 10 },
                { path: 'models/x.sql', size: 20 },
            ],
            truncated: false,
        });
        const repo = source();
        const { files } = await repo.listAllPaths();
        expect(files.map((f) => f.path)).toEqual(['models/x.sql']);

        // Even with a truncated listing, an explicit read is refused.
        await expect(repo.readFile(path)).resolves.toBeNull();
        expect(mockGetFileContent).not.toHaveBeenCalled();
    });

    it('flags common secret paths via isDeniedRepoPath', () => {
        expect(isDeniedRepoPath('.env')).toBe(true);
        expect(isDeniedRepoPath('a/b/.npmrc')).toBe(true);
        expect(isDeniedRepoPath('models/orders.sql')).toBe(false);
        expect(isDeniedRepoPath('README.md')).toBe(false);
    });
});

describe('githubRepoSource onTiming (metrics hook)', () => {
    beforeEach(() => {
        mockGetFileContent.mockReset();
    });

    it('reports outcome=found for a successful read', async () => {
        const onTiming = jest.fn();
        mockGetFileContent.mockResolvedValue({ content: 'x', sha: 'abc' });
        await source(onTiming).readFile('models/x.sql');
        expect(onTiming).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'file', outcome: 'found' }),
        );
    });

    it('reports outcome=missing for a NotFoundError', async () => {
        const onTiming = jest.fn();
        mockGetFileContent.mockRejectedValue(new NotFoundError('nope'));
        await source(onTiming).readFile('models/x.sql');
        expect(onTiming).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'file', outcome: 'missing' }),
        );
    });

    it('reports outcome=error for an unexpected failure', async () => {
        const onTiming = jest.fn();
        mockGetFileContent.mockRejectedValue(
            new UnexpectedGitError('API rate limit exceeded'),
        );
        await expect(
            source(onTiming).readFile('models/x.sql'),
        ).rejects.toThrow();
        expect(onTiming).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'file', outcome: 'error' }),
        );
    });
});
