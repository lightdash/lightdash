import 'express-session';

declare module 'express-session' {
    interface SessionData {
        returnTo?: string | undefined;
    }
}
