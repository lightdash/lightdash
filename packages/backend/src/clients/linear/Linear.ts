import {
    ForbiddenError,
    getErrorMessage,
    LightdashError, // pragma: allowlist secret
    NotFoundError,
    UnexpectedServerError,
    type LinearCreatedIssue,
    type LinearProject,
    type LinearTeam,
} from '@lightdash/common'; // pragma: allowlist secret

const LINEAR_AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';
const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
const LINEAR_SCOPES = ['read', 'issues:create'];

// Linear pages every connection and caps `first` at 250. Without an explicit
// page size it returns 50, silently truncating the pickers on large workspaces.
const LINEAR_PAGE_SIZE = 250;

export class LinearApiError extends LightdashError {
    // pragma: allowlist secret
    constructor(message: string, statusCode: number = 500) {
        super({
            message,
            name: 'LinearApiError',
            statusCode,
            data: {},
        });
    }
}

type LinearGraphqlError = {
    message?: string;
};

type LinearGraphqlResponse<T> = {
    data?: T;
    errors?: LinearGraphqlError[];
};

type LinearConnection<T> = {
    nodes: T[];
    pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
    };
};

export type LinearOrganization = {
    id: string;
    name: string;
    urlKey: string;
};

export type LinearTokens = {
    token: string;
    refreshToken: string | null;
};

type LinearTokenResponse = {
    access_token?: string;
    refresh_token?: string;
};

export const getLinearAuthorizationUrl = (
    clientId: string,
    redirectUri: string,
    state: string,
    codeChallenge: string,
): string => {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: LINEAR_SCOPES.join(','),
        state,
        actor: 'app',
        prompt: 'consent',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    });

    return `${LINEAR_AUTHORIZE_URL}?${params.toString()}`;
};

const parseTokenResponse = async (
    response: Response,
): Promise<LinearTokens> => {
    const body = (await response.json()) as LinearTokenResponse;
    if (!response.ok || !body.access_token) {
        throw new ForbiddenError('Invalid Linear authentication token');
    }

    return {
        token: body.access_token,
        refreshToken: body.refresh_token ?? null,
    };
};

const requestLinearToken = async (
    body: URLSearchParams,
): Promise<LinearTokens> => {
    try {
        const response = await fetch(LINEAR_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });

        return await parseTokenResponse(response);
    } catch (error) {
        if (error instanceof LightdashError) {
            throw error;
        }
        throw new UnexpectedServerError(getErrorMessage(error));
    }
};

export const exchangeLinearCodeForToken = async (
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier: string,
): Promise<LinearTokens> =>
    requestLinearToken(
        new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            redirect_uri: redirectUri,
            code,
            code_verifier: codeVerifier,
        }),
    );

export const refreshLinearToken = async (
    refreshToken: string,
    clientId: string,
): Promise<LinearTokens> =>
    requestLinearToken(
        new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: refreshToken,
        }),
    );

export const linearGraphql = async <T>(
    token: string,
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> => {
    const response = await fetch(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });

    if (response.status === 401) {
        throw new ForbiddenError('Invalid Linear access token');
    }
    if (response.status === 403) {
        throw new ForbiddenError('Insufficient permissions for Linear');
    }
    if (response.status === 404) {
        throw new NotFoundError('Linear resource not found');
    }
    if (!response.ok) {
        const errorText = await response.text();
        throw new LinearApiError(
            `Linear API error: ${response.status} ${errorText}`,
            response.status,
        );
    }

    const body = (await response.json()) as LinearGraphqlResponse<T>;
    if (body.errors && body.errors.length > 0) {
        throw new LinearApiError(
            body.errors[0]?.message ?? 'Linear GraphQL error',
        );
    }
    if (!body.data) {
        throw new UnexpectedServerError('Linear API returned no data');
    }

    return body.data;
};

export const getLinearOrganization = async (
    token: string,
): Promise<LinearOrganization> => {
    const data = await linearGraphql<{
        organization: LinearOrganization;
    }>(
        token,
        `query LinearOrganization {
            organization {
                id
                name
                urlKey
            }
        }`,
    );

    return data.organization;
};

const collectPages = async <T>(
    getPage: (cursor: string | null) => Promise<LinearConnection<T>>,
): Promise<T[]> => {
    const nodes: T[] = [];
    let cursor: string | null = null;

    do {
        // eslint-disable-next-line no-await-in-loop
        const page = await getPage(cursor);
        nodes.push(...page.nodes);
        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor !== null);

    return nodes;
};

export const getLinearTeams = async (token: string): Promise<LinearTeam[]> =>
    collectPages(async (after) => {
        const data = await linearGraphql<{
            teams: LinearConnection<LinearTeam>;
        }>(
            token,
            `query LinearTeams($first: Int!, $after: String) {
                teams(first: $first, after: $after) {
                    nodes {
                        id
                        name
                        key
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }`,
            { first: LINEAR_PAGE_SIZE, after },
        );

        return data.teams;
    });

export const getLinearProjects = async (
    token: string,
    teamId: string,
): Promise<LinearProject[]> =>
    collectPages(async (after) => {
        const data = await linearGraphql<{
            team: { projects: LinearConnection<LinearProject> } | null;
        }>(
            token,
            `query LinearTeamProjects($teamId: String!, $first: Int!, $after: String) {
                team(id: $teamId) {
                    projects(first: $first, after: $after) {
                        nodes {
                            id
                            name
                        }
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                    }
                }
            }`,
            { teamId, first: LINEAR_PAGE_SIZE, after },
        );

        if (!data.team) {
            throw new NotFoundError(`Linear team ${teamId} not found`);
        }

        return data.team.projects;
    });

export const createLinearIssue = async (
    token: string,
    input: {
        title: string;
        description: string;
        teamId: string;
        projectId: string | null;
    },
): Promise<LinearCreatedIssue> => {
    const data = await linearGraphql<{
        issueCreate: {
            success: boolean;
            issue: LinearCreatedIssue | null;
        };
    }>(
        token,
        `mutation LinearIssueCreate($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                success
                issue {
                    id
                    identifier
                    url
                    title
                }
            }
        }`,
        {
            input: {
                title: input.title,
                description: input.description,
                teamId: input.teamId,
                ...(input.projectId ? { projectId: input.projectId } : {}),
            },
        },
    );

    if (!data.issueCreate.success || !data.issueCreate.issue) {
        throw new UnexpectedServerError('Failed to create Linear issue');
    }

    return data.issueCreate.issue;
};

export const linkLinearIssueUrl = async (
    token: string,
    input: {
        issueId: string;
        url: string;
        title: string;
    },
): Promise<void> => {
    const data = await linearGraphql<{
        attachmentLinkURL: {
            success: boolean;
        };
    }>(
        token,
        `mutation LinearAttachmentLinkURL($issueId: String!, $url: String!, $title: String) {
            attachmentLinkURL(issueId: $issueId, url: $url, title: $title) {
                success
            }
        }`,
        {
            issueId: input.issueId,
            url: input.url,
            title: input.title,
        },
    );

    if (!data.attachmentLinkURL.success) {
        throw new UnexpectedServerError('Failed to attach URL to Linear issue');
    }
};
