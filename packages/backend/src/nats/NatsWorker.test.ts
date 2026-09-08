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
        getByQueryUuid: vi.fn(async () => undefined),
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
        registerPreAggregateStream();
    });

    it('runs a DuckDB job published on the dedicated DuckDB stream', async () => {
        const message = jobMessage(STREAM_CONFIGS.duckdb.subjects.query);

        await buildWorker().handleMessage(message, 'worker-1');

        expect(
            asyncQueryService.runAsyncDuckdbQueryFromHistory,
        ).toHaveBeenCalledWith('query-1', 'worker-1', undefined);
        expect(message.ack).toHaveBeenCalled();
    });

    it('runs a DuckDB job that rode the pre-aggregate stream', async () => {
        const message = jobMessage(
            STREAM_CONFIGS['pre-aggregate'].subjects.duckdb,
        );

        await buildWorker().handleMessage(message, 'worker-1');

        expect(
            asyncQueryService.runAsyncDuckdbQueryFromHistory,
        ).toHaveBeenCalledWith('query-1', 'worker-1', undefined);
        expect(
            asyncQueryService.runAsyncPreAggregateQueryFromHistory,
        ).not.toHaveBeenCalled();
        expect(message.ack).toHaveBeenCalled();
    });

    it('terminates a job on a subject it does not know', async () => {
        const message = jobMessage('pre_aggregate.unknown.jobs');

        await buildWorker().handleMessage(message, 'worker-1');

        expect(
            asyncQueryService.runAsyncDuckdbQueryFromHistory,
        ).not.toHaveBeenCalled();
        expect(message.term).toHaveBeenCalled();
    });
});
