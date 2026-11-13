import { StringCodec, type JsMsg } from 'nats';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type NatsClient } from '../clients/NatsClient';
import {
    QueryExecutionOwnershipLostError,
    QueryHistoryModel,
} from '../models/QueryHistoryModel/QueryHistoryModel';
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
    const failUnfinishedQueryDelivery = vi.fn(async () => 1);
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
            failUnfinishedQueryDelivery,
            getByQueryUuid: async () => undefined,
            updateExecutingHeartbeat: vi.fn(async () => 1),
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
        failUnfinishedQueryDelivery,
    };
};

afterEach(() => vi.useRealTimers());

describe('NatsWorker lifecycle', () => {
    it('fails the last delivery on shutdown with its claim fence before terminating', async () => {
        vi.useFakeTimers();
        const state = setup();
        Object.assign(state.message.info, { deliveryCount: 5 });
        const claim = deferred();
        const terminalWrite = deferred();
        const claimedAt = new Date();
        state.runQuery.mockImplementationOnce(async () => {
            const ownership = QueryHistoryModel.getQueryExecution('query')!;
            ownership.pendingClaim = claim.promise.then(() => {
                ownership.claimedAt = claimedAt;
                return 1;
            });
            await state.finish.promise;
            return true;
        });
        state.failUnfinishedQueryDelivery.mockImplementationOnce(async () => {
            const ownership = QueryHistoryModel.getQueryExecution('query')!;
            expect(ownership.claimedAt).toEqual(claimedAt);
            expect(ownership.signal.aborted).toBe(false);
            await terminalWrite.promise;
            return 1;
        });
        await state.worker.run();
        await flush();
        const stopping = state.worker.stop();
        await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS);
        expect(state.failUnfinishedQueryDelivery).not.toHaveBeenCalled();
        claim.resolve();
        await flush();
        expect(
            state.failUnfinishedQueryDelivery,
        ).toHaveBeenCalledExactlyOnceWith(
            'query',
            expect.stringContaining('attempts exhausted'),
        );
        expect(state.message.term).not.toHaveBeenCalled();
        terminalWrite.resolve();
        await stopping;
        expect(state.message.term).toHaveBeenCalledOnce();
        expect(state.message.nak).not.toHaveBeenCalled();
        expect(state.releaseQueryExecution).not.toHaveBeenCalled();
        state.finish.resolve();
        await flush();
        expect(state.message.ack).not.toHaveBeenCalled();
    });

    it('terminates an exhausted shutdown delivery when the row was cancelled', async () => {
        vi.useFakeTimers();
        const state = setup();
        Object.assign(state.message.info, { deliveryCount: 5 });
        state.failUnfinishedQueryDelivery.mockRejectedValueOnce(
            new QueryExecutionOwnershipLostError(),
        );
        await state.worker.run();
        await flush();
        const stopping = state.worker.stop();
        await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS);
        await stopping;
        expect(state.message.term).toHaveBeenCalledOnce();
        expect(state.message.nak).not.toHaveBeenCalled();
        expect(state.releaseQueryExecution).not.toHaveBeenCalled();
        state.finish.resolve();
        await flush();
    });

    it('keeps the last shutdown delivery unsettled if its error cannot be stored', async () => {
        vi.useFakeTimers();
        const state = setup();
        Object.assign(state.message.info, { deliveryCount: 5 });
        state.failUnfinishedQueryDelivery.mockRejectedValueOnce(
            new Error('database unavailable'),
        );
        await state.worker.run();
        await flush();
        const stopping = state.worker.stop();
        await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS);
        await stopping;
        expect(state.message.term).not.toHaveBeenCalled();
        expect(state.message.nak).not.toHaveBeenCalled();
        expect(state.releaseQueryExecution).not.toHaveBeenCalled();
        state.finish.resolve();
        await flush();
        expect(state.message.ack).not.toHaveBeenCalled();
    });

    it('fails a last delivery from a pull that resolves after shutdown', async () => {
        vi.useFakeTimers();
        const state = setup();
        Object.assign(state.message.info, { deliveryCount: 5 });
        const delivered = deferred();
        state.fetch.mockImplementationOnce(async () => {
            await delivered.promise;
            return {
                close: state.close,
                async *[Symbol.asyncIterator]() {
                    yield state.message;
                },
            };
        });
        await state.worker.run();
        await flush();
        const stopping = state.worker.stop();
        await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS);
        await stopping;
        delivered.resolve();
        await flush();
        expect(
            state.failUnfinishedQueryDelivery,
        ).toHaveBeenCalledExactlyOnceWith(
            'query',
            expect.stringContaining('attempts exhausted'),
        );
        expect(state.message.term).toHaveBeenCalledOnce();
        expect(state.message.nak).not.toHaveBeenCalled();
        expect(state.runQuery).not.toHaveBeenCalled();
    });

    it('fails the last delivery after database recovery before terminating', async () => {
        vi.useFakeTimers();
        const state = setup();
        Object.assign(state.message.info, { deliveryCount: 5 });
        state.runQuery.mockImplementationOnce(async () => {
            state.healthy.mockResolvedValue(false);
            throw new Error('connection closed');
        });
        await state.worker.run();
        await flush();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(state.message.working).toHaveBeenCalled();
        expect(state.failUnfinishedQueryDelivery).not.toHaveBeenCalled();
        expect(state.message.nak).not.toHaveBeenCalled();
        state.healthy.mockResolvedValue(true);
        await vi.advanceTimersByTimeAsync(1000);
        await flush();
        expect(
            state.failUnfinishedQueryDelivery,
        ).toHaveBeenCalledExactlyOnceWith(
            'query',
            expect.stringContaining('attempts exhausted'),
        );
        expect(state.message.term).toHaveBeenCalledOnce();
        expect(state.message.nak).not.toHaveBeenCalled();
        expect(state.releaseQueryExecution).not.toHaveBeenCalled();
        await state.worker.stop();
    });

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
