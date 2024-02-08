import { NotFoundError } from '@lightdash/common';
import { App, createNodeMiddleware } from '@octokit/app';
import { Octokit as OktokitRest } from '@octokit/rest';

const { createAppAuth } = require('@octokit/auth-app');

const privateKey = process.env.GITHUB_PRIVATE_KEY || '';
const installationId = 47029382; // replace this once it is installed

export const githubApp = new App({
    appId: '703670',
    privateKey,
    oauth: {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    },
    webhooks: {
        secret: 'Test',
    },
});

export const githubAppMiddleware = createNodeMiddleware(githubApp, {
    pathPrefix: '/api/v1/github',
});

const octokit = new OktokitRest({
    authStrategy: createAppAuth,
    auth: {
        appId: 703670,
        privateKey: process.env.GITHUB_PRIVATE_KEY,
        installationId,
    },
});

export const getLastCommit = async ({
    owner,
    repo,
    branch,
}: {
    owner: string;
    repo: string;
    branch: string;
}) => {
    const response = await octokit.rest.repos.listCommits({
        owner,
        repo,
        ref: branch,
    });

    return response.data[0];
};

export const getFileContent = async ({
    fileName,
    owner,
    repo,
    branch,
}: {
    fileName: string;
    owner: string;
    repo: string;
    branch: string;
}) => {
    const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: fileName,
        ref: branch,
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
}: {
    owner: string;
    repo: string;
    sha: string;
    branchName: string;
}) => {
    const response = await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha,
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
}: {
    owner: string;
    repo: string;
    fileName: string;
    content: string;
    fileSha: string;
    branchName: string;
    message: string;
}) => {
    const response = await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: fileName,
        message,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        sha: fileSha,
        branch: branchName,
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
