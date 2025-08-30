import {
    AlreadyExistsError,
    ForbiddenError,
    getErrorMessage,
    NotFoundError,
    ParameterError,
    UnexpectedGitError,
} from '@lightdash/common';

const DEFAULT_GITLAB_HOST_DOMAIN = 'gitlab.com';

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
