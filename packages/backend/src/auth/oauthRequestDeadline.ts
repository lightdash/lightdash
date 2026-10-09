import { Agent as HttpAgent, type ClientRequestArgs } from 'node:http';
import { Agent as HttpsAgent, type RequestOptions } from 'node:https';
import { type Socket } from 'node:net';
import { type Strategy } from 'passport-oauth2';

export const OAUTH_REQUEST_TIMEOUT_MS = 30_000;

export class OAuthRequestTimeoutError extends Error {
    constructor() {
        super('The warehouse OAuth request timed out.');
        this.name = 'OAuthRequestTimeoutError';
    }
}

const setDeadline = (socket: Socket, timeoutMs: number): Socket => {
    socket.setTimeout(timeoutMs, () =>
        socket.destroy(new OAuthRequestTimeoutError()),
    );
    return socket;
};

class HttpDeadlineAgent extends HttpAgent {
    constructor(private readonly timeoutMs: number) {
        super({ keepAlive: false });
    }

    override createConnection(options: ClientRequestArgs): Socket {
        return setDeadline(
            super.createConnection(options) as Socket,
            this.timeoutMs,
        );
    }
}

class HttpsDeadlineAgent extends HttpsAgent {
    constructor(private readonly timeoutMs: number) {
        super({ keepAlive: false });
    }

    override createConnection(options: RequestOptions): Socket {
        return setDeadline(
            super.createConnection(options) as Socket,
            this.timeoutMs,
        );
    }
}

export const createOAuthDeadlineAgent = (
    tokenEndpoint: string,
    timeoutMs = OAUTH_REQUEST_TIMEOUT_MS,
): HttpAgent => {
    const { protocol } = new URL(tokenEndpoint);
    switch (protocol) {
        case 'http:':
            return new HttpDeadlineAgent(timeoutMs);
        case 'https:':
            return new HttpsDeadlineAgent(timeoutMs);
        default:
            throw new Error('Unsupported OAuth token endpoint protocol');
    }
};

export type OAuthRefreshCallback = (
    error: unknown,
    accessToken?: string,
    refreshToken?: string,
    results?: unknown,
) => void;

export const requestOAuthRefreshWithDeadline = (
    strategy: Strategy,
    tokenEndpoint: string,
    refreshToken: string,
    callback: OAuthRefreshCallback,
    timeoutMs = OAUTH_REQUEST_TIMEOUT_MS,
): void => {
    const agent = createOAuthDeadlineAgent(tokenEndpoint, timeoutMs);
    const { _oauth2: oauth2 } = strategy as unknown as {
        _oauth2: {
            setAgent(value: HttpAgent): void;
            getOAuthAccessToken(
                token: string,
                params: { grant_type: string },
                done: OAuthRefreshCallback,
            ): void;
        };
    };
    try {
        oauth2.setAgent(agent);
        oauth2.getOAuthAccessToken(
            refreshToken,
            { grant_type: 'refresh_token' },
            (...args) => {
                agent.destroy();
                callback(...args);
            },
        );
    } catch (error) {
        agent.destroy();
        throw error;
    }
};
