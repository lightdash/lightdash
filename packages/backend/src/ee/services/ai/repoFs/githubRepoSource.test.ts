import { NotFoundError, UnexpectedGitError } from '@lightdash/common';
import {
    getFileContent,
    getRepoTree,
    isGithubRateLimitError,
    searchRepoCode,
} from '../../../../clients/github/Github';
import {
    createGithubRepoSource,
    isDeniedRepoPath,
    type RepoFsTimingCallback,
} from './githubRepoSource';

vi.mock('../../../../clients/github/Github');

const mockGetFileContent = getFileContent as import('vitest').MockedFunction<
    typeof getFileContent
>;
const mockGetRepoTree = getRepoTree as import('vitest').MockedFunction<
    typeof getRepoTree
>;
const mockIsRateLimit =
    isGithubRateLimitError as import('vitest').MockedFunction<
        typeof isGithubRateLimitError
    >;
const mockSearchRepoCode = searchRepoCode as import('vitest').MockedFunction<
    typeof searchRepoCode
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

describe('githubRepoSource.searchCode', () => {
    beforeEach(() => {
        mockSearchRepoCode.mockReset();
        mockIsRateLimit.mockReset();
    });

    it('returns repo-relative matches with fragments (no sub-path scoping)', async () => {
        mockSearchRepoCode.mockResolvedValue([
            {
                owner: 'acme',
                repo: 'jaffle',
                path: 'models/orders.sql',
                fragments: ['select customer_id'],
            },
            { owner: 'acme', repo: 'jaffle', path: 'README.md', fragments: [] },
        ]);
        const matches = await source().searchCode!('customer_id');
        expect(mockSearchRepoCode).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: 'acme',
                repo: 'jaffle',
                query: 'customer_id',
                token: 'tok',
            }),
        );
        expect(matches).toEqual([
            { path: 'models/orders.sql', fragments: ['select customer_id'] },
            { path: 'README.md', fragments: [] },
        ]);
    });

    it('confines and re-roots hits to the sub-path, dropping those outside it', async () => {
        mockSearchRepoCode.mockResolvedValue([
            {
                owner: 'acme',
                repo: 'jaffle',
                path: 'transform/dbt/models/orders.sql',
                fragments: ['x'],
            },
            {
                owner: 'acme',
                repo: 'jaffle',
                path: 'app/src/index.ts',
                fragments: ['x'],
            },
        ]);
        const scoped = createGithubRepoSource({
            owner: 'acme',
            repo: 'jaffle',
            branch: 'main',
            token: 'tok',
            subPath: 'transform/dbt',
        });
        await expect(scoped.searchCode!('x')).resolves.toEqual([
            { path: 'models/orders.sql', fragments: ['x'] },
        ]);
    });

    it('never surfaces a denied secret path even when search returns it', async () => {
        mockSearchRepoCode.mockResolvedValue([
            {
                owner: 'acme',
                repo: 'jaffle',
                path: '.env',
                fragments: ['SECRET=1'],
            },
            {
                owner: 'acme',
                repo: 'jaffle',
                path: 'models/x.sql',
                fragments: [],
            },
        ]);
        await expect(source().searchCode!('SECRET')).resolves.toEqual([
            { path: 'models/x.sql', fragments: [] },
        ]);
    });

    it('maps a rate limit to a recoverable ERATELIMIT error', async () => {
        mockSearchRepoCode.mockRejectedValue(
            new UnexpectedGitError('API rate limit exceeded for installation'),
        );
        mockIsRateLimit.mockReturnValue(true);
        await expect(source().searchCode!('anything')).rejects.toMatchObject({
            code: 'ERATELIMIT',
        });
    });
});

describe('githubRepoSource onTiming (metrics hook)', () => {
    beforeEach(() => {
        mockGetFileContent.mockReset();
    });

    it('reports outcome=found for a successful read', async () => {
        const onTiming = vi.fn();
        mockGetFileContent.mockResolvedValue({ content: 'x', sha: 'abc' });
        await source(onTiming).readFile('models/x.sql');
        expect(onTiming).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'file', outcome: 'found' }),
        );
    });

    it('reports outcome=missing for a NotFoundError', async () => {
        const onTiming = vi.fn();
        mockGetFileContent.mockRejectedValue(new NotFoundError('nope'));
        await source(onTiming).readFile('models/x.sql');
        expect(onTiming).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'file', outcome: 'missing' }),
        );
    });

    it('reports outcome=error for an unexpected failure', async () => {
        const onTiming = vi.fn();
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
