import { getErrorMessage, type QueueTraceProperties } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    connect,
    StringCodec,
    type Consumer,
    type ConsumerMessages,
    type JsMsg,
    type NatsConnection,
} from 'nats';
import { z } from 'zod';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import {
    ASYNC_QUERY_NATS_HEADERS,
    getPreAggregateQuerySubject,
    getPreAggregateWorkerDurableName,
    getWarehouseQuerySubject,
    getWarehouseWorkerDurableName,
    type AsyncQueryPreAggregateJobMessage,
    type AsyncQueryWarehouseJobMessage,
    type RunAsyncPreAggregateQueryJobPayload,
    type RunAsyncWarehouseQueryJobPayload,
} from './natsContracts';

const warehouseQueryPayloadSchema = z
    .object({
        organizationUuid: z.string().min(1),
        projectUuid: z.string().min(1),
        userUuid: z.string().min(1),
        queryUuid: z.string().min(1),
        isRegisteredUser: z.boolean(),
        isServiceAccount: z.boolean().optional(),
        queryTags: z.record(z.unknown()),
        fieldsMap: z.record(z.unknown()),
        cacheKey: z.string().min(1),
        query: z.string().min(1),
        warehouseCredentialsOverrides: z
            .object({
                snowflakeVirtualWarehouse: z.string().optional(),
                databricksCompute: z.string().optional(),
            })
            .optional(),
        pivotConfiguration: z.unknown().optional(),
        originalColumns: z.record(z.unknown()).optional(),
    })
    .passthrough();

const warehouseQueryEnvelopeSchema = z.object({
    jobId: z.string().min(1),
    payload: warehouseQueryPayloadSchema,
    traceHeader: z.string().optional(),
    baggageHeader: z.string().optional(),
    sentryMessageId: z.string().optional(),
});

const preAggregateQueryPayloadSchema = z
    .object({
        organizationUuid: z.string().min(1),
        projectUuid: z.string().min(1),
        userUuid: z.string().min(1),
        queryUuid: z.string().min(1),
        isRegisteredUser: z.boolean(),
        isServiceAccount: z.boolean().optional(),
        queryTags: z.record(z.unknown()),
        fieldsMap: z.record(z.unknown()),
        cacheKey: z.string().min(1),
        preAggregateQuery: z.string().min(1),
        warehouseQuery: z.string().min(1),
        warehouseCredentialsOverrides: z
            .object({
                snowflakeVirtualWarehouse: z.string().optional(),
                databricksCompute: z.string().optional(),
            })
            .optional(),
        pivotConfiguration: z.unknown().optional(),
        originalColumns: z.record(z.unknown()).optional(),
    })
    .passthrough();

const preAggregateQueryEnvelopeSchema = z.object({
    jobId: z.string().min(1),
    payload: preAggregateQueryPayloadSchema,
    traceHeader: z.string().optional(),
    baggageHeader: z.string().optional(),
    sentryMessageId: z.string().optional(),
});

type ParsedWarehouseMessage = {
    jobId?: string;
    payload: RunAsyncWarehouseQueryJobPayload;
    trace: QueueTraceProperties;
};

type ParsedPreAggregateMessage = {
    jobId?: string;
    payload: RunAsyncPreAggregateQueryJobPayload;
    trace: QueueTraceProperties;
};

type AsyncQueryNatsWorkerArgs = {
    lightdashConfig: LightdashConfig;
    asyncQueryService: AsyncQueryService;
};

export class AsyncQueryNatsWorker {
    private readonly asyncQueryService: AsyncQueryService;

    private readonly natsConfig: LightdashConfig['asyncQuery']['nats'];

    private readonly codec = StringCodec();

    private readonly warehouseSubject: string;

    private readonly warehouseConsumer: string;

    private readonly preAggregateSubject: string;

    private readonly preAggregateConsumer: string;

    private connection: NatsConnection | undefined;

