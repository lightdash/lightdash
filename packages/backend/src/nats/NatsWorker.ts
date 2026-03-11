import { getErrorMessage } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    AckPolicy,
    connect,
    nanos,
    RetentionPolicy,
    StorageType,
    StringCodec,
    type Consumer,
    type ConsumerMessages,
    type JsMsg,
    type NatsConnection,
} from 'nats';
import { z } from 'zod';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { type AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import {
    STREAM_CONFIGS,
    type AsyncQueryJobPayload,
    type NatsTraceProperties,
    type NatsWorkerStream,
    type StreamConfig,
} from './natsConfig';

const asyncQueryPayloadSchema = z.object({
    queryUuid: z.string().min(1),
});

const asyncQueryEnvelopeSchema = z.object({
    jobId: z.string().min(1),
    payload: asyncQueryPayloadSchema,
    traceHeader: z.string().optional(),
    baggageHeader: z.string().optional(),
    sentryMessageId: z.string().optional(),
});

type ParsedMessage = {
    jobId?: string;
    payload: AsyncQueryJobPayload;
    trace: NatsTraceProperties;
};

type NatsWorkerArgs = {
    lightdashConfig: LightdashConfig;
    asyncQueryService: AsyncQueryService;
    streams: NatsWorkerStream[];
};

const CONSUME_MAX_MESSAGES = 1;
const ACK_PROGRESS_INTERVAL_MS = 5 * 1000;
const ACK_WAIT_MS = 30 * 1000;
const RECONNECT_INTERVAL_MS = 5_000;

export class NatsWorker {
    private readonly asyncQueryService: AsyncQueryService;

    private readonly natsConfig: LightdashConfig['natsWorker'];

    private readonly codec = StringCodec();

    private readonly activeConfigs: StreamConfig[];

    private connection: NatsConnection | undefined;

    private messageStreams: ConsumerMessages[] = [];

    private consumePromise: Promise<void> | undefined;

    private readonly workerConcurrency: number;

    public isRunning = false;

    public async isHealthy(): Promise<boolean> {
        if (
            !this.isRunning ||
            this.connection == null ||
            this.connection.isClosed()
        ) {
            return false;
        }

        try {
            await this.connection.rtt();
            return true;
        } catch {
            // Connection may be temporarily reconnecting — still healthy
            // as long as the worker is running and not permanently closed.
            return this.isRunning && !this.connection.isClosed();
        }
    }

    constructor(args: NatsWorkerArgs) {
        this.asyncQueryService = args.asyncQueryService;
        this.natsConfig = args.lightdashConfig.natsWorker;
        this.workerConcurrency = this.natsConfig.workerConcurrency;
        this.activeConfigs = args.streams.map((s) => STREAM_CONFIGS[s]);
    }

    public async run(): Promise<void> {
        if (!this.natsConfig.enabled) {
            throw new Error(
                'NATS_ENABLED must be true to run async query worker',
            );
        }

        this.connection = await connect({
            servers: this.natsConfig.url,
            maxReconnectAttempts: -1,
            reconnectTimeWait: RECONNECT_INTERVAL_MS,
        });
        this.messageStreams = [];
        this.isRunning = true;

        const workerLoops = this.activeConfigs.flatMap((config) =>
            Array.from({ length: this.workerConcurrency }, (_, i) =>
                this.spawnWorkerLoop(config, `${config.durableName}-${i + 1}`),
            ),
        );

        const streamNames = this.activeConfigs.map((c) => c.streamName);
        Logger.info(
            `NATS worker started. streams=${streamNames.join(',')}, concurrency=${this.workerConcurrency}`,
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
        workerId?: string,
    ): Promise<void> {
        const workerLabel = workerId ?? 'unknown';

        if (message.subject === STREAM_CONFIGS.warehouse.subjects.query) {
            await this.handleWarehouseMessage(message, workerLabel);
        } else if (
            message.subject === STREAM_CONFIGS['pre-aggregate'].subjects.query
        ) {
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
        const parsed = this.parseMessage(message);
        if (!parsed) {
            message.term();
            return;
        }

        const jobMetadata = {
            jobId: parsed.jobId,
            queryUuid: parsed.payload.queryUuid,
            subject: message.subject,
        };

        Logger.info(
            `Worker ${workerLabel} started warehouse query job ${parsed.jobId ?? '<unknown>'}`,
            jobMetadata,
        );

        try {
            await NatsWorker.runWithAckProgress(message, () =>
                Sentry.continueTrace(
                    {
                        sentryTrace: parsed.trace.traceHeader,
                        baggage: parsed.trace.baggageHeader,
                    },
                    () =>
                        this.asyncQueryService.runAsyncWarehouseQueryFromHistory(
                            parsed.payload.queryUuid,
                        ),
                ),
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
        const parsed = this.parseMessage(message);
        if (!parsed) {
            message.term();
            return;
        }

        const jobMetadata = {
            jobId: parsed.jobId,
            queryUuid: parsed.payload.queryUuid,
            subject: message.subject,
        };

        Logger.info(
            `Worker ${workerLabel} started pre-aggregate query job ${parsed.jobId ?? '<unknown>'}`,
            jobMetadata,
        );

        try {
            await NatsWorker.runWithAckProgress(message, () =>
                Sentry.continueTrace(
                    {
                        sentryTrace: parsed.trace.traceHeader,
                        baggage: parsed.trace.baggageHeader,
                    },
                    async () => {
                        await this.asyncQueryService.runAsyncPreAggregateQueryFromHistory(
                            parsed.payload.queryUuid,
                        );
                    },
                ),
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
    }

    private async setupStreamConsumer(config: StreamConfig): Promise<Consumer> {
        const { connection } = this;
        if (!connection) {
            throw new Error('No NATS connection');
        }

        const jsm = await connection.jetstreamManager();
        const jetStream = connection.jetstream();

        await jsm.streams.add({
            name: config.streamName,
            subjects: Object.values(config.subjects),
            retention: RetentionPolicy.Workqueue,
            storage: StorageType.Memory,
            num_replicas: 1,
        });

        // Check if consumer already exists before creating.
        // `consumers.add` with `filter_subjects` uses the old
        // DURABLE.CREATE API which is not idempotent.
        const consumerExists = await jsm.consumers
            .info(config.streamName, config.durableName)
            .then(() => true)
            .catch(() => false);

        if (!consumerExists) {
            await jsm.consumers.add(config.streamName, {
                durable_name: config.durableName,
                filter_subjects: Object.values(config.subjects),
                ack_policy: AckPolicy.Explicit,
                ack_wait: nanos(ACK_WAIT_MS),
                max_deliver: 1,
            });
        }

        return jetStream.consumers.get(config.streamName, config.durableName);
    }

    private async spawnWorkerLoop(
        config: StreamConfig,
        workerId: string,
    ): Promise<void> {
        Logger.info(
            `Async query worker ${workerId} spawned (concurrency=${this.workerConcurrency})`,
        );

        // Each iteration is a full reconnect cycle — sequential awaits are intentional.
        // eslint-disable-next-line no-await-in-loop
        while (this.isRunning) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const consumer = await this.setupStreamConsumer(config);
                // eslint-disable-next-line no-await-in-loop
                const messages = await consumer.consume({
                    max_messages: CONSUME_MAX_MESSAGES,
                });
                this.messageStreams.push(messages);

                // eslint-disable-next-line no-await-in-loop
                await this.consumeLoop(messages, workerId);
                Logger.info(
                    `Worker ${workerId} consume loop ended, will reconnect`,
                );
            } catch (error) {
                if (!this.isRunning) break;
                Logger.error(
                    `Worker ${workerId} error: ${getErrorMessage(error)}, reconnecting in ${RECONNECT_INTERVAL_MS}ms`,
                    error,
                );
            }

            if (this.isRunning) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => {
                    setTimeout(resolve, RECONNECT_INTERVAL_MS);
                });
            }
        }

        Logger.info(`Worker ${workerId} stopped`);
    }

    private parseMessage(message: JsMsg): ParsedMessage | null {
        try {
            const raw = JSON.parse(this.codec.decode(message.data)) as unknown;

            const parsedEnvelope = asyncQueryEnvelopeSchema.safeParse(raw);
            if (parsedEnvelope.success) {
                const value = parsedEnvelope.data;
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

            Logger.error(
                `Invalid async query message for subject "${message.subject}"`,
                parsedEnvelope.error,
            );
            return null;
        } catch (error) {
            Logger.error(
                `Unable to parse async query message for subject "${message.subject}"`,
                error,
            );
            return null;
        }
    }

    static async runWithAckProgress<T>(
        message: JsMsg,
        handler: () => Promise<T>,
    ): Promise<T> {
        const interval = setInterval(() => {
            message.working();
        }, ACK_PROGRESS_INTERVAL_MS);

        try {
            return await handler();
        } finally {
            clearInterval(interval);
        }
    }
}
