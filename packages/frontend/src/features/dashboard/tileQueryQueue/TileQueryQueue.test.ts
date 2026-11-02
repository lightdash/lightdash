import { describe, expect, it } from 'vitest';
import { TileQueryQueue } from './TileQueryQueue';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const track = (queue: TileQueryQueue) => {
    const started: string[] = [];
    const releases: Array<() => void> = [];
    const acquire = (tileUuid: string, signal?: AbortSignal) =>
        queue.acquire(tileUuid, signal).then((release) => {
            started.push(tileUuid);
            releases.push(release);
        });
    return { started, releases, acquire };
};

describe('TileQueryQueue', () => {
    it('starts at most the cap and the next tile when one is released', async () => {
        const queue = new TileQueryQueue(2);
        const { started, releases, acquire } = track(queue);

        void acquire('a');
        void acquire('b');
        void acquire('c');
        await flush();
        expect(started).toEqual(['a', 'b']);

        releases[0]();
        await flush();
        expect(started).toEqual(['a', 'b', 'c']);
    });

    it('makes a tile’s new query wait while its previous one still runs', async () => {
        const queue = new TileQueryQueue(1);
        const { started, releases, acquire } = track(queue);

        void acquire('a');
        void acquire('a');
        await flush();
        expect(started).toEqual(['a']);

        releases[0]();
        await flush();
        expect(started).toEqual(['a', 'a']);
    });

    it('starts visible tiles before tiles that waited longer', async () => {
        const queue = new TileQueryQueue(1);
        const { started, releases, acquire } = track(queue);

        void acquire('a');
        void acquire('offscreen');
        void acquire('onscreen');
        queue.setVisible('onscreen', true);
        await flush();
        releases[0]();
        await flush();

        expect(started).toEqual(['a', 'onscreen']);
    });

    it('drops an aborted waiter without using a slot', async () => {
        const queue = new TileQueryQueue(1);
        const controller = new AbortController();
        const { started, releases, acquire } = track(queue);

        void acquire('a');
        const outcome = queue.acquire('b', controller.signal).then(
            () => 'started',
            () => 'aborted',
        );
        void acquire('c');
        controller.abort();
        await flush();
        releases[0]();
        await flush();

        expect(await outcome).toBe('aborted');
        expect(started).toEqual(['a', 'c']);
    });

    it('frees a slot only once however often it is released', async () => {
        const queue = new TileQueryQueue(1);
        const { started, releases, acquire } = track(queue);

        void acquire('a');
        void acquire('b');
        void acquire('c');
        await flush();
        releases[0]();
        releases[0]();
        await flush();

        expect(started).toEqual(['a', 'b']);
    });
});
