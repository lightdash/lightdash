import {
    getErrorMessage,
    type QueueTraceProperties,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    connect,
    StringCodec,
    type ConsumerMessages,
    type Consumer,
    type JsMsg,
    type NatsConnection,
} from 'nats';
import { z } from 'zod';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import {
    ASYNC_QUERY_NATS_HEADERS,
    type AsyncQueryWarehouseJobMessage,
    type RunAsyncWarehouseQueryJobPayload,
    getWarehouseQuerySubject,
    getWarehouseWorkerDurableName,
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

type ParsedWarehouseMessage = {
    jobId?: string;
    payload: RunAsyncWarehouseQueryJobPayload;
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

    private connection: NatsConnection | undefined;

    private warehouseJetStreamConsumer: Consumer | undefined;

    private messageStreams: ConsumerMessages[] = [];

    private consumePromise: Promise<void> | undefined;

    private readonly workerConcurrency: number;

    public isRunning = false;

    constructor(args: AsyncQueryNatsWorkerArgs) {
        const customerId = args.lightdashConfig.asyncQuery.nats.customerId;
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
    }

    public async run(): Promise<void> {
        if (!this.natsConfig.enabled) {
            throw new Error(
                'ASYNC_QUERY_NATS_ENABLED must be true to run async query worker',
            );
        }

        const streamName = this.natsConfig.warehouseStreamName;
        this.connection = await connect({ servers: this.natsConfig.url });
        this.messageStreams = [];

        const jetStream = this.connection.jetstream();
        this.warehouseJetStreamConsumer = await jetStream.consumers
            .get(streamName, this.warehouseConsumer)
            .catch((error) => {
                Logger.error(
                    `Failed to load JetStream consumer "${this.warehouseConsumer}" on stream "${streamName}". Ensure stream and durable consumer are bootstrapped before startup.`,
                    error,
                );
                throw error;
            });
        this.isRunning = true;

        Logger.info(
            `Async query worker started. stream=${streamName} durable=${this.warehouseConsumer} subject=${this.warehouseSubject} concurrency=${this.workerConcurrency}`,
        );

        const workerLoops = Array.from(
            { length: this.workerConcurrency },
            (_, index) => this.spawnWorkerLoop(index + 1),
        );

        this.consumePromise = Promise.allSettled(workerLoops)
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
        workerId?: number,
    ): Promise<void> {
        const workerLabel = workerId ?? 'unknown';
        if (message.subject !== this.warehouseSubject) {
            Logger.error(
                `Worker ${workerLabel} received async query job on unexpected subject "${message.subject}"`,
            );
            message.term();
            return;
        }

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
            `Worker ${workerLabel} started async query job ${parsed.jobId ?? '<unknown>'}`,
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
                `Worker ${workerLabel} completed async query job ${parsed.jobId ?? '<unknown>'}`,
                jobMetadata,
            );
        } catch (error) {
            Logger.error(
                `Worker ${workerLabel} failed async query job ${parsed.jobId ?? '<unknown>'}: ${getErrorMessage(
                    error,
                )}`,
                { error, ...jobMetadata },
            );
            message.nak();
        }
    }

    private async consumeLoop(
        messages: ConsumerMessages,
        workerId: number,
    ): Promise<void> {
        for await (const message of messages) {
            await this.handleMessage(message, workerId);
        }
        Logger.info(`Async query worker ${workerId} stopped`);
    }

    private async spawnWorkerLoop(workerId: number): Promise<void> {
        if (!this.warehouseJetStreamConsumer) {
            throw new Error(
                'Async query JetStream consumer is not initialized',
            );
        }

        Logger.info(
            `Async query worker ${workerId} spawned (concurrency=${this.workerConcurrency})`,
        );

        const messages = await this.warehouseJetStreamConsumer.consume();
        this.messageStreams.push(messages);

        await this.consumeLoop(messages, workerId).catch((error) => {
            Logger.error(
                `Async query worker ${workerId} stopped unexpectedly`,
                error,
            );
            throw error;
        });
    }

    private parseWarehouseMessage(message: JsMsg): ParsedWarehouseMessage | null {
        try {
            const raw = JSON.parse(this.codec.decode(message.data));

            const parsedEnvelope = warehouseQueryEnvelopeSchema.safeParse(raw);
            if (parsedEnvelope.success) {
                const value = parsedEnvelope.data as AsyncQueryWarehouseJobMessage;
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
                `Invalid async query payload for subject "${message.subject}"`,
                parsedEnvelope.error,
            );
            return null;
        } catch (error) {
            Logger.error(
                `Unable to parse async query payload for subject "${message.subject}"`,
                error,
            );
            return null;
        }
    }
}
