import { importPKCS8, SignJWT } from 'jose';
import { type MobilePushNotificationsConfig } from '../../config/parseConfig';
import { type MobilePushDeliveryResult } from '../MobilePush/mobilePushDelivery';

export type AgentRunDataMessage = {
    data: {
        type: 'agent_run';
        state: 'working' | 'waiting_for_you' | 'idle';
        event: 'update' | 'end';
        liveActivityUuid: string;
        projectUuid: string;
        agentUuid: string;
        threadUuid: string;
        promptUuid: string;
        timestamp: string;
        staleAt: string;
    };
    android: {
        priority: 'high';
        collapse_key: string;
        ttl: string;
    };
};

export type AgentRunAlertMessage = {
    notification: {
        title: string;
        body: string;
    };
    data: {
        type: 'agent_run_completed';
        projectUuid: string;
        agentUuid: string;
        threadUuid: string;
        promptUuid: string;
    };
    android: {
        priority: 'high';
        collapse_key: string;
    };
};

type FcmHttpRequest = {
    url: string;
    headers: Record<string, string>;
    body: string;
};

export type FcmHttpTransport = {
    send(request: FcmHttpRequest): Promise<{ status: number; body?: string }>;
};

type AccessTokenRequest = {
    clientEmail: string;
    privateKey: string;
};

export type FcmAccessTokenSource = {
    getToken(request: AccessTokenRequest): Promise<string>;
};

export const FCM_REQUEST_TIMEOUT_MS = 30_000;

export const FCM_MESSAGING_SCOPE =
    'https://www.googleapis.com/auth/firebase.messaging';

export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const AGENT_RUN_TTL_SECONDS = 300;

const INVALID_TOKEN_ERROR_CODES = new Set([
    'UNREGISTERED',
    'INVALID_ARGUMENT',
    'SENDER_ID_MISMATCH',
]);

const RETRYABLE_ERROR_CODES = new Set([
    'UNAVAILABLE',
    'INTERNAL',
    'QUOTA_EXCEEDED',
]);

class FcmRequestTimeoutError extends Error {
    constructor() {
        super('FCM request timed out');
        this.name = 'FcmRequestTimeoutError';
    }
}

type FcmClientDependencies = {
    config: MobilePushNotificationsConfig;
    transport?: FcmHttpTransport;
    accessTokenSource?: FcmAccessTokenSource;
};

const readErrorCode = (value: unknown): string | undefined => {
    if (typeof value !== 'object' || value === null || !('error' in value)) {
        return undefined;
    }
    const { error } = value;
    if (typeof error !== 'object' || error === null) return undefined;

    if ('details' in error && Array.isArray(error.details)) {
        const detail = error.details.find(
            (candidate): candidate is { errorCode: string } =>
                typeof candidate === 'object' &&
                candidate !== null &&
                'errorCode' in candidate &&
                typeof candidate.errorCode === 'string',
        );
        if (detail !== undefined) return detail.errorCode;
    }
    if ('status' in error && typeof error.status === 'string') {
        return error.status;
    }
    return undefined;
};

export const parseFcmErrorCode = (
    body: string | undefined,
): string | undefined => {
    if (body === undefined) return undefined;
    try {
        return readErrorCode(JSON.parse(body));
    } catch {
        return undefined;
    }
};

export const buildAgentRunDataMessage = (args: {
    state: 'working' | 'waiting_for_you' | 'idle';
    event: 'update' | 'end';
    liveActivityUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    timestamp: Date;
    staleAt: Date;
}): AgentRunDataMessage => ({
    data: {
        type: 'agent_run',
        state: args.state,
        event: args.event,
        liveActivityUuid: args.liveActivityUuid,
        projectUuid: args.projectUuid,
        agentUuid: args.agentUuid,
        threadUuid: args.threadUuid,
        promptUuid: args.promptUuid,
        timestamp: String(Math.floor(args.timestamp.getTime() / 1000)),
        staleAt: String(Math.floor(args.staleAt.getTime() / 1000)),
    },
    android: {
        priority: 'high',
        collapse_key: args.liveActivityUuid,
        ttl: `${AGENT_RUN_TTL_SECONDS}s`,
    },
});

export const buildAgentRunAlertMessage = (args: {
    collapseId: string;
    alert: { title: string; body: string };
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
}): AgentRunAlertMessage => ({
    notification: {
        title: args.alert.title,
        body: args.alert.body,
    },
    data: {
        type: 'agent_run_completed',
        projectUuid: args.projectUuid,
        agentUuid: args.agentUuid,
        threadUuid: args.threadUuid,
        promptUuid: args.promptUuid,
    },
    android: {
        priority: 'high',
        collapse_key: args.collapseId,
    },
});

export class NodeFcmHttpTransport implements FcmHttpTransport {
    private readonly requestTimeoutMs: number;

    constructor(requestTimeoutMs: number = FCM_REQUEST_TIMEOUT_MS) {
        this.requestTimeoutMs = requestTimeoutMs;
    }

