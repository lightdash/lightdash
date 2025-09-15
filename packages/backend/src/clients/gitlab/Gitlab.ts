import {
    AlreadyExistsError,
    AnyType,
    ForbiddenError,
    getErrorMessage,
    NotFoundError,
    ParameterError,
    UnexpectedGitError,
} from '@lightdash/common';

const DEFAULT_GITLAB_HOST_DOMAIN = 'gitlab.com';

const GITLAB_OAUTH_CONFIG = {
    authorizationURL: 'https://gitlab.com/oauth/authorize',
    tokenURL: 'https://gitlab.com/oauth/token',
    scopes: ['api', 'read_api', 'openid', 'profile', 'email'],
};

type GitlabApiParams = {
    owner: string;
    repo: string;
    token: string;
    hostDomain?: string;
};

type GitlabFileParams = GitlabApiParams & {
    fileName: string;
    branch: string;
};

type GitlabBranchParams = GitlabApiParams & {
    branch: string;
    sha: string;
};

type GitlabUpdateFileParams = GitlabFileParams & {
    content: string;
    fileSha?: string;
    message: string;
};

type GitlabCreateFileParams = GitlabFileParams & {
    content: string;
    message: string;
};

type GitlabPullRequestParams = GitlabApiParams & {
    title: string;
    body: string;
    head: string;
    base: string;
};

const getProjectId = (owner: string, repo: string) =>
    encodeURIComponent(`${owner}/${repo}`);

const getApiUrl = (hostDomain: string, endpoint: string) =>
    `https://${hostDomain}/api/v4${endpoint}`;