    private warehouseJetStreamConsumer: Consumer | undefined;

    private preAggregateJetStreamConsumer: Consumer | undefined;

    private messageStreams: ConsumerMessages[] = [];

    private consumePromise: Promise<void> | undefined;

    private readonly workerConcurrency: number;

    public isRunning = false;

    constructor(args: AsyncQueryNatsWorkerArgs) {
        const { customerId } = args.lightdashConfig.asyncQuery.nats;
        if (!customerId) {
            throw new Error(
                'ASYNC_QUERY_NATS_CUSTOMER_ID is required for async query worker',
            );
        }

        this.asyncQueryService = args.asyncQueryService;
        this.natsConfig = args.lightdashConfig.asyncQuery.nats;
        this.workerConcurrency = this.natsConfig.workerConcurrency;
        this.warehouseSubject = getWarehouseQuerySubject(customerId);
        this.warehouseConsumer = getWarehouseWorkerDurableName(customerId);
        this.preAggregateSubject = getPreAggregateQuerySubject(customerId);
        this.preAggregateConsumer =
            getPreAggregateWorkerDurableName(customerId);
    }

    public async run(): Promise<void> {
        if (!this.natsConfig.enabled) {
            throw new Error(
                'ASYNC_QUERY_NATS_ENABLED must be true to run async query worker',
            );
        }

        this.connection = await connect({ servers: this.natsConfig.url });
        this.messageStreams = [];

        const jetStream = this.connection.jetstream();

        this.warehouseJetStreamConsumer = await jetStream.consumers
            .get(this.natsConfig.warehouseStreamName, this.warehouseConsumer)
            .catch((error) => {
                Logger.error(
                    `Failed to load JetStream consumer "${this.warehouseConsumer}" on stream "${this.natsConfig.warehouseStreamName}". Ensure stream and durable consumer are bootstrapped before startup.`,
                    error,
                );
                throw error;
            });

        this.preAggregateJetStreamConsumer = await jetStream.consumers
            .get(
                this.natsConfig.preAggregateStreamName,
                this.preAggregateConsumer,
            )
            .catch((error) => {
                Logger.error(
                    `Failed to load JetStream consumer "${this.preAggregateConsumer}" on stream "${this.natsConfig.preAggregateStreamName}". Ensure stream and durable consumer are bootstrapped before startup.`,
                    error,
                );
                throw error;
            });

        this.isRunning = true;

        Logger.info(
            `Async query worker started. warehouse: stream=${this.natsConfig.warehouseStreamName} durable=${this.warehouseConsumer} subject=${this.warehouseSubject}, pre-aggregate: stream=${this.natsConfig.preAggregateStreamName} durable=${this.preAggregateConsumer} subject=${this.preAggregateSubject}, concurrency=${this.workerConcurrency}`,
        );

        const warehouseWorkerLoops = Array.from(
            { length: this.workerConcurrency },
            (_, index) =>
                this.spawnWorkerLoop(
                    this.warehouseJetStreamConsumer!,
                    `warehouse-${index + 1}`,
                ),
        );

        const preAggregateWorkerLoops = Array.from(
            { length: this.workerConcurrency },
            (_, index) =>
                this.spawnWorkerLoop(
                    this.preAggregateJetStreamConsumer!,
                    `pre-aggregate-${index + 1}`,
                ),
        );

        this.consumePromise = Promise.allSettled([
            ...warehouseWorkerLoops,
            ...preAggregateWorkerLoops,
        ])
            .then(() => undefined)
            .finally(() => {
                this.isRunning = false;
            });
    }

    public async stop(): Promise<void> {
        this.isRunning = false;
        this.messageStreams.forEach((messages) => messages.stop());
        if (this.connection) {
            await this.connection.drain();
        }
        await this.consumePromise;
    }

