import 'express-session';

declare module 'express-session' {
    interface SessionData {
        inviteCode?: string | undefined;
        returnTo?: string | undefined;
    }
}
