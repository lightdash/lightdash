import { App, createNodeMiddleware } from '@octokit/app';

const privateKey = process.env.GITHUB_PRIVATE_KEY || '';

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
