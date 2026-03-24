import { assertUnreachable, getErrorMessage } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    AckPolicy,
    connect,
    DebugEvents,
    Events,
    nanos,
    NatsError,
    RetentionPolicy,
    StorageType,
    StringCodec,
    type JetStreamClient,
    type JetStreamManager,
    type NatsConnection,
    type Status,
} from 'nats';
import { v4 as uuidv4 } from 'uuid';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import {
    STREAM_CONFIGS,
    type AsyncQueryJobPayload,
    type AsyncQueryNatsEnvelope,
    type StreamConfig,
} from '../nats/natsConfig';

const ACK_WAIT_MS = 30_000;

type EnqueueResult = Promise<{ jobId: string }>;

export interface INatsClient {
    enqueueWarehouseQuery(payload: AsyncQueryJobPayload): EnqueueResult;
    enqueuePreAggregateQuery(payload: AsyncQueryJobPayload): EnqueueResult;
    enqueueMaterializationQuery(payload: AsyncQueryJobPayload): EnqueueResult;
}

type NatsClientArgs = {
    lightdashConfig: LightdashConfig;
};

let connectionCount = 0;

export class NatsClient implements INatsClient {
    private readonly natsConfig: LightdashConfig['natsWorker'];

    private readonly connectionId: number;

    private readonly codec = StringCodec();

    private managedStreams: StreamConfig[] = [];

    /**
     * Lazy-init with retry-on-error: caches the connection promise so
     * concurrent callers share one connection. On failure the cache is
     * cleared so the next call retries a fresh connection.
     */
    private connectionPromise: Promise<NatsConnection> | undefined;

    private connection: NatsConnection | undefined;

    constructor(args: NatsClientArgs) {
        this.natsConfig = args.lightdashConfig.natsWorker;
        connectionCount += 1;
        this.connectionId = connectionCount;
        Logger.info(
            `NatsClient #${this.connectionId} created (total: ${connectionCount})`,
        );
    }

    // ── Connection ──────────────────────────────────────────────

    /** Eagerly connect. Worker startup can separately opt into stream setup. */
    async connect(): Promise<void> {
        await this.getOrCreateConnection();
    }

    getConnection(): NatsConnection {
        if (!this.connection) {
            throw new Error(
                'NatsClient: connection not ready — await connect() first',
            );
        }
        return this.connection;
    }

    jetstream(): JetStreamClient {
        return this.getConnection().jetstream();
    }

    async isHealthy(): Promise<boolean> {
        if (!this.connection) return false;

        try {
            if (this.connection.isClosed()) return false;
            await this.connection.rtt();
            return true;
        } catch {
            return false;
        }
    }

    async drain(): Promise<void> {
        if (!this.connection) return;
        try {
            await this.connection.drain();
        } catch {
            // already closed
        }
    }

    // ── Stream infrastructure ───────────────────────────────────

    async ensureStreamsAndConsumers(
        managedStreams: StreamConfig[],
    ): Promise<void> {
        this.managedStreams = managedStreams;
        if (this.managedStreams.length === 0) return;

        const conn = await this.getOrCreateConnection();
        const jsm = await conn.jetstreamManager();
        await Promise.all(
            this.managedStreams.map(async (streamConfig: StreamConfig) => {
                await NatsClient.ensureStream(jsm, streamConfig);
                await NatsClient.ensureConsumer(jsm, streamConfig);
            }),
        );
    }

    /** Create or update a JetStream stream.
     *  Note: `retention` and `storage` are immutable after creation —
     *  changing them here requires deleting and recreating the stream.
     */

    private static async ensureStream(
        jsm: JetStreamManager,
        streamConfig: StreamConfig,
    ): Promise<void> {
        const subjects = Object.values(streamConfig.subjects);

        const existing = await jsm.streams
            .info(streamConfig.streamName)
            .catch((e: unknown) => {
                if (e instanceof NatsError && e.code === '404') return null;
                throw e;
            });

        const jetStreamConfig = {
            subjects, // mutable — safe to update (e.g. when new subjects are added)
            retention: RetentionPolicy.Workqueue, // immutable after creation
            storage: StorageType.Memory, // immutable after creation
            num_replicas: 1,
        };

        if (existing) {
            await jsm.streams.update(streamConfig.streamName, jetStreamConfig);
        } else {
            await jsm.streams.add({
                name: streamConfig.streamName,
                ...jetStreamConfig,
            });
        }
    }

    /** Create or update a durable JetStream consumer.
     *  Note: `ack_policy` and `max_deliver` are immutable after creation —
     *  changing them here requires deleting and recreating the consumer.
     */
    private static async ensureConsumer(
        jsm: JetStreamManager,
        streamConfig: StreamConfig,
    ): Promise<void> {
        const subjects = Object.values(streamConfig.subjects);

        const existing = await jsm.consumers
            .info(streamConfig.streamName, streamConfig.durableName)
            .catch((e: unknown) => {
                if (e instanceof NatsError && e.code === '404') return null;
                throw e;
            });

        const jetStreamConsumerConfig = {
            filter_subjects: subjects, // mutable since NATS 2.10
            ack_policy: AckPolicy.Explicit, // immutable after creation
            ack_wait: nanos(ACK_WAIT_MS),
            max_deliver: 1, // immutable after creation
        };

        if (existing) {
            await jsm.consumers.update(
                streamConfig.streamName,
                streamConfig.durableName,
                jetStreamConsumerConfig,
            );
        } else {
            await jsm.consumers.add(streamConfig.streamName, {
                durable_name: streamConfig.durableName,
                ...jetStreamConsumerConfig,
            });
        }
    }

