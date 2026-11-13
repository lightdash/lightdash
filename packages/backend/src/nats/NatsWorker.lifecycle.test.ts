import { StringCodec, type JsMsg } from 'nats';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type NatsClient } from '../clients/NatsClient';
import { type QueryHistoryModel } from '../models/QueryHistoryModel/QueryHistoryModel';
import { type AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import { STREAM_CONFIGS } from './natsConfig';
import { NatsWorker, SHUTDOWN_GRACE_MS } from './NatsWorker';

const flush = async (remaining = 100): Promise<void> => {
    if (remaining > 0) await Promise.resolve().then(() => flush(remaining - 1));
};
const deferred = () => {
    let resolve = () => {};
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};
const setup = () => {
    const message = {
        subject: STREAM_CONFIGS.warehouse.subjects.query,
        data: StringCodec().encode(
            JSON.stringify({ jobId: 'job', payload: { queryUuid: 'query' } }),
        ),
        info: { deliveryCount: 1 },
        ack: vi.fn(),
        nak: vi.fn(),
        term: vi.fn(),
        working: vi.fn(),
    } as unknown as JsMsg;
    const finish = deferred();
    const runQuery = vi.fn(async () => {
        await finish.promise;
        return true;
    });
    const healthy = vi.fn(async () => true);
    const releaseQueryExecution = vi.fn(async (): Promise<void> => {});
    let delivered = false;
    let pending = deferred();
    const close = vi.fn(async () => {
        pending.resolve();
    });
    const fetch = vi.fn(async () => {
        pending = deferred();
        return {
            close,
            async *[Symbol.asyncIterator]() {
                if (!delivered) {
                    delivered = true;
                    yield message;
                } else await pending.promise;
            },
        };
    });
    const worker = new NatsWorker({
        natsClient: {
            jetstream: () => ({ consumers: { get: async () => ({ fetch }) } }),
        } as unknown as NatsClient,
        queryHistoryModel: {
            releaseQueryExecution,
            getByQueryUuid: async () => undefined,
        } as unknown as QueryHistoryModel,
        asyncQueryService: {
            runAsyncWarehouseQueryFromHistory: runQuery,
        } as unknown as AsyncQueryService,
        streams: ['warehouse'],
        workerConcurrency: 1,
        isDatabaseHealthy: healthy,
    });
    return {
        worker,
        message,
        fetch,
        close,
        finish,
        runQuery,
        healthy,
        releaseQueryExecution,
    };
};

afterEach(() => vi.useRealTimers());

describe('NatsWorker lifecycle', () => {
    it('releases the persisted claim before returning the delivery', async () => {
        vi.useFakeTimers();
        const state = setup();
        const released = deferred();
        state.releaseQueryExecution.mockImplementationOnce(
            () => released.promise,
        );
        await state.worker.run();
        await flush();
        const stopping = state.worker.stop();
        await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS);
        expect(state.releaseQueryExecution).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                queryUuid: 'query',
                signal: expect.objectContaining({ aborted: true }),
            }),
        );
        expect(state.message.nak).not.toHaveBeenCalled();
        released.resolve();
        await stopping;
        expect(state.message.nak).toHaveBeenCalledOnce();
        state.finish.resolve();
        await flush();
    });

    it('does not return the delivery when the persisted claim cannot be released', async () => {
        vi.useFakeTimers();
        const state = setup();
        state.releaseQueryExecution.mockRejectedValueOnce(
            new Error('database unavailable'),
        );
        await state.worker.run();
        await flush();
        const stopping = state.worker.stop();
        await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS);
        await stopping;
        expect(state.message.nak).not.toHaveBeenCalled();
        state.finish.resolve();
        await flush();
        expect(state.message.ack).not.toHaveBeenCalled();
    });

    it('closes fetch at once, naks unfinished work after the grace and suppresses late ack', async () => {
        vi.useFakeTimers();
        const state = setup();
        await state.worker.run();
        await flush();
        expect(state.runQuery).toHaveBeenCalledOnce();
        const stopping = state.worker.stop();
        expect(state.close).toHaveBeenCalledOnce();
        expect(state.message.nak).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS);
        await stopping;
        expect(state.message.nak).toHaveBeenCalledWith();
        expect(state.fetch).toHaveBeenCalledOnce();
        state.finish.resolve();
        await flush();
        expect(state.message.ack).not.toHaveBeenCalled();
        expect(state.message.term).not.toHaveBeenCalled();
    });

    it('lets a result finish within the grace and ack without nak or another pull', async () => {
        vi.useFakeTimers();
        const state = setup();
        await state.worker.run();
        await flush();
        const stopping = state.worker.stop();
        state.finish.resolve();
        await flush();
        await stopping;
        expect(state.message.ack).toHaveBeenCalledOnce();
        expect(state.message.nak).not.toHaveBeenCalled();
        expect(state.fetch).toHaveBeenCalledOnce();
    });

    it('does not fetch while Postgres is down and resumes on recovery', async () => {
        vi.useFakeTimers();
        const state = setup();
        state.healthy.mockRejectedValue(new Error('connection refused'));
        await state.worker.run();
        await flush();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(state.fetch).not.toHaveBeenCalled();
        expect(state.message.nak).not.toHaveBeenCalled();
        state.healthy.mockResolvedValue(true);
        await vi.advanceTimersByTimeAsync(1000);
        await flush();
        expect(state.fetch).toHaveBeenCalledOnce();
        state.finish.resolve();
        await state.worker.stop();
    });

    it('holds a delivery from an outstanding pull during an outage without burning attempts', async () => {
        vi.useFakeTimers();
        const state = setup();
        state.healthy.mockResolvedValueOnce(true).mockResolvedValue(false);
        await state.worker.run();
        await flush();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(state.fetch).toHaveBeenCalledOnce();
        expect(state.runQuery).not.toHaveBeenCalled();
        expect(state.message.working).toHaveBeenCalled();
        expect(state.message.nak).not.toHaveBeenCalled();
        state.healthy.mockResolvedValue(true);
        await vi.advanceTimersByTimeAsync(1000);
        await flush();
        expect(state.runQuery).toHaveBeenCalledOnce();
        state.finish.resolve();
        await state.worker.stop();
        expect(state.message.ack).toHaveBeenCalledOnce();
    });

    it('holds a job after a database connection failure until recovery, then naks once', async () => {
        vi.useFakeTimers();
        const state = setup();
        state.runQuery.mockImplementationOnce(async () => {
            state.healthy.mockResolvedValue(false);
            throw new Error('connection closed');
        });
        await state.worker.run();
        await flush();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(state.message.nak).not.toHaveBeenCalled();
        expect(state.fetch).toHaveBeenCalledOnce();
        state.healthy.mockResolvedValue(true);
        await vi.advanceTimersByTimeAsync(1000);
        await flush();
        expect(state.message.nak).toHaveBeenCalledWith();
        await state.worker.stop();
    });

    it('stops an idle database wait without a pull', async () => {
        const state = setup();
        state.healthy.mockResolvedValue(false);
        await state.worker.run();
        await flush();
        await state.worker.stop();
        expect(state.fetch).not.toHaveBeenCalled();
    });
});
