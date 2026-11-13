import { AckPolicy, connect, nanos } from 'nats';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { QUERY_MAX_DELIVERIES, STREAM_CONFIGS } from '../nats/natsConfig';
import { NatsClient } from './NatsClient';

vi.mock('nats', async (importOriginal) => ({
    ...(await importOriginal<typeof import('nats')>()),
    connect: vi.fn(),
}));

describe('NatsClient consumer rollout', () => {
    it('updates the existing durable in place without deleting stored messages', async () => {
        const jsm = {
            streams: {
                info: vi.fn(async () => ({})),
                update: vi.fn(),
                delete: vi.fn(),
            },
            consumers: {
                info: vi.fn(async () => ({ config: { max_deliver: 1 } })),
                update: vi.fn(),
                add: vi.fn(),
                delete: vi.fn(),
            },
        };
        vi.mocked(connect).mockResolvedValue({
            jetstreamManager: async () => jsm,
            async *status() {
                yield* [];
            },
        } as unknown as Awaited<ReturnType<typeof connect>>);
        const client = new NatsClient({
            lightdashConfig: {
                ...lightdashConfigMock,
                natsWorker: {
                    ...lightdashConfigMock.natsWorker,
                    url: 'nats://localhost:14222',
                },
            },
        });
        await client.ensureStreamsAndConsumers([STREAM_CONFIGS.warehouse]);
        expect(jsm.consumers.update).toHaveBeenCalledWith(
            STREAM_CONFIGS.warehouse.streamName,
            STREAM_CONFIGS.warehouse.durableName,
            expect.objectContaining({
                max_deliver: QUERY_MAX_DELIVERIES,
                ack_wait: nanos(30_000),
                ack_policy: AckPolicy.Explicit,
            }),
        );
        expect(jsm.consumers.add).not.toHaveBeenCalled();
        expect(jsm.consumers.delete).not.toHaveBeenCalled();
        expect(jsm.streams.delete).not.toHaveBeenCalled();
    });
});

describe('NatsClient shutdown', () => {
    it('closes a connection whose drain exceeds two seconds', async () => {
        vi.useFakeTimers();
        try {
            const close = vi.fn(async () => undefined);
            const drain = vi.fn(() => new Promise<void>(() => {}));
            vi.mocked(connect).mockResolvedValue({
                close,
                drain,
                async *status() {
                    yield* [];
                },
            } as unknown as Awaited<ReturnType<typeof connect>>);
            const client = new NatsClient({
                lightdashConfig: {
                    ...lightdashConfigMock,
                    natsWorker: {
                        ...lightdashConfigMock.natsWorker,
                        url: 'nats://localhost:14222',
                    },
                },
            });
            await client.connect();
            const stopping = client.drain();
            await vi.advanceTimersByTimeAsync(2000);
            await stopping;
            expect(close).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });
});
