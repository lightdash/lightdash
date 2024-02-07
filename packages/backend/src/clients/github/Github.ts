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

export const getFileContent = async (fileName: string) => {
    const response = await octokit.rest.repos.getContent({
        owner: 'rephus', // TODO hardcoded : replace
        repo: 'jaffle_shop', // TODO hardcoded : replace
        path: fileName,
        ref: 'main', // TODO hardcoded : replace
    });

    console.log('file content', response);

    if ('content' in response.data) {
        const content = Buffer.from(response.data.content, 'base64').toString(
            'utf-8',
        );
        console.log('file content ', content);
        return { content, sha: response.data.sha };
    }

    throw new NotFoundError('file not found');
};

export const createBranch = async (branchName: string) => {
    const response = await octokit.rest.git.createRef({
        owner: 'rephus', // TODO hardcoded : replace
        repo: 'jaffle_shop', // TODO hardcoded : replace
        ref: `refs/heads/${branchName}`,
        sha: 'a0f63994e1d857fe5fdf280a159e20a95bf75b50', // TODO hardcoded : replace
    });
    return response;
};

export const updateFile = async (
    fileName: string,
    content: string,
    fileSha: string,
    branchName: string,
    message: string,
) => {
    const response = await octokit.rest.repos.createOrUpdateFileContents({
        owner: 'rephus', // TODO hardcoded : replace
        repo: 'jaffle_shop', // TODO hardcoded : replace
        path: fileName,
        message,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        sha: fileSha,
        branch: branchName,
        committer: {
            // TODO hardcoded : replace
            name: 'Javier Rengel',
            email: 'rephus@gmail.com',
        },
        author: {
            name: 'Javier Rengel',
            email: 'rephus@gmail.com',
        },
    });
    return response;
};
