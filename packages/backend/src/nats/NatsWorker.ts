import { getErrorMessage } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { StringCodec, type Consumer, type JsMsg } from 'nats';
import { z } from 'zod';
import { type NatsClient } from '../clients/NatsClient';
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
    natsClient: NatsClient;
    asyncQueryService: AsyncQueryService;
    streams: NatsWorkerStream[];
    workerConcurrency: number;
};

const FETCH_EXPIRES_MS = 30 * 1000;
const ACK_PROGRESS_INTERVAL_MS = 5 * 1000;

export class NatsWorker {
    private readonly asyncQueryService: AsyncQueryService;

    private readonly natsClient: NatsClient;

    private readonly codec = StringCodec();

    private readonly activeConfigs: StreamConfig[];

    private consumePromise: Promise<void> | undefined;

    private readonly workerConcurrency: number;

    public isRunning = false;

    public async isHealthy(): Promise<boolean> {
        if (!this.isRunning) return false;
        return this.natsClient.isHealthy();
    }

    constructor(args: NatsWorkerArgs) {
        this.natsClient = args.natsClient;
        this.asyncQueryService = args.asyncQueryService;
        this.workerConcurrency = args.workerConcurrency;
        this.activeConfigs = args.streams
            .filter((s) => STREAM_CONFIGS[s] !== undefined)
            .map((s) => STREAM_CONFIGS[s]);
    }

    public async run(): Promise<void> {
        // Streams and consumers are ensured during NatsWorkerApp startup.
        const jetStream = this.natsClient.jetstream();
        this.isRunning = true;

        const workerLoops = (
            await Promise.all(
                this.activeConfigs.map(async (config) => {
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
        await this.consumePromise;
    }

    public async handleMessage(
        message: JsMsg,
        workerId?: string,
    ): Promise<void> {
        const workerLabel = workerId ?? 'unknown';

        const runQuery = this.getQueryRunner(message.subject);
        if (!runQuery) {
            Logger.error(
                `Worker ${workerLabel} received async query job on unexpected subject "${message.subject}"`,
            );
            message.term();
            return;
        }

        await this.handleQueryMessage(message, workerLabel, runQuery);
    }

    private getQueryRunner(
        subject: string,
    ): ((queryUuid: string, worker: string) => Promise<boolean>) | null {
        if (subject === STREAM_CONFIGS.warehouse.subjects.query) {
            return (queryUuid, worker) =>
                this.asyncQueryService.runAsyncWarehouseQueryFromHistory(
                    queryUuid,
                    worker,
                );
        }

        const preAgg = STREAM_CONFIGS['pre-aggregate'];
        if (preAgg && subject === preAgg.subjects.query) {
            return (queryUuid, worker) =>
                this.asyncQueryService.runAsyncPreAggregateQueryFromHistory(
                    queryUuid,
                    worker,
                );
        }

        if (preAgg && subject === preAgg.subjects.materialization) {
            return (queryUuid, worker) =>
                this.asyncQueryService.runAsyncWarehouseQueryFromHistory(
                    queryUuid,
                    worker,
                );
        }

        return null;
    }

    private async handleQueryMessage(
        message: JsMsg,
        workerLabel: string,
        runQuery: (queryUuid: string, worker: string) => Promise<boolean>,
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
            `Worker ${workerLabel} started query job ${parsed.jobId ?? '<unknown>'} on ${message.subject}`,
            jobMetadata,
        );

        try {
            const didRun = await NatsWorker.runWithAckProgress(message, () =>
                Sentry.continueTrace(
                    {
                        sentryTrace: parsed.trace.traceHeader,
                        baggage: parsed.trace.baggageHeader,
                    },
                    () =>
                        Sentry.startSpan(
                            {
                                op: 'queue.process',
                                name: 'queue_consumer',
                                attributes: {
                                    'messaging.message.id': parsed.jobId ?? '',
                                    'messaging.destination.name':
                                        message.subject,
                                    'lightdash.queryUuid':
                                        parsed.payload.queryUuid,
                                },
                            },
                            () =>
                                runQuery(parsed.payload.queryUuid, workerLabel),
                        ),
                ),
            );

            if (!didRun) {
                message.term();
                return;
            }

            message.ack();
            Logger.info(
                `Worker ${workerLabel} completed query job ${parsed.jobId ?? '<unknown>'} on ${message.subject}`,
                jobMetadata,
            );
        } catch (error) {
            Logger.error(
                `Worker ${workerLabel} failed query job ${parsed.jobId ?? '<unknown>'} on ${message.subject}: ${getErrorMessage(error)}`,
                { error, ...jobMetadata },
            );
            message.nak();
        }
    }

    private async spawnWorkerLoop(
        consumer: Consumer,
        workerId: string,
    ): Promise<void> {
        Logger.info(
            `Async query worker ${workerId} spawned (concurrency=${this.workerConcurrency})`,
        );

        while (this.isRunning) {
            try {
                // eslint-disable-next-line no-await-in-loop -- intentionally sequential: fetch one message, process it, repeat
                const messages = await consumer.fetch({
                    max_messages: 1,
                    expires: FETCH_EXPIRES_MS,
                });
                // eslint-disable-next-line no-await-in-loop
                for await (const message of messages) {
                    await this.handleMessage(message, workerId); // eslint-disable-line no-await-in-loop
                }
            } catch (error) {
                if (!this.isRunning) break;
                Logger.error(
                    `Async query worker ${workerId} fetch error`,
                    error,
                );
            }
        }

        Logger.info(`Async query worker ${workerId} stopped`);
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
