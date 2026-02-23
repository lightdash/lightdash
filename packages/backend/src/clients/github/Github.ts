import {
    AlreadyExistsError,
    ForbiddenError,
    getErrorMessage,
    LightdashError,
    NotFoundError,
    ParameterError,
    UnexpectedGitError,
} from '@lightdash/common';
import { App } from '@octokit/app';
import { Octokit as OctokitRest } from '@octokit/rest';

const { createAppAuth } = require('@octokit/auth-app');

const privateKey = process.env.GITHUB_PRIVATE_KEY
    ? Buffer.from(process.env.GITHUB_PRIVATE_KEY, 'base64').toString('utf-8')
    : undefined;
const appId = process.env.GITHUB_APP_ID;

export const githubApp =
    privateKey && appId
        ? new App({
              appId,
              privateKey,
              oauth: {
                  clientId: process.env.GITHUB_CLIENT_ID || '',
                  clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
              },
              webhooks: {
                  secret: process.env.GITHUB_WEBHOOK_SECRET || 'secret',
              },
          })
        : undefined;

export const getGithubApp = () => {
    if (githubApp === undefined)
        throw new Error('Github integration not configured');
    return githubApp;
};

export const getOctokitRestForUser = (
    authToken: string,
): { octokit: OctokitRest; headers: { authorization: string } } => {
    const octokit = new OctokitRest();
    const headers = {
        authorization: `Bearer ${authToken}`,
    };
    return {
        octokit,
        headers,
    };
};

export const getOctokitRestForApp = (installationId: string): OctokitRest => {
    if (appId === undefined)
        throw new Error('Github integration not configured');

    return new OctokitRest({
        authStrategy: createAppAuth,
        auth: {
            appId,
            privateKey,
            installationId,
        },
    });
};

/** Wrapper to get the right octokit client for the authentication provided
 * If available, use the installation id as a bot
 * otherwise use the token as a user
 * The token can be generated using the installation id
 */
export const getOctokit = (
    installationId?: string,
    token?: string,
): { octokit: OctokitRest; headers: { authorization: string } | undefined } => {
    if (installationId) {
        return {
            octokit: getOctokitRestForApp(installationId),
            headers: undefined,
        };
    }
    return getOctokitRestForUser(token!);
};

export const getOrRefreshToken = async (
    token: string,
    refreshToken: string,
) => {
    // check if token expired and refresh if needed
    try {
        const tokenResponse = await getGithubApp().oauth.checkToken({
            token,
        });
        if (tokenResponse.status === 200) return { token, refreshToken };
    } catch {
        console.debug(
            'Refreshing expired or invalid github token',
            refreshToken,
        );
    }

    const auth = await getGithubApp().oauth.refreshToken({
        refreshToken,
    });

    return {
        token: auth.data.access_token,
        refreshToken: auth.data.refresh_token,
    };
};

export const getLastCommit = async ({
    owner,
    repo,
    branch,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
    token?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);
    // GitHub API uses `sha` param to filter by branch
    // @see https://docs.github.com/en/rest/commits/commits#list-commits
    const response = await octokit.rest.repos.listCommits({
        owner,
        repo,
        sha: branch,
        headers,
    });

    return response.data[0];
};

