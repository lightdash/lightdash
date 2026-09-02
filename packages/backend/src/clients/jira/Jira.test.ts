import { ForbiddenError } from '@lightdash/common'; // pragma: allowlist secret
import {
    createJiraIssue,
    exchangeJiraCodeForToken,
    getJiraAuthorizationUrl,
    getJiraIssueTypes,
    getJiraProjects,
    getJiraSites,
    linkJiraIssueUrl,
} from './Jira';

describe('Jira client', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('builds the Atlassian authorization URL with offline access', () => {
        const url = new URL(
            getJiraAuthorizationUrl(
                'client-1',
                'https://app.example.com/api/v1/jira/oauth/callback',
                'state-1',
            ),
        );
        expect(url.origin + url.pathname).toBe(
            'https://auth.atlassian.com/authorize',
        );
        expect(url.searchParams.get('audience')).toBe('api.atlassian.com');
        expect(url.searchParams.get('scope')).toContain('write:jira-work');
        expect(url.searchParams.get('scope')).toContain('offline_access');
        expect(url.searchParams.get('state')).toBe('state-1');
    });

    it('exchanges a code and records token expiry', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-02T10:00:00Z'));
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                access_token: 'access-1',
                refresh_token: 'refresh-1',
                expires_in: 3600,
            }),
        });
        vi.stubGlobal('fetch', fetchMock);
        await expect(
            exchangeJiraCodeForToken(
                'code-1',
                'client-1',
                'secret-1',
                'https://app.example.com/callback',
            ),
        ).resolves.toEqual({
            token: 'access-1',
            refreshToken: 'refresh-1',
            expiresAt: new Date('2026-09-02T11:00:00Z'),
        });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            client_secret: 'secret-1',
            grant_type: 'authorization_code',
        });
        vi.useRealTimers();
    });

    it('rejects a token response without an access token', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
        );
        await expect(
            exchangeJiraCodeForToken('code', 'client', 'secret', 'callback'),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('filters accessible resources to Jira sites', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => [
                    {
                        id: 'jira-1',
                        name: 'Acme',
                        url: 'https://acme.atlassian.net',
                        scopes: ['read:jira-work'],
                    },
                    {
                        id: 'confluence-1',
                        name: 'Docs',
                        url: 'https://acme.atlassian.net/wiki',
                        scopes: ['read:confluence-content.all'],
                    },
                ],
            }),
        );
        await expect(getJiraSites('token')).resolves.toEqual([
            {
                id: 'jira-1',
                name: 'Acme',
                url: 'https://acme.atlassian.net',
            },
        ]);
    });

    it('paginates projects and returns non-subtask issue types', async () => {
        const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
            ok: true,
            json: async () =>
                url.includes('/statuses')
                    ? [
                          { id: '1', name: 'Task', subtask: false },
                          { id: '2', name: 'Subtask', subtask: true },
                      ]
                    : {
                          values: [{ id: '10', key: 'DATA', name: 'Data' }],
                          startAt: 0,
                          maxResults: 100,
                          total: 1,
                      },
        }));
        vi.stubGlobal('fetch', fetchMock);
        await expect(getJiraProjects('token', 'site-1')).resolves.toEqual([
            { id: '10', key: 'DATA', name: 'Data' },
        ]);
        await expect(
            getJiraIssueTypes('token', 'site-1', '10'),
        ).resolves.toEqual([{ id: '1', name: 'Task', subtask: false }]);
    });

    it('creates an issue with ADF and links it back to Lightdash', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: '100', key: 'DATA-42' }),
            })
            .mockResolvedValueOnce({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        await expect(
            createJiraIssue(
                'token',
                {
                    id: 'site-1',
                    name: 'Acme',
                    url: 'https://acme.atlassian.net',
                },
                {
                    title: 'Broken metric',
                    description: 'Needs review',
                    projectId: '10',
                    issueTypeId: '1',
                },
            ),
        ).resolves.toEqual({
            id: '100',
            key: 'DATA-42',
            url: 'https://acme.atlassian.net/browse/DATA-42',
        });
        const createBody = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(createBody.fields.description).toMatchObject({
            type: 'doc',
            version: 1,
        });
        await expect(
            linkJiraIssueUrl('token', 'site-1', {
                issueIdOrKey: 'DATA-42',
                url: 'https://app.example.com/reviews',
                title: 'Open in Lightdash', // pragma: allowlist secret
            }),
        ).resolves.toBeUndefined();
        expect(fetchMock.mock.calls[1][0]).toContain('/DATA-42/remotelink');
    });
});
