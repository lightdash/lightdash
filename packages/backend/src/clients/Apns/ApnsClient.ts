import http2, {
    type ClientHttp2Session,
    type IncomingHttpHeaders,
    type OutgoingHttpHeaders,
} from 'http2';
import { importPKCS8, SignJWT } from 'jose';
import { type MobilePushNotificationsConfig } from '../../config/parseConfig';
import { type MobilePushEnvironment } from '../../ee/database/entities/mobilePushNotifications';
import { type MobilePushDeliveryResult } from '../MobilePush/mobilePushDelivery';

export type LiveActivityPayload = {
    aps: {
        timestamp: number;
        event: 'update' | 'end';
        'content-state'?: {
            state: 'working' | 'waiting_for_you' | 'idle';
            projectUuid: string;
            agentUuid: string;
            threadUuid: string;
            promptUuid: string;
        };
        'stale-date'?: number;
        'dismissal-date'?: number;
    };
};

export type LiveActivityStartPayload = {
    aps: {
        timestamp: number;
        event: 'start';
        'content-state': {
            state: 'working';
            projectUuid: string;
            agentUuid: string;
            threadUuid: string;
            promptUuid: string;
        };
        'stale-date': number;
        'attributes-type': 'AgentRunActivityAttributes';
        attributes: {
            liveActivityUuid: string;
            installationUuid: string;
            projectUuid: string;
            agentUuid: string;
            threadUuid: string;
            promptUuid: string;
            agentName: string | null;
            taskSummary: string | null;
        };
        'input-push-token': 1;
        alert: {
            title: 'Lightdash';
            body: 'Your agent is running.';
        };
    };
};

export type AlertPayload = {
    aps: {
        alert: {
            title: string;
            body: string;
        };
    };
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
};

export type ApnsDeliveryResult = MobilePushDeliveryResult;

type ApnsHttpRequest = {
    origin: string;
    headers: OutgoingHttpHeaders;
    body: string;
};

export type ApnsHttpTransport = {
    send(request: ApnsHttpRequest): Promise<{ status: number; body?: string }>;
};

type ProviderTokenRequest = {
    environment: MobilePushEnvironment;
    teamId: string;
    keyId: string;
    privateKey: string;
};

export type ApnsProviderTokenSource = {
    getToken(request: ProviderTokenRequest): Promise<string>;
};

export const APNS_REQUEST_TIMEOUT_MS = 30_000;

const LIVE_ACTIVITY_AGENT_NAME_LIMIT = 28;

const LIVE_ACTIVITY_TASK_SUMMARY_LIMIT = 60;

class ApnsRequestTimeoutError extends Error {
    constructor() {
        super('APNs request timed out');
        this.name = 'ApnsRequestTimeoutError';
    }
}

type ApnsClientDependencies = {
    config: MobilePushNotificationsConfig;
    transport?: ApnsHttpTransport;
    providerTokenSource?: ApnsProviderTokenSource;
};

const INVALID_TOKEN_REASONS = new Set([
    'BadDeviceToken',
    'DeviceTokenNotForTopic',
    'Unregistered',
]);

const parseReason = (body: string | undefined): string | undefined => {
    if (body === undefined) return undefined;
    try {
        const parsed: unknown = JSON.parse(body);
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'reason' in parsed &&
            typeof parsed.reason === 'string'
        ) {
            return parsed.reason;
        }
    } catch {
        return undefined;
    }
    return undefined;
};

export const buildLiveActivityPayload = (args: {
    state: 'working' | 'waiting_for_you' | 'idle';
    timestamp: Date;
    staleAt: Date;
    dismissalAt?: Date;
    event: 'update' | 'end';
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
}): LiveActivityPayload => ({
    aps: {
        timestamp: Math.floor(args.timestamp.getTime() / 1000),
        event: args.event,
        ...(args.event === 'update'
            ? {
                  'stale-date': Math.floor(args.staleAt.getTime() / 1000),
              }
            : {}),
        'content-state': {
            state: args.state,
            projectUuid: args.projectUuid,
            agentUuid: args.agentUuid,
            threadUuid: args.threadUuid,
            promptUuid: args.promptUuid,
        },
        ...(args.dismissalAt === undefined
            ? {}
            : {
                  'dismissal-date': Math.floor(
                      args.dismissalAt.getTime() / 1000,
                  ),
              }),
    },
});

