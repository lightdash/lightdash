export const buildLinearAppSetupUrl = (siteUrl: string): string => {
    const callbackUrl = new URL('/api/v1/linear/oauth/callback', siteUrl).href;
    const params = new URLSearchParams({
        distribution: 'private',
        'display.description':
            'Creates issues from Lightdash AI agent review findings.',
        'developer.name': 'Lightdash',
        'oauth.client_name': 'Lightdash AI reviews',
        'oauth.client_uri': siteUrl,
        'oauth.redirect_uris': callbackUrl,
        'oauth.grant_types': 'authorization_code',
    });
    return `https://linear.app/settings/api/applications/new?${params.toString()}`;
};