    // ── Publishing (INatsClient) ─────────────────────────────

    async enqueueWarehouseQuery(
        payload: AsyncQueryJobPayload,
    ): Promise<{ jobId: string }> {
        return this.enqueue(STREAM_CONFIGS.warehouse.subjects.query, payload);
    }

    async enqueuePreAggregateQuery(
        payload: AsyncQueryJobPayload,
    ): Promise<{ jobId: string }> {
        return this.enqueue(
            STREAM_CONFIGS['pre-aggregate'].subjects.query,
            payload,
        );
    }

    async enqueueMaterializationQuery(
        payload: AsyncQueryJobPayload,
    ): Promise<{ jobId: string }> {
        return this.enqueue(
            STREAM_CONFIGS['pre-aggregate'].subjects.materialization,
            payload,
        );
    }

    // ── Private ─────────────────────────────────────────────────

    private async getOrCreateConnection(): Promise<NatsConnection> {
        if (!this.connectionPromise) {
            this.connectionPromise = this.doConnect().catch((error) => {
                this.connectionPromise = undefined; // retry on next call
                this.connection = undefined;
                throw error;
            });
        }
        return this.connectionPromise;
    }

    private async doConnect(): Promise<NatsConnection> {
        const { url } = this.natsConfig;
        if (!url) {
            throw new Error('NATS URL is required but not configured');
        }

        const conn = await connect({
            servers: url,
            maxReconnectAttempts: -1,
        });
        this.connection = conn;
        Logger.info(`NATS #${this.connectionId} connected to ${url}`);

        this.monitorStatus();

        return conn;
    }

    private monitorStatus(): void {
        const conn = this.getConnection();
        void (async () => {
            for await (const status of conn.status()) {
                this.handleConnectionStatus(status);
            }
        })();
    }

    private handleConnectionStatus(status: Status): void {
        const tag = `NATS #${this.connectionId}`;
        switch (status.type) {
            case Events.Disconnect:
                Logger.info(`${tag} disconnected from ${status.data}`);
                return;
            case Events.Reconnect:
                Logger.info(`${tag} reconnected to ${status.data}`);
                this.reconnectStreamsAndConsumers().catch((error) => {
                    Logger.error(
                        `${tag} failed to re-ensure streams after reconnect: ${getErrorMessage(error)}`,
                    );
                    Sentry.captureException(error);
                });
                return;
            case Events.Update:
                Logger.info(
                    `${tag} cluster update: ${JSON.stringify(status.data)}`,
                );
                return;
            case Events.LDM:
                Logger.info(`${tag} server entering lame duck mode`);
                return;
            case Events.Error:
                Logger.error(`${tag} async error: ${status.data}`);
                return;
            case DebugEvents.Reconnecting:
                Logger.debug(`${tag} reconnecting...`);
                return;
            case DebugEvents.PingTimer:
                // noisy — skip logging
                return;
            case DebugEvents.StaleConnection:
                Logger.info(`${tag} stale connection detected`);
                return;
            case DebugEvents.ClientInitiatedReconnect:
                Logger.info(`${tag} client-initiated reconnect`);
                return;
            default:
                assertUnreachable(
                    status.type,
                    `Unknown NATS status type: ${status.type}`,
                );
        }
    }

    private async enqueue(
        subject: string,
        payload: AsyncQueryJobPayload,
    ): Promise<{ jobId: string }> {
        const jobId = uuidv4();

        return Sentry.startSpan(
            {
                name: 'queue_producer',
                op: 'queue.publish',
                attributes: {
                    'messaging.message.id': jobId,
                    'messaging.destination.name': subject,
                    'messaging.message.body.size': Buffer.byteLength(
                        JSON.stringify(payload),
                    ),
                },
            },
            async (span) => {
                const traceHeader = span
                    ? Sentry.spanToTraceHeader(span)
                    : undefined;
                const baggageHeader = span
                    ? Sentry.spanToBaggageHeader(span)
                    : undefined;
                const sentryMessageId = jobId;

                const message: AsyncQueryNatsEnvelope<AsyncQueryJobPayload> = {
                    jobId,
                    payload,
                    traceHeader,
                    baggageHeader,
                    sentryMessageId,
                };

                try {
                    const conn = await this.getOrCreateConnection();
                    const js = conn.jetstream();
                    await js.publish(
                        subject,
                        this.codec.encode(JSON.stringify(message)),
                    );
                    return { jobId };
                } catch (error) {
                    // Only invalidate the connection if it's truly dead.
                    // Publish timeouts during reconnection don't mean the
                    // connection is gone — the nats library handles reconnect
                    // internally and will fire Events.Reconnect when ready.
                    if (this.connection?.isClosed()) {
                        this.connectionPromise = undefined;
                        this.connection = undefined;
                    }
                    Logger.error(
                        `Failed to publish async query job ${jobId} to ${subject}: ${getErrorMessage(
                            error,
                        )}`,
                    );
                    throw error;
                }
            },
        );
    }

    private async reconnectStreamsAndConsumers(): Promise<void> {
        await this.ensureStreamsAndConsumers(this.managedStreams);
    }
}
