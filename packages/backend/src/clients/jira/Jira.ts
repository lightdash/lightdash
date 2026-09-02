import {
    ForbiddenError,
    getErrorMessage,
    LightdashError, // pragma: allowlist secret
    NotFoundError,
    UnexpectedServerError,
    type JiraCreatedIssue,
    type JiraIssueType,
    type JiraProject,
    type JiraSite,
} from '@lightdash/common'; // pragma: allowlist secret

const JIRA_AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const JIRA_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const JIRA_RESOURCES_URL =
    'https://api.atlassian.com/oauth/token/accessible-resources';
const JIRA_API_URL = 'https://api.atlassian.com/ex/jira';
const JIRA_SCOPES = ['read:jira-work', 'write:jira-work', 'offline_access'];
const PAGE_SIZE = 100;

export class JiraApiError extends LightdashError {
    // pragma: allowlist secret
    constructor(message: string, statusCode: number = 500) {
        super({ message, name: 'JiraApiError', statusCode, data: {} });
    }
}

export type JiraTokens = {
    token: string;
    refreshToken: string | null;
    expiresAt: Date;
};

type JiraTokenResponse = {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
};

const parseTokenResponse = async (response: Response): Promise<JiraTokens> => {
    const body = (await response.json()) as JiraTokenResponse;
    if (!response.ok || !body.access_token) {
        throw new ForbiddenError('Invalid Jira authentication token');
    }

    return {
        token: body.access_token,
        refreshToken: body.refresh_token ?? null,
        expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
    };
};

const requestJiraToken = async (
    body: Record<string, string>,
): Promise<JiraTokens> => {
    try {
        const response = await fetch(JIRA_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return await parseTokenResponse(response);
    } catch (error) {
        if (error instanceof LightdashError) throw error;
        throw new UnexpectedServerError(getErrorMessage(error));
    }
};

export const getJiraAuthorizationUrl = (
    clientId: string,
    redirectUri: string,
    state: string,
): string => {
    const params = new URLSearchParams({
        audience: 'api.atlassian.com',
        client_id: clientId,
        scope: JIRA_SCOPES.join(' '),
        redirect_uri: redirectUri,
        state,
        response_type: 'code',
        prompt: 'consent',
    });
    return `${JIRA_AUTHORIZE_URL}?${params.toString()}`;
};

export const exchangeJiraCodeForToken = (
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
): Promise<JiraTokens> =>
    requestJiraToken({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
    });

export const refreshJiraToken = (
    refreshToken: string,
    clientId: string,
    clientSecret: string,
): Promise<JiraTokens> =>
    requestJiraToken({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    });

const parseJiraResponse = async <T>(response: Response): Promise<T> => {
    if (response.status === 401) {
        throw new ForbiddenError('Invalid Jira access token');
    }
    if (response.status === 403) {
        throw new ForbiddenError('Insufficient permissions for Jira');
    }
    if (response.status === 404) {
        throw new NotFoundError('Jira resource not found');
    }
    if (!response.ok) {
        throw new JiraApiError(
            `Jira API error: ${response.status} ${await response.text()}`,
            response.status,
        );
    }
    return (await response.json()) as T;
};

export const getJiraSites = async (token: string): Promise<JiraSite[]> => {
    const response = await fetch(JIRA_RESOURCES_URL, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
        },
    });
    const sites =
        await parseJiraResponse<Array<JiraSite & { scopes?: string[] }>>(
            response,
        );
    return sites
        .filter((site) => site.scopes?.some((scope) => scope.includes('jira')))
        .map(({ id, name, url }) => ({ id, name, url }));
};

const jiraRequest = async <T>(
    token: string,
    siteId: string,
    path: string,
    init?: RequestInit,
): Promise<T> => {
    const response = await fetch(
        `${JIRA_API_URL}/${encodeURIComponent(siteId)}/rest/api/3${path}`,
        {
            ...init,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
                ...init?.headers,
            },
        },
    );
    return parseJiraResponse<T>(response);
};

export const getJiraProjects = async (
    token: string,
    siteId: string,
): Promise<JiraProject[]> => {
    const projects: JiraProject[] = [];
    let startAt = 0;
    let total = 0;
    do {
        // eslint-disable-next-line no-await-in-loop
        const page = await jiraRequest<{
            values: JiraProject[];
            startAt: number;
            maxResults: number;
            total: number;
        }>(
            token,
            siteId,
            `/project/search?startAt=${startAt}&maxResults=${PAGE_SIZE}&orderBy=name`,
        );
        projects.push(
            ...page.values.map(({ id, key, name }) => ({ id, key, name })),
        );
        startAt = page.startAt + page.maxResults;
        total = page.total;
    } while (startAt < total);
    return projects;
};

export const getJiraIssueTypes = async (
    token: string,
    siteId: string,
    projectId: string,
): Promise<JiraIssueType[]> => {
    const issueTypes = await jiraRequest<
        Array<JiraIssueType & { statuses?: unknown[] }>
    >(token, siteId, `/project/${encodeURIComponent(projectId)}/statuses`);
    return issueTypes
        .filter((issueType) => !issueType.subtask)
        .map(({ id, name, subtask }) => ({ id, name, subtask }));
};

const toAdf = (description: string) => ({
    type: 'doc',
    version: 1,
    content: description.split('\n').map((line) => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : [],
    })),
});

export const createJiraIssue = async (
    token: string,
    site: JiraSite,
    input: {
        title: string;
        description: string;
        projectId: string;
        issueTypeId: string;
    },
): Promise<JiraCreatedIssue> => {
    const issue = await jiraRequest<{ id: string; key: string }>(
        token,
        site.id,
        '/issue',
        {
            method: 'POST',
            body: JSON.stringify({
                fields: {
                    project: { id: input.projectId },
                    issuetype: { id: input.issueTypeId },
                    summary: input.title,
                    description: toAdf(input.description),
                },
            }),
        },
    );
    return {
        ...issue,
        url: `${site.url.replace(/\/$/, '')}/browse/${issue.key}`,
    };
};

export const linkJiraIssueUrl = async (
    token: string,
    siteId: string,
    input: { issueIdOrKey: string; url: string; title: string },
): Promise<void> => {
    const response = await fetch(
        `${JIRA_API_URL}/${encodeURIComponent(siteId)}/rest/api/3/issue/${encodeURIComponent(input.issueIdOrKey)}/remotelink`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                object: { url: input.url, title: input.title },
            }),
        },
    );
    if (!response.ok) await parseJiraResponse(response);
};
