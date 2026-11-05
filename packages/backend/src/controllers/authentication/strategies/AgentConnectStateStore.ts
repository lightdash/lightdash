import { type Request } from 'express';
import SessionStore from 'passport-oauth2/lib/state/session';

export class AgentConnectStateStore extends SessionStore {
    constructor(
        private readonly binding?: {
            organizationUuid: string;
            clientVersion: string | null;
        },
    ) {
        super({ key: 'oauth2:snowflake-ai' });
    }

    override store(
        req: Request,
        callback: (error: Error | null, state?: string) => void,
    ): void {
        super.store(req, (error, state) => {
            if (!error && state && this.binding) {
                req.session.agentConnectBindings = Object.fromEntries(
                    [
                        ...Object.entries(
                            req.session.agentConnectBindings ?? {},
                        ),
                        [state, this.binding],
                    ].slice(-5),
                );
            }
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