const condenseLiveActivityText = (
    text: string | null,
    limit: number,
): string | null => {
    const collapsed = text?.trim().split(/\s+/u).join(' ') ?? '';
    if (collapsed.length === 0) return null;

    const characters = Array.from(collapsed);
    if (characters.length <= limit) return collapsed;

    const clipped = characters.slice(0, limit).join('');
    const boundary = clipped.lastIndexOf(' ');
    return `${boundary < 0 ? clipped : clipped.slice(0, boundary)}…`;
};

export const buildLiveActivityStartPayload = (args: {
    timestamp: Date;
    staleAt: Date;
    liveActivityUuid: string;
    installationUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    agentName: string | null;
    taskSummary: string | null;
}): LiveActivityStartPayload => ({
    aps: {
        timestamp: Math.floor(args.timestamp.getTime() / 1000),
        event: 'start',
        'content-state': {
            state: 'working',
            projectUuid: args.projectUuid,
            agentUuid: args.agentUuid,
            threadUuid: args.threadUuid,
            promptUuid: args.promptUuid,
        },
        'stale-date': Math.floor(args.staleAt.getTime() / 1000),
        'attributes-type': 'AgentRunActivityAttributes',
        attributes: {
            liveActivityUuid: args.liveActivityUuid,
            installationUuid: args.installationUuid,
            projectUuid: args.projectUuid,
            agentUuid: args.agentUuid,
            threadUuid: args.threadUuid,
            promptUuid: args.promptUuid,
            agentName: condenseLiveActivityText(
                args.agentName,
                LIVE_ACTIVITY_AGENT_NAME_LIMIT,
            ),
            taskSummary: condenseLiveActivityText(
                args.taskSummary,
                LIVE_ACTIVITY_TASK_SUMMARY_LIMIT,
            ),
        },
        'input-push-token': 1,
        alert: {
            title: 'Lightdash',
            body: 'Your agent is running.',
        },
    },
});

export class JoseApnsProviderTokenSource implements ApnsProviderTokenSource {
    private readonly cache = new Map<
        string,
        { token: string; createdAt: number }
    >();

    async getToken(request: ProviderTokenRequest): Promise<string> {
        const cacheKey = `${request.environment}:${request.keyId}`;
        const cached = this.cache.get(cacheKey);
        const now = Date.now();
        if (cached !== undefined && now - cached.createdAt < 50 * 60 * 1000) {
            return cached.token;
        }

        const privateKey = await importPKCS8(
            request.privateKey.replace(/\\n/g, '\n'),
            'ES256',
        );
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'ES256', kid: request.keyId })
            .setIssuer(request.teamId)
            .setIssuedAt(Math.floor(now / 1000))
            .sign(privateKey);
        this.cache.set(cacheKey, { token, createdAt: now });
        return token;
    }
}

export class NodeApnsHttpTransport implements ApnsHttpTransport {
    private readonly sessions = new Map<string, ClientHttp2Session>();

    private readonly connect: (origin: string) => ClientHttp2Session;

    private readonly requestTimeoutMs: number;

    constructor(
        connect: (origin: string) => ClientHttp2Session = (origin) =>
            http2.connect(origin),
        requestTimeoutMs: number = APNS_REQUEST_TIMEOUT_MS,
    ) {
        this.connect = connect;
        this.requestTimeoutMs = requestTimeoutMs;
    }

    private getSession(origin: string): ClientHttp2Session {
        const existing = this.sessions.get(origin);
        if (existing !== undefined && !existing.closed && !existing.destroyed) {
            return existing;
        }

        const session = this.connect(origin);
        session.on('close', () => this.sessions.delete(origin));
        session.on('error', () => this.sessions.delete(origin));
        this.sessions.set(origin, session);
        return session;
    }

