import { pauseBetweenBatchesMs } from './retentionCleanup';

const options = {
    batchSize: 1000,
    delayMs: 100,
    maxBatches: 300,
};

test('a fast batch is followed by the configured delay', () => {
    expect(pauseBetweenBatchesMs(options, 20)).toBe(100);
});

test('a slow batch is followed by a pause at least as long as it took', () => {
    expect(pauseBetweenBatchesMs(options, 850)).toBe(850);
});
