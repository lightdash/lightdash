import { ForbiddenError, NotFoundError } from '@lightdash/common'; // pragma: allowlist secret
import {
    createLinearIssue,
    exchangeLinearCodeForToken,
    getLinearAuthorizationUrl,
    getLinearOrganization,
    getLinearProjects,
    getLinearTeams,
} from './Linear';

describe('Linear client', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('builds the OAuth authorize URL with application actor and issue scopes', () => {
        const url = getLinearAuthorizationUrl(
            'client-1',
            'https://app.example.com/api/v1/linear/oauth/callback',
            'state-1',
        );

        expect(url).toContain('https://linear.app/oauth/authorize?');
        expect(url).toContain('client_id=client-1');
        expect(url).toContain('response_type=code');
        expect(url).toContain('scope=read%2Cissues%3Acreate');
        expect(url).toContain('actor=application');
        expect(url).toContain('state=state-1');
    });

    it('exchanges an authorization code for tokens', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    access_token: 'access-1',
                    refresh_token: 'refresh-1',
                }),
            }),
        );

        await expect(
            exchangeLinearCodeForToken(
                'code-1',
                'client-1',
                'secret-1',
                'https://app.example.com/callback',
            ),
        ).resolves.toEqual({
            token: 'access-1',
            refreshToken: 'refresh-1',
        });
    });

    it('rejects a token response without an access token', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({}),
            }),
        );

        await expect(
            exchangeLinearCodeForToken(
                'code-1',
                'client-1',
                'secret-1',
                'https://app.example.com/callback',
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('loads organization, teams, and team-scoped projects', async () => {
        const fetchMock = vi.fn().mockImplementation(async (_url, options) => {
            const body = JSON.parse(options.body) as { query: string };
            if (body.query.includes('LinearOrganization')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: {
                            organization: {
                                id: 'org-1',
                                name: 'Acme',
                                urlKey: 'acme',
                            },
                        },
                    }),
                };
            }
            if (body.query.includes('LinearTeams')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: {
                            teams: {
                                nodes: [
                                    {
                                        id: 'team-1',
                                        name: 'Product',
                                        key: 'PRD',
                                    },
                                ],
                                pageInfo: {
                                    hasNextPage: false,
                                    endCursor: null,
                                },
                            },
                        },
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    data: {
                        team: {
                            projects: {
                                nodes: [{ id: 'project-1', name: 'Fix data' }],
                                pageInfo: {
                                    hasNextPage: false,
                                    endCursor: null,
                                },
                            },
                        },
                    },
                }),
            };
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(getLinearOrganization('token')).resolves.toEqual({
            id: 'org-1',
            name: 'Acme',
            urlKey: 'acme',
        });
        await expect(getLinearTeams('token')).resolves.toEqual([
            { id: 'team-1', name: 'Product', key: 'PRD' },
        ]);
        await expect(getLinearProjects('token', 'team-1')).resolves.toEqual([
            { id: 'project-1', name: 'Fix data' },
        ]);
    });

    it('follows pagination until the last page of teams', async () => {
        const fetchMock = vi.fn().mockImplementation(async (_url, options) => {
            const { variables } = JSON.parse(options.body) as {
                variables: { after: string | null };
            };
            const isFirstPage = variables.after === null;

            return {
                ok: true,
                json: async () => ({
                    data: {
                        teams: {
                            nodes: isFirstPage
                                ? [
                                      {
                                          id: 'team-1',
                                          name: 'Product',
                                          key: 'PRD',
                                      },
                                  ]
                                : [{ id: 'team-2', name: 'Data', key: 'DAT' }],
                            pageInfo: {
                                hasNextPage: isFirstPage,
                                endCursor: isFirstPage ? 'cursor-1' : null,
                            },
                        },
                    },
                }),
            };
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(getLinearTeams('token')).resolves.toEqual([
            { id: 'team-1', name: 'Product', key: 'PRD' },
            { id: 'team-2', name: 'Data', key: 'DAT' },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('rejects projects for a team the integration cannot see', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ data: { team: null } }),
            }),
        );

        await expect(
            getLinearProjects('token', 'team-missing'),
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('creates an issue and returns the Linear URL', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: {
                        issueCreate: {
                            success: true,
                            issue: {
                                id: 'issue-1',
                                identifier: 'PRD-12',
                                url: 'https://linear.app/acme/issue/PRD-12',
                                title: 'Broken metric',
                            },
                        },
                    },
                }),
            }),
        );

        await expect(
            createLinearIssue('token', {
                title: 'Broken metric',
                description: 'Needs review',
                teamId: 'team-1',
                projectId: 'project-1',
            }),
        ).resolves.toEqual({
            id: 'issue-1',
            identifier: 'PRD-12',
            url: 'https://linear.app/acme/issue/PRD-12',
            title: 'Broken metric',
        });
    });
});
