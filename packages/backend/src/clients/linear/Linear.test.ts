import { LinearConnectError, NotFoundError } from '@lightdash/common'; // pragma: allowlist secret
import Logger from '../../logging/logger';
import {
    createLinearIssue,
    exchangeLinearCodeForToken,
    getLinearAuthorizationUrl,
    getLinearOrganization,
    getLinearProjects,
    getLinearTeams,
    LinearTokenRequestError,
    linkLinearIssueUrl,
} from './Linear';

const exchange = () =>
    exchangeLinearCodeForToken(
        'code-1',
        { clientId: 'client-1', clientSecret: 'secret-1' },
        'https://app.example.com/callback',
        'verifier-1',
    );

describe('Linear client', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('builds an app-actor PKCE authorization URL', () => {
        const url = new URL(
            getLinearAuthorizationUrl(
                'client-1',
                'https://app.example.com/api/v1/linear/oauth/callback',
                'state-1',
                'challenge-1',
            ),
        );

        expect(url.origin + url.pathname).toBe(
            'https://linear.app/oauth/authorize',
        );
        expect(url.searchParams.get('client_id')).toBe('client-1');
        expect(url.searchParams.get('scope')).toBe('read,issues:create');
        expect(url.searchParams.get('actor')).toBe('app');
        expect(url.searchParams.get('state')).toBe('state-1');
        expect(url.searchParams.get('code_challenge')).toBe('challenge-1');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('exchanges an authorization code using PKCE without a secret', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                access_token: 'access-1',
                refresh_token: 'refresh-1',
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(exchange()).resolves.toEqual({
            token: 'access-1',
            refreshToken: 'refresh-1',
        });
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.linear.app/oauth/token',
            expect.objectContaining({
                body: expect.objectContaining({
                    get: expect.any(Function),
                }),
            }),
        );
        const request = fetchMock.mock.calls[0][1];
        expect(request.body.get('client_id')).toBe('client-1');
        expect(request.body.get('client_secret')).toBe('secret-1');
        expect(request.body.get('code_verifier')).toBe('verifier-1');
    });

    it('rejects a token response without an access token', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({}),
            }),
        );

        await expect(exchange()).rejects.toMatchObject({
            reason: LinearConnectError.UNKNOWN,
            statusCode: 403,
        });
    });

    it.each([
        [400, { error: 'invalid_client' }, LinearConnectError.INVALID_CLIENT],
        [400, { error: 'invalid_secret' }, LinearConnectError.INVALID_CLIENT],
        [
            400,
            { error: 'unauthorized_client' },
            LinearConnectError.UNAUTHORIZED_CLIENT,
        ],
        [400, { error: 'invalid_grant' }, LinearConnectError.INVALID_GRANT],
        [400, { error: 'invalid_request' }, LinearConnectError.UNKNOWN],
        [503, {}, LinearConnectError.LINEAR_UNAVAILABLE],
    ])('maps a %s token response %j to %s', async (status, body, reason) => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status,
                json: async () => body,
            }),
        );

        const error = await exchange().catch((e) => e);
        expect(error).toBeInstanceOf(LinearTokenRequestError);
        expect(error.reason).toBe(reason);
    });

    it('treats an unreachable or non-JSON token endpoint as unavailable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockRejectedValue(new Error('ECONNRESET')),
        );
        await expect(exchange()).rejects.toMatchObject({
            reason: LinearConnectError.LINEAR_UNAVAILABLE,
            statusCode: 502,
        });

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 502,
                json: async () => {
                    throw new SyntaxError('Unexpected token <');
                },
            }),
        );
        await expect(exchange()).rejects.toMatchObject({
            reason: LinearConnectError.LINEAR_UNAVAILABLE,
        });
    });

    it("logs Linear's reason when the token request is rejected", async () => {
        const warnSpy = vi.spyOn(Logger, 'warn');
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 400,
                json: async () => ({
                    error: 'invalid_grant',
                    error_description: 'code_verifier mismatch',
                }),
            }),
        );

        await expect(exchange()).rejects.toThrow(
            'Invalid Linear authentication token',
        );
        expect(warnSpy).toHaveBeenCalledWith(
            'Linear token request failed with status 400: invalid_grant: code_verifier mismatch',
        );
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
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.linear.app/graphql',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer token',
                }),
            }),
        );
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

    it('attaches a URL to an existing Linear issue', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    attachmentLinkURL: {
                        success: true,
                    },
                },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            linkLinearIssueUrl('token', {
                issueId: 'issue-1',
                url: 'https://app.example.com/reviews',
                title: 'Open in app',
            }),
        ).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.linear.app/graphql',
            expect.objectContaining({
                body: expect.stringContaining('LinearAttachmentLinkURL'),
            }),
        );
    });
});