    public async handleMessage(
        message: JsMsg,
        workerId?: string,
    ): Promise<void> {
        const workerLabel = workerId ?? 'unknown';

        if (message.subject === this.warehouseSubject) {
            await this.handleWarehouseMessage(message, workerLabel);
        } else if (message.subject === this.preAggregateSubject) {
            await this.handlePreAggregateMessage(message, workerLabel);
        } else {
            Logger.error(
                `Worker ${workerLabel} received async query job on unexpected subject "${message.subject}"`,
            );
            message.term();
        }
    }

    private async handleWarehouseMessage(
        message: JsMsg,
        workerLabel: string,
    ): Promise<void> {
        const parsed = this.parseWarehouseMessage(message);
        if (!parsed) {
            message.term();
            return;
        }

        const jobMetadata = {
            jobId: parsed.jobId,
            queryUuid: parsed.payload.queryUuid,
            organizationUuid: parsed.payload.organizationUuid,
            projectUuid: parsed.payload.projectUuid,
            userUuid: parsed.payload.userUuid,
            subject: message.subject,
        };

        Logger.info(
            `Worker ${workerLabel} started warehouse query job ${parsed.jobId ?? '<unknown>'}`,
            jobMetadata,
        );

        try {
            await Sentry.continueTrace(
                {
                    sentryTrace: parsed.trace.traceHeader,
                    baggage: parsed.trace.baggageHeader,
                },
                async () => {
                    await this.asyncQueryService.runAsyncWarehouseQuery(
                        parsed.payload,
                    );
                },
            );
            message.ack();
            Logger.info(
                `Worker ${workerLabel} completed warehouse query job ${parsed.jobId ?? '<unknown>'}`,
                jobMetadata,
            );
        } catch (error) {
            Logger.error(
                `Worker ${workerLabel} failed warehouse query job ${parsed.jobId ?? '<unknown>'}: ${getErrorMessage(error)}`,
                { error, ...jobMetadata },
            );
            message.nak();
        }
    }

    private async handlePreAggregateMessage(
        message: JsMsg,
        workerLabel: string,
    ): Promise<void> {
        const parsed = this.parsePreAggregateMessage(message);
        if (!parsed) {
            message.term();
            return;
        }

        const jobMetadata = {
            jobId: parsed.jobId,
            queryUuid: parsed.payload.queryUuid,
            organizationUuid: parsed.payload.organizationUuid,
            projectUuid: parsed.payload.projectUuid,
            userUuid: parsed.payload.userUuid,
            subject: message.subject,
        };

        Logger.info(
            `Worker ${workerLabel} started pre-aggregate query job ${parsed.jobId ?? '<unknown>'}`,
            jobMetadata,
        );

        try {
            await Sentry.continueTrace(
                {
                    sentryTrace: parsed.trace.traceHeader,
                    baggage: parsed.trace.baggageHeader,
                },
                async () => {
                    await this.asyncQueryService.runAsyncPreAggregateQuery(
                        parsed.payload,
                    );
                },
            );
            message.ack();
            Logger.info(
                `Worker ${workerLabel} completed pre-aggregate query job ${parsed.jobId ?? '<unknown>'}`,
                jobMetadata,
            );
        } catch (error) {
            Logger.error(
                `Worker ${workerLabel} failed pre-aggregate query job ${parsed.jobId ?? '<unknown>'}: ${getErrorMessage(error)}`,
                { error, ...jobMetadata },
            );
            message.nak();
        }
    }

    private async consumeLoop(
        messages: ConsumerMessages,
        workerId: string,
    ): Promise<void> {
        for await (const message of messages) {
            await this.handleMessage(message, workerId);
        }
        Logger.info(`Async query worker ${workerId} stopped`);
    }

    private async spawnWorkerLoop(
        consumer: Consumer,
        workerId: string,
    ): Promise<void> {
        Logger.info(
            `Async query worker ${workerId} spawned (concurrency=${this.workerConcurrency})`,
        );

        const messages = await consumer.consume();
        this.messageStreams.push(messages);

        await this.consumeLoop(messages, workerId).catch((error) => {
            Logger.error(
                `Async query worker ${workerId} stopped unexpectedly`,
                error,
            );
            throw error;
        });
    }