const makeGitlabRequest = async (
    url: string,
    token: string,
    options: RequestInit = {},
) => {
    const response = await fetch(url, {
        ...options,
        headers: {
            'PRIVATE-TOKEN': token,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
            throw new ForbiddenError('Invalid GitLab access token');
        }
        if (response.status === 403) {
            throw new ForbiddenError(
                'Insufficient permissions for GitLab repository',
            );
        }
        if (response.status === 404) {
            throw new NotFoundError('GitLab resource not found');
        }
        throw new UnexpectedGitError(
            `GitLab API error: ${response.status} ${errorText}`,
        );
    }

    return response.json();
};

export const getLastCommit = async ({
    owner,
    repo,
    branch,
    token,
    hostDomain = DEFAULT_GITLAB_HOST_DOMAIN,
}: Omit<GitlabFileParams, 'fileName'>) => {
    const projectId = getProjectId(owner, repo);
    const url = getApiUrl(
        hostDomain,
        `/projects/${projectId}/repository/commits?ref_name=${branch}&per_page=1`,
    );

    const commits = await makeGitlabRequest(url, token);
    if (!commits || commits.length === 0) {
        throw new NotFoundError(`No commits found for branch ${branch}`);
    }

    return { sha: commits[0].id };
};

export const getFileContent = async ({
    fileName,
    owner,
    repo,
    branch,
    token,
    hostDomain = DEFAULT_GITLAB_HOST_DOMAIN,
}: GitlabFileParams) => {
    const projectId = getProjectId(owner, repo);
    const encodedPath = encodeURIComponent(fileName);
    const url = getApiUrl(
        hostDomain,
        `/projects/${projectId}/repository/files/${encodedPath}?ref=${branch}`,
    );

    const fileData = await makeGitlabRequest(url, token);

    return {
        content: Buffer.from(fileData.content, 'base64').toString('utf-8'),
        sha: fileData.last_commit_id,
    };
};

export const createBranch = async ({
    branch,
    owner,
    repo,
    sha,
    token,
    hostDomain = DEFAULT_GITLAB_HOST_DOMAIN,
}: GitlabBranchParams) => {
    const projectId = getProjectId(owner, repo);
    const url = getApiUrl(
        hostDomain,
        `/projects/${projectId}/repository/branches`,
    );

    try {
        return await makeGitlabRequest(url, token, {
            method: 'POST',
            body: JSON.stringify({
                branch,
                ref: sha,
            }),
        });
    } catch (error) {
        if (getErrorMessage(error).includes('already exists')) {
            throw new AlreadyExistsError(`Branch ${branch} already exists`);
        }
        throw error;
    }
};

export const checkFileDoesNotExist = async ({
    owner,
    repo,
    path,
    branch,
    token,
    hostDomain = DEFAULT_GITLAB_HOST_DOMAIN,
}: GitlabApiParams & { path: string; branch: string }) => {
    try {
        await getFileContent({
            fileName: path,
            owner,
            repo,
            branch,
            token,
            hostDomain,
        });
        throw new AlreadyExistsError(`File ${path} already exists`);
    } catch (error) {
        if (error instanceof NotFoundError) {
            // File doesn't exist, which is what we want
            return;
        }
        throw error;
    }
};

export const createFile = async ({
    fileName,
    content,
    message,
    owner,
    repo,
    branch,
    token,
    hostDomain = DEFAULT_GITLAB_HOST_DOMAIN,
}: GitlabCreateFileParams) => {
    const projectId = getProjectId(owner, repo);
    const encodedPath = encodeURIComponent(fileName);
    const url = getApiUrl(
        hostDomain,
        `/projects/${projectId}/repository/files/${encodedPath}`,
    );

    return makeGitlabRequest(url, token, {
        method: 'POST',
        body: JSON.stringify({
            branch,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            commit_message: message,
            encoding: 'base64',
        }),
    });
};

export const updateFile = async ({
    fileName,
    content,
    fileSha,
    message,
    owner,
    repo,
    branch,
    token,
    hostDomain = DEFAULT_GITLAB_HOST_DOMAIN,
}: GitlabUpdateFileParams) => {
    const projectId = getProjectId(owner, repo);
    const encodedPath = encodeURIComponent(fileName);
    const url = getApiUrl(
        hostDomain,
        `/projects/${projectId}/repository/files/${encodedPath}`,
    );

    const body: Record<string, string | number> = {
        branch,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        commit_message: message,
        encoding: 'base64',
    };

    if (fileSha) {
        body.last_commit_id = fileSha;
    }

    return makeGitlabRequest(url, token, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
};

export const createPullRequest = async ({
    title,
    body,
    head,
    base,
    owner,
    repo,
    token,
    hostDomain = DEFAULT_GITLAB_HOST_DOMAIN,
}: GitlabPullRequestParams) => {
    const projectId = getProjectId(owner, repo);
    const url = getApiUrl(hostDomain, `/projects/${projectId}/merge_requests`);

    const mergeRequest = await makeGitlabRequest(url, token, {
        method: 'POST',
        body: JSON.stringify({
            source_branch: head,
            target_branch: base,
            title,
            description: body,
        }),
    });

    return {
        html_url: mergeRequest.web_url,
        title: mergeRequest.title,
        number: mergeRequest.iid,
    };
};

export const getBranches = async ({
    owner,
    repo,
    token,
    hostDomain = DEFAULT_GITLAB_HOST_DOMAIN,
}: GitlabApiParams) => {
    const projectId = getProjectId(owner, repo);
    const url = getApiUrl(
        hostDomain,
        `/projects/${projectId}/repository/branches`,
    );

    const branches = await makeGitlabRequest(url, token);
    return branches;
};

// Simple HTTP client using fetch (available in Node.js 18+)
const gitlabFetch = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return response.json();
};

export const getGitlabAuthorizationUrl = (
    clientId: string,
    redirectUri: string,
    state: string,
    gitlabInstanceUrl: string = 'https://gitlab.com',
): string => {
    const authUrl =
        gitlabInstanceUrl === 'https://gitlab.com'
            ? GITLAB_OAUTH_CONFIG.authorizationURL
            : `${gitlabInstanceUrl}/oauth/authorize`;

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        state,
        scope: GITLAB_OAUTH_CONFIG.scopes.join(' '),
    });

    return `${authUrl}?${params.toString()}`;
};

