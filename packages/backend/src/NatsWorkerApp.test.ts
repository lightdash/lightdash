import { createTerminus } from '@godaddy/terminus';
import http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type NatsClient } from './clients/NatsClient';
import { type NatsWorker } from './nats/NatsWorker';
import NatsWorkerApp from './NatsWorkerApp';

vi.mock('@godaddy/terminus', () => ({ createTerminus: vi.fn() }));

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('NatsWorkerApp signal handling', () => {
    it('stops the worker in the first SIGTERM hook before other cleanup', async () => {
        vi.useFakeTimers();
        const server = { listen: vi.fn() };
        vi.spyOn(http, 'createServer').mockReturnValue(
            server as unknown as http.Server,
        );
        const app = Object.assign(Object.create(NatsWorkerApp.prototype), {
            lightdashConfig: {
                prometheus: { extendedMetricsEnabled: false },
                httpServer: { keepAliveTimeoutMs: 5000 },
            },
            port: 0,
        }) as {
            initServer: (
                worker: NatsWorker,
                client: NatsClient,
            ) => Promise<void>;
        };
        const stop = vi.fn(async () => undefined);
        const drain = vi.fn(async () => undefined);
        await app.initServer(
            { stop } as unknown as NatsWorker,
            { drain } as unknown as NatsClient,
        );
        const options = vi.mocked(createTerminus).mock.calls.at(-1)?.[1];
        expect(options?.signals).toContain('SIGTERM');
        await options?.beforeShutdown?.();
        expect(stop).toHaveBeenCalledOnce();
        expect(drain).toHaveBeenCalledOnce();
        expect(stop.mock.invocationCallOrder[0]).toBeLessThan(
            drain.mock.invocationCallOrder[0],
        );
        await options?.onShutdown?.();
    });
});
