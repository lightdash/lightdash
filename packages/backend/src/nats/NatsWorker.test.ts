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
            workerConcurrency: 1,
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