export const exchangeCodeForToken = async (
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    gitlabInstanceUrl: string = 'https://gitlab.com',
) => {
    const tokenUrl =
        gitlabInstanceUrl === 'https://gitlab.com'
            ? GITLAB_OAUTH_CONFIG.tokenURL
            : `${gitlabInstanceUrl}/oauth/token`;

    try {
        const response = await gitlabFetch(tokenUrl, {
            method: 'POST',
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
            }),
        });

        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { access_token, refresh_token } = response;

        if (!access_token || !refresh_token) {
            throw new ForbiddenError('Invalid authentication token');
        }

        return {
            token: access_token,
            refreshToken: refresh_token,
        };
    } catch (error: AnyType) {
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const refreshGitlabToken = async (
    refreshToken: string,
    clientId: string,
    clientSecret: string,
    gitlabInstanceUrl: string = 'https://gitlab.com',
) => {
    const tokenUrl =
        gitlabInstanceUrl === 'https://gitlab.com'
            ? GITLAB_OAUTH_CONFIG.tokenURL
            : `${gitlabInstanceUrl}/oauth/token`;

    try {
        const response = await gitlabFetch(tokenUrl, {
            method: 'POST',
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { access_token, refresh_token } = response;

        return {
            token: access_token,
            refreshToken: refresh_token || refreshToken, // GitLab might not return new refresh token
        };
    } catch (error) {
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const getGitlabUser = async (
    token: string,
    gitlabInstanceUrl: string = 'https://gitlab.com',
) => {
    const baseURL =
        gitlabInstanceUrl === 'https://gitlab.com'
            ? 'https://gitlab.com/api/v4'
            : `${gitlabInstanceUrl}/api/v4`;

    try {
        return await gitlabFetch(`${baseURL}/user`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
    } catch (error) {
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const getGitlabProjects = async (
    token: string,
    gitlabInstanceUrl: string = 'https://gitlab.com',
) => {
    const baseURL =
        gitlabInstanceUrl === 'https://gitlab.com'
            ? 'https://gitlab.com/api/v4'
            : `${gitlabInstanceUrl}/api/v4`;

    try {
        const projects = await gitlabFetch(
            `${baseURL}/projects?membership=true&per_page=100&order_by=updated_at&sort=desc`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        );

        return projects.map((project: AnyType) => ({
            id: project.id,
            name: project.name,
            nameWithNamespace: project.name_with_namespace,
            pathWithNamespace: project.path_with_namespace,
            webUrl: project.web_url,
            defaultBranch: project.default_branch,
        }));
    } catch (error) {
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

// Additional functions for file operations (for future use in write-back functionality)
export const getGitlabFileContent = async ({
    projectId,
    filePath,
    ref = 'main',
    token,
    gitlabInstanceUrl = 'https://gitlab.com',
}: {
    projectId: number;
    filePath: string;
    ref?: string;
    token: string;
    gitlabInstanceUrl?: string;
}) => {
    const baseURL =
        gitlabInstanceUrl === 'https://gitlab.com'
            ? 'https://gitlab.com/api/v4'
            : `${gitlabInstanceUrl}/api/v4`;

    try {
        const encodedFilePath = encodeURIComponent(filePath);
        const response = await gitlabFetch(
            `${baseURL}/projects/${projectId}/repository/files/${encodedFilePath}?ref=${ref}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        );

        if (response.content) {
            const content = Buffer.from(response.content, 'base64').toString(
                'utf-8',
            );
            return {
                content,
                sha: response.blob_id,
                filePath: response.file_path,
            };
        }

        throw new NotFoundError('File not found');
    } catch (error: AnyType) {
        if (error.message.includes('404')) {
            throw new NotFoundError(
                `File ${filePath} not found in GitLab project`,
            );
        }
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const createGitlabFile = async ({
    projectId,
    filePath,
    content,
    branch,
    commitMessage,
    token,
    gitlabInstanceUrl = 'https://gitlab.com',
}: {
    projectId: number;
    filePath: string;
    content: string;
    branch: string;
    commitMessage: string;
    token: string;
    gitlabInstanceUrl?: string;
}) => {
    const baseURL =
        gitlabInstanceUrl === 'https://gitlab.com'
            ? 'https://gitlab.com/api/v4'
            : `${gitlabInstanceUrl}/api/v4`;

    try {
        const encodedFilePath = encodeURIComponent(filePath);
        const response = await gitlabFetch(
            `${baseURL}/projects/${projectId}/repository/files/${encodedFilePath}`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    branch,
                    content: Buffer.from(content, 'utf-8').toString('base64'),
                    commit_message: commitMessage,
                    encoding: 'base64',
                }),
            },
        );

        return response;
    } catch (error: AnyType) {
        if (error.message.includes('400')) {
            throw new AlreadyExistsError(
                `File "${filePath}" already exists in GitLab project`,
            );
        }
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const createGitlabBranch = async ({
    projectId,
    branchName,
    ref,
    token,
    gitlabInstanceUrl = 'https://gitlab.com',
}: {
    projectId: number;
    branchName: string;
    ref: string;
    token: string;
    gitlabInstanceUrl?: string;
}) => {
    const baseURL =
        gitlabInstanceUrl === 'https://gitlab.com'
            ? 'https://gitlab.com/api/v4'
            : `${gitlabInstanceUrl}/api/v4`;

    try {
        const response = await gitlabFetch(
            `${baseURL}/projects/${projectId}/repository/branches`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    branch: branchName,
                    ref,
                }),
            },
        );

        return response;
    } catch (error: AnyType) {
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const createGitlabMergeRequest = async ({
    projectId,
    title,
    description,
    sourceBranch,
    targetBranch,
    token,
    gitlabInstanceUrl = 'https://gitlab.com',
}: {
    projectId: number;
    title: string;
    description: string;
    sourceBranch: string;
    targetBranch: string;
    token: string;
    gitlabInstanceUrl?: string;
}) => {
    const baseURL =
        gitlabInstanceUrl === 'https://gitlab.com'
            ? 'https://gitlab.com/api/v4'
            : `${gitlabInstanceUrl}/api/v4`;

    try {
        const response = await gitlabFetch(
            `${baseURL}/projects/${projectId}/merge_requests`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    title,
                    description,
                    source_branch: sourceBranch,
                    target_branch: targetBranch,
                }),
            },
        );

        return {
            id: response.id,
            iid: response.iid,
            title: response.title,
            webUrl: response.web_url,
            state: response.state,
        };
    } catch (error: AnyType) {
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const getOrRefreshToken = async (
    token: string,
    refreshToken: string,
    clientId: string,
    clientSecret: string,
    gitlabInstanceUrl: string = 'https://gitlab.com',
) => {
    // Check if token is still valid by making a simple API call
    const baseURL =
        gitlabInstanceUrl === 'https://gitlab.com'
            ? 'https://gitlab.com/api/v4'
            : `${gitlabInstanceUrl}/api/v4`;

    try {
        const response = await fetch(`${baseURL}/user`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (response.ok) {
            // Token is still valid, return as-is
            return { token, refreshToken };
        }
    } catch {
        // Token validation failed, proceed to refresh
        console.debug(
            'Refreshing expired or invalid gitlab token',
            refreshToken,
        );
    }

    // Token is invalid or expired, refresh it
    const auth = await refreshGitlabToken(
        refreshToken,
        clientId,
        clientSecret,
        gitlabInstanceUrl,
    );

    return {
        token: auth.token,
        refreshToken: auth.refreshToken,
    };
};
