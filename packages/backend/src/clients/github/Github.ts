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

export const getFileContent = async (fileName: string) => {
    const appOctokit = new OktokitRest({
        authStrategy: createAppAuth,
        auth: {
            appId: 703670,
            privateKey: process.env.GITHUB_PRIVATE_KEY,
            installationId,
        },
    });

    const response = await appOctokit.rest.repos.getContent({
        owner: 'rephus',
        repo: 'jaffle_shop',
        path: fileName,
        ref: 'main',
    });

    if ('content' in response.data) {
        const content = Buffer.from(response.data.content, 'base64').toString(
            'utf-8',
        );
        console.log('file content ', content);
        return content;
    }

    throw new NotFoundError('file not found');
};
