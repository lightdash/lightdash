import { runWithConcurrency } from './runWithConcurrency';

const delay = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

describe('runWithConcurrency', () => {
    it('returns results in input order when tasks finish out of order', async () => {
        const items = [50, 10, 40, 0, 30];
        const results = await runWithConcurrency(items, 2, async (item) => {
            await delay(item);
            return item;
        });
        expect(results).toEqual(items);
    });

    it('never exceeds the concurrency limit', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        await runWithConcurrency(
            Array.from({ length: 14 }, (_, index) => index),
            3,
            async () => {
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await delay(5);
                inFlight -= 1;
            },
        );
        expect(maxInFlight).toEqual(3);
    });

    it('matches unbounded scheduling when the limit is at least the item count', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        await runWithConcurrency(
            Array.from({ length: 6 }, (_, index) => index),
            6,
            async () => {
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await delay(5);
                inFlight -= 1;
            },
        );
        expect(maxInFlight).toEqual(6);
    });

    it('starts no further task after the first rejection and propagates it', async () => {
        const started: number[] = [];
        const failure = new Error('source two failed');
        // Item 1 fails while item 0 still holds the other slot, so every later item is
        // admitted only after the failure is already recorded.
        await expect(
            runWithConcurrency(
                Array.from({ length: 10 }, (_, index) => index),
                2,
                async (item) => {
                    started.push(item);
                    if (item === 1) throw failure;
                    await delay(50);
                    return item;
                },
            ),
        ).rejects.toThrow('source two failed');

        expect(started).toEqual([0, 1]);
    });

    it('reports the first error when several tasks fail', async () => {
        const first = new Error('first');
        await expect(
            runWithConcurrency([1, 2, 3, 4], 1, async (item) => {
                if (item === 1) throw first;
                throw new Error(`later ${item}`);
            }),
        ).rejects.toThrow('first');
    });

    it('treats a non-positive limit as one', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        await runWithConcurrency([1, 2, 3], 0, async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await delay(1);
            inFlight -= 1;
        });
        expect(maxInFlight).toEqual(1);
    });
});