    private parseWarehouseMessage(
        message: JsMsg,
    ): ParsedWarehouseMessage | null {
        try {
            const raw = JSON.parse(this.codec.decode(message.data)) as unknown;

            const parsedEnvelope = warehouseQueryEnvelopeSchema.safeParse(raw);
            if (parsedEnvelope.success) {
                const value =
                    parsedEnvelope.data as AsyncQueryWarehouseJobMessage;
                return {
                    jobId: value.jobId,
                    payload: value.payload,
                    trace: {
                        traceHeader: value.traceHeader,
                        baggageHeader: value.baggageHeader,
                        sentryMessageId: value.sentryMessageId,
                    },
                };
            }

            const parsedPayload = warehouseQueryPayloadSchema.safeParse(raw);
            if (parsedPayload.success) {
                return {
                    payload:
                        parsedPayload.data as RunAsyncWarehouseQueryJobPayload,
                    jobId: message.headers?.get(
                        ASYNC_QUERY_NATS_HEADERS.JOB_ID,
                    ),
                    trace: {
                        traceHeader: message.headers?.get(
                            ASYNC_QUERY_NATS_HEADERS.SENTRY_TRACE,
                        ),
                        baggageHeader: message.headers?.get(
                            ASYNC_QUERY_NATS_HEADERS.BAGGAGE,
                        ),
                        sentryMessageId: message.headers?.get(
                            ASYNC_QUERY_NATS_HEADERS.SENTRY_MESSAGE_ID,
                        ),
                    },
                };
            }

            Logger.error(
                `Invalid warehouse query payload for subject "${message.subject}"`,
                parsedEnvelope.error,
            );
            return null;
        } catch (error) {
            Logger.error(
                `Unable to parse warehouse query payload for subject "${message.subject}"`,
                error,
            );
            return null;
        }
    }

    private parsePreAggregateMessage(
        message: JsMsg,
    ): ParsedPreAggregateMessage | null {
        try {
            const raw = JSON.parse(this.codec.decode(message.data)) as unknown;

            const parsedEnvelope =
                preAggregateQueryEnvelopeSchema.safeParse(raw);
            if (parsedEnvelope.success) {
                const value =
                    parsedEnvelope.data as AsyncQueryPreAggregateJobMessage;
                return {
                    jobId: value.jobId,
                    payload: value.payload,
                    trace: {
                        traceHeader: value.traceHeader,
                        baggageHeader: value.baggageHeader,
                        sentryMessageId: value.sentryMessageId,
                    },
                };
            }

            const parsedPayload = preAggregateQueryPayloadSchema.safeParse(raw);
            if (parsedPayload.success) {
                return {
                    payload:
                        parsedPayload.data as RunAsyncPreAggregateQueryJobPayload,
                    jobId: message.headers?.get(
                        ASYNC_QUERY_NATS_HEADERS.JOB_ID,
                    ),
                    trace: {
                        traceHeader: message.headers?.get(
                            ASYNC_QUERY_NATS_HEADERS.SENTRY_TRACE,
                        ),
                        baggageHeader: message.headers?.get(
                            ASYNC_QUERY_NATS_HEADERS.BAGGAGE,
                        ),
                        sentryMessageId: message.headers?.get(
                            ASYNC_QUERY_NATS_HEADERS.SENTRY_MESSAGE_ID,
                        ),
                    },
                };
            }

            Logger.error(
                `Invalid pre-aggregate query payload for subject "${message.subject}"`,
                parsedEnvelope.error,
            );
            return null;
        } catch (error) {
            Logger.error(
                `Unable to parse pre-aggregate query payload for subject "${message.subject}"`,
                error,
            );
            return null;
        }
    }
}
