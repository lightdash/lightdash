import { getErrorMessage } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { connect, headers, StringCodec, type JetStreamClient } from 'nats';
import { v4 as uuidv4 } from 'uuid';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import {
    NATS_HEADERS,
    PRE_AGGREGATE_QUERY_SUBJECT,
    WAREHOUSE_QUERY_SUBJECT,
    type AsyncQueryJobPayload,
    type AsyncQueryNatsEnvelope,
} from '../nats/natsContracts';

type NatsJobClientArguments = {
    lightdashConfig: LightdashConfig;
};

type EnqueueResult = Promise<{ jobId: string }>;

export interface INatsJobClient {
    enqueueWarehouseQuery(payload: AsyncQueryJobPayload): EnqueueResult;
    enqueuePreAggregateQuery(payload: AsyncQueryJobPayload): EnqueueResult;
}

export class NatsJobClient implements INatsJobClient {
    private readonly natsConfig: LightdashConfig['asyncQuery']['nats'];

    private readonly codec = StringCodec();

    private jetStreamPromise: Promise<JetStreamClient> | undefined;

    constructor(args: NatsJobClientArguments) {
        this.natsConfig = args.lightdashConfig.asyncQuery.nats;
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
                    this.jetStreamPromise = undefined;
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
                    'messaging.message.job.id': jobId,
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

                const natsHeaders = headers();
                natsHeaders.set(NATS_HEADERS.JOB_ID, jobId);
                natsHeaders.set(
                    NATS_HEADERS.SENTRY_MESSAGE_ID,
                    sentryMessageId,
                );
                if (traceHeader) {
                    natsHeaders.set(NATS_HEADERS.SENTRY_TRACE, traceHeader);
                }
                if (baggageHeader) {
                    natsHeaders.set(NATS_HEADERS.BAGGAGE, baggageHeader);
                }

                try {
                    const jetStream = await this.getJetStreamClient();
                    await jetStream.publish(
                        subject,
                        this.codec.encode(JSON.stringify(message)),
                        {
                            headers: natsHeaders,
                        },
                    );
                    return { jobId };
                } catch (error) {
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
        return this.enqueue(WAREHOUSE_QUERY_SUBJECT, payload);
    }

    async enqueuePreAggregateQuery(
        payload: AsyncQueryJobPayload,
    ): Promise<{ jobId: string }> {
        return this.enqueue(PRE_AGGREGATE_QUERY_SUBJECT, payload);
    }
}
