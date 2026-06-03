import fetchMock from 'jest-fetch-mock';
import { getMergeRequestComments } from './Gitlab';

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
