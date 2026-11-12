import {
    ForbiddenError,
    QueryHistoryStatus,
    type QueryHistory,
} from '@lightdash/common';
import { StringCodec, type JsMsg } from 'nats';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type NatsClient } from '../clients/NatsClient';
import Logger from '../logging/logger';
import {
    QueryExecutionOwnershipLostError,
    type QueryHistoryModel,
} from '../models/QueryHistoryModel/QueryHistoryModel';
import { type AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { registerPreAggregateStream, STREAM_CONFIGS } from './natsConfig';
import { NatsWorker } from './NatsWorker';

const codec = StringCodec();

const jobMessage = (subject: string): JsMsg =>
    ({
        subject,
        info: { deliveryCount: 1 },
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
        runAsyncExternalSourceQueryFromHistory: vi.fn(async () => true),
        markClaimedQueryAsErrored: vi.fn(async () => undefined),
        runAsyncPreAggregateQueryFromHistory: vi.fn(async () => true),
    };
    const queryHistoryModel = {
        releaseQueryExecution: vi.fn(async () => undefined),
        failUnfinishedQueryDelivery: vi.fn(async () => 1),
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
            workerConcurrency: 1,
        });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(Logger, 'warn');
        queryHistoryModel.getByQueryUuid.mockResolvedValue(undefined);
        registerPreAggregateStream();
    });

    it('logs redelivery before processing the job', async () => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        Object.assign(message.info, { deliveryCount: 2 });
        await buildWorker().handleMessage(message);
        expect(Logger.warn).toHaveBeenCalledWith(
            'NATS query message redelivered',
            {
                queryUuid: 'query-1',
                deliveryCount: 2,
                reason: 'acknowledgement not received',
            },
        );
        expect(message.ack).toHaveBeenCalledOnce();
    });

    it('logs an unclaimed job termination', async () => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockResolvedValueOnce(
            false,
        );
        await buildWorker().handleMessage(message);
        expect(Logger.warn).toHaveBeenCalledWith(
            'NATS query message disposition',
            {
                queryUuid: 'query-1',
                deliveryCount: 1,
                action: 'term',
                reason: 'not claimed',
            },
        );
        expect(message.term).toHaveBeenCalledOnce();
    });

    it('logs invalid message termination without its contents', async () => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        message.data = codec.encode('{');
        await buildWorker().handleMessage(message);
        expect(Logger.warn).toHaveBeenCalledWith(
            'NATS query message disposition',
            {
                queryUuid: null,
                deliveryCount: 1,
                action: 'term',
                reason: 'invalid message',
            },
        );
        expect(message.term).toHaveBeenCalledOnce();
    });

    it('does not log redelivery for a first delivery', async () => {
        await buildWorker().handleMessage(
            jobMessage(STREAM_CONFIGS.warehouse.subjects.query),
        );
        expect(Logger.warn).not.toHaveBeenCalled();
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

    it.each([
        ['dedicated DuckDB', () => STREAM_CONFIGS.duckdb.subjects],
        ['pre-aggregate', () => STREAM_CONFIGS['pre-aggregate'].subjects],
    ])(
        'runs an external source job from the %s stream on its own runner',
        async (_, subjects) => {
            const message = jobMessage(subjects().externalSource);

            await buildWorker().handleMessage(message, 'worker-1');

            expect(
                asyncQueryService.runAsyncExternalSourceQueryFromHistory,
            ).toHaveBeenCalledWith(
                'query-1',
                'worker-1',
                undefined,
                expect.any(Function),
            );
            expect(
                asyncQueryService.runAsyncDuckdbQueryFromHistory,
            ).not.toHaveBeenCalled();
            expect(message.ack).toHaveBeenCalled();
        },
    );

    it('fails the query and drops the job when it has no runner for the subject', async () => {
        const message = jobMessage('pre_aggregate.not_a_subject.jobs');

        await buildWorker().handleMessage(message, 'worker-1');

        expect(
            asyncQueryService.markClaimedQueryAsErrored,
        ).toHaveBeenCalledWith(
            'query-1',
            expect.stringContaining('cannot run'),
        );
        expect(Logger.warn).toHaveBeenCalledWith(
            'NATS query message disposition',
            {
                queryUuid: 'query-1',
                action: 'term',
                deliveryCount: 1,
                reason: 'unexpected subject',
            },
        );
        expect(message.term).toHaveBeenCalled();
        expect(message.ack).not.toHaveBeenCalled();
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
        expect(Logger.warn).toHaveBeenCalledWith(
            'NATS query message disposition',
            {
                queryUuid: 'query-1',
                deliveryCount: 1,
                action: 'term',
                reason: 'Error',
            },
        );
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
            expect(Logger.warn).toHaveBeenCalledWith(
                'NATS query message disposition',
                {
                    queryUuid: 'query-1',
                    action: 'nak',
                    deliveryCount: 1,
                    reason: error.name,
                },
            );
            expect(message.nak).toHaveBeenCalledWith(30_000);
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
    it.each([QueryHistoryStatus.QUEUED, QueryHistoryStatus.EXECUTING])(
        'retries an unclaimed %s row without terminating it',
        async (status) => {
            const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
            Object.assign(message.info, { deliveryCount: 2 });
            asyncQueryService.runAsyncWarehouseQueryFromHistory.mockResolvedValueOnce(
                false,
            );
            queryHistoryModel.getByQueryUuid.mockResolvedValue({
                status,
            } as QueryHistory);
            await buildWorker().handleMessage(message);
            expect(message.nak).toHaveBeenCalledWith(30_000);
            expect(message.term).not.toHaveBeenCalled();
            expect(
                queryHistoryModel.failUnfinishedQueryDelivery,
            ).not.toHaveBeenCalled();
        },
    );

    it.each([QueryHistoryStatus.QUEUED, QueryHistoryStatus.EXECUTING])(
        'fails an unfinished %s row on the last delivery',
        async (status) => {
            const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
            Object.assign(message.info, { deliveryCount: 5 });
            asyncQueryService.runAsyncWarehouseQueryFromHistory.mockResolvedValueOnce(
                false,
            );
            queryHistoryModel.getByQueryUuid.mockResolvedValue({
                status,
            } as QueryHistory);
            await buildWorker().handleMessage(message);
            expect(
                queryHistoryModel.failUnfinishedQueryDelivery,
            ).toHaveBeenCalledWith(
                'query-1',
                expect.stringContaining('Completion could not be confirmed'),
            );
            expect(message.term).toHaveBeenCalledOnce();
            expect(message.nak).not.toHaveBeenCalled();
        },
    );

    it('keeps the last delivery alive until the terminal write succeeds', async () => {
        vi.useFakeTimers();
        try {
            const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
            Object.assign(message.info, { deliveryCount: 5 });
            asyncQueryService.runAsyncWarehouseQueryFromHistory.mockResolvedValueOnce(
                false,
            );
            queryHistoryModel.getByQueryUuid.mockResolvedValue({
                status: QueryHistoryStatus.EXECUTING,
            } as QueryHistory);
            queryHistoryModel.failUnfinishedQueryDelivery.mockRejectedValueOnce(
                new Error('proxy down'),
            );
            const handling = buildWorker().handleMessage(message);
            await vi.advanceTimersByTimeAsync(5_000);
            expect(message.working).toHaveBeenCalled();
            expect(message.term).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(25_000);
            await handling;
            expect(message.term).toHaveBeenCalledOnce();
            expect(
                queryHistoryModel.failUnfinishedQueryDelivery,
            ).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('terminates the last delivery when cancellation fences the exhaustion write', async () => {
        vi.useFakeTimers();
        try {
            const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
            Object.assign(message.info, { deliveryCount: 5 });
            asyncQueryService.runAsyncWarehouseQueryFromHistory.mockRejectedValueOnce(
                new Error('result write failed'),
            );
            queryHistoryModel.failUnfinishedQueryDelivery.mockRejectedValueOnce(
                new QueryExecutionOwnershipLostError(),
            );
            const handling = buildWorker().handleMessage(message);
            await vi.advanceTimersByTimeAsync(60_000);
            await handling;
            expect(message.term).toHaveBeenCalledOnce();
            expect(message.nak).not.toHaveBeenCalled();
            expect(message.working).not.toHaveBeenCalled();
            expect(
                queryHistoryModel.failUnfinishedQueryDelivery,
            ).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });

    it('terminates ownership loss without retrying a cancelled query', async () => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockRejectedValueOnce(
            new QueryExecutionOwnershipLostError(),
        );
        await buildWorker().handleMessage(message);
        expect(message.term).toHaveBeenCalledOnce();
        expect(message.nak).not.toHaveBeenCalled();
        expect(queryHistoryModel.releaseQueryExecution).not.toHaveBeenCalled();
        expect(
            queryHistoryModel.failUnfinishedQueryDelivery,
        ).not.toHaveBeenCalled();
    });

    it('fails the row after a handler error on the last attempt', async () => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        Object.assign(message.info, { deliveryCount: 5 });
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockRejectedValueOnce(
            new Error('proxy unavailable'),
        );
        await buildWorker().handleMessage(message);
        expect(
            queryHistoryModel.failUnfinishedQueryDelivery,
        ).toHaveBeenCalledOnce();
        expect(message.term).toHaveBeenCalledOnce();
    });

    it.each([
        undefined,
        null,
        {},
        { deliveryCount: NaN },
        { deliveryCount: -1 },
    ])('handles invalid delivery info %s', async (info) => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        Object.defineProperty(message, 'info', { value: info });
        message.data = codec.encode('{');
        await buildWorker().handleMessage(message);
        expect(message.term).toHaveBeenCalledOnce();
    });

    it('handles a throwing delivery info getter', async () => {
        const message = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        Object.defineProperty(message, 'info', {
            get: () => {
                throw new Error('bad reply');
            },
        });
        await buildWorker().handleMessage(message);
        expect(message.ack).toHaveBeenCalledOnce();
    });

    it('runs a never-started redelivery and skips its later duplicate', async () => {
        const worker = buildWorker();
        const redelivery = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        Object.assign(redelivery.info, { deliveryCount: 2 });
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockResolvedValueOnce(
            true,
        );
        await worker.handleMessage(redelivery);
        expect(redelivery.ack).toHaveBeenCalledOnce();
        const duplicate = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        Object.assign(duplicate.info, { deliveryCount: 3 });
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockResolvedValueOnce(
            false,
        );
        queryHistoryModel.getByQueryUuid.mockResolvedValue({
            status: QueryHistoryStatus.READY,
        } as QueryHistory);
        await worker.handleMessage(duplicate);
        expect(duplicate.term).toHaveBeenCalledOnce();
        expect(duplicate.nak).not.toHaveBeenCalled();
        expect(
            queryHistoryModel.failUnfinishedQueryDelivery,
        ).not.toHaveBeenCalled();
    });

    it('does not run a live query twice when its acknowledgement expires', async () => {
        let finish: () => void = () => {};
        const active = new Promise<void>((resolve) => {
            finish = resolve;
        });
        let claimed = false;
        let executions = 0;
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockImplementation(
            async () => {
                if (claimed) return false;
                claimed = true;
                executions += 1;
                await active;
                return true;
            },
        );
        queryHistoryModel.getByQueryUuid.mockResolvedValue({
            status: QueryHistoryStatus.EXECUTING,
        } as QueryHistory);
        const worker = buildWorker();
        const first = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        const second = jobMessage(STREAM_CONFIGS.warehouse.subjects.query);
        Object.assign(second.info, { deliveryCount: 2 });
        const firstRun = worker.handleMessage(first);
        await vi.waitFor(() => expect(claimed).toBe(true));
        await worker.handleMessage(second);
        expect(executions).toBe(1);
        expect(second.nak).toHaveBeenCalledWith(30_000);
        finish();
        await firstRun;
        expect(first.ack).toHaveBeenCalledOnce();
        asyncQueryService.runAsyncWarehouseQueryFromHistory.mockResolvedValue(
            true,
        );
    });
});

describe('query database heartbeat', () => {
    afterEach(() => vi.useRealTimers());

    it('writes at most once per minute and stops after the handler', async () => {
        vi.useFakeTimers();
        const heartbeat = vi.fn(async () => 1);
        let finish!: () => void;
        const running = NatsWorker.runWithAckProgress(
            jobMessage('query'),
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
            undefined,
            heartbeat,
        );
        await vi.advanceTimersByTimeAsync(59_000);
        expect(heartbeat).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(61_000);
        expect(heartbeat).toHaveBeenCalledTimes(2);
        finish();
        await running;
        await vi.advanceTimersByTimeAsync(60_000);
        expect(heartbeat).toHaveBeenCalledTimes(2);
    });
});
