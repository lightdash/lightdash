import fetchMock from 'jest-fetch-mock';
import {
    getFileContent,
    getGitlabRepoTree,
    getMergeRequestComments,
    isGitlabRateLimitError,
} from './Gitlab';

// One GitLab Trees API page: `entries` are raw {type, path} items (blobs AND
// trees); `nextPage` populates the x-next-page header GitLab uses for offset
// pagination (empty string ⇒ last page).
const treePage = (
    entries: Array<{ type: string; path: string }>,
    nextPage: string,
) =>
    [
        JSON.stringify(entries),
        { headers: { 'x-next-page': nextPage } },
    ] as const;

describe('GitlabClient.getMergeRequestComments', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    // GitLab returns notes newest-first (sort=desc). The reader drops system
    // notes and empty bodies, then reverses to oldest-first so it matches the
    // GitHub comments contract (extractPreviewUrlFromComments scans newest-last).
    it('drops system/empty notes and returns bodies oldest-first', async () => {
        fetchMock.mockResponseOnce(
            JSON.stringify([
                { body: 'newest human note', system: false },
                { body: '', system: false },
                { body: 'changed the description', system: true },
                { body: 'oldest human note', system: false },
            ]),
        );

        const comments = await getMergeRequestComments({
            owner: 'my-group',
            repo: 'my-repo',
            iid: 42,
            token: 'glpat-xxx',
        });

        expect(comments).toEqual(['oldest human note', 'newest human note']);
    });

    it('requests the notes endpoint on the default host with a bearer token', async () => {
        fetchMock.mockResponseOnce(JSON.stringify([]));

        await getMergeRequestComments({
            owner: 'my-group',
            repo: 'my-repo',
            iid: 7,
            token: 'glpat-xxx',
        });

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(
            'https://gitlab.com/api/v4/projects/my-group%2Fmy-repo/merge_requests/7/notes?order_by=created_at&sort=desc&per_page=100',
        );
        expect((options?.headers as Record<string, string>).Authorization).toBe(
            'Bearer glpat-xxx',
        );
    });

    it('targets a self-hosted host when hostDomain is provided', async () => {
        fetchMock.mockResponseOnce(JSON.stringify([]));

        await getMergeRequestComments({
            owner: 'my-group',
            repo: 'my-repo',
            iid: 7,
            token: 'glpat-xxx',
            hostDomain: 'gitlab.internal.acme.com',
        });

        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe(
            'https://gitlab.internal.acme.com/api/v4/projects/my-group%2Fmy-repo/merge_requests/7/notes?order_by=created_at&sort=desc&per_page=100',
        );
    });
});

describe('GitlabClient.getGitlabRepoTree', () => {
    beforeEach(() => {
        fetchMock.resetMocks();
    });

    const args = {
        owner: 'my-group',
        repo: 'my-repo',
        branch: 'main',
        token: 'glpat-xxx',
    };

    it('follows x-next-page across pages and returns only blobs (size 0)', async () => {
        fetchMock.mockResponseOnce(
            ...treePage(
                [
                    { type: 'tree', path: 'models' },
                    { type: 'blob', path: 'models/orders.sql' },
                ],
                '2', // more pages
            ),
        );
        fetchMock.mockResponseOnce(
            ...treePage(
                [{ type: 'blob', path: 'dbt_project.yml' }],
                '', // last page
            ),
        );

        const { files, truncated } = await getGitlabRepoTree(args);

        expect(fetchMock.mock.calls).toHaveLength(2);
        // directory ('tree') entries dropped; blobs from both pages combined
        expect(files).toEqual([
            { path: 'models/orders.sql', size: 0 },
            { path: 'dbt_project.yml', size: 0 },
        ]);
        expect(truncated).toBe(false);
        // page params requested in order
        expect(fetchMock.mock.calls[0][0]).toContain('page=1');
        expect(fetchMock.mock.calls[1][0]).toContain('page=2');
    });

    it('stops at maxPages and reports truncated when more pages remain', async () => {
        fetchMock.mockResponseOnce(
            ...treePage([{ type: 'blob', path: 'a.sql' }], '2'),
        );
        // A second page exists, but maxPages=1 means we must not fetch it.
        fetchMock.mockResponseOnce(
            ...treePage([{ type: 'blob', path: 'b.sql' }], ''),
        );

        const { files, truncated } = await getGitlabRepoTree({
            ...args,
            maxPages: 1,
        });

        expect(fetchMock.mock.calls).toHaveLength(1);
        expect(files).toEqual([{ path: 'a.sql', size: 0 }]);
        expect(truncated).toBe(true);
    });

    it('does not set truncated when the single page is the last page', async () => {
        fetchMock.mockResponseOnce(
            ...treePage([{ type: 'blob', path: 'only.sql' }], ''),
        );

        const { files, truncated } = await getGitlabRepoTree({
            ...args,
            maxPages: 1,
        });

        expect(fetchMock.mock.calls).toHaveLength(1);
        expect(files).toEqual([{ path: 'only.sql', size: 0 }]);
        expect(truncated).toBe(false);
    });

    it('throws a recoverable GitlabRateLimitError on HTTP 429', async () => {
        fetchMock.mockResponseOnce('rate limited', { status: 429 });

        const error = await getGitlabRepoTree(args).catch((e) => e);
        expect(isGitlabRateLimitError(error)).toBe(true);
    });
});

describe('GitlabClient.getFileContent rate limiting', () => {
    beforeEach(() => {
        fetchMock.resetMocks();
    });

    // Regression for M1: file reads go through makeGitlabRequest, which must map
    // a 429 to the recoverable GitlabRateLimitError (not UnexpectedGitError) so
    // the VFS degrades gracefully under a real rate limit, same as the tree path.
    it('maps a 429 to a recoverable GitlabRateLimitError', async () => {
        fetchMock.mockResponseOnce(
            'Rate limit exceeded; see https://docs.gitlab.com/...',
            { status: 429 },
        );

        const error = await getFileContent({
            owner: 'my-group',
            repo: 'my-repo',
            branch: 'main',
            fileName: 'dbt/dbt_project.yml',
            token: 'glpat-xxx',
        }).catch((e) => e);

        expect(isGitlabRateLimitError(error)).toBe(true);
    });
});
