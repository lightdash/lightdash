import { type Request } from 'express';
import SessionStore from 'passport-oauth2/lib/state/session';

export class AgentConnectStateStore extends SessionStore {
    constructor() {
        super({ key: 'oauth2:snowflake-ai' });
    }

    override store(
        req: Request,
        callback: (error: Error | null, state?: string) => void,
    ): void {
        super.store(req, (error, state) => {
            if (!error && state && req.agentConnectAttempt) {
                req.session.agentConnectAttempts = Object.fromEntries(
                    [
                        ...Object.entries(
                            req.session.agentConnectAttempts ?? {},
                        ),
                        [state, req.agentConnectAttempt],
                    ].slice(-5),
                );
            }
            callback(error, state);
        });
    }
}
