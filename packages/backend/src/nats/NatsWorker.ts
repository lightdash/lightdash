import {
    getErrorMessage,
    QueryExecutionContext,
    QueryHistoryStatus,
} from '@lightdash/common';
import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import {
    StringCodec,
    type Consumer,
    type ConsumerMessages,
    type JsMsg,
} from 'nats';
import { z } from 'zod';
import { type NatsClient } from '../clients/NatsClient';
import Logger from '../logging/logger';
import {
    QueryHistoryModel,
    type QueryExecutionOwnership,
} from '../models/QueryHistoryModel/QueryHistoryModel';
import {
    noopOrganizationNameResolver,
    type OrganizationNameResolver,
} from '../sentry/organizationNameResolver';
import { type AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { continueTrace, traceSpan } from '../tracing/tracing';
import { isConnectionProducedQuery } from '../utils/queryResultProducer';
import { startEventLoopStallDetector } from './eventLoopStallDetector';
import {
    QUERY_MAX_DELIVERIES,
    QUERY_REDELIVERY_DELAY_MS,
    STREAM_CONFIGS,
    type AsyncQueryJobPayload,
    type NatsTraceProperties,
    type NatsWorkerStream,
    type StreamConfig,
} from './natsConfig';

const asyncQueryTagsSchema = z
    .object({
        query_context: z.enum(QueryExecutionContext),
    })
    .catchall(z.string());

const asyncQueryPayloadSchema: z.ZodType<AsyncQueryJobPayload> = z.object({
    queryUuid: z.string().min(1),
    queryTags: asyncQueryTagsSchema.optional(),
});

const asyncQueryEnvelopeSchema = z.object({
    jobId: z.string().min(1),
    payload: asyncQueryPayloadSchema,
    traceHeader: z.string().optional(),
    baggageHeader: z.string().optional(),
    otelTraceparent: z.string().optional(),
    otelBaggage: z.string().optional(),
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
    queryHistoryModel: QueryHistoryModel;
    streams: NatsWorkerStream[];
    workerConcurrency: number;
    resolveOrganizationName?: OrganizationNameResolver;
    isDatabaseHealthy?: () => Promise<boolean>;
};

const FETCH_EXPIRES_MS = 1000;
export const SHUTDOWN_GRACE_MS = 5000;
const DATABASE_RETRY_MS = 1000;
const ACK_PROGRESS_INTERVAL_MS = 5 * 1000;

export class NatsWorker {
    private readonly asyncQueryService: AsyncQueryService;

    private readonly natsClient: NatsClient;

    private readonly queryHistoryModel: QueryHistoryModel;

    private readonly codec = StringCodec();

    private readonly activeConfigs: StreamConfig[];

    private consumePromise: Promise<void> | undefined;

    private readonly workerConcurrency: number;

    private readonly resolveOrganizationName: OrganizationNameResolver;

    private readonly runningQueries = new Map<symbol, string>();

    private readonly fetches = new Set<ConsumerMessages>();

    private readonly inFlight = new Map<
        JsMsg,
        { controller: AbortController; ownership: QueryExecutionOwnership }
    >();

    private readonly isDatabaseHealthy: () => Promise<boolean>;

    private readonly shutdown = new AbortController();

    private stopStallDetector: (() => void) | undefined;

    private stopPromise: Promise<void> | undefined;

    public isRunning = false;

    public async isHealthy(): Promise<boolean> {
        if (!this.isRunning) return false;
        return (await this.databaseAvailable()) && this.natsClient.isHealthy();
    }

    constructor(args: NatsWorkerArgs) {
        this.natsClient = args.natsClient;
        this.isDatabaseHealthy =
            args.isDatabaseHealthy ?? (() => Promise.resolve(true));
        this.asyncQueryService = args.asyncQueryService;
        this.queryHistoryModel = args.queryHistoryModel;
        this.workerConcurrency = args.workerConcurrency;
        this.resolveOrganizationName =
            args.resolveOrganizationName ?? noopOrganizationNameResolver;
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

        this.stopStallDetector = startEventLoopStallDetector(() => [
            ...new Set(this.runningQueries.values()),
        ]);
        this.consumePromise = Promise.allSettled(workerLoops)
            .then(() => undefined)
            .finally(() => {
                this.stopStallDetector?.();
                this.isRunning = false;
            });
    }

    public stop(): Promise<void> {
        if (this.stopPromise) return this.stopPromise;
        this.isRunning = false;
        this.stopStallDetector?.();
        this.shutdown.abort();
        this.fetches.forEach((messages) => {
            void messages.close();
        });
        this.stopPromise = this.finishShutdown();
        return this.stopPromise;
    }

    private async finishShutdown(): Promise<void> {
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([
            this.consumePromise,
            new Promise<void>((resolve) => {
                timer = setTimeout(resolve, SHUTDOWN_GRACE_MS);
            }),
        ]);
        clearTimeout(timer);
        const unfinished = [...this.inFlight.entries()];
        unfinished.forEach(([, { controller }]) => {
            controller.abort();
        });
        await Promise.all(
            unfinished.map(async ([message, { ownership }]) => {
                try {
                    await this.queryHistoryModel.releaseQueryExecution(
                        ownership,
                    );
                    NatsWorker.logMessageAction(
                        message,
                        ownership.queryUuid || null,
                        'nak',
                        'shutdown',
                    );
                    message.nak();
                } catch (error) {
                    Logger.error(
                        'Failed to release query execution during shutdown',
                        {
                            queryUuid: ownership.queryUuid,
                            error,
                        },
                    );
                }
            }),
        );
    }

    private async databaseAvailable(): Promise<boolean> {
        try {
            return await this.isDatabaseHealthy();
        } catch {
            return false;
        }
    }

    private static wait(ms: number, signal: AbortSignal): Promise<void> {
        return new Promise((resolve) => {
            let timer: NodeJS.Timeout | null = null;
            const done = () => {
                if (timer) clearTimeout(timer);
                signal.removeEventListener('abort', done);
                resolve();
            };
            timer = setTimeout(done, ms);
            signal.addEventListener('abort', done, { once: true });
            if (signal.aborted) done();
        });
    }

    private async waitForDatabase(): Promise<boolean> {
        while (!this.shutdown.signal.aborted) {
            // eslint-disable-next-line no-await-in-loop
            if (await this.databaseAvailable())
                return !this.shutdown.signal.aborted;
            // eslint-disable-next-line no-await-in-loop
            await NatsWorker.wait(DATABASE_RETRY_MS, this.shutdown.signal);
        }
        return false;
    }

    public async handleMessage(
        message: JsMsg,
        workerId?: string,
    ): Promise<void> {
        const controller = new AbortController();
        const originalMessage = message;
        const ownership = QueryHistoryModel.createQueryExecution(
            this.parseMessage(message)?.payload.queryUuid ?? '',
            controller.signal,
        );
        this.inFlight.set(originalMessage, { controller, ownership });
        const trackedMessage = new Proxy(message, {
            get(target, property, receiver) {
                if (
                    ['ack', 'nak', 'term', 'working'].includes(String(property))
                ) {
                    return (...args: unknown[]) => {
                        if (!controller.signal.aborted) {
                            const method = Reflect.get(
                                target,
                                property,
                                receiver,
                            ) as (...values: unknown[]) => void;
                            method.apply(target, args);
                        }
                    };
                }
                return Reflect.get(target, property, receiver);
            },
        });
        try {
            await QueryHistoryModel.withQueryExecution(ownership, () =>
                this.processMessage(
                    trackedMessage,
                    workerId,
                    controller.signal,
                ),
            );
        } finally {
            this.inFlight.delete(originalMessage);
        }
    }

    private async processMessage(
        message: JsMsg,
        workerId: string | undefined,
        signal: AbortSignal,
    ): Promise<void> {
        const workerLabel = workerId ?? 'unknown';
        const parsed = this.parseMessage(message);
        const queryUuid = parsed?.payload.queryUuid ?? null;
        if (NatsWorker.deliveryCount(message) > 1) {
            Logger.warn('NATS query message redelivered', {
                queryUuid,
                deliveryCount: NatsWorker.deliveryCount(message),
                reason: 'acknowledgement not received',
            });
        }

        const runQuery = this.getQueryRunner(message.subject);
        if (!runQuery) {
            Logger.error(
                `Worker ${workerLabel} received async query job on unexpected subject "${message.subject}"`,
            );
            if (queryUuid) {
                await this.asyncQueryService
                    .markClaimedQueryAsErrored(
                        queryUuid,
                        'The worker that received this query cannot run it yet. Try again shortly.',
                    )
                    .catch(() => undefined);
            }
            NatsWorker.logMessageAction(
                message,
                queryUuid,
                'term',
                'unexpected subject',
            );
            message.term();
            return;
        }

        const runId = Symbol('query run');
        if (queryUuid) this.runningQueries.set(runId, queryUuid);
        try {
            await this.handleQueryMessage(
                message,
                workerLabel,
                runQuery,
                parsed,
                signal,
            );
        } finally {
            this.runningQueries.delete(runId);
        }
    }

    private static deliveryCount(message: JsMsg): number {
        try {
            const count = message.info?.deliveryCount;
            return Number.isSafeInteger(count) && count > 0
                ? count
                : QUERY_MAX_DELIVERIES;
        } catch {
            return QUERY_MAX_DELIVERIES;
        }
    }

    private async retryUnfinished(
        message: JsMsg,
        queryUuid: string,
        reason: string,
        signal: AbortSignal,
    ): Promise<void> {
        if (signal.aborted) return;
        if (NatsWorker.deliveryCount(message) >= QUERY_MAX_DELIVERIES) {
            await NatsWorker.runWithAckProgress(
                message,
                () => this.persistExhaustedDelivery(queryUuid, signal),
                signal,
            );
            if (signal.aborted) return;
            NatsWorker.logMessageAction(
                message,
                queryUuid,
                'term',
                'delivery attempts exhausted',
            );
            message.term();
            return;
        }
        await this.releaseQueryExecution(queryUuid);
        if (signal.aborted) return;
        NatsWorker.logMessageAction(message, queryUuid, 'nak', reason);
        message.nak(QUERY_REDELIVERY_DELAY_MS);
    }

    private async releaseQueryExecution(queryUuid: string): Promise<void> {
        const ownership = QueryHistoryModel.getQueryExecution(queryUuid);
        if (ownership)
            await this.queryHistoryModel.releaseQueryExecution(ownership);
    }

    private async persistExhaustedDelivery(
        queryUuid: string,
        signal: AbortSignal,
    ): Promise<void> {
        if (signal.aborted) return;
        try {
            await this.queryHistoryModel.failUnfinishedQueryDelivery(
                queryUuid,
                'Query delivery attempts exhausted. Completion could not be confirmed. Please retry the query.',
            );
        } catch (error) {
            Logger.error('Failed to persist exhausted query delivery', {
                queryUuid,
                error,
            });
            await NatsWorker.wait(QUERY_REDELIVERY_DELAY_MS, signal);
            await this.persistExhaustedDelivery(queryUuid, signal);
        }
    }

    private static logMessageAction(
        message: JsMsg,
        queryUuid: string | null,
        action: 'nak' | 'term',
        reason: string,
    ): void {
        Logger.warn('NATS query message disposition', {
            queryUuid,
            action,
            deliveryCount: NatsWorker.deliveryCount(message),
            reason,
        });
    }

    private getQueryRunner(
        subject: string,
    ):
        | ((
              queryUuid: string,
              worker: string,
              queryTags?: AsyncQueryJobPayload['queryTags'],
              onConnectionClaimed?: () => void,
          ) => Promise<boolean>)
        | null {
        if (subject === STREAM_CONFIGS.warehouse.subjects.query) {
            return (queryUuid, worker, queryTags, onConnectionClaimed) =>
                this.asyncQueryService.runAsyncWarehouseQueryFromHistory(
                    queryUuid,
                    worker,
                    queryTags,
                    onConnectionClaimed,
                );
        }

        const preAgg = STREAM_CONFIGS['pre-aggregate'];
        if (
            subject === STREAM_CONFIGS.duckdb.subjects.query ||
            (preAgg && subject === preAgg.subjects.duckdb)
        ) {
            return (queryUuid, worker, queryTags, onConnectionClaimed) =>
                this.asyncQueryService.runAsyncDuckdbQueryFromHistory(
                    queryUuid,
                    worker,
                    queryTags,
                    onConnectionClaimed,
                );
        }

        if (
            subject === STREAM_CONFIGS.duckdb.subjects.externalSource ||
            (preAgg && subject === preAgg.subjects.externalSource)
        ) {
            return (queryUuid, worker, queryTags, onConnectionClaimed) =>
                this.asyncQueryService.runAsyncExternalSourceQueryFromHistory(
                    queryUuid,
                    worker,
                    queryTags,
                    onConnectionClaimed,
                );
        }

        if (preAgg && subject === preAgg.subjects.query) {
            return (queryUuid, worker, queryTags, onConnectionClaimed) =>
                this.asyncQueryService.runAsyncPreAggregateQueryFromHistory(
                    queryUuid,
                    worker,
                    queryTags,
                    onConnectionClaimed,
                );
        }

        if (preAgg && subject === preAgg.subjects.materialization) {
            return (queryUuid, worker, queryTags, onConnectionClaimed) =>
                this.asyncQueryService.runAsyncWarehouseQueryFromHistory(
                    queryUuid,
                    worker,
                    queryTags,
                    onConnectionClaimed,
                );
        }

        return null;
    }

    private async handleQueryMessage(
        message: JsMsg,
        workerLabel: string,
        runQuery: (
            queryUuid: string,
            worker: string,
            queryTags?: AsyncQueryJobPayload['queryTags'],
            onConnectionClaimed?: () => void,
        ) => Promise<boolean>,
        parsed: ParsedMessage | null,
        signal: AbortSignal,
    ): Promise<void> {
        if (!parsed) {
            NatsWorker.logMessageAction(
                message,
                null,
                'term',
                'invalid message',
            );
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

        let isConnectionQuery = false;
        try {
            const didRun = await NatsWorker.runWithAckProgress(
                message,
                async () => {
                    if (!(await this.waitForDatabase())) return false;
                    return continueTrace(
                        {
                            sentryTrace: parsed.trace.traceHeader,
                            traceparent: parsed.trace.otelTraceparent,
                            baggage:
                                parsed.trace.otelBaggage ??
                                parsed.trace.baggageHeader,
                        },
                        () =>
                            Sentry.withIsolationScope(() =>
                                traceSpan(
                                    {
                                        op: 'queue.process',
                                        name: 'queue_consumer',
                                        attributes: {
                                            'messaging.message.id':
                                                parsed.jobId ?? '',
                                            'messaging.destination.name':
                                                message.subject,
                                            'lightdash.queryUuid':
                                                parsed.payload.queryUuid,
                                        },
                                    },
                                    async () => {
                                        isConnectionQuery =
                                            await this.applyQuerySentryContext(
                                                parsed.payload.queryUuid,
                                            );
                                        return runQuery(
                                            parsed.payload.queryUuid,
                                            workerLabel,
                                            parsed.payload.queryTags,
                                            () => {
                                                isConnectionQuery = true;
                                            },
                                        );
                                    },
                                ),
                            ),
                    );
                },
                signal,
            );

            if (signal.aborted) return;
            if (!didRun) {
                const query = await this.queryHistoryModel.getByQueryUuid(
                    parsed.payload.queryUuid,
                );
                if (
                    query &&
                    [
                        QueryHistoryStatus.PENDING,
                        QueryHistoryStatus.QUEUED,
                        QueryHistoryStatus.EXECUTING,
                    ].includes(query.status)
                ) {
                    await this.retryUnfinished(
                        message,
                        parsed.payload.queryUuid,
                        'query remains unfinished; execution ownership is unknown',
                        signal,
                    );
                } else {
                    NatsWorker.logMessageAction(
                        message,
                        parsed.payload.queryUuid,
                        'term',
                        'not claimed',
                    );
                    message.term();
                }
                return;
            }

            message.ack();
            Logger.info(
                `Worker ${workerLabel} completed query job ${parsed.jobId ?? '<unknown>'} on ${message.subject}`,
                jobMetadata,
            );
        } catch (error) {
            if (signal.aborted) return;
            if (!(await this.databaseAvailable())) {
                await NatsWorker.runWithAckProgress(
                    message,
                    () => this.waitForDatabase(),
                    signal,
                );
                if (!signal.aborted) {
                    await this.releaseQueryExecution(parsed.payload.queryUuid);
                    if (signal.aborted) return;
                    NatsWorker.logMessageAction(
                        message,
                        parsed.payload.queryUuid,
                        'nak',
                        'db unavailable',
                    );
                    message.nak();
                }
                return;
            }
            Logger.error(
                `Worker ${workerLabel} failed query job ${parsed.jobId ?? '<unknown>'} on ${message.subject}: ${getErrorMessage(error)}`,
                { error, ...jobMetadata },
            );
            const query = isConnectionQuery
                ? await this.queryHistoryModel
                      .getByQueryUuid(parsed.payload.queryUuid)
                      .catch(() => null)
                : null;
            if (
                query?.status === QueryHistoryStatus.ERROR ||
                query?.status === QueryHistoryStatus.CANCELLED
            ) {
                NatsWorker.logMessageAction(
                    message,
                    parsed.payload.queryUuid,
                    'term',
                    error instanceof Error ? error.name : 'unknown error',
                );
                message.term();
            } else {
                await this.retryUnfinished(
                    message,
                    parsed.payload.queryUuid,
                    error instanceof Error ? error.name : 'unknown error',
                    signal,
                );
            }
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
            // eslint-disable-next-line no-await-in-loop
            await this.consumeNext(consumer, workerId);
        }
        Logger.info(`Async query worker ${workerId} stopped`);
    }

    private async consumeNext(
        consumer: Consumer,
        workerId: string,
    ): Promise<void> {
        if (!this.isRunning) return;
        try {
            if (!(await this.waitForDatabase())) return;
            const messages = await consumer.fetch({
                max_messages: 1,
                expires: FETCH_EXPIRES_MS,
            });
            this.fetches.add(messages);
            if (!this.isRunning) await messages.close();
            try {
                for await (const message of messages) {
                    if (!this.isRunning) {
                        NatsWorker.logMessageAction(
                            message,
                            this.parseMessage(message)?.payload.queryUuid ??
                                null,
                            'nak',
                            'shutdown',
                        );
                        message.nak();
                        break;
                    }
                    await this.handleMessage(message, workerId); // eslint-disable-line no-await-in-loop
                }
            } finally {
                this.fetches.delete(messages);
                await messages.close();
            }
        } catch (error) {
            if (!this.isRunning) return;
            Logger.error(`Async query worker ${workerId} fetch error`, error);
        }
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
                        otelTraceparent: value.otelTraceparent,
                        otelBaggage: value.otelBaggage,
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

    private async applyQuerySentryContext(queryUuid: string): Promise<boolean> {
        let isConnectionQuery = false;
        try {
            const queryHistory =
                await this.queryHistoryModel.getByQueryUuid(queryUuid);
            if (!queryHistory) return false;
            try {
                isConnectionQuery = isConnectionProducedQuery(queryHistory);
            } catch {
                isConnectionQuery = true;
            }

            const { organizationUuid, createdByUserUuid } = queryHistory;

            const organizationName = organizationUuid
                ? await this.resolveOrganizationName(organizationUuid).catch(
                      () => undefined,
                  )
                : undefined;

            if (createdByUserUuid) {
                Sentry.setUser({
                    id: createdByUserUuid,
                    organization: organizationUuid,
                });
            }

            Sentry.setTags({
                ...(organizationUuid && {
                    'organization.uuid': organizationUuid,
                }),
                ...(organizationName && {
                    'organization.name': organizationName,
                }),
            });

            // Sentry tags are error-scope only; stamp the same attribution on
            // the queue_consumer span so it's queryable in the trace backend.
            trace.getActiveSpan()?.setAttributes({
                ...(createdByUserUuid && { 'user.uuid': createdByUserUuid }),
                ...(organizationUuid && {
                    'organization.uuid': organizationUuid,
                }),
                ...(organizationName && {
                    'organization.name': organizationName,
                }),
            });
        } catch (error) {
            Logger.debug(
                `Failed to enrich Sentry context for query ${queryUuid}: ${getErrorMessage(error)}`,
            );
        }
        return isConnectionQuery;
    }

    static async runWithAckProgress<T>(
        message: JsMsg,
        handler: () => Promise<T>,
        signal?: AbortSignal,
    ): Promise<T> {
        const interval = setInterval(() => {
            message.working();
        }, ACK_PROGRESS_INTERVAL_MS);

        const stopProgress = () => clearInterval(interval);
        signal?.addEventListener('abort', stopProgress, { once: true });
        try {
            return await handler();
        } finally {
            clearInterval(interval);
            signal?.removeEventListener('abort', stopProgress);
        }
    }
}
