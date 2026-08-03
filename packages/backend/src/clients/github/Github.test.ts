import { Octokit } from '@octokit/rest';
import { getRepoTree, isGithubRateLimitError, searchRepoCode } from './Github';

vi.mock('@octokit/rest');

const mockGetTree = vi.fn();
const mockSearchCode = vi.fn();
(Octokit as unknown as import('vitest').Mock).mockImplementation(
    // eslint-disable-next-line prefer-arrow-callback
    function MockOctokit() {
        return {
            rest: {
                git: { getTree: mockGetTree },
                search: { code: mockSearchCode },
            },
            hook: { after: vi.fn(), error: vi.fn() },
        };
    },
);

const octokitError = (
    status: number,
    headers: Record<string, string> = {},
    message = 'Request failed',
): Error =>
    Object.assign(new Error(message), { status, response: { headers } });

describe('isGithubRateLimitError', () => {
    it('detects a primary limit (403 with x-ratelimit-remaining: 0)', () => {
        expect(
            isGithubRateLimitError(
                octokitError(403, { 'x-ratelimit-remaining': '0' }),
            ),
        ).toBe(true);
    });

    it('detects a secondary limit (429)', () => {
        expect(isGithubRateLimitError(octokitError(429))).toBe(true);
    });

    it('detects a secondary limit (403 with retry-after)', () => {
        expect(
            isGithubRateLimitError(octokitError(403, { 'retry-after': '60' })),
        ).toBe(true);
    });

    it('detects a rate limit by message', () => {
        expect(
            isGithubRateLimitError(
                octokitError(
                    403,
                    {},
                    'API rate limit exceeded for installation',
                ),
            ),
        ).toBe(true);
    });

    it('is false for a 404 (missing file)', () => {
        expect(isGithubRateLimitError(octokitError(404, {}, 'Not Found'))).toBe(
            false,
        );
    });

    it('is false for a permission 403 with quota remaining', () => {
        expect(
            isGithubRateLimitError(
                octokitError(
                    403,
                    { 'x-ratelimit-remaining': '4999' },
                    'Resource not accessible by integration',
                ),
            ),
        ).toBe(false);
    });

    it('is false for a generic error / non-octokit value', () => {
        expect(isGithubRateLimitError(new Error('socket hang up'))).toBe(false);
        expect(isGithubRateLimitError(null)).toBe(false);
        expect(isGithubRateLimitError(undefined)).toBe(false);
    });
});

describe('getRepoTree', () => {
    beforeEach(() => {
        mockGetTree.mockReset();
    });

    const args = { owner: 'acme', repo: 'jaffle', branch: 'main', token: 't' };

    it('excludes symlink blobs (mode 120000) so the Contents API cannot follow them out of scope', async () => {
        // Security invariant: a symlink blob (mode 120000) must never enter the
        // VFS index. The GitHub Contents API follows symlinks server-side, so
        // including one would let a path like `dbt/escape -> ../../secrets`
        // escape a scoped subPath and return out-of-scope file content.
        mockGetTree.mockResolvedValue({
            data: {
                truncated: false,
                tree: [
                    {
                        path: 'models/orders.sql',
                        type: 'blob',
                        mode: '100644',
                        size: 42,
                    },
                    {
                        path: 'escape',
                        type: 'blob',
                        mode: '120000',
                        size: 20,
                    },
                ],
            },
        });

        const { files } = await getRepoTree(args);
        const paths = files.map((f) => f.path);

        expect(paths).toContain('models/orders.sql'); // regular files are unaffected
        expect(paths).not.toContain('escape'); // the symlink must be excluded
    });
});

describe('searchRepoCode', () => {
    beforeEach(() => {
        mockSearchCode.mockReset();
    });

    const match = (owner: string, repo: string, path: string) => ({
        repository: { owner: { login: owner }, name: repo },
        path,
        text_matches: [{ fragment: `match in ${path}` }],
    });

    it.each([
        'orders repo:acme/secret-infrastructure',
        '(repo:acme/secret-infrastructure) orders',
        'orders OR org:acme',
        '+user:acme orders',
    ])('rejects an injected repository scope qualifier: %s', async (query) => {
        await expect(
            searchRepoCode({
                owner: 'acme',
                repo: 'analytics',
                query,
                token: 'token',
            }),
        ).rejects.toThrow(/scope qualifiers/);
        expect(mockSearchCode).not.toHaveBeenCalled();
    });

    it('discards results outside the exact requested repository', async () => {
        mockSearchCode.mockResolvedValue({
            data: {
                items: [
                    match('acme', 'analytics', 'models/orders.sql'),
                    match(
                        'acme',
                        'secret-infrastructure',
                        'terraform/secrets.tf',
                    ),
                ],
            },
        });

        await expect(
            searchRepoCode({
                owner: 'ACME',
                repo: 'ANALYTICS',
                query: 'orders',
                token: 'token',
            }),
        ).resolves.toEqual([
            {
                owner: 'acme',
                repo: 'analytics',
                path: 'models/orders.sql',
                fragments: ['match in models/orders.sql'],
            },
        ]);
    });
});
