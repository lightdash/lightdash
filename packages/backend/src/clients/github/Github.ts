import { NotFoundError } from '@lightdash/common';
import { App } from '@octokit/app';
import { Octokit as OctokitRest } from '@octokit/rest';

const { createAppAuth } = require('@octokit/auth-app');

const privateKey = process.env.GITHUB_PRIVATE_KEY;
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

export const getOctokitRestForUser = (authToken: string) => {
    const octokit = new OctokitRest();
    const headers = {
        authorization: `Bearer ${authToken}`,
    };
    return {
        octokit,
        headers,
    };
};
export const getOctokitRestForApp = (installationId: string) => {
    if (appId === undefined)
        throw new Error('Github integration not configured');

    return new OctokitRest({
        authStrategy: createAppAuth,
        auth: {
            appId,
            privateKey: process.env.GITHUB_PRIVATE_KEY,
            installationId,
        },
    });
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
    const response = await new OctokitRest().rest.repos.listCommits({
        owner,
        repo,
        ref: branch,
        headers: {
            authorization: `Bearer ${token}`,
        },
    });

    return response.data[0];
};

export const getFileContent = async ({
    fileName,
    owner,
    repo,
    branch,
    token,
}: {
    fileName: string;
    owner: string;
    repo: string;
    branch: string;
    token: string;
}) => {
    const { octokit, headers } = getOctokitRestForUser(token);
    const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: fileName,
        ref: branch,
        headers,
    });

    if ('content' in response.data) {
        const content = Buffer.from(response.data.content, 'base64').toString(
            'utf-8',
        );
        return { content, sha: response.data.sha };
    }

    throw new NotFoundError('file not found');
};

export const createBranch = async ({
    owner,
    repo,
    sha,
    branchName,
    token,
}: {
    owner: string;
    repo: string;
    sha: string;
    branchName: string;
    token: string;
}) => {
    const { octokit, headers } = getOctokitRestForUser(token);

    const response = await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha,
        headers,
    });
    return response;
};

export const updateFile = async ({
    owner,
    repo,
    fileName,
    content,
    fileSha,
    branchName,
    message,
    token,
}: {
    owner: string;
    repo: string;
    fileName: string;
    content: string;
    fileSha: string;
    branchName: string;
    message: string;
    token: string;
}) => {
    const { octokit, headers } = getOctokitRestForUser(token);

    const response = await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: fileName,
        message,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        sha: fileSha,
        branch: branchName,
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
};
