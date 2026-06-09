import { NotFoundError, UnexpectedGitError } from '@lightdash/common';
import { getFileContent, getRepoTree } from '../../../../clients/github/Github';
import {
    createGithubRepoSource,
    type RepoFsTimingCallback,
} from './githubRepoSource';

jest.mock('../../../../clients/github/Github');

const mockGetFileContent = getFileContent as jest.MockedFunction<
    typeof getFileContent
>;

const mockGetRepoTree = getRepoTree as jest.MockedFunction<typeof getRepoTree>;

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

    it('reports tree outcome=success for a listed repo', async () => {
        const onTiming = jest.fn();
        mockGetRepoTree.mockResolvedValue({ files: [], truncated: false });
        await source(onTiming).listAllPaths();
        expect(onTiming).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'tree', outcome: 'success' }),
        );
    });

    it('reports tree outcome=error and re-throws on a failed tree fetch', async () => {
        const onTiming = jest.fn();
        mockGetRepoTree.mockRejectedValue(
            new UnexpectedGitError('API rate limit exceeded'),
        );
        await expect(source(onTiming).listAllPaths()).rejects.toThrow();
        expect(onTiming).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'tree', outcome: 'error' }),
        );
    });
});
