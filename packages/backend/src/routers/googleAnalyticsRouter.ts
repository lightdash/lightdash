// googleAnalyticsRouter.ts

import { Request, Response } from 'express';
import { google } from 'googleapis';
import { lightdashConfig } from '../config/lightdashConfig';
// import { runGoogleAnalyticsIngestion } from '../services/GoogleAnalyticsIngestion';

const oauth2Client = new google.auth.OAuth2(
    lightdashConfig.auth.googleAnalytics?.clientId,
    lightdashConfig.auth.googleAnalytics?.clientSecret,
    `${lightdashConfig.siteUrl}/api/v1/auth/google-analytics/callback`,
);

// STEP 1: Redirect user to consent screen
export const googleAnalyticsAuthStart = (req: Request, res: Response) => {
    const state = req.user?.userUuid || ''; // Optional: persist state
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // To get refresh_token
        scope: ['https://www.googleapis.com/auth/analytics.readonly'],
        prompt: 'consent', // Force refresh_token on re-auth
        state,
    });
    res.redirect(url);
};

// STEP 2: Handle OAuth callback
export const googleAnalyticsAuthCallback = async (req: Request, res: Response) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).send('Missing code');

    try {
        const { tokens } = await oauth2Client.getToken(code.toString());

        if (!tokens.access_token) {
            return res.status(401).send('OAuth token exchange failed.');
        }

        oauth2Client.setCredentials(tokens);

        const analytics = google.analyticsadmin({ version: 'v1', auth: oauth2Client });
        const accountsRes = await analytics.accounts.list();

        const accounts = accountsRes.data.accounts || [];

        if (!accounts.length) {
            return res.status(400).send('No GA accounts found.');
        }

        // Store account info and token in your DB
        const connectionService = req.services.getConnectionService();

        await connectionService.createOrUpdate({
            user_uuid: req.user?.userUuid || state || null,
            type: 'GOOGLE_ANALYTICS',
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            metadata: {
                accounts,
            },
        });

        // Optional: kick off ingestion
        await runGoogleAnalyticsIngestion(tokens.access_token);

        return res.redirect('/');
    } catch (e: any) {
        console.error('Google Analytics OAuth error:', e);
        return res.status(500).send(`OAuth error: ${e.message}`);
    }
};
