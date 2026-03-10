import { getErrorMessage } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { connect, StringCodec, type JetStreamClient } from 'nats';
import { v4 as uuidv4 } from 'uuid';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import {
    STREAM_CONFIGS,
    type AsyncQueryJobPayload,
    type AsyncQueryNatsEnvelope,
} from '../nats/natsConfig';

type NatsJobClientArguments = {
    lightdashConfig: LightdashConfig;
};

type EnqueueResult = Promise<{ jobId: string }>;

export interface INatsJobClient {
    enqueueWarehouseQuery(payload: AsyncQueryJobPayload): EnqueueResult;
    enqueuePreAggregateQuery(payload: AsyncQueryJobPayload): EnqueueResult;
}

export class NatsJobClient implements INatsJobClient {
    private readonly natsConfig: LightdashConfig['natsWorker'];

    private readonly codec = StringCodec();

    /**
     * Lazy-init with retry-on-error: caches the connection promise so
     * concurrent callers share one connection. On failure the cache is
     * cleared so the next call retries a fresh connection.
     */
    private jetStreamPromise: Promise<JetStreamClient> | undefined;

    constructor(args: NatsJobClientArguments) {
        this.natsConfig = args.lightdashConfig.natsWorker;
    }

    private invalidateJetStreamClient() {
        this.jetStreamPromise = undefined;
    }

    private async getJetStreamClient(): Promise<JetStreamClient> {
        if (!this.jetStreamPromise) {
            this.jetStreamPromise = connect({ servers: this.natsConfig.url })
                .then((connection) => connection.jetstream())
                .catch((error) => {
                    Logger.error(
                        `Failed to connect to NATS at ${this.natsConfig.url}`,
                        error,
                    );
                    this.invalidateJetStreamClient();
                    throw error;
                });
        }

        return this.jetStreamPromise;
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
                    const jetStream = await this.getJetStreamClient();
                    await jetStream.publish(
                        subject,
                        this.codec.encode(JSON.stringify(message)),
                    );
                    return { jobId };
                } catch (error) {
                    this.invalidateJetStreamClient();
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
}
