import { mapWithConcurrency } from './mapWithConcurrency';

describe('mapWithConcurrency', () => {
    it('preserves order and never exceeds the concurrency limit', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const results = await mapWithConcurrency(
            [5, 1, 4, 2, 3, 0],
            2,
            async (item) => {
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise((resolve) => {
                    setTimeout(resolve, item);
                });
                inFlight -= 1;
                return item * 10;
            },
        );
        expect(results).toEqual([50, 10, 40, 20, 30, 0]);
        expect(maxInFlight).toBe(2);
    });

    it('rejects when an item fails', async () => {
        await expect(
            mapWithConcurrency([0, 1], 1, async (item) => {
                if (item === 1) throw new Error('boom');
                return item;
            }),
        ).rejects.toThrow('boom');
    });
});
