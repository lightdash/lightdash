export type GoogleAnalyticsConfig = {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    enabled: boolean;
};

export function parseGoogleAnalyticsConfig(): GoogleAnalyticsConfig {
    if (!process.env.GA_CLIENT_ID || !process.env.GA_CLIENT_SECRET || !process.env.GA_REDIRECT_URI || process.env.GA_ENABLED === undefined) {
        throw new Error('Missing required Google Analytics config environment variables');
    }
    return {
        clientId: process.env.GA_CLIENT_ID,
        clientSecret: process.env.GA_CLIENT_SECRET,
        redirectUri: process.env.GA_REDIRECT_URI,
        enabled: process.env.GA_ENABLED === 'true',
    };
}