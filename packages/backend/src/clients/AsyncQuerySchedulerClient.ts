import { getErrorMessage } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { connect, headers, StringCodec, type JetStreamClient } from 'nats';
import { v4 as uuidv4 } from 'uuid';
import {
    ASYNC_QUERY_NATS_HEADERS,
    type AsyncQueryNatsEnvelope,
    type RunAsyncPreAggregateQueryJobPayload,
    type RunAsyncWarehouseQueryJobPayload,
    getPreAggregateQuerySubject,
    getWarehouseQuerySubject,
} from '../asyncQuery/natsContracts';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';

type AsyncQuerySchedulerClientArguments = {
    lightdashConfig: LightdashConfig;
};

type EnqueueResult = Promise<{ jobId: string }>;

export interface IAsyncQuerySchedulerClient {
    enqueueWarehouseQuery(
        payload: RunAsyncWarehouseQueryJobPayload,
    ): EnqueueResult;
    enqueuePreAggregateQuery(
        payload: RunAsyncPreAggregateQueryJobPayload,
    ): EnqueueResult;
}

export class AsyncQuerySchedulerClient implements IAsyncQuerySchedulerClient {
    private readonly natsConfig: LightdashConfig['asyncQuery']['nats'];

    private readonly codec = StringCodec();

    private jetStreamPromise: Promise<JetStreamClient> | undefined;

    constructor(args: AsyncQuerySchedulerClientArguments) {
        this.natsConfig = args.lightdashConfig.asyncQuery.nats;
    }

    private getCustomerId(): string {
        if (!this.natsConfig.customerId) {
            throw new Error(
                'ASYNC_QUERY_NATS_CUSTOMER_ID is required to publish async query jobs',
            );
        }

        return this.natsConfig.customerId;
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

    private async enqueue<TPayload>(
        subject: string,
        payload: TPayload,
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

                const message: AsyncQueryNatsEnvelope<TPayload> = {
                    jobId,
                    payload,
                    traceHeader,
                    baggageHeader,
                    sentryMessageId,
                };

                const natsHeaders = headers();
                natsHeaders.set(ASYNC_QUERY_NATS_HEADERS.JOB_ID, jobId);
                natsHeaders.set(
                    ASYNC_QUERY_NATS_HEADERS.SENTRY_MESSAGE_ID,
                    sentryMessageId,
                );
                if (traceHeader) {
                    natsHeaders.set(
                        ASYNC_QUERY_NATS_HEADERS.SENTRY_TRACE,
                        traceHeader,
                    );
                }
                if (baggageHeader) {
                    natsHeaders.set(
                        ASYNC_QUERY_NATS_HEADERS.BAGGAGE,
                        baggageHeader,
                    );
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
        payload: RunAsyncWarehouseQueryJobPayload,
    ): Promise<{ jobId: string }> {
        return this.enqueue(
            getWarehouseQuerySubject(this.getCustomerId()),
            payload,
        );
    }

    async enqueuePreAggregateQuery(
        payload: RunAsyncPreAggregateQueryJobPayload,
    ): Promise<{ jobId: string }> {
        return this.enqueue(
            getPreAggregateQuerySubject(this.getCustomerId()),
            payload,
        );
    }
}
