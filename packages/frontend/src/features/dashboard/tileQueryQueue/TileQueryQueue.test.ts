import { describe, expect, it } from 'vitest';
import { TileQueryQueue } from './TileQueryQueue';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const track = (
    queue: TileQueryQueue,
    signal = new AbortController().signal,
) => {
    const started: string[] = [];
    const acquire = (tileUuid: string) =>
        queue.acquire(tileUuid, signal).then(() => {
            started.push(tileUuid);
        });
    return { started, acquire };
};

describe('TileQueryQueue', () => {
    it('starts at most the cap and the next tile when one is released', async () => {
        const queue = new TileQueryQueue(2);
        const { started, acquire } = track(queue);

        void acquire('a');
        void acquire('b');
        void acquire('c');
        await flush();
        expect(started).toEqual(['a', 'b']);

        queue.release('a');
        await flush();
        expect(started).toEqual(['a', 'b', 'c']);
    });

    it('starts visible tiles before tiles that waited longer', async () => {
        const queue = new TileQueryQueue(1);
        const { started, acquire } = track(queue);

        void acquire('a');
        void acquire('offscreen');
        void acquire('onscreen');
        queue.setVisible('onscreen', true);
        queue.release('a');
        await flush();

        expect(started).toEqual(['a', 'onscreen']);
    });

    it('lets a tile that holds a slot run again without waiting', async () => {
        const queue = new TileQueryQueue(1);
        const { started, acquire } = track(queue);

        void acquire('a');
        void acquire('a');
        await flush();

        expect(started).toEqual(['a', 'a']);
    });

    it('drops an aborted waiter without using a slot', async () => {
        const queue = new TileQueryQueue(1);
        const controller = new AbortController();
        const { started, acquire } = track(queue);

        void acquire('a');
        const outcome = queue.acquire('b', controller.signal).then(
            () => 'started',
            () => 'aborted',
        );
        void acquire('c');
        controller.abort();
        queue.release('a');
        await flush();

        expect(await outcome).toBe('aborted');
        expect(started).toEqual(['a', 'c']);
    });

    it('ignores releasing a tile that holds no slot', async () => {
        const queue = new TileQueryQueue(1);
        const { started, acquire } = track(queue);

        void acquire('a');
        void acquire('b');
        queue.release('b');
        await flush();

        expect(started).toEqual(['a']);
    });
});
