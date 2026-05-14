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
            };
            azureAdStrategyName?: string | undefined;
        };
        slack: {
            teamId?: string | undefined;
            channelId?: string | undefined;
            messageTs?: string | undefined;
            threadTs?: string | undefined;
            trigger?: 'vote' | 'app_mention' | undefined;
        };
        impersonation?: {
            adminUserUuid: string;
            adminName: string;
            adminEmail: string;
            adminFirstName?: string;
            adminLastName?: string;
            adminRole: string;
            targetUserUuid: string;
            startedAt: string;
        };
    }
}
