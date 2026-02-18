import 'express-session';

declare module 'express-session' {
    interface SessionData {
        oauth: {
            inviteCode?: string | undefined;
            returnTo?: string | undefined;
            codeVerifier?: string | undefined;
            state?: string | undefined;
            isPopup?: boolean | undefined;
            databricks?: {
                projectUuid?: string | undefined;
                projectName?: string | undefined;
                serverHostName?: string | undefined;
                credentialsName?: string | undefined;
            };
        };
        slack: {
            teamId?: string | undefined;
            channelId?: string | undefined;
            messageTs?: string | undefined;
            threadTs?: string | undefined;
        };
    }
}
