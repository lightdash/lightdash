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
    token,
}: {
    owner: string;
    repo: string;
    branch: string;
    token: string;
}) => {
    const { octokit, headers } = getOctokitRestForUser(token);
    const response = await octokit.rest.repos.listCommits({
        owner,
        repo,
        ref: branch,
        headers,
    });

    return response.data[0];
};

export const getFileContent = async ({
    fileName,
    owner,
    repo,
    branch,
    token,
    hostDomain,
}: {
    fileName: string;
    owner: string;
    repo: string;
    branch: string;
    token: string;
    hostDomain?: string;
}) => {
    const { octokit, headers } = getOctokitRestForUser(token);
    try {
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
    token,
    hostDomain,
}: {
    owner: string;
    repo: string;
    sha: string;
    branch: string;
    token: string;
    hostDomain?: string;
}): Promise<Awaited<ReturnType<OctokitRest['rest']['git']['createRef']>>> => {
    const { octokit, headers } = getOctokitRestForUser(token);

    try {
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
    token,
}: {
    owner: string;
    repo: string;
    fileName: string;
    content: string;
    fileSha: string;
    branch: string;
    message: string;
    token: string;
}): Promise<
    Awaited<
        ReturnType<OctokitRest['rest']['repos']['createOrUpdateFileContents']>
    >
> => {
    const { octokit, headers } = getOctokitRestForUser(token);
    try {
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
    token,
}: {
    owner: string;
    repo: string;
    fileName: string;
    content: string;
    branch: string;
    message: string;
    token: string;
}): Promise<
    Awaited<
        ReturnType<OctokitRest['rest']['repos']['createOrUpdateFileContents']>
    >
> => {
    const { octokit, headers } = getOctokitRestForUser(token);

    try {
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
    token,
    branch,
}: {
    owner: string;
    repo: string;
    path: string;
    token: string;
    branch: string;
}): Promise<boolean> => {
    const { octokit, headers } = getOctokitRestForUser(token);

    try {
        await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
            branch,
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
