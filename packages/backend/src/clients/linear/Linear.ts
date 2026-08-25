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

export class LinearApiError extends LightdashError { // pragma: allowlist secret
    constructor(message: string, statusCode: number = 500) {
        super({
            message,
            name: 'LinearApiError',
            statusCode,
            data: {},
        });
    }
}

type LinearTokenResponse = {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
};

type LinearGraphqlError = {
    message?: string;
};

type LinearGraphqlResponse<T> = {
    data?: T;
    errors?: LinearGraphqlError[];
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

export const getLinearAuthorizationUrl = (
    clientId: string,
    redirectUri: string,
    state: string,
): string => {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: LINEAR_SCOPES.join(','),
        state,
        actor: 'application',
        prompt: 'consent',
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

export const exchangeLinearCodeForToken = async (
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
): Promise<LinearTokens> => {
    try {
        const response = await fetch(LINEAR_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                code,
            }),
        });

        return await parseTokenResponse(response);
    } catch (error) {
        if (error instanceof LightdashError) { // pragma: allowlist secret
            throw error;
        }
        throw new UnexpectedServerError(getErrorMessage(error));
    }
};

export const refreshLinearToken = async (
    refreshToken: string,
    clientId: string,
    clientSecret: string,
): Promise<LinearTokens> => {
    try {
        const response = await fetch(LINEAR_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
            }),
        });

        return await parseTokenResponse(response);
    } catch (error) {
        if (error instanceof LightdashError) { // pragma: allowlist secret
            throw error;
        }
        throw new UnexpectedServerError(getErrorMessage(error));
    }
};

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

export const getLinearTeams = async (token: string): Promise<LinearTeam[]> => {
    const data = await linearGraphql<{
        teams: { nodes: LinearTeam[] };
    }>(
        token,
        `query LinearTeams {
            teams {
                nodes {
                    id
                    name
                    key
                }
            }
        }`,
    );

    return data.teams.nodes;
};

export const getLinearProjects = async (
    token: string,
    teamId?: string,
): Promise<LinearProject[]> => {
    const data = await linearGraphql<{
        projects: {
            nodes: Array<{
                id: string;
                name: string;
                teams: { nodes: Array<{ id: string }> };
            }>;
        };
    }>(
        token,
        `query LinearProjects {
            projects {
                nodes {
                    id
                    name
                    teams {
                        nodes {
                            id
                        }
                    }
                }
            }
        }`,
    );

    const projects = data.projects.nodes.map((project) => ({
        id: project.id,
        name: project.name,
        teamIds: project.teams.nodes.map((team) => team.id),
    }));

    if (!teamId) {
        return projects;
    }

    return projects.filter((project) => project.teamIds.includes(teamId));
};

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
