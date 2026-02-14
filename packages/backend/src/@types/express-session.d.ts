import 'express-session';

declare module 'express-session' {
    interface SessionData {
        oauth: {
            inviteCode?: string | undefined;
            returnTo?: string | undefined;
            codeVerifier?: string | undefined;
            state?: string | undefined;
            isPopup?: boolean | undefined;
        };
        slack: {
            teamId?: string | undefined;
            channelId?: string | undefined;
            messageTs?: string | undefined;
            threadTs?: string | undefined;
        };
        impersonation?: {
            adminUserUuid: string;
            adminName: string;
            targetUserUuid: string;
            startedAt: string;
        };
    }
}
