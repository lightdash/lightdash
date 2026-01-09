import {
    AlreadyExistsError,
    ForbiddenError,
    getErrorMessage,
    NotFoundError,
    ParameterError,
    UnexpectedGitError,
} from '@lightdash/common';

const DEFAULT_GITEA_HOST_DOMAIN = 'gitea.com';

const getBaseUrl = (hostDomain?: string) => {
    if (!hostDomain) return `https://${DEFAULT_GITEA_HOST_DOMAIN}`;
    const trimmed = hostDomain.replace(/\/+$/, '');
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }
    return `https://${trimmed}`;
};

const getApiUrl = (hostDomain: string, endpoint: string) =>
    `${getBaseUrl(hostDomain)}/api/v1${endpoint}`;

const makeGiteaRequest = async (
    url: string,
    token: string,
    options: RequestInit = {},
) => {
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
            throw new ForbiddenError('Invalid Gitea access token');
        }
        if (response.status === 403) {
            throw new ForbiddenError(
                'Insufficient permissions for Gitea repository',
            );
        }
        if (response.status === 404) {
            throw new NotFoundError('Gitea resource not found');
        }
        if (response.status === 409) {
            throw new AlreadyExistsError('Gitea resource already exists');
        }
        if (response.status === 422) {
            throw new ParameterError(`Gitea request error: ${errorText}`);
        }
        throw new UnexpectedGitError(
            `Gitea API error: ${response.status} ${errorText}`,
        );
    }

    if (response.status === 204) return null;
    return response.json();
};

export const getLastCommit = async ({
    owner,
    repo,
    branch,
    token,
    hostDomain = DEFAULT_GITEA_HOST_DOMAIN,
}: {
    owner: string;
    repo: string;
    branch: string;
    token: string;
    hostDomain?: string;
}) => {
    const url = getApiUrl(
        hostDomain,
        `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(
            branch,
        )}&limit=1&stat=false&verification=false&files=false`,
    );

    const commits = await makeGiteaRequest(url, token);
    if (!Array.isArray(commits) || commits.length === 0) {
        throw new NotFoundError(`No commits found for branch ${branch}`);
    }

    return { sha: commits[0].sha };
};

export const getFileContent = async ({
    fileName,
    owner,
    repo,
    branch,
    token,
    hostDomain = DEFAULT_GITEA_HOST_DOMAIN,
}: {
    fileName: string;
    owner: string;
    repo: string;
    branch: string;
    token: string;
    hostDomain?: string;
}) => {
    const encodedPath = encodeURIComponent(fileName);
    const url = getApiUrl(
        hostDomain,
        `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(
            branch,
        )}`,
    );

    try {
        const fileData = await makeGiteaRequest(url, token);
        if (!fileData?.content) {
            throw new NotFoundError(`file ${fileName} not found in Gitea`);
        }
        const content = Buffer.from(
            fileData.content,
            fileData.encoding || 'base64',
        ).toString('utf-8');

        return {
            content,
            sha: fileData.sha,
        };
    } catch (error) {
        if (error instanceof NotFoundError) {
            throw error;
        }
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const createBranch = async ({
    branch,
    owner,
    repo,
    sha,
    token,
    hostDomain = DEFAULT_GITEA_HOST_DOMAIN,
}: {
    branch: string;
    owner: string;
    repo: string;
    sha: string;
    token: string;
    hostDomain?: string;
}) => {
    const url = getApiUrl(hostDomain, `/repos/${owner}/${repo}/branches`);

    try {
        return await makeGiteaRequest(url, token, {
            method: 'POST',
            body: JSON.stringify({
                new_branch_name: branch,
                old_ref_name: sha,
            }),
        });
    } catch (error) {
        if (error instanceof AlreadyExistsError) {
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
    hostDomain = DEFAULT_GITEA_HOST_DOMAIN,
}: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    token: string;
    hostDomain?: string;
}) => {
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
    hostDomain = DEFAULT_GITEA_HOST_DOMAIN,
}: {
    fileName: string;
    content: string;
    message: string;
    owner: string;
    repo: string;
    branch: string;
    token: string;
    hostDomain?: string;
}) => {
    const encodedPath = encodeURIComponent(fileName);
    const url = getApiUrl(
        hostDomain,
        `/repos/${owner}/${repo}/contents/${encodedPath}`,
    );

    return makeGiteaRequest(url, token, {
        method: 'PUT',
        body: JSON.stringify({
            branch,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            message,
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
    hostDomain = DEFAULT_GITEA_HOST_DOMAIN,
}: {
    fileName: string;
    content: string;
    fileSha: string;
    message: string;
    owner: string;
    repo: string;
    branch: string;
    token: string;
    hostDomain?: string;
}) => {
    const encodedPath = encodeURIComponent(fileName);
    const url = getApiUrl(
        hostDomain,
        `/repos/${owner}/${repo}/contents/${encodedPath}`,
    );

    return makeGiteaRequest(url, token, {
        method: 'PUT',
        body: JSON.stringify({
            branch,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            message,
            sha: fileSha,
        }),
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
    hostDomain = DEFAULT_GITEA_HOST_DOMAIN,
}: {
    title: string;
    body: string;
    head: string;
    base: string;
    owner: string;
    repo: string;
    token: string;
    hostDomain?: string;
}) => {
    const url = getApiUrl(hostDomain, `/repos/${owner}/${repo}/pulls`);

    const pullRequest = await makeGiteaRequest(url, token, {
        method: 'POST',
        body: JSON.stringify({
            title,
            body,
            head,
            base,
        }),
    });

    return {
        html_url: pullRequest.html_url || pullRequest.url,
        title: pullRequest.title,
        number: pullRequest.number ?? pullRequest.id,
    };
};

export const getBranches = async ({
    owner,
    repo,
    token,
    hostDomain = DEFAULT_GITEA_HOST_DOMAIN,
}: {
    owner: string;
    repo: string;
    token: string;
    hostDomain?: string;
}) => {
    const url = getApiUrl(hostDomain, `/repos/${owner}/${repo}/branches`);
    const branches = await makeGiteaRequest(url, token);
    return branches;
};