    async send(
        request: FcmHttpRequest,
    ): Promise<{ status: number; body?: string }> {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            this.requestTimeoutMs,
        );
        try {
            const response = await fetch(request.url, {
                method: 'POST',
                headers: request.headers,
                body: request.body,
                signal: controller.signal,
            });
            const body = await response.text();
            return {
                status: response.status,
                ...(body.length === 0 ? {} : { body }),
            };
        } catch (error) {
            if (controller.signal.aborted) throw new FcmRequestTimeoutError();
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
}

export class GoogleFcmAccessTokenSource implements FcmAccessTokenSource {
    private cached: { token: string; expiresAt: number } | undefined;

    private readonly fetchToken: (
        request: FcmHttpRequest,
    ) => Promise<{ status: number; body?: string }>;

    constructor(
        fetchToken: (
            request: FcmHttpRequest,
        ) => Promise<{ status: number; body?: string }> = (request) =>
            new NodeFcmHttpTransport().send(request),
    ) {
        this.fetchToken = fetchToken;
    }

    async getToken(request: AccessTokenRequest): Promise<string> {
        const now = Date.now();
        if (this.cached !== undefined && this.cached.expiresAt > now) {
            return this.cached.token;
        }

        const privateKey = await importPKCS8(
            request.privateKey.replace(/\\n/g, '\n'),
            'RS256',
        );
        const assertion = await new SignJWT({ scope: FCM_MESSAGING_SCOPE })
            .setProtectedHeader({ alg: 'RS256' })
            .setIssuer(request.clientEmail)
            .setAudience(GOOGLE_TOKEN_ENDPOINT)
            .setIssuedAt(Math.floor(now / 1000))
            .setExpirationTime(Math.floor(now / 1000) + 3600)
            .sign(privateKey);

        const response = await this.fetchToken({
            url: GOOGLE_TOKEN_ENDPOINT,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion,
            }).toString(),
        });
        if (response.status !== 200 || response.body === undefined) {
            throw new Error('Unable to mint an FCM access token');
        }

        const parsed: unknown = JSON.parse(response.body);
        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            !('access_token' in parsed) ||
            typeof parsed.access_token !== 'string'
        ) {
            throw new Error('Unable to mint an FCM access token');
        }

        const expiresIn =
            'expires_in' in parsed && typeof parsed.expires_in === 'number'
                ? parsed.expires_in
                : 3600;
        this.cached = {
            token: parsed.access_token,
            expiresAt: now + Math.max(expiresIn - 300, 60) * 1000,
        };
        return this.cached.token;
    }
}

export class FcmClient {
    private readonly config: MobilePushNotificationsConfig;

    private readonly transport: FcmHttpTransport;

    private readonly accessTokenSource: FcmAccessTokenSource;

    constructor(dependencies: FcmClientDependencies) {
        this.config = dependencies.config;
        this.transport = dependencies.transport ?? new NodeFcmHttpTransport();
        this.accessTokenSource =
            dependencies.accessTokenSource ?? new GoogleFcmAccessTokenSource();
    }

    private async send(args: {
        token: string;
        message: AgentRunDataMessage | AgentRunAlertMessage;
    }): Promise<MobilePushDeliveryResult> {
        const { fcm } = this.config;
        if (!this.config.enabled || fcm === undefined) {
            return { status: 'failed', reason: 'fcm_not_configured' };
        }

        try {
            const accessToken = await this.accessTokenSource.getToken({
                clientEmail: fcm.clientEmail,
                privateKey: fcm.privateKey,
            });
            const response = await this.transport.send({
                url: `https://fcm.googleapis.com/v1/projects/${fcm.projectId}/messages:send`,
                headers: {
                    authorization: `Bearer ${accessToken}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    message: { token: args.token, ...args.message },
                }),
            });
            const reason = parseFcmErrorCode(response.body);

            if (response.status === 200) return { status: 'sent' };
            if (
                response.status === 404 ||
                (reason !== undefined && INVALID_TOKEN_ERROR_CODES.has(reason))
            ) {
                return { status: 'invalid_token', reason };
            }
            if (
                response.status === 429 ||
                response.status >= 500 ||
                (reason !== undefined && RETRYABLE_ERROR_CODES.has(reason))
            ) {
                return { status: 'retryable', reason };
            }
            return { status: 'failed', reason };
        } catch (error) {
            return {
                status: 'retryable',
                reason: error instanceof Error ? error.name : undefined,
            };
        }
    }

    async sendAgentRunUpdate(args: {
        pushToken: string;
        payload: AgentRunDataMessage;
    }): Promise<MobilePushDeliveryResult> {
        return this.send({ token: args.pushToken, message: args.payload });
    }

    async sendAgentRunAlert(args: {
        pushToken: string;
        payload: AgentRunAlertMessage;
    }): Promise<MobilePushDeliveryResult> {
        return this.send({ token: args.pushToken, message: args.payload });
    }
}
