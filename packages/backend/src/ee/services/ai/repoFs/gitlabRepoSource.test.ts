import { NotFoundError, UnexpectedGitError } from '@lightdash/common';
import {
    getFileContent,
    getGitlabRepoTree,
    isGitlabRateLimitError,
} from '../../../../clients/gitlab/Gitlab';
import { createGitlabRepoSource } from './gitlabRepoSource';
import { type RepoFsTimingCallback } from './repoSourceShared';

jest.mock('../../../../clients/gitlab/Gitlab');

const mockGetFileContent = getFileContent as jest.MockedFunction<
    typeof getFileContent
>;
const mockGetRepoTree = getGitlabRepoTree as jest.MockedFunction<
    typeof getGitlabRepoTree
>;
const mockIsRateLimit = isGitlabRateLimitError as jest.MockedFunction<
    typeof isGitlabRateLimitError
>;

const source = (onTiming?: RepoFsTimingCallback) =>
    createGitlabRepoSource({
        owner: 'acme',
        repo: 'jaffle',
        branch: 'main',
        token: 'tok',
        onTiming,
    });

describe('gitlabRepoSource.readFile error handling', () => {
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

    it('returns null for a missing file (NotFoundError)', async () => {
        mockGetFileContent.mockRejectedValue(
            new NotFoundError('GitLab resource not found'),
        );
        await expect(
            source().readFile('models/missing.sql'),
        ).resolves.toBeNull();
    });

    it('returns null for a binary blob (contains a NUL byte)', async () => {
        // GitLab's Files API returns binary files inline (unlike GitHub
        // Contents), so the source screens them out as non-text → absent.
        mockGetFileContent.mockResolvedValue({
            content: 'PNG\0\0binary',
            sha: 'abc',
        });
        await expect(source().readFile('assets/logo.png')).resolves.toBeNull();
    });

    it('converts a rate limit into a recoverable ERATELIMIT error (not a silent empty)', async () => {
        mockGetFileContent.mockRejectedValue(
            new UnexpectedGitError('429 Too Many Requests'),
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

describe('gitlabRepoSource.listAllPaths', () => {
    beforeEach(() => {
        mockGetRepoTree.mockReset();
        mockGetFileContent.mockReset();
    });

    it('lists every file path from the recursive tree', async () => {
        mockGetRepoTree.mockResolvedValue({
            files: [
                { path: 'models/orders.sql', size: 0 },
                { path: 'dbt_project.yml', size: 0 },
            ],
            truncated: false,
        });
        const { files, truncated } = await source().listAllPaths();
        expect(files.map((f) => f.path)).toEqual([
            'models/orders.sql',
            'dbt_project.yml',
        ]);
        expect(truncated).toBe(false);
        expect(mockGetRepoTree).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: 'acme',
                repo: 'jaffle',
                branch: 'main',
                token: 'tok',
            }),
        );
    });

    it('scopes and re-roots paths to the sub-path, dropping those outside it', async () => {
        mockGetRepoTree.mockResolvedValue({
            files: [
                { path: 'transform/dbt/models/orders.sql', size: 0 },
                { path: 'app/src/index.ts', size: 0 },
            ],
            truncated: true,
        });
        const scoped = createGitlabRepoSource({
            owner: 'acme',
            repo: 'jaffle',
            branch: 'main',
            token: 'tok',
            subPath: 'transform/dbt',
        });
        const { files, truncated } = await scoped.listAllPaths();
        expect(files.map((f) => f.path)).toEqual(['models/orders.sql']);
        expect(truncated).toBe(true);
    });
});

describe('gitlabRepoSource secrets denylist', () => {
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
                { path, size: 0 },
                { path: 'models/x.sql', size: 0 },
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
});

describe('gitlabRepoSource onTiming (metrics hook)', () => {
    beforeEach(() => {
        mockGetFileContent.mockReset();
        mockGetRepoTree.mockReset();
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

    it('reports a tree timing event on listAllPaths', async () => {
        const onTiming = jest.fn();
        mockGetRepoTree.mockResolvedValue({ files: [], truncated: false });
        await source(onTiming).listAllPaths();
        expect(onTiming).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'tree' }),
        );
    });
});
