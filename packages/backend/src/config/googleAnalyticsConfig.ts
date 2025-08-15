export type GoogleAnalyticsConfig = {
    clientId: string;
    clientSecret: string;
    enabled: boolean;
    oauthStart: string;
    redirectUri: string;
};

export function parseGoogleAnalyticsConfig(): GoogleAnalyticsConfig {
    if (!process.env.GA_CLIENT_ID || !process.env.GA_CLIENT_SECRET) {
        throw new Error('Missing required Google Analytics config environment variables');
    }
    const siteUrl = process.env.VITE_SITE_URL || '';
    return {
        clientId: process.env.GA_CLIENT_ID,
        clientSecret: process.env.GA_CLIENT_SECRET,
        enabled: true,
        oauthStart: `${siteUrl}/api/v1/auth/google-analytics/start`,
        redirectUri: `${siteUrl}/api/v1/auth/google-analytics/callback`, // <-- add this
    };
}