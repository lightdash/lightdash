import { getErrorMessage } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import isEqual from 'lodash/isEqual';
import {
    connect,
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
import { getNatsWorkerConsumerConfig } from './natsWorkerConsumerConfig';

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
type JetStreamManager = Awaited<ReturnType<NatsConnection['jetstreamManager']>>;
type WorkerConsumerConfig = ReturnType<typeof getNatsWorkerConsumerConfig>;
type ExistingConsumerConfig = {
    durable_name?: string;
    filter_subjects?: string[];
    ack_policy?: WorkerConsumerConfig['ack_policy'];
    max_waiting?: number;
};

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
            return false;
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

        this.connection = await connect({ servers: this.natsConfig.url });
        this.messageStreams = [];

        const jsm = await this.connection.jetstreamManager();
        const jetStream = this.connection.jetstream();
        const workerLoops = (
            await Promise.all(
                this.activeConfigs.map(async (config) => {
                    await jsm.streams.add({
                        name: config.streamName,
                        subjects: Object.values(config.subjects),
                        retention: RetentionPolicy.Workqueue,
                        storage: StorageType.Memory,
                        num_replicas: 1,
                    });

                    await this.ensureConsumer(jsm, config);

                    const consumer = await jetStream.consumers.get(
                        config.streamName,
                        config.durableName,
                    );

                    return Array.from(
                        { length: this.workerConcurrency },
                        (_, i) =>
                            this.spawnWorkerLoop(
                                consumer,
                                `${config.durableName}-${i + 1}`,
                            ),
                    );
                }),
            )
        ).flat();

        this.isRunning = true;

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
            await this.runWithAckProgress(message, () =>
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
            await this.runWithAckProgress(message, () =>
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
        Logger.info(`Async query worker ${workerId} stopped`);
    }

    private async spawnWorkerLoop(
        consumer: Consumer,
        workerId: string,
    ): Promise<void> {
        Logger.info(
            `Async query worker ${workerId} spawned (concurrency=${this.workerConcurrency})`,
        );

        const messages = await consumer.consume({
            max_messages: CONSUME_MAX_MESSAGES,
        });
        this.messageStreams.push(messages);

        await this.consumeLoop(messages, workerId).catch((error) => {
            Logger.error(
                `Async query worker ${workerId} stopped unexpectedly`,
                error,
            );
            throw error;
        });
    }

    private async ensureConsumer(
        jsm: JetStreamManager,
        config: StreamConfig,
    ): Promise<void> {
        const desiredConfig = this.getConsumerConfig(config);
        const existingConsumer = await jsm.consumers
            .info(config.streamName, config.durableName)
            .catch(() => undefined);

        if (!existingConsumer) {
            await jsm.consumers.add(config.streamName, desiredConfig);
            return;
        }

        if (
            NatsWorker.shouldRecreateConsumer(
                existingConsumer.config,
                desiredConfig,
            )
        ) {
            Logger.info(
                `Recreating NATS consumer ${config.durableName} to apply immutable config changes`,
                {
                    streamName: config.streamName,
                    durableName: config.durableName,
                    current: {
                        durable_name: existingConsumer.config.durable_name,
                        filter_subjects:
                            existingConsumer.config.filter_subjects,
                        ack_policy: existingConsumer.config.ack_policy,
                        max_waiting: existingConsumer.config.max_waiting,
                    },
                    desired: {
                        durable_name: desiredConfig.durable_name,
                        filter_subjects: desiredConfig.filter_subjects,
                        ack_policy: desiredConfig.ack_policy,
                        max_waiting: desiredConfig.max_waiting,
                    },
                },
            );

            await jsm.consumers.delete(config.streamName, config.durableName);
            await jsm.consumers.add(config.streamName, desiredConfig);
            return;
        }

        await jsm.consumers.update(
            config.streamName,
            config.durableName,
            desiredConfig,
        );
    }

    private getConsumerConfig(config: StreamConfig): WorkerConsumerConfig {
        return getNatsWorkerConsumerConfig(
            this.natsConfig,
            config.durableName,
            Object.values(config.subjects),
        );
    }

    private static shouldRecreateConsumer(
        existingConfig: ExistingConsumerConfig,
        desiredConfig: WorkerConsumerConfig,
    ): boolean {
        return (
            existingConfig.durable_name !== desiredConfig.durable_name ||
            existingConfig.ack_policy !== desiredConfig.ack_policy ||
            existingConfig.max_waiting !== desiredConfig.max_waiting ||
            !isEqual(
                existingConfig.filter_subjects,
                desiredConfig.filter_subjects,
            )
        );
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

    private async runWithAckProgress<T>(
        message: JsMsg,
        handler: () => Promise<T>,
    ): Promise<T> {
        const interval = setInterval(() => {
            message.working();
        }, this.natsConfig.ackProgressIntervalMs);

        try {
            return await handler();
        } finally {
            clearInterval(interval);
        }
    }
}
