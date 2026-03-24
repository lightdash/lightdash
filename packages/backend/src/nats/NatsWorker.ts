import { assertUnreachable, getErrorMessage } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { StringCodec, type Consumer, type JsMsg } from 'nats';
import { type NatsClient } from '../clients/NatsClient';
import Logger from '../logging/logger';
import { type AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import {
    getNatsJobContract,
    getNatsStreamConfig,
    isKnownNatsSubject,
    NATS_CONTRACT,
    natsEnvelopeSchema,
    type NatsManagedStream,
    type NatsStreamKey,
    type NatsSubject,
    type NatsTraceProperties,
    type PayloadForSubject,
} from './NatsContract';

type ParsedEnvelope = {
    jobId: string;
    payload: unknown;
    trace: NatsTraceProperties;
};

type NatsWorkerArgs = {
    natsClient: NatsClient;
    asyncQueryService: AsyncQueryService;
    streams: NatsStreamKey[];
    workerConcurrency: number;
};

const FETCH_EXPIRES_MS = 30 * 1000;
const ACK_PROGRESS_INTERVAL_MS = 5 * 1000;

type TelemetryAttributes = Record<string, string | number | boolean>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

export class NatsWorker {
    private readonly natsClient: NatsClient;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly codec = StringCodec();

    private readonly activeStreams: NatsManagedStream[];

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
        this.activeStreams = args.streams.map((streamKey) =>
            getNatsStreamConfig(streamKey),
        );
    }

    public async run(): Promise<void> {
        // Streams and consumers are ensured during NatsWorkerApp startup.
        const jetStream = this.natsClient.jetstream();
        this.isRunning = true;

        const workerLoops = (
            await Promise.all(
                this.activeStreams.map(async (stream) => {
                    const consumer = await jetStream.consumers.get(
                        stream.streamName,
                        stream.durableName,
                    );

                    return Array.from(
                        { length: this.workerConcurrency },
                        (_, i) =>
                            this.spawnWorkerLoop(
                                consumer,
                                `${stream.durableName}-${i + 1}`,
                            ),
                    );
                }),
            )
        ).flat();

        const streamNames = this.activeStreams.map(
            (stream) => stream.streamName,
        );
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
        const { subject } = message;

        if (!isKnownNatsSubject(subject)) {
            Logger.error(
                `Worker ${workerLabel} received job on unexpected subject "${subject}"`,
            );
            Sentry.captureException(
                new Error(`Unexpected NATS subject: ${subject}`),
            );
            message.term();
            return;
        }
        const parsedEnvelope = this.parseEnvelope(message);
        if (!parsedEnvelope) {
            message.term();
            return;
        }

        const jobContract = getNatsJobContract(subject);
        const parsedPayload = jobContract.payloadSchema.safeParse(
            parsedEnvelope.payload,
        );
        if (!parsedPayload.success) {
            Logger.error(
                `Invalid payload for NATS subject "${subject}"`,
                parsedPayload.error,
            );
            message.term();
            return;
        }

        const payload = parsedPayload.data;
        const payloadTelemetry = NatsWorker.getPayloadTelemetry({
            payload,
            capturePayloadKeys: jobContract.telemetry?.capturePayloadKeys ?? [],
        });
        const jobMetadata = {
            jobId: parsedEnvelope.jobId,
            subject,
            ...payloadTelemetry.metadata,
        };

        Logger.info(
            `Worker ${workerLabel} started job ${parsedEnvelope.jobId} on ${subject}`,
            jobMetadata,
        );

        try {
            const didRun = await NatsWorker.runWithAckProgress(message, () =>
                Sentry.continueTrace(
                    {
                        sentryTrace: parsedEnvelope.trace.traceHeader,
                        baggage: parsedEnvelope.trace.baggageHeader,
                    },
                    () =>
                        Sentry.startSpan(
                            {
                                op: 'queue.process',
                                name: 'queue_consumer',
                                attributes: {
                                    'messaging.message.id':
                                        parsedEnvelope.jobId,
                                    'messaging.destination.name': subject,
                                    ...payloadTelemetry.sentryAttributes,
                                },
                            },
                            () =>
                                this.runJobForSubject({
                                    subject,
                                    payload,
                                    workerLabel,
                                }),
                        ),
                ),
            );

            if (!didRun) {
                message.term();
                return;
            }

            message.ack();
            Logger.info(
                `Worker ${workerLabel} completed job ${parsedEnvelope.jobId} on ${subject}`,
                jobMetadata,
            );
        } catch (error) {
            Logger.error(
                `Worker ${workerLabel} failed job ${parsedEnvelope.jobId} on ${subject}: ${getErrorMessage(error)}`,
                { error, ...jobMetadata },
            );
            message.nak();
        }
    }

    private runJobForSubject<TSubject extends NatsSubject>({
        subject,
        payload,
        workerLabel,
    }: {
        subject: TSubject;
        payload: PayloadForSubject<TSubject>;
        workerLabel: string;
    }): Promise<boolean> {
        switch (subject) {
            case NATS_CONTRACT.warehouse.jobs.query.subject:
            case NATS_CONTRACT['pre-aggregate'].jobs.materialization.subject:
                return this.asyncQueryService.runAsyncWarehouseQueryFromHistory(
                    payload.queryUuid,
                    workerLabel,
                );
            case NATS_CONTRACT['pre-aggregate'].jobs.query.subject:
                return this.asyncQueryService.runAsyncPreAggregateQueryFromHistory(
                    payload.queryUuid,
                    workerLabel,
                );
            default:
                return assertUnreachable(
                    subject,
                    `Unhandled NATS subject: ${subject}`,
                );
        }
    }

    private async spawnWorkerLoop(
        consumer: Consumer,
        workerId: string,
    ): Promise<void> {
        Logger.info(
            `Worker ${workerId} spawned (concurrency=${this.workerConcurrency})`,
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
                Logger.error(`Worker ${workerId} fetch error`, error);
            }
        }

        Logger.info(`Worker ${workerId} stopped`);
    }

    private static getPayloadTelemetry({
        payload,
        capturePayloadKeys,
    }: {
        payload: unknown;
        capturePayloadKeys: readonly string[];
    }): {
        metadata: TelemetryAttributes;
        sentryAttributes: TelemetryAttributes;
    } {
        if (!isRecord(payload)) {
            return {
                metadata: {},
                sentryAttributes: {},
            };
        }

        const metadata: TelemetryAttributes = {};
        const sentryAttributes: TelemetryAttributes = {};

        for (const key of capturePayloadKeys) {
            const value = payload[key];
            if (
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
            ) {
                metadata[key] = value;
                sentryAttributes[`lightdash.${key}`] = value;
            }
        }

        return {
            metadata,
            sentryAttributes,
        };
    }

    private parseEnvelope(message: JsMsg): ParsedEnvelope | null {
        try {
            const raw: unknown = JSON.parse(this.codec.decode(message.data));
            const parsedEnvelope = natsEnvelopeSchema.safeParse(raw);
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
                `Invalid message envelope for subject "${message.subject}"`,
                parsedEnvelope.error,
            );
            return null;
        } catch (error) {
            Logger.error(
                `Unable to parse message envelope for subject "${message.subject}"`,
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
