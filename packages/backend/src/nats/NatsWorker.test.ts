import {
    ForbiddenError,
    QueryHistoryStatus,
    type QueryHistory,
} from '@lightdash/common';
import { StringCodec, type JsMsg } from 'nats';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type NatsClient } from '../clients/NatsClient';
import { type QueryHistoryModel } from '../models/QueryHistoryModel/QueryHistoryModel';
import { type AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { registerPreAggregateStream, STREAM_CONFIGS } from './natsConfig';
import { NatsWorker } from './NatsWorker';

const codec = StringCodec();

/** A consumer whose fetches hang until released, so pull loops can be counted. */
const hangingConsumer = () => {
    const pending: Array<() => void> = [];
    return {
        fetch: vi.fn(
            () =>
                new Promise<AsyncIterable<JsMsg>>((resolve) => {
                    pending.push(() =>
                        resolve(
                            (async function* empty() {
                                // yields nothing: the loop re-checks isRunning
                            })(),
                        ),
                    );
                }),
        ),
        release: () => pending.splice(0).forEach((resolve) => resolve()),
    };
};

describe('NatsWorker stream loops', () => {
    const asyncQueryService = {} as unknown as AsyncQueryService;
    const queryHistoryModel = {} as unknown as QueryHistoryModel;

    beforeEach(() => {
        registerPreAggregateStream();
    });

    it('pulls from every registered stream with its own concurrency', async () => {
        const consumers = {
            WAREHOUSE_QUERY_JOBS: hangingConsumer(),
            PRE_AGGREGATE_QUERY_JOBS: hangingConsumer(),
            DUCKDB_QUERY_JOBS: hangingConsumer(),
        };
        const get = vi.fn(
            async (streamName: keyof typeof consumers) => consumers[streamName],
        );
        const natsClient = {
            jetstream: () => ({ consumers: { get } }),
        } as unknown as NatsClient;

        const worker = new NatsWorker({
            natsClient,
            asyncQueryService,
            queryHistoryModel,
            streams: ['warehouse', 'pre-aggregate', 'duckdb'],
            streamConcurrency: { warehouse: 3, 'pre-aggregate': 2, duckdb: 1 },
        });
        await worker.run();

        expect(get).toHaveBeenCalledWith(
            'WAREHOUSE_QUERY_JOBS',
            'worker-warehouse',
        );
        expect(get).toHaveBeenCalledWith(
            'PRE_AGGREGATE_QUERY_JOBS',
            'worker-pre-aggregate',
        );
        expect(get).toHaveBeenCalledWith('DUCKDB_QUERY_JOBS', 'worker-duckdb');
        await vi.waitFor(() => {
            expect(consumers.WAREHOUSE_QUERY_JOBS.fetch).toHaveBeenCalledTimes(
                3,
            );
            expect(
                consumers.PRE_AGGREGATE_QUERY_JOBS.fetch,
            ).toHaveBeenCalledTimes(2);
            expect(consumers.DUCKDB_QUERY_JOBS.fetch).toHaveBeenCalledTimes(1);
        });

        const stopped = worker.stop();
        Object.values(consumers).forEach((consumer) => consumer.release());
        await stopped;
        expect(worker.isRunning).toBe(false);
    });

    it('skips a stream that is not registered', () => {
        const worker = new NatsWorker({
            natsClient: {} as NatsClient,
            asyncQueryService,
            queryHistoryModel,
            streams: ['warehouse', 'duckdb'],
            streamConcurrency: { warehouse: 4, 'pre-aggregate': 9, duckdb: 1 },
        });

        expect(
            worker
                .getActiveStreams()
                .map(({ stream, concurrency }) => [stream, concurrency]),
        ).toEqual([
            ['warehouse', 4],
            ['duckdb', 1],
        ]);
    });
});

const jobMessage = (subject: string): JsMsg =>
    ({
        subject,
        data: codec.encode(
            JSON.stringify({
                jobId: 'job-1',
                payload: { queryUuid: 'query-1' },
            }),
        ),
        ack: vi.fn(),
        nak: vi.fn(),
        term: vi.fn(),
        working: vi.fn(),
    }) as unknown as JsMsg;

describe('NatsWorker subject dispatch', () => {
    const asyncQueryService = {
        runAsyncWarehouseQueryFromHistory: vi.fn(async () => true),
        runAsyncDuckdbQueryFromHistory: vi.fn(async () => true),
        runAsyncPreAggregateQueryFromHistory: vi.fn(async () => true),
    };
    const queryHistoryModel = {
        getByQueryUuid: vi.fn<() => Promise<QueryHistory | undefined>>(
            async () => undefined,
        ),
    };

    const buildWorker = () =>
        new NatsWorker({
            natsClient: {} as NatsClient,
            asyncQueryService:
                asyncQueryService as unknown as AsyncQueryService,
            queryHistoryModel:
                queryHistoryModel as unknown as QueryHistoryModel,
            streams: [],
            streamConcurrency: { warehouse: 1, 'pre-aggregate': 1, duckdb: 1 },
        });

    beforeEach(() => {
        vi.clearAllMocks();
        queryHistoryModel.getByQueryUuid.mockResolvedValue(undefined);
        registerPreAggregateStream();
    });

    it('runs a DuckDB job published on the dedicated DuckDB stream', async () => {
        const message = jobMessage(STREAM_CONFIGS.duckdb.subjects.query);

        await buildWorker().handleMessage(message, 'worker-1');

        expect(
            asyncQueryService.runAsyncDuckdbQueryFromHistory,
        ).toHaveBeenCalledWith(
            'query-1',
            'worker-1',
            undefined,
            expect.any(Function),
        );
        expect(message.ack).toHaveBeenCalled();
    });

    it('runs a DuckDB job that rode the pre-aggregate stream', async () => {
        const message = jobMessage(
            STREAM_CONFIGS['pre-aggregate'].subjects.duckdb,
        );

        await buildWorker().handleMessage(message, 'worker-1');

        expect(
            asyncQueryService.runAsyncDuckdbQueryFromHistory,
        ).toHaveBeenCalledWith(
            'query-1',
            'worker-1',
            undefined,
            expect.any(Function),
        );
        expect(
            asyncQueryService.runAsyncPreAggregateQueryFromHistory,
        ).not.toHaveBeenCalled();
        expect(message.ack).toHaveBeenCalled();
    });

    it.each(['warehouse', 'duckdb', 'pre-aggregate'] as const)(
        'terminates a claimed %s refusal without retrying',
        async (kind) => {
            const message = jobMessage(
                STREAM_CONFIGS[kind === 'warehouse' ? 'warehouse' : kind]
                    .subjects.query,
            );
            const runner = {
                warehouse: asyncQueryService.runAsyncWarehouseQueryFromHistory,
                duckdb: asyncQueryService.runAsyncDuckdbQueryFromHistory,
                'pre-aggregate':
                    asyncQueryService.runAsyncPreAggregateQueryFromHistory,
            }[kind];
            runner.mockRejectedValueOnce(new ForbiddenError());
            queryHistoryModel.getByQueryUuid
                .mockResolvedValueOnce({
                    status: QueryHistoryStatus.QUEUED,
                    requestParameters: {
                        agentConnectionExecution: { grantUuid: 'grant' },
                    },
                } as QueryHistory)
                .mockResolvedValueOnce({
                    status: QueryHistoryStatus.ERROR,
                    requestParameters: {
                        agentConnectionExecution: { grantUuid: 'grant' },
                    },
                } as QueryHistory);
            await buildWorker().handleMessage(message, 'worker-1');
            expect(message.term).toHaveBeenCalledOnce();
            expect(message.nak).not.toHaveBeenCalled();
            expect(runner).toHaveBeenCalledOnce();
        },
    );

    it('terminates a connection setup failure that is not a permission error', async () => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockRejectedValueOnce(
            new Error('subject deleted'),
        );
        queryHistoryModel.getByQueryUuid.mockResolvedValue({
            status: QueryHistoryStatus.ERROR,
            requestParameters: {
                agentConnectionExecution: { grantUuid: 'grant' },
            },
        } as QueryHistory);
        await buildWorker().handleMessage(message, 'worker-1');
        expect(message.term).toHaveBeenCalledOnce();
        expect(message.nak).not.toHaveBeenCalled();
    });

    it('terminates a connection query that failed after it was cancelled', async () => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockRejectedValueOnce(
            new Error('canceling statement due to user request'),
        );
        queryHistoryModel.getByQueryUuid.mockResolvedValue({
            status: QueryHistoryStatus.CANCELLED,
            requestParameters: {
                agentConnectionExecution: { grantUuid: 'grant' },
            },
        } as QueryHistory);
        await buildWorker().handleMessage(message, 'worker-1');
        expect(message.term).toHaveBeenCalledOnce();
        expect(message.nak).not.toHaveBeenCalled();
    });

    it('terminates ERROR after a malformed connection reference fails setup', async () => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockRejectedValueOnce(
            new Error('Invalid agent connection reference'),
        );
        queryHistoryModel.getByQueryUuid.mockResolvedValue({
            status: QueryHistoryStatus.ERROR,
            agentIdentity: {
                act: { agent_connection_grant: { grantUuid: 'partial' } },
            },
            requestParameters: {},
        } as QueryHistory);
        await buildWorker().handleMessage(message, 'worker-1');
        expect(message.term).toHaveBeenCalledOnce();
        expect(message.nak).not.toHaveBeenCalled();
    });

    it('uses the claim signal when the earlier Sentry history read fails', async () => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockImplementationOnce(
            async (...args: unknown[]) => {
                (args[3] as (() => void) | undefined)?.();
                throw new Error('subject deleted');
            },
        );
        queryHistoryModel.getByQueryUuid
            .mockRejectedValueOnce(new Error('history unavailable'))
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.ERROR,
                requestParameters: {},
            } as QueryHistory);
        await buildWorker().handleMessage(message, 'worker-1');
        expect(message.term).toHaveBeenCalledOnce();
        expect(message.nak).not.toHaveBeenCalled();
    });

    it.each([new Error('warehouse failed'), new ForbiddenError()])(
        'keeps retry acknowledgement for an ordinary error: %s',
        async (error) => {
            const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
            asyncQueryService.runAsyncWarehouseQueryFromHistory.mockRejectedValueOnce(
                error,
            );
            queryHistoryModel.getByQueryUuid.mockResolvedValue({
                status: QueryHistoryStatus.ERROR,
                agentIdentity: null,
                requestParameters: {},
            } as QueryHistory);
            await buildWorker().handleMessage(message, 'worker-1');
            expect(message.nak).toHaveBeenCalledOnce();
            expect(message.term).not.toHaveBeenCalled();
            expect(queryHistoryModel.getByQueryUuid).toHaveBeenCalledOnce();
        },
    );

    it('terminates a job on a subject it does not know', async () => {
        const message = jobMessage('pre_aggregate.unknown.jobs');

        await buildWorker().handleMessage(message, 'worker-1');

        expect(
            asyncQueryService.runAsyncDuckdbQueryFromHistory,
        ).not.toHaveBeenCalled();
        expect(message.term).toHaveBeenCalled();
    });
});
