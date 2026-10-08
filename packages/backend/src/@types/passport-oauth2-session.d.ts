declare module 'passport-oauth2/lib/state/session' {
    import { type Request } from 'express';

    class SessionStore {
        constructor(options: { key: string });

        store(
            req: Request,
            callback: (error: Error | null, state?: string) => void,
        ): void;

        verify(
            req: Request,
            state: string,
            callback: (
                error: Error | null,
                verified?: boolean,
                info?: { message: string },
            ) => void,
        ): void;
    }

    export = SessionStore;
}