    async send(request: ApnsHttpRequest): Promise<{
        status: number;
        body?: string;
    }> {
        return new Promise((resolve, reject) => {
            const stream = this.getSession(request.origin).request(
                request.headers,
            );
            let status = 0;
            let responseBody = '';
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                stream.close(http2.constants.NGHTTP2_CANCEL);
                reject(new ApnsRequestTimeoutError());
            }, this.requestTimeoutMs);
            const finish = (
                result: { status: number; body?: string } | Error,
            ) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (result instanceof Error) {
                    reject(result);
                } else {
                    resolve(result);
                }
            };
            stream.setEncoding('utf8');
            stream.on('response', (headers: IncomingHttpHeaders) => {
                status = Number(headers[':status'] ?? 0);
            });
            stream.on('data', (chunk: string) => {
                responseBody += chunk;
            });
            stream.on('end', () =>
                finish({
                    status,
                    ...(responseBody.length === 0
                        ? {}
                        : { body: responseBody }),
                }),
            );
            stream.on('error', (error) => finish(error));
            stream.end(request.body);
        });
    }
}

export class ApnsClient {
    private readonly config: MobilePushNotificationsConfig;

    private readonly transport: ApnsHttpTransport;

    private readonly providerTokenSource: ApnsProviderTokenSource;

    constructor(dependencies: ApnsClientDependencies) {
        this.config = dependencies.config;
        this.transport = dependencies.transport ?? new NodeApnsHttpTransport();
        this.providerTokenSource =
            dependencies.providerTokenSource ??
            new JoseApnsProviderTokenSource();
    }

    private async send(args: {
        environment: MobilePushEnvironment;
        token: string;
        payload: LiveActivityPayload | LiveActivityStartPayload | AlertPayload;
        headers: OutgoingHttpHeaders;
    }): Promise<ApnsDeliveryResult> {
        const credential = this.config[args.environment];
        if (
            !this.config.enabled ||
            this.config.teamId === undefined ||
            credential === undefined
        ) {
            return { status: 'failed', reason: 'environment_not_configured' };
        }

        try {
            const providerToken = await this.providerTokenSource.getToken({
                environment: args.environment,
                teamId: this.config.teamId,
                keyId: credential.keyId,
                privateKey: credential.privateKey,
            });
            const response = await this.transport.send({
                origin:
                    args.environment === 'sandbox'
                        ? 'https://api.sandbox.push.apple.com'
                        : 'https://api.push.apple.com',
                headers: {
                    ':method': 'POST',
                    ':path': `/3/device/${args.token}`,
                    authorization: `bearer ${providerToken}`,
                    ...args.headers,
                },
                body: JSON.stringify(args.payload),
            });
            const reason = parseReason(response.body);

            if (response.status === 200) return { status: 'sent' };
            if (
                response.status === 410 ||
                (reason !== undefined && INVALID_TOKEN_REASONS.has(reason))
            ) {
                return { status: 'invalid_token', reason };
            }
            if (response.status === 429 || response.status >= 500) {
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

    async sendLiveActivity(args: {
        environment: MobilePushEnvironment;
        pushToken: string;
        payload: LiveActivityPayload;
    }): Promise<ApnsDeliveryResult> {
        return this.send({
            environment: args.environment,
            token: args.pushToken,
            payload: args.payload,
            headers: {
                'apns-priority': '10',
                'apns-push-type': 'liveactivity',
                'apns-topic': `${this.config.bundleId}.push-type.liveactivity`,
            },
        });
    }

    async sendLiveActivityStart(args: {
        environment: MobilePushEnvironment;
        pushToStartToken: string;
        liveActivityUuid: string;
        payload: LiveActivityStartPayload;
    }): Promise<ApnsDeliveryResult> {
        return this.send({
            environment: args.environment,
            token: args.pushToStartToken,
            payload: args.payload,
            headers: {
                'apns-collapse-id': args.liveActivityUuid,
                'apns-id': args.liveActivityUuid,
                'apns-priority': '10',
                'apns-push-type': 'liveactivity',
                'apns-topic': `${this.config.bundleId}.push-type.liveactivity`,
            },
        });
    }

    async sendAlert(args: {
        environment: MobilePushEnvironment;
        deviceToken: string;
        collapseId: string;
        payload: AlertPayload;
    }): Promise<ApnsDeliveryResult> {
        return this.send({
            environment: args.environment,
            token: args.deviceToken,
            payload: args.payload,
            headers: {
                'apns-collapse-id': args.collapseId,
                'apns-priority': '10',
                'apns-push-type': 'alert',
                'apns-topic': this.config.bundleId,
            },
        });
    }
}
