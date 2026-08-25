import { ForbiddenError } from '@lightdash/common'; // pragma: allowlist secret
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
                                    { id: 'team-1', name: 'Product', key: 'PRD' },
                                ],
                            },
                        },
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    data: {
                        projects: {
                            nodes: [
                                {
                                    id: 'project-1',
                                    name: 'Fix data',
                                    teams: { nodes: [{ id: 'team-1' }] },
                                },
                                {
                                    id: 'project-2',
                                    name: 'Other',
                                    teams: { nodes: [{ id: 'team-2' }] },
                                },
                            ],
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
            { id: 'project-1', name: 'Fix data', teamIds: ['team-1'] },
        ]);
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
