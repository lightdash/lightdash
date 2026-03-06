import {
    getErrorMessage,
    isExploreError,
    NotFoundError,
    type QueueTraceProperties,
    type RunQueryTags,
} from '@lightdash/common';
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
import { type DbQueryHistory } from '../database/entities/queryHistory';
import Logger from '../logging/logger';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import { type QueryHistoryModel } from '../models/QueryHistoryModel/QueryHistoryModel';
import { type AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import {
    type RunAsyncPreAggregateQueryArgs,
    type RunAsyncWarehouseQueryArgs,
} from '../services/AsyncQueryService/types';
import {
    NATS_HEADERS,
    PRE_AGGREGATE_QUERY_SUBJECT,
    PRE_AGGREGATE_STREAM_NAME,
    PRE_AGGREGATE_WORKER_DURABLE_NAME,
    WAREHOUSE_QUERY_SUBJECT,
    WAREHOUSE_STREAM_NAME,
    WAREHOUSE_WORKER_DURABLE_NAME,
    type AsyncQueryAccountType,
    type AsyncQueryJobMessage,
    type AsyncQueryJobPayload,
} from './natsContracts';

const asyncQueryPayloadSchema = z.object({
    queryUuid: z.string().min(1),
    accountType: z.enum([
        'session',
        'jwt',
        'api-key',
        'service-account',
        'oauth',
    ]),
    userUuid: z.string().min(1),
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
    trace: QueueTraceProperties;
};

type AsyncQueryNatsWorkerArgs = {
    lightdashConfig: LightdashConfig;
    asyncQueryService: AsyncQueryService;
    queryHistoryModel: QueryHistoryModel;
    projectModel: ProjectModel;
};

export class AsyncQueryNatsWorker {
    private readonly asyncQueryService: AsyncQueryService;

    private readonly queryHistoryModel: QueryHistoryModel;

    private readonly projectModel: ProjectModel;

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
        this.asyncQueryService = args.asyncQueryService;
        this.queryHistoryModel = args.queryHistoryModel;
        this.projectModel = args.projectModel;
        this.natsConfig = args.lightdashConfig.asyncQuery.nats;
        this.workerConcurrency = this.natsConfig.workerConcurrency;
        this.warehouseSubject = WAREHOUSE_QUERY_SUBJECT;
        this.warehouseConsumer = WAREHOUSE_WORKER_DURABLE_NAME;
        this.preAggregateSubject = PRE_AGGREGATE_QUERY_SUBJECT;
        this.preAggregateConsumer = PRE_AGGREGATE_WORKER_DURABLE_NAME;
    }

    public async run(): Promise<void> {
        if (!this.natsConfig.enabled) {
            throw new Error(
                'NATS_ENABLED must be true to run async query worker',
            );
        }

        this.connection = await connect({ servers: this.natsConfig.url });
        this.messageStreams = [];

        const jetStream = this.connection.jetstream();

        this.warehouseJetStreamConsumer = await jetStream.consumers
            .get(WAREHOUSE_STREAM_NAME, this.warehouseConsumer)
            .catch((error) => {
                Logger.error(
                    `Failed to load JetStream consumer "${this.warehouseConsumer}" on stream "${WAREHOUSE_STREAM_NAME}". Ensure stream and durable consumer are bootstrapped before startup.`,
                    error,
                );
                throw error;
            });

        this.preAggregateJetStreamConsumer = await jetStream.consumers
            .get(PRE_AGGREGATE_STREAM_NAME, this.preAggregateConsumer)
            .catch((error) => {
                Logger.error(
                    `Failed to load JetStream consumer "${this.preAggregateConsumer}" on stream "${PRE_AGGREGATE_STREAM_NAME}". Ensure stream and durable consumer are bootstrapped before startup.`,
                    error,
                );
                throw error;
            });

        this.isRunning = true;

        Logger.info(
            `Async query worker started. warehouse: stream=${WAREHOUSE_STREAM_NAME} durable=${this.warehouseConsumer} subject=${this.warehouseSubject}, pre-aggregate: stream=${PRE_AGGREGATE_STREAM_NAME} durable=${this.preAggregateConsumer} subject=${this.preAggregateSubject}, concurrency=${this.workerConcurrency}`,
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
        const parsed = this.parseMessage(message);
        if (!parsed) {
            message.term();
            return;
        }

        const jobMetadata = {
            jobId: parsed.jobId,
            queryUuid: parsed.payload.queryUuid,
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
                    const args = await this.buildWarehouseQueryArgs(
                        parsed.payload,
                    );
                    await this.asyncQueryService.runAsyncWarehouseQuery(args);
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
        const parsed = this.parseMessage(message);
        if (!parsed) {
            message.term();
            return;
        }

        const jobMetadata = {
            jobId: parsed.jobId,
            queryUuid: parsed.payload.queryUuid,
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
                    const args = await this.buildPreAggregateQueryArgs(
                        parsed.payload,
                    );
                    await this.asyncQueryService.runAsyncPreAggregateQuery(
                        args,
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

    private async buildWarehouseQueryArgs(
        payload: AsyncQueryJobPayload,
    ): Promise<RunAsyncWarehouseQueryArgs> {
        const qh = await this.queryHistoryModel.getWorkerPayload(
            payload.queryUuid,
        );
        const queryTags = AsyncQueryNatsWorker.buildQueryTags(qh, payload);
        const warehouseCredentialsOverrides =
            await this.deriveWarehouseCredentialsOverrides(qh);

        return {
            projectUuid: qh.project_uuid ?? '',
            userUuid:
                qh.created_by_user_uuid ??
                qh.created_by_account ??
                payload.userUuid,
            queryUuid: qh.query_uuid,
            isRegisteredUser: payload.accountType !== 'jwt',
            isServiceAccount: payload.accountType === 'service-account',
            queryTags,
            fieldsMap: qh.fields,
            cacheKey: qh.cache_key,
            warehouseCredentialsOverrides,
            pivotConfiguration: qh.pivot_configuration ?? undefined,
            originalColumns: qh.original_columns ?? undefined,
            query: qh.compiled_sql,
        };
    }

    private async buildPreAggregateQueryArgs(
        payload: AsyncQueryJobPayload,
    ): Promise<RunAsyncPreAggregateQueryArgs> {
        const qh = await this.queryHistoryModel.getWorkerPayload(
            payload.queryUuid,
        );

        if (!qh.pre_aggregate_compiled_sql) {
            throw new NotFoundError(
                `Pre-aggregate query not found in query_history for ${payload.queryUuid}`,
            );
        }

        const queryTags = AsyncQueryNatsWorker.buildQueryTags(qh, payload);
        const warehouseCredentialsOverrides =
            await this.deriveWarehouseCredentialsOverrides(qh);

        return {
            projectUuid: qh.project_uuid ?? '',
            userUuid:
                qh.created_by_user_uuid ??
                qh.created_by_account ??
                payload.userUuid,
            queryUuid: qh.query_uuid,
            isRegisteredUser: payload.accountType !== 'jwt',
            isServiceAccount: payload.accountType === 'service-account',
            queryTags,
            fieldsMap: qh.fields,
            cacheKey: qh.cache_key,
            warehouseCredentialsOverrides,
            pivotConfiguration: qh.pivot_configuration ?? undefined,
            originalColumns: qh.original_columns ?? undefined,
            preAggregateQuery: qh.pre_aggregate_compiled_sql,
            warehouseQuery: qh.compiled_sql,
        };
    }

    private static buildQueryTags(
        qh: DbQueryHistory,
        payload: AsyncQueryJobPayload,
    ): RunQueryTags {
        // embed/external_id are extra tags for JWT users — not in RunQueryTags type
        // but accepted by warehouse clients as arbitrary key-value pairs
        const userTag: Record<string, string> =
            payload.accountType === 'jwt'
                ? { embed: 'true', external_id: payload.userUuid }
                : { user_uuid: payload.userUuid };

        // Extract chart_uuid and dashboard_uuid from request_parameters if present
        const params = qh.request_parameters;
        const chartUuid =
            params && 'chartUuid' in params ? params.chartUuid : undefined;
        const dashboardUuid =
            params && 'dashboardUuid' in params
                ? params.dashboardUuid
                : undefined;

        return {
            ...userTag,
            organization_uuid: qh.organization_uuid,
            project_uuid: qh.project_uuid ?? undefined,
            explore_name: qh.metric_query.exploreName,
            query_context: qh.context,
            ...(chartUuid ? { chart_uuid: chartUuid } : {}),
            ...(dashboardUuid ? { dashboard_uuid: dashboardUuid } : {}),
        };
    }

    private async deriveWarehouseCredentialsOverrides(
        qh: DbQueryHistory,
    ): Promise<
        | { snowflakeVirtualWarehouse?: string; databricksCompute?: string }
        | undefined
    > {
        const { exploreName } = qh.metric_query;
        if (!exploreName || !qh.project_uuid) {
            return undefined;
        }

        try {
            const explore = await this.projectModel.getExploreFromCache(
                qh.project_uuid,
                exploreName,
            );

            if (isExploreError(explore)) {
                return undefined;
            }

            if (!explore.warehouse && !explore.databricksCompute) {
                return undefined;
            }

            return {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            };
        } catch {
            Logger.warn(
                `Could not derive warehouse credentials overrides for explore "${exploreName}" in project "${qh.project_uuid}"`,
            );
            return undefined;
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

    private parseMessage(message: JsMsg): ParsedMessage | null {
        try {
            const raw = JSON.parse(this.codec.decode(message.data)) as unknown;

            const parsedEnvelope = asyncQueryEnvelopeSchema.safeParse(raw);
            if (parsedEnvelope.success) {
                const value = parsedEnvelope.data as AsyncQueryJobMessage;
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

            // Fallback: bare payload without envelope (tracing from headers)
            const parsedPayload = asyncQueryPayloadSchema.safeParse(raw);
            if (parsedPayload.success) {
                return {
                    payload: parsedPayload.data,
                    jobId: message.headers?.get(NATS_HEADERS.JOB_ID),
                    trace: {
                        traceHeader: message.headers?.get(
                            NATS_HEADERS.SENTRY_TRACE,
                        ),
                        baggageHeader: message.headers?.get(
                            NATS_HEADERS.BAGGAGE,
                        ),
                        sentryMessageId: message.headers?.get(
                            NATS_HEADERS.SENTRY_MESSAGE_ID,
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