export const getFileContent = async ({
    fileName,
    owner,
    repo,
    branch,
    installationId,
    token,
    hostDomain,
}: {
    fileName: string;
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
    token?: string;
    hostDomain?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        // GitHub API uses `ref` param for branch/tag/commit
        // @see https://docs.github.com/en/rest/repos/contents#get-repository-content
        const response = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: fileName,
            ref: branch,
            headers,
        });

        if ('content' in response.data) {
            const content = Buffer.from(
                response.data.content,
                'base64',
            ).toString('utf-8');
            return { content, sha: response.data.sha };
        }

        throw new NotFoundError('file not found');
    } catch (error) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status === 404
        ) {
            throw new NotFoundError(`file ${fileName} not found in Github`);
        }
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const createBranch = async ({
    owner,
    repo,
    sha,
    branch,
    installationId,
    token,
    hostDomain,
}: {
    owner: string;
    repo: string;
    sha: string;
    branch: string;
    installationId?: string;
    token?: string;
    hostDomain?: string;
}): Promise<Awaited<ReturnType<OctokitRest['rest']['git']['createRef']>>> => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        // GitHub API uses `ref` as fully qualified reference (refs/heads/...)
        // @see https://docs.github.com/en/rest/git/refs#create-a-reference
        const response = await octokit.rest.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${branch}`,
            sha,
            headers,
        });
        return response;
    } catch (error) {
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};
export const getInstallationToken = async (
    installationId: string,
): Promise<string> => {
    try {
        const octokit = getOctokitRestForApp(installationId);
        const response = await octokit.rest.apps.createInstallationAccessToken({
            installation_id: parseInt(installationId, 10),
        });
        return response.data.token;
    } catch (error) {
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const updateFile = async ({
    owner,
    repo,
    fileName,
    content,
    fileSha,
    branch,
    message,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    fileName: string;
    content: string;
    fileSha: string;
    branch: string;
    message: string;
    installationId?: string;
    token?: string;
}): Promise<
    Awaited<
        ReturnType<OctokitRest['rest']['repos']['createOrUpdateFileContents']>
    >
> => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        // GitHub API uses `branch` param for target branch
        // @see https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents
        const response = await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: fileName,
            message,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            sha: fileSha,
            branch,
            headers,
            committer: {
                name: 'Lightdash',
                email: 'developers@glightdash.com',
            },
            author: {
                name: 'Lightdash',
                email: 'developers@glightdash.com',
            },
        });
        return response;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const createFile = async ({
    owner,
    repo,
    fileName,
    content,
    branch,
    message,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    fileName: string;
    content: string;
    branch: string;
    message: string;
    installationId?: string;
    token?: string;
}): Promise<
    Awaited<
        ReturnType<OctokitRest['rest']['repos']['createOrUpdateFileContents']>
    >
> => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        // GitHub API uses `branch` param for target branch
        // @see https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents
        const response = await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: fileName,
            message,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            branch,
            headers,
        });
        return response;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const createPullRequest = async ({
    owner,
    repo,
    title,
    body,
    head,
    base,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
    installationId?: string;
    token?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        const response = await octokit.rest.pulls.create({
            owner,
            repo,
            title,
            body,
            head,
            base,
            headers,
        });

        return response.data;
    } catch (e) {
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const checkFileDoesNotExist = async ({
    owner,
    repo,
    path,
    installationId,
    token,
    branch,
}: {
    owner: string;
    repo: string;
    path: string;
    installationId?: string;
    token?: string;
    branch: string;
}): Promise<boolean> => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        // GitHub API uses `ref` param for branch/tag/commit
        // @see https://docs.github.com/en/rest/repos/contents#get-repository-content
        await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
            ref: branch,
            headers,
        });
        throw new AlreadyExistsError(`File "${path}" already exists in Github`);
    } catch (error) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status === 404
        ) {
            return true;
        }
        throw error;
    }
};

export const getBranches = async ({
    owner,
    repo,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    installationId?: string;
    token?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);

    try {
        const branches = await octokit.paginate(octokit.repos.listBranches, {
            owner,
            repo,
            headers,
        });
        return branches;
    } catch (e) {
        console.error(e);
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const createRepository = async ({
    installationId,
    name,
    description,
    isPrivate = true,
}: {
    installationId: string;
    name: string;
    description?: string;
    isPrivate?: boolean;
}): Promise<{
    owner: string;
    repo: string;
    fullName: string;
    defaultBranch: string;
}> => {
    const octokit = getOctokitRestForApp(installationId);

    try {
        // Get the installation to find the account (org or user)
        const { data: installation } = await octokit.rest.apps.getInstallation({
            installation_id: parseInt(installationId, 10),
        });

        const { account } = installation;
        if (!account || !('login' in account)) {
            throw new ParameterError(
                'Could not determine repository owner from installation',
            );
        }

        const owner = account.login;

        // Determine if the installation is for an org or user
        // Check if the account has a 'type' property (User/Org accounts have it)
        const accountType = 'type' in account ? account.type : undefined;

        let repo;
        if (accountType === 'Organization') {
            // Create repo in the org account
            const response = await octokit.rest.repos.createInOrg({
                org: owner,
                name,
                description: description || 'Lightdash dbt project',
                private: isPrivate,
                auto_init: true, // Creates with README so it's not empty
            });
            repo = response.data;
        } else {
            // Create repo for user account
            const response =
                await octokit.rest.repos.createForAuthenticatedUser({
                    name,
                    description: description || 'Lightdash dbt project',
                    private: isPrivate,
                    auto_init: true,
                });
            repo = response.data;
        }

        return {
            owner: repo.owner.login,
            repo: repo.name,
            fullName: repo.full_name,
            defaultBranch: repo.default_branch,
        };
    } catch (e) {
        if (
            e instanceof Error &&
            'status' in e &&
            (e as { status: number }).status === 422
        ) {
            throw new AlreadyExistsError(`Repository "${name}" already exists`);
        }
        throw new UnexpectedGitError(getErrorMessage(e));
    }
};

export const getDirectoryContents = async ({
    owner,
    repo,
    branch,
    path,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    installationId?: string;
    token?: string;
}): Promise<
    Array<{ name: string; path: string; type: string; size: number; sha: string }>
> => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        const response = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: path || '',
            ref: branch,
            headers,
        });

        if (!Array.isArray(response.data)) {
            throw new ParameterError('Path is not a directory');
        }

        return response.data.map((item) => ({
            name: item.name,
            path: item.path,
            type: item.type,
            size: item.size ?? 0,
            sha: item.sha,
        }));
    } catch (error) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status === 404
        ) {
            throw new NotFoundError(`Directory ${path} not found in GitHub`);
        }
        if (error instanceof ParameterError) {
            throw error;
        }
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};

export const deleteFile = async ({
    owner,
    repo,
    path,
    sha,
    branch,
    message,
    installationId,
    token,
}: {
    owner: string;
    repo: string;
    path: string;
    sha: string;
    branch: string;
    message: string;
    installationId?: string;
    token?: string;
}) => {
    const { octokit, headers } = getOctokit(installationId, token);
    try {
        const response = await octokit.rest.repos.deleteFile({
            owner,
            repo,
            path,
            sha,
            branch,
            message,
            headers,
            committer: {
                name: 'Lightdash',
                email: 'developers@lightdash.com',
            },
        });
        return response;
    } catch (error) {
        if (
            error instanceof Error &&
            `status` in error &&
            error.status === 404
        ) {
            throw new NotFoundError(`File ${path} not found in GitHub`);
        }
        throw new UnexpectedGitError(getErrorMessage(error));
    }
};
