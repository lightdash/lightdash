export async function processPromisesInBatches<T, R>(
    items: Array<T>,
    batchSize: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    let results: R[] = [];
    /* eslint-disable no-await-in-loop */
    for (let start = 0; start < items.length; start += batchSize) {
        const end = Math.min(start + batchSize, items.length);
        const slicedResults = await Promise.all(
            items.slice(start, end).map(fn),
        );
        results = [...results, ...slicedResults];
    }
    /* eslint-enable no-await-in-loop */
    return results;
}

export const DEFAULT_BATCH_SIZE = 100;
